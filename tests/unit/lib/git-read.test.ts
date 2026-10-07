import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as childProcess from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GIT_ID } from '../../helpers/git-fixture.js';
import { usePrivateTmpdir } from '../../helpers/private-tmpdir.js';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFileSync: vi.fn(actual.execFileSync) };
});

const { GIT_READ_SUBCOMMANDS, GIT_SNAPSHOT_SUBCOMMANDS, SNAPSHOT_PREFIX, gitRead, gitReadOptional, gitReadRecords, gitSnapshot, hiddenIndexShape, parseIndexRecord, snapshotRoot } = await import(
  '../../../src/lib/git-read.js'
);

vi.setConfig({ testTimeout: 30_000 });

// The snapshot directories this file creates under `snapshotRoot()` land in a root only this file uses.
usePrivateTmpdir('git-read');

const execFileSync = vi.mocked(childProcess.execFileSync);
const repos: string[] = [];

function makeRepo(name: string): string {
  const repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), `git-read-${name}-`)));
  repos.push(repo);
  const git = (...args: string[]) =>
    childProcess.execFileSync('git', [...GIT_ID, ...args], {
      cwd: repo,
      stdio: 'pipe',
    });
  git('init', '-q', '-b', 'main');
  writeFileSync(path.join(repo, `${name}.txt`), `${name}\n`);
  git('add', '.');
  git('commit', '-qm', name);
  return repo;
}

let repo: string;
const savedGitDir = process.env.GIT_DIR;

beforeEach(() => {
  repo = makeRepo('main');
  execFileSync.mockClear();
});

