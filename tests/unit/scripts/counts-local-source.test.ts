import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import { gitIn } from '../../helpers/git-fixture.js';
import { usePrivateTmpdir } from '../../helpers/private-tmpdir.js';
import { TEST_QUEUE_BUSY_EXIT_CODE } from '../../../src/types/test-queue.js';
import type { ExclusiveOptions, ExclusiveResult } from '../../../src/services/exclusive.service.js';
import { exclusiveFailureLine, exclusiveRunCause } from '../../../src/cli/formatters/exclusive-output.js';
import { exitCodeForSignal, testQueueWaitLine } from '../../../src/cli/formatters/test-queue-output.js';
import type { TestCountResult } from '../../../scripts/counts/sync.js';
import { describeRun, judgeLocalReport, localTestCounts, localTestCountsFor, runSuiteQueued, type QueuedRun } from '../../../scripts/counts/local-source.js';
import { LOCAL_REPORT, workTreeDigest } from '../../../scripts/counts/report-source.js';

// judgeLocalReport runs real git in a temp repo (PB-010): nearest sibling declares 90s.
vi.setConfig({ testTimeout: 90_000 });

const COUNTS = { 'tests.total': 3 };
const usable: TestCountResult = { counts: COUNTS };
const unusable = (reason: string): TestCountResult => ({ counts: null, reason });

function deps(reads: TestCountResult[], run: QueuedRun = { kind: 'ran' }) {
  const read = vi.fn(() => reads.shift() ?? unusable('no more reads'));
  const runQueued = vi.fn(async () => run);
  const log = vi.fn();
  return { read, runQueued, log };
}

describe('localTestCounts — reuse, else one queued run', () => {
  it('reuses a usable report and starts no run', async () => {
    const d = deps([usable]);
    expect(await localTestCounts(d)).toEqual({ kind: 'counts', result: usable });
    expect(d.runQueued).not.toHaveBeenCalled();
    expect(d.log).not.toHaveBeenCalled();
  });

  it('names why the report is unusable, runs once under the queue, and reads the new report', async () => {
    const d = deps([unusable('files changed since vitest-report.json was written'), usable]);
    expect(await localTestCounts(d)).toEqual({ kind: 'counts', result: usable });
    expect(d.runQueued).toHaveBeenCalledTimes(1);
    expect(d.read).toHaveBeenCalledTimes(2);
    expect(d.log.mock.calls[0]![0]).toBe(
      'not reusing the local test report: files changed since vitest-report.json was written — running `pnpm test` once under the repository test queue',
    );
  });

  it('stops with the busy exit code when the queue stays busy, reading nothing more', async () => {
    const d = deps([unusable('no vitest report at vitest-report.json')], { kind: 'stop', exitCode: TEST_QUEUE_BUSY_EXIT_CODE, lines: ['● busy'] });
    expect(await localTestCounts(d)).toEqual({ kind: 'stop', exitCode: TEST_QUEUE_BUSY_EXIT_CODE, lines: ['● busy'] });
    expect(d.read).toHaveBeenCalledTimes(1);
  });

  it('skips with a reason when the queued run leaves no usable report', async () => {
    const d = deps([unusable('first'), unusable('the run was interrupted')]);
    expect(await localTestCounts(d)).toEqual({
      kind: 'counts',
      result: unusable('the queued run left no usable report: the run was interrupted'),
    });
  });

  it('stops on an interrupted run without reading again, printing its warning first', async () => {
    const d = deps([unusable('first')], { kind: 'stop', exitCode: 130, lines: ['✗ interrupted'], warning: 'w' });
    expect(await localTestCounts(d)).toEqual({ kind: 'stop', exitCode: 130, lines: ['✗ interrupted'] });
    expect(d.read).toHaveBeenCalledTimes(1);
    expect(d.log).toHaveBeenLastCalledWith('⚠ w');
  });

  it('prints the queue warning of the run it started', async () => {
    const d = deps([unusable('first'), usable], { kind: 'ran', warning: 'test queue turn not released: EPERM' });
    await localTestCounts(d);
    expect(d.log).toHaveBeenCalledWith('⚠ test queue turn not released: EPERM');
  });

  it("adds how the queued run ended when it did not exit on its own", async () => {
    const d = deps([unusable('first'), unusable('no vitest report at vitest-report.json')], { kind: 'ran', problem: 'timed out after 900000 ms' });
    const outcome = await localTestCounts(d);
    expect(outcome).toEqual({
      kind: 'counts',
      result: unusable('the queued run left no usable report: no vitest report at vitest-report.json (the run timed out after 900000 ms)'),
    });
  });
});

