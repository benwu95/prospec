import { spawn, spawnSync } from 'node:child_process';
import type { ProcessIdentity, ProcessStatus, ProcessTree } from '../types/test-queue.js';

/**
 * Process-tree runner (REQ-LIB-114): runs one command without a shell and owns its
 * timeout, its interruption and the reach of its kills.
 *
 * Another process may outlive the one that spawned a tree and later be asked whether
 * that tree still runs, or to kill it. A pid alone cannot answer that: it is reused. So a
 * process is remembered as its pid plus the start reading the OS reports for it, and a
 * status is one of three — `gone`, `alive` (same pid, same reading) or `unknown`. Only
 * `alive` licenses a kill by a process that did not spawn the tree; every doubt reads as
 * `unknown`, which costs waiting and never a wrong kill.
 */

/** The platform facts the status rules are decided from — injected, so the win32 branch
 *  and every status combination are provable from any host. */
export interface ProcessProbe {
  platform: string;
  /** Signal 0: does this pid — or, for a negative pid, any member of that process group — exist? */
  exists(pid: number): boolean;
  /** `ps -o stat= -o lstart=` for one pid: the state token then the start text, or null when it cannot be read. */
  ps(pid: number): string | null;
  signal(pid: number, signal: NodeJS.Signals): void;
  taskkill(pid: number): void;
}

const READ_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
export type InterruptSignal = (typeof READ_SIGNALS)[number];
const KILL_SIGNAL = 'SIGKILL';
const PS_TIMEOUT_MS = 5_000;

export function defaultProcessProbe(platform: string = process.platform): ProcessProbe {
  return {
    platform,
    exists: (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        // EPERM: it exists and belongs to someone else.
        return (error as NodeJS.ErrnoException).code === 'EPERM';
      }
    },
    ps: (pid) => {
      // A fixed locale and zone: the text is compared with an earlier reading of the same
      // process, and both vary with the caller's environment otherwise.
      const res = spawnSync('ps', ['-o', 'stat=', '-o', 'lstart=', '-p', String(pid)], {
        encoding: 'utf8',
        env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
        timeout: PS_TIMEOUT_MS,
      });
      if (res.status !== 0 || typeof res.stdout !== 'string') return null;
      const line = res.stdout.trim().replace(/\s+/g, ' ');
      return line === '' ? null : line;
    },
    signal: (pid, signal) => {
      try {
        process.kill(pid, signal);
      } catch {
        // Already gone, or not ours to signal: there is nothing left to do either way.
      }
    },
    taskkill: (pid) => {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', timeout: PS_TIMEOUT_MS });
    },
  };
}

interface Reading {
  exists: boolean;
  zombie: boolean;
  started: string | null;
}

function read(pid: number, probe: ProcessProbe): Reading {
  if (!probe.exists(pid)) return { exists: false, zombie: false, started: null };
  if (probe.platform === 'win32') return { exists: true, zombie: false, started: null };
  const line = probe.ps(pid);
  if (line === null) return { exists: true, zombie: false, started: null };
  const space = line.indexOf(' ');
  const state = space === -1 ? line : line.slice(0, space);
  const started = space === -1 ? '' : line.slice(space + 1);
  return { exists: true, zombie: state.startsWith('Z'), started: started === '' ? null : started };
}

const sameStart = (recorded: string | null, fresh: string | null): boolean =>
  recorded !== null && fresh !== null && recorded === fresh;

export function captureIdentity(pid: number, probe: ProcessProbe = defaultProcessProbe()): ProcessIdentity {
  return { pid, started: read(pid, probe).started };
}

export function captureTree(pid: number, probe: ProcessProbe = defaultProcessProbe()): ProcessTree {
  return { kind: probe.platform === 'win32' ? 'process' : 'process-group', ...captureIdentity(pid, probe) };
}

export function holderStatus(identity: ProcessIdentity, probe: ProcessProbe = defaultProcessProbe()): ProcessStatus {
  const now = read(identity.pid, probe);
  if (!now.exists || now.zombie) return 'gone';
  return sameStart(identity.started, now.started) ? 'alive' : 'unknown';
}

export function treeStatus(tree: ProcessTree, probe: ProcessProbe = defaultProcessProbe()): ProcessStatus {
  if (tree.kind === 'process') return holderStatus(tree, probe);
  const leader = read(tree.pid, probe);
  if (!leader.exists) return probe.exists(-tree.pid) ? 'unknown' : 'gone';
  return !leader.zombie && sameStart(tree.started, leader.started) ? 'alive' : 'unknown';
}

