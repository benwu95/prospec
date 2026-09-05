import { existsSync } from 'node:fs';
import path from 'node:path';
import { readChangeMetadata, writeChangeMetadataDoc } from '../lib/change-metadata.js';
import { FINGERPRINT_VERSION, EVIDENCE_SCOPE, type TestAttempt, type DimensionGradedBy } from '../types/change.js';
import { randomUUID } from 'node:crypto';
import {
  readConfig,
  resolveTestCommand,
} from '../lib/config.js';
import { atomicWrite } from '../lib/fs-utils.js';
import { renderTemplate } from '../lib/template.js';
import { computeChangeDigest, computeChangeState, computeDeltaSpecDigest, collectQualityLedger, isGitWorkTree } from '../lib/drift-sources.js';
import { assessCurrentDrift } from '../lib/drift-assessment.js';
import { aggregateEscapedDefects } from '../lib/escaped-defects.js';
import { runTestCommand } from '../lib/test-runner.js';
import { resolveChange } from './change-resolver.js';
import { DRIFT_REPORT_FILENAME, type DriftReport } from '../types/drift-report.js';
import {
  ESCAPED_DEFECT_REPORT_FILENAME,
  type EscapedDefectReport,
} from '../types/escaped-defect.js';
import { PrerequisiteError } from '../types/errors.js';
import type { AutoDraftResult } from '../types/auto-draft.js';
import { execute as autoDraftExecute } from './auto-draft.service.js';

export interface CheckOptions {
  cwd?: string;
  /** Write the machine-readable report to prospec-report.json. */
  json?: boolean;
  /** Scaffold .github/workflows/prospec-check.yml instead of running checks. */
  initCi?: boolean;
  /** Record the active change's review baseline (digest) instead of running checks. */
  recordReview?: boolean;
  /** Run the project's test command and record its outcome instead of running checks. */
  recordTests?: boolean;
  /** Aggregate per-gate escaped-defect rate instead of running checks. */
  escapedDefects?: boolean;
  /** Disambiguate which change `--record-review`/`--record-tests` targets when several are in flight. */
  change?: string;
  /** With `--record-review`: the reviewer's self-declared grading context,
   *  recorded into `review_provenance.graded_by`. Absent leaves the field unwritten. */
  gradedBy?: DimensionGradedBy;
  /** Auto-draft fix proposals for detected drift findings. */
  autoDraft?: boolean;
  /** Preview the drafting only. Named for its scope: `check`'s other writes
   *  (`--json`, the record modes) are unaffected, so a bare `dryRun` here would
   *  read as a whole-command promise this flag does not keep. */
  autoDraftDryRun?: boolean;
}

export interface CheckResult {
  kind: 'report';
  report: DriftReport;
  /** True when any check failed — the CLI maps strict ∧ hasFail to exit 1. */
  hasFail: boolean;
  /** Absolute report path when --json was requested. */
  reportPath?: string;
  /** Result of auto-drafting fix changes if --auto-draft was requested. */
  autoDraftResult?: AutoDraftResult;
  /** Why drafting produced nothing, when it was requested and failed. The check
   *  verdicts and the report are unaffected — this is reported, never thrown. */
  autoDraftError?: string;
}

export interface InitCiResult {
  kind: 'init-ci';
  workflowPath: string;
  created: boolean;
}

export interface RecordReviewResult {
  kind: 'record-review';
  /** The change whose review baseline was recorded. */
  change: string;
  /** False when skipped honestly (e.g. not a git repo) — no fake digest written. */
  recorded: boolean;
  reason?: string;
  /** True when the review baseline was recorded but the change carries no
   *  delta-spec, so no delta-spec baseline could be. Disclosed rather than silent:
   *  the reader must be able to tell "recorded both" from "recorded one". */
  deltaSpecSkipped?: boolean;
}

export interface RecordTestsResult {
  kind: 'record-tests';
  /** The change whose test baseline was recorded. */
  change: string;
  /** False when skipped honestly (no test command, not a git repo, timeout). */
  recorded: boolean;
  reason?: string;
  /** The command that ran, when one did. */
  command?: string;
  /** Its exit code — recorded even when non-zero; a failing suite IS the fact. */
  exitCode?: number | null;
  /** True when the digest changed across the run — an artifact the suite wrote, or
   *  a real edit landing mid-run. Surfaced so the latter is never silently absorbed. */
  treeChangedDuringRun?: boolean;
}

