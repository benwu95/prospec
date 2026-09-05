import * as fs from 'node:fs';
import * as path from 'node:path';
import { normalizeIssueRef, readChangeMetadata } from '../lib/change-metadata.js';
import { readConfig } from '../lib/config.js';
import type { ProspecConfig } from '../types/config.js';
import { isDraftableFinding } from '../lib/draftable-findings.js';
import { assessCurrentDrift } from '../lib/drift-assessment.js';
import { EVIDENCE_SCOPE, FINGERPRINT_VERSION, PLANNING_VERDICTS } from '../types/change.js';
import { planningVerdictToGateResult } from '../types/station.js';
import { z } from 'zod';

const PlanningVerdictSchema = z.enum(PLANNING_VERDICTS);
import { readFileIfExists } from '../lib/fs-utils.js';
import { checkKnowledgeSync } from '../lib/knowledge-sync.js';
import { routeChange, resolveNextSkillPath } from '../lib/status-router.js';
import { parseTaskLine } from '../lib/task-markers.js';
import type { GateResult, VerifyGrade } from '../types/change.js';
import {
  BREAK_GLASS_PREFIX,
  type ChangeRoute,
  type ChangeRouteError,
  type ChangeRouteFacts,
  type DriftSignal,
  type StatusReport,
  type UiScope,
  type UnresolvedWarning,
} from '../types/status.js';

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
  // agents (Station Transition Protocol). Read config ONCE here and thread it into
  // collectFacts — knowledge-sync would otherwise re-read it per verified change.
  // The router stays I/O-free.
  const config = await readConfig(cwd).catch(() => null);
  const agentNames = config?.agents ?? [];

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
        const route = routeChange(await collectFacts(changeDir, name, metadata, cwd, config));
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
  const drift = isClean ? await readDriftSignal(cwd) : undefined;

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
 * Saved reports are display artifacts: compare their versioned content identity
 * and deterministic verdict payload with a current read-only assessment. Trace
 * timestamps do not define freshness; changed workflow facts do.
 */
async function readDriftSignal(cwd: string): Promise<DriftSignal | undefined> {
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

  if (!parsed.change_digest || parsed.snapshot?.fingerprint_version !== FINGERPRINT_VERSION || parsed.snapshot.scope !== EVIDENCE_SCOPE) {
    return unusable('unprovable');
  }
  try {
    const current = await assessCurrentDrift(cwd);
    if (current.snapshot.digest === null || !current.recheck()) return unusable('unprovable');
    const payload = (report: DriftReport) => JSON.stringify({
      structural: {
        ...report.structural,
        // Health finding prose is derived from the structured module facts and
        // embeds Git trace timestamps. Compare those facts, not their narration.
        findings: report.structural.findings.map((finding) =>
          finding.check === 'knowledge-health' && report.structural.knowledge_health
            ? { ...finding, detail: undefined } : finding),
      },
      semantic: report.semantic,
      summary: report.summary,
    },
      (key, value: unknown) => ['last_src_commit', 'last_readme_commit', 'last_sub_module_commit'].includes(key) ? undefined : value);
    if (current.snapshot.digest !== parsed.change_digest || payload(current.report) !== payload(parsed)) return unusable('stale');
  } catch { return unusable('unprovable'); }

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
  config: ProspecConfig | null,
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
    lastPlanVerifierResult: latestGateResult(metadata.quality_log, 'prospec-plan'),
    lastTasksVerifierResult: latestGateResult(metadata.quality_log, 'prospec-tasks'),
    unresolvedWarnings: unresolvedWarnings(metadata.quality_log),
    hasKnowledgeSync:
      metadata.status === 'verified'
        ? await checkKnowledgeSync(changeDir, metadata, cwd, config)
        : true,
    ...(issue === undefined ? {} : { issue }),
  };
}

/**
 * Unresolved WARNs: the latest `quality_log` entry per skill whose `result` is
 * `WARN`, expanded to one item per warning string. A later same-skill entry
 * (any result) supersedes the earlier one, so a WARN cleared by a subsequent
 * PASS no longer surfaces. Mirrors `lastVerifyGrade`'s last-entry-per-skill read.
 */
function unresolvedWarnings(
  qualityLog:
    | Array<{ skill: string; date: string; result: string; warnings?: string[] }>
    | undefined,
): UnresolvedWarning[] {
  if (qualityLog === undefined) return [];
  const latest = new Map<string, { date: string; result: string; warnings?: string[] }>();
  for (const entry of qualityLog) {
    latest.set(entry.skill, entry);
  }
  const out: UnresolvedWarning[] = [];
  for (const [skill, entry] of latest) {
    if (entry.result !== 'WARN') continue;
    for (const warning of entry.warnings ?? []) {
      out.push({ skill, warning, date: entry.date });
    }
  }
  return out;
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

/**
 * A station's latest recorded verifier result. Scanned from the latest entry
 * backwards, and keyed on PROVENANCE, not on `result`: only an entry the sink
 * (`change log --verifier-report`) stamped with `verifier_verdict` is the
 * verifier's word (`FLAWS` → FAIL, else PASS/WARN — a verifier WARN supersedes an
 * earlier FLAWS exactly as the rubric promises), plus a Break-Glass `WARN` whose
 * warning opens with `BREAK_GLASS_PREFIX`. Every other entry under the skill —
 * the station's own Exit Gate or Knowledge Gate note, PASS/WARN/FAIL alike — is
 * neither a verifier result nor able to hide one, so it is skipped.
 */
function latestGateResult(
  qualityLog:
    | Array<{ skill: string; result: string; warnings?: string[]; verifier_verdict?: string }>
    | undefined,
  skill: string,
): GateResult | null {
  if (qualityLog === undefined) return null;
  for (let i = qualityLog.length - 1; i >= 0; i--) {
    const entry = qualityLog[i];
    if (entry === undefined || entry.skill !== skill) continue;
    if (entry.verifier_verdict !== undefined) {
      const parsed = PlanningVerdictSchema.safeParse(entry.verifier_verdict);
      // An unknown stamp is not a verdict — skip it rather than default to PASS.
      if (!parsed.success) continue;
      return planningVerdictToGateResult(parsed.data);
    }
    if (
      entry.result === 'WARN' &&
      (entry.warnings ?? []).some((w) => w.trimStart().startsWith(BREAK_GLASS_PREFIX))
    ) {
      return 'WARN';
    }
  }
  return null;
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
