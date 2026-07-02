import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { generateRawScan } from '../../../src/services/raw-scan.service.js';
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
  index: '/project/prospec/index.md',
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

  it('does NOT create curated files (module-map / index.md / _conventions)', async () => {
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

  it('caps the directory tree at the requested depth', async () => {
    // buildDirectoryTree(files, depth) is the only branch-distinguishing
    // consumer of `depth` observable in this mocked setup (fast-glob is mocked
    // and ignores `deep`). The rendered context's directory_tree must include
    // dirs up to depth 2 (src/, src/a/) but omit anything deeper (src/a/b/...).
    vi.mocked(renderTemplate).mockClear();
    seedProject({ '/project/src/a/b/c/d.ts': '' });
    const result = await generateRawScan({ depth: 2, cwd: '/project' });
    expect(result.scanDepth).toBe(2);

    const ctx = vi.mocked(renderTemplate).mock.calls.at(-1)?.[1] as {
      directory_tree: string;
    };
    const treeDirs = ctx.directory_tree
      .split('\n')
      .map((l) => l.trim());
    expect(treeDirs).toContain('src/');
    expect(treeDirs).toContain('a/'); // depth 2 → src/a/ rendered as 'a/'
    expect(treeDirs).not.toContain('b/'); // depth 3 dir is truncated
    expect(treeDirs).not.toContain('c/'); // depth 4 dir is truncated
  });

  it('renders deeper directory tree levels when depth is raised', async () => {
    // Contrast with the depth-2 cap: at the default depth the same nested file
    // surfaces its deeper directory levels, proving the cap is depth-driven and
    // not a fixed truncation.
    vi.mocked(renderTemplate).mockClear();
    seedProject({ '/project/src/a/b/c/d.ts': '' });
    await generateRawScan({ depth: 10, cwd: '/project' });

    const ctx = vi.mocked(renderTemplate).mock.calls.at(-1)?.[1] as {
      directory_tree: string;
    };
    const treeDirs = ctx.directory_tree.split('\n').map((l) => l.trim());
    expect(treeDirs).toContain('b/');
    expect(treeDirs).toContain('c/');
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

describe('raw-scan.service / C, C++, Swift', () => {
  it('parses vcpkg.json deps and reports C++ / vcpkg with entry + config', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/CMakeLists.txt': 'project(demo)\n',
      '/project/vcpkg.json': JSON.stringify({ dependencies: ['fmt', { name: 'boost' }] }),
      '/project/src/main.cpp': 'int main(){}\n',
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(result.techStack).toMatchObject({ language: 'c++', package_manager: 'vcpkg' });
    expect(depNames(result.dependencies)).toEqual(['fmt', 'boost']);
    expect(result.entryPoints).toContain('src/main.cpp');
    expect(result.configFiles).toEqual(
      expect.arrayContaining(['CMakeLists.txt', 'vcpkg.json']),
    );
  });

  it('parses conanfile.txt deps and reports C / conan', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/conanfile.txt': '[requires]\nzlib/1.2.13\n',
      '/project/main.c': 'int main(void){return 0;}\n',
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(result.techStack).toMatchObject({ language: 'c', package_manager: 'conan' });
    expect(depNames(result.dependencies)).toEqual(['zlib']);
  });

  it('reports Swift with empty deps (Package.swift not parsed) and main.swift entry', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/Package.swift': '// swift-tools-version:5.9\n',
      '/project/Sources/App/main.swift': 'print("hi")\n',
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(result.techStack.language).toBe('swift');
    expect(result.dependencies).toEqual([]);
    expect(result.entryPoints).toContain('Sources/App/main.swift');
    expect(result.configFiles).toContain('Package.swift');
  });

  it('leaves deps empty for an imperative-only C++ project (CMake, no vcpkg/conan)', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/CMakeLists.txt': 'project(demo)\n',
      '/project/main.cpp': 'int main(){}\n',
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(result.techStack.language).toBe('c++');
    expect(result.dependencies).toEqual([]);
  });

  it('keeps Tech Stack and Dependencies consistent for a vcpkg.json with no C/C++ source', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/vcpkg.json': JSON.stringify({ dependencies: ['fmt'] }),
      '/project/README.md': '# demo\n',
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(result.techStack.language).toBeUndefined();
    expect(result.dependencies).toEqual([]); // gated on C-family source evidence
  });

  it('detects a C++ entry point in a nested directory', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/CMakeLists.txt': 'project(demo)\n',
      '/project/apps/tool/main.cpp': 'int main(){}\n',
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(result.entryPoints).toContain('apps/tool/main.cpp');
  });
});

