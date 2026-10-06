/**
 * The git adapter of the delegation path (REQ-LIB-090). Reads of the main
 * repository go through a closed set of reading subcommands, run with optional
 * locks disabled and with the repository-selecting environment removed, so "the
 * CLI only reads git" is checked at run time instead of only stated. The snapshot builder's other git calls go
 * through `gitSnapshot`, which only acts on a snapshot under the temporary directory.
 *
 * It does not reuse `drift-sources`' git calls: those are private to their engine
 * and include its writers (`--record-tests` and the like), so an allowlist placed
 * there would have to admit them. The delegation modules call this adapter for
 * their own reads and keep `drift-sources`' three read-only readers
 * (`computeChangeState`, `workTreePaths`, `gitProjectPrefix`) unchanged. The one
 * `drift-sources` read that does come here is a gitlink's proof (`rev-parse`,
 * `ls-files`, `status` inside the submodule): its cwd is another repository, so it
 * needs exactly this fixed environment and bound.
 */
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const GIT_READ_SUBCOMMANDS = ['rev-parse', 'ls-files', 'for-each-ref', 'status', 'symbolic-ref', 'reflog', 'diff'] as const;
export type GitReadSubcommand = (typeof GIT_READ_SUBCOMMANDS)[number];

/** What building a snapshot needs beyond reads — each run against the snapshot only. */
export const GIT_SNAPSHOT_SUBCOMMANDS = ['clone', 'config', 'remote', 'checkout'] as const;
export type GitSnapshotSubcommand = (typeof GIT_SNAPSHOT_SUBCOMMANDS)[number];

export const SNAPSHOT_PREFIX = 'prospec-snapshot-';

/**
 * Variables that point git at another repository, index or object store, and the
 * ones that change how a pathspec is read (`GIT_LITERAL_PATHSPECS=1` turns the
 * whole-index pathspec `:/` into a literal file name that matches nothing).
 */
const REPOSITORY_SELECTING_ENV = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_LITERAL_PATHSPECS',
  'GIT_GLOB_PATHSPECS',
  'GIT_NOGLOB_PATHSPECS',
  'GIT_ICASE_PATHSPECS',
] as const;

const SYMBOLIC_REF_READ_OPTIONS = new Set(['-q', '--short']);
/** `reflog show` is `log -g`: of log's options only a format is admitted (`--output=<file>` writes). */
const REFLOG_SHOW_OPTION = /^--format=/;
const GIT_READ_MAX_BUFFER = 256 * 1024 * 1024;
export const PRESERVATION_DIFF_FLAGS = ['--binary', '--full-index', '--no-ext-diff', '--no-textconv', '--no-renames'] as const;

/** The inherited environment without the repository-selecting variables, plus `extra`. */
export function fixedGitEnv(extra: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of REPOSITORY_SELECTING_ENV) delete env[name];
  return { ...env, ...extra };
}

/**
 * Run a synchronous `drift-sources` read — whose git calls inherit `process.env` —
 * with the repository-selecting variables removed from `process.env`, restoring
 * them afterwards, so an inherited `GIT_DIR` cannot redirect it either.
 */
export function withFixedGitEnv<T>(read: () => T): T {
  const saved = REPOSITORY_SELECTING_ENV.map((name) => [name, process.env[name]] as const);
  for (const name of REPOSITORY_SELECTING_ENV) delete process.env[name];
  try {
    return read();
  } finally {
    for (const [name, value] of saved) if (value !== undefined) process.env[name] = value;
  }
}

function assertReadInvocation(sub: string, args: readonly string[]): void {
  if (!(GIT_READ_SUBCOMMANDS as readonly string[]).includes(sub)) {
    throw new Error(`git ${sub} is not a read-only subcommand of the delegation path`);
  }
  if (sub === 'diff') {
    const separator = args.indexOf('--');
    const expected = [...PRESERVATION_DIFF_FLAGS, ...(args.includes('--cached') ? ['--cached', 'HEAD'] : [])];
    if (separator !== expected.length || !expected.every((arg, i) => args[i] === arg) || args.length <= separator + 1) {
      throw new Error('git diff requires the fixed read-only preservation options and a pathspec');
    }
  }
  if (sub === 'symbolic-ref') {
    const options = args.filter((arg) => arg.startsWith('-'));
    const refs = args.filter((arg) => !arg.startsWith('-'));
    // `-d`/`--delete` with one ref, or a second ref argument, writes a symbolic ref.
    if (options.some((option) => !SYMBOLIC_REF_READ_OPTIONS.has(option)) || refs.length !== 1) {
      throw new Error(`git symbolic-ref ${args.join(' ')} is not the read form (one ref, only -q or --short)`);
    }
  }
  if (sub === 'reflog') {
    if (args[0] !== 'show') {
      // `reflog delete` and `reflog expire` rewrite the reflog.
      throw new Error(`git reflog ${args.join(' ')} is not \`reflog show\``);
    }
    const option = args.slice(1).find((arg) => arg.startsWith('-') && arg !== '--' && !REFLOG_SHOW_OPTION.test(arg));
    if (option !== undefined) {
      throw new Error(`git reflog show ${option} is not an option of the read form (only --format=<format>)`);
    }
  }
}

