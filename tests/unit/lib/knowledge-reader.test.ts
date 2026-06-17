import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ARCHIVED_EXCLUDES,
  isArchivedSpec,
  isSafeResourceName,
  readIndex,
  readPlaybook,
  readModuleMapRaw,
  readModuleReadme,
  listFeatureSpecs,
  readFeatureSpec,
  loadModuleMap,
  clampModulePaths,
  parseIndexModules,
  searchModules,
  attachModuleCategories,
  normalizeSearchText,
} from '../../../src/lib/knowledge-reader.js';
import { ModuleDetectionError } from '../../../src/types/errors.js';
import { INDEX_TABLE_HEADER, INDEX_TABLE_SEPARATOR } from '../../../src/types/knowledge.js';

// knowledge-reader uses plain node:fs only (no fast-glob/git), but tests run
// on real temp dirs to mirror the drift-sources suite it shares fixtures with.

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'knowledge-reader-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function write(relPath: string, content: string): void {
  const abs = path.join(tmpDir, relPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

const kp = (): string => path.join(tmpDir, 'knowledge');
const features = (): string => path.join(tmpDir, 'features');

describe('archived exclusion (single source, REQ-MCP-003)', () => {
  it('flags _archived files and directories by basename', () => {
    expect(isArchivedSpec('_archived-2026.md')).toBe(true);
    expect(isArchivedSpec('specs/_archived-old/x.md')).toBe(false); // basename wins
    expect(isArchivedSpec('specs/_archived-flat.md')).toBe(true);
    expect(isArchivedSpec('drift-detection.md')).toBe(false);
  });

  it('exports the glob excludes for scanners', () => {
    expect(ARCHIVED_EXCLUDES).toEqual(['**/_archived*', '**/_archived*/**']);
  });
});

describe('isSafeResourceName', () => {
  it('accepts plain module/spec names', () => {
    expect(isSafeResourceName('drift-detection')).toBe(true);
    expect(isSafeResourceName('lib')).toBe(true);
    expect(isSafeResourceName('v1.2_beta')).toBe(true);
  });

  it('rejects traversal, separators, hidden and empty names', () => {
    expect(isSafeResourceName('../escape')).toBe(false);
    expect(isSafeResourceName('a/b')).toBe(false);
    expect(isSafeResourceName('a\\b')).toBe(false);
    expect(isSafeResourceName('a..b')).toBe(false);
    expect(isSafeResourceName('.hidden')).toBe(false);
    expect(isSafeResourceName('')).toBe(false);
  });
});

describe('content reads (null = not found)', () => {
  it('reads _index.md, _playbook.md and module-map.yaml when present', () => {
    write('knowledge/_index.md', '# Index\n');
    write('knowledge/_playbook.md', '# Playbook\n');
    write('knowledge/module-map.yaml', 'modules: []\n');
    expect(readIndex(kp())).toBe('# Index\n');
    expect(readPlaybook(kp())).toBe('# Playbook\n');
    expect(readModuleMapRaw(kp())).toBe('modules: []\n');
  });

  it('returns null for missing files', () => {
    expect(readIndex(kp())).toBeNull();
    expect(readPlaybook(kp())).toBeNull();
    expect(readModuleMapRaw(kp())).toBeNull();
    expect(readModuleReadme(kp(), 'lib')).toBeNull();
  });

  it('reads a module README and refuses traversal names', () => {
    write('knowledge/modules/lib/README.md', '# lib\n');
    write('secret.md', 'secret\n');
    expect(readModuleReadme(kp(), 'lib')).toBe('# lib\n');
    expect(readModuleReadme(kp(), '../../secret')).toBeNull();
  });

  it('treats a symlink escaping the served root as not-found, never as content', () => {
    write('outside-secret.txt', 'private key material\n');
    mkdirSync(path.join(kp(), 'modules', 'evil'), { recursive: true });
    symlinkSync(
      path.join(tmpDir, 'outside-secret.txt'),
      path.join(kp(), 'modules', 'evil', 'README.md'),
    );
    expect(readModuleReadme(kp(), 'evil')).toBeNull();
  });

  it('still serves a symlink that stays inside the served root', () => {
    write('knowledge/canonical.md', '# canonical\n');
    symlinkSync(path.join(kp(), 'canonical.md'), path.join(kp(), '_playbook.md'));
    expect(readPlaybook(kp())).toBe('# canonical\n');
  });
});

describe('feature specs listing and reads', () => {
  it('lists active specs sorted, excluding archived and non-markdown', () => {
    write('features/sdd-workflow.md', '# sdd\n');
    write('features/ai-knowledge.md', '# ak\n');
    write('features/_archived-old.md', '# old\n');
    write('features/notes.txt', 'x');
    expect(listFeatureSpecs(features())).toEqual(['ai-knowledge', 'sdd-workflow']);
  });

  it('returns [] when the features dir is missing', () => {
    expect(listFeatureSpecs(features())).toEqual([]);
  });

  it('reads an active spec; archived, missing and traversal names are null', () => {
    write('features/sdd-workflow.md', '# sdd\n');
    write('features/_archived-old.md', '# old\n');
    expect(readFeatureSpec(features(), 'sdd-workflow')).toBe('# sdd\n');
    expect(readFeatureSpec(features(), '_archived-old')).toBeNull();
    expect(readFeatureSpec(features(), 'missing')).toBeNull();
    expect(readFeatureSpec(features(), '../outside')).toBeNull();
  });
});

describe('loadModuleMap (moved from check.service, REQ-MCP-006)', () => {
  it('returns null when module-map.yaml is missing', () => {
    expect(loadModuleMap(kp(), tmpDir)).toBeNull();
  });

  it('loads and validates a map', () => {
    write(
      'knowledge/module-map.yaml',
      'modules:\n  - name: lib\n    paths: [src/lib]\n    keywords: []\n',
    );
    expect(loadModuleMap(kp(), tmpDir)?.modules[0]?.name).toBe('lib');
  });

  it('throws loudly on an invalid map (never silent fallback)', () => {
    write('knowledge/module-map.yaml', 'modules:\n  - paths: [src/lib]\n');
    expect(() => loadModuleMap(kp(), tmpDir)).toThrow(ModuleDetectionError);
  });

  it('treats a module-map symlinked outside the root as missing on every surface', () => {
    write(
      'outside-map.yaml',
      'modules:\n  - name: evil\n    paths: [src/evil]\n    keywords: []\n',
    );
    mkdirSync(kp(), { recursive: true });
    symlinkSync(path.join(tmpDir, 'outside-map.yaml'), path.join(kp(), 'module-map.yaml'));
    expect(loadModuleMap(kp(), tmpDir)).toBeNull();
    expect(readModuleMapRaw(kp())).toBeNull();
  });

  it('clamps paths escaping the repo', () => {
    const clamped = clampModulePaths(
      { modules: [{ name: 'lib', paths: ['src/lib', '../outside', '/abs'], keywords: [] }] },
      tmpDir,
    );
    expect(clamped.modules[0]?.paths).toEqual(['src/lib']);
  });
});

const INDEX_FIXTURE = [
  '# AI Knowledge Index',
  '',
  '<!-- prospec:auto-start -->',
  '',
  '| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |',
  '|--------|----------|---------|--------|-------------|-----------|------------|',
  '| **types** | schema, zod | 型別, type definitions | Active | Zod schemas | leaf | — |',
  '| **lib** | fs, drift-checker, token-accounting | 工具, utilities | Active | Shared utilities | infra | types |',
  '',
  '<!-- prospec:auto-end -->',
  '',
  '| Module | Keywords |',
  '| **outside-block** | should-not-parse |',
].join('\n');

describe('parseIndexModules', () => {
  it('parses name/keywords/aliases/description from the auto block only', () => {
    const modules = parseIndexModules(INDEX_FIXTURE);
    expect(modules.map((m) => m.name)).toEqual(['types', 'lib']);
    expect(modules[0]).toEqual({
      name: 'types',
      keywords: ['schema', 'zod'],
      aliases: ['型別', 'type definitions'],
      description: 'Zod schemas',
    });
  });

  it('resolves columns from the canonical column constant (single source, REQ-KNOW-020)', () => {
    const fromConstant = [
      '<!-- prospec:auto-start -->',
      INDEX_TABLE_HEADER,
      INDEX_TABLE_SEPARATOR,
      '| **lib** | fs, drift | 工具 | Active | Shared utilities | infra | types |',
      '<!-- prospec:auto-end -->',
    ].join('\n');
    expect(parseIndexModules(fromConstant)[0]).toEqual({
      name: 'lib',
      keywords: ['fs', 'drift'],
      aliases: ['工具'],
      description: 'Shared utilities',
    });
  });

  it('resolves columns from the header row, surviving reordering', () => {
    const reordered = [
      '<!-- prospec:auto-start -->',
      '| Module | Description | Keywords | Aliases |',
      '|---|---|---|---|',
      '| **lib** | Shared utilities | drift-checker | 工具 |',
      '<!-- prospec:auto-end -->',
    ].join('\n');
    expect(parseIndexModules(reordered)[0]).toEqual({
      name: 'lib',
      keywords: ['drift-checker'],
      aliases: ['工具'],
      description: 'Shared utilities',
    });
  });

  it('returns [] when no module table exists', () => {
    expect(parseIndexModules('# empty\n')).toEqual([]);
  });

  it('parses all modules across grouped ### {Category} sub-tables (REQ-KNOW-018 AC3)', () => {
    const grouped = [
      '<!-- prospec:auto-start -->',
      '### Identity',
      '',
      '| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |',
      '|--------|----------|---------|--------|-------------|-----------|------------|',
      '| **auth** | login, token | 身份 | Active | Auth | core | — |',
      '',
      '### Quiz System',
      '',
      '| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |',
      '|--------|----------|---------|--------|-------------|-----------|------------|',
      '| **quiz** | grade, question | 測驗 | Active | Quiz | core | auth |',
      '<!-- prospec:auto-end -->',
    ].join('\n');
    const modules = parseIndexModules(grouped);
    expect(modules.map((m) => m.name)).toEqual(['auth', 'quiz']);
    expect(modules[1]).toEqual({
      name: 'quiz',
      keywords: ['grade', 'question'],
      aliases: ['測驗'],
      description: 'Quiz',
    });
  });
});

describe('searchModules (REQ-MCP-005)', () => {
  const modules = parseIndexModules(INDEX_FIXTURE);

  it('normalizes separators: `drift checker` ≡ `drift-checker`', () => {
    expect(normalizeSearchText('Drift_Checker')).toBe('drift checker');
    const result = searchModules('drift checker', modules);
    expect(result.matches[0]?.module).toBe('lib');
    expect(result.matches[0]?.matched_field).toBe('keywords');
  });

  it('matches CJK aliases by substring', () => {
    const result = searchModules('型別', modules);
    expect(result.matches[0]).toMatchObject({ module: 'types', matched_field: 'aliases' });
  });

  it('ranks a name match above a keyword match', () => {
    const result = searchModules('lib', modules);
    expect(result.matches[0]).toMatchObject({ module: 'lib', matched_field: 'name' });
  });

  it('carries the module description in each match', () => {
    expect(searchModules('zod', modules).matches[0]?.description).toBe('Zod schemas');
  });

  it('counts a term once even when it hits several fields (distinct-term rule)', () => {
    const pair = [
      // one distinct term ('drift') hitting name+keywords+aliases
      { name: 'alpha-drift', keywords: ['drift'], aliases: ['drift'], description: '' },
      // two distinct terms hitting name only
      { name: 'drift-checker', keywords: [], aliases: [], description: '' },
    ];
    const result = searchModules('drift checker', pair);
    expect(result.matches.map((m) => m.module)).toEqual(['drift-checker', 'alpha-drift']);
  });

  it('breaks ties by codepoint order of the module name, deterministically', () => {
    const tied = [
      { name: 'beta', keywords: ['shared'], aliases: [], description: '' },
      { name: 'alpha', keywords: ['shared'], aliases: [], description: '' },
    ];
    const first = searchModules('shared', tied);
    const second = searchModules('shared', tied);
    expect(first.matches.map((m) => m.module)).toEqual(['alpha', 'beta']);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('returns empty matches plus a suggestion when nothing hits', () => {
    const result = searchModules('nonexistent-concept', modules);
    expect(result.matches).toEqual([]);
    expect(result.suggestion).toContain('knowledge://index');
  });

  it('treats a whitespace-only query as no hits', () => {
    expect(searchModules('  -_ ', modules).matches).toEqual([]);
  });

  it('defaults every match category to [] (filled later by attachModuleCategories)', () => {
    expect(searchModules('zod', modules).matches[0]?.category).toEqual([]);
  });
});

describe('attachModuleCategories (REQ-LIB-017)', () => {
  const baseResult = {
    matches: [
      { module: 'auth', matched_field: 'name' as const, description: 'Auth', category: [] as string[] },
      { module: 'quiz', matched_field: 'keywords' as const, description: 'Quiz', category: [] as string[] },
    ],
  };

  it('returns the result unchanged when the module map is null', () => {
    expect(attachModuleCategories(baseResult, null)).toBe(baseResult);
  });

  it('overwrites stale categories with [] for an unlisted module or a module without a category', () => {
    const stale = {
      matches: [
        { module: 'auth', matched_field: 'name' as const, description: 'Auth', category: ['STALE'] },
        { module: 'quiz', matched_field: 'keywords' as const, description: 'Quiz', category: ['STALE'] },
      ],
    };
    const map = { modules: [{ name: 'auth', paths: ['src/auth'], keywords: [] }] };
    const out = attachModuleCategories(stale, map);
    expect(out.matches.map((m) => m.category)).toEqual([[], []]);
  });

  it('joins the ordered category list by module name', () => {
    const map = {
      modules: [
        { name: 'auth', paths: ['src/auth'], keywords: [], category: ['Identity'] },
        { name: 'quiz', paths: ['src/quiz'], keywords: [], category: ['Quiz System', 'Grading'] },
      ],
    };
    const out = attachModuleCategories(baseResult, map);
    expect(out.matches.map((m) => m.category)).toEqual([['Identity'], ['Quiz System', 'Grading']]);
  });

  it('preserves an empty result with its suggestion untouched', () => {
    const empty = { matches: [], suggestion: 'read knowledge://index' };
    expect(attachModuleCategories(empty, { modules: [] })).toEqual(empty);
  });
});
