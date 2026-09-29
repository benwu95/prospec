import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_KNOWLEDGE_TOKEN_BUDGET } from '../../../src/types/config.js';
import { vol } from 'memfs';
import {
  updateModuleReadme,
  markModuleDeprecated,
  updateModuleMap,
  updateIndex,
  collectAllModules,
  execute,
} from '../../../src/services/knowledge-update.service.js';
import { PrerequisiteError } from '../../../src/types/errors.js';
import { classifyDeltaSpec, loadDeltaModuleContext } from '../../../src/lib/knowledge-sync.js';
import {
  INDEX_TABLE_HEADER,
  INDEX_TABLE_SEPARATOR,
  INDEX_TABLE_COLUMNS,
  INDEX_COLUMN,
} from '../../../src/types/knowledge.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

vi.mock('../../../src/lib/config.js', () => ({
  readConfig: vi.fn().mockResolvedValue({
    project: { name: 'test-project' },
    knowledge: { base_path: 'prospec/ai-knowledge' },
    exclude: [],
  }),
  resolveBasePaths: vi.fn().mockReturnValue({
    baseDir: '/test/prospec',
    knowledgePath: '/test/prospec/ai-knowledge',
    constitutionPath: '/test/prospec/CONSTITUTION.md',
    specsPath: '/test/prospec/specs',
  }),
  // Real defaults, not a stub: the index this service writes embeds the
  // loading-rules table, and a mocked-away budget would render it with empty cells
  // in every assertion here while the real emitter shipped numbers.
  resolveKnowledgeTokenBudget: vi.fn().mockReturnValue(DEFAULT_KNOWLEDGE_TOKEN_BUDGET),
}));

// Partial mock: keep the REAL moduleScanPatterns/classifyModulePath (so the
// path→scan-pattern wiring is exercised for real against memfs) and stub only
// the fast-glob-backed scanDir + filterConventions.
vi.mock('../../../src/lib/scanner.js', async () => {
  const actual = await vi.importActual<typeof import('../../../src/lib/scanner.js')>(
    '../../../src/lib/scanner.js',
  );
  return {
    ...actual,
    scanDir: vi.fn().mockResolvedValue({
      files: ['src/services/foo.service.ts', 'src/services/bar.ts'],
      count: 2,
    }),
    filterConventions: vi.fn().mockReturnValue({ core: [], demand: [] }),
  };
});

// README renders stay canned, but the knowledge index templates render for REAL
// (via a Handlebars instance fed from the actual template files, read with the
// unmocked fs) — updateIndex's whole contract is "never drift from the template",
// so a canned index string would test nothing.
vi.mock('../../../src/lib/template.js', async () => {
  const realFs = await vi.importActual<typeof import('node:fs')>('node:fs');
  const realPath = await vi.importActual<typeof import('node:path')>('node:path');
  const { default: Handlebars } = await vi.importActual<{ default: typeof import('handlebars') }>(
    'handlebars',
  );
  const templatesDir = realPath.resolve(__dirname, '../../../src/templates');
  const read = (rel: string) => realFs.readFileSync(realPath.join(templatesDir, rel), 'utf-8');
  const hb = Handlebars.create();
  hb.registerPartial('index-auto-block', read('knowledge/_index-auto-block.hbs'));
  hb.registerPartial('knowledge-loading-rules', read('skills/_knowledge-loading-rules.hbs'));
  const CANNED_README =
    '# Test Module\n\n<!-- prospec:auto-start -->\n## Key Files\n\n| File | Purpose |\n|------|--------|\n\n## Public API\n\n## Dependencies\n\n## Modification Guide\n\n## Ripple Effects\n\n## Pitfalls\n\n<!-- prospec:auto-end -->\n\n<!-- prospec:user-start -->\n<!-- prospec:user-end -->\n';
  return {
    renderTemplate: vi.fn().mockImplementation(
      (templatePath: string, context: Record<string, unknown>) =>
        templatePath === 'knowledge/index.md.hbs' || templatePath === 'knowledge/_index-auto-block.hbs'
          ? hb.compile(read(templatePath), { noEscape: true })(context)
          : CANNED_README,
    ),
  };
});

beforeEach(() => {
  vol.reset();
});

// --- identifyAffectedModules ---

// --- updateModuleReadme ---

