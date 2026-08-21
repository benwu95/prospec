import * as fs from 'node:fs';
import * as path from 'node:path';
import { normalizeIssueRef, readChangeMetadata } from '../lib/change-metadata.js';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { isStale } from '../lib/drift-checker.js';
import { isDraftableFinding } from '../lib/draftable-findings.js';
import { collectGitTimestamps, computeChangeDigest } from '../lib/drift-sources.js';
import { readFileIfExists } from '../lib/fs-utils.js';
import { loadModuleMap } from '../lib/knowledge-reader.js';
import { routeChange, resolveNextSkillPath } from '../lib/status-router.js';
import { parseTaskLine } from '../lib/task-markers.js';
import type { VerifyGrade } from '../types/change.js';
import type {
  ChangeRoute,
  ChangeRouteError,
  ChangeRouteFacts,
  DriftSignal,
  StatusReport,
  UiScope,
} from '../types/status.js';
import { parseDeltaSpec } from '../lib/delta-spec-parser.js';

import type { DriftReport } from '../types/drift-report.js';
import { DRIFT_REPORT_FILENAME, DriftReportSchema } from '../types/drift-report.js';

/**
 * `prospec status` — deterministic SDD routing over `.prospec/changes/`.
 *
 * Read-only: scans every change directory, gathers the facts the pure router
 * (`lib/status-router.ts`) consumes, and reports each in-flight change's
 * current node, next station, blocking gates and reasons. Archived changes
 * are excluded (not in flight).
 *
 * Scanner tolerance (drift-sources precedent): a malformed record is reported
 * as a named error entry and never aborts the scan — but unlike the lenient
 * drift collectors, the metadata read itself goes through the canonical
 * schema-enforced `readChangeMetadata`, converting its throw per change.
 */

export interface StatusOptions {
  cwd?: string;
}

