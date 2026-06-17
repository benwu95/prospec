import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { execute } from '../../../src/services/steering.service.js';
import { renderTemplate } from '../../../src/lib/template.js';
import { ConfigNotFound } from '../../../src/types/errors.js';

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

describe('steering.service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw ConfigNotFound when .prospec.yaml is missing', async () => {
    vol.fromJSON({ '/project/src/index.ts': '' });
    await expect(execute({ cwd: '/project' })).rejects.toThrow(ConfigNotFound);
  });

  it('should scan project and detect modules', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/src/services/auth.ts': '',
      '/project/src/services/user.ts': '',
      '/project/src/lib/config.ts': '',
      '/project/src/types/errors.ts': '',
    });

    const result = await execute({ cwd: '/project' });
    // every seeded source file (4) plus the config file is scanned
    expect(result.fileCount).toBe(5);
    expect(result.dryRun).toBe(false);
    // architecture-layer detection groups the two src/services/* files into a
    // single `services` module and counts exactly those files
    const services = result.modules.find((m) => m.name === 'services');
    expect(services).toBeDefined();
    expect(services!.fileCount).toBe(2);
    expect(services!.description).toBe('Business logic services');
    // and the module count reflects the distinct second-level dirs detected
    expect(result.moduleCount).toBe(result.modules.length);
    expect(result.modules.map((m) => m.name).sort()).toEqual([
      'lib',
      'services',
      'types',
    ]);
  });

  it('should not write files in dry-run mode', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/src/index.ts': '',
    });

    const result = await execute({ dryRun: true, cwd: '/project' });
    expect(result.dryRun).toBe(true);
    expect(result.outputFiles).toHaveLength(0);
    // the `if (!dryRun)` write block is skipped → nothing lands on disk
    expect(fs.existsSync('/project/prospec/ai-knowledge/module-map.yaml')).toBe(
      false,
    );
    expect(fs.existsSync('/project/prospec/ai-knowledge/architecture.md')).toBe(
      false,
    );
    // and the source config is left untouched (no tech_stack/paths rewrite)
    const config = fs.readFileSync('/project/.prospec.yaml', 'utf-8') as string;
    expect(config).not.toContain('tech_stack');
  });

  it('preserves paths.base_dir when rewriting config', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\npaths:\n  base_dir: prospec\n',
      '/project/src/services/auth.ts': '',
      '/project/src/services/user.ts': '',
      '/project/src/lib/config.ts': '',
    });

    await execute({ cwd: '/project' });

    // base_dir must survive — otherwise the next readConfig falls back to
    // DEFAULT_BASE_DIR and a custom base_dir's spec tree silently relocates.
    const written = fs.readFileSync('/project/.prospec.yaml', 'utf-8') as string;
    expect(written).toContain('base_dir: prospec');
  });

  it('writes the auto-detected tech stack and module paths back to config', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/package.json': '{"name":"test","devDependencies":{"express":"^4"}}',
      '/project/tsconfig.json': '{}',
      '/project/src/services/a.ts': '',
      '/project/src/services/b.ts': '',
    });

    await execute({ cwd: '/project' });

    const written = fs.readFileSync('/project/.prospec.yaml', 'utf-8') as string;
    // package.json + tsconfig.json → typescript; express dep → express;
    // no lockfile → npm. The detected stack is merged into the rewritten config.
    expect(written).toContain('language: typescript');
    expect(written).toContain('framework: express');
    expect(written).toContain('package_manager: npm');
    // detected module dir becomes a paths entry
    expect(written).toContain('services: src/services/**');
  });

  it('counts files for domain-style glob module paths', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\nknowledge:\n  strategy: domain\n',
      '/project/src/features/auth/login.ts': '',
      '/project/src/features/auth/register.ts': '',
      '/project/src/features/checkout/cart.ts': '',
      '/project/src/features/checkout/pay.ts': '',
    });

    const result = await execute({ cwd: '/project' });
    const auth = result.modules.find((m) => m.name === 'auth');
    const checkout = result.modules.find((m) => m.name === 'checkout');
    // `**/auth/**` must match the two src/features/auth/* files as real path
    // segments — the old prefix match returned 0, so an exact 2 is the
    // branch-distinguishing outcome (not merely > 0)
    expect(auth).toBeDefined();
    expect(auth!.fileCount).toBe(2);
    // the sibling domain is grouped independently with its own two files
    expect(checkout).toBeDefined();
    expect(checkout!.fileCount).toBe(2);
  });

  it('excludes the reserved base_dir key from architecture layers (A7)', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml':
        'project:\n  name: test\npaths:\n  base_dir: prospec\n  cli: src/cli\n',
      '/project/src/cli/index.ts': '',
    });
    vi.mocked(renderTemplate).mockClear();

    await execute({ cwd: '/project' });

    const archCall = vi
      .mocked(renderTemplate)
      .mock.calls.find(([tpl]) => tpl === 'steering/architecture.md.hbs');
    expect(archCall).toBeDefined();
    const layers = (archCall![1] as { layers: Array<{ name: string }> }).layers;
    // a real layer key survives; the reserved artifact-root key never becomes a layer
    expect(layers.some((l) => l.name === 'cli')).toBe(true);
    expect(layers.some((l) => l.name === 'base_dir')).toBe(false);
  });

  it('classifies the pragmatic architecture from cli/services/lib/types dirs', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/src/cli/index.ts': '',
      '/project/src/services/auth.ts': '',
      '/project/src/lib/config.ts': '',
      '/project/src/types/errors.ts': '',
    });

    const result = await execute({ cwd: '/project' });
    // all four pragmatic indicators (cli, services, lib, types) are present →
    // score 4 wins over `unknown`; this is the >=2-indicator branch
    expect(result.architecture).toBe('pragmatic');
    // src/cli/index.ts is a recognized entry point
    expect(result.entryPoints).toContain('src/cli/index.ts');
  });

  // L52 binary-expr#1: options.cwd undefined → falls back to process.cwd()
  it('falls back to process.cwd() when no cwd option is given', async () => {
    vol.fromJSON({
      '/runtime-root/.prospec.yaml': 'project:\n  name: from-cwd\n',
      '/runtime-root/src/services/a.ts': '',
      '/runtime-root/src/services/b.ts': '',
      '/runtime-root/src/lib/c.ts': '',
    });
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/runtime-root');

    const result = await execute({});

    expect(cwdSpy).toHaveBeenCalled();
    // it resolved the project rooted at process.cwd(), not an empty scan
    expect(result.fileCount).toBeGreaterThan(0);
    // config + outputs were written under the process.cwd() root
    expect(fs.existsSync('/runtime-root/prospec/ai-knowledge/module-map.yaml')).toBe(
      true,
    );
  });

  // L245 binary-expr#1: inferLayerDescription unknown name → `${name} layer`
  it('infers a generic description for an unknown layer name', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml':
        'project:\n  name: test\npaths:\n  widgetfactory: src/widgetfactory\n',
      '/project/src/widgetfactory/make.ts': '',
    });
    vi.mocked(renderTemplate).mockClear();

    await execute({ cwd: '/project' });

    const archCall = vi
      .mocked(renderTemplate)
      .mock.calls.find(([tpl]) => tpl === 'steering/architecture.md.hbs');
    expect(archCall).toBeDefined();
    const layers = (
      archCall![1] as { layers: Array<{ name: string; description: string }> }
    ).layers;
    const widget = layers.find((l) => l.name === 'widgetfactory');
    expect(widget).toBeDefined();
    // unknown name has no entry in the description map → generic fallback
    expect(widget!.description).toBe('widgetfactory layer');
  });

  // L245 then-side (known name) contrasted with the fallback above
  it('infers a known description for a recognized layer name', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml':
        'project:\n  name: test\npaths:\n  services: src/services\n',
      '/project/src/services/x.ts': '',
    });
    vi.mocked(renderTemplate).mockClear();

    await execute({ cwd: '/project' });

    const archCall = vi
      .mocked(renderTemplate)
      .mock.calls.find(([tpl]) => tpl === 'steering/architecture.md.hbs');
    const layers = (
      archCall![1] as { layers: Array<{ name: string; description: string }> }
    ).layers;
    const services = layers.find((l) => l.name === 'services');
    expect(services!.description).toBe('Business logic layer');
  });

  // L258 statement + if#0: countModuleFiles `base === '**'` → matches every file
  it("counts every scanned file for a module whose path glob is '**'", async () => {
    // Seed an existing module-map so detection returns these exact modules
    // verbatim, letting us craft a wildcard '**' path that hits the early-return.
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/prospec/ai-knowledge/module-map.yaml':
        'modules:\n' +
        '  - name: everything\n' +
        '    description: catch-all\n' +
        "    paths: ['**']\n" +
        '    keywords: []\n',
      '/project/src/a.ts': '',
      '/project/src/b.ts': '',
      '/project/src/c.ts': '',
    });

    const result = await execute({ cwd: '/project' });

    const everything = result.modules.find((m) => m.name === 'everything');
    expect(everything).toBeDefined();
    // '**' base matches all files → module file count equals the full scan count
    expect(everything!.fileCount).toBe(result.fileCount);
    expect(everything!.fileCount).toBeGreaterThan(0);
  });

  // L275 if#1: buildPathsFromModules skips a module with no paths
  it('omits a path-less module from the rewritten .prospec.yaml paths', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/prospec/ai-knowledge/module-map.yaml':
        'modules:\n' +
        '  - name: ghost\n' +
        '    description: no paths\n' +
        '    paths: []\n' +
        '    keywords: []\n' +
        '  - name: real\n' +
        '    description: has a path\n' +
        "    paths: ['src/real/**']\n" +
        '    keywords: []\n',
      '/project/src/real/impl.ts': '',
    });

    await execute({ cwd: '/project' });

    const written = fs.readFileSync('/project/.prospec.yaml', 'utf-8') as string;
    // module WITH paths becomes a paths entry
    expect(written).toContain('real:');
    // module WITHOUT paths is skipped — never written as a paths key
    expect(written).not.toContain('ghost:');
  });
});

describe('steering.service edge cases', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects no modules when the project has only root-level files', async () => {
    vol.reset();
    vol.fromJSON({ '/empty/.prospec.yaml': 'project:\n  name: empty\n' });

    const result = await execute({ cwd: '/empty' });

    // a root-level file (parts.length < 2) yields no module
    expect(result.moduleCount).toBe(0);
    expect(result.modules).toHaveLength(0);
    expect(result.architecture).toBe('unknown');
    // not dry-run → it still emits module-map + architecture + config
    expect(result.outputFiles).toContain('.prospec.yaml');
    expect(result.outputFiles).toHaveLength(3);
  });
});
