import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  parseDeltaSpec,
  updateModuleReadme,
  markModuleDeprecated,
  updateModuleMap,
  updateIndex,
  collectAllModules,
  execute,
} from '../../../src/services/knowledge-update.service.js';
import {
  INDEX_TABLE_HEADER,
  INDEX_TABLE_SEPARATOR,
  INDEX_TABLE_COLUMNS,
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
}));

vi.mock('../../../src/lib/scanner.js', () => ({
  scanDir: vi.fn().mockResolvedValue({
    files: ['src/services/foo.service.ts', 'src/services/bar.ts'],
    count: 2,
  }),
  filterConventions: vi.fn().mockReturnValue({ core: [], demand: [] }),
}));

// README renders stay canned, but the knowledge index templates render for REAL
// (via a Handlebars instance fed from the actual template files, read with the
// unmocked fs) — updateIndex's whole contract is "never drift from the template",
// so a canned index string would test nothing.
vi.mock('../../../src/lib/template.js', async () => {
  const realFs = await vi.importActual<typeof import('node:fs')>('node:fs');
  const realPath = await vi.importActual<typeof import('node:path')>('node:path');
  const { default: Handlebars } = await vi.importActual<typeof import('handlebars')>('handlebars');
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

// --- parseDeltaSpec ---

describe('parseDeltaSpec', () => {
  it('should parse ADDED/MODIFIED/REMOVED sections', () => {
    const content = `# Delta Spec

## ADDED

### REQ-AUTH-001: Add authentication module

**Description:** New auth system

---

### REQ-AUTH-002: Add token management

**Description:** Token refresh

---

## MODIFIED

### REQ-SERVICES-010: Update service layer

**Before:** Old behavior
**After:** New behavior

---

## REMOVED

### REQ-LEGACY-001: Remove deprecated API

**Reason:** No longer needed

---
`;

    const result = parseDeltaSpec(content);
    expect(result.added).toHaveLength(2);
    expect(result.added[0]!.id).toBe('REQ-AUTH-001');
    expect(result.added[0]!.module).toBe('auth');
    expect(result.added[0]!.description).toBe('Add authentication module');
    expect(result.added[1]!.id).toBe('REQ-AUTH-002');

    expect(result.modified).toHaveLength(1);
    expect(result.modified[0]!.id).toBe('REQ-SERVICES-010');
    expect(result.modified[0]!.module).toBe('services');

    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]!.id).toBe('REQ-LEGACY-001');
    expect(result.removed[0]!.module).toBe('legacy');
  });

  it('should return empty result for empty content', () => {
    const result = parseDeltaSpec('');
    expect(result.added).toEqual([]);
    expect(result.modified).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('should return empty result for malformed content', () => {
    const result = parseDeltaSpec('just some random text\nno headers\n');
    expect(result.added).toEqual([]);
    expect(result.modified).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('should handle multi-word module names in REQ IDs', () => {
    const content = `## ADDED

### REQ-API-MIDDLEWARE-001: Add rate limiting

**Description:** Rate limiter
`;

    const result = parseDeltaSpec(content);
    expect(result.added).toHaveLength(1);
    expect(result.added[0]!.module).toBe('api-middleware');
  });

  it('surfaces non-canonical REQ ids as malformed rather than silently dropping them (C1)', () => {
    const content = `## ADDED

### REQ-TYPES-010: canonical three-digit

### REQ-TYPES-10: only two digits

### REQ-SVC-0001: four digits
`;

    const result = parseDeltaSpec(content);
    // only the spec-conformant 3-digit id is parsed as a real requirement
    expect(result.added.map((e) => e.id)).toEqual(['REQ-TYPES-010']);
    // the non-conforming ids are reported, not invisibly skipped
    expect(result.malformed).toContain('REQ-TYPES-10');
    expect(result.malformed).toContain('REQ-SVC-0001');
  });
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

    expect(result.action).toBe('created');
    expect(result.path).toBe('prospec/ai-knowledge/modules/auth/README.md');

    const content = vol.readFileSync('/project/prospec/ai-knowledge/modules/auth/README.md', 'utf-8');
    expect(content).toContain('prospec:auto-start');
  });

  it('should update existing module README.md preserving user sections', async () => {
    const existingContent =
      '# Auth\n\n<!-- prospec:auto-start -->\nOld auto content\n<!-- prospec:auto-end -->\n\n<!-- prospec:user-start -->\nMy custom notes\n<!-- prospec:user-end -->\n';

    vol.fromJSON({
      '/project/prospec/ai-knowledge/modules/auth/README.md': existingContent,
    });

    const result = await updateModuleReadme('auth', ['src/auth/**'], {
      cwd: '/project',
      knowledgeBasePath: 'prospec/ai-knowledge',
    });

    expect(result.action).toBe('updated');

    const content = vol.readFileSync('/project/prospec/ai-knowledge/modules/auth/README.md', 'utf-8') as string;
    expect(content).toContain('My custom notes');
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

    // Batch 2: extension-table branches
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
    await updateModuleReadme('mod', ['src/mod/**'], {
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
      { cwd: '/test', baseDir: 'prospec', knowledgeBasePath: 'prospec/ai-knowledge', projectName: 'p' },
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

    const row = content.split('\n').find((l) => l.startsWith('| auth '));
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
      { cwd: '/test', baseDir: 'prospec', knowledgeBasePath: 'prospec/ai-knowledge', projectName: 'p' },
    );

    const content = vol.readFileSync('/test/prospec/index.md', 'utf-8') as string;
    expect(result.action).toBe('updated');
    // the new row is present
    expect(content).toContain('| auth ');
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
      { cwd: '/test', baseDir: 'prospec', knowledgeBasePath: 'prospec/ai-knowledge', projectName: 'p' },
    ).then(() => {
      const content = vol.readFileSync('/test/prospec/index.md', 'utf-8') as string;
      // the literal $1 / $& must survive, and the auto block must not self-nest
      expect(content).toContain('cost is $1 per $& token');
      expect(content.match(/prospec:auto-start/g)?.length).toBe(1);
    });
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

  it('should return null when module-map.yaml does not exist', async () => {
    vol.fromJSON({});
    vol.mkdirSync('/project', { recursive: true });

    const result = await updateModuleMap(
      { added: ['auth'], removed: [] },
      '/project/nonexistent.yaml',
    );

    expect(result).toBeNull();
  });

  it('does not duplicate an already-present module (case-insensitive) on add (L336 else)', async () => {
    vol.fromJSON({
      '/project/module-map.yaml':
        'modules:\n  - name: Services\n    paths: ["src/services/**"]\n    keywords: ["services"]\n',
    });

    const result = await updateModuleMap(
      { added: ['services'], removed: [] },
      '/project/module-map.yaml',
    );

    expect(result).not.toBeNull();
    const content = vol.readFileSync('/project/module-map.yaml', 'utf-8') as string;
    // only the original entry survives; no second `services` entry is appended
    const nameLines = content.split('\n').filter((l) => /name:\s*Services/i.test(l));
    expect(nameLines).toHaveLength(1);
  });
});

// --- collectAllModules ---

describe('collectAllModules', () => {
  it('marks a deprecated module even when module-map name is mixed-case', () => {
    vol.fromJSON({
      '/project/module-map.yaml':
        'modules:\n  - name: API\n    paths: ["src/api/**"]\n    keywords: ["api"]\n',
    });

    // result.deprecated holds the lowercased delta-spec name
    const modules = collectAllModules(
      { created: [], updated: [], deprecated: ['api'], generatedFiles: [] },
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
      { created: [], updated: [], deprecated: [], generatedFiles: [] },
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
        generatedFiles: [],
      },
      '/nonexistent/module-map.yaml',
    );

    expect(modules).toContainEqual({
      name: 'newmod',
      description: 'newmod module',
      status: 'Active',
    });
    expect(modules).toContainEqual({
      name: 'changedmod',
      description: 'changedmod module',
      status: 'Active',
    });
    expect(modules).toContainEqual({
      name: 'goneMod',
      description: 'goneMod module',
      status: 'Deprecated',
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

  it('surfaces malformed REQ ids through execute().warnings on the live path (not silently dropped)', async () => {
    const deltaContent = `## ADDED

### REQ-AUTH-001: canonical add

**Description:** New auth

---

### REQ-AUTH-10: malformed two-digit id

**Description:** non-canonical

---
`;
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\n',
      '/project/prospec/index.md': '# AI Knowledge Index\n\n<!-- prospec:auto-start -->\n## Modules\n<!-- prospec:auto-end -->\n\n<!-- prospec:user-start -->\n<!-- prospec:user-end -->\n',
      '/project/delta-spec.md': deltaContent,
    });

    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });

    // the canonical id is processed; the malformed id is reported via the result
    // (the field a caller surfaces), not dropped at parse
    expect(result.created).toContain('auth');
    expect(result.warnings.join(' ')).toContain('REQ-AUTH-10');
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

  it('treats a module that is both MODIFIED and REMOVED as removed only', async () => {
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
      // resolveBasePaths is mocked to knowledgePath '/test/prospec/ai-knowledge',
      // so the module README must live there for markModuleDeprecated to find it.
      '/test/prospec/ai-knowledge/modules/auth/README.md': '# auth\n',
      '/project/delta-spec.md': deltaContent,
    });

    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });

    expect(result.deprecated).toContain('auth');
    // removal wins — must NOT also be reported as updated
    expect(result.updated).not.toContain('auth');
  });

  it('skips an ADDED module that is also REMOVED, reuses module-map paths, and reports an existing README as updated (L415/L421/L500/L458)', async () => {
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
      // auth README exists so it can be deprecated by the REMOVED loop
      '/test/prospec/ai-knowledge/modules/auth/README.md': '# auth\n',
      '/project/delta-spec.md': deltaContent,
    });

    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });

    // auth is in both ADDED and REMOVED -> removal wins, never created/updated
    expect(result.created).not.toContain('auth');
    expect(result.updated).not.toContain('auth');
    expect(result.deprecated).toContain('auth');

    // billing README pre-existed -> reported as updated, not created
    expect(result.updated).toContain('billing');
    expect(result.created).not.toContain('billing');

    // billing used its module-map path glob (L500 populated the map)
    const scanCall = vi
      .mocked(scanDir)
      .mock.calls.find((c) => Array.isArray(c[0]) && (c[0] as string[]).includes('pkg/billing/**'));
    expect(scanCall).toBeDefined();

    // module-map.yaml existed -> updateModuleMap returned a file that was pushed (L458/L459)
    const mapFile = result.generatedFiles.find((f) => f.path.endsWith('module-map.yaml'));
    expect(mapFile).toBeDefined();
    expect(mapFile!.action).toBe('updated');
  });

  it('processes a fresh MODIFIED module via the src/<name>/** fallback when not in module-map (L428/L429-else/L432-then)', async () => {
    const { scanDir } = await import('../../../src/lib/scanner.js');
    const deltaContent = `## MODIFIED

### REQ-PAYMENTS-001: tweak payments

**Description:** change
`;
    vol.fromJSON({
      '/project/delta-spec.md': deltaContent,
    });

    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });

    // first time seen -> pushed to updated (L432 both conditions true)
    expect(result.updated).toEqual(['payments']);

    // no module-map entry -> fallback glob src/payments/** (L429 right side)
    const scanCall = vi
      .mocked(scanDir)
      .mock.calls.find(
        (c) => Array.isArray(c[0]) && (c[0] as string[]).includes('src/payments/**'),
      );
    expect(scanCall).toBeDefined();
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
      '/project/delta-spec.md': deltaContent,
    });

    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });

    // listed exactly once despite two MODIFIED REQ ids
    expect(result.updated).toEqual(['orders']);
  });

  it('skips deprecation reporting when the REMOVED module README is absent (L444 else, L453 else)', async () => {
    const deltaContent = `## REMOVED

### REQ-GHOST-001: remove ghost

**Description:** never existed
`;
    vol.fromJSON({
      // no module README for ghost, and no module-map.yaml at all
      '/project/delta-spec.md': deltaContent,
    });

    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });

    // markModuleDeprecated returned null -> not added to deprecated/generatedFiles
    expect(result.deprecated).toEqual([]);
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

  it('still treats a non-feature-prefix unknown module as a module name (legacy fallback preserved)', async () => {
    const deltaContent = '## MODIFIED\n\n### REQ-PAYMENTS-001: tweak payments\n\n**Description:** change\n';
    vol.fromJSON({
      // feature-map exists but does NOT declare PAYMENTS as a req_prefix
      '/test/prospec/ai-knowledge/feature-map.yaml':
        'features:\n  - feature: mcp-server\n    modules: [lib]\n    req_prefixes: [MCP]\n    status: active\n',
      '/project/delta-spec.md': deltaContent,
    });

    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });

    // PAYMENTS is not a feature prefix → treated as a module name (fallback), as before
    expect(result.updated).toEqual(['payments']);
  });
});
