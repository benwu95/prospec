import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execute, type RecordTestsResult } from '../../../src/services/check.service.js';
import { captureIdentity } from '../../../src/lib/process-tree.js';
import { resolveTestQueueRoot, TEST_QUEUE_STATE_FILE } from '../../../src/lib/test-queue.js';
import { parseYaml } from '../../../src/lib/yaml-utils.js';
import type { ChangeMetadata } from '../../../src/types/change.js';
import type { HoldingTicket, TestQueueState } from '../../../src/types/test-queue.js';

// Real git, a real suite process and real waits (PB-010).
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

let root: string;
const put = (name: string, value: string): void => {
  mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  writeFileSync(path.join(root, name), value);
};
const metadataPath = (change = 'x'): string => path.join(root, `.prospec/changes/${change}/metadata.yaml`);
const metadata = (change = 'x'): ChangeMetadata => parseYaml<ChangeMetadata>(readFileSync(metadataPath(change), 'utf8'));
const config = (extra = ''): void => put('.prospec.yaml', `project:\n  name: fixture\ntech_stack:\n  test_command: ${JSON.stringify(`${process.execPath} suite.cjs`)}\n${extra}`);
const record = (change = 'x', onQueueWait?: (info: unknown) => void): Promise<RecordTestsResult> =>
  execute({ cwd: root, change, recordTests: true, ...(onQueueWait ? { onQueueWait } : {}) }) as Promise<RecordTestsResult>;
