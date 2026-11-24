import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TestQueueUnavailable } from '../types/errors.js';
import {
  EMPTY_TEST_QUEUE_STATE,
  TEST_QUEUE_DEADLINE_GRACE_MS,
  TEST_QUEUE_MUTEX_WAIT_MS,
  TEST_QUEUE_POLL_MS,
  TEST_QUEUE_PREPARE_LIMIT_MS,
  TEST_QUEUE_TOKEN_ENV,
  TestQueueStateSchema,
  type ProcessTree,
  type TestQueueBusy,
  type TestQueueState,
  type TestQueueWaitInfo,
} from '../types/test-queue.js';
import { atomicWrite, createFileExclusive } from './fs-utils.js';
import { gitRead } from './git-read.js';
import {
  captureIdentity,
  defaultProcessProbe,
  holderStatus,
  killTreeIfAlive,
  treeStatus,
  type ProcessProbe,
} from './process-tree.js';
import {
  decideAcquire,
  decideRegister,
  decideRelease,
  decideSpawn,
  decideUnregister,
  describeHolder,
  type QueueFacts,
} from './test-queue-engine.js';
import type { RunHooks, TestRunResult } from './test-runner.js';

/**
 * Test queue store and turn lifecycle (REQ-LIB-113): one queue per git repository,
 * shared by every worktree, in which each state change is a read, an engine decision
 * (REQ-LIB-112) and a write inside a mutex. `withTestQueue` is the single
 * acquire → run → release path of both entries.
 */

export const TEST_QUEUE_STATE_FILE = 'state.json';
export const TEST_QUEUE_MUTEX = 'mutex';
export const TEST_QUEUE_GUARD = 'mutex.guard';
const MUTEX_RETRY_MS = 15;

export interface TestQueueLimits {
  prepareLimitMs: number;
  deadlineGraceMs: number;
  mutexWaitMs: number;
  pollMs: number;
}

/** What a request that passes no `limits` runs under — the two CLI entries pass none. */
export const DEFAULT_TEST_QUEUE_LIMITS: TestQueueLimits = {
  prepareLimitMs: TEST_QUEUE_PREPARE_LIMIT_MS,
  deadlineGraceMs: TEST_QUEUE_DEADLINE_GRACE_MS,
  mutexWaitMs: TEST_QUEUE_MUTEX_WAIT_MS,
  pollMs: TEST_QUEUE_POLL_MS,
};

export type { TestQueueWaitInfo };

export interface TestQueueRequest {
  /** A directory inside the repository whose queue is used. */
  cwd: string;
  key: string;
  label: string;
  worktree: string;
  waitMs: number;
  leaseMs: number;
  /** Called once, when the request first has to wait. */
  onWait?: (info: TestQueueWaitInfo) => void;
  /** Replace the defaults of REQ-TYPES-119 for this call. The two entries pass none. */
  limits?: Partial<TestQueueLimits>;
  /** Injection seams: the environment the token is read from, the process probe, the host
   *  name, the clock and the queue directory. */
  env?: NodeJS.ProcessEnv;
  probe?: ProcessProbe;
  host?: string;
  now?: (() => number) | undefined;
  queueDir?: string;
}

export interface TestQueueSession {
  /** The token of the turn this session runs under. */
  token: string;
  /**
   * Run one command under the turn. `start` receives the hooks the runner must be given:
   * the child environment carrying the token, and the spawn hook that records the tree.
   */
  run(timeoutMs: number, start: (hooks: RunHooks) => Promise<TestRunResult>): Promise<TestRunResult>;
}

export type TestQueueOutcome<T> =
  | { kind: 'ran'; value: T; warning?: string }
  | { kind: 'busy'; busy: TestQueueBusy };

/** The queue directory of the repository `cwd` belongs to: the same real path from every worktree. */
export function resolveTestQueueRoot(cwd: string): string {
  const commonDir = gitRead(cwd, 'rev-parse', ['--path-format=absolute', '--git-common-dir']).replace(/\r?\n$/, '');
  return path.join(fs.realpathSync(commonDir), 'prospec', 'test-queue');
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

interface Context {
  dir: string;
  host: string;
  probe: ProcessProbe;
  now: () => number;
  limits: TestQueueLimits;
}

interface MutexOwner {
  pid: number;
  host: string;
  token: string;
}

function readOwner(file: string): MutexOwner | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<MutexOwner>;
    return typeof parsed.pid === 'number' && typeof parsed.host === 'string' && typeof parsed.token === 'string'
      ? { pid: parsed.pid, host: parsed.host, token: parsed.token }
      : null;
  } catch {
    return null;
  }
}

