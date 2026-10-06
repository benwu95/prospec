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
import { GIT_ID, gitIn } from '../../helpers/git-fixture.js';

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
  it('refuses skipped sparse inputs', () => {
    git('update-index', '--skip-worktree', 'input.txt');
    expect(computeChangeState(root)).toMatchObject({ digest: null, reason: expect.stringContaining('input.txt') });
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

describe('gitlink inputs', () => {
  const sources: string[] = [];
  afterEach(() => { for (const dir of sources.splice(0)) rmSync(dir, { recursive: true, force: true }); });
  const state = (cwd = root) => computeChangeState(cwd);
  const source = (name: string): string => {
    const dir = mkdtempSync(path.join(os.tmpdir(), `snapshot-${name}-`)); sources.push(dir);
    gitIn(dir, 'init', '-q'); writeFileSync(path.join(dir, 'lib.txt'), 'v1'); gitIn(dir, 'add', '.'); gitIn(dir, 'commit', '-qm', 'v1');
    writeFileSync(path.join(dir, 'lib.txt'), 'v2'); gitIn(dir, 'commit', '-qam', 'v2');
    return dir;
  };
  const addSubmodule = (src: string, at: string, cwd = root): void => {
    gitIn(cwd, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', src, at);
    gitIn(cwd, 'commit', '-qm', `add ${at}`);
  };
  const sub = (...parts: string[]) => path.join(root, 'vendor/shared', ...parts);

  it('keeps the identity of a repository without gitlinks', () => {
    expect(digest()).toBe('ec1ad9402094e613e89cc76adf76fb3c90f1ab7eb3791f5519bca9d959c24131');
    expect(state().gitlinks ?? []).toEqual([]);
  });

  describe('with a submodule', () => {
    beforeEach(() => addSubmodule(source('shared'), 'vendor/shared'));

    it('captures a clean submodule and lists it', () => {
      expect(digest()).toMatch(/^[a-f0-9]{64}$/);
      expect(state().gitlinks).toEqual(['vendor/shared']);
    });
    it('changes identity with the checked-out commit and keeps it across staging and commit', () => {
      const before = digest();
      gitIn(sub(), 'checkout', '-q', 'HEAD~1'); const moved = digest();
      expect(moved).toBeTruthy(); expect(moved).not.toBe(before);
      git('add', 'vendor/shared'); expect(digest()).toBe(moved);
      git('commit', '-qm', 'pin v1'); expect(digest()).toBe(moved);
    });
    it.each([
      ['a tracked modification', () => writeFileSync(sub('lib.txt'), 'edited')],
      ['an untracked file', () => writeFileSync(sub('new.txt'), 'x')],
      ['an assume-unchanged entry', () => gitIn(sub(), 'update-index', '--assume-unchanged', 'lib.txt')],
      ['a skip-worktree entry', () => gitIn(sub(), 'update-index', '--skip-worktree', 'lib.txt')],
    ])('refuses %s naming the gitlink', (_name, dirty) => {
      dirty();
      expect(state()).toMatchObject({ digest: null, reason: expect.stringContaining('vendor/shared') });
    });
    it('ignores what the submodule ignores', () => {
      writeFileSync(path.resolve(sub(), gitIn(sub(), 'rev-parse', '--git-path', 'info/exclude')), 'build/\n', { flag: 'a' });
      const before = digest(); mkdirSync(sub('build')); writeFileSync(sub('build', 'out.txt'), 'x');
      expect(digest()).toBe(before);
    });
    it('reports dirt the repository configuration would hide', () => {
      git('config', 'submodule.vendor/shared.ignore', 'all'); git('config', 'diff.ignoreSubmodules', 'all');
      gitIn(sub(), 'config', 'status.showUntrackedFiles', 'no');
      writeFileSync(sub('new.txt'), 'x');
      expect(digest()).toBeNull();
    });
    it('uses the recorded commit for an empty directory and refuses unrecorded content', () => {
      const before = digest();
      git('submodule', 'deinit', '-q', '-f', 'vendor/shared');
      expect(digest()).toBe(before);
      writeFileSync(sub('stray.txt'), 'x'); expect(digest()).toBeNull();
    });
    it('refuses a .git that resolves to the enclosing repository', () => {
      git('submodule', 'deinit', '-q', '-f', 'vendor/shared');
      mkdirSync(sub('.git')); expect(digest()).toBeNull();
    });
    it('follows the confirmed-deletion rule for an absent directory', () => {
      const before = digest(); rmSync(sub(), { recursive: true, force: true });
      const deleted = digest(); expect(deleted).toBeTruthy(); expect(deleted).not.toBe(before);
      expect(state().gitlinks).toEqual(['vendor/shared']);
    });
    it('stays unprovable when configuration hides the deletion', () => {
      git('config', 'submodule.vendor/shared.ignore', 'all');
      rmSync(sub(), { recursive: true, force: true }); expect(digest()).toBeNull();
    });
    it('is not redirected by an inherited GIT_DIR', () => {
      const before = digest(); const saved = process.env.GIT_DIR;
      process.env.GIT_DIR = path.join(root, '.git');
      try { expect(digest()).toBe(before); } finally {
        if (saved === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = saved;
      }
    });
  });

  it('checks nested submodules at their own level', () => {
    const mid = source('mid');
    gitIn(mid, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', source('leaf'), 'leaf'); gitIn(mid, 'commit', '-qm', 'leaf');
    addSubmodule(mid, 'mid');
    gitIn(root, '-c', 'protocol.file.allow=always', 'submodule', 'update', '-q', '--init', '--recursive');
    const before = digest(); expect(before).toBeTruthy();
    gitIn(path.join(root, 'mid'), 'config', 'submodule.leaf.ignore', 'all');
    gitIn(path.join(root, 'mid'), 'config', 'status.showUntrackedFiles', 'no');
    writeFileSync(path.join(root, 'mid/leaf/new.txt'), 'x');
    expect(state()).toMatchObject({ digest: null, reason: expect.stringContaining('mid') });
    rmSync(path.join(root, 'mid/leaf/new.txt')); writeFileSync(path.join(root, 'mid/leaf/lib.txt'), 'edited');
    expect(digest()).toBeNull();
  });
  const nest = (parent: string, child: string, at: string): void => {
    gitIn(parent, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', child, at); gitIn(parent, 'commit', '-qm', at);
  };
  it('refuses a nested pin moved under its parent\'s ignore setting', () => {
    const mid = source('mid'); nest(mid, source('leaf'), 'leaf');
    addSubmodule(mid, 'mid');
    gitIn(root, '-c', 'protocol.file.allow=always', 'submodule', 'update', '-q', '--init', '--recursive');
    expect(digest()).toBeTruthy();
    gitIn(path.join(root, 'mid'), 'config', 'submodule.leaf.ignore', 'all');
    gitIn(path.join(root, 'mid/leaf'), 'checkout', '-q', 'HEAD~1');
    expect(digest()).toBeNull();
  });
  it('checks a third level its own parent\'s settings would hide', () => {
    const leaf = source('leaf'); nest(leaf, source('deep'), 'deep');
    const mid = source('mid'); nest(mid, leaf, 'leaf');
    addSubmodule(mid, 'mid');
    gitIn(root, '-c', 'protocol.file.allow=always', 'submodule', 'update', '-q', '--init', '--recursive');
    expect(digest()).toBeTruthy();
    gitIn(path.join(root, 'mid/leaf'), 'config', 'submodule.deep.ignore', 'all');
    writeFileSync(path.join(root, 'mid/leaf/deep/lib.txt'), 'edited');
    expect(digest()).toBeNull();
  });
  it('refuses what a nested submodule directory holds outside a checkout', () => {
    const mid = source('mid'); nest(mid, source('leaf'), 'leaf');
    addSubmodule(mid, 'mid');
    gitIn(root, '-c', 'protocol.file.allow=always', 'submodule', 'update', '-q', '--init');
    expect(digest()).toBeTruthy();
    writeFileSync(path.join(root, 'mid/leaf/stray.txt'), 'x');
    expect(state()).toMatchObject({ digest: null, reason: expect.stringContaining('outside a checkout: mid') });
    rmSync(path.join(root, 'mid/leaf'), { recursive: true, force: true }); writeFileSync(path.join(root, 'mid/leaf'), 'file');
    expect(state()).toMatchObject({ digest: null, reason: expect.stringContaining('mid') });
  });
  it('captures a gitlink without .gitmodules', () => {
    const nested = path.join(root, 'nested'); mkdirSync(nested);
    gitIn(nested, 'init', '-q'); writeFileSync(path.join(nested, 'f.txt'), 'x'); gitIn(nested, 'add', '.'); gitIn(nested, 'commit', '-qm', 'n');
    git('add', 'nested');
    expect(digest()).toBeTruthy(); expect(state().gitlinks).toEqual(['nested']);
  });
  it('resolves gitlinks relative to a project nested in its repository', () => {
    mkdirSync(path.join(root, 'proj')); put('proj/file.txt', 'p'); git('add', '.'); git('commit', '-qm', 'proj');
    addSubmodule(source('shared'), 'proj/vendor/shared');
    const project = path.join(root, 'proj');
    expect(state(project).gitlinks).toEqual(['vendor/shared']);
    writeFileSync(path.join(project, 'vendor/shared/lib.txt'), 'edited');
    expect(state(project)).toMatchObject({ digest: null, reason: expect.stringContaining('vendor/shared') });
  });
  it('leaves a gitlink under .prospec/ out of scope', () => {
    mkdirSync(path.join(root, '.prospec'));
    addSubmodule(source('shared'), '.prospec/vendor');
    const before = digest(); expect(before).toBeTruthy(); expect(state().gitlinks ?? []).toEqual([]);
    writeFileSync(path.join(root, '.prospec/vendor/lib.txt'), 'edited'); expect(digest()).toBe(before);
  });
});
