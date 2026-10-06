import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RepoState } from '../../../src/types/delegation.js';
import { DRIFT_REPORT_FILENAME } from '../../../src/types/drift-report.js';
import {
  DELEGATION_REPORT_FILES,
  captureRepoState,
  describeFacet,
  describeRefChanges,
  describeStateChanges,
  diffRepoState,
  isFullyReadable,
  sameRepoState,
  sha256,
} from '../../../src/lib/repo-state.js';
import { gitIn } from '../../helpers/git-fixture.js';

vi.setConfig({ testTimeout: 30_000 });

let repo: string;
const git = (...args: string[]) => gitIn(repo, ...args);
const put = (file: string, text: string) => writeFileSync(path.join(repo, file), text);
const temps: string[] = [];
const tempRepo = (name: string) => {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), `repo-state-${name}-`)));
  temps.push(dir);
  return dir;
};

beforeEach(() => {
  repo = tempRepo('main');
  git('init', '-q', '-b', 'main');
  put('a.txt', 'one\n');
  put('b.txt', 'two\n');
  git('add', '.');
  git('commit', '-qm', 'base');
});

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const changedAfter = (act: () => void) => {
  const before = captureRepoState(repo);
  expect(isFullyReadable(before)).toBe(true);
  act();
  return diffRepoState(before, captureRepoState(repo));
};

describe('captureRepoState / diffRepoState — each facet (REQ-LIB-090)', () => {
  it('reports no change for an untouched tree', () => {
    const before = captureRepoState(repo);
    expect(sameRepoState(before, captureRepoState(repo))).toBe(true);
  });

  it('reports content when a tracked file changes', () => {
    expect(changedAfter(() => put('a.txt', 'changed\n')).changed).toEqual(['content']);
  });

  it('reports content when a repository-root report file changes — appearing untracked, or tracked and rewritten (C-1 pin)', () => {
    expect(changedAfter(() => put('prospec-report.json', '{"v":1}\n')).changed).toEqual(['content']);
    git('add', 'prospec-report.json');
    git('commit', '-qm', 'report');
    expect(changedAfter(() => put('prospec-report.json', '{"v":2}\n')).changed).toEqual(['content']);
  });

  it('treats a leftover escaped-defect-report.json as an ordinary non-ignored file (REQ-LIB-090)', () => {
    // An ordinary file and a listed report file both flip `content`, so the list itself is the
    // discriminator: only the drift report is hashed as a report token.
    expect([...DELEGATION_REPORT_FILES]).toEqual([DRIFT_REPORT_FILENAME]);
    expect(changedAfter(() => put('escaped-defect-report.json', '{}\n')).changed).toEqual(['content']);
  });

  it('reports index for a staged entry or an assume-unchanged flag outside a nested project\'s subtree (C-9 pin)', () => {
    const project = path.join(repo, 'proj');
    mkdirSync(project, { recursive: true });
    put('proj/inner.txt', 'in\n');
    git('add', 'proj/inner.txt');
    git('commit', '-qm', 'nested');
    const before = captureRepoState(project);
    put('a.txt', 'staged outside\n');
    git('add', 'a.txt');
    expect(diffRepoState(before, captureRepoState(project)).changed).toEqual(['index']);
    git('reset', '-q', 'a.txt');
    put('a.txt', 'one\n');
    const clean = captureRepoState(project);
    git('update-index', '--assume-unchanged', 'b.txt');
    expect(diffRepoState(clean, captureRepoState(project)).changed).toEqual(['index']);
  });

  it('reads the whole index although the inherited environment makes pathspecs literal (C-10 pin)', () => {
    const saved = process.env.GIT_LITERAL_PATHSPECS;
    process.env.GIT_LITERAL_PATHSPECS = '1';
    try {
      put('a.txt', 'staged\n');
      const before = captureRepoState(repo);
      expect((before.index as { digest: string }).digest).not.toBe(sha256(''));
      git('add', 'a.txt');
      expect(diffRepoState(before, captureRepoState(repo)).changed).toEqual(['index']);
    } finally {
      if (saved === undefined) delete process.env.GIT_LITERAL_PATHSPECS;
      else process.env.GIT_LITERAL_PATHSPECS = saved;
    }
  });

  it('reports head when HEAD moves without touching content (reset --soft)', () => {
    put('a.txt', 'second\n');
    git('commit', '-qam', 'second');
    expect(changedAfter(() => git('reset', '-q', '--soft', 'HEAD~1')).changed).toEqual(expect.arrayContaining(['head', 'refs']));
  });

  it('reports head when the branch switches', () => {
    git('branch', 'other');
    expect(changedAfter(() => git('switch', '-q', 'other')).changed).toEqual(['head']);
  });

  it('reports head when an in-progress operation marker appears', () => {
    git('switch', '-q', '-c', 'side');
    put('c.txt', 'side\n');
    git('add', 'c.txt');
    git('commit', '-qm', 'side');
    git('switch', '-q', 'main');
    const diff = changedAfter(() => git('merge', '--no-commit', '--no-ff', '-q', 'side'));
    expect(diff.changed).toContain('head');
    expect((captureRepoState(repo).head as { operations: string[] }).operations).toContain('MERGE_HEAD');
  });

  it('reports index when an entry is staged, and when only the skip-worktree flag flips', () => {
    expect(changedAfter(() => { put('new.txt', 'n\n'); git('add', 'new.txt'); }).changed).toContain('index');
    const diff = changedAfter(() => git('update-index', '--skip-worktree', 'b.txt'));
    expect(diff.changed).toEqual(['index']);
    expect((captureRepoState(repo).index as { blockers: string[] }).blockers).toEqual(['skip-worktree']);
  });

  it('reports index when only the assume-unchanged flag flips', () => {
    expect(changedAfter(() => git('update-index', '--assume-unchanged', 'a.txt')).changed).toEqual(['index']);
    expect((captureRepoState(repo).index as { blockers: string[] }).blockers).toEqual([]);
  });

  it('reports refs when a local branch or tag moves', () => {
    expect(changedAfter(() => git('tag', 'v1')).changed).toEqual(['refs']);
    expect(changedAfter(() => git('branch', 'feature')).changed).toEqual(['refs']);
  });

  it('reports stash when any entry changes, the newest or an older one', () => {
    expect(changedAfter(() => { put('a.txt', 'x\n'); git('stash', '-q'); }).changed).toEqual(['stash']);
    put('b.txt', 'y\n');
    git('stash', '-q');
    // Dropping the OLDER entry leaves refs/stash itself where it was.
    const top = git('rev-parse', 'refs/stash');
    const diff = changedAfter(() => git('stash', 'drop', '-q', 'stash@{1}'));
    expect(git('rev-parse', 'refs/stash')).toBe(top);
    expect(diff.changed).toEqual(['stash']);
  });
});

