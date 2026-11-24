import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execute } from '../../../src/services/exclusive.service.js';
import { captureIdentity } from '../../../src/lib/process-tree.js';
import { resolveTestQueueRoot, TEST_QUEUE_STATE_FILE } from '../../../src/lib/test-queue.js';
import { ExclusiveCommandMissing } from '../../../src/types/errors.js';
import { awaitRegisteredTurn } from '../../helpers/queue-turn.js';
import type { HoldingTicket, TestQueueState } from '../../../src/types/test-queue.js';

// Real git and real commands (PB-010).
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const NODE = process.execPath;
let root: string;
const config = (extra = ''): void => writeFileSync(path.join(root, '.prospec.yaml'), `project:\n  name: fixture\n${extra}`);
const queueFile = (): string => path.join(resolveTestQueueRoot(root), TEST_QUEUE_STATE_FILE);
const queueState = (): TestQueueState => JSON.parse(readFileSync(queueFile(), 'utf8')) as TestQueueState;
const occupy = (): void => {
  mkdirSync(path.dirname(queueFile()), { recursive: true });
  const ticket: HoldingTicket = {
    seq: 1, key: 'someone-else', label: 'record-tests other', worktree: '/elsewhere', host: os.hostname(), lease_ms: 300_000, heartbeat_ms: Date.now(),
    state: 'holding', token: 'their-token', holder: captureIdentity(process.pid), granted_at_ms: Date.now(), phase: 'running', deadline_ms: Date.now() + 3_600_000, trees: [],
  };
  writeFileSync(queueFile(), JSON.stringify({ version: 1, next: 2, tickets: [ticket] }));
};

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'exclusive-')));
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'pipe' });
  config();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('exclusive.service (REQ-SERVICES-132)', () => {
  it('runs the argv under the turn and reports its exit code', async () => {
    const marker = path.join(root, 'ran');
    const script = `${awaitRegisteredTurn(queueFile())}const fs=require('node:fs');fs.copyFileSync(${JSON.stringify(queueFile())}, ${JSON.stringify(marker)});fs.writeFileSync(${JSON.stringify(`${marker}.token`)}, process.env.PROSPEC_TEST_QUEUE_TOKEN ?? '');process.exit(4)`;
    const argv = [NODE, '-e', script];
    const result = await execute({ cwd: root, argv });
    expect(result).toMatchObject({ kind: 'ran', exitCode: 4, timedOut: false });
    const during = JSON.parse(readFileSync(marker, 'utf8')) as TestQueueState;
    expect(during.tickets).toHaveLength(1);
    expect(during.tickets[0]).toMatchObject({ state: 'holding', phase: 'running', worktree: root });
    expect(during.tickets[0]!.label).toBe(`exclusive ${argv.join(' ')}`);
    // The command itself was handed the holder's token, which is what lets an entry nested in it run.
    const handed = readFileSync(`${marker}.token`, 'utf8');
    expect(handed).not.toBe('');
    expect(handed).toBe((during.tickets[0] as HoldingTicket).token);
    expect(during.tickets[0]!.key).toBe([root, 'exclusive', ...argv].join('\u0000'));
    expect(queueState().tickets).toEqual([]);
  });

  it('keeps an argument with spaces as one argument', async () => {
    const result = await execute({ cwd: root, argv: [NODE, '-e', 'process.exit(process.argv[1] === "a b" ? 0 : 9)', 'a b'] });
    expect(result).toMatchObject({ kind: 'ran', exitCode: 0 });
  });

  it('returns busy without running the argv when the wait cap passes', async () => {
    config('tech_stack:\n  test_queue_wait_ms: 0\n');
    occupy();
    const marker = path.join(root, 'ran');
    const result = await execute({ cwd: root, argv: [NODE, '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, '1')`] });
    expect(result.kind).toBe('busy');
    expect(result.kind === 'busy' && result.busy).toMatchObject({ seq: 2, ahead: 1, holder: { label: 'record-tests other' } });
    expect(existsSync(marker)).toBe(false);
  });

  it('resumes the same ticket for the same argv and takes a new one for another', async () => {
    config('tech_stack:\n  test_queue_wait_ms: 0\n');
    occupy();
    const seq = async (...argv: string[]): Promise<number | undefined> => {
      const r = await execute({ cwd: root, argv });
      return r.kind === 'busy' ? r.busy.seq : undefined;
    };
    expect([await seq(NODE, '-e', '1'), await seq(NODE, '-e', '1'), await seq(NODE, '-e', '2')]).toEqual([2, 2, 3]);
  });

  it('runs under the test timeout and reports a timeout without an exit code', async () => {
    config('tech_stack:\n  test_timeout_ms: 300\n');
    const result = await execute({ cwd: root, argv: [NODE, '-e', 'setTimeout(()=>{},30000)'] });
    expect(result).toMatchObject({ kind: 'ran', exitCode: null, timedOut: true, timeoutMs: 300 });
  });

  it('reports a spawn error', async () => {
    const result = await execute({ cwd: root, argv: [path.join(root, 'no-such-binary')] });
    expect(result).toMatchObject({ kind: 'ran', exitCode: null, timedOut: false });
    expect(result.kind === 'ran' && result.error).toMatch(/ENOENT/);
  });

  it('keys the ticket by the project root\'s real path when the cwd is a symlink to it', async () => {
    config('tech_stack:\n  test_queue_wait_ms: 0\n');
    occupy();
    const link = `${root}-link`;
    symlinkSync(root, link);
    try {
      expect((await execute({ cwd: link, argv: [NODE, '-e', '1'] })).kind).toBe('busy');
    } finally {
      rmSync(link, { force: true });
    }
    expect(queueState().tickets[1]).toMatchObject({ key: [root, 'exclusive', NODE, '-e', '1'].join('\u0000'), worktree: root });
  });

  it('reports the signal that ended the command itself', async () => {
    const result = await execute({ cwd: root, argv: [NODE, '-e', 'process.kill(process.pid, "SIGKILL")'] });
    expect(result).toMatchObject({ kind: 'ran', exitCode: null, timedOut: false, signal: 'SIGKILL' });
  });

  it('reports a turn it could not release as a warning beside the command\'s exit code', async () => {
    const result = await execute({ cwd: root, argv: [NODE, '-e', `${awaitRegisteredTurn(queueFile())}require('node:fs').writeFileSync(${JSON.stringify(queueFile())}, '{broken'); process.exit(6)`] });
    expect(result).toMatchObject({ kind: 'ran', exitCode: 6 });
    expect(result.kind === 'ran' && result.warning).toContain('not released');
  });

  it('refuses an empty argv with the usage', async () => {
    await expect(execute({ cwd: root, argv: [] })).rejects.toThrow(ExclusiveCommandMissing);
    expect(existsSync(path.dirname(queueFile()))).toBe(false);
  });

  it('announces a wait through onQueueWait', async () => {
    config('tech_stack:\n  test_queue_wait_ms: 0\n');
    occupy();
    const waits: unknown[] = [];
    await execute({ cwd: root, argv: [NODE, '-e', '1'], onQueueWait: (info) => waits.push(info) });
    expect(waits).toHaveLength(1);
  });
});
