import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { changedPathsFromWorkTree, collectGitTimestamps, computeChangeState, gitlinkCheckoutState, linkSteps } from '../../../src/lib/drift-sources.js';

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

// #400: a directory symlink is proven by the represented inputs beneath its target.
describe.skipIf(process.platform === 'win32')('directory symlink inputs', () => {
  const dir = (file: string) => mkdirSync(path.join(root, file), { recursive: true });
  const link = (target: string, file: string) => symlinkSync(target, path.join(root, file));
  const shareSkills = () => {
    dir('.agents/skills/demo'); put('.agents/skills/demo/SKILL.md', 'skill');
    dir('.claude'); link('../.agents/skills', '.claude/skills');
  };
  const reason = () => computeChangeState(root).reason;

  it('certifies an in-repo directory symlink with one identity before and after commit', () => {
    shareSkills(); const before = digest(); expect(before).toBeTruthy();
    git('add', '-A'); expect(digest()).toBe(before);
    git('commit', '-qm', 'share'); expect(digest()).toBe(before);
  });
  it('follows the bytes beneath the target and the link text', () => {
    shareSkills(); git('add', '-A'); git('commit', '-qm', 'share'); const before = digest();
    put('.agents/skills/demo/SKILL.md', 'changed'); expect(digest()).not.toBe(before);
    put('.agents/skills/demo/SKILL.md', 'skill'); expect(digest()).toBe(before);
    dir('.agents/copy/demo'); put('.agents/copy/demo/SKILL.md', 'skill'); git('add', '-A'); git('commit', '-qm', 'copy');
    const copied = digest();
    unlinkSync(path.join(root, '.claude/skills')); link('../.agents/copy', '.claude/skills'); expect(digest()).not.toBe(copied);
  });
  it('accepts an empty target and a nested link back to an ancestor of its own directory', () => {
    dir('empty'); link('empty', 'alias'); expect(digest()).toBeTruthy();
    dir('tree/a'); put('tree/a/f', 'x'); link('..', 'tree/a/loop'); expect(digest()).toBeTruthy();
  });
  it('refuses a target outside the project, even an empty one', () => {
    // Real path: a system symlink on the way (macOS /var) would be refused by the route rule first.
    const outside = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'snapshot-outside-')));
    try {
      link(outside, 'ext');
      expect(computeChangeState(root)).toMatchObject({ digest: null, reason: 'Symlink target is outside represented inputs: ext' });
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });
  it('refuses a target holding an input the snapshot does not hash, naming the link and that entry', () => {
    shareSkills(); put('.gitignore', '*.local\n'); put('.agents/skills/demo/notes.local', 'ignored');
    expect(computeChangeState(root).digest).toBeNull();
    expect(reason()).toContain('.claude/skills');
    expect(reason()).toContain('.agents/skills/demo/notes.local');
  });
  // R1-5: an unreadable directory beneath the target is named by its project path.
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('names an unreadable directory beneath the target', () => {
    shareSkills(); git('add', '-A'); git('commit', '-qm', 'share');
    dir('.agents/skills/locked'); chmodSync(path.join(root, '.agents/skills/locked'), 0);
    try {
      expect(computeChangeState(root)).toMatchObject({ digest: null, reason: 'Symlink target cannot be read at .agents/skills/locked (EACCES): .claude/skills' });
    } finally { chmodSync(path.join(root, '.agents/skills/locked'), 0o755); }
  });
  it('refuses a target holding the repository metadata', () => {
    dir('.claude'); link('..', '.claude/up');
    expect(computeChangeState(root).digest).toBeNull();
    expect(reason()).toMatch(/\.claude\/up.*\.git\//);
  });
  // Pinned from the pre-#400 implementation (main 9658787d): file symlinks keep their identity.
  it('keeps a file-symlink identity byte-identical to the pre-directory snapshot', () => {
    link('input.txt', 'link');
    expect(computeChangeState(root)).toEqual({ digest: '4a6ca0ca098019e9d4ea707a60d2b15f13a70e36479af9f0b8b98dd39aa25038', clean: false });
  });

  describe('a listed path beneath a replaced ancestor', () => {
    const commitTrackedSkills = () => {
      dir('.agents/skills/demo'); put('.agents/skills/demo/SKILL.md', 'skill');
      dir('.claude/skills/demo'); put('.claude/skills/demo/SKILL.md', 'skill');
      git('add', '-A'); git('commit', '-qm', 'tracked skills');
    };
    const replaceWithLink = () => {
      rmSync(path.join(root, '.claude/skills'), { recursive: true }); link('../.agents/skills', '.claude/skills');
    };
    const threeStates = () => {
      const unstaged = digest(); git('add', '-A'); const staged = digest(); git('commit', '-qm', 'replace'); const committed = digest();
      return [unstaged, staged, committed];
    };

    it('keeps one identity while a tracked directory becomes a directory symlink', () => {
      commitTrackedSkills(); replaceWithLink();
      const [unstaged, staged, committed] = threeStates();
      expect(unstaged).toBeTruthy(); expect(staged).toBe(unstaged); expect(committed).toBe(unstaged);
    });
    it('keeps one identity when the replacing symlink is ignored', () => {
      commitTrackedSkills(); put('.gitignore', '/.claude/skills\n'); git('add', '.gitignore'); git('commit', '-qm', 'ignore'); replaceWithLink();
      const [unstaged, staged, committed] = threeStates();
      expect(unstaged).toBeTruthy(); expect(staged).toBe(unstaged); expect(committed).toBe(unstaged);
    });
    it('keeps one identity while a tracked directory becomes a regular file', () => {
      dir('p'); put('p/a', 'a'); git('add', '-A'); git('commit', '-qm', 'dir');
      rmSync(path.join(root, 'p'), { recursive: true }); put('p', 'file');
      const [unstaged, staged, committed] = threeStates();
      expect(unstaged).toBeTruthy(); expect(staged).toBe(unstaged); expect(committed).toBe(unstaged);
    });
    it('refuses a path the status does not report deleted, naming it and the ancestor', () => {
      commitTrackedSkills(); git('update-index', '--assume-unchanged', '.claude/skills/demo/SKILL.md'); replaceWithLink();
      expect(computeChangeState(root)).toMatchObject({ digest: null, reason: 'Input lies beneath .claude/skills, which is not a directory: .claude/skills/demo/SKILL.md' });
    });
  });
});

