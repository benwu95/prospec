import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { gitIn } from '../../helpers/git-fixture.js';
import { preflightWork } from '../../../src/lib/work-preservation.js';
import { ABANDON_GITLINKS, PreservationGitlinksSchema, PreservationManifestSchema } from '../../../src/types/abandon.js';
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
  it('admits a gitlink and refuses an unmerged one', () => {
    const oid = gitIn(root, 'rev-parse', 'HEAD');
    gitIn(root, 'update-index', '--add', '--cacheinfo', `160000,${oid},submodule`);
    expect(capture().gitlinks).toEqual(new Map([['submodule', oid]]));
    gitIn(root, 'update-index', '--force-remove', 'submodule');
    const stages = [1, 2, 3].map((stage) => `160000 ${oid} ${stage}\tsubmodule`).join('\n');
    execFileSync('git', ['update-index', '--index-info'], { cwd: root, input: `${stages}\n` });
    expect(capture).toThrow(/unmerged/i);
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

describe('gitlink preservation', () => {
  const sources: string[] = [];
  afterEach(() => { for (const dir of sources.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
  const addSubmodule = (at: string): string => {
    const src = fs.mkdtempSync(path.join(os.tmpdir(), 'preserve-sub-')); sources.push(src);
    gitIn(src, 'init', '-q'); fs.writeFileSync(path.join(src, 'lib.txt'), 'v1'); gitIn(src, 'add', '.'); gitIn(src, 'commit', '-qm', 'v1');
    fs.writeFileSync(path.join(src, 'lib.txt'), 'v2'); gitIn(src, 'commit', '-qam', 'v2');
    gitIn(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', src, at); gitIn(root, 'commit', '-qm', `add ${at}`);
    return path.join(root, at);
  };
  const work = async () => (await import('../../../src/lib/work-preservation.js')).captureWork(root, destination, sourceDir);

  it('records each pin and checkout and leaves the manifest shape unchanged', async () => {
    const sub = addSubmodule('vendor/shared'); const head = gitIn(sub, 'rev-parse', 'HEAD');
    gitIn(sub, 'checkout', '-q', 'HEAD~1'); const moved = gitIn(sub, 'rev-parse', 'HEAD');
    const input = await work();
    expect(input.gitlinks).toEqual([{ path: 'vendor/shared', index: head, checkout: moved }]);
    expect(input.manifest.entries.map((e) => e.path)).not.toContain('vendor/shared');
    expect(PreservationManifestSchema.parse(input.manifest)).toEqual(input.manifest);
  });
  it('records a null checkout for an empty or absent directory', async () => {
    const sub = addSubmodule('vendor/shared'); const head = gitIn(sub, 'rev-parse', 'HEAD');
    gitIn(root, 'submodule', 'deinit', '-q', '-f', 'vendor/shared');
    expect((await work()).gitlinks).toEqual([{ path: 'vendor/shared', index: head, checkout: null }]);
    fs.rmSync(sub, { recursive: true, force: true });
    expect((await work()).gitlinks).toEqual([{ path: 'vendor/shared', index: head, checkout: null }]);
  });
  it('records the pin whatever the repository hides from its diff and status', async () => {
    const sub = addSubmodule('vendor/shared');
    gitIn(root, 'config', 'submodule.vendor/shared.ignore', 'all'); gitIn(root, 'config', 'diff.ignoreSubmodules', 'all');
    gitIn(sub, 'checkout', '-q', 'HEAD~1');
    expect((await work()).gitlinks[0]).toMatchObject({ checkout: gitIn(sub, 'rev-parse', 'HEAD') });
  });
  it('refuses a submodule with uncommitted content, naming it', async () => {
    const sub = addSubmodule('vendor/shared'); fs.writeFileSync(path.join(sub, 'lib.txt'), 'edited');
    await expect(work()).rejects.toThrow(/vendor\/shared/);
  });
  it('leaves gitlinks outside the project and inside the destination out of the capture', async () => {
    addSubmodule('sibling');
    fs.mkdirSync(path.join(root, 'app')); put('app/f.txt', 'f'); gitIn(root, 'add', 'app'); gitIn(root, 'commit', '-qm', 'app');
    fs.writeFileSync(path.join(root, 'sibling/lib.txt'), 'edited');
    const { captureWork } = await import('../../../src/lib/work-preservation.js');
    const project = path.join(root, 'app'); const source = path.join(project, '.prospec/changes/x'); fs.mkdirSync(source, { recursive: true });
    expect(captureWork(project, path.join(project, '.prospec/abandoned/x'), source).gitlinks).toEqual([]);
    const oid = gitIn(root, 'rev-parse', 'HEAD');
    gitIn(root, 'update-index', '--add', '--cacheinfo', `160000,${oid},app/.prospec/abandoned/x/inner`);
    expect(captureWork(project, path.join(project, '.prospec/abandoned/x'), source).gitlinks).toEqual([]);
  });
  it('keeps the staged patch applicable under diff.submodule=diff', async () => {
    const sub = addSubmodule('vendor/shared'); gitIn(sub, 'checkout', '-q', 'HEAD~1'); gitIn(root, 'add', 'vendor/shared');
    gitIn(root, 'config', 'diff.submodule', 'diff');
    const input = await work();
    expect(input.staged.toString()).toContain('Subproject commit');
    gitIn(root, 'reset', '-q', 'vendor/shared');
    execFileSync('git', ['apply', '--cached'], { cwd: root, input: input.staged });
    expect(gitIn(root, 'ls-files', '-s', 'vendor/shared')).toContain(gitIn(sub, 'rev-parse', 'HEAD'));
  });
  it('writes the gitlink record beside the manifest and covers a pin moved before publication', async () => {
    const { persistWork, recheckWork } = await import('../../../src/lib/work-preservation.js');
    const sub = addSubmodule('vendor/shared');
    // Hidden from the patches, so only the gitlink record can notice the move.
    gitIn(root, 'config', 'diff.ignoreSubmodules', 'all'); gitIn(root, 'config', 'submodule.vendor/shared.ignore', 'all');
    const input = await work(); fs.mkdirSync(destination, { recursive: true }); await persistWork(input);
    const record = PreservationGitlinksSchema.parse(JSON.parse(fs.readFileSync(path.join(destination, ABANDON_GITLINKS), 'utf8')));
    expect(record.entries).toEqual(input.gitlinks);
    gitIn(sub, 'checkout', '-q', 'HEAD~1');
    expect(() => recheckWork(input)).toThrow(/changed/);
  });
});

it('writes no gitlink record for a repository without gitlinks', async () => {
  const { captureWork, persistWork } = await import('../../../src/lib/work-preservation.js');
  put('tracked', 'changed');
  const input = captureWork(root, destination, sourceDir); fs.mkdirSync(destination, { recursive: true }); await persistWork(input);
  expect(fs.existsSync(path.join(destination, ABANDON_GITLINKS))).toBe(false);
});