describe('updateModuleReadme', () => {
  it('should create new module README.md', async () => {
    vol.fromJSON({});
    vol.mkdirSync('/project/prospec/ai-knowledge/modules', { recursive: true });

    const result = await updateModuleReadme('auth', ['src/auth/**'], {
      cwd: '/project',
      knowledgeBasePath: 'prospec/ai-knowledge',
    });

    expect(result).not.toBeNull();
    expect(result!.action).toBe('created');
    expect(result!.path).toBe('prospec/ai-knowledge/modules/auth/README.md');

    const content = vol.readFileSync('/project/prospec/ai-knowledge/modules/auth/README.md', 'utf-8');
    expect(content).toContain('prospec:auto-start');
  });

  it('never rewrites an existing README — returns null, file stays bit-identical (issue #107)', async () => {
    // The knowledge lives INSIDE the auto block; a skeleton re-render through
    // mergeContent would replace it with mechanical scaffold text. Reverting
    // the create-only guard makes this go red on the byte comparison.
    const existingContent =
      '# Auth\n\n<!-- prospec:auto-start -->\nLLM-authored knowledge that must survive\n<!-- prospec:auto-end -->\n\n<!-- prospec:user-start -->\nMy custom notes\n<!-- prospec:user-end -->\n';

    vol.fromJSON({
      '/project/prospec/ai-knowledge/modules/auth/README.md': existingContent,
    });

    const result = await updateModuleReadme('auth', ['src/auth/**'], {
      cwd: '/project',
      knowledgeBasePath: 'prospec/ai-knowledge',
    });

    expect(result).toBeNull();
    expect(
      vol.readFileSync('/project/prospec/ai-knowledge/modules/auth/README.md', 'utf-8'),
    ).toBe(existingContent);
  });

  it('passes only applicable registry extensions with generic content-format placeholders for a new README', async () => {
    const { renderTemplate: mockRender } = await import('../../../src/lib/template.js');
    vol.fromJSON({
      '/project/prospec/ai-knowledge/_module-readme-conventions.md': `<!-- prospec:auto-start -->
<!-- prospec:auto-end -->
<!-- prospec:user-start -->
## Project Section Extensions

| ID | Heading | Content | Applies To | Required | MCP Visibility | Content Format |
| --- | --- | --- | --- | --- | --- | --- |
| ownership | Ownership | Who owns this module | auth | required | included | field-table |
| release-notes | Release Notes | Release note entries | services | optional | included | markdown |
<!-- prospec:user-end -->
`,
    });
    vol.mkdirSync('/project/prospec/ai-knowledge/modules', { recursive: true });

    await updateModuleReadme('auth', ['src/auth/**'], {
      cwd: '/project',
      knowledgeBasePath: 'prospec/ai-knowledge',
    });

    const readmeCall = vi
      .mocked(mockRender)
      .mock.calls.filter((call) => call[0] === 'knowledge/module-readme.hbs')
      .at(-1);
    const context = readmeCall![1] as Record<string, unknown>;
    expect(context.section_extensions).toEqual([
      {
        id: 'ownership',
        heading: 'Ownership',
        placeholder: '| Field | Value |\n| --- | --- |\n| _Add field_ | _Add value_ |',
      },
    ]);
  });

  it('should call renderTemplate with key_exports in context', async () => {
    const { renderTemplate: mockRender } = await import('../../../src/lib/template.js');

    vol.fromJSON({});
    vol.mkdirSync('/project/prospec/ai-knowledge/modules', { recursive: true });

    await updateModuleReadme('services', ['src/services/**'], {
      cwd: '/project',
      knowledgeBasePath: 'prospec/ai-knowledge',
    });

    const calls = vi.mocked(mockRender).mock.calls;
    const readmeCall = calls.find((c) => c[0] === 'knowledge/module-readme.hbs');
    expect(readmeCall).toBeTruthy();

    const context = readmeCall![1] as Record<string, unknown>;
    expect(context).toHaveProperty('key_exports');
    expect(Array.isArray(context.key_exports)).toBe(true);
    // Should NOT have public_api
    expect(context).not.toHaveProperty('public_api');
    // Should have key_files
    expect(context).toHaveProperty('key_files');
  });

  it('should filter test files from key_exports', async () => {
    const { renderTemplate: mockRender } = await import('../../../src/lib/template.js');
    const { scanDir } = await import('../../../src/lib/scanner.js');
    vi.mocked(scanDir).mockResolvedValueOnce({
      files: [
        'src/services/auth.service.ts',
        'src/services/auth.service.test.ts',
        'src/services/user.ts',
      ],
      count: 3,
    });

    vol.fromJSON({});
    vol.mkdirSync('/project/prospec/ai-knowledge/modules', { recursive: true });

    await updateModuleReadme('services', ['src/services/**'], {
      cwd: '/project',
      knowledgeBasePath: 'prospec/ai-knowledge',
    });

    const calls = vi.mocked(mockRender).mock.calls;
    const readmeCall = calls.find((c) => c[0] === 'knowledge/module-readme.hbs');
    const context = readmeCall![1] as Record<string, unknown>;
    const keyExports = context.key_exports as Array<{ name: string }>;
    // .test.ts files should be filtered out
    const hasTestExport = keyExports.some((e) => e.name.includes('test'));
    expect(hasTestExport).toBe(false);
  });

  it('falls back to a glob from moduleName and a path of moduleName when modulePaths is empty (L136/L151)', async () => {
    const { renderTemplate: mockRender } = await import('../../../src/lib/template.js');
    const { scanDir } = await import('../../../src/lib/scanner.js');
    vi.mocked(scanDir).mockResolvedValueOnce({ files: [], count: 0 });

    vol.fromJSON({});
    vol.mkdirSync('/project/prospec/ai-knowledge/modules', { recursive: true });

    await updateModuleReadme('auth', [], {
      cwd: '/project',
      knowledgeBasePath: 'prospec/ai-knowledge',
    });

    // empty modulePaths -> scanDir is driven by the `${moduleName}/**` glob
    const scanArgs = vi.mocked(scanDir).mock.calls.at(-1)!;
    expect(scanArgs[0]).toEqual(['auth/**']);

    // empty modulePaths -> templateContext.path falls back to moduleName
    const renderCall = vi
      .mocked(mockRender)
      .mock.calls.filter((c) => c[0] === 'knowledge/module-readme.hbs')
      .at(-1);
    const context = renderCall![1] as Record<string, unknown>;
    expect(context.path).toBe('auth');
  });

  it('routes a directory module path through moduleScanPatterns (scans dir/** not the bare dir)', async () => {
    const { scanDir } = await import('../../../src/lib/scanner.js');
    vol.fromJSON({ '/project/src/realmod/index.ts': 'export const x = 1;\n' });
    vol.mkdirSync('/project/prospec/ai-knowledge/modules', { recursive: true });

    await updateModuleReadme('realmod', ['src/realmod'], {
      cwd: '/project',
      knowledgeBasePath: 'prospec/ai-knowledge',
    });

    // A bare 'src/realmod' entry scans 0 files under fast-glob onlyFiles; the fix
    // must expand it to 'src/realmod/**' before scanDir. Reverting the service to
    // raw modulePaths makes scanDir receive ['src/realmod'] → this goes red.
    const scanArgs = vi.mocked(scanDir).mock.calls.at(-1)!;
    expect(scanArgs[0]).toEqual(['src/realmod/**']);
  });

  it('infers per-extension and per-suffix file descriptions into key_files (L548/L551-554/L565)', async () => {
    // key_files is capped at the first 10 scanned files, so split the branch
    // matrix across two render calls and assert the distinguishing description
    // string each branch returns (executing the branch is not enough).
    const { renderTemplate: mockRender } = await import('../../../src/lib/template.js');
    const { scanDir } = await import('../../../src/lib/scanner.js');

    vol.fromJSON({});
    vol.mkdirSync('/project/prospec/ai-knowledge/modules', { recursive: true });

    const lastContext = () => {
      const renderCall = vi
        .mocked(mockRender)
        .mock.calls.filter((c) => c[0] === 'knowledge/module-readme.hbs')
        .at(-1);
      const ctx = renderCall![1] as Record<string, unknown>;
      const keyFiles = ctx.key_files as Array<{ path: string; description: string }>;
      return (p: string) => keyFiles.find((f) => f.path === p)!.description;
    };

    // Batch 1: basename-keyed branches (checked before the extension table)
    vi.mocked(scanDir).mockResolvedValueOnce({
      files: [
        'src/mod/index.ts',
        'src/mod/index.js',
        'src/mod/foo.service.ts',
        'src/mod/foo.controller.ts',
        'src/mod/foo.types.ts',
        'src/mod/foo.utils.ts',
        'src/mod/foo.test.ts',
        'src/mod/foo.spec.ts',
        'src/mod/tpl.hbs',
        'src/mod/weird.xyz',
      ],
      count: 10,
    });
    await updateModuleReadme('mod', ['src/mod/**'], {
      cwd: '/project',
      knowledgeBasePath: 'prospec/ai-knowledge',
    });
    let descOf = lastContext();
    expect(descOf('src/mod/index.ts')).toBe('Module entry point');
    expect(descOf('src/mod/index.js')).toBe('Module entry point');
    expect(descOf('src/mod/foo.test.ts')).toBe('Test file');
    expect(descOf('src/mod/foo.spec.ts')).toBe('Test file');
    expect(descOf('src/mod/foo.service.ts')).toBe('Service implementation');
    expect(descOf('src/mod/foo.controller.ts')).toBe('Controller implementation');
    expect(descOf('src/mod/foo.types.ts')).toBe('Type definitions');
    expect(descOf('src/mod/foo.utils.ts')).toBe('Utility functions');
    expect(descOf('src/mod/tpl.hbs')).toBe('Handlebars template');
    // unknown extension -> default fallback (L565 right side)
    expect(descOf('src/mod/weird.xyz')).toBe('Source file');

    // Batch 2: extension-table branches — a fresh module name, because the
    // create-only guard makes a second call on 'mod' a no-op (README exists).
    vi.mocked(scanDir).mockResolvedValueOnce({
      files: [
        'src/mod/plain.js',
        'src/mod/notes.md',
        'src/mod/conf.yaml',
        'src/mod/conf.yml',
        'src/mod/data.json',
      ],
      count: 5,
    });
    await updateModuleReadme('mod2', ['src/mod/**'], {
      cwd: '/project',
      knowledgeBasePath: 'prospec/ai-knowledge',
    });
    descOf = lastContext();
    expect(descOf('src/mod/plain.js')).toBe('JavaScript source');
    expect(descOf('src/mod/notes.md')).toBe('Documentation');
    expect(descOf('src/mod/conf.yaml')).toBe('YAML configuration');
    expect(descOf('src/mod/conf.yml')).toBe('YAML configuration');
    expect(descOf('src/mod/data.json')).toBe('JSON configuration');
  });
});

