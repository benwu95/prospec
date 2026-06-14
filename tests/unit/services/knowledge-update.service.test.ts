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
    knowledge: { base_path: 'docs/ai-knowledge' },
    exclude: [],
  }),
  resolveBasePaths: vi.fn().mockReturnValue({
    baseDir: '/test/docs',
    knowledgePath: '/test/docs/ai-knowledge',
    constitutionPath: '/test/docs/CONSTITUTION.md',
    specsPath: '/test/docs/specs',
  }),
}));

vi.mock('../../../src/lib/scanner.js', () => ({
  scanDir: vi.fn().mockResolvedValue({
    files: ['src/services/foo.service.ts', 'src/services/bar.ts'],
    count: 2,
  }),
}));

vi.mock('../../../src/lib/template.js', () => ({
  renderTemplate: vi.fn().mockReturnValue(
    '# Test Module\n\n<!-- prospec:auto-start -->\n## Key Files\n\n| File | Purpose |\n|------|--------|\n\n## Public API\n\n## Dependencies\n\n## Modification Guide\n\n## Ripple Effects\n\n## Pitfalls\n\n<!-- prospec:auto-end -->\n\n<!-- prospec:user-start -->\n<!-- prospec:user-end -->\n',
  ),
}));

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
});

// --- identifyAffectedModules ---

// --- updateModuleReadme ---

describe('updateModuleReadme', () => {
  it('should create new module README.md', async () => {
    vol.fromJSON({});
    vol.mkdirSync('/project/docs/ai-knowledge/modules', { recursive: true });

    const result = await updateModuleReadme('auth', ['src/auth/**'], {
      cwd: '/project',
      knowledgeBasePath: 'docs/ai-knowledge',
    });

    expect(result.action).toBe('created');
    expect(result.path).toBe('docs/ai-knowledge/modules/auth/README.md');

    const content = vol.readFileSync('/project/docs/ai-knowledge/modules/auth/README.md', 'utf-8');
    expect(content).toContain('prospec:auto-start');
  });

  it('should update existing module README.md preserving user sections', async () => {
    const existingContent =
      '# Auth\n\n<!-- prospec:auto-start -->\nOld auto content\n<!-- prospec:auto-end -->\n\n<!-- prospec:user-start -->\nMy custom notes\n<!-- prospec:user-end -->\n';

    vol.fromJSON({
      '/project/docs/ai-knowledge/modules/auth/README.md': existingContent,
    });

    const result = await updateModuleReadme('auth', ['src/auth/**'], {
      cwd: '/project',
      knowledgeBasePath: 'docs/ai-knowledge',
    });

    expect(result.action).toBe('updated');

    const content = vol.readFileSync('/project/docs/ai-knowledge/modules/auth/README.md', 'utf-8') as string;
    expect(content).toContain('My custom notes');
  });

  it('should call renderTemplate with key_exports in context', async () => {
    const { renderTemplate: mockRender } = await import('../../../src/lib/template.js');

    vol.fromJSON({});
    vol.mkdirSync('/project/docs/ai-knowledge/modules', { recursive: true });

    await updateModuleReadme('services', ['src/services/**'], {
      cwd: '/project',
      knowledgeBasePath: 'docs/ai-knowledge',
    });

    const calls = vi.mocked(mockRender).mock.calls;
    const readmeCall = calls.find((c) => c[0] === 'steering/module-readme.hbs');
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
    vol.mkdirSync('/project/docs/ai-knowledge/modules', { recursive: true });

    await updateModuleReadme('services', ['src/services/**'], {
      cwd: '/project',
      knowledgeBasePath: 'docs/ai-knowledge',
    });

    const calls = vi.mocked(mockRender).mock.calls;
    const readmeCall = calls.find((c) => c[0] === 'steering/module-readme.hbs');
    const context = readmeCall![1] as Record<string, unknown>;
    const keyExports = context.key_exports as Array<{ name: string }>;
    // .test.ts files should be filtered out
    const hasTestExport = keyExports.some((e) => e.name.includes('test'));
    expect(hasTestExport).toBe(false);
  });
});

// --- markModuleDeprecated ---

