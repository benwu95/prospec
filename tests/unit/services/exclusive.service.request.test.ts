import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The turn is lost in the instant between two queue transactions, which no command can be
// made to hit: the queue is replaced here, and only the service's own request and mapping run.
const withTestQueue = vi.hoisted(() => vi.fn());
vi.mock('../../../src/lib/test-queue.js', () => ({ withTestQueue }));

const { execute } = await import('../../../src/services/exclusive.service.js');

let root: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'exclusive-request-')));
  writeFileSync(path.join(root, '.prospec.yaml'), 'project:\n  name: fixture\ntech_stack:\n  test_timeout_ms: 7000\n  test_queue_wait_ms: 1234\n  test_queue_lease_ms: 45000\n');
  withTestQueue.mockReset();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const run = (over: Record<string, unknown>) => ({ command: 'x', exit_code: null, timed_out: false, timeout_ms: 7000, ...over });

describe('exclusive.service — the request it sends and the result it maps (REQ-SERVICES-132)', () => {
  it('asks for the turn with the worktree and argv as its key, and the configured wait cap and lease', async () => {
    withTestQueue.mockResolvedValue({ kind: 'ran', value: run({ exit_code: 0 }) });
    await execute({ cwd: root, argv: ['pnpm', 'test', '--run'] });
    expect(withTestQueue).toHaveBeenCalledTimes(1);
    expect(withTestQueue.mock.calls[0]![0]).toEqual({
      cwd: root,
      key: [root, 'exclusive', 'pnpm', 'test', '--run'].join('\u0000'),
      label: 'exclusive pnpm test --run',
      worktree: root,
      waitMs: 1234,
      leaseMs: 45000,
    });
  });

  it.each(['not-started', 'lost'] as const)('reports a turn that was %s, with no exit code', async (reason) => {
    withTestQueue.mockResolvedValue({ kind: 'ran', value: run({ queue_abort: reason }) });
    expect(await execute({ cwd: root, argv: ['pnpm', 'test'] })).toEqual({
      kind: 'ran', command: 'pnpm test', exitCode: null, timedOut: false, timeoutMs: 7000, queueAbort: reason,
    });
  });
});
