import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCliInProcess } from './helpers/run-cli.js';
import { captureIdentity } from '../../src/lib/process-tree.js';
import { resolveTestQueueRoot, TEST_QUEUE_STATE_FILE } from '../../src/lib/test-queue.js';
import type { HoldingTicket, TestQueueState } from '../../src/types/test-queue.js';

// Real git and real commands through the in-process CLI (PB-010).
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const NODE = process.execPath;
let root: string;
const config = (tech = ''): void => writeFileSync(path.join(root, '.prospec.yaml'), `project:\n  name: fixture\ntech_stack:\n  test_command: ${JSON.stringify(`${NODE} -e process.exit(0)`)}\n${tech}`);
const metadataPath = (): string => path.join(root, '.prospec/changes/x/metadata.yaml');
const occupy = (over: Partial<HoldingTicket> = {}): void => {
  const dir = resolveTestQueueRoot(root);
  mkdirSync(dir, { recursive: true });
  const ticket: HoldingTicket = {
    seq: 1, key: 'someone-else', label: 'record-tests other-change', worktree: '/elsewhere', host: os.hostname(), lease_ms: 300_000, heartbeat_ms: Date.now(),
    state: 'holding', token: 'their-token', holder: captureIdentity(process.pid), granted_at_ms: Date.now(), phase: 'running', deadline_ms: Date.now() + 3_600_000, trees: [], ...over,
  };
  writeFileSync(path.join(dir, TEST_QUEUE_STATE_FILE), JSON.stringify({ version: 1, next: 2, tickets: [ticket] }));
};
const cli = (...args: string[]) => runCliInProcess(args, { cwd: root });

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'cli-exclusive-')));
  const git = (...args: string[]): void => { execFileSync('git', args, { cwd: root, stdio: 'pipe' }); };
  git('init', '-q'); git('config', 'user.name', 'test'); git('config', 'user.email', 'test@example.com');
  writeFileSync(path.join(root, '.gitignore'), '.prospec.yaml\n');
  config();
  mkdirSync(path.dirname(metadataPath()), { recursive: true });
  writeFileSync(metadataPath(), 'name: x\ncreated_at: "2026-11-23"\nstatus: implemented\nscale: full\n');
  git('add', '.'); git('commit', '-qm', 'fixture');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('prospec exclusive (REQ-CLI-065)', () => {
  it('exits with the wrapped command\'s exit code and prints nothing of its own', async () => {
    const res = await cli('exclusive', '--', NODE, '-e', 'process.exit(4)');
    expect(res).toEqual({ stdout: '', stderr: '', exitCode: 4 });
    expect((await cli('exclusive', '--', NODE, '-e', 'process.exit(0)')).exitCode).toBe(0);
  });

  it('exits 75 on busy, with the block on stderr, and does not run the command', async () => {
    config('  test_queue_wait_ms: 0\n');
    occupy();
    const marker = path.join(root, 'ran');
    const res = await cli('exclusive', '--', NODE, '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)},'1')`);
    expect(res.exitCode).toBe(75);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('ticket #2');
    expect(res.stderr).toContain('1 ahead');
    expect(res.stderr).toContain('record-tests other-change');
    expect(res.stderr).toContain('nothing was run');
    expect(res.stderr).toMatch(/[Rr]e-run the same command/);
    // The wait is announced once, before the busy block.
    expect(res.stderr.match(/waiting for the test queue/g)).toHaveLength(1);
    expect(existsSync(marker)).toBe(false);
  });

  it('exits 1 and names the cause when the command timed out or could not be spawned', async () => {
    config('  test_timeout_ms: 300\n');
    const timeout = await cli('exclusive', '--', NODE, '-e', 'setTimeout(()=>{},30000)');
    expect(timeout.exitCode).toBe(1);
    expect(timeout.stderr).toContain('timed out after 300 ms');
    const missing = await cli('exclusive', '--', path.join(root, 'no-such-binary'));
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toMatch(/ENOENT/);
  });

  it('exits 1 and names the terminating signal', async () => {
    const res = await cli('exclusive', '--', NODE, '-e', 'process.kill(process.pid,"SIGKILL")');
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('was killed by SIGKILL');
  });

  it('refuses a call without a command', async () => {
    const res = await cli('exclusive');
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/command/i);
  });
});

