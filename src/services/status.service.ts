import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  hasPlanSignoffAfterVerifier,
  isPlanSignoffEntry,
  isReviewRoundCountsEntry,
  latestVerifierResult,
  normalizeIssueRef,
  readChangeMetadata,
  verifierGateResultOf,
} from '../lib/change-metadata.js';
import {
  readConfig,
  readPauseAtFallback,
  resolveBasePaths,
  resolveMaxStationRetries,
  resolvePauseAt,
} from '../lib/config.js';
import { PAUSE_AT_ENV_VAR, type ProspecConfig } from '../types/config.js';
import { isDraftableFinding } from '../lib/draftable-findings.js';
import { assessCurrentDrift } from '../lib/drift-assessment.js';
import { EVIDENCE_SCOPE, FINGERPRINT_VERSION } from '../types/change.js';
import { readFileIfExists } from '../lib/fs-utils.js';
import { checkKnowledgeSync } from '../lib/knowledge-sync.js';
import {
  routeChange,
  resolveNextSkill,
  resolveNextSkillPath,
  resolveSkillRoot,
} from '../lib/status-router.js';
import { projectStatusReferenceMap } from '../lib/skill-reference-map.js';
import { parseTaskLine } from '../lib/task-markers.js';
import type { VerifyGrade } from '../types/change.js';
import {
  type ChangeRoute,
  type ChangeRouteError,
  type ChangeRouteFacts,
  type DriftSignal,
  STATION_SKILLS,
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
  /** Environment the pause override is read from (default `process.env`). */
  env?: Readonly<Record<string, string | undefined>>;
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
  // Resolved once, outside the per-change try/catch: an invalid pause setting must
  // fail the whole command (clean state included) rather than route anything.
  const env = options.env ?? process.env;
  const fallback = config === null ? await readPauseAtFallback(cwd) : null;
  const pauseAtPlan = resolvePauseAt(config ?? fallback?.setting, env).includes('plan');
  // Only disclosed when the assumption is what paused: an env override decides alone.
  const pauseAssumedBecause =
    pauseAtPlan && env[PAUSE_AT_ENV_VAR] === undefined ? (fallback?.assumedBecause ?? null) : null;
  const agentNames = config?.agents ?? [];
  // Resolves the project-file load points a station declares (the implement
  // station's conventions); null leaves them out rather than printing a token.
  const knowledgeBasePath = config
    ? path.relative(cwd, resolveBasePaths(config, cwd).knowledgePath).replace(/\\/g, '/')
    : null;

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
        const facts = await collectFacts(changeDir, name, metadata, cwd, config, pauseAtPlan);
        const route = routeChange(facts);
        if (
          pauseAssumedBecause !== null &&
          (route.code === 'AWAITING_HUMAN_PLAN_SIGNOFF' || route.code === 'PLAN_VERIFIER_PENDING')
        ) {
          route.reasons.push(
            `.prospec.yaml ${pauseAssumedBecause}, so the pause is assumed rather than read — fix the file (the pause then follows workflow.pause_at)`,
          );
        }
        // Identity first, and independent of the agent configuration: it is what a
        // host's own skill mechanism loads, so an unreadable or empty config costs
        // the fallback path below, never the station the agent is being sent to.
        // Enrichment runs only when the route resolves a next station (next !== null).
        // A null next — terminal archived or a HUMAN_HALT_CODES halt — fabricates
        // no nextSkill, skill path, or reference map (REQ-SERVICES-092).
        if (route.next !== null) {
          const skill = resolveNextSkill(route.next);
          if (skill) route.nextSkill = skill;
          const skillPath = resolveNextSkillPath(agentNames, route.next);
          if (skillPath) route.nextSkillPath = skillPath;
          // Additive and derived from the SAME resolution the skill path used, so a
          // row can never name a different host than the action line above it. Absent
          // — never fabricated — when the route is terminal or no agent is configured.
          const skillRoot = resolveSkillRoot(agentNames);
          if (skillRoot !== null) {
            route.nextReferenceMap = projectStatusReferenceMap(STATION_SKILLS[route.next], {
              scale: facts.scale,
              uiScope: facts.uiScope,
              skillPath: skillRoot,
              ...(knowledgeBasePath === null ? {} : { knowledgeBasePath }),
            });
          }
        }
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
  pauseAtPlan: boolean,
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
    verifyBelowBarStreak: verifyBelowBarStreak(metadata.quality_log),
    lastPlanVerifierResult: latestVerifierResult(metadata.quality_log, 'prospec-plan'),
    planFlawsStreak: planningFlawsStreak(metadata.quality_log, 'prospec-plan'),
    lastTasksVerifierResult: latestVerifierResult(metadata.quality_log, 'prospec-tasks'),
    tasksFlawsStreak: planningFlawsStreak(metadata.quality_log, 'prospec-tasks'),
    maxStationRetries: resolveMaxStationRetries(config),
    pauseAtPlan,
    planSignedOff: hasPlanSignoffAfterVerifier(metadata.quality_log),
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
    | Array<{ skill: string; date: string; result: string; warnings?: string[]; round?: number; signoff_option?: string }>
    | undefined,
): UnresolvedWarning[] {
  if (qualityLog === undefined) return [];
  const latest = new Map<string, { date: string; result: string; warnings?: string[] }>();
  for (const entry of qualityLog) {
    // A merge-written round-counts entry is a metric, not a round record; it always
    // carries `warnings: []`, so letting it win last-per-skill would mask the round-less
    // close entry's WARN. Exclude it, mirroring the round-advance filter.
    if (isReviewRoundCountsEntry(entry)) continue;
    // A plan sign-off is provenance, not a gate result: it must not supersede the
    // plan verifier's WARN the human signed off over.
    if (isPlanSignoffEntry(entry)) continue;
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

/**
 * Consecutive below-bar grades (B, C, D) from the tail of quality_log.
 * An S or A resets the streak to 0. Non-verify entries or entries without
 * a grade are skipped.
 */
export function verifyBelowBarStreak(
  qualityLog: Array<{ skill: string; grade?: VerifyGrade }> | undefined,
): number {
  if (qualityLog === undefined) return 0;
  let streak = 0;
  for (let i = qualityLog.length - 1; i >= 0; i--) {
    const entry = qualityLog[i];
    if (entry === undefined || entry.skill !== 'prospec-verify' || entry.grade === undefined) {
      continue;
    }
    if (entry.grade === 'B' || entry.grade === 'C' || entry.grade === 'D') {
      streak++;
    } else if (entry.grade === 'S' || entry.grade === 'A') {
      break;
    }
  }
  return streak;
}

/**
 * Consecutive verifier FAIL results for a station from the tail of quality_log.
 *
 * Scanned from the latest entry backwards, using the identical provenance rule as
 * `latestVerifierResult` (`lib/change-metadata`): only an entry the sink stamped with `verifier_verdict` counts
 * (`FLAWS` → FAIL, `PASS` or `WARN` resets the streak), plus a Break-Glass `WARN`
 * whose warning opens with `BREAK_GLASS_PREFIX` (resets the streak). Every other
 * entry under the skill (the station's own unstamped Exit Gate PASS/WARN/FAIL) is
 * neither a verifier result nor able to hide one, so it is skipped.
 */
export function planningFlawsStreak(
  qualityLog:
    | Array<{ skill: string; result: string; warnings?: string[]; verifier_verdict?: string }>
    | undefined,
  skill: string,
): number {
  if (qualityLog === undefined) return 0;
  let streak = 0;
  for (let i = qualityLog.length - 1; i >= 0; i--) {
    const entry = qualityLog[i];
    if (entry === undefined || entry.skill !== skill) continue;
    const result = verifierGateResultOf(entry);
    if (result === null) continue;
    // PASS, WARN or a Break-Glass WARN resets the streak
    if (result !== 'FAIL') break;
    streak++;
  }
  return streak;
}
