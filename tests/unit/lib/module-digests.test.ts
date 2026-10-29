import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectModuleDigests, computeEvidenceStates } from '../../../src/lib/drift-sources.js';
import type { ModuleMap } from '../../../src/types/module-map.js';
import { loadModuleMap } from '../../../src/lib/knowledge-reader.js';
import { gitIn } from '../../helpers/git-fixture.js';

vi.setConfig({ testTimeout: 30_000 });

let root: string;
const put = (file: string, text: string) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
};
const mod = (name: string, paths: string[]): ModuleMap['modules'][number] => ({ name, paths, keywords: [] });
const digests = (modules: ModuleMap['modules'], generatedArtifacts: string[] = [], cwd = root) =>
  collectModuleDigests(cwd, { modules }, {
    knowledgePath: path.join(cwd, 'prospec/ai-knowledge'),
    specsPath: path.join(cwd, 'prospec/specs'),
    generatedArtifacts,
  });
const digestOf = (paths: string[], generated: string[] = []) => digests([mod('m', paths)], generated).get('m')!;

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'module-digests-')));
  gitIn(root, 'init', '-q');
  put('src/lib/a.ts', 'a\n');
  put('src/lib/b.ts', 'b\n');
  put('src/other/c.ts', 'c\n');
  put('prospec/ai-knowledge/module-map.yaml', 'modules: []\n');
  put('prospec/specs/features/x.md', '# x\n');
  put('.gitignore', 'ignored.ts\n');
  gitIn(root, 'add', '.');
  gitIn(root, 'commit', '-qm', 'base');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('collectModuleDigests (REQ-LIB-015)', () => {
  it('resolves every literal spelling of a path to the same files', () => {
    const base = digestOf(['src/lib']);
    expect(base.digest).toMatch(/^source-v1:/);
    for (const spelling of ['./src/lib', 'src/lib/', 'src/lib/.', 'src//lib', 'src/../src/lib']) {
      expect(digestOf([spelling]).digest).toBe(base.digest);
    }
    expect(digestOf(['src/other']).digest).not.toBe(base.digest);
  });

  it('changes with content and returns when the content returns', () => {
    const base = digestOf(['src/lib']).digest;
    put('src/lib/a.ts', 'edited\n');
    const edited = digestOf(['src/lib']).digest;
    expect(edited).not.toBe(base);
    gitIn(root, 'commit', '-qam', 'edit');
    expect(digestOf(['src/lib']).digest).toBe(edited);
    put('src/lib/a.ts', 'a\n');
    expect(digestOf(['src/lib']).digest).toBe(base);
  });

  it('counts untracked files, skips ignored and deleted ones, and ignores the file mode', () => {
    const base = digestOf(['src/lib']).digest;
    put('src/lib/ignored.ts', 'x\n');
    expect(digestOf(['src/lib']).digest).toBe(base);
    chmodSync(path.join(root, 'src/lib/a.ts'), 0o755);
    expect(digestOf(['src/lib']).digest).toBe(base);
    put('src/lib/new.ts', 'n\n');
    const withNew = digestOf(['src/lib']).digest;
    expect(withNew).not.toBe(base);
    gitIn(root, 'add', 'src/lib/new.ts');
    gitIn(root, 'commit', '-qm', 'new');
    expect(digestOf(['src/lib']).digest).toBe(withNew);
    unlinkSync(path.join(root, 'src/lib/new.ts'));
    expect(digestOf(['src/lib']).digest).toBe(base);
  });

  it('lists a glob module with its untracked files', () => {
    const base = digestOf(['src/lib/*.ts']).digest;
    expect(base).toMatch(/^source-v1:/);
    put('src/lib/new.ts', 'n\n');
    expect(digestOf(['src/lib/*.ts']).digest).not.toBe(base);
  });

  it('excludes generated artifacts, and lifts only that exclusion when it covers every file', () => {
    const base = digestOf(['src/lib'], ['src/lib/b.ts']).digest;
    put('src/lib/b.ts', 'regenerated\n');
    expect(digestOf(['src/lib'], ['src/lib/b.ts']).digest).toBe(base);
    const covered = digestOf(['src/lib'], ['src/lib/*.ts']);
    expect(covered.digest).toBe(digestOf(['src/lib']).digest);
  });

  it('never counts the knowledge base or the Feature Specs, so stamping cannot change a digest', () => {
    const base = digestOf(['prospec', 'src/lib']).digest;
    put('prospec/ai-knowledge/module-map.yaml', 'modules: [] # stamped\n');
    put('prospec/specs/features/x.md', '# graduated\n');
    expect(digestOf(['prospec', 'src/lib']).digest).toBe(base);
  });

  it('has no computable digest when every file lies in a never-lifted exclusion', () => {
    const only = digestOf(['prospec/specs']);
    expect(only.digest).toBeNull();
    expect(only.reason).toMatch(/excluded/);
  });

  it('has no computable digest when every file lies in the workflow bookkeeping', () => {
    put('.prospec/changes/c/proposal.md', '# c\n');
    put('prospec-report.json', '{}\n');
    gitIn(root, 'add', '-f', '.prospec', 'prospec-report.json');
    gitIn(root, 'commit', '-qm', 'bookkeeping');
    for (const paths of [['.prospec'], ['.prospec/**'], ['prospec-report.json'], ['prospec-report.*'], ['.prospec', 'src/none']]) {
      const only = digestOf(paths);
      expect(only.digest, paths.join(',')).toBeNull();
      expect(only.reason).toMatch(/excluded/);
    }
    expect(digestOf(['.prospec', 'src/lib']).digest).toBe(digestOf(['src/lib']).digest);
    const { inventory } = computeEvidenceStates(root);
    const handedOver = collectModuleDigests(root, { modules: [mod('m', ['.prospec'])] }, {
      knowledgePath: path.join(root, 'prospec/ai-knowledge'),
      specsPath: path.join(root, 'prospec/specs'),
      generatedArtifacts: [],
      inventory,
    }).get('m')!;
    expect(handedOver.digest).toBeNull();
  });

  it('lifts the generated-artifact exclusion when the other files lie in a never-lifted exclusion', () => {
    put('gen/out.ts', 'generated\n');
    gitIn(root, 'add', 'gen');
    gitIn(root, 'commit', '-qm', 'gen');
    const unexcluded = digestOf(['gen']).digest;
    expect(unexcluded).toMatch(/^source-v1:/);
    for (const generated of [['gen/out.ts'], ['gen/*.ts']]) {
      expect(digestOf(['prospec', 'gen'], generated).digest, generated[0]).toBe(unexcluded);
    }
  });

  it('judges never-lifted exclusions by what git would record, so staging a deletion keeps the answer', () => {
    put('.prospec/changes/c/proposal.md', '# c\n');
    gitIn(root, 'add', '-f', '.prospec');
    gitIn(root, 'commit', '-qm', 'bookkeeping');
    const cases: Array<[string[], string[], 'null' | 'digest']> = [
      [['prospec/specs', 'src/lib'], ['src/lib/a.ts', 'src/lib/b.ts'], 'null'],
      [['.prospec', 'src/lib'], ['src/lib/a.ts', 'src/lib/b.ts'], 'null'],
      [['.prospec'], ['.prospec/changes/c/proposal.md'], 'digest'],
      [['prospec/specs/**', 'src/lib/*.ts'], ['src/lib/a.ts', 'src/lib/b.ts'], 'null'],
      [['.prospec/**'], ['.prospec/changes/c/proposal.md'], 'digest'],
    ];
    for (const [paths, removed, expected] of cases) {
      for (const file of removed) unlinkSync(path.join(root, file));
      const unstaged = digestOf(paths);
      gitIn(root, 'rm', '-q', '--cached', ...removed);
      const staged = digestOf(paths);
      expect(unstaged.digest, paths.join(',')).toBe(staged.digest);
      expect(unstaged.digest === null ? 'null' : 'digest', paths.join(',')).toBe(expected);
      gitIn(root, 'reset', '-q', 'HEAD', '--', ...removed);
      gitIn(root, 'checkout', '--', ...removed);
    }
  });

  it('keeps a file untracked by `git rm --cached` as a source, and counts nothing beneath a symlinked ancestor', () => {
    put('gen/out.ts', 'generated\n');
    put('.prospec/c/m.md', '# m\n');
    put('r/m.md', '# r\n');
    gitIn(root, 'add', '-f', 'gen', '.prospec', 'r');
    gitIn(root, 'commit', '-qm', 'more');
    const before = [digestOf(['prospec/specs', 'src/lib']).digest, digestOf(['src/lib', 'gen'], ['gen/out.ts']).digest];
    expect(before[0]).toMatch(/^source-v1:/);
    gitIn(root, 'rm', '-q', '--cached', 'src/lib/a.ts', 'src/lib/b.ts');
    expect([digestOf(['prospec/specs', 'src/lib']).digest, digestOf(['src/lib', 'gen'], ['gen/out.ts']).digest]).toEqual(before);
    gitIn(root, 'reset', '-q', 'HEAD', '--', 'src/lib');

    rmSync(path.join(root, '.prospec/c'), { recursive: true });
    symlinkSync('../r', path.join(root, '.prospec/c'));
    const unstaged = digestOf(['.prospec/*/*.md']).digest;
    gitIn(root, 'rm', '-q', '--cached', '.prospec/c/m.md');
    expect(digestOf(['.prospec/*/*.md']).digest).toBe(unstaged);
  });

  it('judges the generated-artifact lift by what git would record, so staging a deletion keeps the digest', () => {
    put('gen/out.ts', 'generated\n');
    gitIn(root, 'add', 'gen');
    gitIn(root, 'commit', '-qm', 'gen');
    for (const generated of [['gen/out.ts'], ['gen/*.ts']]) {
      unlinkSync(path.join(root, 'src/lib/a.ts'));
      unlinkSync(path.join(root, 'src/lib/b.ts'));
      const unstaged = digestOf(['src/lib', 'gen'], generated).digest;
      expect(unstaged, generated[0]).toBe(digestOf(['gen']).digest);
      gitIn(root, 'rm', '-q', 'src/lib/a.ts', 'src/lib/b.ts');
      expect(digestOf(['src/lib', 'gen'], generated).digest, generated[0]).toBe(unstaged);
      gitIn(root, 'reset', '-q', 'HEAD', '--', 'src/lib');
      gitIn(root, 'checkout', '--', 'src/lib');
    }
  });

  it('digests an empty module and refuses one with no path inside the project', () => {
    mkdirSync(path.join(root, 'src/empty'));
    expect(digestOf(['src/empty']).digest).toMatch(/^source-v1:/);
    const none = digests([mod('m', [])]).get('m')!;
    expect(none.digest).toBeNull();
    expect(none.reason).toMatch(/no supported source path/);
    expect(none.reason).toContain('unsupported-module-path');
  });

  // Creating symlinks needs a privilege Windows CI runners do not grant.
  it.skipIf(process.platform === 'win32')('follows a symlinked knowledge root to its target', () => {
    rmSync(path.join(root, 'prospec/ai-knowledge'), { recursive: true });
    put('docs/knowledge/module-map.yaml', 'modules: []\n');
    symlinkSync('../docs/knowledge', path.join(root, 'prospec/ai-knowledge'));
    gitIn(root, 'add', '-A');
    gitIn(root, 'commit', '-qm', 'link');
    const base = digestOf(['docs', 'src/lib']).digest;
    put('docs/knowledge/module-map.yaml', 'modules: [] # stamped\n');
    expect(digestOf(['docs', 'src/lib']).digest).toBe(base);
  });

  // Creating symlinks needs a privilege Windows CI runners do not grant.
  it.skipIf(process.platform === 'win32')('hashes a symlink by its link text, also when a file becomes a link', () => {
    put('target.txt', 't\n');
    unlinkSync(path.join(root, 'src/lib/b.ts'));
    symlinkSync('../../target.txt', path.join(root, 'src/lib/b.ts'));
    const changed = digestOf(['src/lib']).digest;
    gitIn(root, 'add', '-A');
    gitIn(root, 'commit', '-qm', 'link');
    expect(digestOf(['src/lib']).digest).toBe(changed);
    symlinkSync('missing.ts', path.join(root, 'src/lib/dangling.ts'));
    expect(digestOf(['src/lib']).digest).toMatch(/^source-v1:/);
  });

  it('cannot compute a module holding an untracked nested repository', () => {
    mkdirSync(path.join(root, 'src/lib/vendor'));
    gitIn(path.join(root, 'src/lib/vendor'), 'init', '-q');
    put('src/lib/vendor/x.ts', 'x\n');
    const result = digestOf(['src/lib']);
    expect(result.digest).toBeNull();
    expect(result.reason).toMatch(/nested repository/);
    expect(digestOf(['src/other']).digest).toMatch(/^source-v1:/);
  });

  it('answers only the requested subset', () => {
    const map = { modules: [mod('a', ['src/lib']), mod('b', ['src/other'])] };
    const subset = collectModuleDigests(root, map, {
      knowledgePath: path.join(root, 'prospec/ai-knowledge'),
      specsPath: path.join(root, 'prospec/specs'),
      generatedArtifacts: [],
      subset: new Set(['b']),
    });
    expect([...subset.keys()]).toEqual(['b']);
    expect(subset.get('b')!.digest).toBe(digests(map.modules).get('b')!.digest);
  });

  it('cannot compute any module while the index holds unmerged entries', () => {
    gitIn(root, 'checkout', '-qb', 'side');
    put('src/lib/a.ts', 'side\n');
    gitIn(root, 'commit', '-qam', 'side');
    gitIn(root, 'checkout', '-q', '-');
    put('src/lib/a.ts', 'main\n');
    gitIn(root, 'commit', '-qam', 'main');
    try { gitIn(root, 'merge', 'side'); } catch { /* conflict expected */ }
    const result = digestOf(['src/other']);
    expect(result.digest).toBeNull();
    expect(result.reason).toMatch(/unmerged/i);
  });
});