describe('markModuleDeprecated', () => {
  it('should add deprecated banner to existing README', async () => {
    vol.fromJSON({
      '/project/docs/ai-knowledge/modules/legacy/README.md': '# Legacy\n\nSome content\n',
    });

    const result = await markModuleDeprecated('legacy', 'No longer needed', {
      cwd: '/project',
      knowledgeBasePath: 'docs/ai-knowledge',
    });

    expect(result).not.toBeNull();
    expect(result!.action).toBe('deprecated');

    const content = vol.readFileSync('/project/docs/ai-knowledge/modules/legacy/README.md', 'utf-8') as string;
    expect(content).toContain('> **DEPRECATED**');
    expect(content).toContain('No longer needed');
  });

  it('should return null if module README does not exist', async () => {
    vol.fromJSON({});
    vol.mkdirSync('/project', { recursive: true });

    const result = await markModuleDeprecated('nonexistent', 'Gone', {
      cwd: '/project',
      knowledgeBasePath: 'docs/ai-knowledge',
    });

    expect(result).toBeNull();
  });

  it('should not add duplicate deprecation banners', async () => {
    vol.fromJSON({
      '/project/docs/ai-knowledge/modules/legacy/README.md':
        '> **DEPRECATED**: This module was removed. Reason: Already deprecated\n\n# Legacy\n',
    });

    const result = await markModuleDeprecated('legacy', 'Second time', {
      cwd: '/project',
      knowledgeBasePath: 'docs/ai-knowledge',
    });

    expect(result).not.toBeNull();
    const content = vol.readFileSync('/project/docs/ai-knowledge/modules/legacy/README.md', 'utf-8') as string;
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
      { cwd: '/test', knowledgeBasePath: 'docs/ai-knowledge', projectName: 'p' },
    );

    const content = vol.readFileSync('/test/docs/ai-knowledge/_index.md', 'utf-8') as string;
    expect(content).toContain(INDEX_TABLE_HEADER);
    expect(content).toContain(INDEX_TABLE_SEPARATOR);
    // the phantom "Files" column (and old README placeholder) must be gone
    expect(content).not.toContain('Files');
    expect(content).not.toContain('| README |');

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
      '/test/docs/ai-knowledge/_index.md': `# AI Knowledge Index

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
      { cwd: '/test', knowledgeBasePath: 'docs/ai-knowledge', projectName: 'p' },
    );

    const content = vol.readFileSync('/test/docs/ai-knowledge/_index.md', 'utf-8') as string;
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
      '/test/docs/ai-knowledge/_index.md': `# AI Knowledge Index

## Modules

<!-- prospec:auto-start -->
${INDEX_TABLE_HEADER}
${INDEX_TABLE_SEPARATOR}
<!-- prospec:auto-end -->
`,
    });

    return updateIndex(
      [{ name: 'billing', description: 'cost is $1 per $& token', status: 'Active' }],
      { cwd: '/test', knowledgeBasePath: 'docs/ai-knowledge', projectName: 'p' },
    ).then(() => {
      const content = vol.readFileSync('/test/docs/ai-knowledge/_index.md', 'utf-8') as string;
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
      '/project/docs/ai-knowledge/_index.md': '# AI Knowledge Index\n\n<!-- prospec:auto-start -->\n## Modules\n<!-- prospec:auto-end -->\n\n<!-- prospec:user-start -->\n<!-- prospec:user-end -->\n',
      '/project/delta-spec.md': deltaContent,
    });

    const result = await execute({
      deltaSpecPath: '/project/delta-spec.md',
      cwd: '/project',
    });

    expect(result.created).toContain('auth');
    expect(result.generatedFiles.length).toBeGreaterThan(0);
  });

  it('should process manual mode', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\ntech_stack:\n  language: typescript\n',
      '/project/docs/ai-knowledge/_index.md': '# AI Knowledge Index\n\n<!-- prospec:auto-start -->\n## Modules\n<!-- prospec:auto-end -->\n\n<!-- prospec:user-start -->\n<!-- prospec:user-end -->\n',
    });

    const result = await execute({
      manualModules: ['services'],
      cwd: '/project',
    });

    expect(result.generatedFiles.length).toBeGreaterThan(0);
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
      // resolveBasePaths is mocked to knowledgePath '/test/docs/ai-knowledge',
      // so the module README must live there for markModuleDeprecated to find it.
      '/test/docs/ai-knowledge/modules/auth/README.md': '# auth\n',
      '/project/delta-spec.md': deltaContent,
    });

    const result = await execute({ deltaSpecPath: '/project/delta-spec.md', cwd: '/project' });

    expect(result.deprecated).toContain('auth');
    // removal wins — must NOT also be reported as updated
    expect(result.updated).not.toContain('auth');
  });

  it('should return empty result when no input provided', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\ntech_stack:\n  language: typescript\n',
      '/project/docs/ai-knowledge/_index.md': '# AI Knowledge Index\n\n<!-- prospec:auto-start -->\n## Modules\n<!-- prospec:auto-end -->\n\n<!-- prospec:user-start -->\n<!-- prospec:user-end -->\n',
    });

    const result = await execute({ cwd: '/project' });

    expect(result.created).toEqual([]);
    expect(result.updated).toEqual([]);
    expect(result.deprecated).toEqual([]);
  });
});