describe('what no facet sees (REQ-LIB-090)', () => {
  it('does not report a stat-cache refresh (git status) or a remote-tracking ref move (git fetch)', () => {
    const other = tempRepo('remote');
    execFileSync('git', ['clone', '-q', repo, other], { stdio: 'pipe' });
    gitIn(other, 'commit', '-q', '--allow-empty', '-m', 'r');
    git('remote', 'add', 'origin', other);
    const diff = changedAfter(() => {
      const future = new Date(Date.now() + 60_000);
      utimesSync(path.join(repo, 'a.txt'), future, future);
      git('status', '--porcelain');
      git('fetch', '-q', '--no-tags', 'origin');
    });
    expect(diff).toEqual({ changed: [], unreadable: [] });
  });

  it('does not report a `git maintenance` prefetch ref', () => {
    expect(changedAfter(() => git('update-ref', 'refs/prefetch/remotes/origin/main', 'HEAD'))).toEqual({ changed: [], unreadable: [] });
  });

  it('does report a tag a fetch auto-follows — it is a local ref', () => {
    const other = tempRepo('tags');
    execFileSync('git', ['clone', '-q', repo, other], { stdio: 'pipe' });
    gitIn(other, 'commit', '-q', '--allow-empty', '-m', 'r');
    gitIn(other, 'tag', 'v9');
    git('remote', 'add', 'origin', other);
    const diff = changedAfter(() => git('fetch', '-q', 'origin'));
    expect(diff.changed).toEqual(['refs']);
  });
});

