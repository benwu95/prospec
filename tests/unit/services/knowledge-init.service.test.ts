import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { execute } from '../../../src/services/knowledge-init.service.js';
import { renderTemplate } from '../../../src/lib/template.js';
import { ConfigNotFound } from '../../../src/types/errors.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

vi.mock('../../../src/lib/template.js', () => ({
  renderTemplate: vi.fn().mockImplementation(
    (templatePath: string, context: Record<string, unknown>) => {
      if (templatePath === 'knowledge/raw-scan.md.hbs') {
        return `# Raw Scan: ${context.project_name}\n\nGenerated content\n`;
      }
      if (templatePath === 'knowledge/index.md.hbs') {
        return `# AI Knowledge Index\n\n<!-- prospec:auto-start -->\n<!-- prospec:auto-end -->\n`;
      }
      return '# Template\n';
    },
  ),
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
              if (!['node_modules', '.git', 'dist'].includes(entry.name)) {
                walkDir(fullPath, relativePath);
              }
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
});

describe('knowledge-init.service', () => {
  it('should throw ConfigNotFound when .prospec.yaml is missing', async () => {
    vol.fromJSON({ '/project/src/index.ts': '' });
    await expect(execute({ cwd: '/project' })).rejects.toThrow(ConfigNotFound);
  });

  it('should generate raw-scan.md', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\n',
      '/project/package.json': JSON.stringify({
        name: 'test-project',
        dependencies: { express: '^4.0.0' },
      }),
      '/project/src/index.ts': '',
      '/project/src/services/auth.ts': '',
    });

    const result = await execute({ cwd: '/project' });

    expect(result.dryRun).toBe(false);
    expect(result.rawScanOnly).toBe(false);
    expect(result.outputFiles).toContain('prospec/ai-knowledge/raw-scan.md');
    expect(result.totalFiles).toBeGreaterThan(0);

    // Verify raw-scan.md was written
    const rawScan = fs.readFileSync(
      '/project/prospec/ai-knowledge/raw-scan.md',
      'utf-8',
    );
    expect(rawScan).toContain('Raw Scan');
  });

  it('should generate module-map.yaml from detected modules', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\n',
      '/project/package.json': JSON.stringify({ name: 'test-project' }),
      '/project/src/services/auth.ts': '',
      '/project/src/services/user.ts': '',
      '/project/src/lib/config.ts': '',
      '/project/src/lib/utils.ts': '',
    });

    const result = await execute({ cwd: '/project' });

    expect(result.outputFiles).toContain('prospec/ai-knowledge/module-map.yaml');
    const content = fs.readFileSync(
      '/project/prospec/ai-knowledge/module-map.yaml',
      'utf-8',
    );
    expect(content).toContain('modules:');
    expect(content).toMatch(/name: (services|lib)/);
  });

  it('still creates all first-time artifacts (raw-scan + module-map + skeletons) in one run', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\n',
      '/project/package.json': JSON.stringify({ name: 'test-project' }),
      '/project/src/services/auth.ts': '',
      '/project/src/lib/config.ts': '',
    });

    await execute({ cwd: '/project' });

    const base = '/project/prospec/ai-knowledge';
    expect(fs.existsSync(`${base}/raw-scan.md`)).toBe(true);
    expect(fs.existsSync(`${base}/module-map.yaml`)).toBe(true);
    expect(fs.existsSync(`${base}/_index.md`)).toBe(true);
    expect(fs.existsSync(`${base}/_conventions.md`)).toBe(true);
  });

  it('should not overwrite an existing module-map.yaml on rerun', async () => {
    const curated =
      'modules:\n  - name: custom\n    description: Curated\n    paths:\n      - src/custom\n    keywords:\n      - custom\n';
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\n',
      '/project/package.json': JSON.stringify({ name: 'test-project' }),
      '/project/prospec/ai-knowledge/module-map.yaml': curated,
      '/project/src/services/auth.ts': '',
      '/project/src/services/user.ts': '',
    });

    const result = await execute({ cwd: '/project' });

    const content = fs.readFileSync(
      '/project/prospec/ai-knowledge/module-map.yaml',
      'utf-8',
    );
    expect(content).toBe(curated);
    expect(result.outputFiles).not.toContain('prospec/ai-knowledge/module-map.yaml');
  });

  it('should generate empty skeleton (_index.md, _conventions.md)', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\n',
      '/project/src/index.ts': '',
    });

    const result = await execute({ cwd: '/project' });

    expect(result.outputFiles).toContain('prospec/ai-knowledge/_index.md');
    expect(result.outputFiles).toContain('prospec/ai-knowledge/_conventions.md');

    // Verify _conventions.md contains skeleton
    const conventions = fs.readFileSync(
      '/project/prospec/ai-knowledge/_conventions.md',
      'utf-8',
    );
    expect(conventions).toContain('prospec:auto-start');
    expect(conventions).toContain('prospec:user-start');
  });

  it('should not overwrite existing _index.md or _conventions.md on rerun', async () => {
    const existingIndex = '# Existing Index\nCustom content\n';
    const existingConventions = '# Existing Conventions\nCustom rules\n';

    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\n',
      '/project/src/index.ts': '',
      '/project/prospec/ai-knowledge/_index.md': existingIndex,
      '/project/prospec/ai-knowledge/_conventions.md': existingConventions,
    });

    const result = await execute({ cwd: '/project' });

    // raw-scan.md should still be generated
    expect(result.outputFiles).toContain('prospec/ai-knowledge/raw-scan.md');

    // _index.md and _conventions.md should NOT be in outputFiles (not overwritten)
    expect(result.outputFiles).not.toContain('prospec/ai-knowledge/_index.md');
    expect(result.outputFiles).not.toContain('prospec/ai-knowledge/_conventions.md');

    // Verify existing content is preserved
    const index = fs.readFileSync(
      '/project/prospec/ai-knowledge/_index.md',
      'utf-8',
    );
    expect(index).toBe(existingIndex);

    const conventions = fs.readFileSync(
      '/project/prospec/ai-knowledge/_conventions.md',
      'utf-8',
    );
    expect(conventions).toBe(existingConventions);
  });

  it('should not write files in dry-run mode', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\n',
      '/project/src/index.ts': '',
    });

    const result = await execute({ dryRun: true, cwd: '/project' });

    expect(result.dryRun).toBe(true);
    expect(result.outputFiles).toHaveLength(0);

    // Verify no files were created
    expect(() =>
      fs.readFileSync('/project/prospec/ai-knowledge/raw-scan.md', 'utf-8'),
    ).toThrow();
  });

  it('caps the directory tree at the requested depth (and lifts the cap as depth rises)', async () => {
    // result.scanDepth is just the input arg echoed straight through
    // (knowledge-init L126 ← raw-scan L116), so it proves nothing about
    // depth-limiting. The only branch-distinguishing consumer of `depth`
    // observable in this mocked setup is buildDirectoryTree(files, depth)
    // (raw-scan L82, L398-407) — fast-glob is mocked and ignores `deep`, so the
    // file set is identical at any depth. Inspect the rendered context's
    // directory_tree to prove the cap is depth-driven.
    vi.mocked(renderTemplate).mockClear();
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\n',
      '/project/src/a/b/c/d.ts': '',
    });

    const result = await execute({ depth: 2, cwd: '/project' });
    expect(result.scanDepth).toBe(2);

    const rawScanCall = vi
      .mocked(renderTemplate)
      .mock.calls.find(([tpl]) => tpl === 'knowledge/raw-scan.md.hbs');
    expect(rawScanCall).toBeDefined();
    const treeDirs = (rawScanCall![1] as { directory_tree: string }).directory_tree
      .split('\n')
      .map((l) => l.trim());
    // depth 2 → src/ and src/a/ (rendered as 'a/'); deeper dirs truncated.
    expect(treeDirs).toContain('src/');
    expect(treeDirs).toContain('a/');
    expect(treeDirs).not.toContain('b/'); // depth-3 dir truncated
    expect(treeDirs).not.toContain('c/'); // depth-4 dir truncated

    // Contrast: the SAME nested file surfaces deeper levels at depth 10,
    // proving the cap is depth-driven and not a fixed truncation.
    vi.mocked(renderTemplate).mockClear();
    vol.reset();
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\n',
      '/project/src/a/b/c/d.ts': '',
    });
    await execute({ depth: 10, cwd: '/project' });

    const deepCall = vi
      .mocked(renderTemplate)
      .mock.calls.find(([tpl]) => tpl === 'knowledge/raw-scan.md.hbs');
    const deepTreeDirs = (deepCall![1] as { directory_tree: string }).directory_tree
      .split('\n')
      .map((l) => l.trim());
    expect(deepTreeDirs).toContain('b/');
    expect(deepTreeDirs).toContain('c/');
  });

  it('should detect dependencies from package.json', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\n',
      '/project/package.json': JSON.stringify({
        dependencies: { express: '^4.0.0', lodash: '^4.17.0' },
        devDependencies: { vitest: '^1.0.0' },
      }),
      '/project/src/index.ts': '',
    });

    const result = await execute({ cwd: '/project' });

    expect(result.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'express' }),
        expect.objectContaining({ name: 'lodash' }),
        expect.objectContaining({ name: 'vitest' }),
      ]),
    );
  });

  it('should collect config files', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\n',
      '/project/tsconfig.json': '{}',
      '/project/package.json': '{}',
      '/project/src/index.ts': '',
    });

    const result = await execute({ cwd: '/project' });
    expect(result.configFiles).toEqual(
      expect.arrayContaining([
        expect.stringContaining('tsconfig.json'),
        expect.stringContaining('package.json'),
      ]),
    );
  });

  describe('--raw-scan-only', () => {
    it('regenerates only raw-scan.md and never creates curated files', async () => {
      vol.fromJSON({
        '/project/.prospec.yaml': 'project:\n  name: test-project\n',
        '/project/package.json': JSON.stringify({ name: 'test-project' }),
        '/project/src/services/auth.ts': '',
        '/project/src/lib/config.ts': '',
      });

      const result = await execute({ cwd: '/project', rawScanOnly: true });

      expect(result.rawScanOnly).toBe(true);
      expect(result.outputFiles).toEqual(['prospec/ai-knowledge/raw-scan.md']);

      const base = '/project/prospec/ai-knowledge';
      expect(fs.existsSync(`${base}/raw-scan.md`)).toBe(true);
      // Curated files must NOT be seeded under --raw-scan-only (the negative guarantee)
      expect(fs.existsSync(`${base}/module-map.yaml`)).toBe(false);
      expect(fs.existsSync(`${base}/_index.md`)).toBe(false);
      expect(fs.existsSync(`${base}/_conventions.md`)).toBe(false);
    });

    it('leaves existing curated files byte-identical', async () => {
      const curatedMap = 'modules:\n  - name: custom\n';
      const curatedIndex = '# Existing Index\n';
      const curatedConventions = '# Existing Conventions\n';
      vol.fromJSON({
        '/project/.prospec.yaml': 'project:\n  name: test-project\n',
        '/project/package.json': JSON.stringify({ name: 'test-project' }),
        '/project/prospec/ai-knowledge/module-map.yaml': curatedMap,
        '/project/prospec/ai-knowledge/_index.md': curatedIndex,
        '/project/prospec/ai-knowledge/_conventions.md': curatedConventions,
        '/project/src/services/auth.ts': '',
      });

      const result = await execute({ cwd: '/project', rawScanOnly: true });

      expect(result.outputFiles).toEqual(['prospec/ai-knowledge/raw-scan.md']);
      const base = '/project/prospec/ai-knowledge';
      expect(fs.readFileSync(`${base}/module-map.yaml`, 'utf-8')).toBe(curatedMap);
      expect(fs.readFileSync(`${base}/_index.md`, 'utf-8')).toBe(curatedIndex);
      expect(fs.readFileSync(`${base}/_conventions.md`, 'utf-8')).toBe(
        curatedConventions,
      );
    });

    it('writes nothing under --raw-scan-only --dry-run', async () => {
      vol.fromJSON({
        '/project/.prospec.yaml': 'project:\n  name: test-project\n',
        '/project/src/index.ts': '',
      });

      const result = await execute({
        cwd: '/project',
        rawScanOnly: true,
        dryRun: true,
      });

      expect(result.rawScanOnly).toBe(true);
      expect(result.outputFiles).toHaveLength(0);
      expect(fs.existsSync('/project/prospec/ai-knowledge/raw-scan.md')).toBe(false);
    });
  });
});