// Permissions bind nobody under root, and FIFOs, symlinks and shell hooks need a POSIX host.
const posixUser = process.platform !== 'win32' && process.getuid?.() !== 0;

describe('what git would record (REQ-LIB-015)', () => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const base = () => gitIn(root, 'rev-parse', 'HEAD');
  const restore = (commit: string) => {
    gitIn(root, 'reset', '-q', '--hard', commit);
    gitIn(root, 'clean', '-qfd', '-e', 'junk.txt');
  };
  /** One module's answer unstaged, after `git rm --cached` of `path`, and committed. */
  const threeStates = (paths: string[], generated: string[], untrack: string) => {
    const unstaged = digestOf(paths, generated);
    gitIn(root, 'rm', '-q', '--cached', untrack);
    const untracked = digestOf(paths, generated);
    gitIn(root, 'add', '-A');
    gitIn(root, 'commit', '-qm', 'state');
    return [unstaged, untracked, digestOf(paths, generated)];
  };
  const forms: Array<[string[], string[]]> = [[['src/lib'], []], [['src/lib/**'], []], [['src/**', 'gen/**'], ['gen/*.ts']]];

  it('gives a tracked file replaced by a same-named directory one answer in every staging state', () => {
    put('gen/out.ts', 'g\n');
    gitIn(root, 'add', 'gen');
    gitIn(root, 'commit', '-qm', 'gen');
    const start = base();
    for (const [paths, generated] of forms) {
      unlinkSync(path.join(root, 'src/lib/a.ts'));
      put('src/lib/a.ts/x.ts', 'x\n');
      const states = threeStates(paths, generated, 'src/lib/a.ts');
      expect(states[0]!.digest, paths.join(',')).toMatch(/^source-v1:/);
      expect(states[1], paths.join(',')).toEqual(states[0]);
      expect(states[2], paths.join(',')).toEqual(states[0]);
      restore(start);
    }
  });

  it('lifts the generated-artifact exclusion alike when the replaced file was the only source', () => {
    put('gen/out.ts', 'g\n');
    gitIn(root, 'rm', '-q', 'src/lib/b.ts');
    gitIn(root, 'add', 'gen');
    gitIn(root, 'commit', '-qm', 'gen');
    for (const generated of [['gen/out.ts'], ['gen/*.ts']]) {
      const start = base();
      unlinkSync(path.join(root, 'src/lib/a.ts'));
      mkdirSync(path.join(root, 'src/lib/a.ts'));
      const states = threeStates(['src/lib', 'gen'], generated, 'src/lib/a.ts');
      expect(states[0]!.digest, generated[0]).toBe(digestOf(['gen']).digest);
      expect(states[1], generated[0]).toEqual(states[0]);
      expect(states[2], generated[0]).toEqual(states[0]);
      restore(start);
    }
  });

  it.skipIf(!posixUser)('keeps a staged file beneath an unsearchable directory at its index content', () => {
    put('src/s/n.ts', 'n\n');
    gitIn(root, 'add', 'src/s');
    const readable = digestOf(['src/s']).digest;
    expect(readable).toMatch(/^source-v1:/);
    chmodSync(path.join(root, 'src/s'), 0o000);
    try {
      expect(digestOf(['src/s']).digest).toBe(readable);
    } finally {
      chmodSync(path.join(root, 'src/s'), 0o755);
    }
  });

  it('records a modified file whose index blob holds CRLF as git add does, in every staging state', async () => {
    for (const setting of ['autocrlf', 'text=auto']) {
      const start = base();
      put('src/lib/w.ts', 'x\r\ny\r\n');
      gitIn(root, 'add', 'src/lib/w.ts');
      gitIn(root, 'commit', '-qm', 'crlf');
      if (setting === 'autocrlf') gitIn(root, 'config', 'core.autocrlf', 'true');
      else put('.git/info/attributes', '* text=auto\n');
      put('src/lib/w.ts', 'x\r\ny\r\nw\r\n');
      const unstaged = digestOf(['src/lib']).digest;
      gitIn(root, 'add', 'src/lib/w.ts');
      const staged = digestOf(['src/lib']).digest;
      await sleep(2100);
      const settled = digestOf(['src/lib']).digest;
      gitIn(root, 'commit', '-qm', 'w');
      const committed = digestOf(['src/lib']).digest;
      expect([unstaged, staged, settled], setting).toEqual([committed, committed, committed]);
      if (setting === 'autocrlf') gitIn(root, 'config', '--unset-all', 'core.autocrlf');
      rmSync(path.join(root, '.git/info/attributes'), { force: true });
      restore(start);
    }
  });

  // Racy-git: an entry staged in the index's own second is re-read only while the copy keeps that second.
  it('re-reads a racily clean entry the index copy carries, as git add does', async () => {
    await sleep(1100);
    put('src/lib/a.ts', 'bb\n');
    gitIn(root, 'add', 'src/lib/a.ts');
    put('src/lib/a.ts', 'cc\n');
    await sleep(1100);
    const previous = process.env.GIT_OPTIONAL_LOCKS;
    process.env.GIT_OPTIONAL_LOCKS = '0';
    let unstaged;
    try { unstaged = digestOf(['src/lib']).digest; } finally {
      if (previous === undefined) delete process.env.GIT_OPTIONAL_LOCKS; else process.env.GIT_OPTIONAL_LOCKS = previous;
    }
    gitIn(root, 'add', '-A');
    gitIn(root, 'commit', '-qm', 'cc');
    expect(unstaged).toBe(digestOf(['src/lib']).digest);
  });

  it.skipIf(!posixUser)('has no computable digest for a bookkeeping-only module while `.prospec/` is unsearchable', () => {
    put('.prospec/changes/c/proposal.md', '# c\n');
    gitIn(root, 'add', '-f', '.prospec');
    gitIn(root, 'commit', '-qm', 'bookkeeping');
    chmodSync(path.join(root, '.prospec'), 0o000);
    try {
      for (const paths of [['.prospec'], ['.prospec/**']]) {
        const only = digestOf(paths);
        expect(only.digest, paths[0]).toBeNull();
        expect(only.reason, paths[0]).toMatch(/excluded/);
      }
    } finally {
      chmodSync(path.join(root, '.prospec'), 0o755);
    }
  });

  it('has no computable digest for a bookkeeping-only module holding just an untracked nested repository', () => {
    for (const withCommit of [false, true]) {
      mkdirSync(path.join(root, '.prospec/sub'), { recursive: true });
      gitIn(path.join(root, '.prospec/sub'), 'init', '-q');
      put('.prospec/sub/x.md', 'x\n');
      if (withCommit) {
        gitIn(path.join(root, '.prospec/sub'), 'add', 'x.md');
        gitIn(path.join(root, '.prospec/sub'), 'commit', '-qm', 'x');
      }
      for (const paths of [['.prospec'], ['.prospec/**']]) {
        expect(digestOf(paths).digest, `${paths[0]} ${withCommit}`).toBeNull();
      }
      rmSync(path.join(root, '.prospec'), { recursive: true, force: true });
    }
  });

  it('drops the source of a work-tree rename in the bookkeeping as committing it would', () => {
    put('.prospec/a.md', 'a\n');
    gitIn(root, 'add', '-f', '.prospec/a.md');
    gitIn(root, 'commit', '-qm', 'a');
    execFileSync('mv', [path.join(root, '.prospec/a.md'), path.join(root, '.prospec/b.md')]);
    gitIn(root, 'add', '-f', '-N', '.prospec/b.md');
    const renamed = digestOf(['.prospec/a.md']);
    gitIn(root, 'add', '-f', '-A', '.prospec');
    gitIn(root, 'commit', '-qm', 'renamed');
    expect(renamed).toEqual(digestOf(['.prospec/a.md']));
  });

  it.skipIf(process.platform === 'win32')('leaves the index bytes, the git directory\'s file set and every object\'s mtime as they were', () => {
    const upstream = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'module-digests-up-')));
    try {
      gitIn(upstream, 'init', '-q');
      writeFileSync(path.join(upstream, 'a.ts'), 'shared\n');
      gitIn(upstream, 'add', '.');
      gitIn(upstream, 'commit', '-qm', 'up');
      const clone = path.join(upstream, 'clone');
      gitIn(upstream, 'clone', '-q', '--shared', upstream, clone);
      for (const dir of [root, clone]) {
        gitIn(dir, 'config', 'core.splitIndex', 'true');
        gitIn(dir, 'config', 'core.untrackedCache', 'true');
        gitIn(dir, 'update-index', '--split-index');
      }
      // Content equal to existing objects, written in the index's second, is what git would freshen.
      put('src/lib/b.ts', 'a\n');
      // Enough new entries that a split index would write a new shared index beside the real one.
      for (const n of [1, 2, 3, 4, 5]) put(`src/lib/new${n}.ts`, `${n}\n`);
      writeFileSync(path.join(clone, 'b.ts'), 'shared\n');
      const filesOf = (dir: string): string[] => readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name)).sort();
      const objects = [path.join(root, '.git/objects'), path.join(upstream, '.git/objects')];
      for (const file of objects.flatMap(filesOf)) utimesSync(file, new Date('2001-01-01'), new Date('2001-01-01'));
      const snapshot = (dir: string) => [
        readFileSync(path.join(dir, '.git/index')).toString('hex'),
        filesOf(path.join(dir, '.git')).join('\n'),
        objects.flatMap(filesOf).map((file) => `${file}:${statSync(file).mtimeMs}`).join('\n'),
      ];
      for (const dir of [root, clone]) {
        gitIn(dir, 'status', '--porcelain');
        const before = snapshot(dir);
        const result = digests([mod('m', dir === root ? ['src/lib'] : ['.'])], [], dir).get('m')!;
        expect(result.digest, result.reason).toMatch(/^source-v1:/);
        expect(snapshot(dir)).toEqual(before);
      }
      // An alternate the caller exports reaches the repository's objects as well.
      const previous = process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES;
      process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES = path.join(root, '.git/objects');
      try {
        const before = snapshot(root);
        expect(digestOf(['src/lib']).digest).toMatch(/^source-v1:/);
        expect(snapshot(root)).toEqual(before);
      } finally {
        if (previous === undefined) delete process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES; else process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES = previous;
      }
    } finally {
      rmSync(upstream, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === 'win32')('runs no hooks-directory hook against a temporary index', () => {
    const hooks = path.join(root, '.git/test-hooks');
    const log = path.join(root, '.git/hook.log');
    mkdirSync(hooks);
    writeFileSync(path.join(hooks, 'post-index-change'), `#!/bin/sh\necho "index=$GIT_INDEX_FILE" >> "${log}"\n`, { mode: 0o755 });
    gitIn(root, 'config', 'core.hooksPath', hooks);
    put('src/lib/a.ts', 'edited\n');
    put('src/lib/new.ts', 'n\n');
    gitIn(root, 'add', 'src/lib/new.ts');
    const fired = () => readFileSync(log, 'utf8').split('\n').filter((line) => line !== '');
    // The hook fires for the real index, which git names by leaving GIT_INDEX_FILE unset.
    expect(fired()).toContain('index=');
    expect(digestOf(['src/lib']).digest).toMatch(/^source-v1:/);
    expect(fired().every((line) => line === 'index=')).toBe(true);
  });

  it.skipIf(process.platform === 'win32')('leaves no temporary file behind, whether git records the work tree or refuses', () => {
    const tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'module-digests-tmp-')));
    const previous = process.env.TMPDIR;
    process.env.TMPDIR = tmp;
    try {
      put('src/lib/a.ts', 'edited\n');
      expect(digestOf(['src/lib']).digest).toMatch(/^source-v1:/);
      unlinkSync(path.join(root, 'src/lib/b.ts'));
      execFileSync('mkfifo', [path.join(root, 'src/lib/b.ts')]);
      expect(digestOf(['src/lib']).digest).toBeNull();
      expect(readdirSync(tmp)).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previous;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('records the work tree whatever pathspec variables the caller exports', () => {
    mkdirSync(path.join(root, 'src/lib/vendor'));
    gitIn(path.join(root, 'src/lib/vendor'), 'init', '-q');
    put('src/other/c.ts', 'edited\n');
    const previous = process.env.GIT_LITERAL_PATHSPECS;
    process.env.GIT_LITERAL_PATHSPECS = '1';
    try {
      expect(digestOf(['src/other']).digest).toMatch(/^source-v1:/);
    } finally {
      if (previous === undefined) delete process.env.GIT_LITERAL_PATHSPECS; else process.env.GIT_LITERAL_PATHSPECS = previous;
    }
  });

  it.skipIf(!posixUser)('refuses a module whose changed file git will not record, naming git, and spares one listing no change', () => {
    const clean = digestOf(['src/other']).digest;
    for (const refuse of ['fifo', 'unreadable'] as const) {
      const start = base();
      if (refuse === 'fifo') {
        unlinkSync(path.join(root, 'src/lib/a.ts'));
        execFileSync('mkfifo', [path.join(root, 'src/lib/a.ts')]);
      } else {
        put('src/lib/a.ts', 'edited\n');
        chmodSync(path.join(root, 'src/lib/a.ts'), 0o000);
      }
      const result = digests([mod('m', ['src/lib']), mod('o', ['src/other'])]);
      expect(result.get('m')!.digest, refuse).toBeNull();
      expect(result.get('m')!.reason, refuse).toMatch(/^work tree cannot be recorded: (error|fatal): /);
      expect(result.get('o')!.digest, refuse).toBe(clean);
      rmSync(path.join(root, 'src/lib/a.ts'), { force: true });
      restore(start);
    }
  });

  it.skipIf(process.platform === 'win32')('refuses only the modules whose files the object-id pass could not record', async () => {
    put('.gitattributes', 'src/lib/** filter=probe\n');
    gitIn(root, 'add', '.gitattributes');
    gitIn(root, 'commit', '-qm', 'attributes');
    put('src/other/c.ts', 'staged\n');
    gitIn(root, 'add', 'src/other/c.ts');
    // Past the racy second and refreshed, so status never needs the filter below.
    await sleep(1100);
    gitIn(root, 'status', '--porcelain');
    // The membership pass runs with an object directory of its own, the object-id pass without one.
    gitIn(root, 'config', 'filter.probe.clean', 'if [ -n "$GIT_OBJECT_DIRECTORY" ]; then cat; else exit 1; fi');
    gitIn(root, 'config', 'filter.probe.required', 'true');
    put('src/lib/a.ts', 'edited\n');
    const result = digests([mod('m', ['src/lib']), mod('o', ['src/other'])]);
    expect(result.get('m')!.digest).toBeNull();
    expect(result.get('m')!.reason).toMatch(/^work tree cannot be recorded: /);
    expect(result.get('o')!.digest).toMatch(/^source-v1:/);
  });

  it.skipIf(process.platform === 'win32')('refuses a module whose later file the membership pass refuses, without throwing', () => {
    unlinkSync(path.join(root, 'src/lib/b.ts'));
    execFileSync('mkfifo', [path.join(root, 'src/lib/b.ts')]);
    const result = digests([mod('m', ['src/lib']), mod('o', ['src/other'])]);
    expect(result.get('m')!.digest).toBeNull();
    expect(result.get('m')!.reason).toMatch(/^work tree cannot be recorded: /);
    expect(result.get('o')!.digest).toMatch(/^source-v1:/);
    unlinkSync(path.join(root, 'src/lib/b.ts'));
  });

  it.skipIf(process.platform === 'win32')('names a git that ends without a message by the signal that ended it', async () => {
    put('.gitattributes', '*.bin filter=die\n');
    gitIn(root, 'add', '.gitattributes');
    gitIn(root, 'commit', '-qm', 'attributes');
    await sleep(1100);
    gitIn(root, 'status', '--porcelain');
    gitIn(root, 'config', 'filter.die.clean', 'kill -9 $PPID');
    put('src/lib/new.bin', 'n\n');
    const result = digestOf(['src/lib']);
    expect(result.digest).toBeNull();
    expect(result.reason).toBe('work tree cannot be recorded: git add ended by SIGKILL');
  });

  it('keeps a nested repository from blocking another module, and refuses one git would add as a gitlink', () => {
    mkdirSync(path.join(root, 'src/lib/n'));
    gitIn(path.join(root, 'src/lib/n'), 'init', '-q');
    put('src/other/c.ts', 'edited\n');
    const both = digests([mod('m', ['src/lib']), mod('o', ['src/other'])]);
    expect(both.get('m')!.reason).toMatch(/nested repository/);
    rmSync(path.join(root, 'src/lib/n'), { recursive: true, force: true });
    expect(both.get('o')!.digest).toBe(digestOf(['src/other']).digest);

    unlinkSync(path.join(root, 'src/lib/b.ts'));
    mkdirSync(path.join(root, 'src/lib/b.ts'));
    gitIn(path.join(root, 'src/lib/b.ts'), 'init', '-q');
    put('src/lib/b.ts/y.ts', 'y\n');
    gitIn(path.join(root, 'src/lib/b.ts'), 'add', 'y.ts');
    gitIn(path.join(root, 'src/lib/b.ts'), 'commit', '-qm', 'y');
    const replaced = digestOf(['src/lib']);
    expect(replaced.digest).toBeNull();
    expect(replaced.reason).toMatch(/nested repository/);
  });

  it('keeps a glob module with generated artifacts unchanged when its sources are untracked by `git rm --cached`', () => {
    put('gen/out.ts', 'g\n');
    gitIn(root, 'add', 'gen');
    gitIn(root, 'commit', '-qm', 'gen');
    const before = digestOf(['src/lib/*.ts', 'gen/*.ts'], ['gen/*.ts']).digest;
    expect(before).toBe(digestOf(['src/lib/*.ts']).digest);
    gitIn(root, 'rm', '-q', '--cached', 'src/lib/a.ts', 'src/lib/b.ts');
    expect(digestOf(['src/lib/*.ts', 'gen/*.ts'], ['gen/*.ts']).digest).toBe(before);
  });

  it.skipIf(!posixUser)('reads no excluded file while a source file settles the answer, so a refused path elsewhere cannot flip it', () => {
    put('.prospec/keep.md', 'k\n');
    gitIn(root, 'add', '-f', '.prospec');
    gitIn(root, 'commit', '-qm', 'keep');
    put('junk.txt', 'j\n');
    chmodSync(path.join(root, 'junk.txt'), 0o000);
    try {
      const withSource = digestOf(['src/lib', 'prospec']).digest;
      const sourceless = digestOf(['prospec/ai-knowledge', '.prospec']);
      expect(sourceless.reason).toMatch(/excluded/);
      put('prospec/ai-knowledge/module-map.yaml', 'modules: [] # stamped\n');
      put('prospec/specs/features/y.md', '# graduated\n');
      expect(digestOf(['src/lib', 'prospec']).digest).toBe(withSource);
      expect(digestOf(['prospec/ai-knowledge', '.prospec'])).toEqual(sourceless);

      put('.prospec/changes/c/proposal.md', '# c\n');
      for (const paths of [['src', '.prospec'], ['src/**', '.prospec/**']]) {
        expect(digestOf(paths).digest, paths[0]).toBe(digestOf(['src']).digest);
      }
    } finally {
      chmodSync(path.join(root, 'junk.txt'), 0o644);
    }
  });

  it.skipIf(!posixUser)('judges a bookkeeping-only module the same whichever of its files sorts first', () => {
    put('junk.txt', 'j\n');
    chmodSync(path.join(root, 'junk.txt'), 0o000);
    try {
      for (const [changed, unchanged] of [['a.md', 'zz.md'], ['zz.md', 'a.md']]) {
        const start = base();
        put(`.prospec/${changed}`, '1\n');
        put(`.prospec/${unchanged}`, '1\n');
        gitIn(root, 'add', '-f', '.prospec');
        gitIn(root, 'commit', '-qm', 'bk');
        put(`.prospec/${changed}`, '2\n');
        const only = digestOf(['.prospec']);
        expect(only.reason, changed).toMatch(/excluded/);
        restore(start);
      }
    } finally {
      chmodSync(path.join(root, 'junk.txt'), 0o644);
    }
  });

  it('resolves generated artifacts against a project in a repository subdirectory', () => {
    put('proj/src/a.ts', 'a\n');
    put('proj/gen/out.ts', 'g\n');
    gitIn(root, 'add', 'proj');
    gitIn(root, 'commit', '-qm', 'proj');
    const project = path.join(root, 'proj');
    const declared = digests([mod('m', ['src', 'gen'])], ['gen/*.ts'], project).get('m')!.digest;
    expect(declared).toBe(digests([mod('m', ['src'])], [], project).get('m')!.digest);
    expect(digests([mod('m', ['src', 'gen'])], [], project).get('m')!.digest).not.toBe(declared);
  });

  it.skipIf(process.platform === 'win32')('gives a directory replaced by a symlink the digest it has once committed', () => {
    mkdirSync(path.join(root, 't'));
    execFileSync('mv', [path.join(root, 'src/lib/a.ts'), path.join(root, 'src/lib/b.ts'), path.join(root, 't')]);
    rmSync(path.join(root, 'src/lib'), { recursive: true });
    symlinkSync('../t', path.join(root, 'src/lib'));
    const unstaged = digestOf(['src']).digest;
    gitIn(root, 'add', '-A');
    gitIn(root, 'commit', '-qm', 'link');
    expect(digestOf(['src']).digest).toBe(unstaged);
  });
});

