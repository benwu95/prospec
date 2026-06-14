import * as fs from 'node:fs';
import * as path from 'node:path';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { scanDir } from '../lib/scanner.js';
import { detectTechStack } from '../lib/detector.js';
import { detectModules, buildModuleMap } from '../lib/module-detector.js';
import { renderTemplate } from '../lib/template.js';
import { atomicWrite, ensureDir } from '../lib/fs-utils.js';
import { stringifyYaml } from '../lib/yaml-utils.js';
import { INDEX_TABLE_COLUMNS } from '../types/knowledge.js';

export interface KnowledgeInitOptions {
  dryRun?: boolean;
  depth?: number;
  cwd?: string;
}

export interface KnowledgeInitResult {
  totalFiles: number;
  scanDepth: number;
  entryPoints: string[];
  dependencies: Array<{ name: string; version?: string }>;
  configFiles: string[];
  outputFiles: string[];
  dryRun: boolean;
}

/**
 * Execute the knowledge init workflow:
 *
 * 1. Read config (.prospec.yaml must exist)
 * 2. Scan project files
 * 3. Detect tech stack
 * 4. Detect entry points
 * 5. Collect dependencies
 * 6. Collect config files
 * 7. Build directory tree
 * 8. Generate raw-scan.md (always overwrite)
 * 8b. Generate module-map.yaml (only if not exists)
 * 9. Generate _index.md skeleton (only if not exists)
 * 10. Generate _conventions.md skeleton (only if not exists)
 *
 * Rerun safety: raw-scan.md is always overwritten.
 * module-map.yaml, _index.md and _conventions.md are only created if they
 * don't exist (curated versions are preserved). modules/ is never touched.
 */
export async function execute(
  options: KnowledgeInitOptions,
): Promise<KnowledgeInitResult> {
  const cwd = options.cwd ?? process.cwd();
  const depth = options.depth ?? 10;
  const dryRun = options.dryRun ?? false;

  // 1. Read config
  const config = await readConfig(cwd);
  const excludePatterns = config.exclude ?? [];
  const { knowledgePath } = resolveBasePaths(config, cwd);
  const knowledgeBasePath = path.relative(cwd, knowledgePath);

  // 2. Scan project files
  const scanResult = await scanDir('**', {
    cwd,
    depth,
    exclude: excludePatterns,
  });

  // 2b. Detect modules (for module-map.yaml)
  const strategy = config.knowledge?.strategy ?? 'auto';
  const detection = detectModules(
    scanResult.files,
    cwd,
    strategy,
    knowledgeBasePath,
  );

  // 3. Detect tech stack (.prospec.yaml is authoritative; detection fills gaps)
  const techStack = detectTechStack(cwd, config.tech_stack);

  // 4. Detect entry points
  const entryPoints = detectEntryPoints(scanResult.files, cwd);

  // 5. Collect dependencies
  const dependencies = collectDependencies(cwd);

  // 6. Collect config files
  const configFiles = collectConfigFiles(scanResult.files);

  // 7. Build directory tree
  const directoryTree = buildDirectoryTree(scanResult.files, depth);

  // Build template context for raw-scan.md
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

  // Build template context for index.md skeleton
  const indexContext = {
    project_name: config.project.name,
    tech_stack: {
      language: techStack.language,
      framework: techStack.framework,
    },
    knowledge_base_path: knowledgeBasePath,
    index_table_columns: INDEX_TABLE_COLUMNS.join(' | '),
  };

  const outputFiles: string[] = [];

  if (!dryRun) {
    const knowledgeDir = path.join(cwd, knowledgeBasePath);
    await ensureDir(knowledgeDir);

    // 8. Generate raw-scan.md (always overwrite)
    const rawScanPath = path.join(knowledgeDir, 'raw-scan.md');
    const rawScanContent = renderTemplate(
      'knowledge/raw-scan.md.hbs',
      rawScanContext,
    );
    await atomicWrite(rawScanPath, rawScanContent);
    outputFiles.push(path.join(knowledgeBasePath, 'raw-scan.md'));

    // 8b. Generate module-map.yaml (only if not exists — preserve curated version)
    const moduleMapPath = path.join(knowledgeDir, 'module-map.yaml');
    if (!fileExistsSync(moduleMapPath)) {
      await atomicWrite(moduleMapPath, stringifyYaml(buildModuleMap(detection)));
      outputFiles.push(path.join(knowledgeBasePath, 'module-map.yaml'));
    }

    // 9. Generate _index.md skeleton (only if not exists)
    const indexPath = path.join(knowledgeDir, '_index.md');
    if (!fileExistsSync(indexPath)) {
      const indexContent = renderTemplate(
        'knowledge/index.md.hbs',
        indexContext,
      );
      await atomicWrite(indexPath, indexContent);
      outputFiles.push(path.join(knowledgeBasePath, '_index.md'));
    }

    // 10. Generate _conventions.md skeleton (only if not exists)
    const conventionsPath = path.join(knowledgeDir, '_conventions.md');
    if (!fileExistsSync(conventionsPath)) {
      const conventionsContent = generateConventionsSkeleton(
        config.project.name,
      );
      await atomicWrite(conventionsPath, conventionsContent);
      outputFiles.push(path.join(knowledgeBasePath, '_conventions.md'));
    }
  }

  return {
    totalFiles: scanResult.count,
    scanDepth: depth,
    entryPoints,
    dependencies,
    configFiles,
    outputFiles,
    dryRun,
  };
}

/**
 * Detect entry points from scanned files.
 */
function detectEntryPoints(files: string[], cwd: string): string[] {
  const entryPoints: string[] = [];

  // Check package.json for bin/main
  const pkgPath = path.join(cwd, 'package.json');
  if (fileExistsSync(pkgPath)) {
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

  // Common entry point patterns
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

  // package.json
  const pkgPath = path.join(cwd, 'package.json');
  if (fileExistsSync(pkgPath)) {
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

  // requirements.txt
  const reqPath = path.join(cwd, 'requirements.txt');
  if (fileExistsSync(reqPath)) {
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
 * Collect config files from scanned file list.
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
 * Build a directory tree representation from file paths.
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

/**
 * Generate a skeleton _conventions.md file.
 */
function generateConventionsSkeleton(projectName: string): string {
  return `# Coding Conventions

> Coding conventions and best practices for ${projectName}

<!-- prospec:auto-start -->
_Populated by \`/prospec-knowledge-generate\`._
<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- Add team-specific conventions, exception rules, etc. here -->
<!-- prospec:user-end -->
`;
}

/**
 * Synchronous file existence check.
 */
function fileExistsSync(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