export async function execute(options: StatusOptions = {}): Promise<StatusReport> {
  const cwd = options.cwd ?? process.cwd();
  const changesDir = path.resolve(cwd, '.prospec/changes');

  const changes: ChangeRoute[] = [];
  const errors: ChangeRouteError[] = [];

  // The next station's skill path is resolved from the project's configured
  // agents (Station Transition Protocol). Read once here — the router stays
  // I/O-free and collectFacts keeps its own config read for other facts.
  const agentNames = (await readConfig(cwd).catch(() => null))?.agents ?? [];

  if (fs.existsSync(changesDir)) {
    const dirs = fs
      .readdirSync(changesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    for (const name of dirs) {
      const changeDir = path.join(changesDir, name);
      const metadataPath = path.join(changeDir, 'metadata.yaml');
      if (!fs.existsSync(metadataPath)) {
        errors.push({ name, error: 'metadata.yaml missing' });
        continue;
      }
      try {
        const { metadata } = readChangeMetadata(metadataPath, name);
        if (metadata.status === 'archived') continue;
        const route = routeChange(await collectFacts(changeDir, name, metadata, cwd));
        const skillPath = resolveNextSkillPath(agentNames, route.next);
        if (skillPath) route.nextSkillPath = skillPath;
        changes.push(route);
      } catch (err) {
        errors.push({ name, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  const isClean = changes.length === 0 && errors.length === 0;
  // Only nudge when the desk is clear. Under this guard nothing is in progress,
  // so nothing can be addressing a finding — which is why there is no
  // "already addressed" suppression here: it would have nothing to suppress.
  const drift = isClean ? readDriftSignal(cwd) : undefined;

  return {
    clean: isClean,
    changes,
    errors,
    ...(drift !== undefined ? { drift } : {}),
  };
}

/**
 * What `prospec-report.json` says about drift right now — or that it cannot say.
 *
 * Report state, not finding attribution: `check` computes findings freshly and
 * correctly, so status re-deriving them from a gitignored file that may predate
 * the working tree only invents a second, staler answer. A report that is
 * absent, unreadable, off-schema, or generated against different code is
 * reported AS THAT — staleness is the message, never a silent pass.
 */
function readDriftSignal(cwd: string): DriftSignal | undefined {
  const reportPath = path.join(cwd, DRIFT_REPORT_FILENAME);
  const unusable = (reason: 'unreadable' | 'stale' | 'unprovable'): DriftSignal => ({
    state: 'unusable',
    reason,
    recommendation: 'prospec check --json',
  });

  if (!fs.existsSync(reportPath)) return undefined;

  let parsed: DriftReport;
  try {
    parsed = DriftReportSchema.parse(JSON.parse(fs.readFileSync(reportPath, 'utf-8')));
  } catch {
    return unusable('unreadable');
  }

  // Same freshness rule `verify record` applies: a digest that cannot be
  // computed (no git worktree) proves nothing, so it does not condemn.
  const currentDigest = computeChangeDigest(cwd);
  if (currentDigest !== null && parsed.change_digest !== currentDigest) {
    // A report from an older engine carries no digest at all. That is freshness
    // UNPROVEN, not freshness disproven — saying "generated against different
    // code" would assert something nobody measured.
    return unusable(
      parsed.change_digest === null || parsed.change_digest === undefined ? 'unprovable' : 'stale',
    );
  }

  // The SAME predicate `--auto-draft` applies. Counting raw findings here would
  // name a number the recommended command then refuses to act on.
  const count = parsed.structural.findings.filter(isDraftableFinding).length;
  if (count === 0) return undefined;
  return { state: 'findings', count, recommendation: 'prospec check --auto-draft' };
}

/** Gather the on-disk facts one change's routing depends on. */
async function collectFacts(
  changeDir: string,
  name: string,
  metadata: ReturnType<typeof readChangeMetadata>['metadata'],
  cwd: string,
): Promise<ChangeRouteFacts> {
  const issue = normalizeIssueRef(metadata.issue);
  const tasksText = await readFileIfExists(path.join(changeDir, 'tasks.md'));
  const codeTasks = tasksText
    .split('\n')
    .map(parseTaskLine)
    .filter((t): t is NonNullable<typeof t> => t !== null && t.kind === 'code');

  return {
    name,
    status: metadata.status,
    scale: metadata.scale ?? 'standard',
    hasTasks: fs.existsSync(path.join(changeDir, 'tasks.md')),
    hasDesignSpec: fs.existsSync(path.join(changeDir, 'design-spec.md')),
    uiScope: parseUiScope(await readFileIfExists(path.join(changeDir, 'proposal.md'))),
    codeTasksTotal: codeTasks.length,
    codeTasksDone: codeTasks.filter((t) => t.checked).length,
    hasReviewProvenance: metadata.review_provenance !== undefined,
    lastVerifyGrade: lastVerifyGrade(metadata.quality_log),
    hasKnowledgeSync:
      metadata.status === 'verified'
        ? await checkKnowledgeSync(changeDir, metadata, cwd)
        : true,
    ...(issue === undefined ? {} : { issue }),
  };
}

/**
 * Check whether affected-module Knowledge is confirmed synced for this change.
 * Reads metadata.related_modules (falling back to delta-spec.md if present) and
 * confirms that every affected module exists in module-map.yaml with a valid
 * README, last_verified timestamp, and not stale vs source commits.
 */
async function checkKnowledgeSync(
  changeDir: string,
  metadata: ReturnType<typeof readChangeMetadata>['metadata'],
  cwd: string,
): Promise<boolean> {
  let affectedModules = metadata.related_modules ?? [];
  if (affectedModules.length === 0) {
    const deltaSpecText = await readFileIfExists(path.join(changeDir, 'delta-spec.md'));
    if (deltaSpecText) {
      const delta = parseDeltaSpec(deltaSpecText);
      affectedModules = [
        ...new Set([...delta.added, ...delta.modified, ...delta.removed].map((e) => e.module)),
      ];
    }
  }

  if (affectedModules.length === 0) return true;

  const config = await readConfig(cwd).catch(() => null);
  const knowledgePath = config
    ? resolveBasePaths(config, cwd).knowledgePath
    : path.resolve(cwd, 'prospec/ai-knowledge');

  let moduleMap: ReturnType<typeof loadModuleMap> = null;
  try {
    moduleMap = loadModuleMap(knowledgePath, cwd);
  } catch {
    return false;
  }
  if (moduleMap === null) return true;

  const generatedArtifacts = config?.knowledge?.generated_artifacts ?? [];
  const timestamps = collectGitTimestamps(cwd, moduleMap, knowledgePath, generatedArtifacts);

  for (const modName of affectedModules) {
    const norm = modName.toLowerCase();
    const entry = moduleMap.modules.find((m) => m.name.toLowerCase() === norm);
    if (!entry) return false;
    if (!entry.last_verified || isNaN(Date.parse(entry.last_verified))) return false;

    const readmePath = path.join(knowledgePath, 'modules', entry.name, 'README.md');
    if (!fs.existsSync(readmePath)) return false;

    if (timestamps.available) {
      const modTs = timestamps.modules.find((m) => m.name.toLowerCase() === norm);
      if (!modTs || !modTs.readme_exists || !modTs.last_verified) return false;
      if (modTs.last_src_commit && isStale(modTs.last_src_commit, modTs.last_verified)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Extract the `**Scope:**` value under proposal.md's `## UI Scope` heading.
 * Absent section (or no recognizable value) → null: for deterministic routing
 * only an explicit full/partial engages the design station — the design
 * skill's "assume full and confirm" fallback is interactive, not a routing
 * fact.
 */
function parseUiScope(proposalText: string): UiScope | null {
  const heading = /^##\s+UI Scope\s*$/m.exec(proposalText);
  if (!heading) return null;
  const section = proposalText.slice(heading.index + heading[0].length);
  const nextHeading = /^##\s+/m.exec(section);
  const body = nextHeading ? section.slice(0, nextHeading.index) : section;
  // End-anchored: the proposal-format placeholder line `**Scope:** full |
  // partial | none` must not parse as a chosen `full`.
  const value = /^\*\*Scope:\*\*\s*(full|partial|none)\s*$/im.exec(body)?.[1];
  return value === undefined ? null : (value.toLowerCase() as UiScope);
}

/** Latest recorded `prospec-verify` grade, null when none. */
function lastVerifyGrade(
  qualityLog: Array<{ skill: string; grade?: VerifyGrade }> | undefined,
): VerifyGrade | null {
  if (qualityLog === undefined) return null;
  for (let i = qualityLog.length - 1; i >= 0; i--) {
    const entry = qualityLog[i];
    if (entry !== undefined && entry.skill === 'prospec-verify' && entry.grade !== undefined) {
      return entry.grade;
    }
  }
  return null;
}