/** Run one allowlisted git read in `cwd`; anything outside the set throws before a process starts. */
export function gitRead(cwd: string, sub: GitReadSubcommand, args: readonly string[] = []): string {
  return gitReadBuffer(cwd, sub, args).toString('utf8');
}

/** Preserve raw patch bytes; reads are bounded and never return a partial capture. */
export function gitReadBuffer(cwd: string, sub: GitReadSubcommand, args: readonly string[] = []): Buffer {
  assertReadInvocation(sub, args);
  return execFileSync('git', ['--no-optional-locks', sub, ...args], {
    cwd,
    stdio: 'pipe',
    env: fixedGitEnv(),
    maxBuffer: GIT_READ_MAX_BUFFER,
    timeout: 30_000,
  });
}

/**
 * One allowlisted git read whose NUL-separated output is decoded losslessly into
 * records (the same decoding `drift-sources` applies to its own listings), so a
 * path that UTF-8 cannot represent fails closed instead of being altered.
 */
export function gitReadRecords(cwd: string, sub: GitReadSubcommand, args: readonly string[] = []): string[] {
  const raw = gitReadBuffer(cwd, sub, args);
  const decoded = raw.toString('utf8');
  if (!Buffer.from(decoded).equals(raw)) throw new Error('Git output cannot be represented losslessly');
  if (decoded !== '' && !decoded.endsWith('\0')) throw new Error('Incomplete NUL Git capture');
  return decoded === '' ? [] : decoded.slice(0, -1).split('\0');
}

/** A git read whose exit status 1 means "absent" rather than "unreadable"; the output is trimmed. */
export function gitReadOptional(cwd: string, sub: GitReadSubcommand, args: readonly string[] = []): string | null {
  try {
    return gitRead(cwd, sub, args).trim();
  } catch (error) {
    if ((error as { status?: number }).status === 1) return null;
    throw error;
  }
}

/** The real temporary directory every snapshot lies directly under. */
export function snapshotRoot(): string {
  return realpathSync(os.tmpdir());
}

/** The only options each snapshot-building subcommand may carry: none of them names a path. */
const SNAPSHOT_OPTIONS: Record<GitSnapshotSubcommand, ReadonlySet<string>> = {
  clone: new Set(['-q', '--shared', '--no-checkout']),
  config: new Set(),
  remote: new Set(['--push']),
  checkout: new Set(['-q', '--detach']),
};

/**
 * Run one snapshot-building git command. The snapshot must be an absolute path that
 * lies directly under the real temporary directory and carries the snapshot prefix.
 * `clone` runs from that root and must name the snapshot as its destination; every
 * other subcommand runs in the snapshot. Only a closed set of options is admitted per
 * subcommand — `config --file`, `clone --separate-git-dir` and the like would write
 * outside the snapshot. All run with hooks disabled, the repository-selecting
 * variables removed and `GIT_DIR` set to the snapshot's own `.git`, so an inherited
 * `GIT_DIR` cannot point `config`, `remote` or `checkout` at the main repository.
 */
export function gitSnapshot(dir: string, sub: GitSnapshotSubcommand, args: readonly string[]): void {
  if (!(GIT_SNAPSHOT_SUBCOMMANDS as readonly string[]).includes(sub)) {
    throw new Error(`git ${sub} is not a snapshot-building subcommand`);
  }
  const option = args.find((arg) => arg.startsWith('-') && !SNAPSHOT_OPTIONS[sub].has(arg));
  if (option !== undefined) {
    throw new Error(`git ${sub} ${option} is not an option the snapshot builder may pass`);
  }
  if (!path.isAbsolute(dir)) {
    throw new Error(`Refusing a snapshot git command on a relative path: ${dir}`);
  }
  const root = snapshotRoot();
  const resolved = path.resolve(dir);
  let real: string;
  try {
    real = realpathSync(resolved);
  } catch {
    throw new Error(`Refusing a snapshot git command outside the temporary directory: ${dir}`);
  }
  // Judged on the real path: a symlink under the temporary directory carrying the
  // snapshot prefix would otherwise point every command at its target.
  if (path.dirname(real) !== root || !path.basename(real).startsWith(SNAPSHOT_PREFIX)) {
    throw new Error(`Refusing a snapshot git command outside the temporary directory: ${dir}`);
  }
  if (sub === 'clone' && args[args.length - 1] !== dir) {
    throw new Error('A snapshot clone must name the snapshot as its destination');
  }
  execFileSync('git', ['-c', 'core.hooksPath=/dev/null', sub, ...args], {
    cwd: sub === 'clone' ? root : real,
    stdio: 'pipe',
    env: fixedGitEnv({ GIT_DIR: path.join(real, '.git') }),
  });
}