// R1-1: an absolute link text restarts from its own root — a drive or UNC share is never joined twice.
describe('link text steps', () => {
  it.each([
    ['C:\\repo\\x', path.win32, 'C:\\', ['repo', 'x']],
    ['\\\\srv\\share\\repo\\x', path.win32, '\\\\srv\\share\\', ['repo', 'x']],
    ['C:/repo/x', path.win32, 'C:/', ['repo', 'x']],
    ['/abs/x', path.posix, '/', ['abs', 'x']],
  ] as const)('starts %j from its root', (text, paths, start, parts) => {
    expect(linkSteps(text, 'from', paths)).toEqual({ start, parts });
  });
  it.each([[path.win32, '..\\a\\b', ['..', 'a', 'b']], [path.posix, '../a/b', ['..', 'a', 'b']]] as const)('starts a relative text from its link directory', (paths, text, parts) => {
    expect(linkSteps(text, 'from', paths)).toEqual({ start: 'from', parts });
  });
});

// #400 re-scope: a symlink is proven by its whole resolution route, not only its endpoint.
describe.skipIf(process.platform === 'win32')('symlink resolution routes', () => {
  const dir = (file: string) => mkdirSync(path.join(root, file), { recursive: true });
  const link = (target: string, file: string) => symlinkSync(target, path.join(root, file));
  const capture = () => computeChangeState(root);
  beforeEach(() => {
    dir('real'); put('real/x.md', 'A'); dir('real2'); put('real2/x.md', 'B');
    git('add', '-A'); git('commit', '-qm', 'targets');
  });

  it('refuses a file or directory link that resolves through an ignored symlink', () => {
    put('.gitignore', '/vendor\n'); link('real', 'vendor'); link('vendor/x.md', 'f');
    expect(capture()).toMatchObject({ digest: null, reason: 'Symlink resolves through vendor, which is not a represented input: f' });
    unlinkSync(path.join(root, 'f')); link('vendor', 'alias');
    expect(capture()).toMatchObject({ digest: null, reason: 'Symlink resolves through vendor, which is not a represented input: alias' });
  });
  it('refuses a link that resolves through a symlink outside the project', () => {
    const outside = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'snapshot-route-')));
    try {
      symlinkSync(path.join(realpathSync(root), 'real'), path.join(outside, 'r'));
      link(path.join(outside, 'r/x.md'), 'abs');
      const passed = path.relative(realpathSync(root), path.join(outside, 'r')).split(path.sep).join('/');
      expect(capture()).toMatchObject({ digest: null, reason: `Symlink resolves through ${passed}, which is not a represented input: abs` });
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });
  it('accepts a route through a tracked symlink and follows that symlink', () => {
    link('real', 'vendor'); link('vendor/x.md', 'f'); git('add', '-A'); git('commit', '-qm', 'tracked route');
    const before = capture().digest; expect(before).toBeTruthy();
    unlinkSync(path.join(root, 'vendor')); link('real2', 'vendor'); expect(capture().digest).not.toBe(before);
  });
  it('resolves `..` after a symlink from the symlink target, as the platform does', () => {
    dir('deep/sub'); put('deep/sub/k', 'k'); put('y', 'top'); put('.gitignore', '/deep/y\n'); put('deep/y', 'hidden');
    link('deep/sub', 's'); link('s/../y', 'x');
    expect(capture()).toMatchObject({ digest: null, reason: 'Symlink target is outside represented inputs: x' });
  });
  it('refuses a symlink loop by its project path', () => {
    link('b', 'a'); link('a', 'b');
    expect(capture()).toMatchObject({ digest: null, reason: 'Symlink resolution loops at b: a' });
  });
  it('names the missing component of a dangling route', () => {
    link('missing/x.md', 'd');
    expect(capture()).toMatchObject({ digest: null, reason: 'Symlink resolution stops at missing (ENOENT): d' });
  });
  // R2-1: a route symlink is judged by its path; an ignored hard link of a tracked symlink is still ignored.
  it.skipIf(process.platform === 'win32')('refuses an ignored route symlink that hard-links a tracked one', () => {
    link('real', 't1'); put('.gitignore', '/ig\n'); link('ig/x.md', 'L'); git('add', '-A'); git('commit', '-qm', 'links');
    execFileSync('ln', ['-P', path.join(root, 't1'), path.join(root, 'ig')]);
    expect(capture()).toMatchObject({ digest: null, reason: 'Symlink resolves through ig, which is not a represented input: L' });
  });
  // Route paths compare by spelling, never by inode.
  it.skipIf(!existsSync(os.tmpdir().toUpperCase()))('refuses a route link spelled in another case', () => {
    link('real', 'tracked'); git('add', '-A'); git('commit', '-qm', 'tracked link');
    link('TRACKED/x.md', 'g');
    expect(capture()).toMatchObject({ digest: null, reason: 'Symlink resolves through TRACKED, which is not a represented input: g' });
  });
  // macOS stops at 32 links, below the loop guard: the native comparison refuses what the platform cannot read.
  it.skipIf(process.platform !== 'darwin')('refuses a chain the platform cannot resolve', () => {
    link('real/x.md', 'l0');
    for (let i = 1; i <= 35; i++) link(`l${i - 1}`, `l${i}`);
    expect(capture()).toMatchObject({ digest: null, reason: 'Symlink resolves to real/x.md, which the platform cannot confirm (ELOOP): l33' });
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
  it('classifies a gitlink path once for fingerprint and preservation alike', () => {
    expect(gitlinkCheckoutState(root, 'module')).toBe('checkout');
    expect(gitlinkCheckoutState(root, 'absent')).toBe('absent');
    writeFileSync(path.join(root, 'plain'), 'file');
    expect(gitlinkCheckoutState(root, 'plain')).toBe('other');
    git('submodule', 'deinit', '-q', '-f', 'module');
    expect(gitlinkCheckoutState(root, 'module')).toBe('uninitialized');
    writeFileSync(path.join(root, 'module/stray.md'), 'stray');
    expect(gitlinkCheckoutState(root, 'module')).toBe('stray');
    mkdirSync(path.join(root, 'module/.git'));
    expect(gitlinkCheckoutState(root, 'module')).toBe('stray');
  });
  // R4-1: the checkout is judged by directory identity, not by how the index spells it.
  it.skipIf(!existsSync(os.tmpdir().toUpperCase()))('keeps a case-renamed submodule a checkout on a case-insensitive filesystem', () => {
    const clean = computeChangeState(root).digest;
    renameSync(path.join(root, 'module'), path.join(root, 'tmp-module')); renameSync(path.join(root, 'tmp-module'), path.join(root, 'MODULE'));
    expect(gitlinkCheckoutState(root, 'module')).toBe('checkout');
    expect(computeChangeState(root)).toMatchObject({ digest: clean });
  });
  // R4-2: a symlinked ancestor that stays inside the project is still not a real directory.
  it.skipIf(process.platform === 'win32')('judges a gitlink behind an in-project symlinked ancestor as an ordinary input', () => {
    git('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', upstream, 'lib/sub'); commitRoot('nested gitlink');
    execFileSync('git', ['clone', '-q', upstream, path.join(root, 'vendor/lib/sub')], { stdio: 'pipe' });
    rmSync(path.join(root, 'lib'), { recursive: true, force: true });
    symlinkSync('vendor/lib', path.join(root, 'lib'));
    expect(gitlinkCheckoutState(root, 'lib/sub')).toBe('other');
  });
  it('refuses a gitlink whose invalid .git would resolve the superproject', () => {
    git('submodule', 'deinit', '-q', '-f', 'module');
    mkdirSync(path.join(root, 'module/.git')); writeFileSync(path.join(root, 'module/work'), 'stray');
    // Fails closed naming the path (Git itself may refuse first); it never recurses or certifies.
    expect(computeChangeState(root)).toMatchObject({ digest: null, reason: expect.stringContaining('module') });
  });
  it.skipIf(process.platform === 'win32')('certifies a superproject symlink into a submodule file', () => {
    symlinkSync('module/shared.md', path.join(root, 'link'));
    expect(computeChangeState(root)).toMatchObject({ digest: expect.any(String) });
  });
  // #400: a directory symlink's target is judged by the inputs beneath it, the checkout's own metadata included.
  it.skipIf(process.platform === 'win32')('refuses a directory symlink into an initialized checkout and accepts one into an uninitialized gitlink', () => {
    symlinkSync('module', path.join(root, 'alias'));
    expect(computeChangeState(root)).toMatchObject({ digest: null, reason: expect.stringMatching(/alias.*module\/\.git/) });
    git('submodule', 'deinit', '-q', '-f', 'module');
    expect(computeChangeState(root)).toMatchObject({ digest: expect.any(String) });
  });
  // Git's own status refuses a gitlink path that is a symlink, so the capture stays unprovable.
  it.skipIf(process.platform === 'win32')('leaves a gitlink path replaced by a directory symlink unprovable', () => {
    mkdirSync(path.join(root, 'shared')); writeFileSync(path.join(root, 'shared/doc.md'), 'doc');
    git('add', 'shared'); commitRoot('shared');
    git('submodule', 'deinit', '-q', '-f', 'module');
    rmSync(path.join(root, 'module'), { recursive: true, force: true }); symlinkSync('shared', path.join(root, 'module'));
    expect(gitlinkCheckoutState(root, 'module')).toBe('other');
    expect(computeChangeState(root)).toMatchObject({ digest: null, reason: expect.stringContaining('module') });
  });
  it.skipIf(process.platform === 'win32')('refuses a submodule path beneath a directory the submodule replaced with a symlink', () => {
    mkdirSync(path.join(root, 'module/real')); writeFileSync(path.join(root, 'module/real/a.md'), 'a');
    mkdirSync(path.join(root, 'module/dir')); writeFileSync(path.join(root, 'module/dir/a.md'), 'a');
    sub('add', '.'); execFileSync('git', [...GIT_ID, 'commit', '-qm', 'dirs'], { cwd: path.join(root, 'module'), stdio: 'pipe' });
    rmSync(path.join(root, 'module/dir'), { recursive: true }); symlinkSync('real', path.join(root, 'module/dir'));
    expect(computeChangeState(root)).toMatchObject({ digest: null, reason: 'Input lies beneath module/dir, which is not a directory: module/dir/a.md' });
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

// Knowledge compares source digests; provenance hashes effective input bytes.
it('separates equivalent commit provenance from Knowledge source-digest freshness', async () => {
  mkdirSync(path.join(root, 'src/lib'), { recursive: true });
  mkdirSync(path.join(root, 'prospec/ai-knowledge/modules/lib'), { recursive: true });
  put('.prospec.yaml', 'project:\n  name: fixture\n');
  const mapPath = 'prospec/ai-knowledge/module-map.yaml';
  put(mapPath, 'modules:\n  - name: lib\n    paths: [src/lib]\n    keywords: [lib]\n');
  put('src/lib/value.ts', 'export const value = 1;\n');
  put('prospec/ai-knowledge/modules/lib/README.md', '# lib\n\nExports value.\n');
  const commit = () => { git('add', '.'); execFileSync('git', [...GIT_ID, 'commit', '-qm', 'fixture source'], { cwd: root, stdio: 'pipe' }); };
  const health = () => evaluateKnowledgeHealth(collectGitTimestamps(
    root, parseYaml<ModuleMap>(readFileSync(path.join(root, mapPath), 'utf8')),
    'prospec/ai-knowledge', [],
  ));
  commit();
  await stampKnowledge({ cwd: root, modules: ['lib'], now: '2026-10-01T08:00:00Z' });
  expect(health().result.status).toBe('pass');

  put('src/lib/value.ts', 'export const value = 2;\n');
  const beforeCommit = digest();
  expect(beforeCommit).not.toBeNull();
  expect(health()).toMatchObject({ result: { status: 'warn' }, knowledgeHealth: { modules: [{ name: 'lib', stale: true }] } });

  commit();
  expect(digest()).toBe(beforeCommit);
  expect(health().result.status).toBe('warn');

  await stampKnowledge({ cwd: root, modules: ['lib'], now: '2026-10-02T12:00:00Z' });
  expect(health().result.status).toBe('pass');
  expect(digest()).not.toBe(beforeCommit);
});
