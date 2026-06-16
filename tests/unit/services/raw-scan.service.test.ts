import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import {
  generateRawScan,
  execute,
} from '../../../src/services/raw-scan.service.js';
import { ConfigNotFound } from '../../../src/types/errors.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

vi.mock('../../../src/lib/template.js', () => ({
  renderTemplate: vi.fn().mockImplementation(
    (templatePath: string, context: Record<string, unknown>) => {
      if (templatePath === 'knowledge/raw-scan.md.hbs') {
        const stats = context.file_stats as { total_files: number };
        return `# Raw Scan: ${context.project_name}\n\nFiles: ${stats.total_files}\n`;
      }
      return '# Template\n';
    },
  ),
  registerPartial: vi.fn(),
  registerPartialFromFile: vi.fn(),
  registerHelper: vi.fn(),
}));

// Mock fast-glob to walk the in-memory filesystem
vi.mock('fast-glob', () => ({
  default: {
    glob: vi.fn().mockImplementation(
      async (_patterns: string | string[], options: { cwd?: string }) => {
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
          return allFiles.sort();
        } catch {
          return [];
        }
      },
    ),
    globSync: vi.fn().mockReturnValue([]),
  },
}));

const RAW_SCAN_PATH = '/project/prospec/ai-knowledge/raw-scan.md';
const CURATED = {
  moduleMap: '/project/prospec/ai-knowledge/module-map.yaml',
  index: '/project/prospec/ai-knowledge/_index.md',
  conventions: '/project/prospec/ai-knowledge/_conventions.md',
};

function seedProject(extra: Record<string, string> = {}): void {
  vol.fromJSON({
    '/project/.prospec.yaml': 'project:\n  name: test-project\n',
    '/project/package.json': JSON.stringify({
      name: 'test-project',
      dependencies: { express: '^4.0.0' },
      devDependencies: { vitest: '^1.0.0' },
    }),
    '/project/tsconfig.json': '{}',
    '/project/src/index.ts': '',
    '/project/src/services/auth.ts': '',
    ...extra,
  });
}

beforeEach(() => {
  vol.reset();
});

describe('raw-scan.service / generateRawScan', () => {
  it('throws ConfigNotFound when .prospec.yaml is missing', async () => {
    vol.fromJSON({ '/project/src/index.ts': '' });
    await expect(generateRawScan({ cwd: '/project' })).rejects.toThrow(
      ConfigNotFound,
    );
  });

  it('regenerates raw-scan.md from current code', async () => {
    seedProject();
    const result = await generateRawScan({ cwd: '/project' });

    expect(result.dryRun).toBe(false);
    expect(result.outputFile).toBe('prospec/ai-knowledge/raw-scan.md');
    expect(result.totalFiles).toBeGreaterThan(0);
    expect(result.files.length).toBe(result.totalFiles);

    const content = fs.readFileSync(RAW_SCAN_PATH, 'utf-8');
    expect(content).toContain('Raw Scan');
  });

  it('does NOT create curated files (module-map / _index / _conventions)', async () => {
    seedProject();
    await generateRawScan({ cwd: '/project' });

    for (const p of Object.values(CURATED)) {
      expect(fs.existsSync(p), `${p} must not be created by refresh`).toBe(false);
    }
  });

  it('leaves existing curated files byte-identical', async () => {
    const moduleMap = 'modules:\n  - name: custom\n    description: Curated\n';
    const index = '# Existing Index\nCustom content\n';
    const conventions = '# Existing Conventions\nCustom rules\n';
    seedProject({
      [CURATED.moduleMap]: moduleMap,
      [CURATED.index]: index,
      [CURATED.conventions]: conventions,
    });

    await generateRawScan({ cwd: '/project' });

    expect(fs.readFileSync(CURATED.moduleMap, 'utf-8')).toBe(moduleMap);
    expect(fs.readFileSync(CURATED.index, 'utf-8')).toBe(index);
    expect(fs.readFileSync(CURATED.conventions, 'utf-8')).toBe(conventions);
  });

  it('does not write any file in dry-run mode but still reports counts', async () => {
    seedProject();
    const result = await generateRawScan({ dryRun: true, cwd: '/project' });

    expect(result.dryRun).toBe(true);
    expect(result.outputFile).toBeNull();
    expect(result.totalFiles).toBeGreaterThan(0);
    expect(fs.existsSync(RAW_SCAN_PATH)).toBe(false);
  });

  it('respects the depth parameter', async () => {
    seedProject({ '/project/src/a/b/c/d.ts': '' });
    const result = await generateRawScan({ depth: 2, cwd: '/project' });
    expect(result.scanDepth).toBe(2);
  });

  it('collects dependencies and config files (parity with init)', async () => {
    seedProject();
    const result = await generateRawScan({ cwd: '/project' });

    expect(result.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'express' }),
        expect.objectContaining({ name: 'vitest' }),
      ]),
    );
    expect(result.configFiles).toEqual(
      expect.arrayContaining([
        expect.stringContaining('tsconfig.json'),
        expect.stringContaining('package.json'),
      ]),
    );
  });

  it('is deterministic — idempotent at the fixpoint (raw-scan.md already present)', async () => {
    // Seed an existing raw-scan.md so both runs see identical input — the first
    // refresh on a clean repo legitimately adds raw-scan.md to the file list
    // (+1), so the stable guarantee is fixpoint idempotency, not first==second.
    seedProject({ [RAW_SCAN_PATH]: '# seed\n' });
    const first = await generateRawScan({ cwd: '/project' });
    const firstContent = fs.readFileSync(RAW_SCAN_PATH, 'utf-8');
    const second = await generateRawScan({ cwd: '/project' });
    const secondContent = fs.readFileSync(RAW_SCAN_PATH, 'utf-8');

    expect(second.files).toEqual(first.files);
    expect(second.dependencies).toEqual(first.dependencies);
    expect(second.configFiles).toEqual(first.configFiles);
    expect(secondContent).toBe(firstContent);
  });

  it('regenerates raw-scan.md even when it already exists (overwrite)', async () => {
    seedProject({ [RAW_SCAN_PATH]: '# stale scan\n' });
    await generateRawScan({ cwd: '/project' });
    expect(fs.readFileSync(RAW_SCAN_PATH, 'utf-8')).not.toContain('stale');
  });
});

describe('raw-scan.service / execute (refresh entry)', () => {
  it('delegates to generateRawScan and writes raw-scan.md', async () => {
    seedProject();
    const result = await execute({ cwd: '/project' });
    expect(result.outputFile).toBe('prospec/ai-knowledge/raw-scan.md');
    expect(fs.existsSync(RAW_SCAN_PATH)).toBe(true);
  });
});
