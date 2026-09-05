import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { changedPathsFromWorkTree, computeChangeState } from '../../../src/lib/drift-sources.js';

vi.setConfig({ testTimeout: 30_000 });
let root: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
const put = (file: string, bytes: string | Buffer) => writeFileSync(path.join(root, file), bytes);
const digest = () => computeChangeState(root).digest;
beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'snapshot-v2-'));
  git('init', '-q'); git('config', 'user.name', 'test'); git('config', 'user.email', 'test@example.com');
  put('input.txt', 'one'); git('add', '.'); git('commit', '-qm', 'base');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

// Windows cannot construct control-character filenames or reliably exercise POSIX modes/symlinks.
describe('effective repository inputs', () => {
  it.each(process.platform === 'win32' ? ['中文.txt', ' space .txt'] : ['中文.txt', ' space .txt', 'tab\t.txt', 'line\n.txt', 'back\\slash.txt'])(
    'preserves exact paths and detects content: %j', (file) => {
      put(file, 'one'); const before = digest();
      expect(before).toBeTruthy();
      expect(changedPathsFromWorkTree(root)).toContain(file);
      put(file, 'two'); expect(digest()).not.toBe(before);
    },
  );
  it.each(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'package.json', 'README.md'])(
    'includes %s', (file) => { put(file, 'one'); const before = digest(); put(file, 'two'); expect(digest()).not.toBe(before); },
  );
  it('has one identity across staging, commit, amend and equivalent history', () => {
    put('input.txt', 'two'); const before = digest(); expect(before).toBeTruthy();
    git('add', '.'); expect(digest()).toBe(before);
    git('commit', '-qm', 'change'); expect(digest()).toBe(before);
    git('commit', '--amend', '-qm', 'renamed'); expect(digest()).toBe(before);
    git('commit', '--allow-empty', '-qm', 'same content'); expect(digest()).toBe(before);
  });
  it('keeps a deletion identical before and after commit', () => {
    const before = digest(); unlinkSync(path.join(root, 'input.txt')); const deleted = digest();
    expect(deleted).toBeTruthy(); expect(deleted).not.toBe(before);
    git('add', '-u'); expect(digest()).toBe(deleted); git('commit', '-qm', 'delete'); expect(digest()).toBe(deleted);
  });
  it('excludes owned bookkeeping and ignored untracked outputs, includes tracked generated inputs', () => {
    put('.gitignore', 'out/\n'); git('add', '.'); git('commit', '-qm', 'ignore');
    const before = digest(); mkdirSync(path.join(root, '.prospec')); put('.prospec/report.json', 'a');
    mkdirSync(path.join(root, 'out')); put('out/result.txt', 'a'); expect(digest()).toBe(before);
    mkdirSync(path.join(root, '.agents')); put('.agents/generated.md', 'a'); expect(digest()).not.toBe(before);
    git('add', '-f', 'out/result.txt'); const tracked = digest(); put('out/result.txt', 'b'); expect(digest()).not.toBe(tracked);
  });
  it.skipIf(process.platform === 'win32')('hashes binary bytes and executable mode', () => {
    const before = digest(); put('input.txt', Buffer.from([0, 1, 255])); const binary = digest(); expect(binary).not.toBe(before);
    chmodSync(path.join(root, 'input.txt'), 0o755); expect(digest()).not.toBe(binary);
  });
  it.skipIf(process.platform === 'win32')('certifies a represented symlink target and refuses external/dangling targets', () => {
    symlinkSync('input.txt', path.join(root, 'link')); expect(digest()).toBeTruthy();
    unlinkSync(path.join(root, 'link')); symlinkSync('../outside', path.join(root, 'link')); expect(digest()).toBeNull();
  });
  it('supports unborn HEAD but refuses non-Git input', () => {
    rmSync(path.join(root, '.git'), { recursive: true }); expect(digest()).toBeNull();
    git('init', '-q'); expect(digest()).toBeTruthy();
  });
});

describe('unprovable inputs', () => {
  it.skipIf(process.platform === 'win32')('refuses unreadable regular inputs rather than hashing just a path', () => {
    chmodSync(path.join(root, 'input.txt'), 0);
    expect(computeChangeState(root)).toMatchObject({ digest: null, reason: expect.stringMatching(/EACCES|permission/i) });
  });
  it('refuses skipped sparse inputs and gitlinks', () => {
    git('update-index', '--skip-worktree', 'input.txt'); expect(digest()).toBeNull();
    git('update-index', '--no-skip-worktree', 'input.txt');
    const head = git('rev-parse', 'HEAD').toString().trim();
    git('update-index', '--add', '--cacheinfo', `160000,${head},module`); expect(digest()).toBeNull();
  });
  it.skipIf(process.platform === 'win32')('refuses non-roundtrippable filename bytes from the worktree or index', () => {
    // Linux permits invalid UTF-8 in the worktree; macOS does not. Git's index
    // represents the same raw path on both, so both platforms exercise refusal.
    if (process.platform !== 'darwin') {
      const rawPath = Buffer.concat([Buffer.from(`${root}/`), Buffer.from([255])]);
      writeFileSync(rawPath, 'input');
      expect(computeChangeState(root)).toMatchObject({ digest: null, reason: expect.stringContaining('losslessly') });
      unlinkSync(rawPath);
    }
    const blob = git('rev-parse', 'HEAD:input.txt').toString().trim();
    execFileSync('git', ['update-index', '-z', '--index-info'], {
      cwd: root,
      input: Buffer.concat([Buffer.from(`100644 ${blob}\t`), Buffer.from([255, 0])]),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    expect(computeChangeState(root)).toMatchObject({ digest: null, reason: expect.stringContaining('losslessly') });
  });
});

it('keeps nested project paths scoped and deletion identity stable (F-265-2)', () => {
  const project = path.join(root, 'packages/app');
  mkdirSync(path.join(project, 'src'), { recursive: true });
  writeFileSync(path.join(project, 'src/input.ts'), 'old');
  git('add', '.'); git('commit', '-qm', 'nested');
  put('input.txt', 'outside project');
  writeFileSync(path.join(project, 'src/input.ts'), 'new');
  mkdirSync(path.join(project, '.prospec'), { recursive: true });
  writeFileSync(path.join(project, '.prospec/notes.md'), 'bookkeeping');
  expect(changedPathsFromWorkTree(project)).toEqual(['src/input.ts']);
  unlinkSync(path.join(project, 'src/input.ts'));
  const deleted = computeChangeState(project);
  expect(deleted.digest).not.toBeNull();
  git('add', '-u'); expect(computeChangeState(project).digest).toBe(deleted.digest);
  git('commit', '-qm', 'nested deletion'); expect(computeChangeState(project).digest).toBe(deleted.digest);
});