// --- markModuleDeprecated ---

describe('markModuleDeprecated', () => {
  it('should add deprecated banner to existing README', async () => {
    vol.fromJSON({
      '/project/prospec/ai-knowledge/modules/legacy/README.md': '# Legacy\n\nSome content\n',
    });

    const result = await markModuleDeprecated('legacy', 'No longer needed', {
      cwd: '/project',
      knowledgeBasePath: 'prospec/ai-knowledge',
    });

    expect(result).not.toBeNull();
    expect(result!.action).toBe('deprecated');

    const content = vol.readFileSync('/project/prospec/ai-knowledge/modules/legacy/README.md', 'utf-8') as string;
    expect(content).toContain('> **DEPRECATED**');
    expect(content).toContain('No longer needed');
  });

  it('should return null if module README does not exist', async () => {
    vol.fromJSON({});
    vol.mkdirSync('/project', { recursive: true });

    const result = await markModuleDeprecated('nonexistent', 'Gone', {
      cwd: '/project',
      knowledgeBasePath: 'prospec/ai-knowledge',
    });

    expect(result).toBeNull();
  });

  it('should not add duplicate deprecation banners', async () => {
    vol.fromJSON({
      '/project/prospec/ai-knowledge/modules/legacy/README.md':
        '> **DEPRECATED**: This module was removed. Reason: Already deprecated\n\n# Legacy\n',
    });

    const result = await markModuleDeprecated('legacy', 'Second time', {
      cwd: '/project',
      knowledgeBasePath: 'prospec/ai-knowledge',
    });

    expect(result).not.toBeNull();
    const content = vol.readFileSync('/project/prospec/ai-knowledge/modules/legacy/README.md', 'utf-8') as string;
    // Should still have only one deprecation banner
    const matches = content.match(/> \*\*DEPRECATED\*\*/g);
    expect(matches).toHaveLength(1);
  });
});

// --- updateModuleMap ---