afterEach(() => {
  if (savedGitDir === undefined) delete process.env.GIT_DIR;
  else process.env.GIT_DIR = savedGitDir;
  for (const dir of repos.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('gitRead allowlist (REQ-LIB-090, REQ-TESTS-125)', () => {
  it('is the closed set of reading subcommands', () => {
    expect([...GIT_READ_SUBCOMMANDS]).toEqual(['rev-parse', 'ls-files', 'for-each-ref', 'status', 'symbolic-ref', 'reflog', 'diff']);
  });

  it.each(['commit', 'update-ref', 'config', 'cat-file', 'hash-object', 'checkout', 'stash', 'gc'])(
    'throws for %s before any process starts',
    (sub) => {
      expect(() => gitRead(repo, sub as never, [])).toThrow(/not a read-only/);
      expect(execFileSync).not.toHaveBeenCalled();
    },
  );

  it.each([
    [['-d', 'HEAD']],
    [['--delete', 'HEAD']],
    [['-m', 'why', 'HEAD']],
    [['HEAD', 'refs/heads/other']],
    [[]],
  ])('throws for symbolic-ref %j before any process starts', (args) => {
    expect(() => gitRead(repo, 'symbolic-ref', args)).toThrow(/symbolic-ref/);
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('reads a symbolic ref with -q or --short', () => {
    expect(gitRead(repo, 'symbolic-ref', ['-q', 'HEAD']).trim()).toBe('refs/heads/main');
    expect(gitRead(repo, 'symbolic-ref', ['--short', 'HEAD']).trim()).toBe('main');
  });

  it.each([[['delete', 'HEAD@{0}']], [['expire', '--all']], [['exists', 'HEAD']], [[]]])(
    'throws for reflog %j before any process starts',
    (args) => {
      expect(() => gitRead(repo, 'reflog', args)).toThrow(/reflog/);
      expect(execFileSync).not.toHaveBeenCalled();
    },
  );

  it('reads the reflog with reflog show', () => {
    expect(gitRead(repo, 'reflog', ['show', '--format=%H', 'HEAD', '--']).trim()).toMatch(/^[0-9a-f]{40}$/);
  });

  it.each([[['show', '--output=written.txt', 'HEAD']], [['show', '-n', '1', 'HEAD']], [['show', '--all']]])(
    'throws for reflog %j — only --format=<format> is the read form — before any process starts (S-7 pin)',
    (args) => {
      expect(() => gitRead(repo, 'reflog', args)).toThrow(/reflog show .* is not an option of the read form/);
      expect(execFileSync).not.toHaveBeenCalled();
      expect(existsSync(path.join(repo, 'written.txt'))).toBe(false);
    },
  );

  it('prefixes --no-optional-locks to every read', () => {
    gitRead(repo, 'status', ['--porcelain']);
    expect(execFileSync).toHaveBeenCalledTimes(1);
    const args = execFileSync.mock.calls[0]![1] as string[];
    expect(args.slice(0, 2)).toEqual(['--no-optional-locks', 'status']);
  });
});

describe('gitRead environment (REQ-LIB-090, REQ-TESTS-125)', () => {
  it('reads the repository it is given even when an inherited GIT_DIR names another', () => {
    const other = makeRepo('other');
    process.env.GIT_DIR = path.join(other, '.git');
    execFileSync.mockClear();
    expect(gitRead(repo, 'rev-parse', ['--show-toplevel']).trim()).toBe(repo);
    expect(gitRead(repo, 'ls-files', []).trim()).toBe('main.txt');
    const env = execFileSync.mock.calls[0]![2]!.env as NodeJS.ProcessEnv;
    for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR']) {
      expect(env[name], name).toBeUndefined();
    }
  });

  it('reads the whole index through `:/` although the inherited environment makes pathspecs literal (C-10 pin)', () => {
    const saved = process.env.GIT_LITERAL_PATHSPECS;
    process.env.GIT_LITERAL_PATHSPECS = '1';
    try {
      execFileSync.mockClear();
      expect(gitReadRecords(repo, 'ls-files', ['-z', '--full-name', '--', ':/'])).toEqual(['main.txt']);
      const env = execFileSync.mock.calls[0]![2]!.env as NodeJS.ProcessEnv;
      for (const name of ['GIT_LITERAL_PATHSPECS', 'GIT_GLOB_PATHSPECS', 'GIT_NOGLOB_PATHSPECS', 'GIT_ICASE_PATHSPECS']) {
        expect(env[name], name).toBeUndefined();
      }
    } finally {
      if (saved === undefined) delete process.env.GIT_LITERAL_PATHSPECS;
      else process.env.GIT_LITERAL_PATHSPECS = saved;
    }
  });
});

describe('gitReadOptional (REQ-LIB-090)', () => {
  it('returns null when git exits 1 (absent), the trimmed output otherwise', () => {
    childProcess.execFileSync('git', ['checkout', '-q', '--detach'], { cwd: repo, stdio: 'pipe' });
    expect(gitReadOptional(repo, 'symbolic-ref', ['-q', 'HEAD'])).toBeNull();
    expect(gitReadOptional(repo, 'rev-parse', ['-q', '--verify', 'HEAD^{commit}'])).toMatch(/^[0-9a-f]{40}$/);
  });

  it('rethrows any other failure', () => {
    expect(() => gitReadOptional(path.join(repo, 'missing'), 'rev-parse', ['HEAD'])).toThrow();
  });
});

describe('gitSnapshot (REQ-LIB-090, REQ-LIB-091)', () => {
  it('is the closed set of snapshot-building subcommands', () => {
    expect([...GIT_SNAPSHOT_SUBCOMMANDS]).toEqual(['clone', 'config', 'remote', 'checkout']);
  });

  it('throws before any process starts for a subcommand outside the set, or a directory that is not a snapshot', () => {
    const snap = realpathSync(mkdtempSync(path.join(snapshotRoot(), `${SNAPSHOT_PREFIX}unit-`)));
    repos.push(snap);
    expect(() => gitSnapshot(snap, 'push' as never, [])).toThrow(/snapshot-building/);
    expect(() => gitSnapshot(repo, 'config', ['core.hooksPath', '/dev/null'])).toThrow(/outside the temporary directory/);
    expect(() => gitSnapshot(path.join(snapshotRoot(), 'not-a-snapshot'), 'config', ['a.b', 'c'])).toThrow(/outside the temporary directory/);
    expect(() => gitSnapshot(path.join(snap, 'nested'), 'config', ['a.b', 'c'])).toThrow(/outside the temporary directory/);
    expect(() => gitSnapshot(snap, 'clone', ['-q', repo, path.join(snapshotRoot(), 'elsewhere')])).toThrow(/destination/);
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('refuses a prefixed directory that is not directly under the temporary directory (T-1 pin)', () => {
    const nested = path.join(snapshotRoot(), 'sub', `${SNAPSHOT_PREFIX}unit-x`);
    mkdirSync(nested, { recursive: true });
    repos.push(path.join(snapshotRoot(), 'sub'));
    expect(() => gitSnapshot(nested, 'config', ['a.b', 'c'])).toThrow(/outside the temporary directory/);
    expect(() => gitSnapshot(path.join(repo, `${SNAPSHOT_PREFIX}unit-x`), 'config', ['a.b', 'c'])).toThrow(/outside the temporary directory/);
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('refuses an option that names a path, a relative snapshot path, and any option outside the per-subcommand set (S-5 pin)', () => {
    const snap = realpathSync(mkdtempSync(path.join(snapshotRoot(), `${SNAPSHOT_PREFIX}unit-`)));
    repos.push(snap);
    const outside = path.join(repo, '.git', 'config');
    expect(() => gitSnapshot(snap, 'config', ['--file', outside, 'prospec.probe', 'written'])).toThrow(/--file is not an option/);
    expect(() => gitSnapshot(snap, 'config', ['--global', 'prospec.probe', 'written'])).toThrow(/--global is not an option/);
    expect(() => gitSnapshot(snap, 'clone', ['-q', '--separate-git-dir', path.join(repo, 'elsewhere'), repo, snap])).toThrow(/--separate-git-dir is not an option/);
    expect(() => gitSnapshot(snap, 'checkout', ['-q', '--force', 'HEAD'])).toThrow(/--force is not an option/);
    // Short forms too (T-9 pin): `config -f <path>` and `checkout -f` are the same writes.
    expect(() => gitSnapshot(snap, 'config', ['-f', outside, 'prospec.probe', 'written'])).toThrow(/-f is not an option/);
    expect(() => gitSnapshot(snap, 'checkout', ['-f', 'HEAD'])).toThrow(/-f is not an option/);
    expect(() => gitSnapshot(path.relative(process.cwd(), snap), 'config', ['a.b', 'c'])).toThrow(/relative path/);
    expect(execFileSync).not.toHaveBeenCalled();
    expect(readFileSync(outside, 'utf8')).not.toContain('probe');
  });

  it('refuses a prefixed symlink under the temporary directory that points at the main repository (S-1 pin)', () => {
    const link = path.join(snapshotRoot(), `${SNAPSHOT_PREFIX}unit-link-${process.pid}`);
    symlinkSync(repo, link);
    repos.push(link);
    const config = path.join(repo, '.git', 'config');
    const before = readFileSync(config, 'utf8');
    expect(() => gitSnapshot(link, 'config', ['prospec.probe', 'written'])).toThrow(/outside the temporary directory/);
    expect(execFileSync).not.toHaveBeenCalled();
    expect(readFileSync(config, 'utf8')).toBe(before);
  });

  it('acts on the snapshot even when an inherited GIT_DIR names the main repository', () => {
    const snap = realpathSync(mkdtempSync(path.join(snapshotRoot(), `${SNAPSHOT_PREFIX}unit-`)));
    repos.push(snap);
    process.env.GIT_DIR = path.join(repo, '.git');
    gitSnapshot(snap, 'clone', ['-q', '--shared', '--no-checkout', repo, snap]);
    gitSnapshot(snap, 'config', ['prospec.unit', 'snapshot-only']);
    delete process.env.GIT_DIR;
    const read = (cwd: string) => childProcess.execFileSync('git', ['config', '--local', '--get', 'prospec.unit'], { cwd, stdio: 'pipe' }).toString().trim();
    expect(read(snap)).toBe('snapshot-only');
    expect(() => read(repo)).toThrow();
  });
});


describe('preservation Git reads', () => {
  it('captures staged and unstaged binary patches separately', () => {
    writeFileSync(path.join(repo, 'main.txt'), 'staged\n');
    childProcess.execFileSync('git', ['add', 'main.txt'], { cwd: repo });
    writeFileSync(path.join(repo, 'main.txt'), 'main\n');
    const flags = ['--binary', '--full-index', '--no-ext-diff', '--no-textconv', '--no-renames', '--submodule=short', '--ignore-submodules=none'];
    const staged = gitRead(repo, 'diff', [...flags, '--cached', 'HEAD', '--', '.']);
    const unstaged = gitRead(repo, 'diff', [...flags, '--', '.']);
    expect(staged).toContain('+staged');
    expect(unstaged).toContain('-staged');
    expect(execFileSync.mock.calls.at(-1)?.[2]).toMatchObject({ timeout: 30_000 });
  });
  it.each([['--output=lost'], ['--ext-diff'], ['--textconv'], ['HEAD'], ['--binary', '--', '.']])('refuses incomplete or writing diff invocation %j', (...args) => {
    expect(() => gitRead(repo, 'diff', args)).toThrow(/read|diff/);
    expect(execFileSync).not.toHaveBeenCalled();
  });
});

// R1-4: one index-record reading for the fingerprint, preservation and repository state.
describe('index records', () => {
  const oid = 'a'.repeat(40);
  it('parses mode, object, stage and a path that holds tabs or newlines', () => {
    expect(parseIndexRecord(`H 160000 ${oid} 0\tsub/with\ttab\nline`)).toEqual({
      file: 'sub/with\ttab\nline', mode: '160000', oid, stage: '0', assumeUnchanged: false, skipWorktree: false,
    });
  });
  it.each([
    ['H', null], ['h', 'assume-unchanged'], ['S', 'skip-worktree'], ['s', 'assume-unchanged'],
  ] as const)('judges tag %s as %s', (tag, shape) => {
    expect(hiddenIndexShape(parseIndexRecord(`${tag} 100644 ${oid} 0\tfile`))).toBe(shape);
  });
  it('judges a non-zero stage unmerged and refuses an unreadable record', () => {
    expect(hiddenIndexShape(parseIndexRecord(`M 100644 ${oid} 2\tfile`))).toBe('unmerged');
    expect(() => parseIndexRecord(`? untracked`)).toThrow('Unsupported Git index record');
    expect(() => parseIndexRecord(`H 100644 ${oid} 0 file`)).toThrow('Unsupported Git index record');
  });
});
