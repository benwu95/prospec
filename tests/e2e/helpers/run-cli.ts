/**
 * In-process CLI runner for the e2e suite.
 *
 * Instead of spawning a cold `node dist/cli/index.js` per test (which pays a
 * node startup + full-import-graph cost every call), this builds a fresh
 * `createProgram()` and drives `runProgram()` directly, capturing stdout/stderr
 * and the resulting exit code. The real compiled binary and the few
 * subprocess-only behaviors (shebang, real process exit code, non-TTY color,
 * mcp stdio startup) are still covered by `cli-subprocess-smoke.test.ts`.
 *
 * ISOLATION CONTRACT: every global this touches — cwd, `PROSPEC_MOCK_HOME`,
 * `process.exitCode`, the `process.stdout/stderr.write` patches, and the
 * `console` methods — is restored before returning, in a `finally` so a thrown
 * setup step (e.g. a missing cwd) cannot leak state into the next test
 * regardless of run order.
 *
 * Both layers are captured because the CLI writes through both: commander (help
 * / usage errors) and `error-output.ts` write to `process.stdout/stderr.write`
 * directly, while the formatters print via `console.log`/`console.error`. Under
 * vitest the `console` methods are intercepted by the runner, so a
 * `process.stdout.write` patch alone would miss every formatter's output — the
 * `console` methods are routed through the same write patches so ordering across
 * both paths stays unified in one buffer.
 */
import { format } from 'node:util';
import { runProgram } from '../../../src/cli/program.js';

export interface RunCliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

type Write = typeof process.stdout.write;

const captureWrite = (append: (s: string) => void): Write =>
  ((chunk: unknown, encoding?: unknown, cb?: unknown): boolean => {
    append(typeof chunk === 'string' ? chunk : String(chunk));
    // Honor the write(chunk, cb) and write(chunk, encoding, cb) callback forms.
    if (typeof encoding === 'function') encoding();
    else if (typeof cb === 'function') (cb as () => void)();
    return true;
  }) as Write;

export async function runCliInProcess(
  args: string[],
  options: { cwd: string },
): Promise<RunCliResult> {
  const { cwd } = options;

  const origCwd = process.cwd();
  const origExitCode = process.exitCode;
  const origStdoutWrite = process.stdout.write;
  const origStderrWrite = process.stderr.write;
  const origConsole = {
    log: console.log,
    info: console.info,
    debug: console.debug,
    warn: console.warn,
    error: console.error,
  };
  const hadMockHome = 'PROSPEC_MOCK_HOME' in process.env;
  const origMockHome = process.env.PROSPEC_MOCK_HOME;

  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  try {
    process.stdout.write = captureWrite((s) => {
      stdout += s;
    });
    process.stderr.write = captureWrite((s) => {
      stderr += s;
    });
    // Route console.* through the patched write streams so both output paths
    // land in one ordered buffer (see the module header for why).
    const toStdout = (...args: unknown[]): void => {
      process.stdout.write(format(...args) + '\n');
    };
    const toStderr = (...args: unknown[]): void => {
      process.stderr.write(format(...args) + '\n');
    };
    console.log = toStdout;
    console.info = toStdout;
    console.debug = toStdout;
    console.warn = toStderr;
    console.error = toStderr;
    process.exitCode = undefined;
    process.env.PROSPEC_MOCK_HOME = cwd;
    process.chdir(cwd);

    await runProgram(['node', 'prospec', ...args]);
    exitCode = typeof process.exitCode === 'number' ? process.exitCode : 0;
  } finally {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
    console.log = origConsole.log;
    console.info = origConsole.info;
    console.debug = origConsole.debug;
    console.warn = origConsole.warn;
    console.error = origConsole.error;
    process.chdir(origCwd);
    process.exitCode = origExitCode;
    if (hadMockHome) process.env.PROSPEC_MOCK_HOME = origMockHome;
    else delete process.env.PROSPEC_MOCK_HOME;
  }

  return { stdout, stderr, exitCode };
}