describe('describeRun', () => {
  const ran = (extra: Partial<Extract<ExclusiveResult, { kind: 'ran' }>>): ExclusiveResult => ({
    kind: 'ran', command: 'pnpm test', exitCode: null, timedOut: false, timeoutMs: 900_000, ...extra,
  });

  it('treats any exit code — failing tests included — as a run that ended on its own', () => {
    expect(describeRun(ran({ exitCode: 0 }))).toEqual({ kind: 'ran' });
    expect(describeRun(ran({ exitCode: 1 }))).toEqual({ kind: 'ran' });
  });

  it('names how a run without an exit code ended, in the words `prospec exclusive` prints', () => {
    for (const extra of [
      { timedOut: true }, { error: 'spawn pnpm ENOENT' },
      { queueAbort: 'not-started' as const }, { queueAbort: 'lost' as const }, { signal: 'SIGKILL' },
    ]) {
      const result = ran(extra);
      expect(describeRun(result)).toEqual({ kind: 'ran', problem: exclusiveRunCause(result as Extract<ExclusiveResult, { kind: 'ran' }>) });
    }
    expect(describeRun(ran({ queueAbort: 'not-started' }))).not.toEqual(describeRun(ran({ queueAbort: 'lost' })));
  });

  it("carries the queue's release warning, sanitized, whether or not the run exited on its own", () => {
    expect(describeRun(ran({ exitCode: 0, warning: 'test queue turn not released: \u001b[31mEPERM' }))).toEqual({
      kind: 'ran', warning: 'test queue turn not released: [31mEPERM',
    });
    expect(describeRun(ran({ timedOut: true, warning: 'w' }))).toMatchObject({ warning: 'w' });
  });

  it('renders a busy queue through the shared busy lines', () => {
    const busy = describeRun({
      kind: 'busy', command: 'pnpm test', busy: { seq: 4, ahead: 1, lease_ms: 30_000, queue_dir: '/q' } as never,
    });
    expect(busy).toMatchObject({ kind: 'stop', exitCode: TEST_QUEUE_BUSY_EXIT_CODE });
    expect(busy.kind === 'stop' && busy.lines[0]).toMatch(/Test queue busy — nothing was run: ticket #4, 1 ahead/);
  });

  it('stops on an interrupted run with the signal exit code and the line `prospec exclusive` prints, keeping the warning', () => {
    const result = ran({ interruptedBy: 'SIGINT', warning: 'w' });
    expect(describeRun(result)).toEqual({
      kind: 'stop',
      exitCode: exitCodeForSignal('SIGINT'),
      lines: [exclusiveFailureLine(result as Extract<ExclusiveResult, { kind: 'ran' }>)],
      warning: 'w',
    });
  });
});

describe('runSuiteQueued', () => {
  it('runs `pnpm test` in the repository root and reports queue waits through the shared wait line', async () => {
    const seen: ExclusiveOptions[] = [];
    const execute = vi.fn(async (options: ExclusiveOptions): Promise<ExclusiveResult> => {
      seen.push(options);
      options.onQueueWait?.({ seq: 3, ahead: 2 } as never);
      return { kind: 'ran', command: 'pnpm test', exitCode: 1, timedOut: false, timeoutMs: 1 };
    });
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await runSuiteQueued('/repo', execute)).toEqual({ kind: 'ran' });
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ cwd: '/repo', argv: ['pnpm', 'test'] });
      expect(stderr).toHaveBeenCalledWith(testQueueWaitLine({ seq: 3, ahead: 2 } as never));
    } finally {
      stderr.mockRestore();
    }
  });
});