describe('updateIndex', () => {
  it('emits the canonical 7-column header/separator and 7-cell rows, no phantom Files column', async () => {
    const result = await updateIndex(
      [{ name: 'auth', description: 'Auth module', status: 'Active' }],
      { cwd: '/test', baseDir: 'prospec', knowledgeBasePath: 'prospec/ai-knowledge', projectName: 'p', tokenBudget: DEFAULT_KNOWLEDGE_TOKEN_BUDGET },
    );

    const content = vol.readFileSync('/test/prospec/index.md', 'utf-8') as string;
    expect(content).toContain(INDEX_TABLE_HEADER);
    expect(content).toContain(INDEX_TABLE_SEPARATOR);
    // the phantom "Files" column (and old README placeholder) must be gone from
    // the module table — scope to the auto block, since the appended loading
    // strategy legitimately has a "Files" column of its own
    const autoBlock = content.slice(
      content.indexOf('prospec:auto-start'),
      content.indexOf('prospec:auto-end'),
    );
    expect(autoBlock).not.toContain('| Files |');
    expect(autoBlock).not.toContain('| README |');

    const row = content.split('\n').find((l) => l.startsWith('| **auth** '));
    expect(row).toBeDefined();
    expect(row!.split('|').slice(1, -1)).toHaveLength(INDEX_TABLE_COLUMNS.length);
    expect(result.action).toBe('created');
  });

  it('preserves curated static content when updating an existing index in place', async () => {
    // An init-scaffold-style index: H1 + intro + ## Modules + auto[empty table]
    // + Project Info + How to Use, with NO user markers. Updating must replace
    // only the auto block, not wipe the title/intro/curated sections.
    vol.fromJSON({
      '/test/prospec/index.md': `# AI Knowledge Index

> This index helps AI Agents quickly understand the project structure.

## Modules

<!-- prospec:auto-start -->
${INDEX_TABLE_HEADER}
${INDEX_TABLE_SEPARATOR}
<!-- prospec:auto-end -->

## Project Info

- **Project**: p

## How to Use

1. Read this index first.
`,
    });

    const result = await updateIndex(
      [{ name: 'auth', description: 'Auth module', status: 'Active' }],
      { cwd: '/test', baseDir: 'prospec', knowledgeBasePath: 'prospec/ai-knowledge', projectName: 'p', tokenBudget: DEFAULT_KNOWLEDGE_TOKEN_BUDGET },
    );

    const content = vol.readFileSync('/test/prospec/index.md', 'utf-8') as string;
    expect(result.action).toBe('updated');
    // the new row is present (module names are bold, matching the curated convention)
    expect(content).toContain('| **auth** ');
    // curated static content survives
    expect(content).toContain('# AI Knowledge Index');
    expect(content).toContain('quickly understand the project structure');
    expect(content).toContain('## How to Use');
    expect(content).toContain('1. Read this index first.');
    // no duplicate H1
    expect(content.match(/# AI Knowledge Index/g)?.length).toBe(1);
  });

  it('emits $-containing descriptions verbatim (no replacement-pattern injection)', () => {
    vol.fromJSON({
      '/test/prospec/index.md': `# AI Knowledge Index

## Modules

<!-- prospec:auto-start -->
${INDEX_TABLE_HEADER}
${INDEX_TABLE_SEPARATOR}
<!-- prospec:auto-end -->
`,
    });

    return updateIndex(
      [{ name: 'billing', description: 'cost is $1 per $& token', status: 'Active' }],
      { cwd: '/test', baseDir: 'prospec', knowledgeBasePath: 'prospec/ai-knowledge', projectName: 'p', tokenBudget: DEFAULT_KNOWLEDGE_TOKEN_BUDGET },
    ).then(() => {
      const content = vol.readFileSync('/test/prospec/index.md', 'utf-8') as string;
      // the literal $1 / $& must survive, and the auto block must not self-nest
      expect(content).toContain('cost is $1 per $& token');
      expect(content.match(/prospec:auto-start/g)?.length).toBe(1);
    });
  });

  it('renders curated columns from module data instead of blanking them to — (REQ-KNOW-036)', async () => {
    vol.fromJSON({
      '/test/prospec/index.md': `# AI Knowledge Index\n\n## Modules\n\n<!-- prospec:auto-start -->\n${INDEX_TABLE_HEADER}\n${INDEX_TABLE_SEPARATOR}\n<!-- prospec:auto-end -->\n`,
    });

    await updateIndex(
      [
        {
          name: 'types',
          description: 'Zod schemas',
          status: 'Active',
          keywords: ['config', 'schema'],
          aliases: ['型別', 'type defs'],
          rationale: 'Leaf module',
          dependsOn: ['lib'],
        },
      ],
      { cwd: '/test', baseDir: 'prospec', knowledgeBasePath: 'prospec/ai-knowledge', projectName: 'p', tokenBudget: DEFAULT_KNOWLEDGE_TOKEN_BUDGET },
    );

    const content = vol.readFileSync('/test/prospec/index.md', 'utf-8') as string;
    const row = content.split('\n').find((l) => l.startsWith('| **types** '))!;
    const cells = row.split('|').slice(1, -1).map((c) => c.trim());
    expect(cells[INDEX_COLUMN.KEYWORDS]).toBe('config, schema');
    expect(cells[INDEX_COLUMN.ALIASES]).toBe('型別, type defs');
    expect(cells[INDEX_COLUMN.RATIONALE]).toBe('Leaf module');
    expect(cells[INDEX_COLUMN.DEPENDS_ON]).toBe('lib');
    // mutation guard: a module with no curated data still renders — placeholders,
    // never crashing or dropping columns
    expect(cells[INDEX_COLUMN.KEYWORDS]).not.toBe('—');
  });
});

describe('updateModuleMap', () => {
  it('should add new modules to module-map.yaml', async () => {
    vol.fromJSON({
      '/project/module-map.yaml':
        'modules:\n  - name: services\n    paths: ["src/services/**"]\n    keywords: ["services"]\n',
    });

    const result = await updateModuleMap(
      { added: ['auth'], removed: [] },
      '/project/module-map.yaml',
    );

    expect(result).not.toBeNull();
    const content = vol.readFileSync('/project/module-map.yaml', 'utf-8') as string;
    expect(content).toContain('auth');
  });

  it('should remove modules from module-map.yaml', async () => {
    vol.fromJSON({
      '/project/module-map.yaml':
        'modules:\n  - name: services\n    paths: ["src/services/**"]\n    keywords: ["services"]\n  - name: legacy\n    paths: ["src/legacy/**"]\n    keywords: ["legacy"]\n',
    });

    const result = await updateModuleMap(
      { added: [], removed: ['legacy'] },
      '/project/module-map.yaml',
    );

    expect(result).not.toBeNull();
    const content = vol.readFileSync('/project/module-map.yaml', 'utf-8') as string;
    expect(content).not.toContain('legacy');
    expect(content).toContain('services');
  });

  it("preserves an existing module's last_verified across an add (REQ-SERVICES-090)", async () => {
    vol.fromJSON({
      '/project/module-map.yaml':
        'modules:\n  - name: services\n    paths: ["src/services/**"]\n    keywords: ["services"]\n    last_verified: "2026-08-14T00:00:00Z"\n',
    });

    const result = await updateModuleMap(
      { added: ['auth'], removed: [] },
      '/project/module-map.yaml',
    );

    expect(result).not.toBeNull();
    const content = vol.readFileSync('/project/module-map.yaml', 'utf-8') as string;
    expect(content).toContain('auth');
    // The pre-existing module's confirmation stamp must survive the sequence rebuild.
    expect(content).toContain('2026-08-14T00:00:00Z');
  });

  it('should return null when module-map.yaml does not exist', async () => {
    vol.fromJSON({});
    vol.mkdirSync('/project', { recursive: true });

    const result = await updateModuleMap(
      { added: ['auth'], removed: [] },
      '/project/nonexistent.yaml',
    );

    expect(result).toBeNull();
  });

  it('is a byte-preserving no-op when an add changes nothing (case-insensitive match)', async () => {
    vol.fromJSON({
      '/project/module-map.yaml':
        'modules:\n  - name: Services\n    paths: ["src/services/**"]\n    keywords: ["services"]\n',
    });

    const before = vol.readFileSync('/project/module-map.yaml', 'utf-8') as string;
    const result = await updateModuleMap(
      { added: ['services'], removed: [] },
      '/project/module-map.yaml',
    );

    // Nothing to change → no write at all: a curated file must not be
    // rewritten (and reflowed) just because the coordinator called through.
    expect(result).toBeNull();
    expect(vol.readFileSync('/project/module-map.yaml', 'utf-8')).toBe(before);
  });

  it('preserves header comments and untouched entries when it does change the map', async () => {
    // A full stringifyYaml round-trip drops every comment and reflows wrapped
    // descriptions — reverting to it turns the comment assertions red.
    const original = [
      '# Module dependency map — source of truth for module boundaries.',
      '# Dependency direction: cli → services → lib → types.',
      'modules:',
      '  - name: services',
      '    description: business logic',
      '    paths: ["src/services/**"]',
      '    keywords: ["services"]',
      '',
    ].join('\n');
    vol.fromJSON({ '/project/module-map.yaml': original });

    const result = await updateModuleMap(
      { added: ['payments'], removed: [] },
      '/project/module-map.yaml',
    );

    expect(result).not.toBeNull();
    const content = vol.readFileSync('/project/module-map.yaml', 'utf-8') as string;
    expect(content).toContain('# Module dependency map — source of truth for module boundaries.');
    expect(content).toContain('# Dependency direction: cli → services → lib → types.');
    expect(content).toContain('description: business logic');
    expect(content).toContain('name: payments');
  });
});

// --- collectAllModules ---

describe('collectAllModules', () => {
  // Isolated unit contract only: execute() deletes the module-map entry BEFORE
  // calling collectAllModules, so a map still containing the removed module is
  // a state the live flow never produces — the real REMOVED flow (entry gone,
  // module absent from the index) is pinned by the execute()-level test below.
  it('marks a deprecated module even when module-map name is mixed-case', () => {
    vol.fromJSON({
      '/project/module-map.yaml':
        'modules:\n  - name: API\n    paths: ["src/api/**"]\n    keywords: ["api"]\n',
    });

    // result.deprecated holds the lowercased delta-spec name
    const modules = collectAllModules(
      { created: [], updated: [], deprecated: ['api'], readmePending: [], generatedFiles: [], warnings: [], sweptFiles: [] },
      '/project/module-map.yaml',
    );

    const api = modules.find((m) => m.name === 'API');
    expect(api?.status).toBe('Deprecated');
  });

  it('falls back to a synthesized description when a module-map entry has none (L528 else)', () => {
    vol.fromJSON({
      '/project/module-map.yaml':
        'modules:\n  - name: auth\n    paths: ["src/auth/**"]\n    keywords: ["auth"]\n',
    });

    const modules = collectAllModules(
      { created: [], updated: [], deprecated: [], readmePending: [], generatedFiles: [], warnings: [], sweptFiles: [] },
      '/project/module-map.yaml',
    );

    const auth = modules.find((m) => m.name === 'auth');
    expect(auth?.description).toBe('auth module');
    expect(auth?.status).toBe('Active');
  });

  it('falls back to result data (created/updated/deprecated) when module-map is unreadable', () => {
    const modules = collectAllModules(
      {
        created: ['newmod'],
        updated: ['changedmod'],
        deprecated: ['goneMod'],
        readmePending: [],
        generatedFiles: [],
        warnings: [],
        sweptFiles: [],
      },
      '/nonexistent/module-map.yaml',
    );

    expect(modules).toContainEqual({
      name: 'newmod',
      description: 'newmod module',
      status: 'Active',
      keywords: [],
      aliases: [],
      rationale: '',
      dependsOn: [],
      category: [],
    });
    expect(modules).toContainEqual({
      name: 'changedmod',
      description: 'changedmod module',
      status: 'Active',
      keywords: [],
      aliases: [],
      rationale: '',
      dependsOn: [],
      category: [],
    });
    expect(modules).toContainEqual({
      name: 'goneMod',
      description: 'goneMod module',
      status: 'Deprecated',
      keywords: [],
      aliases: [],
      rationale: '',
      dependsOn: [],
      category: [],
    });
  });
});

// --- execute ---

describe('execute', () => {
  it('should process delta-spec mode', async () => {
    const deltaContent = `## ADDED

### REQ-AUTH-001: Add authentication

**Description:** New auth

---
`;

    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\ntech_stack:\n  language: typescript\n',
      '/project/prospec/index.md': '# AI Knowledge Index\n\n<!-- prospec:auto-start -->\n## Modules\n<!-- prospec:auto-end -->\n\n<!-- prospec:user-start -->\n<!-- prospec:user-end -->\n',
      '/project/delta-spec.md': deltaContent,
    });

    const result = await execute({
      deltaSpecPath: '/project/delta-spec.md',
      cwd: '/project',
    });

    expect(result.created).toContain('auth');
    expect(result.generatedFiles.length).toBeGreaterThan(0);
  });

  it('migrates curated columns index→module-map on the fly before regen (no-clobber, idempotent) (REQ-KNOW-036 AC2)', async () => {
    const indexWithCurated = [
      '# AI Knowledge Index',
      '',
      '<!-- prospec:auto-start -->',
      '## Modules',
      '',
      INDEX_TABLE_HEADER,
      INDEX_TABLE_SEPARATOR,
      '| **auth** | login, jwt | 認證, 登入 | Active | Auth module | Handles login flow | types |',
      '<!-- prospec:auto-end -->',
      '',
      '<!-- prospec:user-start -->',
      '<!-- prospec:user-end -->',
      '',
    ].join('\n');
    // module-map has auth but LACKS the curated aliases/rationale that live in index.md
    const moduleMapMissing = [
      'modules:',
      '  - name: auth',
      '    description: Auth module',
      '    paths:',
      '      - src/auth',
      '    keywords:',
      '      - login',
      '      - jwt',
      '    relationships:',
      '      depends_on:',
      '        - types',
      '',
    ].join('\n');
    // The mocked resolveBasePaths points knowledge paths at /test/prospec (ignores cwd),
    // so the curated index + module-map fixtures must live there.
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\n',
      '/test/prospec/index.md': indexWithCurated,
      '/test/prospec/ai-knowledge/module-map.yaml': moduleMapMissing,
      '/project/delta-spec.md': '## ADDED\n\n### REQ-AUTH-001: x\n\n**Description:** y\n\n---\n',
    });

    await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });

    // (a) the backfill persisted the missing curated columns into module-map
    const mapAfter = vol.readFileSync('/test/prospec/ai-knowledge/module-map.yaml', 'utf-8') as string;
    expect(mapAfter).toContain('認證');
    expect(mapAfter).toContain('登入');
    expect(mapAfter).toContain('Handles login flow');

    // (b) the regenerated index preserved them — proves backfill ran BEFORE
    // collectAllModules (else the rebuilt row would blank aliases/rationale to —)
    const indexAfter = vol.readFileSync('/test/prospec/index.md', 'utf-8') as string;
    expect(indexAfter).toContain('認證, 登入');
    expect(indexAfter).toContain('Handles login flow');

    // (c) idempotent — a 2nd run leaves module-map byte-stable (no re-write)
    await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });
    const mapAfter2 = vol.readFileSync('/test/prospec/ai-knowledge/module-map.yaml', 'utf-8') as string;
    expect(mapAfter2).toBe(mapAfter);
  });

  it('surfaces malformed REQ ids through execute().warnings on the live path (not silently dropped)', async () => {
    const deltaContent = `## ADDED

### REQ-AUTH-001: canonical add

**Description:** New auth

---

### REQ-AUTH-10: malformed two-digit id

**Description:** non-canonical

---

### REQ-AUTH-0002: malformed four-digit id

\`\`\`markdown
### REQ-FENCED-001: an example heading, not an entry
\`\`\`

---
`;
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\n',
      '/project/prospec/index.md': '# AI Knowledge Index\n\n<!-- prospec:auto-start -->\n## Modules\n<!-- prospec:auto-end -->\n\n<!-- prospec:user-start -->\n<!-- prospec:user-end -->\n',
      '/project/delta-spec.md': deltaContent,
    });

    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });

    // the canonical id is processed; the malformed ids are reported via the result
    // (the field a caller surfaces), not dropped at parse
    expect(result.created).toContain('auth');
    expect(result.created).not.toContain('fenced');
    expect(result.warnings).toContain(
      'Skipped 2 non-canonical REQ id(s) (expected REQ-MODULE-NNN with a 3-digit sequence): REQ-AUTH-10, REQ-AUTH-0002',
    );
  });

  it('should process manual mode', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\ntech_stack:\n  language: typescript\n',
      '/project/prospec/index.md': '# AI Knowledge Index\n\n<!-- prospec:auto-start -->\n## Modules\n<!-- prospec:auto-end -->\n\n<!-- prospec:user-start -->\n<!-- prospec:user-end -->\n',
    });

    const result = await execute({
      manualModules: ['services'],
      cwd: '/project',
    });

    // No pre-existing services README -> manual mode creates it (the
    // distinguishing manual-mode outcome, not merely "some file was written")
    expect(result.created).toEqual(['services']);
    expect(result.updated).toEqual([]);
    expect(
      result.generatedFiles.some((f) => f.path.endsWith('modules/services/README.md')),
    ).toBe(true);
  });

  it('acknowledges a module that is both MODIFIED and REMOVED once, as README-pending, never deprecated', async () => {
    const deltaContent = `## MODIFIED

### REQ-AUTH-001: Tweak auth

**Description:** change

---

## REMOVED

### REQ-AUTH-002: Drop auth

**Description:** gone

---
`;
    vol.fromJSON({
      // resolveBasePaths is mocked to knowledgePath '/test/prospec/ai-knowledge'
      '/test/prospec/ai-knowledge/modules/auth/README.md': '# auth\n',
      '/project/delta-spec.md': deltaContent,
    });

    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });

    // a REMOVED REQ removes behavior from the README, not the module
    expect(result.updated).toEqual(['auth']);
    expect(result.readmePending).toEqual(['auth']);
    expect(result.deprecated).toEqual([]);
    expect(vol.readFileSync('/test/prospec/ai-knowledge/modules/auth/README.md', 'utf-8')).toBe('# auth\n');
  });

  it('keeps an ADDED module that is also REMOVED README-pending, and reports an existing README as readme-pending (never rewritten)', async () => {
    const { scanDir } = await import('../../../src/lib/scanner.js');
    const deltaContent = `## ADDED

### REQ-AUTH-001: re-add auth

**Description:** auth

---

### REQ-BILLING-001: add billing

**Description:** billing

---

## REMOVED

### REQ-AUTH-002: drop auth

**Description:** gone
`;
    vol.fromJSON({
      // module-map drives buildModulePathMap (L500): auth has a non-default path
      '/test/prospec/ai-knowledge/module-map.yaml':
        'modules:\n  - name: billing\n    description: billing svc\n    paths: ["pkg/billing/**"]\n    keywords: ["billing"]\n',
      // existing billing README -> ADDED billing reported as `updated` (L421 else)
      '/test/prospec/ai-knowledge/modules/billing/README.md':
        '# billing\n\n<!-- prospec:auto-start -->\nold\n<!-- prospec:auto-end -->\n\n<!-- prospec:user-start -->\nkeep me\n<!-- prospec:user-end -->\n',
      // auth README exists, so both its ADDED and REMOVED REQs are README work
      '/test/prospec/ai-knowledge/modules/auth/README.md': '# auth\n',
      '/project/delta-spec.md': deltaContent,
    });

    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });

    // auth is in both ADDED and REMOVED -> README-pending, never created or deprecated
    expect(result.created).not.toContain('auth');
    expect(result.readmePending).toContain('auth');
    expect(result.deprecated).toEqual([]);

    // billing README pre-existed -> readme-pending judgment work, not created,
    // and the file is never scanned or rewritten (create-only guard fires first)
    expect(result.readmePending).toContain('billing');
    expect(result.created).not.toContain('billing');
    const billingScan = vi
      .mocked(scanDir)
      .mock.calls.find((c) => Array.isArray(c[0]) && (c[0] as string[]).includes('pkg/billing/**'));
    expect(billingScan).toBeUndefined();
    expect(
      vol.readFileSync('/test/prospec/ai-knowledge/modules/billing/README.md', 'utf-8'),
    ).toContain('keep me');

    // auth has a README but no map entry: its ADDED REQ registers it (the gate
    // would otherwise report it unregistered); billing's curated entry survives.
    const mapAfter = vol.readFileSync('/test/prospec/ai-knowledge/module-map.yaml', 'utf-8') as string;
    expect(mapAfter).toContain('name: auth');
    expect(mapAfter).toContain('name: billing');
    expect(mapAfter).toContain('billing svc');
  });

  it('acknowledges a MODIFIED module as readme-pending without touching any README (issue #107)', async () => {
    const { scanDir } = await import('../../../src/lib/scanner.js');
    const deltaContent = `## MODIFIED

### REQ-PAYMENTS-001: tweak payments

**Description:** change
`;
    vol.fromJSON({
      '/test/prospec/ai-knowledge/module-map.yaml':
        'modules:\n  - name: payments\n    paths: ["src/payments/**"]\n    keywords: []\n',
      '/project/delta-spec.md': deltaContent,
    });

    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });

    // acknowledged for the index/module-map refresh…
    expect(result.updated).toEqual(['payments']);
    // …but README content is the skill's judgment work: nothing scanned,
    // nothing generated for the module.
    expect(result.readmePending).toEqual(['payments']);
    const scanCall = vi
      .mocked(scanDir)
      .mock.calls.find(
        (c) => Array.isArray(c[0]) && (c[0] as string[]).includes('src/payments/**'),
      );
    expect(scanCall).toBeUndefined();
    expect(vol.existsSync('/project/prospec/ai-knowledge/modules/payments/README.md')).toBe(false);
  });

  it('does not double-list a module that is both ADDED and MODIFIED (L432 created-includes short-circuit)', async () => {
    const deltaContent = `## ADDED

### REQ-NOTIFY-001: add notify

**Description:** add

---

## MODIFIED

### REQ-NOTIFY-002: tweak notify

**Description:** tweak
`;
    vol.fromJSON({
      '/project/delta-spec.md': deltaContent,
    });

    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });

    // ADDED created it; MODIFIED must NOT also push it to updated
    expect(result.created).toEqual(['notify']);
    expect(result.updated).not.toContain('notify');
  });

  it('does not double-list a module modified under two REQ ids (L432 updated-includes short-circuit)', async () => {
    const deltaContent = `## MODIFIED

### REQ-ORDERS-001: first tweak

**Description:** one

---

### REQ-ORDERS-002: second tweak

**Description:** two
`;
    vol.fromJSON({
      '/test/prospec/ai-knowledge/module-map.yaml':
        'modules:\n  - name: orders\n    paths: ["src/orders/**"]\n    keywords: []\n',
      '/project/delta-spec.md': deltaContent,
    });

    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });

    // listed exactly once despite two MODIFIED REQ ids
    expect(result.updated).toEqual(['orders']);
  });

  it('REMOVED flow end-to-end: the module stays registered and indexed, its README untouched and README-pending', async () => {
    vol.fromJSON({
      '/test/prospec/index.md':
        '# AI Knowledge Index\n\n<!-- prospec:auto-start -->\n## Modules\n<!-- prospec:auto-end -->\n\n<!-- prospec:user-start -->\n<!-- prospec:user-end -->\n',
      '/test/prospec/ai-knowledge/module-map.yaml':
        'modules:\n  - name: legacy\n    paths: ["src/legacy/**"]\n    keywords: ["legacy"]\n  - name: services\n    paths: ["src/services/**"]\n    keywords: ["services"]\n',
      '/test/prospec/ai-knowledge/modules/legacy/README.md': '# legacy\n\ncontent\n',
      '/project/delta-spec.md': '## REMOVED\n\n### REQ-LEGACY-001: remove legacy\n\n**Description:** gone\n',
    });

    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });

    // removing one REQ is not removing the module: the knowledge-sync gate keeps
    // checking it, so it must stay registered and its README becomes judgment work
    expect(result.deprecated).toEqual([]);
    expect(result.readmePending).toEqual(['legacy']);
    const mapAfter = vol.readFileSync('/test/prospec/ai-knowledge/module-map.yaml', 'utf-8') as string;
    expect(mapAfter).toContain('name: legacy');
    const indexAfter = vol.readFileSync('/test/prospec/index.md', 'utf-8') as string;
    expect(indexAfter).toContain('**legacy**');
    expect(indexAfter).toContain('**services**');
    const readme = vol.readFileSync('/test/prospec/ai-knowledge/modules/legacy/README.md', 'utf-8') as string;
    expect(readme).toBe('# legacy\n\ncontent\n');
  });

  it('skips a REMOVED REQ whose prefix names no module', async () => {
    const deltaContent = `## REMOVED

### REQ-GHOST-001: remove ghost

**Description:** never existed
`;
    vol.fromJSON({
      // no module README for ghost, and no module-map.yaml at all
      '/project/delta-spec.md': deltaContent,
    });

    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });

    // ghost is neither a module nor a feature prefix: skipped with a warning, nothing written
    expect(result.deprecated).toEqual([]);
    expect(result.readmePending).toEqual([]);
    expect(result.warnings.join(' ')).toContain('REQ-GHOST-001');
    expect(result.generatedFiles.some((f) => f.path.includes('ghost'))).toBe(false);
  });

  it('reports an existing module README as updated in manual mode (L472 else, L473)', async () => {
    vol.fromJSON({
      '/test/prospec/ai-knowledge/modules/services/README.md':
        '# services\n\n<!-- prospec:auto-start -->\nold\n<!-- prospec:auto-end -->\n\n<!-- prospec:user-start -->\nkeep\n<!-- prospec:user-end -->\n',
    });

    const result = await execute({ manualModules: ['services'], cwd: '/project' });

    expect(result.updated).toContain('services');
    expect(result.created).not.toContain('services');
  });

  it('passes config.exclude through to the scanner, and defaults to [] when absent (L380)', async () => {
    const { readConfig } = await import('../../../src/lib/config.js');
    const { scanDir } = await import('../../../src/lib/scanner.js');

    // config WITHOUT an exclude key -> excludePatterns falls back to [] (L380 right)
    vi.mocked(readConfig).mockResolvedValueOnce({
      project: { name: 'test-project' },
    } as unknown as Awaited<ReturnType<typeof readConfig>>);

    vol.fromJSON({
      '/test/prospec/ai-knowledge/modules/services/README.md':
        '# services\n\n<!-- prospec:auto-start -->\nold\n<!-- prospec:auto-end -->\n\n<!-- prospec:user-start -->\nkeep\n<!-- prospec:user-end -->\n',
    });

    await execute({ manualModules: ['services'], cwd: '/project' });

    const scanCall = vi.mocked(scanDir).mock.calls.find((call) => call[0] !== '_*.md')!;
    expect((scanCall[1] as { exclude: string[] }).exclude).toEqual([]);
  });

  it('defaults cwd to process.cwd() when no cwd option is given (L374 right side)', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/project');
    try {
      const deltaContent = `## ADDED

### REQ-AUTH-001: add auth

**Description:** auth
`;
      vol.fromJSON({
        '/project/delta-spec.md': deltaContent,
      });

      const result = await execute({ deltaSpecPath: '/project/delta-spec.md' });

      expect(cwdSpy).toHaveBeenCalled();
      expect(result.created).toContain('auth');
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it('should return empty result when no input provided', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\ntech_stack:\n  language: typescript\n',
      '/project/prospec/index.md': '# AI Knowledge Index\n\n<!-- prospec:auto-start -->\n## Modules\n<!-- prospec:auto-end -->\n\n<!-- prospec:user-start -->\n<!-- prospec:user-end -->\n',
    });

    const result = await execute({ cwd: '/project' });

    expect(result.created).toEqual([]);
    expect(result.updated).toEqual([]);
    expect(result.deprecated).toEqual([]);
  });

  it('resolves a feature-prefixed REQ to feature-map ∪ related_modules, never minting modules/<prefix>/ (REQ-SERVICES-033)', async () => {
    const deltaContent = '## MODIFIED\n\n### REQ-MCP-002: tweak mcp resources\n\n**Description:** change\n';
    vol.fromJSON({
      '/test/prospec/ai-knowledge/module-map.yaml':
        'modules:\n  - name: lib\n    paths: ["src/lib/**"]\n    keywords: []\n  - name: types\n    paths: ["src/types/**"]\n    keywords: []\n  - name: services\n    paths: ["src/services/**"]\n    keywords: []\n',
      '/test/prospec/ai-knowledge/feature-map.yaml':
        'features:\n  - feature: mcp-server\n    modules: [lib, types]\n    req_prefixes: [MCP]\n    status: active\n',
      '/project/delta-spec.md': deltaContent,
    });

    const result = await execute({
      deltaSpecPath: '/project/delta-spec.md',
      cwd: '/project',
      relatedModules: ['services', 'types'],
    });

    // feature.modules [lib, types] ∪ related [services, types] ∩ known = {lib, types, services}
    expect(result.updated.sort()).toEqual(['lib', 'services', 'types']);
    // the feature prefix itself is never treated as a module
    expect(result.created).not.toContain('mcp');
    expect(result.updated).not.toContain('mcp');
    expect(result.generatedFiles.every((f) => !f.path.includes('modules/mcp/'))).toBe(true);
  });

  it('skips a feature-prefixed REQ that resolves to no known module — warns, mints nothing (REQ-SERVICES-032)', async () => {
    const deltaContent = '## MODIFIED\n\n### REQ-MCP-002: tweak\n\n**Description:** change\n';
    vol.fromJSON({
      '/test/prospec/ai-knowledge/module-map.yaml':
        'modules:\n  - name: lib\n    paths: ["src/lib/**"]\n    keywords: []\n',
      // MCP is a feature prefix with no modules, and no related_modules is passed
      '/test/prospec/ai-knowledge/feature-map.yaml':
        'features:\n  - feature: mcp-server\n    modules: []\n    req_prefixes: [MCP]\n    status: active\n',
      '/project/delta-spec.md': deltaContent,
    });

    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });

    expect(result.created).toEqual([]);
    expect(result.updated).toEqual([]);
    expect(result.warnings.join(' ')).toContain('REQ-MCP-002');
    expect(result.warnings.join(' ')).toContain('feature prefix');
    expect(result.generatedFiles.every((f) => !f.path.includes('modules/mcp/'))).toBe(true);
  });

  it('skips a MODIFIED REQ whose prefix is neither a known module nor a feature prefix, with a warning', async () => {
    const deltaContent = '## MODIFIED\n\n### REQ-PAYMENTS-001: tweak payments\n\n**Description:** change\n';
    vol.fromJSON({
      // feature-map exists but does NOT declare PAYMENTS as a req_prefix
      '/test/prospec/ai-knowledge/feature-map.yaml':
        'features:\n  - feature: mcp-server\n    modules: [lib]\n    req_prefixes: [MCP]\n    status: active\n',
      '/project/delta-spec.md': deltaContent,
    });

    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });

    // PAYMENTS is neither a module nor a feature prefix, and a MODIFIED REQ cannot name a new module
    expect(result.updated).toEqual([]);
    expect(result.readmePending).toEqual([]);
    expect(result.warnings.join(' ')).toContain('REQ-PAYMENTS-001');
    expect(result.warnings.join(' ')).toContain('neither a known module nor a feature prefix');
  });

  // #310 R3-1: an empty known set used to report every module REQ as "not a module";
  // the refusal names the map instead and runs before any classification or write.
  describe('an unreadable module map (REQ-SERVICES-032)', () => {
    const KP = '/test/prospec/ai-knowledge';
    const DELTA = '## ADDED\n\n### REQ-AUTH-001: add\n\n## MODIFIED\n\n### REQ-LIB-001: tweak\n';

    it.each([
      ['cannot be parsed', 'modules: [\n  - : :\n'],
      ['fails its schema', 'modules:\n  - name: lib\n    paths: [src/lib]\n'],
    ])('refuses with one error naming module-map.yaml when the map %s, writing nothing', async (_label, map) => {
      vol.fromJSON({
        [`${KP}/module-map.yaml`]: map,
        [`${KP}/modules/lib/README.md`]: '# lib\n',
        '/project/delta-spec.md': DELTA,
      });
      const before = vol.toJSON();
      const error = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PrerequisiteError);
      expect((error as PrerequisiteError).message).toContain('module-map.yaml cannot be read, parsed or validated');
      expect((error as PrerequisiteError).message).not.toContain('neither a known module');
      expect((error as PrerequisiteError).suggestion).toContain('repair module-map.yaml');
      expect(vol.toJSON()).toEqual(before);
    });

    it('names a map outside the knowledge root by that cause, writing nothing', async () => {
      vol.fromJSON({
        '/outside/module-map.yaml': 'modules:\n  - name: lib\n    paths: [src/lib]\n    keywords: [lib]\n',
        [`${KP}/modules/lib/README.md`]: '# lib\n',
        '/project/delta-spec.md': DELTA,
      });
      vol.symlinkSync('/outside/module-map.yaml', `${KP}/module-map.yaml`);
      const before = vol.toJSON();
      const error = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PrerequisiteError);
      expect((error as PrerequisiteError).message).toContain('resolves outside the knowledge root');
      expect((error as PrerequisiteError).message).not.toContain('cannot be read');
      expect(vol.toJSON()).toEqual(before);
    });

    it('keeps the delta-spec output unchanged when the map is readable', async () => {
      vol.fromJSON({
        [`${KP}/module-map.yaml`]: 'modules:\n  - name: lib\n    paths: [src/lib]\n    keywords: [lib]\n',
        [`${KP}/modules/lib/README.md`]: '# lib\n',
        '/project/delta-spec.md': '## MODIFIED\n\n### REQ-LIB-001: tweak\n',
      });
      const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });
      expect(result.readmePending).toEqual(['lib']);
      expect(result.warnings.join(' ')).not.toContain('module-map.yaml');
    });
  });

  it('names the related-modules correction command when a feature prefix resolves to no known module', async () => {
    vol.fromJSON({
      '/test/prospec/ai-knowledge/feature-map.yaml':
        'features:\n  - feature: mcp-server\n    modules: [ghost]\n    req_prefixes: [MCP]\n    status: active\n',
      '/project/delta-spec.md': '## MODIFIED\n\n### REQ-MCP-002: tweak\n',
    });
    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });
    expect(result.warnings.join(' ')).toContain('prospec change related-modules');
  });
});

