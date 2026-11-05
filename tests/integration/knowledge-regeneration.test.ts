import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isScalar, isSeq, parseDocument } from 'yaml';
import { execute as update, updateModuleMap } from '../../src/services/knowledge-update.service.js';
import { execute as verify } from '../../src/services/knowledge-verify.service.js';
import { isGitWorkTree } from '../../src/lib/drift-sources.js';
import { parseYaml } from '../../src/lib/yaml-utils.js';
import { INDEX_COLUMN, INDEX_TABLE_HEADER, INDEX_TABLE_SEPARATOR } from '../../src/types/knowledge.js';
import type { ModuleMap } from '../../src/types/module-map.js';
import { gitIn } from '../helpers/git-fixture.js';

vi.setConfig({ testTimeout: 60_000 });

const dirs: string[] = [];
const MAP = 'prospec/ai-knowledge/module-map.yaml';
const INDEX = 'prospec/index.md';
const NOW = '2026-11-04T00:00:00.000Z';
const put = (cwd: string, file: string, content: string) => {
  mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
  writeFileSync(path.join(cwd, file), content);
};
const read = (cwd: string, file: string) => readFileSync(path.join(cwd, file), 'utf8');
const map = (cwd: string) => parseYaml<ModuleMap>(read(cwd, MAP));
const row = (cwd: string, name: string) => read(cwd, INDEX).split('\n')
  .find(line => line.startsWith(`| **${name}** |`))!.split('|').slice(1, -1).map(cell => cell.trim());
const CURATED_INDEX = [
  '# Authored Knowledge Index',
  '',
  '<!-- prospec:auto-start -->',
  INDEX_TABLE_HEADER,
  INDEX_TABLE_SEPARATOR,
  '| **auth** | login | 認證 | Active | Stale index description | Own authentication | — |',
  '| **billing** | billing | old billing alias | Active | Old billing description | Old billing rationale | — |',
  '<!-- prospec:auto-end -->',
  '',
  '## Authored static notes',
  'Keep this paragraph exactly.',
  '',
].join('\n');
const AUTHORED_MAP = `# curated map header
modules:
  - name: auth # auth identity
    # auth purpose
    description: >-
      Authentication routing
    paths: &auth_paths [src/auth] # auth paths
    keywords:
      - login # login item
  # billing ownership
  - name: billing
    description: >-
      Billing routing
    paths: [src/billing]
    keywords: [billing]
    aliases: []
    rationale: ""
    last_verified: "2026-01-01T00:00:00.000Z"
`;

function fixture(withGit = true, content = AUTHORED_MAP): string {
  const cwd = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'knowledge-regeneration-')));
  dirs.push(cwd);
  put(cwd, '.prospec.yaml', 'project:\n  name: regeneration-test\n');
  put(cwd, MAP, content);
  put(cwd, INDEX, CURATED_INDEX);
  put(cwd, 'src/auth/index.ts', 'export const auth = true;\n');
  put(cwd, 'src/billing/index.ts', 'export const billing = true;\n');
  put(cwd, 'prospec/ai-knowledge/modules/auth/README.md', '# Auth\n');
  put(cwd, 'prospec/ai-knowledge/modules/billing/README.md', '# Billing\n');
  if (withGit) {
    gitIn(cwd, 'init', '-q');
    gitIn(cwd, 'add', '.');
  }
  return cwd;
}

afterEach(() => {
  for (const cwd of dirs.splice(0)) rmSync(cwd, { recursive: true, force: true });
});

function expectAuthMetadata(content: string): void {
  expect(content).toContain('# curated map header');
  expect(content).toContain('# auth identity');
  expect(content).toContain('# auth purpose');
  expect(content).toContain('# auth paths');
  expect(content).toContain('# login item');
  const doc = parseDocument(content);
  const description = doc.getIn(['modules', 0, 'description'], true);
  const paths = doc.getIn(['modules', 0, 'paths'], true);
  expect(isScalar(description)).toBe(true);
  expect(isScalar(description) && description.type).toBe('BLOCK_FOLDED');
  expect(isSeq(paths)).toBe(true);
  expect(isSeq(paths) && paths.flow).toBe(true);
}

