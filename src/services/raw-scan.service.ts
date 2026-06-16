import * as fs from 'node:fs';
import * as path from 'node:path';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { scanDir } from '../lib/scanner.js';
import { detectTechStack, type TechStackResult } from '../lib/detector.js';
import {
  parsePyprojectDependencies,
  parseCargoDependencies,
  parseGoModDependencies,
  parseRequirementsTxt,
  parseComposerDependencies,
  parseMavenDependencies,
  parseCsprojDependencies,
  parsePyprojectEntryPoints,
  parseCargoEntryPoints,
  csprojIsExecutable,
  type ManifestDependency,
} from '../lib/manifest-parsers.js';
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

  const techStack = detectTechStack(cwd, config.tech_stack, scanResult.files);
  const entryPoints = detectEntryPoints(scanResult.files, cwd);
  const dependencies = collectDependencies(cwd, scanResult.files);
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

  // Manifest-derived entry points for backend ecosystems.
  const pyproject = path.join(cwd, 'pyproject.toml');
  if (fileExists(pyproject)) {
    entryPoints.push(...parsePyprojectEntryPoints(readFileSafe(pyproject)));
  }
  const cargo = path.join(cwd, 'Cargo.toml');
  if (fileExists(cargo)) {
    entryPoints.push(...parseCargoEntryPoints(readFileSafe(cargo)));
  }
  const csproj = findManifestPath(files, (f) => f.endsWith('.csproj'));
  if (csproj && csprojIsExecutable(readFileSafe(path.join(cwd, csproj)))) {
    entryPoints.push(csproj);
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
    // Go
    /^main\.go$/,
    /^cmd\/[^/]+\/main\.go$/,
    // Rust
    /^src\/main\.rs$/,
    /^src\/bin\/[^/]+\.rs$/,
    // Python
    /(^|\/)__main__\.py$/,
    /^(src\/)?main\.py$/,
    /^(src\/)?app\.py$/,
    /^manage\.py$/,
    // Java (filename heuristic)
    /(^|\/)(Application|Main|App)\.java$/,
  ];
  // Ruby executables are conventional only when a Gemfile is present — gating
  // avoids treating a Node project's bin/ scripts as Ruby entry points.
  if (fileExists(path.join(cwd, 'Gemfile'))) {
    entryPatterns.push(/^(bin|exe)\/[^/.]+$/);
  }

  for (const file of files) {
    if (entryPatterns.some((p) => p.test(file)) && !entryPoints.includes(file)) {
      entryPoints.push(file);
    }
  }

  return [...new Set(entryPoints)];
}

function readFileSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * First file matching `predicate`, preferring the shallowest path then
 * codepoint order — a deterministic root-most pick for manifests (pom.xml,
 * *.csproj) that may live in a subdirectory.
 */
function findManifestPath(
  files: string[],
  predicate: (file: string) => boolean,
): string | undefined {
  const matches = files.filter(predicate);
  if (matches.length === 0) return undefined;
  return matches.sort((a, b) => {
    const depthDiff = a.split('/').length - b.split('/').length;
    if (depthDiff !== 0) return depthDiff;
    return a < b ? -1 : a > b ? 1 : 0;
  })[0];
}

/**
 * Collect direct dependencies from the project's primary manifest. Ecosystems
 * are tried in a fixed precedence (Node → Python → Go → Rust → Maven → .NET →
 * PHP) so a polyglot tree reports its primary language's dependencies, aligned
 * with `detectTechStack`. Per-format parsing is delegated to the deterministic
 * `lib/manifest-parsers` helpers, which return [] on malformed input rather
 * than throwing.
 */
function collectDependencies(
  cwd: string,
  files: string[],
): ManifestDependency[] {
  // Node
  const pkgPath = path.join(cwd, 'package.json');
  if (fileExists(pkgPath)) {
    const deps: ManifestDependency[] = [];
    try {
      const pkg = JSON.parse(readFileSafe(pkgPath)) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
        deps.push({ name, version });
      }
      for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
        deps.push({ name, version });
      }
    } catch {
      // Ignore parse errors
    }
    return deps;
  }

  // Python — pyproject.toml preferred, requirements.txt as fallback
  const pyproject = path.join(cwd, 'pyproject.toml');
  if (fileExists(pyproject)) {
    const deps = parsePyprojectDependencies(readFileSafe(pyproject));
    if (deps.length > 0) return deps;
  }
  const reqPath = path.join(cwd, 'requirements.txt');
  if (fileExists(reqPath)) {
    return parseRequirementsTxt(readFileSafe(reqPath));
  }
  if (fileExists(pyproject)) return []; // Python project with no declared deps

  // Go
  const goMod = path.join(cwd, 'go.mod');
  if (fileExists(goMod)) return parseGoModDependencies(readFileSafe(goMod));

  // Rust
  const cargo = path.join(cwd, 'Cargo.toml');
  if (fileExists(cargo)) return parseCargoDependencies(readFileSafe(cargo));

  // Java (Maven only — Gradle's Groovy/Kotlin DSL is not statically parsed)
  const pom = findManifestPath(files, (f) => path.basename(f) === 'pom.xml');
  if (pom) return parseMavenDependencies(readFileSafe(path.join(cwd, pom)));

  // .NET
  const csproj = findManifestPath(files, (f) => f.endsWith('.csproj'));
  if (csproj) {
    return parseCsprojDependencies(readFileSafe(path.join(cwd, csproj)));
  }

  // Ruby — Gemfile is a Ruby DSL with no parseable manifest; short-circuit so
  // the Dependencies section stays consistent with detectTechStack, which ranks
  // Ruby above a co-present composer.json.
  if (fileExists(path.join(cwd, 'Gemfile'))) return [];

  // PHP
  const composer = path.join(cwd, 'composer.json');
  if (fileExists(composer)) {
    return parseComposerDependencies(readFileSafe(composer));
  }

  return [];
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
    /^pom\.xml$/,
    /^build\.gradle(\.kts)?$/,
    /\.csproj$/,
    /^Gemfile$/,
    /^Gemfile\.lock$/,
    /^composer\.json$/,
    /^composer\.lock$/,
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