const queueState = (): TestQueueState => JSON.parse(readFileSync(path.join(resolveTestQueueRoot(root), TEST_QUEUE_STATE_FILE), 'utf8')) as TestQueueState;
const occupy = (holderPid: number, over: Partial<HoldingTicket> = {}): void => {
  const dir = resolveTestQueueRoot(root);
  mkdirSync(dir, { recursive: true });
  const ticket: HoldingTicket = {
    seq: 1, key: 'someone-else', label: 'record-tests other-change', worktree: '/elsewhere', host: os.hostname(), lease_ms: 300_000, heartbeat_ms: Date.now(),
    state: 'holding', token: 'their-token', holder: captureIdentity(holderPid), granted_at_ms: Date.now(), phase: 'running', deadline_ms: Date.now() + 3_600_000, trees: [], ...over,
  };
  writeFileSync(path.join(dir, TEST_QUEUE_STATE_FILE), JSON.stringify({ version: 1, next: 2, tickets: [ticket] }));
};

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'queue-recording-')));
  const git = (...args: string[]): void => { execFileSync('git', args, { cwd: root, stdio: 'pipe' }); };
  git('init', '-q'); git('config', 'user.name', 'test'); git('config', 'user.email', 'test@example.com');
  put('.gitignore', 'count\n.prospec.yaml\n');
  config();
  for (const change of ['x', 'y']) put(`.prospec/changes/${change}/metadata.yaml`, `name: ${change}\ncreated_at: "2026-11-23"\nstatus: implemented\nscale: full\n`);
  put('suite.cjs', "const fs=require('node:fs');fs.writeFileSync('count',String(Number(fs.existsSync('count')?fs.readFileSync('count','utf8'):0)+1));");
  git('add', '.'); git('commit', '-qm', 'fixture');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('record-tests under the repository test queue (REQ-SERVICES-068, REQ-TESTS-149)', () => {
  it('runs at once on an idle queue and leaves no ticket behind', async () => {
    expect(await record()).toMatchObject({ recorded: true, exitCode: 0 });
    expect(metadata().test_attempt).toMatchObject({ outcome: 'passed' });
    expect(queueState().tickets).toEqual([]);
  });

  it('reports a turn it could not release as a warning on the recorded result', async () => {
    put('suite.cjs', `require('node:fs').writeFileSync(${JSON.stringify(path.join(resolveTestQueueRoot(root), TEST_QUEUE_STATE_FILE))}, '{broken');`);
    const result = await record();
    expect(result).toMatchObject({ recorded: true, exitCode: 0 });
    expect(result.warning).toContain('not released');
  });

  it('hands the suite the token of its own turn', async () => {
    const stateFile = path.join(resolveTestQueueRoot(root), TEST_QUEUE_STATE_FILE);
    const seen = path.join(resolveTestQueueRoot(root), 'seen.json');
    put('suite.cjs', `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ token: process.env.PROSPEC_TEST_QUEUE_TOKEN ?? '', state: JSON.parse(fs.readFileSync(${JSON.stringify(stateFile)}, 'utf8')) }));`);
    expect(await record()).toMatchObject({ recorded: true, exitCode: 0 });
    const { token, state } = JSON.parse(readFileSync(seen, 'utf8')) as { token: string; state: TestQueueState };
    expect(token).not.toBe('');
    expect(token).toBe((state.tickets[0] as HoldingTicket).token);
  });

  it('waits under the configured lease, and keys the ticket by the real path of a symlinked cwd', async () => {
    config('  test_queue_wait_ms: 0\n  test_queue_lease_ms: 45000\n');
    occupy(process.pid);
    const link = `${root}-link`;
    symlinkSync(root, link);
    let result: RecordTestsResult;
    try {
      result = await execute({ cwd: link, change: 'x', recordTests: true }) as RecordTestsResult;
    } finally {
      rmSync(link, { force: true });
    }
    expect(result.busy).toMatchObject({ seq: 2, lease_ms: 45_000 });
    expect(queueState().tickets[1]).toMatchObject({ key: `${root}\u0000record-tests\u0000x`, worktree: root, lease_ms: 45_000 });
  });

  it('returns busy without touching metadata.yaml or running the suite', async () => {
    config('  test_queue_wait_ms: 0\n');
    occupy(process.pid);
    const before = readFileSync(metadataPath());
    const result = await record();
    expect(result).toMatchObject({ kind: 'record-tests', change: 'x', recorded: false });
    expect(result.busy).toMatchObject({
      seq: 2, ahead: 1, queue_dir: resolveTestQueueRoot(root),
      holder: { label: 'record-tests other-change', worktree: '/elsewhere', other_host: false, holder_gone: false },
    });
    expect(readFileSync(metadataPath()).equals(before)).toBe(true);
    expect(existsSync(path.join(root, 'count'))).toBe(false);
  });

  it('keys the ticket by project root and change: a re-run resumes it, another change gets its own', async () => {
    config('  test_queue_wait_ms: 0\n');
    occupy(process.pid);
    const first = await record('x');
    const again = await record('x');
    const other = await record('y');
    expect([first.busy?.seq, again.busy?.seq, other.busy?.seq]).toEqual([2, 2, 3]);
    const waiting = queueState().tickets.filter((t) => t.state === 'waiting');
    expect(waiting.map((t) => t.label)).toEqual(['record-tests x', 'record-tests y']);
    expect(waiting.every((t) => t.key.includes(root) && t.worktree === root)).toBe(true);
  });

  it('waits for the holder, announces the wait once, then records as usual', async () => {
    const holder = spawn(process.execPath, ['-e', 'setTimeout(()=>{},700)'], { stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, 150));
    occupy(holder.pid!);
    const waits: unknown[] = [];
    const result = await record('x', (info) => waits.push(info));
    expect(result).toMatchObject({ recorded: true, exitCode: 0 });
    expect(result.busy).toBeUndefined();
    expect(waits).toHaveLength(1);
    expect(waits[0]).toMatchObject({ seq: 2, ahead: 1, holder: { label: 'record-tests other-change' } });
    expect(readFileSync(path.join(root, 'count'), 'utf8')).toBe('1');
  });

  it('holds the turn in phase running, with the suite registered, while the suite runs', async () => {
    put('suite.cjs', `const fs=require('node:fs');fs.copyFileSync(${JSON.stringify(path.join(resolveTestQueueRoot(root), TEST_QUEUE_STATE_FILE))},'count');`);
    expect(await record()).toMatchObject({ recorded: true, exitCode: 0 });
    const during = JSON.parse(readFileSync(path.join(root, 'count'), 'utf8')) as TestQueueState;
    expect(during.tickets).toHaveLength(1);
    expect(during.tickets[0]).toMatchObject({ state: 'holding', phase: 'running', label: 'record-tests x', holder: { pid: process.pid } });
    expect((during.tickets[0] as HoldingTicket).trees).toHaveLength(1);
  });

  it('takes no turn outside a git work tree: the capture path refuses and no suite is spawned', async () => {
    const plain = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'queue-recording-plain-')));
    try {
      const at = (name: string): string => path.join(plain, name);
      mkdirSync(at('.prospec/changes/x'), { recursive: true });
      writeFileSync(at('.prospec/changes/x/metadata.yaml'), 'name: x\ncreated_at: "2026-11-23"\nstatus: implemented\nscale: full\n');
      writeFileSync(at('.prospec.yaml'), `project:\n  name: fixture\ntech_stack:\n  test_command: ${JSON.stringify(`${process.execPath} suite.cjs`)}\n`);
      writeFileSync(at('suite.cjs'), "require('node:fs').writeFileSync('count','1');");
      const result = await execute({ cwd: plain, change: 'x', recordTests: true }) as RecordTestsResult;
      expect(result).toMatchObject({ recorded: false });
      expect(result.busy).toBeUndefined();
      expect(result.reason).toContain('not a git repository');
      expect(parseYaml<ChangeMetadata>(readFileSync(at('.prospec/changes/x/metadata.yaml'), 'utf8')).test_attempt).toMatchObject({ outcome: 'unprovable' });
      expect(existsSync(at('count'))).toBe(false);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it('refuses an invalid queue setting before anything is written', async () => {
    config('  test_queue_wait_ms: soon\n');
    const before = readFileSync(metadataPath());
    await expect(record()).rejects.toThrow('tech_stack.test_queue_wait_ms');
    expect(readFileSync(metadataPath()).equals(before)).toBe(true);
  });
});