export interface EscapedDefectsResult {
  kind: 'escaped-defects';
  report: EscapedDefectReport;
  /** Absolute report path when --json was requested. */
  reportPath?: string;
}

export const CI_WORKFLOW_PATH = '.github/workflows/prospec-check.yml';

/**
 * Execute the drift check — thin orchestration only (REQ-SERVICES-027):
 * collectors gather repo facts, the pure evaluators in lib/drift-checker
 * produce the report, and this service handles config resolution and the
 * optional report/workflow writes.
 */
export async function execute(
  options: CheckOptions,
): Promise<
  CheckResult | InitCiResult | RecordReviewResult | RecordTestsResult | EscapedDefectsResult
> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);

  // Named modes return before the drift run, so drafting could never happen in
  // them. Refusing beats silently ignoring the flag the caller typed.
  if (options.autoDraft || options.autoDraftDryRun) {
    const conflicting = (
      [
        ['--init-ci', options.initCi],
        ['--record-review', options.recordReview],
        ['--record-tests', options.recordTests],
        ['--escaped-defects', options.escapedDefects],
      ] as const
    ).find(([, on]) => on);
    if (conflicting) {
      throw new PrerequisiteError(
        `--auto-draft cannot be combined with ${conflicting[0]} — that mode returns before any drift check runs`,
      );
    }
  }
  if (options.autoDraftDryRun && !options.autoDraft) {
    throw new PrerequisiteError('--auto-draft-dry-run has no effect without --auto-draft');
  }

  if (options.initCi) {
    return initCiWorkflow(cwd, config.tech_stack?.package_manager);
  }

  if (options.recordReview) {
    return recordReviewProvenance(cwd, options.change, options.gradedBy);
  }

  if (options.recordTests) {
    return recordTestProvenance(cwd, options.change);
  }

  if (options.escapedDefects) {
    return aggregateEscapedDefectReport(cwd, options.json);
  }

  const { report } = await assessCurrentDrift(cwd);

  const result: CheckResult = {
    kind: 'report',
    report,
    hasFail: report.summary.fail_count > 0,
  };

  if (options.json) {
    const reportPath = path.resolve(cwd, DRIFT_REPORT_FILENAME);
    await atomicWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    result.reportPath = reportPath;
  }

  // Drafting runs LAST and cannot fail the check. It is a convenience built on
  // top of the verdicts, so a change directory that could not be written must
  // not discard the report or flip `--strict`'s exit code — the failure is
  // reported instead of thrown.
  if (options.autoDraft && report.structural.findings.length > 0) {
    try {
      result.autoDraftResult = await autoDraftExecute({
        cwd,
        findings: report.structural.findings,
        dryRun: options.autoDraftDryRun,
      });
    } catch (err) {
      result.autoDraftError = err instanceof Error ? err.message : String(err);
    }
  }

  return result;
}

/** Render the hardened CI workflow template — rerun-safe, never overwrites. */
async function initCiWorkflow(cwd: string, packageManager?: string): Promise<InitCiResult> {
  const workflowPath = path.resolve(cwd, CI_WORKFLOW_PATH);
  if (existsSync(workflowPath)) {
    return { kind: 'init-ci', workflowPath, created: false };
  }
  const usePnpm = packageManager === 'pnpm';
  const content = renderTemplate('init/prospec-check.yml.hbs', {
    use_pnpm: usePnpm,
    install_cmd: usePnpm ? 'pnpm install --frozen-lockfile' : 'npm ci',
    check_cmd: usePnpm
      ? 'pnpm exec prospec check --strict --json'
      : 'npx prospec check --strict --json',
  });
  await atomicWrite(workflowPath, content);
  return { kind: 'init-ci', workflowPath, created: true };
}

/**
 * Record the active change's review baseline (REQ-SERVICES-062). Run by
 * `prospec-review` at loop convergence so the digest is code-computed, not
 * hand-derived. Writes `review_provenance` into metadata.yaml with the
 * comment-preserving Document round-trip; a non-git repo yields no digest, so
 * it honestly skips rather than writing a fake baseline.
 */
