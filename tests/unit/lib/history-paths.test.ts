import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitIn, imageOf } from '../../helpers/git-fixture.js';
import { historyOrigin, recheckHistoryPaths, resolveHistoryPaths } from '../../../src/lib/history-paths.js';
import * as git from '../../../src/lib/git-read.js';

vi.mock('../../../src/lib/git-read.js', async (original) => ({ ...await original<typeof git>(), gitRead: vi.fn((await original<typeof git>()).gitRead) }));
let root: string;
let main: string;
function project(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.prospec.yaml'), 'base_dir: relocated\n');
}
function linked(): string {
  const dir = path.join(root, 'linked tree');
  gitIn(main, 'worktree', 'add', '-qb', 'feature', dir);
  return dir;
}
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'history-paths-')));
  main = path.join(root, 'primary');
  project(main);
  gitIn(main, 'init', '-qb', 'trunk');
  gitIn(main, 'add', '.');
  gitIn(main, 'commit', '-qm', 'fixture');
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

describe('canonical history topology', () => {
  it('resolves a single worktree independently of base_dir without writes', () => {
    const before = imageOf(root);
    const result = resolveHistoryPaths(main);
    expect(result).toMatchObject({ sourceProjectRoot: main, historyProjectRoot: main, worktree: main, projectPrefix: '', archiveRoot: path.join(main, '.prospec/archive') });
    expect(historyOrigin(result, 'one')).toEqual({ commonDir: path.join(main, '.git'), worktree: main, projectPrefix: '', changeName: 'one' });
    recheckHistoryPaths(result);
    expect(imageOf(root)).toEqual(before);
  });
  it('resolves linked worktrees to primary even when no branch is named main', () => {
    const source = linked();
    const before = imageOf(root);
    expect(resolveHistoryPaths(source)).toMatchObject({ historyProjectRoot: main, sourceProjectRoot: source, worktree: source });
    expect(imageOf(root)).toEqual(before);
  });
  it('keeps monorepo projects isolated and requires their primary counterpart', () => {
    const source = linked();
    for (const name of ['a', 'b']) { project(path.join(source, name)); project(path.join(main, name)); }
    expect(resolveHistoryPaths(path.join(source, 'a')).archiveRoot).toBe(path.join(main, 'a/.prospec/archive'));
    expect(resolveHistoryPaths(path.join(source, 'b')).projectPrefix).toBe('b');
    fs.rmSync(path.join(main, 'a'), { recursive: true });
    expect(() => resolveHistoryPaths(path.join(source, 'a'))).toThrow();
  });
  it('refuses absent primary config and a changed topology during recheck', () => {
    const source = linked();
    const result = resolveHistoryPaths(source);
    fs.unlinkSync(path.join(main, '.prospec.yaml'));
    expect(() => resolveHistoryPaths(source)).toThrow(/config|prospec.yaml/i);
    expect(() => recheckHistoryPaths(result)).toThrow();
  });
  it.each(['.prospec', '.prospec/archive', '.prospec/abandoned', '.prospec/history-operations'])('refuses symlinked history component %s', (name) => {
    const target = path.join(main, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.symlinkSync(root, target);
    expect(() => resolveHistoryPaths(main)).toThrow(/unsafe/i);
  });
  it('refuses a symlinked project counterpart', () => {
    const source = linked();
    project(path.join(source, 'nested'));
    project(path.join(root, 'outside'));
    fs.symlinkSync(path.join(root, 'outside'), path.join(main, 'nested'));
    expect(() => resolveHistoryPaths(path.join(source, 'nested'))).toThrow();
  });
  it('refuses bare repositories including linked checkouts backed by bare primary', () => {
    const bare = path.join(root, 'bare');
    gitIn(main, 'clone', '-q', '--bare', main, bare);
    expect(() => resolveHistoryPaths(bare)).toThrow(/bare/i);
    const source = path.join(root, 'bare-linked');
    gitIn(bare, 'worktree', 'add', '-q', source);
    expect(() => resolveHistoryPaths(source)).toThrow(/bare/i);
  });
  it('refuses an unregistered checkout instead of deriving a local destination', () => {
    const source = linked();
    const impostor = path.join(root, 'impostor');
    project(impostor);
    fs.copyFileSync(path.join(source, '.git'), path.join(impostor, '.git'));
    expect(() => resolveHistoryPaths(impostor)).toThrow(/registered/);
  });
  it('refuses a missing main worktree without touching the linked tree', () => {
    const source = linked();
    fs.renameSync(main, path.join(root, 'moved-primary'));
    const before = imageOf(source);
    expect(() => resolveHistoryPaths(source)).toThrow();
    expect(imageOf(source)).toEqual(before);
  });
  it('refuses regular files where history directories should be', () => {
    fs.writeFileSync(path.join(main, '.prospec'), 'not a directory');
    expect(() => resolveHistoryPaths(main)).toThrow(/unsafe/);
  });
  it('preserves newline-containing worktree paths losslessly', () => {
    const source = path.join(root, 'linked\nline');
    gitIn(main, 'worktree', 'add', '-qb', 'newline', source);
    expect(resolveHistoryPaths(source).worktree).toBe(source);
  });
  it('proves non-Git projects without requiring configuration or creating files', () => {
    const source = path.join(root, 'plain');
    fs.mkdirSync(source);
    const before = imageOf(root);
    expect(resolveHistoryPaths(source)).toMatchObject({ historyProjectRoot: source, commonDir: null, projectPrefix: '' });
    expect(imageOf(root)).toEqual(before);
  });
  it('never downgrades a Git error or corrupt marker to non-Git', () => {
    vi.mocked(git.gitRead).mockImplementationOnce(() => { throw new Error('Git unavailable'); });
    expect(() => resolveHistoryPaths(main)).toThrow(/Git unavailable/);
    fs.writeFileSync(path.join(root, '.git'), 'broken');
    expect(() => resolveHistoryPaths(root)).toThrow();
  });
});
