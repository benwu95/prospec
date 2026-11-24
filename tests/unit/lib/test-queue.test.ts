import { execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureTree, defaultProcessProbe, type ProcessProbe } from '../../../src/lib/process-tree.js';
import { runTestCommand } from '../../../src/lib/test-runner.js';
import {
  DEFAULT_TEST_QUEUE_LIMITS,
  TEST_QUEUE_GUARD,
  TEST_QUEUE_MUTEX,
  TEST_QUEUE_STATE_FILE,
  resolveTestQueueRoot,
  withTestQueue,
  type TestQueueRequest,
} from '../../../src/lib/test-queue.js';
import { TestQueueUnavailable } from '../../../src/types/errors.js';
import {
  TEST_QUEUE_TOKEN_ENV,
  type HoldingTicket,
  type ProcessTree,
  type TestQueueState,
  type TestQueueTicket,
} from '../../../src/types/test-queue.js';

// Real processes, real git and deliberate waits (PB-010).
vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 });

const HOST = 'test-host';
let root: string;
let queueDir: string;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prospec-queue-')));
  queueDir = path.join(root, 'queue');
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

const statePath = (): string => path.join(queueDir, TEST_QUEUE_STATE_FILE);
const mutexPath = (): string => path.join(queueDir, TEST_QUEUE_MUTEX);
const guardPath = (): string => path.join(queueDir, TEST_QUEUE_GUARD);
const readState = (): TestQueueState => JSON.parse(fs.readFileSync(statePath(), 'utf8')) as TestQueueState;
const writeState = (next: number, ...tickets: TestQueueTicket[]): void => {
  fs.mkdirSync(queueDir, { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify({ version: 1, next, tickets }));
};

/** A probe over a scripted set of live pids; start readings are a constant, so a live pid is `alive`. */
function scripted(live: Set<number>): ProcessProbe {
  return {
    platform: 'linux',
    exists: (pid) => live.has(Math.abs(pid)),
    ps: (pid) => (live.has(pid) ? 'S started' : null),
    signal: (pid) => { live.delete(Math.abs(pid)); },
    taskkill: () => {},
  };
}

const holder = (seq: number, key: string, over: Partial<HoldingTicket> = {}): HoldingTicket => ({
  seq, key, label: `label ${key}`, worktree: '/other', host: HOST, lease_ms: 300_000, heartbeat_ms: 0, state: 'holding',
  token: `token-${seq}`, holder: { pid: 4000 + seq, started: 'started' }, granted_at_ms: 1_000, phase: 'running', deadline_ms: Number.MAX_SAFE_INTEGER, trees: [], ...over,
});

const base = (over: Partial<TestQueueRequest> = {}): TestQueueRequest => ({
  cwd: root, queueDir, key: 'k1', label: 'record-tests one', worktree: root, waitMs: 0, leaseMs: 300_000,
  host: HOST, env: {}, probe: scripted(new Set([process.pid])),
  limits: { pollMs: 20, mutexWaitMs: 300 },
  ...over,
});

describe('resolveTestQueueRoot (REQ-LIB-113)', () => {
  it('resolves one directory under the git common dir for every worktree of a repository', () => {
    const repo = path.join(root, 'repo');
    const linked = path.join(root, 'linked');
    const git = (cwd: string, ...args: string[]): void => { execFileSync('git', args, { cwd, stdio: 'pipe' }); };
    fs.mkdirSync(repo);
    git(repo, 'init', '-q');
    git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
    git(repo, 'worktree', 'add', '-q', linked, '-b', 'side');
    // The native form is what git prints: on Windows a temp directory is often reached through
    // an 8.3 short name, which only the native realpath expands.
    const expected = path.join(fs.realpathSync.native(path.join(repo, '.git')), 'prospec', 'test-queue');
    expect(resolveTestQueueRoot(repo)).toBe(expected);
    expect(resolveTestQueueRoot(linked)).toBe(expected);
  });
});

describe('withTestQueue — acquiring and releasing (REQ-LIB-113)', () => {
  it('grants an empty queue, runs the body, and leaves no ticket and no mutex behind', async () => {
    const seen: TestQueueState[] = [];
    const out = await withTestQueue(base(), async () => { seen.push(readState()); return 'done'; });
    expect(out).toEqual({ kind: 'ran', value: 'done' });
    expect(seen[0]!.tickets).toHaveLength(1);
    expect(seen[0]!.tickets[0]).toMatchObject({ state: 'holding', key: 'k1', label: 'record-tests one', phase: 'preparing', holder: { pid: process.pid } });
    expect(readState().tickets).toEqual([]);
    expect(fs.existsSync(mutexPath())).toBe(false);
  });

  it('releases the turn when the body throws, and rethrows', async () => {
    await expect(withTestQueue(base(), async () => { throw new Error('body failed'); })).rejects.toThrow('body failed');
    expect(readState().tickets).toEqual([]);
  });

  it('rethrows the body\'s own error when the release after it fails too', async () => {
    const act = withTestQueue(base(), async () => { fs.writeFileSync(statePath(), '{broken'); throw new Error('body failed'); });
    await expect(act).rejects.toThrow(/^body failed$/);
  });

  it('returns busy after one attempt when the wait cap is 0, without calling the body', async () => {
    writeState(2, holder(1, 'other'));
    const body = vi.fn();
    const out = await withTestQueue(base({ probe: scripted(new Set([process.pid, 4001])) }), body);
    expect(body).not.toHaveBeenCalled();
    expect(out).toEqual({
      kind: 'busy',
      busy: {
        seq: 2, ahead: 1, queue_dir: queueDir, lease_ms: 300_000,
        holder: { label: 'label other', worktree: '/other', host: HOST, granted_at_ms: 1_000, other_host: false, holder_gone: false },
      },
    });
    expect(readState().tickets.map((t) => `${t.seq}:${t.state}`)).toEqual(['1:holding', '2:waiting']);
  });

  it('gives a re-run its own ticket behind what its killed predecessor left running under the same key', async () => {
    const left = { kind: 'process-group' as const, pid: 5001, started: 'started' };
    writeState(2, holder(1, 'k1', { trees: [left] }));
    const request = base({ probe: scripted(new Set([process.pid, 5001])) });
    const out = await withTestQueue(request, vi.fn());
    expect(out).toMatchObject({ kind: 'busy', busy: { seq: 2, ahead: 1, holder: { holder_gone: true } } });
    expect(readState().tickets.map((t) => `${t.seq}:${t.key}:${t.state}`)).toEqual(['1:k1:holding', '2:k1:waiting']);
    expect(await withTestQueue(request, vi.fn())).toMatchObject({ kind: 'busy', busy: { seq: 2, ahead: 1 } });
  });

  it('reports a holder of another host and never takes its turn', async () => {
    writeState(2, holder(1, 'other', { host: 'elsewhere', deadline_ms: 0 }));
    const out = await withTestQueue(base(), vi.fn());
    expect(out.kind === 'busy' && out.busy.holder).toMatchObject({ host: 'elsewhere', other_host: true, holder_gone: false });
  });

  it('runs a request that passes no limits under the limits of the contract', async () => {
    expect(DEFAULT_TEST_QUEUE_LIMITS).toEqual({ prepareLimitMs: 600_000, deadlineGraceMs: 60_000, mutexWaitMs: 10_000, pollMs: 1_000 });
    let prepare: number | undefined;
    await withTestQueue(base({ limits: undefined }), async () => {
      const ticket = readState().tickets[0] as HoldingTicket;
      prepare = ticket.deadline_ms - ticket.granted_at_ms;
    });
    expect(prepare).toBe(600_000);
  });

  it('polls until the wait cap, refreshing its heartbeat, then returns busy with its number kept', async () => {
    writeState(2, holder(1, 'other'));
    const onWait = vi.fn();
    const started = Date.now();
    let reads = 0;
    const now = (): number => { reads++; return Date.now(); };
    const first = await withTestQueue(base({ waitMs: 150, probe: scripted(new Set([process.pid, 4001])), onWait, now }), vi.fn());
    expect(Date.now() - started).toBeGreaterThanOrEqual(150);
    // One transaction per poll interval (20 ms here), not a tight loop.
    expect(reads).toBeGreaterThanOrEqual(3);
    expect(reads).toBeLessThanOrEqual(10);
    expect(onWait).toHaveBeenCalledTimes(1);
    expect(onWait.mock.calls[0]![0]).toMatchObject({ seq: 2, ahead: 1, holder: { label: 'label other' } });
    const heartbeat = readState().tickets[1]!.heartbeat_ms;
    expect(heartbeat).toBeGreaterThanOrEqual(started + 100);
    // Re-running the same request resumes the same ticket.
    const again = await withTestQueue(base({ probe: scripted(new Set([process.pid, 4001])) }), vi.fn());
    expect(first.kind === 'busy' && again.kind === 'busy' && again.busy.seq === first.busy.seq).toBe(true);
    expect(readState().next).toBe(3);
  });

  it('takes the turn while waiting once the holder and its trees are gone', async () => {
    const live = new Set([process.pid, 4001]);
    writeState(2, holder(1, 'other'));
    setTimeout(() => live.delete(4001), 80);
    const out = await withTestQueue(base({ waitMs: 5_000, probe: scripted(live) }), async () => readState().tickets.map((t) => `${t.seq}:${t.key}:${t.state}`));
    expect(out).toEqual({ kind: 'ran', value: ['2:k1:holding'] });
  });

  it('uses limits passed in the request in place of the defaults', async () => {
    const out = await withTestQueue(base({ now: () => 10_000, limits: { prepareLimitMs: 1_234 } }), async () => readState().tickets[0] as HoldingTicket);
    expect(out.kind === 'ran' && out.value.deadline_ms).toBe(11_234);
  });
});

describe('withTestQueue — the mutex and the state file (REQ-LIB-113)', () => {
  const owner = (pid: number): string => JSON.stringify({ pid, host: HOST, token: 'stale-owner' });

  it('removes a mutex whose owner pid is gone, inside a guard it then removes', async () => {
    fs.mkdirSync(queueDir, { recursive: true });
    fs.writeFileSync(mutexPath(), owner(4999));
    const out = await withTestQueue(base(), async () => 'ran');
    expect(out).toEqual({ kind: 'ran', value: 'ran' });
    expect(fs.existsSync(mutexPath())).toBe(false);
    expect(fs.existsSync(guardPath())).toBe(false);
  });

  it('removes a mutex whose owner is a zombie: it still answers signal 0 but will never release', async () => {
    fs.mkdirSync(queueDir, { recursive: true });
    fs.writeFileSync(mutexPath(), owner(4994));
    const live = new Set([process.pid, 4994]);
    const probe: ProcessProbe = { ...scripted(live), ps: (pid) => (pid === 4994 ? 'Z started' : live.has(pid) ? 'S started' : null) };
    const out = await withTestQueue(base({ probe }), async () => 'ran');
    expect(out).toEqual({ kind: 'ran', value: 'ran' });
    expect(fs.existsSync(mutexPath())).toBe(false);
    expect(fs.existsSync(guardPath())).toBe(false);
  });

  it('refuses with the mutex path, the guard path and the owner when a live owner keeps the mutex', async () => {
    fs.mkdirSync(queueDir, { recursive: true });
    fs.writeFileSync(mutexPath(), owner(4998));
    const body = vi.fn();
    const act = withTestQueue(base({ probe: scripted(new Set([process.pid, 4998])) }), body);
    await expect(act).rejects.toThrow(TestQueueUnavailable);
    await expect(act).rejects.toThrow(mutexPath());
    await expect(act).rejects.toThrow(guardPath());
    await expect(act).rejects.toThrow('4998');
    expect(body).not.toHaveBeenCalled();
    expect(fs.readFileSync(mutexPath(), 'utf8')).toBe(owner(4998));
  });

  it('leaves an existing guard in place and refuses rather than remove the stale mutex without it', async () => {
    fs.mkdirSync(guardPath(), { recursive: true });
    fs.writeFileSync(mutexPath(), owner(4997));
    await expect(withTestQueue(base(), vi.fn())).rejects.toThrow(TestQueueUnavailable);
    expect(fs.existsSync(guardPath())).toBe(true);
    expect(fs.readFileSync(mutexPath(), 'utf8')).toBe(owner(4997));
  });

  it('leaves a mutex that changed owner between the stale reading and the guarded re-read', async () => {
    fs.mkdirSync(queueDir, { recursive: true });
    fs.writeFileSync(mutexPath(), owner(4995));
    const fresh = JSON.stringify({ pid: 5000, host: HOST, token: 'fresh-owner' });
    const live = new Set([process.pid, 5000]);
    // Another remover replaced the stale mutex with its own right after this caller read it.
    const probe: ProcessProbe = {
      ...scripted(live),
      exists: (pid) => { if (pid === 4995) fs.writeFileSync(mutexPath(), fresh); return live.has(Math.abs(pid)); },
    };
    const body = vi.fn();
    await expect(withTestQueue(base({ probe }), body)).rejects.toThrow(TestQueueUnavailable);
    expect(body).not.toHaveBeenCalled();
    expect(fs.readFileSync(mutexPath(), 'utf8')).toBe(fresh);
    expect(fs.existsSync(guardPath())).toBe(false);
  });

  it('leaves a mutex whose owner cannot be read, and refuses', async () => {
    fs.mkdirSync(queueDir, { recursive: true });
    fs.writeFileSync(mutexPath(), '{not json');
    await expect(withTestQueue(base(), vi.fn())).rejects.toThrow('an unreadable owner');
    expect(fs.readFileSync(mutexPath(), 'utf8')).toBe('{not json');
    expect(fs.existsSync(guardPath())).toBe(false);
  });

  it('does not remove a mutex that is no longer its own when its transaction ends', async () => {
    const foreign = JSON.stringify({ pid: process.pid, host: HOST, token: 'someone-else' });
    let replaced = false;
    // The clock is read inside the transaction: the mutex changes hands while this caller is in it.
    const now = (): number => { if (!replaced) { replaced = true; fs.writeFileSync(mutexPath(), foreign); } return Date.now(); };
    const out = await withTestQueue(base({ now }), async () => 'ran');
    expect(out).toMatchObject({ kind: 'ran', value: 'ran' });
    expect(out.kind === 'ran' && out.warning).toContain('not released');
    expect(fs.readFileSync(mutexPath(), 'utf8')).toBe(foreign);
  });

  it('never removes the mutex of an owner on another host', async () => {
    fs.mkdirSync(queueDir, { recursive: true });
    fs.writeFileSync(mutexPath(), JSON.stringify({ pid: 4996, host: 'elsewhere', token: 'x' }));
    await expect(withTestQueue(base(), vi.fn())).rejects.toThrow(TestQueueUnavailable);
    expect(fs.existsSync(mutexPath())).toBe(true);
  });

  it.each([
    ['unparsable JSON', '{not json'],
    ['an unknown version', JSON.stringify({ version: 2, next: 1, tickets: [] })],
    ['an undeclared field', JSON.stringify({ version: 1, next: 1, tickets: [], extra: 1 })],
  ])('refuses a state file holding %s, naming it, and runs nothing', async (_label, content) => {
    fs.mkdirSync(queueDir, { recursive: true });
    fs.writeFileSync(statePath(), content);
    const body = vi.fn();
    const act = withTestQueue(base(), body);
    await expect(act).rejects.toThrow(TestQueueUnavailable);
    await expect(act).rejects.toThrow(statePath());
    expect(body).not.toHaveBeenCalled();
    expect(fs.readFileSync(statePath(), 'utf8')).toBe(content);
    expect(fs.existsSync(mutexPath())).toBe(false);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('refuses a queue directory it cannot write', async () => {
    fs.mkdirSync(queueDir, { recursive: true });
    fs.chmodSync(queueDir, 0o500);
    try {
      const act = withTestQueue(base(), vi.fn());
      await expect(act).rejects.toThrow(TestQueueUnavailable);
      await expect(act).rejects.toThrow(queueDir);
    } finally {
      fs.chmodSync(queueDir, 0o700);
    }
  });

  it('kills what is still registered before it removes the ticket, inside the same transaction', async () => {
    const live = new Set([process.pid, 777]);
    const atKill: Array<{ pid: number; tickets: number; mutexHeld: boolean }> = [];
    const probe: ProcessProbe = {
      ...scripted(live),
      // The state file and the mutex as they are at the moment the kill is issued.
      signal: (pid) => { atKill.push({ pid, tickets: readState().tickets.length, mutexHeld: fs.existsSync(mutexPath()) }); live.delete(Math.abs(pid)); },
    };
    const out = await withTestQueue(base({ probe }), async () => {
      const state = readState();
      (state.tickets[0] as HoldingTicket).trees = [{ kind: 'process-group', pid: 777, started: 'started' }];
      fs.writeFileSync(statePath(), JSON.stringify(state));
      return 'done';
    });
    expect(out).toEqual({ kind: 'ran', value: 'done' });
    expect(atKill).toEqual([{ pid: -777, tickets: 1, mutexHeld: true }]);
    expect(readState().tickets).toEqual([]);
  });

  it('hands the runner the request\'s probe with the hooks of a run', async () => {
    const probe = scripted(new Set([process.pid]));
    let handed: ProcessProbe | undefined;
    await withTestQueue(base({ probe }), (session) => session.run(1_000, async (hooks) => {
      handed = hooks.processProbe;
      return { command: 'suite', exit_code: 0, timed_out: false, timeout_ms: 1_000 };
    }));
    expect(handed).toBe(probe);
  });

  it('reports a failed release as a warning beside the body\'s outcome', async () => {
    const out = await withTestQueue(base(), async () => { fs.writeFileSync(statePath(), '{broken'); return 'value'; });
    expect(out).toMatchObject({ kind: 'ran', value: 'value' });
    expect(out.kind === 'ran' && out.warning).toContain(statePath());
  });
});

const posix = describe.skipIf(process.platform === 'win32');
const NODE = process.execPath;
const sleeper = `${NODE} -e setTimeout(()=>{},60000)`;
const settle = (ms = 150): Promise<void> => new Promise((r) => setTimeout(r, ms));

posix('withTestQueue — running a command under the turn (REQ-LIB-113, REQ-TESTS-149)', () => {
  const real = (): Partial<TestQueueRequest> => ({ probe: defaultProcessProbe(), host: os.hostname() });

  it('enters spawning with the run\'s deadline, passes the token to the command and registers its tree', async () => {
    const observed: { ticket?: HoldingTicket; env?: string; tree?: ProcessTree } = {};
    const out = await withTestQueue(base({ ...real(), now: undefined }), async (session) => session.run(5_000, async (hooks) => (
      runTestCommand(root, `${NODE} -e setTimeout(()=>{},300)`, 5_000, undefined, {
        ...hooks,
        onSpawn: async (tree) => {
          await hooks.onSpawn!(tree);
          observed.tree = tree;
          observed.ticket = readState().tickets[0] as HoldingTicket;
          observed.env = hooks.env?.[TEST_QUEUE_TOKEN_ENV];
        },
      })
    )));
    expect(out.kind === 'ran' && out.value.exit_code).toBe(0);
    expect(observed.ticket).toMatchObject({ phase: 'running', trees: [observed.tree] });
    expect(observed.env).toBe(observed.ticket!.token);
    const granted = observed.ticket!.granted_at_ms;
    expect(observed.ticket!.deadline_ms).toBeGreaterThanOrEqual(granted + 5_000 + 60_000);
    expect(observed.ticket!.deadline_ms).toBeLessThan(granted + 5_000 + 60_000 + 5_000);
    expect(readState().tickets).toEqual([]);
  });

  it('spawns nothing and reports the run as not started when the turn was lost before spawning', async () => {
    const start = vi.fn();
    const out = await withTestQueue(base(real()), async (session) => {
      writeState(2);
      return session.run(5_000, start);
    });
    expect(start).not.toHaveBeenCalled();
    expect(out.kind === 'ran' && out.value).toMatchObject({ exit_code: null, timed_out: false, queue_abort: 'not-started' });
  });

  it('kills the tree it spawned and reports the run as lost when registering finds the turn gone', async () => {
    let tree: ProcessTree | undefined;
    const out = await withTestQueue(base(real()), async (session) => session.run(60_000, (hooks) => (
      runTestCommand(root, sleeper, 60_000, undefined, {
        ...hooks,
        onSpawn: async (spawned) => { tree = spawned; writeState(2); await hooks.onSpawn!(spawned); },
      })
    )));
    await settle();
    expect(out.kind === 'ran' && out.value).toMatchObject({ exit_code: null, timed_out: false, queue_abort: 'lost' });
    expect(defaultProcessProbe().exists(tree!.pid)).toBe(false);
  });

  it('kills an overdue tree in one transaction, keeps the ticket, and takes the turn at a later poll', async () => {
    const child = spawn(NODE, ['-e', 'setTimeout(()=>{},60000)'], { detached: true, stdio: 'ignore' });
    child.unref();
    await settle(100);
    const orphan = captureTree(child.pid!, defaultProcessProbe());
    writeState(2, holder(1, 'abandoned', { host: os.hostname(), holder: { pid: 2_147_483_600, started: 'gone' }, trees: [orphan], deadline_ms: 0 }));
    const atFirstWait: string[] = [];
    const out = await withTestQueue(
      base({ ...real(), waitMs: 5_000, onWait: () => atFirstWait.push(...readState().tickets.map((t) => `${t.seq}:${t.state}`)) }),
      async () => 'took the turn',
    );
    expect(out).toEqual({ kind: 'ran', value: 'took the turn' });
    // The transaction that killed it wrote the ticket back: removal waited for a later poll.
    expect(atFirstWait).toEqual(['1:holding', '2:waiting']);
    expect(defaultProcessProbe().exists(child.pid!)).toBe(false);
  });

  it('leaves a tree whose identity cannot be confirmed running when its ticket is removed past the deadline', async () => {
    const child = spawn(NODE, ['-e', 'setTimeout(()=>{},60000)'], { detached: true, stdio: 'ignore' });
    child.unref();
    try {
      await settle(100);
      const reused: ProcessTree = { ...captureTree(child.pid!, defaultProcessProbe()), started: 'a different start reading' };
      writeState(2, holder(1, 'abandoned', { host: os.hostname(), holder: { pid: 2_147_483_600, started: 'gone' }, trees: [reused], deadline_ms: 0 }));
      const out = await withTestQueue(base(real()), async () => 'took the turn');
      expect(out).toEqual({ kind: 'ran', value: 'took the turn' });
      expect(defaultProcessProbe().exists(child.pid!)).toBe(true);
    } finally {
      process.kill(-child.pid!, 'SIGKILL');
    }
  });

  it('runs a re-entrant request at once, registers its tree under the holder, and sends no release', async () => {
    const snapshots: Array<{ trees: number; phase: string }> = [];
    const out = await withTestQueue(base(real()), async (session) => {
      const inner = await withTestQueue(
        base({ ...real(), key: 'nested', env: { [TEST_QUEUE_TOKEN_ENV]: session.token } }),
        async (nested) => nested.run(5_000, (hooks) => runTestCommand(root, `${NODE} -e setTimeout(()=>{},200)`, 5_000, undefined, {
          ...hooks,
          onSpawn: async (tree) => {
            await hooks.onSpawn!(tree);
            const ticket = readState().tickets[0] as HoldingTicket;
            snapshots.push({ trees: ticket.trees.length, phase: ticket.phase });
          },
        })),
      );
      const after = readState().tickets[0] as HoldingTicket;
      return { inner, tickets: readState().tickets.length, treesAfter: after.trees.length, phaseAfter: after.phase };
    });
    expect(out.kind === 'ran' && out.value.inner).toMatchObject({ kind: 'ran', value: { exit_code: 0 } });
    // Registered while it ran without moving the holder's phase; unregistered afterwards; the turn was still held.
    expect(snapshots).toEqual([{ trees: 1, phase: 'preparing' }]);
    expect(out.kind === 'ran' && out.value).toMatchObject({ tickets: 1, treesAfter: 0, phaseAfter: 'preparing' });
  });

  it('kills a nested tree that is still alive before the turn is released', async () => {
    let nestedTree: ProcessTree | undefined;
    let nested: Promise<unknown> | undefined;
    const actual = defaultProcessProbe();
    const ticketsAtKill: number[] = [];
    // The holder's probe records how many tickets the queue holds when it kills the nested group.
    const observing: ProcessProbe = { ...actual, signal: (pid, signal) => { if (pid === -(nestedTree?.pid ?? 0)) ticketsAtKill.push(readState().tickets.length); actual.signal(pid, signal); } };
    const out = await withTestQueue(base({ ...real(), probe: observing }), async (session) => {
      nested = withTestQueue(
        base({ ...real(), key: 'nested', env: { [TEST_QUEUE_TOKEN_ENV]: session.token } }),
        async (inner) => inner.run(60_000, (hooks) => runTestCommand(root, sleeper, 60_000, undefined, {
          ...hooks,
          onSpawn: async (tree) => { await hooks.onSpawn!(tree); nestedTree = tree; },
        })),
      );
      for (let i = 0; i < 100 && nestedTree === undefined; i++) await settle(20);
      // The holder's own run ends here (as after its timeout) while the nested command still runs.
      return 'holder done';
    });
    await nested;
    await settle();
    expect(out).toEqual({ kind: 'ran', value: 'holder done' });
    expect(ticketsAtKill).toEqual([1]);
    expect(defaultProcessProbe().exists(nestedTree!.pid)).toBe(false);
    expect(readState().tickets).toEqual([]);
  });
});
