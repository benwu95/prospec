import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectGitTimestamps, collectModuleDigests } from '../../src/lib/drift-sources.js';
import { evaluateKnowledgeHealth } from '../../src/lib/drift-checker.js';
import { loadModuleMap } from '../../src/lib/knowledge-reader.js';
import { stringifyYaml } from '../../src/lib/yaml-utils.js';
import { GIT_ID } from '../helpers/git-fixture.js';

// Real-git topologies for the content-digest freshness rule (REQ-LIB-015): a module is
// stamped with the digest of its source, then history and checkouts move around it.
vi.setConfig({ testTimeout: 60_000 });

const dirs: string[] = [];
const tempDir = (label: string) => {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), `freshness-${label}-`)));
  dirs.push(dir);
  return dir;
};
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const git = (dir: string, ...args: string[]) =>
  execFileSync('git', [...GIT_ID, '-c', 'protocol.file.allow=always', ...args], { cwd: dir, stdio: 'pipe' }).toString().trim();
const put = (dir: string, file: string, text: string | Buffer) => {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), text);
};
const knowledge = (dir: string) => path.join(dir, 'prospec/ai-knowledge');
const MODULE = { name: 'lib', paths: ['src/lib'], keywords: [] as string[] };

/** Stamp module `lib` with the digest of its current source, as `knowledge verify` does. */
function stamp(dir: string, generated: string[] = []): string {
  const digest = collectModuleDigests(dir, { modules: [MODULE] }, {
    knowledgePath: knowledge(dir),
    specsPath: path.join(dir, 'prospec/specs'),
    generatedArtifacts: generated,
  }).get('lib')!;
  expect(digest.digest, digest.reason).toMatch(/^source-v1:/);
  put(dir, 'prospec/ai-knowledge/module-map.yaml', stringifyYaml({
    modules: [{ ...MODULE, last_verified: '2026-10-25T00:00:00.000Z', source_digest: digest.digest }],
  }));
  return digest.digest!;
}

/** The knowledge-health verdict for module `lib`. */
function freshness(dir: string, generated: string[] = []) {
  const map = loadModuleMap(knowledge(dir), dir)!;
  const health = evaluateKnowledgeHealth(collectGitTimestamps(dir, map, knowledge(dir), generated)).knowledgeHealth!;
  return health.modules[0]!;
}
const isStale = (dir: string, generated: string[] = []) => freshness(dir, generated).stale;

function repo(label: string): string {
  const dir = tempDir(label);
  git(dir, 'init', '-q', '-b', 'main');
  put(dir, 'src/lib/a.ts', 'a\n');
  put(dir, 'prospec/ai-knowledge/modules/lib/README.md', '# lib\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'base');
  return dir;
}
const clone = (from: string, label: string, ...flags: string[]) => {
  const to = tempDir(label);
  rmSync(to, { recursive: true });
  execFileSync('git', ['clone', '-q', ...flags, `file://${from}`, to], { stdio: 'pipe' });
  return to;
};

describe('US-1: history moves around a stamp', () => {
  let dir: string;
  beforeEach(() => { dir = repo('history'); });

  it('reads fresh when source and stamp share a commit, stale after a same-day follow-up', () => {
    put(dir, 'src/lib/a.ts', 'b\n');
    stamp(dir);
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'source and stamp');
    expect(isStale(dir)).toBe(false);
    put(dir, 'src/lib/a.ts', 'c\n');
    git(dir, 'commit', '-qam', 'same-day follow-up');
    expect(freshness(dir).freshness?.basis).toBe('digest-mismatch');
  });

  it('reads stale after merging a branch opened before the stamp, whatever its commit date', () => {
    git(dir, 'checkout', '-qb', 'old');
    put(dir, 'src/lib/old.ts', 'old\n');
    git(dir, 'add', '.');
    execFileSync('git', [...GIT_ID, 'commit', '-qm', 'old'], {
      cwd: dir, stdio: 'pipe',
      env: { ...process.env, GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z' },
    });
    git(dir, 'checkout', '-q', 'main');
    stamp(dir);
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'stamp');
    git(dir, 'merge', '-q', '--no-ff', '--no-edit', 'old');
    expect(isStale(dir)).toBe(true);
  });

  it('reads fresh after squash, rebase and cherry-pick that keep the stamped content', () => {
    git(dir, 'checkout', '-qb', 'feature');
    put(dir, 'src/lib/a.ts', 'feature\n');
    stamp(dir);
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'source and stamp');
    const featureCommit = git(dir, 'rev-parse', 'HEAD');
    git(dir, 'checkout', '-q', 'main');
    put(dir, 'unrelated.txt', 'u\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'unrelated');

    git(dir, 'checkout', '-qb', 'squashed');
    git(dir, 'merge', '-q', '--squash', 'feature');
    git(dir, 'commit', '-qm', 'squash');
    expect(isStale(dir)).toBe(false);

    git(dir, 'checkout', '-q', 'feature');
    git(dir, 'rebase', '-q', 'main');
    expect(isStale(dir)).toBe(false);

    git(dir, 'checkout', '-q', '-b', 'picked', 'main');
    git(dir, 'cherry-pick', featureCommit);
    expect(isStale(dir)).toBe(false);
  });

  it('reads fresh again once a revert restores the verified content', () => {
    stamp(dir);
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'stamp');
    put(dir, 'src/lib/a.ts', 'bad\n');
    git(dir, 'commit', '-qam', 'bad');
    expect(isStale(dir)).toBe(true);
    git(dir, 'revert', '--no-edit', 'HEAD');
    expect(isStale(dir)).toBe(false);
  });

  it('stays fresh when only a file mode or a registered generated artifact changes', () => {
    put(dir, 'src/lib/gen.ts', 'gen\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'gen');
    stamp(dir, ['src/lib/gen.ts']);
    chmodSync(path.join(dir, 'src/lib/a.ts'), 0o755);
    put(dir, 'src/lib/gen.ts', 'regenerated\n');
    expect(isStale(dir, ['src/lib/gen.ts'])).toBe(false);
  });

  it('lists the module without the exclusion when git cannot parse the generated-artifact pathspec', () => {
    const generated = [':(bogus)src/lib/*.ts'];
    stamp(dir, generated);
    expect(freshness(dir, generated).freshness?.basis).toBe('digest-match');
    expect(stamp(dir, generated)).toBe(stamp(dir));
  });
});

