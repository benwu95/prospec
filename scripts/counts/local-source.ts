import type { ExclusiveOptions, ExclusiveResult } from '../../src/services/exclusive.service.js';
import { exclusiveFailureLine, exclusiveRunCause } from '../../src/cli/formatters/exclusive-output.js';
import { sanitizeTerminal } from '../../src/cli/formatters/sanitize.js';
import { exitCodeForSignal, testQueueBusyLines, testQueueWaitLine } from '../../src/cli/formatters/test-queue-output.js';
import { TEST_QUEUE_BUSY_EXIT_CODE } from '../../src/types/test-queue.js';
import { LOCAL_REPORT, countsFrom, expectedTestFiles, judgeStampedReport, readReport, workTreeDigest } from './report-source.js';
import type { TestCountResult } from './sync.js';

/**
 * Test counts without `--from` (REQ-TESTS-150): reuse the report `pnpm test`
 * left while its stamp still matches the work tree, else run `pnpm test` once
 * under the repository test queue turn and read what that run wrote.
 *
 * `scripts/` sits outside the `cli → services → lib → types` direction, so it
 * calls the exclusive service in-process (typed busy / ran instead of an exit
 * code) and reads its outcome through the CLI's shared queue and exclusive
 * formatters.
 */

/** `stop`: nothing may be counted or written — the queue stayed busy, or the run was interrupted. */
export type QueuedRun =
  | { kind: 'stop'; exitCode: number; lines: string[]; warning?: string }
  | { kind: 'ran'; problem?: string; warning?: string };

export type TestCountOutcome =
  | { kind: 'counts'; result: TestCountResult }
  | { kind: 'stop'; exitCode: number; lines: string[] };

export interface LocalSourceDeps {
  read: () => TestCountResult;
  runQueued: () => Promise<QueuedRun>;
  log: (line: string) => void;
}

const failure = (err: unknown): string => sanitizeTerminal(err instanceof Error ? err.message : String(err));

/**
 * Every failure on this path — reading the report, globbing the test files, starting the
 * queued run — ends as a named skip rather than a crash, so the inventory counts are still
 * checked and the skip still fails `--check`.
 */
export async function localTestCounts(deps: LocalSourceDeps): Promise<TestCountOutcome> {
  const read = (): TestCountResult => {
    try {
      return deps.read();
    } catch (err) {
      return { counts: null, reason: `the local test report could not be judged: ${failure(err)}` };
    }
  };
  const first = read();
  if (first.counts !== null) return { kind: 'counts', result: first };
  deps.log(`not reusing the local test report: ${first.reason} — running \`pnpm test\` once under the repository test queue`);
  let run: QueuedRun;
  try {
    run = await deps.runQueued();
  } catch (err) {
    run = { kind: 'ran', problem: `could not be started: ${failure(err)}` };
  }
  if (run.warning !== undefined) deps.log(`⚠ ${run.warning}`);
  if (run.kind === 'stop') return { kind: 'stop', exitCode: run.exitCode, lines: run.lines };
  const second = read();
  if (second.counts !== null) return { kind: 'counts', result: second };
  const ended = run.problem === undefined ? '' : ` (the run ${run.problem})`;
  return { kind: 'counts', result: { counts: null, reason: `the queued run left no usable report: ${second.reason}${ended}` } };
}

/** `localTestCounts` wired to this repository's report, queue and stderr; `overrides` replace any of them. */
export function localTestCountsFor(repoRoot: string, overrides: Partial<LocalSourceDeps> = {}): Promise<TestCountOutcome> {
  return localTestCounts({
    read: () => judgeLocalReport(repoRoot),
    runQueued: () => runSuiteQueued(repoRoot),
    log: (line) => console.warn(line),
    ...overrides,
  });
}

/** The local report, used only while it stands for the current work tree. */
export function judgeLocalReport(repoRoot: string): TestCountResult {
  const read = readReport(repoRoot, LOCAL_REPORT);
  if ('reason' in read) return { counts: null, reason: read.reason };
  const why = judgeStampedReport(read.report, workTreeDigest(repoRoot), expectedTestFiles(repoRoot), repoRoot, LOCAL_REPORT);
  return why === null ? countsFrom(read.report, LOCAL_REPORT) : { counts: null, reason: why };
}

/** How an exclusive run ended, as far as counting goes: any exit code is a finished run; busy and interrupted stop. */
export function describeRun(result: ExclusiveResult): QueuedRun {
  if (result.kind === 'busy') return { kind: 'stop', exitCode: TEST_QUEUE_BUSY_EXIT_CODE, lines: testQueueBusyLines(result.busy) };
  const warning = result.warning === undefined ? {} : { warning: sanitizeTerminal(result.warning) };
  if (result.exitCode !== null) return { kind: 'ran', ...warning };
  // An interrupted run ends `pnpm counts` too, with the signal's exit code, as `prospec exclusive` does.
  if (result.interruptedBy !== undefined) {
    return { kind: 'stop', exitCode: exitCodeForSignal(result.interruptedBy), lines: [exclusiveFailureLine(result)], ...warning };
  }
  return { kind: 'ran', problem: exclusiveRunCause(result), ...warning };
}

type Execute = (options: ExclusiveOptions) => Promise<ExclusiveResult>;

/** `pnpm test` — the script whose reporter writes the stamped report — under the queue turn. */
export async function runSuiteQueued(repoRoot: string, execute?: Execute): Promise<QueuedRun> {
  const run = execute ?? (await import('../../src/services/exclusive.service.js')).execute;
  const result = await run({
    cwd: repoRoot,
    argv: ['pnpm', 'test'],
    onQueueWait: (info) => console.error(testQueueWaitLine(info)),
  });
  return describeRun(result);
}
