import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { gitIn } from '../../helpers/git-fixture.js';
import { PreservationManifestSchema } from '../../../src/types/abandon.js';
import { preflightWork } from '../../../src/lib/work-preservation.js';
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});
vi.setConfig({ testTimeout: 30_000 });
let root: string;
let sourceDir: string;
let destination: string;
const put = (name: string, data: string | Buffer) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); };
const capture = () => preflightWork(root, destination);
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'preserve-')));
  gitIn(root, 'init', '-q', '-b', 'main');
  put('.gitignore', '.prospec/\nignored/\n'); put('tracked', 'base\n');
  gitIn(root, 'add', '.'); gitIn(root, 'commit', '-qm', 'base');
  sourceDir = path.join(root, '.prospec/changes/x'); fs.mkdirSync(sourceDir, { recursive: true });
  put('.prospec/changes/x/proposal.md', 'original proposal');
  destination = path.join(root, '.prospec/abandoned/2026-10-05-x');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
describe('preservation preflight', () => {
  it('captures project identity without creating output or touching Git', () => {
    const before = fs.readFileSync(path.join(root, '.git/index'));
    expect(capture()).toMatchObject({ root, gitPrefix: '' });
    expect(fs.existsSync(destination)).toBe(false);
    expect(fs.readFileSync(path.join(root, '.git/index'))).toEqual(before);
  });
  it.each(['--assume-unchanged', '--skip-worktree'])('refuses hidden tracked state %s', (flag) => {
    gitIn(root, 'update-index', flag, 'tracked');
    expect(capture).toThrow(/assume|skip|sparse/i);
    expect(fs.existsSync(destination)).toBe(false);
  });
  it('refuses conflicts', () => {
    const blob = gitIn(root, 'rev-parse', 'HEAD:tracked').trim();
    execFileSync('git', ['update-index', '--index-info'], { cwd: root, input: `100644 ${blob} 1\tconflict\n`, stdio: ['pipe', 'pipe', 'pipe'] });
    expect(capture).toThrow(/conflicted|unmerged/i);
  });
  it('refuses unborn HEAD', () => {
    gitIn(root, 'checkout', '--orphan', 'new');
    expect(capture).toThrow(/HEAD|unborn/);
  });
});

it('does not refresh stale index stat data during preflight', () => {
  fs.utimesSync(path.join(root, 'tracked'), 10, 10);
  const before = fs.readFileSync(path.join(root, '.git/index'));
  capture();
  expect(fs.readFileSync(path.join(root, '.git/index'))).toEqual(before);
});

describe('work capture', () => {
  it('keeps opposing patches, raw binary bytes, links and deletion identities', async () => {
    const { captureWork } = await import('../../../src/lib/work-preservation.js');
    put('tracked', 'staged\n'); gitIn(root, 'add', 'tracked'); put('tracked', 'base\n');
    put('binary', Buffer.from([0, 255, 1])); put('ignored/file', 'ignored');
    fs.symlinkSync('../outside', path.join(root, 'link'));
    fs.unlinkSync(path.join(root, '.gitignore'));
    const input = captureWork(root, destination, sourceDir);
    expect(input.staged.toString()).toContain('+staged');
    expect(input.unstaged.toString()).toContain('-staged');
    const binary = input.manifest.entries.find((entry) => entry.path === 'binary');
    expect(binary?.kind).toBe('regular');
    if (binary?.kind === 'regular') expect(input.blobs.get(binary.blob)).toEqual(Buffer.from([0, 255, 1]));
    expect(input.manifest.entries).toContainEqual({ path: 'link', kind: 'symlink', target: '../outside' });
    expect(input.manifest.entries).toContainEqual({ path: '.gitignore', kind: 'deleted' });
  });
  it('scopes a nested project and keeps original .prospec input without its own output', async () => {
    const { captureWork } = await import('../../../src/lib/work-preservation.js');
    put('.gitignore', 'ignored/\n'); put('app/tracked', 'base'); put('sibling/file', 'base'); gitIn(root, 'add', '.'); gitIn(root, 'commit', '-qm', 'nested');
    put('app/tracked', 'changed'); put('sibling/file', 'changed'); put('app/.prospec/user.txt', 'user');
    const project = path.join(root, 'app'); const dest = path.join(project, '.prospec/abandoned/new');
    const source = path.join(project, '.prospec/changes/x'); fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(dest, { recursive: true }); fs.writeFileSync(path.join(dest, 'own'), 'own');
    const input = captureWork(project, dest, source);
    expect(input.manifest.git_prefix).toBe('app/');
    expect(input.manifest.entries.map((e) => e.path)).toEqual(['.prospec/user.txt', 'tracked']);
    expect(input.unstaged.toString()).toContain('app/tracked');
    expect(input.unstaged.toString()).not.toContain('sibling');
  });
});