describe('US-2: checkouts of one commit agree', () => {
  it('agrees across autocrlf clones, including a file the index stores with CRLF', () => {
    const dir = repo('crlf');
    put(dir, 'src/lib/lf.ts', 'l1\nl2\n');
    put(dir, 'src/lib/crlf.ts', 'c1\r\nc2\r\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'line endings');
    stamp(dir);
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'stamp');
    for (const setting of ['true', 'input']) {
      expect(isStale(clone(dir, `crlf-${setting}`, '-c', `core.autocrlf=${setting}`))).toBe(false);
    }
  });

  it('agrees across a clone whose eol attribute rewrites the working files', () => {
    const dir = repo('eol');
    put(dir, '.gitattributes', '* text eol=crlf\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'attrs');
    stamp(dir);
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'stamp');
    expect(isStale(clone(dir, 'eol-clone'))).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('agrees with a clone that checks symlinks out as plain files', () => {
    const dir = repo('symlinks');
    symlinkSync('a.ts', path.join(dir, 'src/lib/link.ts'));
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'link');
    stamp(dir);
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'stamp');
    expect(isStale(clone(dir, 'symlinks-off', '-c', 'core.symlinks=false'))).toBe(false);
  });

  it('agrees for a project in a repository subdirectory, hashing its untracked files from the right root', () => {
    const top = tempDir('subdir');
    git(top, 'init', '-q', '-b', 'main');
    const dir = path.join(top, 'proj');
    put(dir, 'src/lib/a.ts', 'a\n');
    put(dir, 'prospec/ai-knowledge/modules/lib/README.md', '# lib\n');
    git(top, 'add', '.');
    git(top, 'commit', '-qm', 'base');
    put(dir, 'src/lib/new.ts', 'untracked at stamp time\n');
    stamp(dir);
    git(top, 'add', '.');
    git(top, 'commit', '-qm', 'stamp');
    expect(isStale(dir)).toBe(false);
    expect(isStale(path.join(clone(top, 'subdir-clone'), 'proj'))).toBe(false);
  });

  it('hashes untracked files whose names hold quotes, a newline or non-ASCII characters', () => {
    const dir = repo('names');
    put(dir, 'src/lib/中文.ts', 'x\n');
    // `--stdin-paths` reads one path per line and unquotes a line starting with `"`:
    // a newline in a name only survives as a C-quoted path.
    if (process.platform !== 'win32') {
      put(dir, 'src/lib/"quoted".ts', 'q\n');
      put(dir, 'src/lib/line\nbreak.ts', 'n\n');
    }
    stamp(dir);
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'stamp');
    expect(isStale(dir)).toBe(false);
  });

  it('agrees under user git settings that reshape git output, and in a shallow clone', () => {
    const dir = repo('settings');
    for (let i = 0; i < 3; i++) { put(dir, 'src/lib/a.ts', `${i}\n`); git(dir, 'commit', '-qam', `c${i}`); }
    stamp(dir);
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'stamp');
    for (const [key, value] of [['diff.relative', 'true'], ['core.quotePath', 'true'], ['color.ui', 'always'],
      ['status.showUntrackedFiles', 'no'], ['diff.ignoreSubmodules', 'all'], ['i18n.logOutputEncoding', 'latin1']]) {
      git(dir, 'config', key!, value!);
    }
    expect(isStale(dir)).toBe(false);
    const shallow = clone(dir, 'shallow', '--depth', '1');
    expect(freshness(shallow)).toMatchObject({ stale: false, last_src_commit: null });
  });
});