describe('unreadable facets (REQ-LIB-090)', () => {
  it('marks content unreadable, never unchanged, while the index is unmerged', () => {
    git('switch', '-q', '-c', 'side');
    put('a.txt', 'side\n');
    git('commit', '-qam', 'side');
    git('switch', '-q', 'main');
    put('a.txt', 'main\n');
    git('commit', '-qam', 'main');
    const before = captureRepoState(repo);
    try {
      git('merge', '-q', 'side');
    } catch {
      // The conflict is the point.
    }
    const after = captureRepoState(repo);
    const diff = diffRepoState(before, after);
    expect(diff.unreadable).toContain('content');
    expect(diff.changed).toContain('index');
    expect((after.index as { blockers: string[] }).blockers).toContain('unmerged');
    expect(sameRepoState(before, after)).toBe(false);
  });

  it('records a staged gitlink as an index blocker and the content as unreadable', () => {
    const nested = path.join(repo, 'nested');
    execFileSync('git', ['init', '-q', nested], { stdio: 'pipe' });
    writeFileSync(path.join(nested, 'f'), 'x');
    gitIn(nested, 'add', 'f');
    gitIn(nested, 'commit', '-qm', 'n');
    git('add', 'nested');
    const state = captureRepoState(repo);
    expect((state.index as { blockers: string[] }).blockers).toEqual(['gitlink']);
    expect(state.content).toEqual({ unreadable: expect.stringContaining('nested') });
    expect(isFullyReadable(state)).toBe(false);
  });

  it('keeps the content unreadable for a gitlink whose directory is gone', () => {
    const nested = path.join(repo, 'nested');
    execFileSync('git', ['init', '-q', nested], { stdio: 'pipe' });
    writeFileSync(path.join(nested, 'f'), 'x');
    gitIn(nested, 'add', 'f');
    gitIn(nested, 'commit', '-qm', 'n');
    git('add', 'nested');
    git('commit', '-qm', 'gitlink');
    rmSync(nested, { recursive: true, force: true });
    expect(captureRepoState(repo).content).toHaveProperty('unreadable');
  });

  it('reads the content of a project whose gitlink lies outside its directory', () => {
    const nested = path.join(repo, 'nested');
    execFileSync('git', ['init', '-q', nested], { stdio: 'pipe' });
    writeFileSync(path.join(nested, 'f'), 'x');
    gitIn(nested, 'add', 'f');
    gitIn(nested, 'commit', '-qm', 'n');
    mkdirSync(path.join(repo, 'proj'));
    put('proj/p.txt', 'p\n');
    git('add', '.');
    git('commit', '-qm', 'project beside a gitlink');
    expect(captureRepoState(path.join(repo, 'proj')).content).toHaveProperty('digest');
  });

  it('returns every facet unreadable with its reason outside a repository', () => {
    const plain = tempRepo('plain');
    const state = captureRepoState(plain);
    for (const facet of ['content', 'head', 'index', 'refs', 'stash'] as const) {
      expect(state[facet], facet).toHaveProperty('unreadable');
      expect((state[facet] as { unreadable: string }).unreadable.length).toBeGreaterThan(0);
    }
  });
});

describe('diffRepoState / describeFacet are pure (REQ-LIB-090)', () => {
  const D = (c: string) => c.repeat(64);
  const O = (c: string) => c.repeat(40);
  const base: RepoState = {
    content: { digest: D('a') },
    head: { ref: 'refs/heads/main', commit: O('1'), operations: ['MERGE_HEAD', 'BISECT_LOG'] },
    index: { digest: D('b'), blockers: [] },
    refs: { entries: [{ name: 'refs/heads/main', oid: O('1') }] },
    stash: { entries: [] },
  };

  it('returns the changed facets and treats an unreadable side as unreadable, never unchanged', () => {
    const after: RepoState = { ...base, content: { unreadable: 'nested repository' }, stash: { entries: [O('2')] } };
    expect(diffRepoState(base, after)).toEqual({ changed: ['stash'], unreadable: ['content'] });
    expect(sameRepoState(base, after)).toBe(false);
  });

  it('ignores the order of operation markers', () => {
    const after: RepoState = { ...base, head: { ref: 'refs/heads/main', commit: O('1'), operations: ['BISECT_LOG', 'MERGE_HEAD'] } };
    expect(diffRepoState(base, after)).toEqual({ changed: [], unreadable: [] });
  });

  it('describes a facet value, an unreadable one with its reason', () => {
    expect(describeFacet(base, 'head')).toBe(`refs/heads/main @ ${O('1')} [MERGE_HEAD, BISECT_LOG]`);
    expect(describeFacet({ ...base, content: { unreadable: 'why' } }, 'content')).toBe('unreadable (why)');
    expect(describeFacet(base, 'stash')).toBe('0 entries');
  });

  it('names the refs that were added, removed or moved', () => {
    const after: RepoState = {
      ...base,
      refs: { entries: [{ name: 'refs/heads/main', oid: O('2') }, { name: 'refs/tags/v1', oid: O('1') }] },
    };
    expect(describeRefChanges(base, after)).toEqual(['refs/heads/main moved', 'refs/tags/v1 added']);
    expect(describeRefChanges(after, base)).toEqual(['refs/heads/main moved', 'refs/tags/v1 removed']);
    expect(describeRefChanges(base, base)).toEqual([]);
  });

  it('describes each changed or unreadable facet with both values, naming the refs that moved', () => {
    const after: RepoState = {
      ...base,
      content: { unreadable: 'nested repository' },
      refs: { entries: [{ name: 'refs/heads/main', oid: O('1') }, { name: 'refs/tags/v1', oid: O('1') }] },
    };
    expect(describeStateChanges(base, after)).toEqual([
      { facet: 'content', before: D('a'), after: 'unreadable (nested repository)' },
      { facet: 'refs', before: '1 ref(s)', after: '2 ref(s) (refs/tags/v1 added)' },
    ]);
    expect(describeStateChanges(base, base)).toEqual([]);
  });
});
