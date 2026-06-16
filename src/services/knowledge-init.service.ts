import * as path from 'node:path';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { detectModules, buildModuleMap } from '../lib/module-detector.js';
import { renderTemplate } from '../lib/template.js';
import { atomicWrite, ensureDir, fileExists } from '../lib/fs-utils.js';
import { stringifyYaml } from '../lib/yaml-utils.js';
import { INDEX_TABLE_COLUMNS } from '../types/knowledge.js';
import { generateRawScan } from './raw-scan.service.js';

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
 * Execute the knowledge init workflow (first-time scaffolding):
 *
 * 1. Generate raw-scan.md via the shared `generateRawScan()` core (always
 *    overwritten unless dry-run).
 * 2. Detect modules from the SAME scan and write module-map.yaml — only if absent.
 * 3. Write _index.md and _conventions.md skeletons — only if absent.
 *
 * Rerun safety: raw-scan.md is always overwritten; module-map.yaml, _index.md
 * and _conventions.md are only created if they don't exist (curated versions are
 * preserved). modules/ is never touched.
 *
 * The deterministic scan/render of raw-scan.md is shared with
 * `prospec knowledge refresh` (raw-scan.service) — init layers module-map and
 * skeleton scaffolding on top of that core.
 */
export async function execute(
  options: KnowledgeInitOptions,
): Promise<KnowledgeInitResult> {
  const cwd = options.cwd ?? process.cwd();
  const depth = options.depth ?? 10;
  const dryRun = options.dryRun ?? false;

  const config = await readConfig(cwd);
  const { knowledgePath } = resolveBasePaths(config, cwd);
  const knowledgeBasePath = path.relative(cwd, knowledgePath);

  // 1. Raw scan + raw-scan.md (shared core; writes raw-scan.md unless dry-run)
  const rawScan = await generateRawScan({ cwd, depth, dryRun });

  // 2. Detect modules from the same scan (no second scan) — for module-map.yaml
  const strategy = config.knowledge?.strategy ?? 'auto';
  const detection = detectModules(
    rawScan.files,
    cwd,
    strategy,
    knowledgeBasePath,
  );

  const indexContext = {
    project_name: config.project.name,
    tech_stack: {
      language: rawScan.techStack.language,
      framework: rawScan.techStack.framework,
    },
    knowledge_base_path: knowledgeBasePath,
    index_table_columns: INDEX_TABLE_COLUMNS.join(' | '),
  };

  const outputFiles: string[] = [];

  if (!dryRun) {
    const knowledgeDir = path.join(cwd, knowledgeBasePath);
    await ensureDir(knowledgeDir);

    // raw-scan.md was already written by generateRawScan
    if (rawScan.outputFile) {
      outputFiles.push(rawScan.outputFile);
    }

    // module-map.yaml (only if not exists — preserve curated version)
    const moduleMapPath = path.join(knowledgeDir, 'module-map.yaml');
    if (!fileExists(moduleMapPath)) {
      await atomicWrite(moduleMapPath, stringifyYaml(buildModuleMap(detection)));
      outputFiles.push(path.join(knowledgeBasePath, 'module-map.yaml'));
    }

    // _index.md skeleton (only if not exists)
    const indexPath = path.join(knowledgeDir, '_index.md');
    if (!fileExists(indexPath)) {
      const indexContent = renderTemplate('knowledge/index.md.hbs', indexContext);
      await atomicWrite(indexPath, indexContent);
      outputFiles.push(path.join(knowledgeBasePath, '_index.md'));
    }

    // _conventions.md skeleton (only if not exists)
    const conventionsPath = path.join(knowledgeDir, '_conventions.md');
    if (!fileExists(conventionsPath)) {
      const conventionsContent = generateConventionsSkeleton(
        config.project.name,
      );
      await atomicWrite(conventionsPath, conventionsContent);
      outputFiles.push(path.join(knowledgeBasePath, '_conventions.md'));
    }
  }

  return {
    totalFiles: rawScan.totalFiles,
    scanDepth: rawScan.scanDepth,
    entryPoints: rawScan.entryPoints,
    dependencies: rawScan.dependencies,
    configFiles: rawScan.configFiles,
    outputFiles,
    dryRun,
  };
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