describe('US-3: the working tree and unprovable content', () => {
  let dir: string;
  beforeEach(() => {
    dir = repo('worktree');
    stamp(dir);
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'stamp');
  });

  it('reads stale on an uncommitted edit or deletion after the stamp', () => {
    put(dir, 'src/lib/a.ts', 'wip\n');
    expect(isStale(dir)).toBe(true);
    git(dir, 'checkout', '--', 'src/lib/a.ts');
    expect(isStale(dir)).toBe(false);
    unlinkSync(path.join(dir, 'src/lib/a.ts'));
    expect(isStale(dir)).toBe(true);
  });

  it('cannot compute any digest in a sparse checkout', () => {
    put(dir, 'docs/d.md', 'd\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'docs');
    git(dir, 'sparse-checkout', 'set', '--no-cone', 'src/', 'prospec/');
    expect(freshness(dir).freshness).toMatchObject({ basis: 'unavailable' });
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('cannot compute a module holding an unreadable changed file', () => {
    put(dir, 'src/lib/secret.ts', 's\n');
    chmodSync(path.join(dir, 'src/lib/secret.ts'), 0o000);
    try {
      expect(freshness(dir).freshness).toMatchObject({ basis: 'unavailable' });
    } finally {
      chmodSync(path.join(dir, 'src/lib/secret.ts'), 0o644);
    }
  });
});

describe('submodules under a module path', () => {
  let sub: string;
  let dir: string;
  beforeEach(() => {
    sub = tempDir('sub');
    git(sub, 'init', '-q', '-b', 'main');
    put(sub, 'x.c', 'v1\n');
    git(sub, 'add', '.');
    git(sub, 'commit', '-qm', 'v1');
    dir = repo('super');
    git(dir, 'submodule', '-q', 'add', `file://${sub}`, 'src/lib/vendor');
    git(dir, 'commit', '-qm', 'submodule');
    stamp(dir);
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'stamp');
  });
  const inSub = (...args: string[]) => git(path.join(dir, 'src/lib/vendor'), ...args);

  it('agrees for an uninitialized and an initialized clone', () => {
    const plain = clone(dir, 'super-clone');
    expect(isStale(plain)).toBe(false);
    git(plain, 'submodule', '-q', 'update', '--init');
    expect(isStale(plain)).toBe(false);
  });

  it('reads stale once the checkout moves, also when .gitmodules hides it from status', () => {
    git(dir, 'config', '-f', '.gitmodules', 'submodule.src/lib/vendor.ignore', 'all');
    git(dir, 'commit', '-qam', 'ignore all');
    expect(isStale(dir)).toBe(false);
    put(path.join(dir, 'src/lib/vendor'), 'x.c', 'v2\n');
    inSub('commit', '-qam', 'v2');
    expect(isStale(dir)).toBe(true);
  });

  it('cannot compute while the checkout holds uncommitted edits or untracked files the user hides', () => {
    put(path.join(dir, 'src/lib/vendor'), 'x.c', 'dirty\n');
    expect(freshness(dir).freshness).toMatchObject({ basis: 'unavailable' });
    inSub('checkout', '--', 'x.c');
    put(path.join(dir, 'src/lib/vendor'), 'extra.c', 'e\n');
    inSub('config', 'status.showUntrackedFiles', 'no');
    expect(freshness(dir).freshness).toMatchObject({ basis: 'unavailable' });
  });
});

describe('one work-tree recording for every caller (REQ-LIB-070)', () => {
  it('attributes a failed recording to the same modules whether the caller asks for all or a subset', () => {
    const dir = repo('batch');
    put(dir, 'src/cli/b.ts', 'b\n');
    put(dir, '.gitattributes', 'src/cli/** filter=boom\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'cli');
    git(dir, 'config', 'filter.boom.clean', 'false');
    git(dir, 'config', 'filter.boom.required', 'true');
    put(dir, 'src/lib/a.ts', 'dirty lib\n');
    put(dir, 'src/cli/b.ts', 'dirty cli\n');
    const map = { modules: [MODULE, { name: 'cli', paths: ['src/cli'], keywords: [] as string[] }] };
    const options = { knowledgePath: knowledge(dir), specsPath: path.join(dir, 'prospec/specs'), generatedArtifacts: [] };
    const all = collectModuleDigests(dir, map, options);
    const subset = collectModuleDigests(dir, map, { ...options, subset: new Set(['lib']) });
    expect(all.get('lib')!.digest).toBeNull();
    expect(all.get('cli')!.digest).toBeNull();
    expect(subset.get('lib')).toEqual(all.get('lib'));
  });
});
