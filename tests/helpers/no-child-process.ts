import type * as ChildProcess from 'node:child_process';

type ChildProcessModule = typeof ChildProcess;

const refused = (command: unknown): Error =>
  new Error(`${String(command)}: child processes are disabled in this memfs suite`);

const lastCallback = (args: unknown[]): ((...a: unknown[]) => void) | undefined => {
  const last = args.at(-1);
  return typeof last === 'function' ? (last as (...a: unknown[]) => void) : undefined;
};

/**
 * `node:child_process` for a memfs suite: every function that would start a
 * process fails without starting one, the way it fails when the command cannot
 * run — `execFileSync` / `execSync` throw, `spawnSync` returns its `error`
 * result, `execFile` / `exec` fail through their callback (so a promisified
 * call rejects). `spawn` and `fork` throw, since there is no child to hand back.
 * memfs paths do not exist on disk, so a real git spawned against one only
 * fails slower:
 *
 *   vi.mock('node:child_process', async (importOriginal) =>
 *     (await import('../../helpers/no-child-process.js')).withoutSpawns(
 *       await importOriginal<typeof import('node:child_process')>()));
 */
export function withoutSpawns(actual: ChildProcessModule): ChildProcessModule & { default: ChildProcessModule } {
  const throwing = (command: unknown): never => {
    throw refused(command);
  };
  const viaCallback = (command: unknown, args: unknown[]): undefined => {
    const callback = lastCallback(args);
    if (callback === undefined) throwing(command);
    const error = refused(command);
    process.nextTick(() => callback!(error, '', ''));
    return undefined;
  };
  const overrides = {
    execFileSync: (file: unknown) => throwing(file),
    execSync: (command: unknown) => throwing(command),
    spawnSync: (command: unknown) => ({
      pid: 0,
      output: [],
      stdout: '',
      stderr: '',
      status: null,
      signal: null,
      error: refused(command),
    }),
    execFile: (file: unknown, ...args: unknown[]) => viaCallback(file, args),
    exec: (command: unknown, ...args: unknown[]) => viaCallback(command, args),
    spawn: (command: unknown) => throwing(command),
    fork: (modulePath: unknown) => throwing(modulePath),
  } as unknown as Partial<ChildProcessModule>;
  const module = { ...actual, ...overrides } as ChildProcessModule;
  return { ...module, default: module };
}