describe('prospec check --record-tests on a busy queue (REQ-CLI-065, REQ-TESTS-149)', () => {
  it('exits 75, prints the block as its status, and leaves metadata.yaml byte-identical', async () => {
    config('  test_queue_wait_ms: 0\n');
    occupy();
    const before = readFileSync(metadataPath());
    const res = await cli('check', '--record-tests', '--change', 'x');
    expect(res.exitCode).toBe(75);
    expect(res.stdout).toContain('ticket #2');
    expect(res.stdout).toContain('nothing was run');
    expect(res.stdout).toContain('record-tests other-change');
    // The busy block is the whole status: no record line follows it.
    expect(res.stdout).not.toContain('Test baseline');
    expect(res.stderr.match(/waiting for the test queue/g)).toHaveLength(1);
    expect(readFileSync(metadataPath()).equals(before)).toBe(true);
  });

  it('prints a turn it could not release as a warning beside the record line', async () => {
    writeFileSync(path.join(root, 'suite.cjs'), `require('node:fs').writeFileSync(${JSON.stringify(path.join(resolveTestQueueRoot(root), TEST_QUEUE_STATE_FILE))}, '{broken');`);
    writeFileSync(path.join(root, '.prospec.yaml'), `project:\n  name: fixture\ntech_stack:\n  test_command: ${JSON.stringify(`${NODE} suite.cjs`)}\n`);
    const res = await cli('check', '--record-tests', '--change', 'x');
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('test queue turn not released');
    expect(res.stdout).toContain('Recorded test baseline');
  });

  it('states a holder of another host, and one whose process is gone, with the queue path', async () => {
    config('  test_queue_wait_ms: 0\n');
    occupy({ host: 'some-other-host' });
    const other = await cli('check', '--record-tests', '--change', 'x');
    expect(other.exitCode).toBe(75);
    expect(other.stdout).toContain('another host');
    expect(other.stdout).toContain(resolveTestQueueRoot(root));

    // A holder that is gone while a tree it registered still exists (this process stands in for the tree).
    occupy({ holder: { pid: 2_147_483_600, started: 'gone' }, trees: [{ kind: 'process', ...captureIdentity(process.pid) }] });
    const gone = await cli('check', '--record-tests', '--change', 'x');
    expect(gone.exitCode).toBe(75);
    expect(gone.stdout).toContain('no longer running');
    expect(gone.stdout).toContain(resolveTestQueueRoot(root));
  });

  it('exits 0 with a non-passing attempt recorded when the suite times out', async () => {
    writeFileSync(path.join(root, '.prospec.yaml'), `project:\n  name: fixture\ntech_stack:\n  test_command: ${JSON.stringify(`${NODE} -e setTimeout(()=>{},30000)`)}\n  test_timeout_ms: 300\n`);
    const res = await cli('check', '--record-tests', '--change', 'x');
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('timed out after 300 ms');
    expect(readFileSync(metadataPath(), 'utf8')).toMatch(/^ {2}outcome: timeout$/m);
  });

  it('exits 0 and records as before on an idle queue', async () => {
    const res = await cli('check', '--record-tests', '--change', 'x');
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('Recorded test baseline');
    expect(res.stderr).toBe('');
  });
});

// A signal cannot be delivered to the in-process CLI without reaching the test runner, so these run the source CLI as a process.
describe.skipIf(process.platform === 'win32')('a signal sent to prospec while its command runs (REQ-CLI-065, REQ-TESTS-149)', () => {
  const SLEEPER = `${NODE} -e setTimeout(()=>{},60000)`;
  const stateFile = (): string => path.join(resolveTestQueueRoot(root), TEST_QUEUE_STATE_FILE);
  /** Start the CLI, send it the given signal once its command is registered under the turn, and report how it ended. */
  const interrupt = async (name: NodeJS.Signals, ...args: string[]): Promise<{ code: number | null; signal: string | null; stderr: string; tree: number }> => {
    const child = spawn(NODE, ['--import', import.meta.resolve('tsx'), path.resolve('src/cli/index.ts'), ...args], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    const ended = new Promise<{ code: number | null; signal: string | null }>((resolve) => { child.once('close', (code, signal) => resolve({ code, signal })); });
    let tree = 0;
    for (let i = 0; i < 400 && tree === 0 && child.exitCode === null; i++) {
      await new Promise((r) => setTimeout(r, 50));
      try {
        const ticket = (JSON.parse(readFileSync(stateFile(), 'utf8')) as TestQueueState).tickets[0];
        if (ticket?.state === 'holding' && ticket.phase === 'running') tree = ticket.trees[0]?.pid ?? 0;
      } catch { /* not written yet, or mid-rename */ }
    }
    expect(tree).toBeGreaterThan(0);
    child.kill(name);
    return { ...(await ended), stderr, tree };
  };
  const gone = (pid: number): boolean => { try { process.kill(pid, 0); return false; } catch { return true; } };

  it.each([['SIGTERM', 143], ['SIGINT', 130]] as const)('exits 128 plus the number of %s (%i) from `exclusive`, with the command killed and the turn released', async (name, code) => {
    const res = await interrupt(name, 'exclusive', '--', NODE, '-e', 'setTimeout(()=>{},60000)');
    expect({ code: res.code, signal: res.signal }).toEqual({ code, signal: null });
    expect(res.stderr).toContain(`was interrupted by ${name}`);
    expect(gone(res.tree)).toBe(true);
    expect((JSON.parse(readFileSync(stateFile(), 'utf8')) as TestQueueState).tickets).toEqual([]);
  });

  it('exits 143 from `check --record-tests`, with a non-passing attempt recorded', async () => {
    writeFileSync(path.join(root, '.prospec.yaml'), `project:\n  name: fixture\ntech_stack:\n  test_command: ${JSON.stringify(SLEEPER)}\n`);
    const res = await interrupt('SIGTERM', 'check', '--record-tests', '--change', 'x');
    expect({ code: res.code, signal: res.signal }).toEqual({ code: 143, signal: null });
    expect(gone(res.tree)).toBe(true);
    const metadata = readFileSync(metadataPath(), 'utf8');
    expect(metadata).toContain('interrupted by SIGTERM');
    expect(metadata).not.toMatch(/^test_provenance:/m);
    expect((JSON.parse(readFileSync(stateFile(), 'utf8')) as TestQueueState).tickets).toEqual([]);
  });
});