async function recordReviewProvenance(
  cwd: string,
  explicitChange?: string,
  gradedBy?: DimensionGradedBy,
): Promise<RecordReviewResult> {
  // quiet=true keeps `check` non-interactive; with several in-flight changes it
  // errors with "use --change <name>", so --change is the disambiguation path.
  const change = await resolveChange(cwd, explicitChange, true, 'Which change to record the review for?');
  const metadataPath = path.join(cwd, '.prospec', 'changes', change, 'metadata.yaml');
  if (!existsSync(metadataPath)) {
    // resolveChange only guarantees the dir exists — honest skip, no fake baseline.
    return { kind: 'record-review', change, recorded: false, reason: 'metadata.yaml not found' };
  }
  const digest = computeChangeDigest(cwd);
  if (digest === null) {
    return { kind: 'record-review', change, recorded: false, reason: digestFailureReason(cwd) };
  }
  const { doc } = readChangeMetadata(metadataPath, change);
  const date = new Date().toISOString().slice(0, 10);
  doc.set(
    'review_provenance',
    doc.createNode({ digest, date, fingerprint_version: FINGERPRINT_VERSION, scope: EVIDENCE_SCOPE, ...(gradedBy !== undefined ? { graded_by: gradedBy } : {}) }),
  );
  // The delta-spec baseline is stamped in the SAME write (REQ-SERVICES-082). Two
  // separate writes could record two different moments, and the whole point of
  // this fingerprint is to prove the landing blocks are the ones review saw.
  // A change with no delta-spec gets no field rather than a placeholder — the
  // evaluator skips it, and a fabricated value would make that skip impossible.
  const deltaSpecDigest = computeDeltaSpecDigest(path.dirname(metadataPath));
  if (deltaSpecDigest !== null) {
    doc.set('delta_spec_provenance', doc.createNode({ digest: deltaSpecDigest, date }));
  }
  const deltaPresent = existsSync(path.join(path.dirname(metadataPath), 'delta-spec.md'));
  if ((deltaPresent && deltaSpecDigest === null) || computeChangeDigest(cwd) !== digest ||
      computeDeltaSpecDigest(path.dirname(metadataPath)) !== deltaSpecDigest) {
    return { kind: 'record-review', change, recorded: false, reason: 'review inputs changed or are unprovable — complete a valid review before recording' };
  }
  await writeChangeMetadataDoc(metadataPath, doc, change);
  return {
    kind: 'record-review',
    change,
    recorded: true,
    ...(deltaSpecDigest === null ? { deltaSpecSkipped: true } : {}),
  };
}

/** A null digest has two very different causes — misreporting a capture failure
 *  as "not a git repository" sends the developer to the wrong fix (issue #103). */
function digestFailureReason(cwd: string): string {
  return isGitWorkTree(cwd)
    ? 'could not compute the change digest (a git capture failed)'
    : 'not a git repository';
}

/**
 * Run the project's test command and record the outcome (REQ-SERVICES-068). The
 * ONE place `check` executes a project command, and it is flag-gated — the pure
 * check path stays read-only and deterministic, so the report a CI run produces is
 * still reproducible without ever spawning a suite.
 *
 * A non-zero exit code IS recorded: the fact verify must see is "the suite ran and
 * failed", and `evaluateTestProvenance` turns that into the FAIL. Only cases where
 * uncertified outcomes retain the latest attempt without creating passing provenance.
 */
