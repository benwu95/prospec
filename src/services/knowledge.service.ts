import * as fs from 'node:fs';
import * as path from 'node:path';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { scanDir, filterConventions, moduleScanPatterns } from '../lib/scanner.js';
import { renderTemplate } from '../lib/template.js';
import { mergeContent } from '../lib/content-merger.js';
import { deriveKeyExports } from '../lib/key-exports.js';
import { atomicWrite, ensureDir, readFileIfExists } from '../lib/fs-utils.js';
import { parseYaml } from '../lib/yaml-utils.js';
import { PrerequisiteError } from '../types/errors.js';
import type { ModuleMap } from '../types/module-map.js';
import { buildIndexTemplateContext } from '../lib/index-template.js';

export interface KnowledgeOptions {
  dryRun?: boolean;
  cwd?: string;
}

export interface GeneratedFile {
  path: string;
  action: 'created' | 'updated';
}

export interface KnowledgeResult {
  moduleCount: number;
  modules: Array<{
    name: string;
    description: string;
    fileCount: number;
    keywords: string[];
  }>;
  generatedFiles: GeneratedFile[];
  dryRun: boolean;
}

/**
 * Execute the knowledge generation workflow:
 *
 * 1. Read config (.prospec.yaml must exist)
 * 2. Read module-map.yaml (must exist — created by `prospec knowledge init`)
 * 3. Scan modules (respect .prospec.yaml exclude patterns, REQ-KNOW-007)
 * 4. Generate module README.md for each module (ContentMerger preserves user sections)
 * 5. Update index.md (Markdown table)
 * 6. Support --dry-run (preview without writing)
 */
export async function execute(
  options: KnowledgeOptions,
): Promise<KnowledgeResult> {
  const cwd = options.cwd ?? process.cwd();
  const dryRun = options.dryRun ?? false;

  // 1. Read config
  const config = await readConfig(cwd);
  const paths = resolveBasePaths(config, cwd);
  const { knowledgePath } = paths;
  const knowledgeBasePath = path.relative(cwd, knowledgePath).replace(/\\/g, '/');
  const excludePatterns = config.exclude ?? [];

  // 2. Read module-map.yaml
  const moduleMapPath = path.join(cwd, knowledgeBasePath, 'module-map.yaml');
  const moduleMap = readModuleMap(moduleMapPath);

  // 3. Scan each module's files
  const moduleInfos = await scanModules(moduleMap, excludePatterns, cwd);

  const generatedFiles: GeneratedFile[] = [];

  if (!dryRun) {
    // 4. Generate module README.md for each module
    for (const moduleInfo of moduleInfos) {
      const readmePath = path.join(
        cwd,
        knowledgeBasePath,
        'modules',
        moduleInfo.name,
        'README.md',
      );
      const action = await generateModuleReadme(moduleInfo, readmePath);
      generatedFiles.push({
        path: path.join(knowledgeBasePath, 'modules', moduleInfo.name, 'README.md'),
        action,
      });
    }

    // 5. Update index.md
    const baseDir = path.relative(cwd, paths.baseDir).replace(/\\/g, '/');
    const indexPath = path.join(paths.baseDir, 'index.md');
    const indexAction = await updateIndex(
      config.project.name,
      config.tech_stack,
      knowledgeBasePath,
      indexPath,
      cwd,
      config.knowledge?.additional_core_conventions ?? [],
      baseDir,
    );
    generatedFiles.push({
      path: path.join(baseDir, 'index.md'),
      action: indexAction,
    });
  }

  return {
    moduleCount: moduleInfos.length,
    modules: moduleInfos.map((m) => ({
      name: m.name,
      description: m.description,
      fileCount: m.keyFiles.length,
      keywords: m.keywords,
    })),
    generatedFiles,
    dryRun,
  };
}

/**
 * Read and validate module-map.yaml.
 * Throws PrerequisiteError if file doesn't exist.
 */
function readModuleMap(mapPath: string): ModuleMap {
  let raw: string;
  try {
    raw = fs.readFileSync(mapPath, 'utf-8');
  } catch {
    throw new PrerequisiteError(
      'module-map.yaml',
      'Run `prospec knowledge init` first to generate the module map',
    );
  }

  return parseYaml<ModuleMap>(raw, mapPath);
}

interface ModuleInfo {
  name: string;
  description: string;
  paths: string[];
  keywords: string[];
  relationships: {
    depends_on: string[];
    used_by: string[];
  };
  keyFiles: Array<{ path: string; description: string }>;
}

/**
 * Scan files for each module, respecting exclude patterns (REQ-KNOW-007).
 */
