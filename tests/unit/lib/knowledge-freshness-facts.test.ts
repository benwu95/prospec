import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectGitTimestamps, collectModuleDigests } from '../../../src/lib/drift-sources.js';
import type { ModuleMap } from '../../../src/types/module-map.js';
import { gitIn } from '../../helpers/git-fixture.js';

vi.setConfig({ testTimeout: 30_000 });

let root: string;
const put = (dir: string, file: string, text: string) => {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), text);
};
const knowledge = (dir: string) => path.join(dir, 'prospec/ai-knowledge');
const map = (digest?: string): ModuleMap => ({
  modules: [
    { name: 'lib', paths: ['src/lib'], keywords: [], last_verified: '2026-10-25T00:00:00.000Z', ...(digest ? { source_digest: digest } : {}) },
    { name: 'other', paths: ['src/other'], keywords: [] },
  ],
});

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'freshness-facts-')));
  gitIn(root, 'init', '-q');
  put(root, 'src/lib/a.ts', 'a\n');
  put(root, 'src/other/b.ts', 'b\n');
  put(root, 'prospec/ai-knowledge/modules/lib/README.md', '# lib\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('collectGitTimestamps source facts (REQ-LIB-015, REQ-LIB-070)', () => {
  it('judges an unborn HEAD by digest with null commit times', () => {
    const source = collectGitTimestamps(root, map(), knowledge(root), []);
    expect(source.available).toBe(true);
    const lib = source.modules.find((m) => m.name === 'lib')!;
    expect(lib.last_src_commit).toBeNull();
    expect(lib.source.current).toMatch(/^source-v1:/);
    expect(lib.source.recorded).toBeNull();
  });

  it('carries the recorded digest and the current one side by side', () => {
    gitIn(root, 'add', '.');
    gitIn(root, 'commit', '-qm', 'base');
    const current = collectModuleDigests(root, map(), {
      knowledgePath: knowledge(root),
      specsPath: path.join(root, 'prospec/specs'),
      generatedArtifacts: [],
    }).get('lib')!.digest!;
    const lib = collectGitTimestamps(root, map(current), knowledge(root), []).modules.find((m) => m.name === 'lib')!;
    expect(lib.source).toEqual({ recorded: current, current });
    expect(lib.last_src_commit).not.toBeNull();
  });

  it('judges a shallow clone by digest while its commit times stay null', () => {
    gitIn(root, 'add', '.');
    gitIn(root, 'commit', '-qm', 'one');
    put(root, 'src/lib/a.ts', 'two\n');
    gitIn(root, 'commit', '-qam', 'two');
    const clone = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'freshness-shallow-')));
    try {
      execFileSync('git', ['clone', '-q', '--depth', '1', `file://${root}`, clone], { stdio: 'pipe' });
      const source = collectGitTimestamps(clone, map(), knowledge(clone), []);
      expect(source.available).toBe(true);
      const lib = source.modules.find((m) => m.name === 'lib')!;
      expect(lib.last_src_commit).toBeNull();
      expect(lib.source.current).toMatch(/^source-v1:/);
    } finally {
      rmSync(clone, { recursive: true, force: true });
    }
  });

  it('answers only the requested subset while digesting against the whole map', () => {
    const source = collectGitTimestamps(root, map(), knowledge(root), [], true, { subset: new Set(['other']) });
    expect(source.modules.map((m) => m.name)).toEqual(['other']);
  });

  it('stays unavailable outside a git work tree', () => {
    const plain = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'freshness-plain-')));
    try {
      expect(collectGitTimestamps(plain, map(), knowledge(plain), []).available).toBe(false);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});