async function recordTestProvenance(
  cwd: string,
  explicitChange?: string,
): Promise<RecordTestsResult> {
  const change = await resolveChange(cwd, explicitChange, true, 'Which change to record the test run for?');
  const metadataPath = path.join(cwd, '.prospec', 'changes', change, 'metadata.yaml');
  if (!existsSync(metadataPath)) {
    return { kind: 'record-tests', change, recorded: false, reason: 'metadata.yaml not found' };
  }
  const id = randomUUID();
  const date = new Date().toISOString().slice(0, 10);
  const { doc: initial } = readChangeMetadata(metadataPath, change);
  initial.set('test_attempt', initial.createNode({ id, date, outcome: 'running' } satisfies TestAttempt));
  await writeChangeMetadataDoc(metadataPath, initial, change);
  // Command resolution reads repository inputs too; include it inside the fence.
  const before = computeChangeState(cwd);

  const finish = async (attempt: TestAttempt, result: RecordTestsResult, provenance?: Record<string, unknown>): Promise<RecordTestsResult> => {
    try {
      const { doc, metadata } = readChangeMetadata(metadataPath, change);
      if (metadata.test_attempt?.id !== id) return { ...result, recorded: false, reason: 'test attempt superseded — completion cannot overwrite a newer attempt' };
      doc.set('test_attempt', doc.createNode(attempt));
      if (provenance) doc.set('test_provenance', doc.createNode(provenance));
      await writeChangeMetadataDoc(metadataPath, doc, change);
      return result;
    } catch (error) {
      return { ...result, recorded: false, reason: `metadata.yaml changed during the run and no longer validates or cannot be written — re-run (${error instanceof Error ? error.message : String(error)})` };
    }
  };
  const skipped = async (outcome: TestAttempt['outcome'], reason: string, command?: string) =>
    finish({ id, date, outcome, reason, ...(before.digest !== null ? { before_digest: before.digest } : {}), ...(command ? { command } : {}) }, { kind: 'record-tests', change, recorded: false, reason, ...(command ? { command } : {}) });
  let command: string | null;
  try { command = resolveTestCommand(await readConfig(cwd), cwd); }
  catch (error) { return skipped('unprovable', `test configuration is unreadable: ${String(error)}`); }
  if (command === null) return skipped('unavailable', 'no test command — set tech_stack.test_command in .prospec.yaml');
  if (before.digest === null) return skipped('unprovable', before.reason ?? digestFailureReason(cwd), command);
  const run = runTestCommand(cwd, command);
  const after = computeChangeState(cwd);
  const stable = after.digest !== null && before.digest === after.digest;
  const outcome: TestAttempt['outcome'] = run.timed_out ? 'timeout' : run.exit_code === null
    ? (run.error ? 'unavailable' : 'unprovable') : run.exit_code !== 0 ? 'failed' : stable ? 'passed' : 'unprovable';
  const reason = run.timed_out ? `test run timed out after ${run.timeout_ms} ms`
    : run.signal ? `test run killed by ${run.signal}` : run.error ?? (stable ? undefined : 'inputs changed during test run or capture is unprovable — re-run against stable inputs');
  const attempt: TestAttempt = { id, date, outcome, command: run.command, before_digest: before.digest,
    ...(after.digest !== null ? { after_digest: after.digest } : {}),
    ...(run.exit_code !== null ? { exit_code: run.exit_code } : {}),
    ...(run.signal ? { signal: run.signal } : {}), ...(reason ? { reason } : {}),
  };
  // Nonzero is durable even when after-capture fails; only certified success clears it.
  const recorded = outcome === 'passed' || outcome === 'failed';
  const provenance = recorded ? { command: run.command, exit_code: run.exit_code, digest: before.digest, date,
    fingerprint_version: FINGERPRINT_VERSION, scope: EVIDENCE_SCOPE, attempt_id: id } : undefined;
  return finish(attempt, { kind: 'record-tests', change, recorded, command: run.command,
    exitCode: run.exit_code, treeChangedDuringRun: !stable, ...(reason ? { reason } : {}) }, provenance);

}

/**
 * Aggregate per-gate escaped-defect rate from `introduced_by` (REQ-SERVICES-069).
 * A reporting mode, not a check: it grades no current repo state, produces no
 * findings, and never affects `--strict`'s exit code.
 */
async function aggregateEscapedDefectReport(
  cwd: string,
  json?: boolean,
): Promise<EscapedDefectsResult> {
  const report = aggregateEscapedDefects(collectQualityLedger(cwd), new Date().toISOString());
  const result: EscapedDefectsResult = { kind: 'escaped-defects', report };
  if (json) {
    const reportPath = path.resolve(cwd, ESCAPED_DEFECT_REPORT_FILENAME);
    await atomicWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    result.reportPath = reportPath;
  }
  return result;
}
