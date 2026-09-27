import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computeChangeState } from '../../../src/lib/drift-sources.js';
import {
  SNAPSHOT_PREFIX,
  checkpointDirOf,
  claimCheckpointDir,
  createSnapshot,
  delegationDirOf,
  ensureDelegationDir,
  releaseCheckpoint,
  releaseSnapshot,
  snapshotRoot,
  writeCheckpoint,
} from '../../../src/lib/delegation-checkpoint.js';
import { captureRepoState, diffRepoState } from '../../../src/lib/repo-state.js';
import { gitIn, imageOf } from '../../helpers/git-fixture.js';
import { usePrivateTmpdir } from '../../helpers/private-tmpdir.js';

vi.setConfig({ testTimeout: 30_000 });

// Every snapshot this file builds lands under a root only this file uses, so `leftovers()` reads a clean root.
usePrivateTmpdir('delegation-checkpoint');

let repo: string;
let project: string;
let changeDir: string;
let stemCounter = 0;
const nextStem = () => `review-t${process.pid}x${++stemCounter}-1-1`;
const git = (...args: string[]) => gitIn(repo, ...args);
const put = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(project, file)), { recursive: true });
  fs.writeFileSync(path.join(project, file), text);
};
const savedGitDir = process.env.GIT_DIR;

function setup(prefix: string, ignoreProspec = true): void {
  repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-')));
  project = path.join(repo, prefix);
  fs.mkdirSync(project, { recursive: true });
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, '.gitignore'), ignoreProspec ? '.prospec/\nnode_modules/\n' : 'node_modules/\n');
  put('src/a.ts', 'committed\n');
  put('src/b.ts', 'kept\n');
  git('add', '.');
  git('commit', '-qm', 'base');
  changeDir = path.join(project, '.prospec', 'changes', 'x');
  fs.mkdirSync(changeDir, { recursive: true });
}

async function snapshotOf(stem: string) {
  const state = captureRepoState(project);
  claimCheckpointDir(changeDir, stem);
  const checkpoint = await writeCheckpoint(project, changeDir, stem);
  const head = state.head as { commit: string | null };
  const content = state.content as { digest: string };
  const snapshot = await createSnapshot({ cwd: project, changeDir, stem, headCommit: head.commit, checkpoint, preSpawnContentDigest: content.digest });
  return { state, checkpoint, snapshot };
}

const leftovers = (stem: string) => fs.readdirSync(snapshotRoot()).filter((n) => n.startsWith(`${SNAPSHOT_PREFIX}${stem}-`));


afterEach(() => {
  if (savedGitDir === undefined) delete process.env.GIT_DIR;
  else process.env.GIT_DIR = savedGitDir;
  fs.rmSync(repo, { recursive: true, force: true });
});