/** Take the mutex, run `critical`, release it. Never waits past the mutex limit. */
async function withMutex<T>(ctx: Context, critical: () => Promise<T>): Promise<T> {
  const mutex = path.join(ctx.dir, TEST_QUEUE_MUTEX);
  const guard = path.join(ctx.dir, TEST_QUEUE_GUARD);
  const token = randomUUID();
  const started = Date.now();
  for (;;) {
    try {
      createFileExclusive(mutex, JSON.stringify({ pid: process.pid, host: ctx.host, token } satisfies MutexOwner));
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw new TestQueueUnavailable(mutex, `cannot create the mutex (${message(error)})`);
      }
    }
    const owner = readOwner(mutex);
    // No start reading is kept for a mutex owner, so the only status that can be proved is
    // `gone`: the pid does not exist, or it is a zombie that will never release.
    if (owner !== null && owner.host === ctx.host && holderStatus({ pid: owner.pid, started: null }, ctx.probe) === 'gone') {
      // The owner died inside the critical section. Removal is serialized by a guard that
      // is itself never removed for another process: whoever holds it re-reads the mutex,
      // so a mutex another remover already replaced is left alone.
      let guarded = false;
      try {
        fs.mkdirSync(guard);
        guarded = true;
        const again = readOwner(mutex);
        if (again !== null && again.token === owner.token) fs.unlinkSync(mutex);
      } catch {
        // The guard exists, or the mutex changed under us: retry within the limit.
      } finally {
        if (guarded) fs.rmdirSync(guard);
      }
      if (guarded) continue;
    }
    if (Date.now() - started >= ctx.limits.mutexWaitMs) {
      const held = owner === null ? 'an unreadable owner' : `pid ${owner.pid} on host ${owner.host}`;
      throw new TestQueueUnavailable(
        mutex,
        `the mutex stayed held by ${held} for ${ctx.limits.mutexWaitMs} ms (guard: ${guard})`,
        'If no prospec process of this repository is running, remove the mutex file and the guard directory, then re-run',
      );
    }
    await sleep(MUTEX_RETRY_MS);
  }
  try {
    return await critical();
  } finally {
    if (readOwner(mutex)?.token === token) fs.rmSync(mutex, { force: true });
  }
}

function readState(file: string): TestQueueState {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY_TEST_QUEUE_STATE;
    throw new TestQueueUnavailable(file, `cannot read the queue state (${message(error)})`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new TestQueueUnavailable(file, `the queue state is not valid JSON (${message(error)})`);
  }
  const state = TestQueueStateSchema.safeParse(parsed);
  if (!state.success) {
    throw new TestQueueUnavailable(file, 'the queue state has an unknown version or shape — it may come from another prospec version');
  }
  return state.data;
}

interface Decided<D> {
  state: TestQueueState;
  decision: D;
  overdue: ProcessTree[];
}

/** One state change: read, decide, kill what the decision lists as overdue, write. */
async function transactQueue<D>(ctx: Context, decide: (state: TestQueueState, facts: QueueFacts) => Decided<D>): Promise<{ decision: D; facts: QueueFacts }> {
  try {
    fs.mkdirSync(ctx.dir, { recursive: true });
  } catch (error) {
    throw new TestQueueUnavailable(ctx.dir, `cannot create the queue directory (${message(error)})`);
  }
  return withMutex(ctx, async () => {
    const file = path.join(ctx.dir, TEST_QUEUE_STATE_FILE);
    const state = readState(file);
    const facts: QueueFacts = {
      now: ctx.now(),
      host: ctx.host,
      holderStatus: (identity) => holderStatus(identity, ctx.probe),
      treeStatus: (tree) => treeStatus(tree, ctx.probe),
    };
    const outcome = decide(state, facts);
    // Kills are issued here, inside the mutex and before the write. An overdue ticket stays
    // as decided: a kill is asynchronous, so its tree is judged again at the caller's next
    // poll rather than assumed gone here.
    for (const tree of outcome.overdue) killTreeIfAlive(tree, ctx.probe);
    if (JSON.stringify(outcome.state) !== JSON.stringify(state)) {
      try {
        await atomicWrite(file, `${JSON.stringify(outcome.state)}\n`);
      } catch (error) {
        throw new TestQueueUnavailable(file, `cannot write the queue state (${message(error)})`);
      }
    }
    return { decision: outcome.decision, facts };
  });
}

