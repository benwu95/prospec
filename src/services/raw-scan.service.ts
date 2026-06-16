import * as fs from 'node:fs';
import * as path from 'node:path';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { scanDir } from '../lib/scanner.js';
import { detectTechStack, type TechStackResult } from '../lib/detector.js';
import { renderTemplate } from '../lib/template.js';
import { atomicWrite, ensureDir, fileExists } from '../lib/fs-utils.js';

export interface RawScanOptions {
  dryRun?: boolean;
  depth?: number;
  cwd?: string;
}

export interface RawScanResult {
  totalFiles: number;
  scanDepth: number;
  techStack: TechStackResult;
  entryPoints: string[];
  dependencies: Array<{ name: string; version?: string }>;
  configFiles: string[];
  /** raw-scan.md path written (relative to cwd), or null in dry-run. */
  outputFile: string | null;
  dryRun: boolean;
  /** All scanned files (relative to cwd) — for callers that need module detection. */
  files: string[];
}

/**
 * Deterministic, LLM-free production of `raw-scan.md` — the single shared scan
 * core used by `knowledge init`, `knowledge refresh`, and the archive safety net.
 *
 * Scans the project, derives tech stack / entry points / dependencies / config
 * files / directory tree, and (unless `dryRun`) renders + writes ONLY
 * `raw-scan.md`. It never touches curated files (module-map.yaml, _index.md,
 * _conventions.md) — that boundary is what makes a refresh safe to re-run.
 *
 * Returns the scanned `files` so callers (knowledge init) can reuse the single
 * scan for module detection instead of scanning twice.
 */
export async function generateRawScan(
  options: RawScanOptions,
): Promise<RawScanResult> {
  const cwd = options.cwd ?? process.cwd();
  const depth = options.depth ?? 10;
  const dryRun = options.dryRun ?? false;

  const config = await readConfig(cwd);
  const excludePatterns = config.exclude ?? [];
  const { knowledgePath } = resolveBasePaths(config, cwd);
  const knowledgeBasePath = path.relative(cwd, knowledgePath);

  const scanResult = await scanDir('**', {
    cwd,
    depth,
    exclude: excludePatterns,
  });

  const techStack = detectTechStack(cwd, config.tech_stack);
  const entryPoints = detectEntryPoints(scanResult.files, cwd);
  const dependencies = collectDependencies(cwd);
  const configFiles = collectConfigFiles(scanResult.files);
  const directoryTree = buildDirectoryTree(scanResult.files, depth);

  const rawScanContext = {
    project_name: config.project.name,
    tech_stack: {
      language: techStack.language,
      framework: techStack.framework,
      package_manager: techStack.package_manager,
      source: techStack.source,
    },
    entry_points: entryPoints,
    directory_tree: directoryTree,
    dependencies,
    config_files: configFiles,
    file_stats: {
      total_files: scanResult.count,
      scan_depth: depth,
    },
  };

  let outputFile: string | null = null;
  if (!dryRun) {
    const knowledgeDir = path.join(cwd, knowledgeBasePath);
    await ensureDir(knowledgeDir);
    const rawScanPath = path.join(knowledgeDir, 'raw-scan.md');
    const rawScanContent = renderTemplate(
      'knowledge/raw-scan.md.hbs',
      rawScanContext,
    );
    await atomicWrite(rawScanPath, rawScanContent);
    outputFile = path.join(knowledgeBasePath, 'raw-scan.md');
  }

  return {
    totalFiles: scanResult.count,
    scanDepth: depth,
    techStack,
    entryPoints,
    dependencies,
    configFiles,
    outputFile,
    dryRun,
    files: scanResult.files,
  };
}

/**
 * `prospec knowledge refresh` entry point — regenerate raw-scan.md only.
 * Thin delegate to the shared core, kept distinct so the command surface can
 * evolve independently of the init/archive call sites.
 */
export async function execute(options: RawScanOptions): Promise<RawScanResult> {
  return generateRawScan(options);
}

/**
 * Detect entry points from scanned files (package.json bin/main + common patterns).
 */
