import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { collectImportEdges, collectUnsupportedModulePaths } from '../../../src/lib/drift-sources.js';
import type { ModuleMap } from '../../../src/types/module-map.js';
import { gitIn } from '../../helpers/git-fixture.js';

vi.setConfig({ testTimeout: 30_000 });
let cwd: string;
const map: ModuleMap = { modules: [
  { name: 'a', paths: ['src/a'], keywords: [] },
  { name: 'b', paths: ['src/b'], keywords: [] },
] };
const write = (name: string, value: string) => {
  mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true });
  writeFileSync(path.join(cwd, name), value);
};
beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), 'prospec-import-index-'));
  gitIn(cwd, 'init', '-q');
  write('.gitignore', 'node_modules/\n');
  write('src/a/main.ts', "import '../b/target.js';\n");
  write('src/b/target.ts', 'export const value = 1;\n');
  gitIn(cwd, 'add', '.');
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe('import edges from the git index', () => {
  it('scans a staged member and ignores ignored and untracked source until staged', () => {
    write('src/a/node_modules/dep/ignored.ts', "import '../../../b/target.js';\n");
    write('src/a/scratch.ts', "import '../b/target.js';\n");
    expect(collectImportEdges(cwd, map).edges.map((e) => e.from_path)).toEqual(['src/a/main.ts']);
    gitIn(cwd, 'add', 'src/a/scratch.ts');
    expect(collectImportEdges(cwd, map).edges.map((e) => e.from_path)).toEqual(['src/a/main.ts', 'src/a/scratch.ts']);
  });

  it('applies configured exclusions without changing single-file attribution', () => {
    const single = { modules: [{ ...map.modules[0]!, paths: ['src/a/main.ts'] }, map.modules[1]!] };
    expect(collectImportEdges(cwd, single).edges).toHaveLength(1);
    expect(collectImportEdges(cwd, single, { exclude: ['src/a/main.ts'] }).edges).toEqual([]);
  });

  it('keeps attribution for overlapping glob modules', () => {
    write('packages/pkg/src/components/widget.ts', "import '../../../../src/b/target.js';\n");
    gitIn(cwd, 'add', '.');
    const overlap = { modules: [
      { name: 'package', paths: ['packages/*/src/**'], keywords: [] },
      { name: 'component', paths: ['**/components/**'], keywords: [] },
      map.modules[1]!,
    ] };
    expect(collectImportEdges(cwd, overlap).edges).toEqual([{
      from_path: 'packages/pkg/src/components/widget.ts', from_module: 'component',
      to_module: 'b', specifier: '../../../../src/b/target.js', line: 1,
    }]);
  });

  it('returns unavailable when the directory is not a work tree', () => {
    rmSync(path.join(cwd, '.git'), { recursive: true, force: true });
    expect(collectImportEdges(cwd, map)).toMatchObject({ available: false, reason: expect.any(String), edges: [] });
  });
});

describe('exclude spelling diagnostics', () => {
  it.each([null, 'modules: [', 'modules: []\n'])('reads config exclusions with module-map %s', (moduleMap) => {
    write('.prospec.yaml', 'exclude:\n  - ../outside\n  - ":magic"\n  - "{src,docs}*"\n');
    if (moduleMap !== null) write('prospec/ai-knowledge/module-map.yaml', moduleMap);
    const source = collectUnsupportedModulePaths(cwd, path.join(cwd, 'prospec/ai-knowledge'));
    expect(source.available).toBe(true);
    expect(source.paths.map((p) => [p.owner, p.path])).toEqual([
      ['exclude', '../outside'], ['exclude', ':magic'], ['exclude', '{src,docs}*'],
    ]);
  });
});