const aborted = (timeoutMs: number, reason: 'not-started' | 'lost'): TestRunResult => ({
  command: '', exit_code: null, timed_out: false, timeout_ms: timeoutMs, queue_abort: reason,
});

function session(ctx: Context, env: NodeJS.ProcessEnv, token: string, reentrant: boolean): TestQueueSession {
  return {
    token,
    run: async (timeoutMs, start) => {
      if (!reentrant) {
        const entered = await transactQueue(ctx, (state, facts) => decideSpawn(state, { token, deadline_ms: facts.now + timeoutMs + ctx.limits.deadlineGraceMs }, facts));
        if (entered.decision === 'lost') return aborted(timeoutMs, 'not-started');
      }
      let registered: ProcessTree | undefined;
      const result = await start({
        env: { ...env, [TEST_QUEUE_TOKEN_ENV]: token },
        processProbe: ctx.probe,
        onSpawn: async (tree) => {
          const r = await transactQueue(ctx, (state, facts) => decideRegister(state, { token, tree, reentrant }, facts));
          if (r.decision === 'lost') throw new Error('the test queue turn was lost');
          registered = tree;
        },
      });
      if (reentrant && registered !== undefined) {
        const tree = registered;
        await transactQueue(ctx, (state, facts) => decideUnregister(state, { token, tree }, facts));
      }
      // The runner killed the tree when the spawn hook rejected: the turn was gone.
      return result.hook_error === undefined ? result : { ...result, queue_abort: 'lost' };
    },
  };
}

/**
 * Take the repository's test queue turn, run `body` under it, release it. When the turn
 * is not granted within the wait cap, `body` is not called and the outcome is `busy`.
 */
export async function withTestQueue<T>(request: TestQueueRequest, body: (session: TestQueueSession) => Promise<T>): Promise<TestQueueOutcome<T>> {
  const env = request.env ?? process.env;
  const ctx: Context = {
    dir: request.queueDir ?? resolveTestQueueRoot(request.cwd),
    host: request.host ?? os.hostname(),
    probe: request.probe ?? defaultProcessProbe(),
    now: request.now ?? Date.now,
    limits: { ...DEFAULT_TEST_QUEUE_LIMITS, ...request.limits },
  };
  const acquire = {
    key: request.key,
    label: request.label,
    worktree: request.worktree,
    lease_ms: request.leaseMs,
    holder: captureIdentity(process.pid, ctx.probe),
    new_token: randomUUID(),
    prepare_limit_ms: ctx.limits.prepareLimitMs,
    ...(env[TEST_QUEUE_TOKEN_ENV] === undefined ? {} : { token: env[TEST_QUEUE_TOKEN_ENV] }),
  };
  const started = Date.now();
  let announced = false;
  for (;;) {
    const { decision, facts } = await transactQueue(ctx, (state, f) => decideAcquire(state, acquire, f));
    if (decision.kind === 'reentrant') {
      return { kind: 'ran', value: await body(session(ctx, env, decision.token, true)) };
    }
    if (decision.kind === 'granted') {
      const token = decision.token;
      // What the release decision still lists was left running under this turn — a nested
      // command, typically. It joins the trees the transaction kills before it writes, so
      // the kill is issued while the ticket is still in the state file and the mutex held:
      // no waiter can be granted the turn in between.
      const release = async (): Promise<string | undefined> => {
        try {
          await transactQueue(ctx, (state, f) => {
            const released = decideRelease(state, { token }, f);
            return released.decision === 'lost' ? released : { ...released, overdue: [...released.overdue, ...released.decision.trees] };
          });
          return undefined;
        } catch (error) {
          return `test queue turn not released: ${message(error)}`;
        }
      };
      let value: T;
      try {
        value = await body(session(ctx, env, token, false));
      } catch (error) {
        await release();
        throw error;
      }
      const warning = await release();
      return { kind: 'ran', value, ...(warning === undefined ? {} : { warning }) };
    }
    const info: TestQueueWaitInfo = {
      seq: decision.seq,
      ahead: decision.ahead,
      ...(decision.holder === undefined ? {} : { holder: describeHolder(decision.holder, facts) }),
    };
    if (!announced) {
      announced = true;
      request.onWait?.(info);
    }
    if (Date.now() - started >= request.waitMs) {
      return { kind: 'busy', busy: { ...info, queue_dir: ctx.dir, lease_ms: request.leaseMs } };
    }
    await sleep(ctx.limits.pollMs);
  }
}