describe('preservation persistence and fence', () => {
  it('writes recoverable bytes and rejects changed source or work inputs', async () => {
    const { captureWork, persistWork, recheckWork } = await import('../../../src/lib/work-preservation.js');
    put('tracked', 'changed'); put('new\nfile', Buffer.from([0, 1, 255]));
    const input = captureWork(root, destination, sourceDir);
    fs.mkdirSync(destination, { recursive: true });
    await persistWork(input);
    expect(fs.readFileSync(path.join(destination, 'preservation/staged.patch'))).toEqual(input.staged);
    expect(fs.readFileSync(path.join(destination, 'preservation/unstaged.patch'))).toEqual(input.unstaged);
    expect(fs.existsSync(path.join(destination, 'preservation/gitlinks.json'))).toBe(false);
    expect(() => recheckWork(input)).not.toThrow();
    put('.prospec/changes/x/proposal.md', 'edited while saving');
    expect(() => recheckWork(input)).toThrow(/changed/);
    expect(fs.readFileSync(path.join(sourceDir, 'proposal.md'), 'utf8')).toBe('edited while saving');
  });
  it('reports write failure while keeping the source and work bytes', async () => {
    const { captureWork, persistWork } = await import('../../../src/lib/work-preservation.js');
    put('tracked', 'changed');
    const input = captureWork(root, destination, sourceDir);
    fs.mkdirSync(destination, { recursive: true }); fs.writeFileSync(path.join(destination, 'preservation'), 'blocked');
    await expect(persistWork(input)).rejects.toThrow();
    expect(fs.readFileSync(path.join(root, 'tracked'), 'utf8')).toBe('changed');
    expect(fs.readFileSync(path.join(sourceDir, 'proposal.md'), 'utf8')).toBe('original proposal');
  });
});

it.each(['work', 'index', 'paths', 'mode'] as const)('refuses a concurrent %s change', async (facet) => {
  const { captureWork, recheckWork } = await import('../../../src/lib/work-preservation.js');
  put('tracked', 'dirty');
  const input = captureWork(root, destination, sourceDir);
  if (facet === 'work') put('tracked', 'later');
  if (facet === 'index') gitIn(root, 'add', 'tracked');
  if (facet === 'paths') put('new', 'new');
  if (facet === 'mode') fs.chmodSync(path.join(root, 'tracked'), 0o755);
  expect(() => recheckWork(input)).toThrow(/changed/);
});
it('omits ignored inputs and preserves binary patches and executable mode', async () => {
  const { captureWork } = await import('../../../src/lib/work-preservation.js');
  put('binary', Buffer.from([0, 1, 255])); gitIn(root, 'add', 'binary');
  put('binary', Buffer.from([0, 2, 254])); put('ignored/private', 'ignored');
  fs.chmodSync(path.join(root, 'binary'), 0o755);
  const input = captureWork(root, destination, sourceDir);
  expect(input.manifest.entries.map((e) => e.path)).toEqual(['binary']);
  expect(input.manifest.entries[0]).toMatchObject({ mode: 0o755 });
  expect(input.staged.toString()).toContain('GIT binary patch');
  expect(input.unstaged.toString()).toContain('GIT binary patch');
});
it('refuses non-Git input and escaping destination', () => {
  expect(() => preflightWork(root, path.join(root, '../escape'))).toThrow(/Unsafe/);
  fs.renameSync(path.join(root, '.git'), path.join(root, 'hidden-git'));
  expect(capture).toThrow(/Git|HEAD/);
});
it('refuses a real unmerged index', () => {
  gitIn(root, 'checkout', '-qb', 'other'); put('tracked', 'other'); gitIn(root, 'commit', '-qam', 'other');
  gitIn(root, 'checkout', 'main'); put('tracked', 'main'); gitIn(root, 'commit', '-qam', 'main');
  expect(() => gitIn(root, 'merge', 'other')).toThrow();
  expect(capture).toThrow(/conflicted|unmerged/);
});
it('fails closed on source read errors and unsafe parent links', async () => {
  const { captureWork } = await import('../../../src/lib/work-preservation.js');
  put('tracked', 'dirty');
  const read = vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => { throw new Error('injected read failure'); });
  try { expect(() => captureWork(root, destination, sourceDir)).toThrow(/read failure/); }
  finally { read.mockRestore(); }
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'preserve-outside-'));
  try {
    fs.symlinkSync(outside, path.join(root, 'unsafe'));
    expect(() => preflightWork(root, path.join(root, 'unsafe/archive'))).toThrow(/Unsafe/);
  } finally { fs.rmSync(outside, { recursive: true, force: true }); }
});

