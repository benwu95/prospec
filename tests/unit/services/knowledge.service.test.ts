import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { execute } from '../../../src/services/knowledge.service.js';
import { ConfigNotFound, PrerequisiteError } from '../../../src/types/errors.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

vi.mock('../../../src/lib/template.js', () => ({
  renderTemplate: vi.fn().mockReturnValue('# Rendered Template Content\n'),
  registerPartial: vi.fn(),
  registerPartialFromFile: vi.fn(),
  registerHelper: vi.fn(),
}));

// Mock fast-glob to work with memfs
vi.mock('fast-glob', () => ({
  default: {
    glob: vi.fn().mockImplementation(async (_patterns: string | string[], options: { cwd?: string }) => {
      const cwd = options?.cwd ?? '/';
      try {
        const allFiles: string[] = [];
        const walkDir = (dir: string, prefix: string) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = `${dir}/${entry.name}`;
            const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
              walkDir(fullPath, relativePath);
            } else {
              allFiles.push(relativePath);
            }
          }
        };
        walkDir(cwd, '');
        return allFiles;
      } catch {
        return [];
      }
    }),
    globSync: vi.fn().mockReturnValue([]),
  },
}));

beforeEach(() => {
  vol.reset();
  // The renderTemplate mock's call history accumulates across tests; clearing
  // it per-test keeps each `calls.find(...)` scoped to the current execution so
  // path-specific assertions resolve against the right context. clearAllMocks
  // keeps factory-set return values / implementations intact.
  vi.clearAllMocks();
});