// --- executeForChange (`prospec knowledge update`) ---

describe('executeForChange', () => {
  it('drives the update from the named change delta-spec + related_modules', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/my-change/delta-spec.md': `## MODIFIED

### REQ-PAYMENTS-001: tweak payments

**Description:** change
`,
      '/project/.prospec/changes/my-change/metadata.yaml': `name: my-change
created_at: 2026-07-30T00:00:00.000Z
status: implemented
related_modules:
  - payments
`,
      '/test/prospec/ai-knowledge/module-map.yaml':
        'modules:\n  - name: payments\n    paths: ["src/payments/**"]\n    keywords: []\n',
    });

    const { executeForChange } = await import('../../../src/services/knowledge-update.service.js');
    const result = await executeForChange({ change: 'my-change', cwd: '/project' });
    expect(result.changeName).toBe('my-change');
    expect(result.readmePending).toEqual(['payments']);
  });

  it('refuses a change with no delta-spec, pointing at --module (quick contract)', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/quick-change/metadata.yaml': `name: quick-change
created_at: 2026-07-30T00:00:00.000Z
status: implemented
scale: quick
`,
    });
    const { executeForChange } = await import('../../../src/services/knowledge-update.service.js');
    await expect(
      executeForChange({ change: 'quick-change', cwd: '/project' }),
    ).rejects.toThrow(/delta-spec\.md not found/);
  });

  it('bypasses change resolution entirely in --module manual mode', async () => {
    vol.fromJSON({ '/project/src/newmod/index.ts': 'export {}\n' });
    const { executeForChange } = await import('../../../src/services/knowledge-update.service.js');
    const result = await executeForChange({ modules: ['newmod'], cwd: '/project' });
    expect(result.changeName).toBeUndefined();
    expect(result.created).toEqual(['newmod']);
  });

  it('refuses a traversal --module name before anything is written', async () => {
    vol.fromJSON({ '/project/src/ok/index.ts': 'export {}\n' });
    const { executeForChange } = await import('../../../src/services/knowledge-update.service.js');
    let caught: unknown;
    try {
      await executeForChange({ modules: ['ok', '../../../../evil'], cwd: '/project' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PrerequisiteError);
    expect((caught as PrerequisiteError).message).toContain('../../../../evil');
    // no directory or README escaped the knowledge base — and the safe sibling
    // was not partially processed either (refusal precedes every write)
    const written = Object.keys(vol.toJSON());
    expect(written.some((p) => p.includes('evil'))).toBe(false);
    expect(written.some((p) => p.endsWith('README.md'))).toBe(false);
  });
});

// --- shared classifier (REQ-SERVICES-032 / REQ-TESTS-128) ---

describe('knowledge update and the knowledge-sync gate share one classifier', () => {
  const MODULE_MAP =
    'modules:\n  - name: lib\n    paths: ["src/lib/**"]\n    keywords: []\n  - name: services\n    paths: ["src/services/**"]\n    keywords: []\n  - name: types\n    paths: ["src/types/**"]\n    keywords: []\n  - name: cli\n    paths: ["src/cli/**"]\n    keywords: []\n';
  const FEATURE_MAP =
    'features:\n  - feature: mcp-server\n    modules: [lib, types]\n    req_prefixes: [MCP]\n    status: active\n  - feature: user-profile\n    modules: [services]\n    req_prefixes: []\n    status: active\n';

  it('acknowledges exactly the modules the classifier resolves for every entry', async () => {
    const deltaContent =
      '## ADDED\n\n### REQ-AUTH-001: new module\n\n### REQ-LIB-001: add to lib\n\n' +
      '## MODIFIED\n\n### REQ-MCP-001: feature prefix\n\n### REQ-SPEC-001: unknown prefix\n\n' +
      '## REMOVED\n\n### REQ-CLI-001: drop a cli behavior\n';
    vol.fromJSON({
      '/test/prospec/ai-knowledge/module-map.yaml': MODULE_MAP,
      '/test/prospec/ai-knowledge/feature-map.yaml': FEATURE_MAP,
      '/project/src/auth/index.ts': 'export {}\n',
      '/project/delta-spec.md': deltaContent,
    });
    const expected = new Set(
      classifyDeltaSpec(deltaContent, loadDeltaModuleContext('/test/prospec/ai-knowledge', ['services'], false))
        .flatMap((e) => e.modules),
    );

    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project', relatedModules: ['services'] });

    const acknowledged = new Set([...result.created, ...result.updated, ...result.readmePending]);
    expect([...acknowledged].sort()).toEqual([...expected].sort());
    expect([...acknowledged].sort()).toEqual(['auth', 'cli', 'lib', 'services', 'types']);
    expect(result.deprecated).toEqual([]);
  });

  it('resolves a proven backfill slug through its Feature header and mints no module', async () => {
    vol.fromJSON({
      '/test/prospec/ai-knowledge/module-map.yaml': MODULE_MAP,
      '/test/prospec/ai-knowledge/feature-map.yaml': FEATURE_MAP,
      '/project/.prospec/changes/bf/delta-spec.md':
        '## ADDED\n\n### REQ-USER-PROFILE-001: profile\n\n**Feature:** user-profile\n',
      '/project/.prospec/changes/bf/backfill-draft.md': '# draft\n',
      '/test/prospec/ai-knowledge/modules/lib/README.md': '# lib\n',
      '/test/prospec/ai-knowledge/modules/services/README.md': '# services\n',
      '/project/.prospec/changes/bf/metadata.yaml':
        'name: bf\ncreated_at: 2026-07-30T00:00:00.000Z\nstatus: implemented\nscale: backfill\nrelated_modules:\n  - lib\n',
    });
    const { executeForChange } = await import('../../../src/services/knowledge-update.service.js');
    const result = await executeForChange({ change: 'bf', cwd: '/project' });
    expect(result.created).toEqual([]);
    expect([...result.readmePending].sort()).toEqual(['lib', 'services']);
    expect(Object.keys(vol.toJSON()).some((p) => p.includes('modules/user-profile/'))).toBe(false);
  });

  it('treats a modules/ directory the module map does not register as no module until an ADDED REQ registers it', async () => {
    vol.fromJSON({
      '/test/prospec/ai-knowledge/module-map.yaml': MODULE_MAP,
      '/test/prospec/ai-knowledge/modules/legacy/README.md': '# legacy\n',
      '/project/delta-spec.md': '## MODIFIED\n\n### REQ-LEGACY-001: tweak\n',
    });
    const modified = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });
    expect(modified.readmePending).toEqual([]);
    expect(modified.warnings.join(' ')).toContain('REQ-LEGACY-001');

    vol.fromJSON({ '/project/delta-spec.md': '## ADDED\n\n### REQ-LEGACY-002: back\n' });
    const added = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });
    expect(added.readmePending).toEqual(['legacy']);
    expect(vol.readFileSync('/test/prospec/ai-knowledge/module-map.yaml', 'utf-8')).toContain('name: legacy');
  });

  it('warns when a proven backfill slug resolves to no known module', async () => {
    vol.fromJSON({
      '/test/prospec/ai-knowledge/module-map.yaml': MODULE_MAP,
      '/project/delta-spec.md': '## ADDED\n\n### REQ-NEW-FEATURE-001: x\n\n**Feature:** new-feature\n',
    });
    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project', backfill: true });
    expect(result.created).toEqual([]);
    expect(result.warnings.join(' ')).toContain('REQ-NEW-FEATURE-001: "new-feature" is a backfill feature slug with no known module');
    // REQ-CLI-060: the remedy is the correction command, not a hand edit of metadata.yaml
    expect(result.warnings.join(' ')).toContain('prospec change related-modules');
    expect(result.warnings.join(' ')).not.toContain('set metadata.related_modules');
  });

  it('ignores a REQ heading inside a fenced example', async () => {
    vol.fromJSON({
      '/test/prospec/ai-knowledge/module-map.yaml': MODULE_MAP,
      '/project/delta-spec.md': '## MODIFIED\n\n### REQ-LIB-001: lib\n\n```markdown\n### REQ-AUTH-001: example\n```\n',
    });
    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });
    expect(result.updated).toEqual(['lib']);
    expect(result.created).toEqual([]);
  });
});
