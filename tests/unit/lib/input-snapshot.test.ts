import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { changedPathsFromWorkTree, collectGitTimestamps, computeChangeState } from '../../../src/lib/drift-sources.js';

import type { ModuleMap } from '../../../src/types/module-map.js';
import { evaluateKnowledgeHealth } from '../../../src/lib/drift-checker.js';
import { parseYaml } from '../../../src/lib/yaml-utils.js';
import { execute as stampKnowledge } from '../../../src/services/knowledge-verify.service.js';
import { GIT_ID } from '../../helpers/git-fixture.js';

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
  // Pinned from the pre-#352 implementation (main 4309e665): admitting gitlinks must
  // leave every gitlink-free repository's identity byte-identical.
  it('keeps the gitlink-free identity byte-identical to the pre-gitlink snapshot', () => {
    expect(computeChangeState(root)).toEqual({ digest: 'ec1ad9402094e613e89cc76adf76fb3c90f1ab7eb3791f5519bca9d959c24131', clean: true });
  });
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
  it('refuses skipped sparse inputs', () => {
    git('update-index', '--skip-worktree', 'input.txt');
    expect(computeChangeState(root)).toMatchObject({ digest: null, reason: expect.stringContaining('sparse') });
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

// #352: a gitlink is proven by the bytes its checkout holds — the same rules as the
// superproject's own files — never by the commit it names (R1-2, R2-1, R2-2).
describe('gitlink (submodule) inputs', () => {
  let upstream: string;
  let nested: string;
  const sub = (...args: string[]) => execFileSync('git', args, { cwd: path.join(root, 'module'), stdio: 'pipe' });
  const inner = (...args: string[]) => execFileSync('git', args, { cwd: path.join(root, 'module/inner'), stdio: 'pipe' });
  const commitIn = (cwd: string, file: string, bytes: string) => {
    writeFileSync(path.join(cwd, file), bytes);
    execFileSync('git', ['add', '.'], { cwd, stdio: 'pipe' });
    execFileSync('git', [...GIT_ID, 'commit', '-qm', bytes], { cwd, stdio: 'pipe' });
  };
  const commitRoot = (message: string) => execFileSync('git', [...GIT_ID, 'commit', '-qm', message], { cwd: root, stdio: 'pipe' });
  const nest = () => {
    sub('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', nested, 'inner');
    execFileSync('git', [...GIT_ID, 'commit', '-qm', 'nest'], { cwd: path.join(root, 'module'), stdio: 'pipe' });
    git('add', 'module'); commitRoot('pin nest');
  };
  beforeEach(() => {
    upstream = mkdtempSync(path.join(os.tmpdir(), 'snapshot-sub-'));
    nested = mkdtempSync(path.join(os.tmpdir(), 'snapshot-nested-'));
    execFileSync('git', ['init', '-q'], { cwd: upstream, stdio: 'pipe' });
    commitIn(upstream, 'shared.md', 'v1'); commitIn(upstream, 'shared.md', 'v2');
    execFileSync('git', ['init', '-q'], { cwd: nested, stdio: 'pipe' });
    commitIn(nested, 'deep.md', 'deep-1'); commitIn(nested, 'deep.md', 'deep-2');
    git('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', upstream, 'module');
    commitRoot('add submodule');
  });
  afterEach(() => { rmSync(upstream, { recursive: true, force: true }); rmSync(nested, { recursive: true, force: true }); });

  it('certifies a clean submodule and keeps one identity across moving, staging and committing its pin', () => {
    const pinned = computeChangeState(root);
    expect(pinned).toMatchObject({ digest: expect.any(String), clean: true, gitlinks: ['module'] });
    sub('checkout', '-q', 'HEAD~1'); const moved = digest();
    expect(moved).toBeTruthy(); expect(moved).not.toBe(pinned.digest);
    git('add', 'module'); expect(digest()).toBe(moved);
    commitRoot('move pin'); expect(digest()).toBe(moved);
  });
  it('hashes uncommitted and untracked work inside the submodule like superproject work', () => {
    const clean = digest();
    writeFileSync(path.join(root, 'module/shared.md'), 'local edit'); const edited = digest();
    expect(edited).toBeTruthy(); expect(edited).not.toBe(clean);
    writeFileSync(path.join(root, 'module/new.md'), 'untracked');
    expect(digest()).toBeTruthy(); expect(digest()).not.toBe(edited);
  });
  it('separates an uninitialized checkout from the initialized one (R1-2)', () => {
    const initialized = digest();
    git('submodule', 'deinit', '-q', '-f', 'module'); const empty = digest();
    expect(empty).toBeTruthy(); expect(empty).not.toBe(initialized);
    // No files are present, so the pin it names does not enter the identity.
    const head = git('rev-parse', 'HEAD:module').toString().trim();
    const previous = execFileSync('git', ['rev-parse', `${head}~1`], { cwd: upstream, stdio: 'pipe' }).toString().trim();
    git('update-index', '--cacheinfo', `160000,${previous},module`);
    expect(digest()).toBe(empty);
  });
  it('marks an uninitialized gitlink, apart from no gitlink and from a checkout with no files', () => {
    sub('rm', '-q', 'shared.md');
    execFileSync('git', [...GIT_ID, 'commit', '-qm', 'empty'], { cwd: path.join(root, 'module'), stdio: 'pipe' });
    git('add', 'module'); commitRoot('pin empty');
    const emptyCheckout = digest();
    git('submodule', 'deinit', '-q', '-f', 'module'); const uninitialized = digest();
    expect(uninitialized).toBeTruthy(); expect(uninitialized).not.toBe(emptyCheckout);
    git('rm', '-q', '--cached', 'module'); rmSync(path.join(root, 'module'), { recursive: true, force: true });
    expect(digest()).toBeTruthy(); expect(digest()).not.toBe(uninitialized);
  });
  it('follows checkout bytes the commit does not fix (R2-1)', () => {
    const clean = digest();
    // A smudge filter or line-ending conversion changes bytes git status reports clean.
    sub('update-index', '--assume-unchanged', 'shared.md');
    writeFileSync(path.join(root, 'module/shared.md'), 'smudged');
    expect(digest()).toBeTruthy(); expect(digest()).not.toBe(clean);
  });
  it('follows a nested submodule checkout (R2-2)', () => {
    nest();
    const pinned = computeChangeState(root);
    expect(pinned).toMatchObject({ digest: expect.any(String), gitlinks: ['module', 'module/inner'] });
    inner('checkout', '-q', 'HEAD~1');
    expect(digest()).toBeTruthy(); expect(digest()).not.toBe(pinned.digest);
  });
  it.each([
    ['skip-worktree', () => { sub('update-index', '--skip-worktree', 'shared.md'); }, 'module/shared.md'],
    ['sparse-checkout', () => { sub('sparse-checkout', 'set', '--no-cone', '/nothing'); }, 'module/shared.md'],
    ['unmerged', () => {
      const blob = sub('hash-object', '-w', '--stdin').toString().trim();
      execFileSync('git', ['update-index', '--index-info'], { cwd: path.join(root, 'module'), input: `100644 ${blob} 1\tconflict.md\n`, stdio: ['pipe', 'pipe', 'pipe'] });
    }, 'module/conflict.md'],
  ])('refuses a submodule %s entry by its superproject path', (_kind, arrange, file) => {
    arrange();
    expect(computeChangeState(root)).toMatchObject({ digest: null, reason: `Unprovable sparse or unmerged input: ${file}` });
  });
  it('refuses a skip-worktree entry of a nested submodule by its full path', () => {
    nest();
    inner('update-index', '--skip-worktree', 'deep.md');
    expect(computeChangeState(root)).toMatchObject({ digest: null, reason: 'Unprovable sparse or unmerged input: module/inner/deep.md' });
  });
  it('refuses a non-empty gitlink directory that is not a checkout', () => {
    git('submodule', 'deinit', '-q', '-f', 'module');
    writeFileSync(path.join(root, 'module/stray.md'), 'not a checkout');
    expect(computeChangeState(root)).toMatchObject({ digest: null, reason: 'Unprovable gitlink checkout: module' });
  });
  it('keeps a submodule deletion identical before and after it is committed', () => {
    const clean = digest();
    unlinkSync(path.join(root, 'module/shared.md')); const deleted = digest();
    expect(deleted).toBeTruthy(); expect(deleted).not.toBe(clean);
    sub('rm', '-q', '--cached', 'shared.md'); expect(digest()).toBe(deleted);
    execFileSync('git', [...GIT_ID, 'commit', '-qm', 'drop'], { cwd: path.join(root, 'module'), stdio: 'pipe' });
    expect(digest()).toBe(deleted);
    git('add', 'module'); commitRoot('pin drop'); expect(digest()).toBe(deleted);
  });
  it('counts the submodule own .prospec files, which are not this project bookkeeping', () => {
    const clean = digest();
    mkdirSync(path.join(root, 'module/.prospec'));
    writeFileSync(path.join(root, 'module/.prospec/notes.md'), 'theirs');
    expect(digest()).toBeTruthy(); expect(digest()).not.toBe(clean);
  });
  it.skipIf(process.platform === 'win32')('certifies a superproject symlink into a submodule file', () => {
    symlinkSync('module/shared.md', path.join(root, 'link'));
    expect(computeChangeState(root)).toMatchObject({ digest: expect.any(String) });
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

// Knowledge uses committed source dates; provenance hashes effective input bytes.
it('separates equivalent commit provenance from cross-UTC-day Knowledge freshness', async () => {
  mkdirSync(path.join(root, 'src/lib'), { recursive: true });
  mkdirSync(path.join(root, 'prospec/ai-knowledge/modules/lib'), { recursive: true });
  put('.prospec.yaml', 'project:\n  name: fixture\n');
  const mapPath = 'prospec/ai-knowledge/module-map.yaml';
  put(mapPath, 'modules:\n  - name: lib\n    paths: [src/lib]\n    keywords: [lib]\n    last_verified: "2026-10-01T08:00:00Z"\n');
  put('src/lib/value.ts', 'export const value = 1;\n');
  put('prospec/ai-knowledge/modules/lib/README.md', '# lib\n\nExports value.\n');
  const commitAt = (date: string) => {
    git('add', '.');
    execFileSync('git', [...GIT_ID, 'commit', '-qm', 'fixture source'], {
      cwd: root, stdio: 'pipe',
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    });
  };
  const health = () => evaluateKnowledgeHealth(collectGitTimestamps(
    root, parseYaml<ModuleMap>(readFileSync(path.join(root, mapPath), 'utf8')),
    'prospec/ai-knowledge', [],
  ));
  commitAt('2026-10-01T07:00:00Z');
  put('src/lib/value.ts', 'export const value = 2;\n');
  const beforeCommit = digest();
  expect(beforeCommit).not.toBeNull();
  expect(health().result.status).toBe('pass');

  commitAt('2026-10-02T09:00:00Z');
  expect(digest()).toBe(beforeCommit);
  expect(health()).toMatchObject({ result: { status: 'warn' }, knowledgeHealth: { modules: [{ name: 'lib', stale: true }] } });

  await stampKnowledge({ cwd: root, modules: ['lib'], now: '2026-10-02T12:00:00Z' });
  expect(health().result.status).toBe('pass');
  expect(digest()).not.toBe(beforeCommit);
});