describe('module paths as git reads them (REQ-LIB-015, REQ-LIB-039)', () => {
  const lsGlob = (glob: string, cwd = root) =>
    execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', `:(glob)${glob}`], { cwd })
      .toString().split('\0').filter(Boolean);

  it('gives a project-root module, whatever its spelling, a digest that follows every source file', () => {
    const base = digestOf(['.']);
    expect(base.digest, base.reason).toMatch(/^source-v1:/);
    for (const spelling of ['./', 'src/..']) expect(digestOf([spelling]).digest, spelling).toBe(base.digest);
    expect(base.digest).toBe(digestOf(['src', '.gitignore']).digest);
    put('src/other/c.ts', 'edited\n');
    expect(digestOf(['.']).digest).not.toBe(base.digest);
  });

  it('keeps the knowledge base, the Feature Specs and the bookkeeping out of a project-root module', () => {
    const base = digestOf(['.']).digest;
    put('prospec/ai-knowledge/module-map.yaml', 'modules: [] # stamped\n');
    put('prospec/specs/features/x.md', '# graduated\n');
    put('.prospec/changes/c/proposal.md', '# c\n');
    expect(digestOf(['.']).digest).toBe(base);
  });

  it('confines a project-root module to a project in a repository subdirectory', () => {
    put('proj/src/a.ts', 'a\n');
    gitIn(root, 'add', 'proj');
    gitIn(root, 'commit', '-qm', 'proj');
    const project = path.join(root, 'proj');
    const base = digests([mod('m', ['.'])], [], project).get('m')!.digest;
    expect(base).toBe(digests([mod('m', ['src'])], [], project).get('m')!.digest);
    put('src/lib/a.ts', 'outside the project\n');
    expect(digests([mod('m', ['.'])], [], project).get('m')!.digest).toBe(base);
    put('proj/src/a.ts', 'inside\n');
    expect(digests([mod('m', ['.'])], [], project).get('m')!.digest).not.toBe(base);
  });

  it('covers exactly the files git lists for a glob under :(glob), in the repository root and a subdirectory', () => {
    put('src/top.ts', 't\n');
    put('name/x/n.ts', 'n\n');
    put('pkg/name/y/m.ts', 'm\n');
    put('proj/name/z.ts', 'z\n');
    put('proj/src/deep/d.ts', 'd\n');
    put('proj/src/p.ts', 'p\n');
    gitIn(root, 'add', '.');
    gitIn(root, 'commit', '-qm', 'globs');
    const project = path.join(root, 'proj');
    for (const [glob, cwd] of [['src/*.ts', root], ['**/name/**', root], ['src/*.ts', project], ['**/name/**', project]] as const) {
      const listed = lsGlob(glob, cwd);
      expect(listed.length, `${glob} in ${cwd}`).toBeGreaterThan(0);
      expect(digests([mod('m', [glob])], [], cwd).get('m')!.digest, `${glob} in ${cwd}`)
        .toBe(digests([mod('m', listed)], [], cwd).get('m')!.digest);
    }
    const single = digestOf(['src/*.ts']).digest;
    put('src/lib/a.ts', 'nested\n');
    expect(digestOf(['src/*.ts']).digest).toBe(single);
    const named = digestOf(['**/name/**']).digest;
    put('name/x/n.ts', 'top-level\n');
    expect(digestOf(['**/name/**']).digest).not.toBe(named);
  });

  it('reads a glob the way git normalizes it', () => {
    const base = digestOf(['src/**']).digest;
    for (const spelling of ['./src/**', 'src//**']) expect(digestOf([spelling]).digest, spelling).toBe(base);
  });

  it('counts no file through a refused path, and names the refused paths when no supported path remains', () => {
    const base = digestOf(['src/lib']).digest;
    const refused = ['src/{a,b}/**', ':(top)src/other', 'src/*/../other/**', path.join(root, 'src/other/**')];
    expect(digestOf(['src/lib', ...refused]).digest).toBe(base);
    const none = digestOf(['src/{a,b}/**', ':(top)src/other']);
    expect(none.digest).toBeNull();
    expect(none.reason).toMatch(/no supported source path/);
    expect(none.reason).toContain('src/{a,b}/**');
    expect(none.reason).toContain(':(top)src/other');
    expect(none.reason).toContain('unsupported-module-path');
  });

  it('refers to the unsupported-module-path check when the clamp already dropped every declared path (review R1-1)', () => {
    put('prospec/ai-knowledge/module-map.yaml', [
      'modules:',
      '  - name: out',
      '    paths: ["../elsewhere", "src/../../x/**"]',
      '    keywords: []',
      '  - name: rootglob',
      '    paths: ["*/.."]',
      '    keywords: []',
    ].join('\n'));
    const map = loadModuleMap(path.join(root, 'prospec/ai-knowledge'), root)!;
    expect(map.modules.map((m) => m.paths)).toEqual([[], []]);
    const result = collectModuleDigests(root, map, {
      knowledgePath: path.join(root, 'prospec/ai-knowledge'),
      specsPath: path.join(root, 'prospec/specs'),
      generatedArtifacts: [],
    });
    for (const name of ['out', 'rootglob']) {
      expect(result.get(name)!.digest, name).toBeNull();
      expect(result.get(name)!.reason, name).toMatch(/no supported source path/);
      expect(result.get(name)!.reason, name).toContain('unsupported-module-path');
    }
  });

  it('matches a literal path holding brackets or a question mark as the path it names', () => {
    put('app/[id]/p.ts', 'p\n');
    put('app/i/x.ts', 'x\n');
    gitIn(root, 'add', 'app');
    gitIn(root, 'commit', '-qm', 'app');
    const base = digestOf(['app/[id]']).digest;
    expect(base).toBe(digestOf(['app/[id]/p.ts']).digest);
    put('app/i/x.ts', 'edited\n');
    expect(digestOf(['app/[id]']).digest).toBe(base);
    expect(digestOf(['src/lib/?.ts']).digest).toBe(digestOf(['src/lib/none.ts']).digest);
  });

  it('reads generated artifacts by the same rule, a refused pattern excluding nothing', () => {
    put('src/top.ts', 't\n');
    gitIn(root, 'add', '.');
    gitIn(root, 'commit', '-qm', 'top');
    expect(digestOf(['src'], ['src/*.ts']).digest).toBe(digestOf(['src/lib', 'src/other']).digest);
    expect(digestOf(['src/lib'], ['src/lib/{a,b}.ts']).digest).toBe(digestOf(['src/lib']).digest);
    expect(digestOf(['src/lib'], ['../outside']).digest).toBe(digestOf(['src/lib']).digest);
    expect(digestOf(['src/lib'], ['.']).digest).toBe(digestOf(['src/lib']).digest);
  });
});
