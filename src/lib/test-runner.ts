import { spawnSync } from 'node:child_process';

/**
 * Test-command runner for `check --record-tests` (REQ-LIB-033).
 *
 * The one place in the drift engine that executes a project command, and it is
 * reached ONLY from the flag-gated record path — the pure check path stays
 * read-only and deterministic. The command is tokenized on whitespace and run
 * WITHOUT a shell: shell syntax (pipes, `&&`, redirection, globs) is deliberately
 * unsupported rather than passed through, so a config value can never become a
 * shell injection vector.
 */

/** Default wall-clock cap for one test run. Generous enough for a real suite;
 *  bounded so a hanging suite cannot hang the CLI — enforced with SIGKILL, since
 *  a SIGTERM a wrapper script traps would leave the cap unenforced.
 *
 *  Deliberate exclusion: the kill targets the direct child only. `spawnSync`
 *  cannot detach a process group, so grandchildren a runner forked (test workers)
 *  may outlive the timeout. Bounding those needs an async spawn with
 *  `detached: true` — not done here, and not claimed. */
export const DEFAULT_TEST_TIMEOUT_MS = 900_000;

const TIMEOUT_KILL_SIGNAL = 'SIGKILL';

export interface TestRunResult {
  /** The command as run (rejoined argv), recorded verbatim into metadata. */
  command: string;
  /** Process exit code; null when the process never produced one (timeout/signal). */
  exit_code: number | null;
  timed_out: boolean;
  /** The signal that ended the run, when one did — so a crash (SIGSEGV) or an
   *  OOM kill is never reported to the developer as a timeout. */
  signal?: string;
  /** Set when the command could not be run at all (not found / not executable). */
  error?: string;
}

/** Split a command string into argv. Whitespace-only tokenization — quoting is
 *  NOT interpreted, matching the no-shell contract above. */
export function tokenizeCommand(command: string): string[] {
  return command.trim().split(/\s+/).filter((t) => t.length > 0);
}

/**
 * Run the project's test command and report how it ended. Output is inherited by
 * the caller's stdio so a developer watching `--record-tests` sees the real suite
 * output; only the outcome is returned.
 */
export function runTestCommand(
  cwd: string,
  command: string,
  timeoutMs: number = DEFAULT_TEST_TIMEOUT_MS,
): TestRunResult {
  const argv = tokenizeCommand(command);
  const [bin, ...args] = argv;
  if (bin === undefined) {
    return { command, exit_code: null, timed_out: false, error: 'empty test command' };
  }
  const res = spawnSync(bin, args, {
    cwd,
    shell: false,
    stdio: 'inherit',
    timeout: timeoutMs,
    killSignal: TIMEOUT_KILL_SIGNAL,
  });
  const ranAs = argv.join(' ');
  // A timeout is identified by ETIMEDOUT or by the kill signal WE sent — any other
  // terminating signal (SIGSEGV, an OOM SIGKILL from the kernel is indistinguishable
  // and accepted, SIGINT from Ctrl-C) is reported as itself, not relabelled.
  const isTimeout = (signal: string | null, message?: string): boolean =>
    signal === TIMEOUT_KILL_SIGNAL || (message !== undefined && /ETIMEDOUT/.test(message));
  if (res.error !== undefined) {
    const timed_out = isTimeout(res.signal, res.error.message);
    return {
      command: ranAs,
      exit_code: null,
      timed_out,
      ...(res.signal === null ? {} : { signal: res.signal }),
      error: res.error.message,
    };
  }
  if (res.signal !== null) {
    return { command: ranAs, exit_code: null, timed_out: isTimeout(res.signal), signal: res.signal };
  }
  return { command: ranAs, exit_code: res.status, timed_out: false };
}
