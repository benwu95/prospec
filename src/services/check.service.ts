import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { readChangeMetadata, writeChangeMetadataDoc } from '../lib/change-metadata.js';
import { FINGERPRINT_VERSION, EVIDENCE_SCOPE, TestPolicySchema, type TestAttempt, type DimensionGradedBy } from '../types/change.js';
import { randomUUID } from 'node:crypto';
import {
  readConfig,
  resolveTestCommand,
  resolveTestQueueLeaseMs,
  resolveTestQueueWaitMs,
  resolveTestTimeoutMs,
} from '../lib/config.js';
import { atomicWrite } from '../lib/fs-utils.js';
import { renderTemplate } from '../lib/template.js';
import { computeChangeDigest, computeTestState, computeDeltaSpecDigest, isGitWorkTree } from '../lib/drift-sources.js';
import { assessCurrentDrift } from '../lib/drift-assessment.js';
import { indexInputsHint } from '../lib/drift-checker.js';
import { withTestQueue, type TestQueueWaitInfo } from '../lib/test-queue.js';
import { runTestCommand, type TestRunResult } from '../lib/test-runner.js';
import { resolveChange } from './change-resolver.js';
import { DRIFT_REPORT_FILENAME, type DriftReport, type TestInputState } from '../types/drift-report.js';
import { MetadataWriteError, PrerequisiteError, TestTimeoutInvalid } from '../types/errors.js';
import type { AutoDraftResult } from '../types/auto-draft.js';
import type { TestQueueBusy } from '../types/test-queue.js';
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
  /** With `--record-tests`: called once when the run has to wait for the test queue. */
  onQueueWait?: (info: TestQueueWaitInfo) => void;
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
  /** Set when the repository test queue did not grant the turn within the wait cap:
   *  nothing ran and metadata.yaml was not written. */
  busy?: TestQueueBusy;
  /** The signal that interrupted the run; the CLI exits with 128 plus its number. */
  interruptedBy?: string;
  /** A non-fatal note beside the outcome, e.g. a queue turn that could not be released. */
  warning?: string;
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
): Promise<CheckResult | InitCiResult | RecordReviewResult | RecordTestsResult> {
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
    return recordTestProvenance(cwd, options.change, {
      waitMs: resolveTestQueueWaitMs(config),
      leaseMs: resolveTestQueueLeaseMs(config),
      ...(options.onQueueWait === undefined ? {} : { onWait: options.onQueueWait }),
    });
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
  const recheckedDigest = computeChangeDigest(cwd);
  if ((deltaPresent && deltaSpecDigest === null) || recheckedDigest !== digest ||
      computeDeltaSpecDigest(path.dirname(metadataPath)) !== deltaSpecDigest) {
    const hint = indexInputsHint(recheckedDigest !== null && recheckedDigest !== digest);
    return { kind: 'record-review', change, recorded: false, reason: `review inputs changed or are unprovable${hint} — complete a valid review before recording` };
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
interface QueueSettings {
  waitMs: number;
  leaseMs: number;
  onWait?: (info: TestQueueWaitInfo) => void;
}

/** Runs the suite for one attempt; the queued path routes it through the turn's session. */
type SuiteRunner = (command: string, timeoutMs: number) => Promise<TestRunResult>;

const QUEUE_ABORT_REASON = {
  'not-started': 'the test queue turn was lost before the suite started — re-run',
  lost: 'the test queue turn was lost while the suite ran; the suite was killed — re-run',
} as const;

async function recordTestProvenance(
  cwd: string,
  explicitChange: string | undefined,
  queue: QueueSettings,
): Promise<RecordTestsResult> {
  const change = await resolveChange(cwd, explicitChange, true, 'Which change to record the test run for?');
  const metadataPath = path.join(cwd, '.prospec', 'changes', change, 'metadata.yaml');
  if (!existsSync(metadataPath)) {
    return { kind: 'record-tests', change, recorded: false, reason: 'metadata.yaml not found' };
  }
  // Outside a git work tree there is no repository to share a queue with, and the capture
  // below refuses before any suite is spawned.
  if (!isGitWorkTree(cwd)) {
    return recordUnderTurn(cwd, change, metadataPath, (command, timeoutMs) => runTestCommand(cwd, command, timeoutMs));
  }
  const projectRoot = realpathSync(cwd);
  const outcome = await withTestQueue(
    {
      cwd,
      key: `${projectRoot}\u0000record-tests\u0000${change}`,
      label: `record-tests ${change}`,
      worktree: projectRoot,
      waitMs: queue.waitMs,
      leaseMs: queue.leaseMs,
      ...(queue.onWait === undefined ? {} : { onWait: queue.onWait }),
    },
    (session) => recordUnderTurn(cwd, change, metadataPath, (command, timeoutMs) => (
      session.run(timeoutMs, (hooks) => runTestCommand(cwd, command, timeoutMs, undefined, hooks))
    )),
  );
  if (outcome.kind === 'busy') {
    return { kind: 'record-tests', change, recorded: false, reason: 'the repository test queue is busy — nothing was run', busy: outcome.busy };
  }
  return outcome.warning === undefined ? outcome.value : { ...outcome.value, warning: outcome.warning };
}

/** The record path proper: it runs only while the turn is held (or, outside git, unqueued). */
async function recordUnderTurn(
  cwd: string,
  change: string,
  metadataPath: string,
  runSuite: SuiteRunner,
): Promise<RecordTestsResult> {
  const id = randomUUID();
  const date = new Date().toISOString().slice(0, 10);
  const { doc: initial } = readChangeMetadata(metadataPath, change);
  initial.set('test_attempt', initial.createNode({ id, date, outcome: 'running' } satisfies TestAttempt));
  await writeChangeMetadataDoc(metadataPath, initial, change);
  // Command resolution reads repository inputs too; include it inside the fence.
  const capture = async () => {
    const configPath = path.join(cwd, '.prospec.yaml');
    const configBytes = readFileSync(configPath);
    const config = await readConfig(cwd);
    const command = resolveTestCommand(config, cwd);
    const timeoutMs = command === null ? null : resolveTestTimeoutMs(config);
    if (!configBytes.equals(readFileSync(configPath))) throw new Error('Configuration changed during command resolution');
    return { command, timeoutMs, configBytes, state: computeTestState(cwd, { config, configBytes, command }) };
  };
  let before: TestInputState = { digest: null, clean: null, identity: { fingerprintVersion: FINGERPRINT_VERSION, scope: EVIDENCE_SCOPE } };

  const finish = async (attempt: TestAttempt, result: RecordTestsResult, provenance?: Record<string, unknown>): Promise<RecordTestsResult> => {
    try {
      const { doc, metadata } = readChangeMetadata(metadataPath, change);
      if (metadata.test_attempt?.id !== id) return { ...result, recorded: false, reason: 'test attempt superseded — completion cannot overwrite a newer attempt' };
      doc.set('test_attempt', doc.createNode(attempt));
      if (provenance) doc.set('test_provenance', doc.createNode(provenance));
      await writeChangeMetadataDoc(metadataPath, doc, change);
      return result;
    } catch (error) {
      if (error instanceof MetadataWriteError) throw error;
      return { ...result, recorded: false, reason: `metadata.yaml changed during the run and no longer validates or cannot be written — re-run (${error instanceof Error ? error.message : String(error)})` };
    }
  };
  const skipped = async (outcome: TestAttempt['outcome'], reason: string, command?: string) =>
    finish({ id, date, outcome, reason, ...(before.digest !== null ? { before_digest: before.digest } : {}), ...(command ? { command } : {}) }, { kind: 'record-tests', change, recorded: false, reason, ...(command ? { command } : {}) });
  let command: string | null;
  let timeoutMs: number | null;
  let beforeConfig: Buffer;
  try { const observed = await capture(); command = observed.command; timeoutMs = observed.timeoutMs; before = observed.state; beforeConfig = observed.configBytes; }
  catch (error) {
    return skipped('unprovable', error instanceof TestTimeoutInvalid
      ? `${error.message} — ${error.suggestion}`
      : `test configuration is unreadable: ${String(error)}`);
  }
  if (command === null || timeoutMs === null) return skipped('unavailable', 'no test command — set tech_stack.test_command in .prospec.yaml');
  if (before.digest === null) return skipped('unprovable', before.reason ?? digestFailureReason(cwd), command);
  const run = await runSuite(command, timeoutMs);
  let after: TestInputState;
  let commandStable = false;
  try {
    const observed = await capture();
    after = observed.state;
    commandStable = observed.command === command && observed.configBytes.equals(beforeConfig);
  } catch (error) {
    after = { ...before, digest: null, reason: `test configuration is unreadable: ${String(error)}` };
  }
  const stable = commandStable && after.digest !== null && before.digest === after.digest
    && JSON.stringify(before.identity) === JSON.stringify(after.identity);
  const policy = TestPolicySchema.safeParse(before.identity.testPolicy);
  const trace = { fingerprint_version: before.identity.fingerprintVersion, scope: before.identity.scope,
    ...(policy.success ? { test_policy: policy.data } : {}) };
  const outcome: TestAttempt['outcome'] = run.timed_out ? 'timeout' : run.exit_code === null
    ? (run.error ? 'unavailable' : 'unprovable') : run.exit_code !== 0 ? 'failed' : stable ? 'passed' : 'unprovable';
  const reason = run.timed_out ? `test run timed out after ${run.timeout_ms} ms (tech_stack.test_timeout_ms sets the cap)`
    : run.interrupted_by ? `test run interrupted by ${run.interrupted_by}`
    : run.queue_abort ? QUEUE_ABORT_REASON[run.queue_abort]
    : run.signal ? `test run killed by ${run.signal}` : run.error ?? (stable ? undefined
      : `inputs changed during test run or capture is unprovable${indexInputsHint(commandStable && after.digest !== null && after.digest !== before.digest)} — re-run against stable inputs`);
  // An aborted run carries no command of its own: the one that was resolved is the record.
  const ran = run.command === '' ? command : run.command;
  const attempt: TestAttempt = { id, date, outcome, ...trace, command: ran, before_digest: before.digest,
    ...(after.digest !== null ? { after_digest: after.digest } : {}),
    ...(run.exit_code !== null ? { exit_code: run.exit_code } : {}),
    ...(run.signal ? { signal: run.signal } : {}), ...(reason ? { reason } : {}),
  };
  // Nonzero is durable even when after-capture fails; only certified success clears it.
  const recorded = outcome === 'passed' || outcome === 'failed';
  const provenance = recorded ? { command: ran, exit_code: run.exit_code, digest: before.digest, date,
    ...trace, attempt_id: id } : undefined;
  return finish(attempt, { kind: 'record-tests', change, recorded, command: ran,
    exitCode: run.exit_code, treeChangedDuringRun: !stable, ...(reason ? { reason } : {}),
    ...(run.interrupted_by ? { interruptedBy: run.interrupted_by } : {}) }, provenance);

}