// #352: a clean submodule is preserved as its pins; work its commits do not hold refuses.
describe('gitlink preservation', () => {
  let upstream: string;
  let nested: string;
  let pinned: string;
  let previous: string;
  const sub = (...args: string[]) => gitIn(path.join(root, 'module'), ...args);
  const commitIn = (cwd: string, file: string, text: string) => {
    fs.writeFileSync(path.join(cwd, file), text); gitIn(cwd, 'add', '.'); gitIn(cwd, 'commit', '-qm', text);
  };
  const load = async () => import('../../../src/lib/work-preservation.js');
  beforeEach(() => {
    upstream = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'preserve-sub-')));
    nested = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'preserve-nested-')));
    gitIn(upstream, 'init', '-q', '-b', 'main'); commitIn(upstream, 'shared.md', 'v1'); commitIn(upstream, 'shared.md', 'v2');
    gitIn(nested, 'init', '-q', '-b', 'main'); commitIn(nested, 'deep.md', 'deep');
    gitIn(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', upstream, 'module');
    gitIn(root, 'commit', '-qm', 'add submodule');
    pinned = gitIn(root, 'rev-parse', 'HEAD:module');
    previous = gitIn(upstream, 'rev-parse', 'HEAD~1');
  });
  afterEach(() => { fs.rmSync(upstream, { recursive: true, force: true }); fs.rmSync(nested, { recursive: true, force: true }); });

  it('records a clean submodule as its pins, never as a manifest entry', async () => {
    const { captureWork } = await load();
    expect(capture).not.toThrow();
    const input = captureWork(root, destination, sourceDir);
    expect(input.gitlinks).toEqual([{ path: 'module', head_commit: pinned, index_commit: pinned, checkout_commit: pinned }]);
    expect(input.manifest.entries.map((entry) => entry.path)).not.toContain('module');
    expect(() => PreservationManifestSchema.parse(input.manifest)).not.toThrow();
  });
  it('records a moved and staged pin in short form whatever the diff and ignore settings say', async () => {
    const { captureWork } = await load();
    gitIn(root, 'config', 'diff.submodule', 'diff'); gitIn(root, 'config', 'submodule.module.ignore', 'all');
    sub('checkout', '-q', 'HEAD~1');
    expect(captureWork(root, destination, sourceDir).gitlinks).toEqual([{ path: 'module', head_commit: pinned, index_commit: pinned, checkout_commit: previous }]);
    gitIn(root, 'add', 'module');
    const input = captureWork(root, destination, sourceDir);
    expect(input.gitlinks).toEqual([{ path: 'module', head_commit: pinned, index_commit: previous, checkout_commit: previous }]);
    expect(input.staged.toString()).toContain(`-Subproject commit ${pinned}`);
    expect(input.staged.toString()).toContain(`+Subproject commit ${previous}`);
    expect(input.staged.toString()).not.toContain('shared.md');
  });
  it('records an uninitialized or missing checkout with no checkout commit', async () => {
    const { captureWork } = await load();
    gitIn(root, 'submodule', 'deinit', '-q', '-f', 'module');
    expect(captureWork(root, destination, sourceDir).gitlinks).toEqual([{ path: 'module', head_commit: pinned, index_commit: pinned, checkout_commit: null }]);
    fs.rmSync(path.join(root, 'module'), { recursive: true, force: true });
    const input = captureWork(root, destination, sourceDir);
    expect(input.gitlinks).toEqual([{ path: 'module', head_commit: pinned, index_commit: pinned, checkout_commit: null }]);
    expect(input.manifest.entries.map((entry) => entry.path)).not.toContain('module');
  });
  it.each([
    ['modified', () => { fs.writeFileSync(path.join(root, 'module/shared.md'), 'edit'); }],
    ['untracked, hidden by status.showUntrackedFiles=no', () => { sub('config', 'status.showUntrackedFiles', 'no'); fs.writeFileSync(path.join(root, 'module/new.md'), 'x'); }],
    ['skip-worktree', () => { sub('update-index', '--skip-worktree', 'shared.md'); }],
    ['assume-unchanged', () => { sub('update-index', '--assume-unchanged', 'shared.md'); }],
    ['unmerged', () => {
      const blob = sub('rev-parse', 'HEAD:shared.md');
      execFileSync('git', ['update-index', '--index-info'], { cwd: path.join(root, 'module'), input: `100644 ${blob} 1\tconflict.md\n`, stdio: ['pipe', 'pipe', 'pipe'] });
    }],
  ])('refuses a submodule with %s work its commits do not hold', (_kind, arrange) => {
    arrange();
    expect(capture).toThrow(/module/);
    expect(fs.existsSync(destination)).toBe(false);
  });
  it('refuses dirty work inside a nested submodule by its full path', () => {
    sub('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', nested, 'inner'); sub('commit', '-qm', 'nest');
    gitIn(root, 'add', 'module'); gitIn(root, 'commit', '-qm', 'pin nest');
    expect(capture).not.toThrow();
    fs.writeFileSync(path.join(root, 'module/inner/deep.md'), 'edit');
    expect(capture).toThrow(/module\/inner/);
  });
  it('refuses a non-empty gitlink directory without .git', () => {
    gitIn(root, 'submodule', 'deinit', '-q', '-f', 'module');
    fs.writeFileSync(path.join(root, 'module/stray.md'), 'stray');
    expect(capture).toThrow(/module/);
  });
  it('judges a gitlink removed from the index by HEAD, even when its configuration ignores it', async () => {
    const { captureWork } = await load();
    gitIn(root, 'config', 'submodule.module.ignore', 'all');
    gitIn(root, 'rm', '-q', '--cached', 'module');
    const input = captureWork(root, destination, sourceDir);
    expect(input.gitlinks).toEqual([{ path: 'module', head_commit: pinned, index_commit: null, checkout_commit: pinned }]);
    expect(input.manifest.entries.map((entry) => entry.path)).not.toContain('module');
    fs.writeFileSync(path.join(root, 'module/shared.md'), 'edit');
    expect(() => captureWork(root, destination, sourceDir)).toThrow(/module/);
  });
  it('records a removed gitlink only in its pins', async () => {
    const { captureWork } = await load();
    gitIn(root, 'rm', '-q', '-f', 'module');
    const input = captureWork(root, destination, sourceDir);
    expect(input.gitlinks).toEqual([{ path: 'module', head_commit: pinned, index_commit: null, checkout_commit: null }]);
    expect(input.manifest.entries.map((entry) => entry.path)).not.toContain('module');
  });
  it('does not treat a file that became a directory as a gitlink', async () => {
    const { captureWork } = await load();
    fs.unlinkSync(path.join(root, 'tracked')); put('tracked/inside', 'x');
    // A typechange keeps its existing refusal; it is never judged or recorded as a gitlink.
    expect(() => captureWork(root, destination, sourceDir)).toThrow('Unsupported preservation input: tracked');
  });
  // R1-1: a gitlink replaced by a regular file is a typechange, not a HEAD-only gitlink.
  it('preserves a gitlink replaced by a regular file as an ordinary file', async () => {
    const { captureWork } = await load();
    gitIn(root, 'rm', '-q', '--cached', 'module'); fs.rmSync(path.join(root, 'module'), { recursive: true, force: true });
    put('module', 'now a file\n'); gitIn(root, 'add', 'module');
    const input = captureWork(root, destination, sourceDir);
    expect(input.gitlinks).toEqual([]);
    expect(input.manifest.entries).toContainEqual(expect.objectContaining({ path: 'module', kind: 'regular' }));
  });
  // R2-1: a removed gitlink's path now holding an untracked file or symlink keeps that input.
  it.skipIf(process.platform === 'win32')('preserves an untracked symlink or file left at a removed gitlink path', async () => {
    const { captureWork } = await load();
    gitIn(root, 'rm', '-q', '--cached', 'module'); fs.rmSync(path.join(root, 'module'), { recursive: true, force: true });
    fs.symlinkSync('../somewhere-else', path.join(root, 'module'));
    const linked = captureWork(root, destination, sourceDir);
    expect(linked.gitlinks).toEqual([{ path: 'module', head_commit: pinned, index_commit: null, checkout_commit: null }]);
    expect(linked.manifest.entries).toContainEqual({ path: 'module', kind: 'symlink', target: '../somewhere-else' });
    fs.unlinkSync(path.join(root, 'module')); put('module', 'a file now\n');
    const filed = captureWork(root, destination, sourceDir);
    expect(filed.gitlinks).toEqual([{ path: 'module', head_commit: pinned, index_commit: null, checkout_commit: null }]);
    expect(filed.manifest.entries).toContainEqual(expect.objectContaining({ path: 'module', kind: 'regular' }));
  });
  // Redesign after the review circuit breaker: one shared checkout rule (R1-2, R1-3, R3-1).
  it('refuses, without recursing into the superproject, a gitlink holding an invalid .git', () => {
    gitIn(root, 'submodule', 'deinit', '-q', '-f', 'module');
    fs.mkdirSync(path.join(root, 'module/.git')); fs.writeFileSync(path.join(root, 'module/work'), 'stray');
    expect(capture).toThrow(/module/);
  });
  it('records no HEAD commit when HEAD holds a file at a gitlink path', async () => {
    const { captureWork } = await load();
    put('r', 'was a file\n'); gitIn(root, 'add', 'r'); gitIn(root, 'commit', '-qm', 'file r');
    gitIn(root, 'rm', '-q', 'r');
    gitIn(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', upstream, 'r');
    const pin = captureWork(root, destination, sourceDir).gitlinks.find((entry) => entry.path === 'r');
    expect(pin).toEqual({ path: 'r', head_commit: null, index_commit: pinned, checkout_commit: pinned });
  });
  it.skipIf(process.platform === 'win32')('never runs Git in a repository reached through a symlinked ancestor', async () => {
    const { captureWork } = await load();
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'preserve-outside-')));
    try {
      gitIn(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', upstream, 'lib/sub');
      gitIn(root, 'commit', '-qm', 'nested gitlink');
      execFileSync('git', ['clone', '-q', upstream, path.join(outside, 'lib/sub')], { stdio: 'pipe' });
      fs.writeFileSync(path.join(outside, 'lib/sub/outside-work'), 'not this project');
      fs.rmSync(path.join(root, 'lib'), { recursive: true, force: true });
      fs.symlinkSync(path.join(outside, 'lib'), path.join(root, 'lib'));
      expect(() => captureWork(root, destination, sourceDir)).toThrow(/lib/);
      expect(() => captureWork(root, destination, sourceDir)).not.toThrow(/uncommitted or untracked work/);
    } finally { fs.rmSync(outside, { recursive: true, force: true }); }
  });
  it('ignores gitlinks outside the project and under its own destination', async () => {
    const { captureWork } = await load();
    fs.writeFileSync(path.join(root, 'module/shared.md'), 'sibling work');
    put('app/tracked', 'base'); gitIn(root, 'add', 'app'); gitIn(root, 'commit', '-qm', 'app');
    const project = path.join(root, 'app'); const dest = path.join(project, '.prospec/abandoned/new');
    const source = path.join(project, '.prospec/changes/x'); fs.mkdirSync(source, { recursive: true });
    const head = gitIn(root, 'rev-parse', 'HEAD');
    gitIn(root, 'update-index', '--add', '--cacheinfo', `160000,${head},app/.prospec/abandoned/new/inner`);
    fs.mkdirSync(path.join(dest, 'inner'), { recursive: true }); fs.writeFileSync(path.join(dest, 'inner/own'), 'own');
    expect(captureWork(project, dest, source).gitlinks).toEqual([]);
  });
  it('writes the pins beside the manifest only when a gitlink exists', async () => {
    const { captureWork, persistWork } = await load();
    const input = captureWork(root, destination, sourceDir);
    fs.mkdirSync(destination, { recursive: true });
    await persistWork(input);
    const { GitlinkPinsSchema } = await import('../../../src/types/abandon.js');
    expect(GitlinkPinsSchema.parse(JSON.parse(fs.readFileSync(path.join(destination, 'preservation/gitlinks.json'), 'utf8')))).toEqual({ version: 1, gitlinks: input.gitlinks });
  });
});