describe('localTestCounts — a failure anywhere on the path is a named skip, never a crash', () => {
  const boom = (message: string) => () => {
    throw new Error(message);
  };

  it('names a read that throws (an unreadable test directory while globbing)', async () => {
    const d = deps([]);
    d.read.mockImplementationOnce(boom('EACCES: permission denied, scandir tests/locked')).mockImplementationOnce(() => usable);
    expect(await localTestCounts(d)).toEqual({ kind: 'counts', result: usable });
    expect(d.log.mock.calls[0]![0]).toMatch(/^not reusing the local test report: the local test report could not be judged: EACCES/);
  });

  it('names a read that throws after the queued run', async () => {
    const d = deps([unusable('first')]);
    d.read.mockImplementationOnce(() => unusable('first')).mockImplementationOnce(boom('EACCES'));
    expect(await localTestCounts(d)).toEqual({
      kind: 'counts',
      result: unusable('the queued run left no usable report: the local test report could not be judged: EACCES'),
    });
  });

  it('names a queued run that could not be started', async () => {
    const d = deps([unusable('first'), unusable('no vitest report at vitest-report.json')]);
    d.runQueued.mockImplementationOnce(async () => {
      throw new Error('Invalid test timeout in .prospec.yaml tech_stack.test_timeout_ms: 0');
    });
    expect(await localTestCounts(d)).toEqual({
      kind: 'counts',
      result: unusable(
        'the queued run left no usable report: no vitest report at vitest-report.json (the run could not be started: Invalid test timeout in .prospec.yaml tech_stack.test_timeout_ms: 0)',
      ),
    });
  });
});

describe('judgeLocalReport — the real local report path', () => {
  const tmp = usePrivateTmpdir('counts-local-source');

  function repo(): string {
    const root = path.join(tmp, `r${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    gitIn(root, 'init', '-q');
    fs.writeFileSync(path.join(root, '.gitignore'), `${LOCAL_REPORT}\n`);
    fs.writeFileSync(path.join(root, 'tests', 'a.test.ts'), '');
    gitIn(root, 'add', '-A');
    gitIn(root, 'commit', '-q', '-m', 'base');
    return root;
  }

  function writeReport(root: string, prospecCounts: unknown): void {
    const testResults = [{ name: path.join(root, 'tests', 'a.test.ts'), assertionResults: [{}, {}] }];
    fs.writeFileSync(path.join(root, LOCAL_REPORT), JSON.stringify({ testResults, prospecCounts }));
  }

  it('counts from a report stamped with the current digest that covers every test file', () => {
    const root = repo();
    const d = workTreeDigest(root);
    writeReport(root, { workTreeDigest: 'digest' in d ? d.digest : 'none' });
    expect(judgeLocalReport(root).counts).toMatchObject({ 'tests.total': 2, 'tests.files': 1 });
  });

  it('refuses the same report once a test file is added', () => {
    const root = repo();
    const d = workTreeDigest(root);
    writeReport(root, { workTreeDigest: 'digest' in d ? d.digest : 'none' });
    fs.writeFileSync(path.join(root, 'tests', 'b.test.ts'), '');
    expect(judgeLocalReport(root)).toEqual({ counts: null, reason: `files changed since ${LOCAL_REPORT} was written` });
  });

  it('refuses a local report that is valid JSON but not a report, without throwing', () => {
    const root = repo();
    fs.writeFileSync(path.join(root, LOCAL_REPORT), 'null');
    expect(judgeLocalReport(root)).toEqual({ counts: null, reason: `${LOCAL_REPORT} is not a readable vitest report: expected a JSON object` });
  });

  it('localTestCountsFor reads this root\'s stamped report and starts no run', async () => {
    const root = repo();
    const d = workTreeDigest(root);
    writeReport(root, { workTreeDigest: 'digest' in d ? d.digest : 'none' });
    const runQueued = vi.fn(async (): Promise<QueuedRun> => ({ kind: 'stop', exitCode: TEST_QUEUE_BUSY_EXIT_CODE, lines: [] }));
    const outcome = await localTestCountsFor(root, { runQueued, log: vi.fn() });
    expect(outcome).toMatchObject({ kind: 'counts', result: { counts: { 'tests.total': 2 } } });
    expect(runQueued).not.toHaveBeenCalled();
  });

  it('localTestCountsFor stops with the busy exit code when this root has no usable report and the queue is busy', async () => {
    const outcome = await localTestCountsFor(repo(), { runQueued: async () => ({ kind: 'stop', exitCode: TEST_QUEUE_BUSY_EXIT_CODE, lines: ['● busy'] }), log: vi.fn() });
    expect(outcome).toEqual({ kind: 'stop', exitCode: TEST_QUEUE_BUSY_EXIT_CODE, lines: ['● busy'] });
  });

  it('refuses a missing report with the reader reason', () => {
    expect(judgeLocalReport(repo())).toEqual({ counts: null, reason: `no vitest report at ${LOCAL_REPORT}` });
  });
});