/** Kill a tree unconditionally — for the process that spawned it, whose unreaped child
 *  still owns the pid, or after `killTreeIfAlive` has just confirmed the identity. */
export function killTree(tree: ProcessTree, probe: ProcessProbe = defaultProcessProbe()): void {
  if (tree.kind === 'process-group') {
    probe.signal(-tree.pid, KILL_SIGNAL);
    return;
  }
  probe.taskkill(tree.pid);
  probe.signal(tree.pid, KILL_SIGNAL);
}

/** The only kill a process may issue against a tree it did not spawn. */
export function killTreeIfAlive(tree: ProcessTree, probe: ProcessProbe = defaultProcessProbe()): boolean {
  if (treeStatus(tree, probe) !== 'alive') return false;
  killTree(tree, probe);
  return true;
}

export interface ProcessRunOptions {
  cwd: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
  /** Receives the spawned tree before the runner waits for the exit. A rejection kills
   *  the tree and is reported as `hook_error`. */
  onSpawn?: (tree: ProcessTree) => void | Promise<void>;
  probe?: ProcessProbe;
}

export interface ProcessRunResult {
  /** Null when the command produced none: timeout, signal, interruption or spawn failure. */
  exit_code: number | null;
  /** The signal that ended the command, as observed — or SIGKILL for the runner's own timeout kill. */
  signal?: string;
  timed_out: boolean;
  /** The signal the runner itself received and answered by killing the tree. */
  interrupted_by?: InterruptSignal;
  /** The command could not be spawned. */
  error?: string;
  /** `onSpawn` rejected; the tree was killed. */
  hook_error?: string;
}

/**
 * Run `argv` and report how it ended. Output is inherited. The timeout is this
 * function's own verdict: once its timer fires the run is a timeout whatever the killed
 * command reports — a group leader killed with its group reports either the signal or the
 * exit status of a child that died first, so that report cannot decide it.
 */
export function runProcessTree(argv: readonly string[], options: ProcessRunOptions): Promise<ProcessRunResult> {
  const probe = options.probe ?? defaultProcessProbe();
  const [bin, ...args] = argv;
  if (bin === undefined) return Promise.resolve({ exit_code: null, timed_out: false, error: 'empty command' });

  return new Promise<ProcessRunResult>((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        shell: false,
        stdio: 'inherit',
        detached: probe.platform !== 'win32',
      });
    } catch (error) {
      resolve({ exit_code: null, timed_out: false, error: error instanceof Error ? error.message : String(error) });
      return;
    }

    // Spawning is synchronous and `exit`/`error` are delivered on a later turn of the loop,
    // so the tree is captured, and the listeners attached, before either can be missed.
    const tree = child.pid === undefined ? undefined : captureTree(child.pid, probe);
    let timedOut = false;
    let interruptedBy: InterruptSignal | undefined;
    let hookError: string | undefined;
    let hook: Promise<void> = Promise.resolve();
    let settled = false;
    const kill = (): void => { if (tree !== undefined) killTree(tree, probe); };
    const timer = tree === undefined ? undefined : setTimeout(() => {
      timedOut = true;
      kill();
    }, options.timeoutMs);
    const handlers = READ_SIGNALS.map((name) => {
      const handler = (): void => {
        interruptedBy ??= name;
        kill();
      };
      process.on(name, handler);
      return { name, handler };
    });
    const finish = (result: ProcessRunResult): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      for (const { name, handler } of handlers) process.removeListener(name, handler);
      void hook.then(() => resolve(hookError === undefined ? result : { exit_code: null, timed_out: false, hook_error: hookError }));
    };

    child.once('error', (error) => finish({ exit_code: null, timed_out: false, error: error.message }));
    child.once('exit', (code, signal) => {
      if (timedOut) finish({ exit_code: null, signal: KILL_SIGNAL, timed_out: true });
      else if (interruptedBy !== undefined) finish({ exit_code: null, timed_out: false, interrupted_by: interruptedBy });
      else finish({ exit_code: code, ...(signal === null ? {} : { signal }), timed_out: false });
    });

    if (tree !== undefined && options.onSpawn !== undefined) {
      hook = Promise.resolve()
        .then(() => options.onSpawn!(tree))
        .catch((error: unknown) => {
          hookError = error instanceof Error ? error.message : String(error);
          kill();
        });
    }
  });
}
