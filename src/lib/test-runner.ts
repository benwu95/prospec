import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';

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
  /** The timeout the run was actually given — reporting must not restate the
   *  default, which would lie the day a caller overrides it. */
  timeout_ms: number;
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

/** Windows extensions Node refuses to spawn without a shell (CVE-2024-27980). The
 *  refusal is unconditional — an absolute path to the shim is rejected too — so
 *  resolving the shim and spawning it is not a workaround. */
const SHIM_EXTENSIONS = ['.cmd', '.bat'] as const;
const SHIM_EXTENSION_SET: ReadonlySet<string> = new Set(SHIM_EXTENSIONS);

/**
 * Extensions libuv actually appends when resolving argv[0] on Windows, in order.
 * **PATHEXT is deliberately absent**: libuv does not read it — `src/win/process.c`
 * states "Since CreateProcess can start only .com and .exe files, only those
 * extensions are tried", and `path_search_walk_ext` is called with `""`, `"com"`,
 * `"exe"`. Ordering this search by PATHEXT instead would classify a working command
 * as a shim whenever a `.cmd` sits in an earlier PATH directory than a real `.exe`
 * — the ordinary npm-global-shim + standalone-binary layout.
 */
const SPAWNABLE_EXTENSIONS = ['.com', '.exe'] as const;

/**
 * Everything `classifyExecutable` needs to reach a verdict, injected rather than
 * read from the ambient process — so a POSIX host can drive the win32 branch in a
 * unit test instead of the branch being provable only on Windows.
 */
export interface ExecutableProbe {
  platform: string;
  /** PATH entries, already split on the platform separator. */
  pathDirs: readonly string[];
  /** True when the candidate exists as a file (a directory is not executable). */
  exists: (candidate: string) => boolean;
}

export type ExecutableVerdict =
  | { kind: 'spawnable' }
  /** Resolves to a `.cmd`/`.bat` shim — unspawnable without a shell. */
  | { kind: 'shim'; resolved: string }
  | { kind: 'not-found' };

export function defaultExecutableProbe(
  env: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform,
): ExecutableProbe {
  const sep = platform === 'win32' ? ';' : ':';
  const rawPath = env.PATH ?? env.Path ?? '';
  return {
    platform,
    pathDirs: rawPath.split(sep).filter((d) => d.length > 0),
    exists: (candidate) => {
      try {
        return statSync(candidate).isFile();
      } catch {
        return false;
      }
    },
  };
}

/**
 * Decide whether argv[0] can be spawned with `shell: false` on this platform.
 *
 * Only Windows can answer anything but `spawnable`: POSIX has no shim layer, and a
 * missing binary there surfaces as an honest ENOENT from the spawn itself, which
 * the caller already reports. Candidate assembly uses `path.win32` explicitly so
 * the win32 branch behaves identically when exercised from a POSIX host.
 *
 * **Two passes, because "spawnable" must win globally.** libuv resolves a bare name
 * by trying only the literal name (when it contains a dot), `.com` and `.exe` in
 * every PATH directory. So pass 1 asks "does any directory hold something libuv can
 * actually start?" across the WHOLE path — a `.cmd` in an earlier directory does not
 * shadow a real `.exe` in a later one, because libuv never looks at the `.cmd`.
 * Only when pass 1 finds nothing anywhere does pass 2 look for a `.cmd`/`.bat`, and
 * then purely to diagnose *why* the spawn will fail.
 */
export function classifyExecutable(bin: string, probe: ExecutableProbe): ExecutableVerdict {
  if (probe.platform !== 'win32') return { kind: 'spawnable' };
  const w = path.win32;
  const declared = w.extname(bin).toLowerCase();
  if (declared !== '') {
    // An explicit `.cmd`/`.bat` is rejected by Node on the filename alone, existence
    // notwithstanding; any other declared extension is libuv's problem, not ours.
    if (SHIM_EXTENSION_SET.has(declared)) return { kind: 'shim', resolved: bin };
    return { kind: 'spawnable' };
  }
  // A path (not a bare name) is never searched on PATH.
  const dirs = bin.includes('/') || bin.includes('\\') ? [null] : probe.pathDirs;
  const candidate = (dir: string | null, name: string): string =>
    dir === null ? name : w.join(dir, name);

  for (const dir of dirs) {
    for (const ext of SPAWNABLE_EXTENSIONS) {
      if (probe.exists(candidate(dir, bin + ext))) return { kind: 'spawnable' };
    }
  }
  for (const dir of dirs) {
    for (const ext of SHIM_EXTENSIONS) {
      const found = candidate(dir, bin + ext);
      if (probe.exists(found)) return { kind: 'shim', resolved: found };
    }
  }
  return { kind: 'not-found' };
}

/**
 * The actionable explanation for a command that cannot be spawned, or null when it
 * can. **Only a shim blocks** — a `not-found` verdict is deliberately NOT reported
 * here: this probe's view of PATH may legitimately differ from the spawn's, so
 * letting the real spawn produce ENOENT keeps a working command from being skipped
 * on the strength of our own model.
 */
export function describeUnspawnable(bin: string, verdict: ExecutableVerdict): string | null {
  if (verdict.kind !== 'shim') return null;
  return (
    `\`${bin}\` resolves to a Windows shim (${verdict.resolved}), and Node refuses to spawn ` +
    'a `.cmd`/`.bat` without a shell (CVE-2024-27980) — an absolute path to the shim is rejected ' +
    'too, so set `tech_stack.test_command` to a shell-free invocation instead, e.g. ' +
    '`node node_modules/vitest/vitest.mjs run`'
  );
}

/** Why this command cannot run here, or null when it can — the single source both
 *  the pure check path and the record path report from. */
export function unspawnableReason(
  command: string,
  probe: ExecutableProbe = defaultExecutableProbe(),
): string | null {
  const bin = tokenizeCommand(command)[0];
  if (bin === undefined) return 'the configured test command is empty';
  return describeUnspawnable(bin, classifyExecutable(bin, probe));
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
  /** Injection seam for the platform probe — omitting it yields the real platform,
   *  so the pre-spawn refusal is provable from a POSIX host rather than only on
   *  Windows (an unpinned guard is indistinguishable from no guard). */
  probe: ExecutableProbe = defaultExecutableProbe(),
): TestRunResult {
  const argv = tokenizeCommand(command);
  const [bin, ...args] = argv;
  if (bin === undefined) {
    return { command, exit_code: null, timed_out: false, timeout_ms: timeoutMs, error: 'empty test command' };
  }
  // Refuse before spawning rather than letting Node's EINVAL surface as a mystery:
  // the same reason string the pure check path reports, so both paths agree.
  const unspawnable = describeUnspawnable(bin, classifyExecutable(bin, probe));
  if (unspawnable !== null) {
    return { command: argv.join(' '), exit_code: null, timed_out: false, timeout_ms: timeoutMs, error: unspawnable };
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
      timeout_ms: timeoutMs,
      ...(res.signal === null ? {} : { signal: res.signal }),
      error: res.error.message,
    };
  }
  if (res.signal !== null) {
    return {
      command: ranAs,
      exit_code: null,
      timed_out: isTimeout(res.signal),
      timeout_ms: timeoutMs,
      signal: res.signal,
    };
  }
  return { command: ranAs, exit_code: res.status, timed_out: false, timeout_ms: timeoutMs };
}
