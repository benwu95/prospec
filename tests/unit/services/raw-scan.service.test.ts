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

const PROSPEC_YAML = 'project:\n  name: backend\n';
function depNames(deps: Array<{ name: string }>): string[] {
  return deps.map((d) => d.name);
}

describe('raw-scan.service / Dependencies — backend ecosystems', () => {
  it('parses Poetry pyproject.toml (no package.json → not empty)', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/pyproject.toml':
        '[tool.poetry.dependencies]\npython = "^3.11"\nrequests = "^2.31"\n',
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(depNames(result.dependencies)).toEqual(['requests']);
  });

  it('parses PEP 621 pyproject.toml', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/pyproject.toml':
        '[project]\nname = "x"\ndependencies = ["flask>=2", "click"]\n',
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(depNames(result.dependencies)).toEqual(['flask', 'click']);
  });

  it('falls back to requirements.txt when pyproject has no deps', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/pyproject.toml': '[build-system]\nrequires = ["setuptools"]\n',
      '/project/requirements.txt': 'django==5.0\n-r dev.txt\n',
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(depNames(result.dependencies)).toEqual(['django']);
  });

  it('parses go.mod require directives', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/go.mod':
        'module x\ngo 1.22\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.1\n)\n',
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(depNames(result.dependencies)).toEqual(['github.com/gin-gonic/gin']);
  });

  it('parses Cargo.toml', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/Cargo.toml': '[dependencies]\nserde = "1.0"\n',
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(depNames(result.dependencies)).toEqual(['serde']);
  });

  it('parses composer.json (skips platform packages)', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/composer.json': JSON.stringify({
        require: { php: '>=8.1', 'laravel/framework': '^11' },
      }),
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(depNames(result.dependencies)).toEqual(['laravel/framework']);
  });

  it('parses pom.xml located in a subdirectory', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/app/pom.xml':
        '<project><dependencies><dependency><groupId>g</groupId><artifactId>a</artifactId><version>1</version></dependency></dependencies></project>',
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(depNames(result.dependencies)).toEqual(['g:a']);
  });

  it('parses *.csproj PackageReference', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/App.csproj':
        '<Project><ItemGroup><PackageReference Include="Serilog" Version="3.1.1" /></ItemGroup></Project>',
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(depNames(result.dependencies)).toEqual(['Serilog']);
  });

  it('keeps Tech Stack and Dependencies consistent for a Ruby+PHP tree', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/Gemfile': "source 'https://rubygems.org'\n",
      '/project/composer.json': JSON.stringify({
        require: { 'laravel/framework': '^11' },
      }),
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(result.techStack.language).toBe('ruby');
    expect(result.dependencies).toEqual([]); // Ruby short-circuit, not PHP deps
  });

  it('detects C# tech stack from a csproj in a subdirectory (tree-wide)', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/src/App.csproj':
        '<Project><ItemGroup><PackageReference Include="Serilog" Version="3.1.1" /></ItemGroup></Project>',
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(result.techStack.language).toBe('c#');
    expect(depNames(result.dependencies)).toEqual(['Serilog']);
  });
});

describe('raw-scan.service / Entry Points + Config Files — backend', () => {
  it('detects Go and Rust entry-point files', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/main.go': 'package main\n',
      '/project/go.mod': 'module x\n',
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(result.entryPoints).toContain('main.go');
  });

  it('detects Python script targets and __main__.py', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/pyproject.toml':
        '[project.scripts]\ndemo = "demo.cli:main"\n',
      '/project/demo/__main__.py': '',
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(result.entryPoints).toContain('demo.cli:main');
    expect(result.entryPoints).toContain('demo/__main__.py');
  });

  it('detects an executable csproj as an entry point', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/App.csproj':
        '<Project><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup></Project>',
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(result.entryPoints).toContain('App.csproj');
  });

  it('lists backend build files as config files', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/pom.xml': '<project/>',
      '/project/build.gradle': '',
      '/project/Gemfile': '',
      '/project/composer.json': '{}',
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(result.configFiles).toEqual(
      expect.arrayContaining(['pom.xml', 'build.gradle', 'Gemfile', 'composer.json']),
    );
  });
});
