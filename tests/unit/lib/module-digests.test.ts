import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectModuleDigests, computeEvidenceStates } from '../../../src/lib/drift-sources.js';
import type { ModuleMap } from '../../../src/types/module-map.js';
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

  it('judges never-lifted exclusions by the files the work tree holds, so staging a deletion keeps the answer', () => {
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

  it('keeps a file untracked by `git rm --cached` as a source, and never reads a path beneath a symlink as held', () => {
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

  it('judges the generated-artifact lift by the files the work tree holds, so staging a deletion keeps the digest', () => {
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
    expect(none.reason).toMatch(/no source path/);
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