describe('writeCheckpoint (REQ-LIB-091)', () => {
  beforeEach(() => setup(''));

  it('copies dirty, staged and untracked files byte for byte, lists deletions, and copies the index bytes', async () => {
    put('src/a.ts', 'modified\n');
    put('src/new.ts', 'untracked\n');
    put('src/staged.ts', 'staged\n');
    git('add', 'src/staged.ts');
    fs.rmSync(path.join(project, 'src/b.ts'));
    fs.mkdirSync(path.join(project, 'node_modules'));
    fs.writeFileSync(path.join(project, 'node_modules/dep.js'), 'x');
    fs.chmodSync(path.join(project, 'src/new.ts'), 0o755);
    const stem = 'review-r-1-1';
    claimCheckpointDir(changeDir, stem);
    const checkpoint = await writeCheckpoint(project, changeDir, stem);
    const byPath = Object.fromEntries(checkpoint.entries.map((e) => [e.path, e]));
    expect(Object.keys(byPath).sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/new.ts', 'src/staged.ts']);
    expect(byPath['src/b.ts']).toEqual({ path: 'src/b.ts', kind: 'deleted' });
    expect(byPath['src/new.ts']).toMatchObject({ kind: 'regular', mode: 0o755 });
    for (const file of ['src/a.ts', 'src/new.ts', 'src/staged.ts']) {
      const blob = path.join(checkpointDirOf(changeDir, stem), 'blobs', byPath[file]!.sha256!);
      expect(fs.readFileSync(blob)).toEqual(fs.readFileSync(path.join(project, file)));
    }
    const indexCopy = fs.readFileSync(path.join(checkpointDirOf(changeDir, stem), 'index'));
    expect(indexCopy).toEqual(fs.readFileSync(path.join(repo, '.git', 'index')));
    expect(checkpoint.index_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(checkpoint).not.toHaveProperty('ignored');
  });

  it('keeps a symlink as its recorded target and leaves no link under .prospec/ for a recheck to trip on', async () => {
    fs.symlinkSync('../outside-the-project', path.join(project, 'src/link'));
    const stem = 'review-r-1-1';
    claimCheckpointDir(changeDir, stem);
    const checkpoint = await writeCheckpoint(project, changeDir, stem);
    expect(checkpoint.entries.find((e) => e.path === 'src/link')).toMatchObject({ kind: 'symlink', target: '../outside-the-project' });
    const prospecDir = path.join(project, '.prospec');
    for (const [file, bytes] of imageOf(prospecDir)) {
      expect(bytes.startsWith('link:'), file).toBe(false);
      expect(() => fs.realpathSync(path.join(prospecDir, file)), file).not.toThrow();
    }
  });

  it('writes no byte under .git', async () => {
    put('src/a.ts', 'modified\n');
    const before = imageOf(path.join(repo, '.git'));
    const stem = 'review-r-1-1';
    claimCheckpointDir(changeDir, stem);
    await writeCheckpoint(project, changeDir, stem);
    expect(imageOf(path.join(repo, '.git'))).toEqual(before);
  });

  it('refuses, by name, a tracked path a directory now occupies (T-3 pin)', async () => {
    // Through `issueTicket` such a path is already refused by the content facet
    // (`Unsupported input kind`); this branch guards a direct caller. A tracked file
    // replaced by a directory reaches it: status reports the path deleted while it
    // exists, and lstat then finds a directory.
    fs.rmSync(path.join(project, 'src/b.ts'));
    fs.mkdirSync(path.join(project, 'src/b.ts'));
    put('src/b.ts/inner.ts', 'x\n');
    const stem = nextStem();
    claimCheckpointDir(changeDir, stem);
    await expect(writeCheckpoint(project, changeDir, stem)).rejects.toThrow(/src\/b\.ts: not a regular file or symlink/);
    expect(fs.existsSync(path.join(checkpointDirOf(changeDir, stem), 'blobs'))).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('refuses, by name, a tracked path a FIFO now occupies — git lists it as modified (T-7 pin)', async () => {
    fs.rmSync(path.join(project, 'src/b.ts'));
    execFileSync('mkfifo', [path.join(project, 'src/b.ts')]);
    const stem = nextStem();
    claimCheckpointDir(changeDir, stem);
    await expect(writeCheckpoint(project, changeDir, stem)).rejects.toThrow(/src\/b\.ts: not a regular file or symlink/);
  });

  it.skipIf(process.platform === 'win32')('issues although a clean tracked report file carries an unusual mode — only the executable bit counts (A-3 pin)', async () => {
    put('prospec-report.json', '{"v":1}\n');
    git('add', 'prospec-report.json');
    git('commit', '-qm', 'report');
    fs.chmodSync(path.join(project, 'prospec-report.json'), 0o600);
    expect(git('status', '--porcelain')).toBe('');
    const { checkpoint, snapshot } = await snapshotOf(nextStem());
    try {
      expect(checkpoint.entries).toEqual([]);
      expect(fs.readFileSync(path.join(snapshot.path, 'prospec-report.json'), 'utf8')).toBe('{"v":1}\n');
    } finally {
      fs.rmSync(snapshot.path, { recursive: true, force: true });
    }
    // The executable bit itself does count (T-12 pin).
    const before = captureRepoState(project);
    fs.chmodSync(path.join(project, 'prospec-report.json'), 0o700);
    expect(diffRepoState(before, captureRepoState(project)).changed).toEqual(['content']);
  });

  it('copies a report deleted from the index (`git rm`) as a deletion too (T-11 pin)', async () => {
    put('prospec-report.json', '{"v":1}\n');
    git('add', 'prospec-report.json');
    git('commit', '-qm', 'report');
    git('rm', '-q', 'prospec-report.json');
    const stem = nextStem();
    const { checkpoint, snapshot } = await snapshotOf(stem);
    try {
      expect(checkpoint.entries).toEqual([{ path: 'prospec-report.json', kind: 'deleted' }]);
      expect(fs.existsSync(path.join(snapshot.path, 'prospec-report.json'))).toBe(false);
    } finally {
      fs.rmSync(snapshot.path, { recursive: true, force: true });
    }
  });

  it('copies a deleted tracked report as a deletion and a project-nested report by its project path (T-6 pin)', async () => {
    put('prospec-report.json', '{"v":1}\n');
    git('add', 'prospec-report.json');
    git('commit', '-qm', 'report');
    fs.rmSync(path.join(project, 'prospec-report.json'));
    const before = captureRepoState(project);
    const stem = nextStem();
    const { checkpoint, snapshot } = await snapshotOf(stem);
    try {
      expect(checkpoint.entries).toEqual([{ path: 'prospec-report.json', kind: 'deleted' }]);
      expect(fs.existsSync(path.join(snapshot.path, 'prospec-report.json'))).toBe(false);
    } finally {
      fs.rmSync(snapshot.path, { recursive: true, force: true });
    }
    git('checkout', '--', 'prospec-report.json');
    expect(diffRepoState(before, captureRepoState(project)).changed).toEqual(['content']);
  });

  it.skipIf(process.platform === 'win32')('sees a report symlink through its target and refuses a report a directory replaced (T-6 pin)', async () => {
    fs.symlinkSync('t1.json', path.join(project, 'escaped-defect-report.json'));
    const linked = captureRepoState(project);
    fs.rmSync(path.join(project, 'escaped-defect-report.json'));
    fs.symlinkSync('t2.json', path.join(project, 'escaped-defect-report.json'));
    expect(diffRepoState(linked, captureRepoState(project)).changed).toEqual(['content']);
    fs.rmSync(path.join(project, 'escaped-defect-report.json'));
    fs.mkdirSync(path.join(project, 'escaped-defect-report.json'));
    put('escaped-defect-report.json/inner', 'x\n');
    const state = captureRepoState(project);
    expect(state.content).toMatchObject({ unreadable: expect.stringMatching(/escaped-defect-report\.json is neither a regular file nor a symlink/) });
  });

  it('copies a rewritten tracked report file and an untracked one, and the snapshot reproduces both (C-1 pin)', async () => {
    put('prospec-report.json', '{"v":1}\n');
    git('add', 'prospec-report.json');
    git('commit', '-qm', 'report');
    put('prospec-report.json', '{"v":2}\n');
    put('escaped-defect-report.json', '{"escaped":[]}\n');
    const stem = nextStem();
    const { checkpoint, snapshot } = await snapshotOf(stem);
    try {
      expect(checkpoint.entries.map((e) => e.path).sort()).toEqual(['escaped-defect-report.json', 'prospec-report.json']);
      expect(fs.readFileSync(path.join(snapshot.path, 'prospec-report.json'), 'utf8')).toBe('{"v":2}\n');
      expect(fs.readFileSync(path.join(snapshot.path, 'escaped-defect-report.json'), 'utf8')).toBe('{"escaped":[]}\n');
    } finally {
      fs.rmSync(snapshot.path, { recursive: true, force: true });
    }
  });
});

describe('claimCheckpointDir / releaseCheckpoint (REQ-LIB-091)', () => {
  beforeEach(() => setup(''));

  it('claims a stem exclusively — a second claim of the same stem stops before touching the first', () => {
    const stem = 'review-r-1-1';
    claimCheckpointDir(changeDir, stem);
    fs.writeFileSync(path.join(checkpointDirOf(changeDir, stem), 'winner'), 'x');
    expect(() => claimCheckpointDir(changeDir, stem)).toThrow(/concurrently|outlived/);
    expect(fs.readFileSync(path.join(checkpointDirOf(changeDir, stem), 'winner'), 'utf8')).toBe('x');
  });

  it('writes a .gitignore of * when it first creates .delegated/', async () => {
    await ensureDelegationDir(changeDir);
    expect(fs.readFileSync(path.join(delegationDirOf(changeDir), '.gitignore'), 'utf8')).toBe('*\n');
  });

  it('releases the directory derived from the change directory and stem', () => {
    const stem = 'review-r-1-1';
    claimCheckpointDir(changeDir, stem);
    expect(releaseCheckpoint(changeDir, stem)).toBe(true);
    expect(fs.existsSync(checkpointDirOf(changeDir, stem))).toBe(false);
  });

  it('refuses to release a stem that would lead out of .delegated/, and reports instead of throwing', () => {
    const outside = path.join(changeDir, 'keep.checkpoint');
    fs.mkdirSync(outside);
    expect(releaseCheckpoint(changeDir, '../keep')).toBe(false);
    expect(fs.existsSync(outside)).toBe(true);
  });
});

describe('.delegated/ in a project that tracks .prospec/changes/ (REQ-LIB-091)', () => {
  beforeEach(() => setup('', false));

  it('keeps the checkpoint copies out of git status', async () => {
    put('src/a.ts', 'modified\n');
    await ensureDelegationDir(changeDir);
    const stem = 'review-r-1-1';
    claimCheckpointDir(changeDir, stem);
    await writeCheckpoint(project, changeDir, stem);
    const status = git('status', '--porcelain', '--untracked-files=all');
    expect(status).not.toContain('.delegated');
    expect(status).toContain('src/a.ts');
  });
});

describe('createSnapshot (REQ-LIB-091)', () => {
  beforeEach(() => setup(''));

  it('reproduces uncommitted, untracked and staged content without touching the main index or HEAD', async () => {
    put('src/a.ts', 'modified\n');
    put('src/new.ts', 'untracked\n');
    put('src/staged.ts', 'staged\n');
    git('add', 'src/staged.ts');
    const indexBefore = fs.readFileSync(path.join(repo, '.git', 'index'));
    const headBefore = git('rev-parse', 'HEAD');
    const { snapshot } = await snapshotOf(nextStem());
    try {
      expect(fs.readFileSync(path.join(snapshot.path, 'src/a.ts'), 'utf8')).toBe('modified\n');
      expect(fs.readFileSync(path.join(snapshot.path, 'src/new.ts'), 'utf8')).toBe('untracked\n');
      // The staged addition is still staged inside the snapshot.
      const status = execFileSync('git', ['status', '--porcelain'], { cwd: snapshot.path }).toString();
      expect(status).toMatch(/^A {2}src\/staged\.ts$/m);
      expect(computeChangeState(snapshot.path).digest).toBe(computeChangeState(project).digest);
      expect(fs.readFileSync(path.join(repo, '.git', 'index'))).toEqual(indexBefore);
      expect(git('rev-parse', 'HEAD')).toBe(headBefore);
      expect(git('worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1);
    } finally {
      fs.rmSync(snapshot.path, { recursive: true, force: true });
    }
  });

  it('touches only the snapshot when an inherited GIT_DIR names the main repository', async () => {
    put('src/a.ts', 'modified\n');
    const configBefore = fs.readFileSync(path.join(repo, '.git', 'config'), 'utf8');
    const headBefore = fs.readFileSync(path.join(repo, '.git', 'HEAD'), 'utf8');
    process.env.GIT_DIR = path.join(repo, '.git');
    const { snapshot } = await snapshotOf(nextStem());
    delete process.env.GIT_DIR;
    try {
      expect(fs.readFileSync(path.join(repo, '.git', 'config'), 'utf8')).toBe(configBefore);
      expect(fs.readFileSync(path.join(repo, '.git', 'HEAD'), 'utf8')).toBe(headBefore);
      const snapConfig = fs.readFileSync(path.join(snapshot.path, '.git', 'config'), 'utf8');
      expect(snapConfig).toContain('hooksPath');
      expect(snapConfig).toContain('pushurl');
      expect(fs.readFileSync(path.join(snapshot.path, 'src/a.ts'), 'utf8')).toBe('modified\n');
    } finally {
      fs.rmSync(snapshot.path, { recursive: true, force: true });
    }
  });

  it('carries the main repository\'s info/exclude, so the delegate\'s git sees the same ignores', async () => {
    fs.writeFileSync(path.join(repo, '.git', 'info', 'exclude'), 'local.env\n');
    put('local.env', 'secret\n');
    const { snapshot } = await snapshotOf(nextStem());
    try {
      expect(fs.readFileSync(path.join(snapshot.path, '.git', 'info', 'exclude'), 'utf8')).toBe('local.env\n');
      expect(computeChangeState(snapshot.path).digest).toBe(computeChangeState(project).digest);
    } finally {
      fs.rmSync(snapshot.path, { recursive: true, force: true });
    }
  });

  it('keeps hooks disabled in its own config, for the git commands a delegate runs there', async () => {
    const { snapshot } = await snapshotOf(nextStem());
    try {
      expect(execFileSync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: snapshot.path }).toString().trim()).toBe('/dev/null');
    } finally {
      fs.rmSync(snapshot.path, { recursive: true, force: true });
    }
  });

  it('cannot push back to the main repository', async () => {
    const { snapshot } = await snapshotOf(nextStem());
    try {
      expect(() => execFileSync('git', ['push', 'origin', 'HEAD:refs/heads/pushed'], { cwd: snapshot.path, stdio: 'pipe' })).toThrow();
      expect(git('branch', '--list', 'pushed')).toBe('');
    } finally {
      fs.rmSync(snapshot.path, { recursive: true, force: true });
    }
  });

  it('refuses, with its named reason, a shallow repository', async () => {
    const shallow = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-shallow-')));
    try {
      git('commit', '-q', '--allow-empty', '-m', 'second');
      execFileSync('git', ['clone', '-q', '--depth', '1', `file://${repo}`, shallow], { stdio: 'pipe' });
      const shallowChange = path.join(shallow, '.prospec', 'changes', 'x');
      fs.mkdirSync(shallowChange, { recursive: true });
      const stem = nextStem();
      claimCheckpointDir(shallowChange, stem);
      const checkpoint = await writeCheckpoint(shallow, shallowChange, stem);
      await expect(
        createSnapshot({ cwd: shallow, changeDir: shallowChange, stem, headCommit: null, checkpoint, preSpawnContentDigest: 'a'.repeat(64) }),
      ).rejects.toThrow(/shallow/);
      expect(leftovers(stem)).toEqual([]);
    } finally {
      fs.rmSync(shallow, { recursive: true, force: true });
    }
  });

  it('refuses, with its named reason, a repository using a split index (C-2/S-2 pin)', async () => {
    git('update-index', '--split-index');
    try {
      const stem = nextStem();
      claimCheckpointDir(changeDir, stem);
      const checkpoint = await writeCheckpoint(project, changeDir, stem);
      await expect(
        createSnapshot({ cwd: project, changeDir, stem, headCommit: git('rev-parse', 'HEAD'), checkpoint, preSpawnContentDigest: 'a'.repeat(64) }),
      ).rejects.toThrow(/split index \(core\.splitIndex\)/);
      expect(leftovers(stem)).toEqual([]);
    } finally {
      git('update-index', '--no-split-index');
    }
  });

  it('names the read-back failure when the snapshot cannot be read, instead of blaming a filter (S-2 pin)', async () => {
    const stem = nextStem();
    claimCheckpointDir(changeDir, stem);
    const checkpoint = await writeCheckpoint(project, changeDir, stem);
    // An index copy that is not an index: the snapshot's git cannot read it back.
    fs.writeFileSync(path.join(checkpointDirOf(changeDir, stem), 'index'), 'not an index');
    // The refusal carries git's own words about the index, not a filter guess (T-5 pin).
    await expect(
      createSnapshot({ cwd: project, changeDir, stem, headCommit: git('rev-parse', 'HEAD'), checkpoint, preSpawnContentDigest: 'a'.repeat(64) }),
    ).rejects.toThrow(/cannot be read back: .*index/i);
    expect(leftovers(stem)).toEqual([]);
  });

  it('issues again once a split index was turned off, although git leaves the shared index file behind (C-6 pin)', async () => {
    git('update-index', '--split-index');
    git('update-index', '--no-split-index');
    expect(fs.readdirSync(path.join(repo, '.git')).some((n) => n.startsWith('sharedindex.'))).toBe(true);
    const { snapshot } = await snapshotOf(nextStem());
    try {
      expect(fs.existsSync(path.join(snapshot.path, 'src', 'a.ts'))).toBe(true);
    } finally {
      fs.rmSync(snapshot.path, { recursive: true, force: true });
    }
  });

  it('issues although a junk `sharedindex.*` file that is no hash sits beside the index (T-10 pin)', async () => {
    fs.writeFileSync(path.join(repo, '.git', 'sharedindex.stale'), 'junk');
    const { snapshot } = await snapshotOf(nextStem());
    fs.rmSync(snapshot.path, { recursive: true, force: true });
  });

  it('names a directory that is not a repository as such (T-14 pin)', async () => {
    const plain = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-plain-')));
    try {
      await expect(
        createSnapshot({ cwd: plain, changeDir, stem: nextStem(), headCommit: null, checkpoint: { entries: [], index_sha256: 'a'.repeat(64) }, preSpawnContentDigest: 'a'.repeat(64) }),
      ).rejects.toMatchObject({ name: 'DelegationRefusedError', message: 'Cannot build a delegation snapshot: not a git repository', suggestion: expect.stringContaining('Harness Degradation') });
    } finally {
      fs.rmSync(plain, { recursive: true, force: true });
    }
  });

  it("names git's own reason when the index cannot be listed (T-17 pin)", async () => {
    fs.writeFileSync(path.join(repo, '.git', 'index'), 'DIRCgarbage-not-an-index');
    await expect(
      createSnapshot({ cwd: project, changeDir, stem: nextStem(), headCommit: null, checkpoint: { entries: [], index_sha256: 'a'.repeat(64) }, preSpawnContentDigest: 'a'.repeat(64) }),
    ).rejects.toThrow(/the index cannot be listed: fatal: .*index/);
  });

  it('refuses, naming the file, a tracked file marked assume-unchanged (C-7 pin)', async () => {
    git('update-index', '--assume-unchanged', 'src/b.ts');
    try {
      put('src/b.ts', 'hidden edit\n');
      const stem = nextStem();
      claimCheckpointDir(changeDir, stem);
      const checkpoint = await writeCheckpoint(project, changeDir, stem);
      await expect(
        createSnapshot({ cwd: project, changeDir, stem, headCommit: git('rev-parse', 'HEAD'), checkpoint, preSpawnContentDigest: 'a'.repeat(64) }),
      ).rejects.toThrow(/assume-unchanged \(src\/b\.ts\)/);
      expect(leftovers(stem)).toEqual([]);
    } finally {
      git('update-index', '--no-assume-unchanged', 'src/b.ts');
    }
  });

  it('refuses an assume-unchanged file although the inherited environment makes pathspecs literal (C-10 pin)', async () => {
    const saved = process.env.GIT_LITERAL_PATHSPECS;
    process.env.GIT_LITERAL_PATHSPECS = '1';
    git('update-index', '--assume-unchanged', 'src/b.ts');
    try {
      const stem = nextStem();
      claimCheckpointDir(changeDir, stem);
      const checkpoint = await writeCheckpoint(project, changeDir, stem);
      await expect(
        createSnapshot({ cwd: project, changeDir, stem, headCommit: git('rev-parse', 'HEAD'), checkpoint, preSpawnContentDigest: 'a'.repeat(64) }),
      ).rejects.toThrow(/assume-unchanged \(src\/b\.ts\)/);
    } finally {
      if (saved === undefined) delete process.env.GIT_LITERAL_PATHSPECS;
      else process.env.GIT_LITERAL_PATHSPECS = saved;
      git('update-index', '--no-assume-unchanged', 'src/b.ts');
    }
  });

  it('refuses, by name, a repository that has no index yet (C-5 pin)', async () => {
    const fresh = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-unborn-')));
    try {
      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: fresh, stdio: 'pipe' });
      fs.writeFileSync(path.join(fresh, 'a.txt'), 'x\n');
      const freshChange = path.join(fresh, '.prospec', 'changes', 'x');
      fs.mkdirSync(freshChange, { recursive: true });
      const stem = nextStem();
      claimCheckpointDir(freshChange, stem);
      await expect(writeCheckpoint(fresh, freshChange, stem)).rejects.toThrow(/has no index yet/);
    } finally {
      fs.rmSync(fresh, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('names the inspection failure when the index directory cannot be listed, instead of calling it not a repository (A-4 pin)', async () => {
    const stem = nextStem();
    claimCheckpointDir(changeDir, stem);
    const checkpoint = await writeCheckpoint(project, changeDir, stem);
    const gitDir = path.join(repo, '.git');
    fs.chmodSync(gitDir, 0o311);
    try {
      await expect(
        createSnapshot({ cwd: project, changeDir, stem, headCommit: git('rev-parse', 'HEAD'), checkpoint, preSpawnContentDigest: 'a'.repeat(64) }),
      ).rejects.toThrow(/the index cannot be inspected: .*EACCES/);
    } finally {
      fs.chmodSync(gitDir, 0o755);
    }
    expect(leftovers(stem)).toEqual([]);
  });

  it('builds the snapshot when the clone template directory is empty and the clone has no .git/info (S-3 pin)', async () => {
    const template = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-template-'));
    const saved = process.env.GIT_TEMPLATE_DIR;
    process.env.GIT_TEMPLATE_DIR = template;
    try {
      fs.writeFileSync(path.join(repo, '.git', 'info', 'exclude'), '# main exclude\n');
      const { snapshot } = await snapshotOf(nextStem());
      try {
        expect(fs.readFileSync(path.join(snapshot.path, '.git', 'info', 'exclude'), 'utf8')).toBe('# main exclude\n');
      } finally {
        fs.rmSync(snapshot.path, { recursive: true, force: true });
      }
    } finally {
      if (saved === undefined) delete process.env.GIT_TEMPLATE_DIR;
      else process.env.GIT_TEMPLATE_DIR = saved;
      fs.rmSync(template, { recursive: true, force: true });
    }
  });

  it('refuses — and leaves no snapshot — when an eol filter makes the checkout differ from the working tree', async () => {
    put('.gitattributes', '*.txt text eol=crlf\n');
    put('doc.txt', 'line one\nline two\n');
    git('add', '.');
    git('commit', '-qm', 'attrs');
    const stem = nextStem();
    await expect(snapshotOf(stem)).rejects.toThrow(/does not reproduce the working tree/);
    expect(leftovers(stem)).toEqual([]);
  });

  it('refuses, by name, an assume-unchanged file outside a nested project\'s subtree (C-9 pin)', async () => {
    fs.rmSync(repo, { recursive: true, force: true });
    setup('app');
    fs.writeFileSync(path.join(repo, 'root.txt'), 'r\n');
    git('add', 'root.txt');
    git('commit', '-qm', 'root');
    git('update-index', '--assume-unchanged', 'root.txt');
    const stem = nextStem();
    claimCheckpointDir(changeDir, stem);
    const checkpoint = await writeCheckpoint(project, changeDir, stem);
    await expect(
      createSnapshot({ cwd: project, changeDir, stem, headCommit: git('rev-parse', 'HEAD'), checkpoint, preSpawnContentDigest: 'a'.repeat(64) }),
    ).rejects.toThrow(/assume-unchanged \(root\.txt\) — paths relative to the repository top — .*git -C "\$\(git rev-parse --show-toplevel\)" update-index --no-assume-unchanged/);
    expect(leftovers(stem)).toEqual([]);
  });

  it('self-checks at the project path of a project nested in its repository', async () => {
    fs.rmSync(repo, { recursive: true, force: true });
    setup('app');
    put('src/a.ts', 'modified\n');
    const { snapshot } = await snapshotOf(nextStem());
    try {
      expect(computeChangeState(path.join(snapshot.path, 'app')).digest).toBe(computeChangeState(project).digest);
    } finally {
      fs.rmSync(snapshot.path, { recursive: true, force: true });
    }
  });
});

describe('releaseSnapshot (REQ-LIB-091)', () => {
  beforeEach(() => setup(''));

  it('deletes a genuine snapshot', async () => {
    const stem = nextStem();
    const { snapshot } = await snapshotOf(stem);
    expect(releaseSnapshot(snapshot, stem)).toBe(true);
    expect(fs.existsSync(snapshot.path)).toBe(false);
  });

  it('keeps a directory that is not directly under the temp root', () => {
    const stem = nextStem();
    const nested = path.join(repo, 'nest', `${SNAPSHOT_PREFIX}${stem}-x`);
    fs.mkdirSync(path.join(nested, '.git'), { recursive: true });
    fs.writeFileSync(path.join(nested, '.git', 'prospec-snapshot.json'), JSON.stringify({ stem, nonce: 'f'.repeat(32) }));
    expect(releaseSnapshot({ path: nested, nonce: 'f'.repeat(32) }, stem)).toBe(false);
    expect(fs.existsSync(nested)).toBe(true);
  });

  it('keeps a snapshot whose name does not carry this ticket\'s stem', async () => {
    const stem = nextStem();
    const { snapshot } = await snapshotOf(stem);
    try {
      expect(releaseSnapshot(snapshot, nextStem())).toBe(false);
      expect(fs.existsSync(snapshot.path)).toBe(true);
    } finally {
      fs.rmSync(snapshot.path, { recursive: true, force: true });
    }
  });

  it('keeps a directory under the temp root whose marker matches but whose name is not the ticket\'s snapshot', () => {
    const stem = nextStem();
    const lookalike = fs.mkdtempSync(path.join(snapshotRoot(), 'prospec-lookalike-'));
    try {
      fs.mkdirSync(path.join(lookalike, '.git'));
      fs.writeFileSync(path.join(lookalike, '.git', 'prospec-snapshot.json'), JSON.stringify({ stem, nonce: 'f'.repeat(32) }));
      expect(releaseSnapshot({ path: lookalike, nonce: 'f'.repeat(32) }, stem)).toBe(false);
      expect(fs.existsSync(lookalike)).toBe(true);
    } finally {
      fs.rmSync(lookalike, { recursive: true, force: true });
    }
  });

  it('keeps a snapshot whose marker nonce differs from the ticket\'s', async () => {
    const stem = nextStem();
    const { snapshot } = await snapshotOf(stem);
    try {
      expect(releaseSnapshot({ path: snapshot.path, nonce: '0'.repeat(32) }, stem)).toBe(false);
      expect(fs.existsSync(snapshot.path)).toBe(true);
    } finally {
      fs.rmSync(snapshot.path, { recursive: true, force: true });
    }
  });

  it('treats an already-removed snapshot as released and never prunes worktrees', () => {
    const linked = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-linked-')));
    fs.rmdirSync(linked);
    git('worktree', 'add', '-q', '--detach', linked);
    fs.rmSync(linked, { recursive: true, force: true });
    const stem = nextStem();
    expect(releaseSnapshot({ path: path.join(snapshotRoot(), `${SNAPSHOT_PREFIX}${stem}-gone`), nonce: 'n'.repeat(32) }, stem)).toBe(true);
    // The missing linked worktree's administrative entry is still registered.
    expect(git('worktree', 'list', '--porcelain')).toContain(linked);
  });
});