describe('raw-scan.service / Entry Points + Config Files — backend', () => {
  it('detects Go and Rust entry-point files', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/main.go': 'package main\n',
      '/project/go.mod': 'module x\n',
      '/project/Cargo.toml': '[package]\nname = "x"\n',
      '/project/src/main.rs': 'fn main(){}\n',
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(result.entryPoints).toContain('main.go'); // /^main\.go$/
    expect(result.entryPoints).toContain('src/main.rs'); // /^src\/main\.rs$/
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

describe('raw-scan.service / cwd fallback (no cwd option)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to process.cwd() when options.cwd is omitted', async () => {
    // Seed a project at a fixed absolute root, then point process.cwd() at it
    // so the omitted-cwd branch (cwd ?? process.cwd()) resolves there.
    vol.fromJSON({
      '/cwd-root/.prospec.yaml': 'project:\n  name: cwd-fallback\n',
      '/cwd-root/package.json': JSON.stringify({ name: 'cwd-fallback' }),
      '/cwd-root/src/index.ts': '',
    });
    vi.spyOn(process, 'cwd').mockReturnValue('/cwd-root');

    const result = await generateRawScan({});

    expect(result.outputFile).toBe('prospec/ai-knowledge/raw-scan.md');
    expect(result.entryPoints).toContain('src/index.ts');
    expect(
      fs.existsSync('/cwd-root/prospec/ai-knowledge/raw-scan.md'),
    ).toBe(true);
  });
});

describe('raw-scan.service / package.json entry points', () => {
  it('uses package.json "main" as an entry point', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/package.json': JSON.stringify({
        name: 'x',
        main: 'lib/server.js',
      }),
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(result.entryPoints).toContain('lib/server.js');
  });

  it('uses a string "bin" as an entry point', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/package.json': JSON.stringify({
        name: 'x',
        bin: 'bin/cli.js',
      }),
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(result.entryPoints).toContain('bin/cli.js');
  });

  it('expands an object "bin" map into its target values', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/package.json': JSON.stringify({
        name: 'x',
        bin: { foo: 'bin/foo.js', bar: 'bin/bar.js' },
      }),
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(result.entryPoints).toEqual(
      expect.arrayContaining(['bin/foo.js', 'bin/bar.js']),
    );
  });

  it('ignores a malformed package.json (invalid JSON → no entry points, no throw)', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/package.json': '{ this is : not json',
    });
    const result = await generateRawScan({ cwd: '/project' });
    // Parse failure is swallowed: no seeded file (.prospec.yaml, package.json)
    // matches any entry-point pattern, so a partially-parsed main/bin leaking
    // through the catch would surface as a non-empty array.
    expect(result.entryPoints).toEqual([]);
    expect(result.dependencies).toEqual([]);
  });
});

describe('raw-scan.service / readFileSafe + findManifestPath edge paths', () => {
  it('treats an unreadable manifest path (a directory) as empty content', async () => {
    // Cargo.toml exists as a DIRECTORY: fileExists (accessSync) succeeds but
    // readFileSync throws EISDIR, so readFileSafe returns '' and the Cargo
    // parser yields no deps rather than throwing.
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/Cargo.toml/placeholder': 'x',
      '/project/src/main.rs': 'fn main(){}\n',
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(result.dependencies).toEqual([]);
  });

  it('picks the shallowest csproj when multiple exist at different depths', async () => {
    // Two .csproj at different depths: findManifestPath sorts by depth first,
    // so the root-most (shallowest) one wins and supplies the deps.
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/Root.csproj':
        '<Project><ItemGroup><PackageReference Include="RootPkg" Version="1.0.0" /></ItemGroup></Project>',
      '/project/nested/dir/Deep.csproj':
        '<Project><ItemGroup><PackageReference Include="DeepPkg" Version="2.0.0" /></ItemGroup></Project>',
    });
    const result = await generateRawScan({ cwd: '/project' });
    expect(depNames(result.dependencies)).toEqual(['RootPkg']);
  });

  it('picks the codepoint-first csproj when multiple exist at the same depth', async () => {
    // Three .csproj at the SAME depth: with depthDiff === 0 the comparator
    // falls through to codepoint ordering, exercising both a<b and a>b sides.
    vol.fromJSON({
      '/project/.prospec.yaml': PROSPEC_YAML,
      '/project/Charlie.csproj':
        '<Project><ItemGroup><PackageReference Include="CharliePkg" Version="3.0.0" /></ItemGroup></Project>',
      '/project/Alpha.csproj':
        '<Project><ItemGroup><PackageReference Include="AlphaPkg" Version="1.0.0" /></ItemGroup></Project>',
      '/project/Bravo.csproj':
        '<Project><ItemGroup><PackageReference Include="BravoPkg" Version="2.0.0" /></ItemGroup></Project>',
    });
    const result = await generateRawScan({ cwd: '/project' });
    // 'Alpha.csproj' < 'Bravo.csproj' < 'Charlie.csproj' → Alpha wins.
    expect(depNames(result.dependencies)).toEqual(['AlphaPkg']);
  });
});