function detectEntryPoints(files: string[], cwd: string): string[] {
  const entryPoints: string[] = [];

  const pkgPath = path.join(cwd, 'package.json');
  if (fileExists(pkgPath)) {
    try {
      const raw = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(raw) as {
        main?: string;
        bin?: string | Record<string, string>;
        scripts?: Record<string, string>;
      };

      if (pkg.main) entryPoints.push(pkg.main);
      if (typeof pkg.bin === 'string') {
        entryPoints.push(pkg.bin);
      } else if (pkg.bin && typeof pkg.bin === 'object') {
        entryPoints.push(...Object.values(pkg.bin));
      }
    } catch {
      // Ignore parse errors
    }
  }

  const entryPatterns = [
    /^src\/index\.[tj]sx?$/,
    /^src\/main\.[tj]sx?$/,
    /^src\/app\.[tj]sx?$/,
    /^src\/cli\/index\.[tj]sx?$/,
    /^src\/server\.[tj]sx?$/,
    /^index\.[tj]sx?$/,
    /^main\.[tj]sx?$/,
    /^app\.[tj]sx?$/,
    /^server\.[tj]sx?$/,
  ];

  for (const file of files) {
    if (entryPatterns.some((p) => p.test(file)) && !entryPoints.includes(file)) {
      entryPoints.push(file);
    }
  }

  return [...new Set(entryPoints)];
}

/**
 * Collect dependencies from package.json, requirements.txt, or go.mod.
 */
function collectDependencies(
  cwd: string,
): Array<{ name: string; version?: string }> {
  const deps: Array<{ name: string; version?: string }> = [];

  const pkgPath = path.join(cwd, 'package.json');
  if (fileExists(pkgPath)) {
    try {
      const raw = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(raw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      if (pkg.dependencies) {
        for (const [name, version] of Object.entries(pkg.dependencies)) {
          deps.push({ name, version });
        }
      }
      if (pkg.devDependencies) {
        for (const [name, version] of Object.entries(pkg.devDependencies)) {
          deps.push({ name, version });
        }
      }
    } catch {
      // Ignore parse errors
    }
    return deps;
  }

  const reqPath = path.join(cwd, 'requirements.txt');
  if (fileExists(reqPath)) {
    try {
      const raw = fs.readFileSync(reqPath, 'utf-8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^([a-zA-Z0-9_.-]+)(?:[=<>!~]+(.+))?/);
        if (match) {
          deps.push({ name: match[1]!, version: match[2] });
        }
      }
    } catch {
      // Ignore read errors
    }
    return deps;
  }

  return deps;
}

/**
 * Collect config files from the scanned file list by basename pattern.
 */
function collectConfigFiles(files: string[]): string[] {
  const configPatterns = [
    /^\.prospec\.yaml$/,
    /^tsconfig(\.\w+)?\.json$/,
    /^package\.json$/,
    /^\.eslintrc/,
    /^eslint\.config/,
    /^\.prettierrc/,
    /^prettier\.config/,
    /^vitest\.config/,
    /^vite\.config/,
    /^next\.config/,
    /^nuxt\.config/,
    /^webpack\.config/,
    /^rollup\.config/,
    /^jest\.config/,
    /^\.babelrc/,
    /^babel\.config/,
    /^tailwind\.config/,
    /^postcss\.config/,
    /^docker-compose/,
    /^Dockerfile$/,
    /^\.dockerignore$/,
    /^\.gitignore$/,
    /^Makefile$/,
    /^pyproject\.toml$/,
    /^requirements\.txt$/,
    /^go\.mod$/,
    /^go\.sum$/,
    /^Cargo\.toml$/,
  ];

  return files.filter((f) => {
    const basename = path.basename(f);
    return configPatterns.some((p) => p.test(basename));
  });
}

/**
 * Build an indented directory-tree representation from file paths.
 */
function buildDirectoryTree(files: string[], maxDepth: number): string {
  const dirs = new Set<string>();

  for (const file of files) {
    const parts = file.split('/');
    const limit = Math.min(parts.length - 1, maxDepth);
    for (let i = 1; i <= limit; i++) {
      dirs.add(parts.slice(0, i).join('/') + '/');
    }
  }

  const sorted = [...dirs].sort();
  const lines: string[] = [];

  for (const dir of sorted) {
    const depthLevel = dir.split('/').length - 2;
    const name = dir.split('/').filter(Boolean).pop() ?? '';
    const indent = '  '.repeat(depthLevel);
    lines.push(`${indent}${name}/`);
  }

  return lines.join('\n');
}