async function scanModules(
  moduleMap: ModuleMap,
  excludePatterns: string[],
  cwd: string,
): Promise<ModuleInfo[]> {
  const moduleInfos: ModuleInfo[] = [];

  for (const entry of moduleMap.modules) {
    const patterns =
      entry.paths.length > 0 ? moduleScanPatterns(entry.paths, cwd) : [`${entry.name}/**`];
    const scanResult = await scanDir(patterns, {
      cwd,
      exclude: excludePatterns,
    });

    const keyFiles = scanResult.files.slice(0, 20).map((filePath) => ({
      path: filePath,
      description: inferFileDescription(filePath),
    }));

    moduleInfos.push({
      name: entry.name,
      description: entry.description ?? `${entry.name} module`,
      paths: entry.paths,
      keywords: entry.keywords,
      relationships: {
        depends_on: entry.relationships?.depends_on ?? [],
        used_by: entry.relationships?.used_by ?? [],
      },
      keyFiles,
    });
  }

  return moduleInfos;
}

/**
 * Generate or update a module's README.md.
 * Uses ContentMerger to preserve user-written sections.
 */
async function generateModuleReadme(
  moduleInfo: ModuleInfo,
  readmePath: string,
): Promise<'created' | 'updated'> {
  await ensureDir(path.dirname(readmePath));

  // Render fresh content from template (Recipe-First format)
  const templateContext = {
    module_name: moduleInfo.name,
    description: moduleInfo.description,
    path: moduleInfo.paths[0] ?? moduleInfo.name,
    keywords: moduleInfo.keywords,
    relationships: moduleInfo.relationships,
    key_files: moduleInfo.keyFiles.slice(0, 10),
    key_exports: deriveKeyExports(moduleInfo.keyFiles),
  };

  const newContent = renderTemplate(
    'knowledge/module-readme.hbs',
    templateContext,
  );

  // Check if existing file has user content to preserve (read-or-empty;
  // non-ENOENT errors propagate).
  const existingContent = await readFileIfExists(readmePath);
  const action: 'created' | 'updated' = existingContent ? 'updated' : 'created';

  const finalContent = existingContent
    ? mergeContent(newContent, existingContent)
    : newContent;

  await atomicWrite(readmePath, finalContent);
  return action;
}

/**
 * Generate or update the index.md file.
 * Uses ContentMerger to preserve user-written sections.
 */
async function updateIndex(
  projectName: string,
  techStack: { language?: string; framework?: string; package_manager?: string } | undefined,
  knowledgeBasePath: string,
  indexPath: string,
  cwd: string,
  additionalCore: string[],
  baseDir: string,
): Promise<'created' | 'updated'> {
  await ensureDir(path.dirname(indexPath));

  const conventionScan = await scanDir('_*.md', { cwd: path.join(cwd, knowledgeBasePath) });
  const { core, demand } = filterConventions(conventionScan.files, additionalCore);

  const templateContext = buildIndexTemplateContext({
    projectName,
    techStack,
    baseDir,
    knowledgeBasePath,
    coreConventions: core,
    demandConventions: demand,
  });

  const newContent = renderTemplate(
    'knowledge/index.md.hbs',
    templateContext,
  );

  // Read-or-empty; non-ENOENT errors propagate.
  const existingContent = await readFileIfExists(indexPath);
  const action: 'created' | 'updated' = existingContent ? 'updated' : 'created';

  const finalContent = existingContent
    ? mergeContent(newContent, existingContent)
    : newContent;

  await atomicWrite(indexPath, finalContent);
  return action;
}

/**
 * Infer a brief description for a file based on its path and extension.
 */
function inferFileDescription(filePath: string): string {
  const basename = path.basename(filePath);
  const ext = path.extname(filePath);

  // Common patterns
  if (basename === 'index.ts' || basename === 'index.js') return 'Module entry point';
  if (basename.endsWith('.test.ts') || basename.endsWith('.spec.ts')) return 'Test file';
  if (basename.endsWith('.service.ts')) return 'Service implementation';
  if (basename.endsWith('.controller.ts')) return 'Controller implementation';
  if (basename.endsWith('.model.ts')) return 'Data model';
  if (basename.endsWith('.schema.ts')) return 'Schema definition';
  if (basename.endsWith('.dto.ts')) return 'Data transfer object';
  if (basename.endsWith('.middleware.ts')) return 'Middleware function';
  if (basename.endsWith('.guard.ts')) return 'Guard implementation';
  if (basename.endsWith('.pipe.ts')) return 'Pipe implementation';
  if (basename.endsWith('.config.ts')) return 'Configuration';
  if (basename.endsWith('.types.ts')) return 'Type definitions';
  if (basename.endsWith('.utils.ts')) return 'Utility functions';
  if (basename.endsWith('.hbs')) return 'Handlebars template';

  // Generic by extension
  const extDescriptions: Record<string, string> = {
    '.ts': 'TypeScript source',
    '.js': 'JavaScript source',
    '.tsx': 'React component',
    '.jsx': 'React component',
    '.vue': 'Vue component',
    '.py': 'Python source',
    '.go': 'Go source',
    '.rs': 'Rust source',
    '.md': 'Documentation',
    '.yaml': 'YAML configuration',
    '.yml': 'YAML configuration',
    '.json': 'JSON configuration',
    '.css': 'Stylesheet',
    '.scss': 'SCSS stylesheet',
    '.html': 'HTML template',
  };

  return extDescriptions[ext] ?? 'Source file';
}