describe('knowledge.service', () => {
  it('should throw ConfigNotFound when .prospec.yaml is missing', async () => {
    vol.fromJSON({ '/project/src/index.ts': '' });
    await expect(execute({ cwd: '/project' })).rejects.toThrow(ConfigNotFound);
  });

  it('should throw PrerequisiteError when module-map.yaml is missing', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });
    await expect(execute({ cwd: '/project' })).rejects.toThrow(PrerequisiteError);
  });

  it('should generate module README files', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test
knowledge:
  base_path: prospec/ai-knowledge
`,
      '/project/prospec/ai-knowledge/module-map.yaml': `modules:
  - name: services
    description: Business logic services
    paths:
      - src/services/**
    keywords:
      - services
      - business
`,
      '/project/src/services/auth.ts': '',
    });

    const result = await execute({ cwd: '/project' });
    expect(result.moduleCount).toBe(1);
    expect(result.modules[0]?.name).toBe('services');
    expect(result.dryRun).toBe(false);
    expect(result.generatedFiles.length).toBeGreaterThan(0);
  });

  it('routes a bare directory module path through moduleScanPatterns before scanning (getModuleInfos)', async () => {
    const fg = (await import('fast-glob')).default;
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test
knowledge:
  base_path: prospec/ai-knowledge
`,
      // Bare directory entry (no /** suffix) — the case that scanned 0 files before.
      '/project/prospec/ai-knowledge/module-map.yaml': `modules:
  - name: services
    description: Business logic
    paths:
      - src/services
    keywords:
      - services
`,
      '/project/src/services/auth.ts': '',
    });

    await execute({ cwd: '/project' });

    const patternArgs = vi.mocked(fg.glob).mock.calls.map((c) => c[0]);
    // The bare 'src/services' entry must reach fast-glob expanded to 'src/services/**';
    // reverting getModuleInfos to raw entry.paths makes it scan bare 'src/services' (0 files).
    expect(patternArgs).toContainEqual(['src/services/**']);
    expect(patternArgs).not.toContainEqual(['src/services']);
  });

  it('should call renderTemplate with key_exports in context', async () => {
    const { renderTemplate: mockRender } = await import('../../../src/lib/template.js');

    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test
knowledge:
  base_path: prospec/ai-knowledge
`,
      '/project/prospec/ai-knowledge/module-map.yaml': `modules:
  - name: services
    description: Business logic services
    paths:
      - src/services/**
    keywords:
      - services
`,
      '/project/src/services/auth.service.ts': '',
      '/project/src/services/user.service.ts': '',
    });

    await execute({ cwd: '/project' });

    // renderTemplate is called for each module README and for index.md
    const calls = vi.mocked(mockRender).mock.calls;
    const readmeCall = calls.find((c) => c[0] === 'knowledge/module-readme.hbs');
    expect(readmeCall).toBeTruthy();

    // Template context should have key_exports (not public_api)
    const context = readmeCall![1] as Record<string, unknown>;
    expect(context).toHaveProperty('key_exports');
    expect(Array.isArray(context.key_exports)).toBe(true);
    // Should NOT have public_api
    expect(context).not.toHaveProperty('public_api');
  });

  it('should derive key_exports with name transforms and drop test files', async () => {
    const { renderTemplate: mockRender } = await import('../../../src/lib/template.js');

    // Total files seeded = 2 config + 3 source = 5, all inside deriveKeyExports'
    // slice(0, 10) window after scanDir's lexicographic sort, so every source
    // file's transform surfaces deterministically.
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test
knowledge:
  base_path: prospec/ai-knowledge
`,
      '/project/prospec/ai-knowledge/module-map.yaml': `modules:
  - name: lib
    description: Shared utilities
    paths:
      - src/lib/**
    keywords:
      - lib
`,
      '/project/src/lib/auth.service.ts': '', // .service -> .execute()
      '/project/src/lib/content-merger.ts': '', // kebab-case -> camelCase
      '/project/src/lib/widget.test.ts': '', // test file -> excluded
    });

    await execute({ cwd: '/project' });

    const calls = vi.mocked(mockRender).mock.calls;
    const readmeCall = calls.find((c) => c[0] === 'knowledge/module-readme.hbs');
    const context = readmeCall![1] as Record<string, unknown>;
    const keyExports = context.key_exports as Array<{ name: string; description: string }>;

    const names = keyExports.map((e) => e.name);

    // .service$ basename -> .execute() suffix
    expect(names).toContain('auth.execute()');
    // kebab-case basename -> camelCase
    expect(names).toContain('contentMerger');
    // test files are dropped entirely (neither the transformed nor raw name)
    expect(names).not.toContain('widget.test');
    expect(names).not.toContain('widget');

    // description carries the inferred per-file description, not a generic placeholder
    const authExport = keyExports.find((e) => e.name === 'auth.execute()');
    expect(authExport?.description).toBe('Service implementation');
    const mergerExport = keyExports.find((e) => e.name === 'contentMerger');
    expect(mergerExport?.description).toBe('TypeScript source');
  });

  it('should render index.md with knowledge/index.md.hbs template', async () => {
    const { renderTemplate: mockRender } = await import('../../../src/lib/template.js');

    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test
knowledge:
  base_path: prospec/ai-knowledge
`,
      '/project/prospec/ai-knowledge/module-map.yaml': `modules:
  - name: services
    description: Business logic
    paths:
      - src/services/**
    keywords:
      - services
`,
      '/project/src/services/auth.ts': '',
    });

    await execute({ cwd: '/project' });

    const calls = vi.mocked(mockRender).mock.calls;
    const indexCall = calls.find((c) => c[0] === 'knowledge/index.md.hbs');
    expect(indexCall).toBeTruthy();

    const context = indexCall![1] as Record<string, unknown>;
    // shared-builder shape: base_dir substituted, columns pre-joined — the
    // template consumes no modules array (the table is curated/updated in place)
    expect(context).toHaveProperty('project_name', 'test');
    expect(context).toHaveProperty('base_dir', 'prospec');
    expect(context).toHaveProperty('knowledge_base_path', 'prospec/ai-knowledge');
    expect(typeof context.index_table_columns).toBe('string');
    expect(context.index_table_columns).toContain(' | ');
    expect(context).not.toHaveProperty('modules');
  });

  it('should not write files in dry-run mode', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test
knowledge:
  base_path: prospec/ai-knowledge
`,
      '/project/prospec/ai-knowledge/module-map.yaml': `modules:
  - name: lib
    description: Library
    paths:
      - src/lib/**
    keywords:
      - lib
`,
      '/project/src/lib/config.ts': '',
    });

    const result = await execute({ dryRun: true, cwd: '/project' });
    expect(result.dryRun).toBe(true);
    expect(result.generatedFiles).toHaveLength(0);
  });

  // L49: options.cwd ?? process.cwd() — the process.cwd() fallback side
  it('should fall back to process.cwd() when cwd option is omitted', async () => {
    const root = process.cwd();
    vol.fromJSON(
      {
        '.prospec.yaml': `project:
  name: cwd-fallback
knowledge:
  base_path: prospec/ai-knowledge
`,
        'prospec/ai-knowledge/module-map.yaml': `modules:
  - name: services
    description: From process cwd
    paths:
      - src/services/**
    keywords:
      - services
`,
        'src/services/auth.ts': '',
      },
      root,
    );

    const result = await execute({});
    expect(result.moduleCount).toBe(1);
    expect(result.modules[0]?.name).toBe('services');
    expect(result.modules[0]?.description).toBe('From process cwd');
  });

  // L153: entry.paths.length > 0 ? entry.paths : [`${name}/**`] — empty-paths else side
  // L166: entry.description ?? `${name} module` — missing-description fallback side
  // L194: moduleInfo.paths[0] ?? moduleInfo.name — empty-paths fallback in template path
  it('should fall back to name-based glob and synthesized description when paths/description are absent', async () => {
    const { renderTemplate: mockRender } = await import('../../../src/lib/template.js');

    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test
knowledge:
  base_path: prospec/ai-knowledge
`,
      '/project/prospec/ai-knowledge/module-map.yaml': `modules:
  - name: core
    paths: []
    keywords:
      - core
`,
      // matches the synthesized "core/**" glob relative to cwd
      '/project/core/engine.ts': '',
    });

    const result = await execute({ cwd: '/project' });

    // L166: description synthesized from name (no description in module entry)
    expect(result.modules[0]?.description).toBe('core module');

    // L153 + L194: with paths === [], the template `path` falls back to the
    // module name because moduleInfo.paths[0] is undefined.
    const calls = vi.mocked(mockRender).mock.calls;
    const readmeCall = calls.find((c) => c[0] === 'knowledge/module-readme.hbs');
    const context = readmeCall![1] as Record<string, unknown>;
    expect(context.path).toBe('core');
  });

  // L211 + L216 (cond-expr#0): existing README content -> action 'updated' and merge branch taken
  // L259 + L264 (cond-expr#0): existing index.md -> action 'updated' and merge branch taken
  it('should mark files as updated and preserve user sections when target files already exist', async () => {
    const existingReadme = [
      '# Old README',
      '<!-- prospec:user-start -->',
      'MY HAND WRITTEN NOTES',
      '<!-- prospec:user-end -->',
    ].join('\n');
    const existingIndex = [
      '# Old Index',
      '<!-- prospec:user-start -->',
      'INDEX USER NOTE',
      '<!-- prospec:user-end -->',
    ].join('\n');

    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test
knowledge:
  base_path: prospec/ai-knowledge
`,
      '/project/prospec/ai-knowledge/module-map.yaml': `modules:
  - name: services
    description: Services
    paths:
      - src/services/**
    keywords:
      - services
`,
      '/project/src/services/auth.ts': '',
      '/project/prospec/ai-knowledge/modules/services/README.md': existingReadme,
      '/project/prospec/index.md': existingIndex,
    });

    const result = await execute({ cwd: '/project' });

    const readmeEntry = result.generatedFiles.find((f) => f.path.endsWith('README.md'));
    const indexEntry = result.generatedFiles.find((f) => f.path.endsWith('index.md'));
    expect(readmeEntry?.action).toBe('updated');
    expect(indexEntry?.action).toBe('updated');

    // mergeContent (L216 then-side) preserved the user section onto fresh template output
    const writtenReadme = fs.readFileSync(
      '/project/prospec/ai-knowledge/modules/services/README.md',
      'utf-8',
    );
    expect(writtenReadme).toContain('MY HAND WRITTEN NOTES');
    expect(writtenReadme).toContain('# Rendered Template Content');

    // mergeContent (L264 then-side) preserved the index user section
    const writtenIndex = fs.readFileSync('/project/prospec/index.md', 'utf-8');
    expect(writtenIndex).toContain('INDEX USER NOTE');
    expect(writtenIndex).toContain('# Rendered Template Content');
  });

  // L280-288: inferFileDescription basename branches surfaced via template key_files.
  // The memfs fast-glob mock walks the whole cwd, so the 2 config files (.prospec.yaml,
  // module-map.yaml) sort ahead of the module files; with 8 module files the total of 10
  // exactly fills the keyFiles.slice(0, 10) window so every asserted file survives the cut.
  it('should infer per-file descriptions for known basenames', async () => {
    const { renderTemplate: mockRender } = await import('../../../src/lib/template.js');

    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test
knowledge:
  base_path: prospec/ai-knowledge
`,
      '/project/prospec/ai-knowledge/module-map.yaml': `modules:
  - name: mixed
    description: Mixed bag
    paths:
      - src/mixed/**
    keywords:
      - mixed
`,
      '/project/src/mixed/index.ts': '', // L280 -> Module entry point
      '/project/src/mixed/widget.test.ts': '', // L281 -> Test file
      '/project/src/mixed/auth.service.ts': '', // L283 -> Service implementation
      '/project/src/mixed/home.controller.ts': '', // L284 -> Controller implementation
      '/project/src/mixed/user.model.ts': '', // L285 -> Data model
      '/project/src/mixed/user.schema.ts': '', // L286 -> Schema definition
      '/project/src/mixed/create.dto.ts': '', // L287 -> Data transfer object
      '/project/src/mixed/log.middleware.ts': '', // L288 -> Middleware function
    });

    await execute({ cwd: '/project' });

    const calls = vi.mocked(mockRender).mock.calls;
    const readmeCall = calls.find((c) => c[0] === 'knowledge/module-readme.hbs');
    const context = readmeCall![1] as Record<string, unknown>;
    const keyFiles = context.key_files as Array<{ path: string; description: string }>;
    const descOf = (suffix: string) =>
      keyFiles.find((f) => f.path.endsWith(suffix))?.description;

    expect(descOf('mixed/index.ts')).toBe('Module entry point');
    expect(descOf('widget.test.ts')).toBe('Test file');
    expect(descOf('auth.service.ts')).toBe('Service implementation');
    expect(descOf('home.controller.ts')).toBe('Controller implementation');
    expect(descOf('user.model.ts')).toBe('Data model');
    expect(descOf('user.schema.ts')).toBe('Schema definition');
    expect(descOf('create.dto.ts')).toBe('Data transfer object');
    expect(descOf('log.middleware.ts')).toBe('Middleware function');
  });

  // L289-293 + L314: remaining basename branches plus the generic-extension fallback.
  // 7 module files + 2 config files = 9, all within the keyFiles.slice(0, 10) window.
  it('should infer descriptions for guard/pipe/config/types/utils/hbs basenames and unknown extensions', async () => {
    const { renderTemplate: mockRender } = await import('../../../src/lib/template.js');

    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test
knowledge:
  base_path: prospec/ai-knowledge
`,
      '/project/prospec/ai-knowledge/module-map.yaml': `modules:
  - name: assets
    description: Assets
    paths:
      - src/assets/**
    keywords:
      - assets
`,
      '/project/src/assets/role.guard.ts': '', // L289 -> Guard implementation
      '/project/src/assets/trim.pipe.ts': '', // L290 -> Pipe implementation
      '/project/src/assets/app.config.ts': '', // L291 -> Configuration
      '/project/src/assets/shared.types.ts': '', // L292 -> Type definitions
      '/project/src/assets/format.utils.ts': '', // L293 -> Utility functions
      '/project/src/assets/card.hbs': '', // L293-area -> Handlebars template
      '/project/src/assets/notes.txt': '', // L314 -> unknown ext -> Source file
    });

    await execute({ cwd: '/project' });

    const calls = vi.mocked(mockRender).mock.calls;
    const readmeCall = calls.find((c) => c[0] === 'knowledge/module-readme.hbs');
    const context = readmeCall![1] as Record<string, unknown>;
    const keyFiles = context.key_files as Array<{ path: string; description: string }>;
    const descOf = (suffix: string) =>
      keyFiles.find((f) => f.path.endsWith(suffix))?.description;

    expect(descOf('role.guard.ts')).toBe('Guard implementation');
    expect(descOf('trim.pipe.ts')).toBe('Pipe implementation');
    expect(descOf('app.config.ts')).toBe('Configuration');
    expect(descOf('shared.types.ts')).toBe('Type definitions');
    expect(descOf('format.utils.ts')).toBe('Utility functions');
    expect(descOf('card.hbs')).toBe('Handlebars template');
    // L314 binary-expr#1: extension not in the lookup table -> generic fallback
    expect(descOf('notes.txt')).toBe('Source file');
  });

  // L296-313 generic extension lookup table (the binary-expr#0 hit side of L314)
  it('should infer descriptions from the generic extension table', async () => {
    const { renderTemplate: mockRender } = await import('../../../src/lib/template.js');

    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test
knowledge:
  base_path: prospec/ai-knowledge
`,
      '/project/prospec/ai-knowledge/module-map.yaml': `modules:
  - name: poly
    description: Polyglot
    paths:
      - src/poly/**
    keywords:
      - poly
`,
      '/project/src/poly/main.py': '', // Python source
      '/project/src/poly/server.go': '', // Go source
      '/project/src/poly/lib.rs': '', // Rust source
      '/project/src/poly/style.css': '', // Stylesheet
      '/project/src/poly/page.html': '', // HTML template
    });

    await execute({ cwd: '/project' });

    const calls = vi.mocked(mockRender).mock.calls;
    const readmeCall = calls.find((c) => c[0] === 'knowledge/module-readme.hbs');
    const context = readmeCall![1] as Record<string, unknown>;
    const keyFiles = context.key_files as Array<{ path: string; description: string }>;
    const descOf = (suffix: string) =>
      keyFiles.find((f) => f.path.endsWith(suffix))?.description;

    expect(descOf('main.py')).toBe('Python source');
    expect(descOf('server.go')).toBe('Go source');
    expect(descOf('lib.rs')).toBe('Rust source');
    expect(descOf('style.css')).toBe('Stylesheet');
    expect(descOf('page.html')).toBe('HTML template');
  });
});