describe('authored Knowledge regeneration', () => {
  it('migrates absent optional values, then preserves explicit clears through complete update', async () => {
    const cwd = fixture();
    const before = map(cwd);
    await update({ cwd, manualModules: ['auth'] });

    const migrated = map(cwd);
    expect(migrated.modules[0]).toMatchObject({
      keywords: ['login'], aliases: ['認證'], rationale: 'Own authentication',
      description: 'Authentication routing',
    });
    expect(migrated.modules[1]).toEqual(before.modules[1]);
    expect(row(cwd, 'auth')[INDEX_COLUMN.ALIASES]).toBe('認證');
    expect(row(cwd, 'auth')[INDEX_COLUMN.RATIONALE]).toBe('Own authentication');
    expect(row(cwd, 'billing')[INDEX_COLUMN.ALIASES]).toBe('—');
    expect(row(cwd, 'billing')[INDEX_COLUMN.RATIONALE]).toBe('—');

    const doc = parseDocument(read(cwd, MAP));
    doc.setIn(['modules', 0, 'keywords'], []);
    doc.setIn(['modules', 0, 'aliases'], []);
    doc.setIn(['modules', 0, 'rationale'], '');
    put(cwd, MAP, doc.toString());
    const clearedBytes = read(cwd, MAP);
    await update({ cwd, manualModules: ['auth'] });

    expect(map(cwd).modules[0]).toMatchObject({ keywords: [], aliases: [], rationale: '' });
    for (const column of [INDEX_COLUMN.KEYWORDS, INDEX_COLUMN.ALIASES, INDEX_COLUMN.RATIONALE]) {
      expect(row(cwd, 'auth')[column]).toBe('—');
    }
    expect(map(cwd).modules[1]).toEqual(before.modules[1]);
    expect(read(cwd, MAP)).toBe(clearedBytes);
    expect(read(cwd, INDEX)).toContain('## Authored static notes\nKeep this paragraph exactly.');
    const indexAfter = read(cwd, INDEX);
    await update({ cwd, manualModules: ['auth'] });
    expect(read(cwd, INDEX)).toBe(indexAfter);
    expect(read(cwd, MAP)).toBe(clearedBytes);
  });

  it.each(['migration', 'add', 'remove', 'stamp'] as const)(
    'preserves comments, scalar/collection style and unrelated values through %s', async operation => {
      const cwd = fixture();
      const before = map(cwd);
      if (operation === 'migration') await update({ cwd, manualModules: ['auth'] });
      if (operation === 'add') await updateModuleMap({ added: ['search'], removed: [] }, path.join(cwd, MAP));
      if (operation === 'remove') await updateModuleMap({ added: [], removed: ['billing'] }, path.join(cwd, MAP));
      if (operation === 'stamp') await verify({ cwd, modules: ['auth'], now: NOW });

      const after = map(cwd);
      expect(after.modules[0]).toMatchObject({
        name: 'auth', description: 'Authentication routing', paths: ['src/auth'], keywords: ['login'],
      });
      if (operation !== 'remove') {
        expect(after.modules[1]).toEqual(before.modules[1]);
        expect(read(cwd, MAP)).toContain('# billing ownership');
      }
      if (operation === 'stamp') {
        expect(after.modules[0]?.last_verified).toBe(NOW);
        expect(after.modules[0]?.source_digest).toMatch(/^source-v1:/);
      }
      if (operation === 'add') expect(after.modules.at(-1)?.name).toBe('search');
      if (operation === 'remove') expect(after.modules.map(module => module.name)).toEqual(['auth']);
      expectAuthMetadata(read(cwd, MAP));
    },
  );

  it('keeps surviving alias values and metadata when its anchor-owning module is removed', async () => {
    const cwd = fixture(true, AUTHORED_MAP.replace('paths: [src/billing]', 'paths: *auth_paths # shared paths'));
    const before = map(cwd);
    await updateModuleMap({ added: [], removed: ['auth'] }, path.join(cwd, MAP));
    const text = read(cwd, MAP);
    expect(map(cwd).modules).toEqual([before.modules[1]]);
    expect(text).toContain('# billing ownership');
    expect(text).toContain('# shared paths');
    expect(text).not.toContain('# auth identity');
    const doc = parseDocument(text);
    const description = doc.getIn(['modules', 0, 'description'], true);
    const paths = doc.getIn(['modules', 0, 'paths'], true);
    expect(isScalar(description) && description.type).toBe('BLOCK_FOLDED');
    expect(isSeq(paths) && paths.flow).toBe(true);
  });

  it('does not rewrite a no-op add/remove or a repeated migration', async () => {
    const cwd = fixture();
    const original = read(cwd, MAP);
    expect(await updateModuleMap({ added: ['auth'], removed: ['unknown'] }, path.join(cwd, MAP))).toBeNull();
    expect(read(cwd, MAP)).toBe(original);
    await update({ cwd, manualModules: ['auth'] });
    const migrated = read(cwd, MAP);
    await update({ cwd, manualModules: ['auth'] });
    expect(read(cwd, MAP)).toBe(migrated);
  });

  it.each(['migration', 'add', 'stamp'] as const)(
    'refuses unsupported data without publishing map changes through %s', async operation => {
      const original = 'custom: {owner: team}\n' + AUTHORED_MAP;
      const cwd = fixture(true, original);
      if (operation === 'migration') {
        const result = await update({ cwd, manualModules: ['auth'] });
        expect(result.warnings.join(' ')).toMatch(/Unsupported Module Map/);
        expect(read(cwd, INDEX)).toBe(CURATED_INDEX);
        expect(result.generatedFiles.some(file => file.path === INDEX)).toBe(false);
      } else {
        const attempt = operation === 'add'
          ? updateModuleMap({ added: ['search'], removed: [] }, path.join(cwd, MAP))
          : verify({ cwd, modules: ['auth'], now: NOW });
        await expect(attempt).rejects.toThrow(/Unsupported Module Map/);
      }
      expect(read(cwd, MAP)).toBe(original);
    },
  );

  it('refuses unsupported data in delta mode before writing any README', async () => {
    const original = 'owner: platform-team\n' + AUTHORED_MAP;
    const cwd = fixture(true, original);
    put(cwd, 'delta-spec.md', '## ADDED Requirements\n\n### REQ-SEARCH-001: Search\n\nBody.\n');
    await expect(update({ cwd, deltaSpecPath: path.join(cwd, 'delta-spec.md') }))
      .rejects.toThrow(/Unsupported Module Map data in .*module-map\.yaml at `owner`/);
    expect(existsSync(path.join(cwd, 'prospec/ai-knowledge/modules/search'))).toBe(false);
    expect(read(cwd, MAP)).toBe(original);
    expect(read(cwd, INDEX)).toBe(CURATED_INDEX);
  });

  it('keeps unknown recursive data untouched during a no-op add/remove', async () => {
    const original = AUTHORED_MAP.replace('name: auth # auth identity', 'name: auth # auth identity\n    custom: &cycle {self: *cycle}');
    const cwd = fixture(true, original);
    expect(await updateModuleMap({ added: ['auth'], removed: ['missing'] }, path.join(cwd, MAP))).toBeNull();
    expect(read(cwd, MAP)).toBe(original);
  });

  it('keeps exact map bytes when a non-git confirmation already has the injected time', async () => {
    const original = `# authored\nmodules:\n  - {name: auth, paths: ["src/auth"], keywords: ["login"], last_verified: "${NOW}"}\n`;
    const cwd = fixture(false, original);
    expect(isGitWorkTree(cwd)).toBe(false);
    const result = await verify({ cwd, modules: ['auth'], now: NOW });
    expect(result.verified).toEqual(['auth']);
    expect(read(cwd, MAP)).toBe(original);
  });
});
