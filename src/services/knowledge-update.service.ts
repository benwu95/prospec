import * as fs from 'node:fs';
import * as path from 'node:path';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { scanDir } from '../lib/scanner.js';
import { renderTemplate } from '../lib/template.js';
import { mergeContent } from '../lib/content-merger.js';
import { deriveKeyExports } from '../lib/key-exports.js';
import { atomicWrite, ensureDir } from '../lib/fs-utils.js';
import { parseYaml, stringifyYaml } from '../lib/yaml-utils.js';
import { loadFeatureMap } from '../lib/knowledge-reader.js';
import type { ModuleMap } from '../types/module-map.js';
import type { FeatureMap } from '../types/feature-map.js';
import { INDEX_TABLE_HEADER, INDEX_TABLE_SEPARATOR, INDEX_TABLE_COLUMNS, INDEX_COLUMN } from '../types/knowledge.js';

// --- Interfaces (Task 5: REQ-SERVICES-023) ---

export interface KnowledgeUpdateOptions {
  /** Path to delta-spec.md (auto mode) */
  deltaSpecPath?: string;
  /** Manual module names to update (manual mode) */
  manualModules?: string[];
  /** Working directory */
  cwd?: string;
  /**
   * metadata.related_modules of the change — the reliable affected-module set
   * used to resolve feature-prefixed REQ ids (e.g. REQ-MCP-*) whose prefix is a
   * feature, not a module. Ignored for module-prefix REQ ids.
   */
  relatedModules?: string[];
}

export interface DeltaReqEntry {
  /** REQ ID (e.g., REQ-SERVICES-020) */
  id: string;
  /** Module name extracted from REQ ID (e.g., services) */
  module: string;
  /** Requirement title/description */
  description: string;
}

export interface DeltaSpecResult {
  added: DeltaReqEntry[];
  modified: DeltaReqEntry[];
  removed: DeltaReqEntry[];
  /**
   * REQ-shaped headings that fail the canonical `REQ-MODULE-NNN` form (a 3-digit
   * sequence, per delta-spec-format.md). Surfaced rather than silently dropped,
   * so a non-conforming id reported elsewhere is not invisibly skipped here.
   */
  malformed: string[];
}

export interface GeneratedFile {
  path: string;
  action: 'created' | 'updated' | 'deprecated';
}

export interface KnowledgeUpdateResult {
  /** Modules that were created (ADDED) */
  created: string[];
  /** Modules that were updated (MODIFIED) */
  updated: string[];
  /** Modules that were marked deprecated (REMOVED) */
  deprecated: string[];
  /** All generated/modified file paths */
  generatedFiles: GeneratedFile[];
  /** Non-fatal notices — e.g. non-canonical REQ ids skipped during parsing. */
  warnings: string[];
}

// --- Delta Spec Parser (Task 6: REQ-SERVICES-020) ---

/**
 * Parse delta-spec.md content into structured ADDED/MODIFIED/REMOVED entries.
 *
 * Extracts REQ IDs (REQ-{MODULE}-{NNN}) and maps them to module names.
 * Returns empty arrays for malformed or empty input (never throws).
 */
export function parseDeltaSpec(content: string): DeltaSpecResult {
  const result: DeltaSpecResult = { added: [], modified: [], removed: [], malformed: [] };

  if (!content || !content.trim()) {
    return result;
  }

  const lines = content.split('\n');
  let currentSection: 'added' | 'modified' | 'removed' | null = null;

  for (const line of lines) {
    // Detect section headers
    const sectionMatch = line.match(/^##\s+(ADDED|MODIFIED|REMOVED)/i);
    if (sectionMatch) {
      currentSection = sectionMatch[1]!.toLowerCase() as 'added' | 'modified' | 'removed';
      continue;
    }

    // Canonical REQ heading: ### REQ-{MODULE}-{NNN} with a 3-digit sequence.
    const reqMatch = line.match(/^###\s+(REQ-([\w-]+)-\d{3}):\s*(.*)/);
    if (reqMatch && currentSection) {
      result[currentSection].push({
        id: reqMatch[1]!,
        module: reqMatch[2]!.toLowerCase(),
        description: reqMatch[3]!.trim(),
      });
      continue;
    }

    // A REQ-shaped heading that is NOT canonical (wrong digit count, missing
    // module segment, …) is surfaced, not silently dropped — the looser parsers
    // in archive.service may route it, so this keeps the two sides honest.
    const malformedMatch = line.match(/^###\s+(REQ-[\w-]+):/);
    if (malformedMatch && currentSection) {
      result.malformed.push(malformedMatch[1]!);
    }
  }

  return result;
}

// --- Module README Update (Task 8: REQ-SERVICES-021) ---

/**
 * Scan module source and update its README.md.
 *
 * For new modules: creates directory and README.md.
 * For existing modules: merges auto sections, preserves user sections.
 */
export async function updateModuleReadme(
  moduleName: string,
  modulePaths: string[],
  options: { cwd: string; knowledgeBasePath: string; excludePatterns?: string[] },
): Promise<GeneratedFile> {
  const readmePath = path.join(
    options.cwd,
    options.knowledgeBasePath,
    'modules',
    moduleName,
    'README.md',
  );

  await ensureDir(path.dirname(readmePath));

  // Scan module files
  const patterns = modulePaths.length > 0 ? modulePaths : [`${moduleName}/**`];
  const scanResult = await scanDir(patterns, {
    cwd: options.cwd,
    exclude: options.excludePatterns ?? [],
  });

  const keyFiles = scanResult.files.slice(0, 20).map((filePath) => ({
    path: filePath,
    description: inferFileDescription(filePath),
  }));

  // Render fresh README content (Recipe-First format)
  const templateContext = {
    module_name: moduleName,
    description: `${moduleName} module`,
    path: modulePaths[0] ?? moduleName,
    keywords: [],
    relationships: { depends_on: [], used_by: [] },
    key_files: keyFiles.slice(0, 10),
    key_exports: deriveKeyExports(keyFiles),
  };

  const newContent = renderTemplate('steering/module-readme.hbs', templateContext);

  // Check for existing content to merge
  let existingContent = '';
  let action: GeneratedFile['action'] = 'created';
  try {
    existingContent = await fs.promises.readFile(readmePath, 'utf-8');
    action = 'updated';
  } catch {
    // File doesn't exist — will create
  }

  const finalContent = existingContent
    ? mergeContent(newContent, existingContent)
    : newContent;

  await atomicWrite(readmePath, finalContent);

  return {
    path: path.join(options.knowledgeBasePath, 'modules', moduleName, 'README.md'),
    action,
  };
}

// --- Mark Module Deprecated (Task 9: REQ-SERVICES-021) ---

/**
 * Add a deprecation banner to a module's README.md.
 * Does NOT delete the file — only marks as deprecated.
 */
export async function markModuleDeprecated(
  moduleName: string,
  reason: string,
  options: { cwd: string; knowledgeBasePath: string },
): Promise<GeneratedFile | null> {
  const readmePath = path.join(
    options.cwd,
    options.knowledgeBasePath,
    'modules',
    moduleName,
    'README.md',
  );

  // If README doesn't exist, nothing to deprecate
  try {
    await fs.promises.access(readmePath);
  } catch {
    return null;
  }

  const content = await fs.promises.readFile(readmePath, 'utf-8');

  // Don't add duplicate deprecation banners
  if (content.includes('> **DEPRECATED**')) {
    return { path: path.join(options.knowledgeBasePath, 'modules', moduleName, 'README.md'), action: 'deprecated' };
  }

  const banner = `> **DEPRECATED**: This module was removed. Reason: ${reason}\n\n`;
  const updatedContent = banner + content;

  await atomicWrite(readmePath, updatedContent);

  return {
    path: path.join(options.knowledgeBasePath, 'modules', moduleName, 'README.md'),
    action: 'deprecated',
  };
}

// --- Index Update (Task 10: REQ-SERVICES-022) ---

/**
 * Update _index.md module table within prospec:auto-start/end markers.
 */
export async function updateIndex(
  modules: Array<{ name: string; description: string; status: string }>,
  options: { cwd: string; knowledgeBasePath: string; projectName: string },
): Promise<GeneratedFile> {
  const indexPath = path.join(options.cwd, options.knowledgeBasePath, '_index.md');
  await ensureDir(path.dirname(indexPath));

  // Build new auto section content — header, separator, AND each row derive their
  // column count from the canonical schema (types/knowledge.ts), so adding or
  // reordering a column is a one-line edit there.
  const tableRows = modules
    .map((m) => {
      const cells = INDEX_TABLE_COLUMNS.map((_, i) =>
        i === INDEX_COLUMN.MODULE
          ? m.name
          : i === INDEX_COLUMN.STATUS
            ? m.status
            : i === INDEX_COLUMN.DESCRIPTION
              ? m.description
              : '—',
      );
      return `| ${cells.join(' | ')} |`;
    })
    .join('\n');

  // The auto block holds ONLY the module table. Everything around it (H1, the
  // intro, the `## Modules` heading, Project Info, How to Use, Conventions,
  // Loading Rules, any user notes) is curated static content that MUST survive
  // an incremental update.
  const autoBlock = `<!-- prospec:auto-start -->
${INDEX_TABLE_HEADER}
${INDEX_TABLE_SEPARATOR}
${tableRows}
<!-- prospec:auto-end -->`;

  // Read existing _index.md for in-place auto-block replacement
  let existingContent = '';
  let action: GeneratedFile['action'] = 'created';
  try {
    existingContent = await fs.promises.readFile(indexPath, 'utf-8');
    action = 'updated';
  } catch {
    // File doesn't exist — will create full index
  }

  const autoBlockRe = /<!-- prospec:auto-start -->[\s\S]*?<!-- prospec:auto-end -->/;

  let finalContent: string;
  if (existingContent && autoBlockRe.test(existingContent)) {
    // Replace ONLY the auto block in place; preserve all curated content.
    // Use a function replacer so `$`-sequences in module descriptions (the
    // table cells) are NOT interpreted as replacement patterns.
    finalContent = existingContent.replace(autoBlockRe, () => autoBlock);
  } else {
    // Create (or a marker-less file): emit the canonical document with the
    // `## Modules` heading and Project Info as static content around the block.
    finalContent = `# AI Knowledge Index

> This index helps AI Agents quickly understand the project structure.
> Read this file first, then load specific module READMEs as needed.

## Modules

${autoBlock}

## Project Info

- **Project**: ${options.projectName}
- **Knowledge Base**: \`${options.knowledgeBasePath}\`
`;
  }

  await atomicWrite(indexPath, finalContent);

  return {
    path: path.join(options.knowledgeBasePath, '_index.md'),
    action,
  };
}

// --- Module Map Update (Task 11: REQ-SERVICES-022) ---

/**
 * Update module-map.yaml: add new modules, remove deprecated ones.
 * Gracefully skips if module-map.yaml doesn't exist.
 */
export async function updateModuleMap(
  changes: { added: string[]; removed: string[] },
  moduleMapPath: string,
): Promise<GeneratedFile | null> {
  // Graceful skip if module-map.yaml doesn't exist
  try {
    await fs.promises.access(moduleMapPath);
  } catch {
    return null;
  }

  const content = await fs.promises.readFile(moduleMapPath, 'utf-8');
  const moduleMap = parseYaml<ModuleMap>(content, moduleMapPath);

  // Add new modules
  for (const name of changes.added) {
    const exists = moduleMap.modules.some(
      (m) => m.name.toLowerCase() === name.toLowerCase(),
    );
    if (!exists) {
      moduleMap.modules.push({
        name,
        description: `${name} module`,
        paths: [`src/${name}/**`],
        keywords: [name],
      });
    }
  }

  // Remove deprecated modules
  if (changes.removed.length > 0) {
    const removedSet = new Set(changes.removed.map((n) => n.toLowerCase()));
    moduleMap.modules = moduleMap.modules.filter(
      (m) => !removedSet.has(m.name.toLowerCase()),
    );
  }

  await atomicWrite(moduleMapPath, stringifyYaml(moduleMap));

  return {
    path: moduleMapPath,
    action: 'updated',
  };
}

// --- Execute Orchestrator (Task 12: REQ-SERVICES-023) ---

/**
 * Main knowledge-update execution flow.
 *
 * Supports two modes:
 * 1. deltaSpecPath: reads and parses delta-spec.md, identifies affected modules
 * 2. manualModules: accepts module name array, updates only those modules' READMEs
 */
export async function execute(
  options: KnowledgeUpdateOptions,
): Promise<KnowledgeUpdateResult> {
  const cwd = options.cwd ?? process.cwd();

  // Read config
  const config = await readConfig(cwd);
  const { knowledgePath } = resolveBasePaths(config, cwd);
  const knowledgeBasePath = path.relative(cwd, knowledgePath);
  const excludePatterns = config.exclude ?? [];
  const projectName = config.project.name;
  const moduleMapPath = path.join(knowledgePath, 'module-map.yaml');

  const result: KnowledgeUpdateResult = {
    created: [],
    updated: [],
    deprecated: [],
    generatedFiles: [],
    warnings: [],
  };

  const baseOpts = { cwd, knowledgeBasePath, excludePatterns };

  if (options.deltaSpecPath) {
    // --- Delta Spec Mode ---
    const deltaContent = await fs.promises.readFile(options.deltaSpecPath, 'utf-8');
    const delta = parseDeltaSpec(deltaContent);
    if (delta.malformed.length > 0) {
      result.warnings.push(
        `Skipped ${delta.malformed.length} non-canonical REQ id(s) ` +
          `(expected REQ-MODULE-NNN with a 3-digit sequence): ${delta.malformed.join(', ')}`,
      );
    }

    // Resolve module paths from module-map.yaml
    const modulePathMap = buildModulePathMap(moduleMapPath);
    const knownModules = collectKnownModules(modulePathMap, knowledgePath);
    const featureMap = loadFeatureMap(knowledgePath);
    const relatedModules = (options.relatedModules ?? []).map((m) => m.toLowerCase());

    // Map a delta REQ entry to the module(s) whose README it should sync.
    // A module-prefix REQ maps to that one module (legacy behavior, incl. the
    // src/<name>/** fallback for a genuinely new module). A feature-prefix REQ
    // (its prefix is a feature-map req_prefix, NOT a module — e.g. REQ-MCP) is
    // re-mapped to that feature's modules ∪ related_modules, intersected with
    // known modules — never minting a phantom modules/<prefix>/ (BL-043).
    const resolveEntryModules = (entry: DeltaReqEntry): string[] => {
      if (knownModules.has(entry.module)) return [entry.module];
      const featureModules = featurePrefixModules(featureMap, entry.module);
      if (featureModules === null) return [entry.module]; // a module name, not a feature prefix
      const resolved = [...new Set([...featureModules, ...relatedModules])].filter((m) =>
        knownModules.has(m),
      );
      if (resolved.length === 0) {
        result.warnings.push(
          `${entry.id}: "${entry.module}" is a feature prefix, not a module — set ` +
            `metadata.related_modules (or feature-map modules) so the change can sync ` +
            `(skipped; no module minted)`,
        );
      }
      return resolved;
    };

    // Removal wins: a module that is also REMOVED must not be created/updated
    // (its README would be regenerated then immediately deprecated, and it would
    // be falsely reported as both updated and deprecated).
    const removedModules = new Set(delta.removed.map((e) => e.module));
    const addedSynced = new Set<string>();

    // Process ADDED modules
    for (const entry of delta.added) {
      for (const mod of resolveEntryModules(entry)) {
        if (removedModules.has(mod)) continue;
        const paths = modulePathMap.get(mod) ?? [`src/${mod}/**`];
        const file = await updateModuleReadme(mod, paths, baseOpts);
        result.generatedFiles.push(file);
        if (file.action === 'created') {
          if (!result.created.includes(mod)) result.created.push(mod);
        } else if (!result.updated.includes(mod) && !result.created.includes(mod)) {
          result.updated.push(mod);
        }
        addedSynced.add(mod);
      }
    }

    // Process MODIFIED modules
    for (const entry of delta.modified) {
      for (const mod of resolveEntryModules(entry)) {
        if (removedModules.has(mod)) continue;
        const paths = modulePathMap.get(mod) ?? [`src/${mod}/**`];
        const file = await updateModuleReadme(mod, paths, baseOpts);
        result.generatedFiles.push(file);
        if (!result.updated.includes(mod) && !result.created.includes(mod)) {
          result.updated.push(mod);
        }
      }
    }

    // Process REMOVED modules — a feature-prefix REMOVED (e.g. REQ-MCP) is not a
    // module, so markModuleDeprecated no-ops on it (no modules/<prefix>/ README);
    // shared modules are never deprecated because one feature's REQ was removed.
    for (const entry of delta.removed) {
      const file = await markModuleDeprecated(
        entry.module,
        entry.description,
        { cwd, knowledgeBasePath },
      );
      if (file) {
        result.generatedFiles.push(file);
        result.deprecated.push(entry.module);
      }
    }

    // Update module-map.yaml — only modules actually synced (feature-prefix-resolved
    // modules are already known, so updateModuleMap no-ops on them; a genuinely new
    // module-prefix module is added as before).
    const uniqueAdded = [...addedSynced];
    const uniqueRemoved = [...new Set(delta.removed.map((e) => e.module))];
    if (uniqueAdded.length > 0 || uniqueRemoved.length > 0) {
      const mapFile = await updateModuleMap(
        { added: uniqueAdded, removed: uniqueRemoved },
        moduleMapPath,
      );
      if (mapFile) {
        result.generatedFiles.push(mapFile);
      }
    }
  } else if (options.manualModules && options.manualModules.length > 0) {
    // --- Manual Mode ---
    const modulePathMap = buildModulePathMap(moduleMapPath);

    for (const moduleName of options.manualModules) {
      const paths = modulePathMap.get(moduleName.toLowerCase()) ?? [`src/${moduleName}/**`];
      const file = await updateModuleReadme(moduleName, paths, baseOpts);
      result.generatedFiles.push(file);
      if (file.action === 'created') {
        result.created.push(moduleName);
      } else {
        result.updated.push(moduleName);
      }
    }
  }

  // Update _index.md with all known modules
  const allModules = collectAllModules(result, moduleMapPath);
  if (allModules.length > 0) {
    const indexFile = await updateIndex(allModules, {
      cwd,
      knowledgeBasePath,
      projectName,
    });
    result.generatedFiles.push(indexFile);
  }

  return result;
}

// --- Internal helpers ---

function buildModulePathMap(moduleMapPath: string): Map<string, string[]> {
  const pathMap = new Map<string, string[]>();
  try {
    const content = fs.readFileSync(moduleMapPath, 'utf-8');
    const moduleMap = parseYaml<ModuleMap>(content, moduleMapPath);
    for (const entry of moduleMap.modules) {
      pathMap.set(entry.name.toLowerCase(), entry.paths);
    }
  } catch {
    // module-map.yaml doesn't exist — return empty map
  }
  return pathMap;
}

/** Known modules = module-map names ∪ existing modules/<name>/ directories (lowercased). */
function collectKnownModules(
  modulePathMap: Map<string, string[]>,
  knowledgePath: string,
): Set<string> {
  const known = new Set<string>(modulePathMap.keys());
  try {
    for (const e of fs.readdirSync(path.join(knowledgePath, 'modules'), { withFileTypes: true })) {
      if (e.isDirectory()) known.add(e.name.toLowerCase());
    }
  } catch {
    // no modules/ directory yet — module-map keys are the known set
  }
  return known;
}

/**
 * Lowercased modules of every feature whose declared req_prefixes include this
 * prefix (case-insensitive). Returns null when the prefix is NOT any feature's
 * req_prefix — the caller then treats it as a module name, not a feature prefix.
 */
function featurePrefixModules(featureMap: FeatureMap | null, prefix: string): string[] | null {
  if (featureMap === null) return null;
  const want = prefix.toUpperCase();
  const modules = new Set<string>();
  let matched = false;
  for (const f of featureMap.features) {
    if ((f.req_prefixes ?? []).some((p) => p.toUpperCase() === want)) {
      matched = true;
      for (const m of f.modules) modules.add(m.toLowerCase());
    }
  }
  return matched ? [...modules] : null;
}

export function collectAllModules(
  result: KnowledgeUpdateResult,
  moduleMapPath: string,
): Array<{ name: string; description: string; status: string }> {
  const modules: Array<{ name: string; description: string; status: string }> = [];

  // result.deprecated holds lowercased delta-spec module names; module-map
  // entry.name is canonical-case. Compare case-insensitively (as updateModuleMap
  // and buildModulePathMap already do) so a mixed-case module isn't mislabeled.
  const deprecatedSet = new Set(result.deprecated.map((n) => n.toLowerCase()));

  // Try reading existing module-map for known modules
  try {
    const content = fs.readFileSync(moduleMapPath, 'utf-8');
    const moduleMap = parseYaml<ModuleMap>(content, moduleMapPath);
    for (const entry of moduleMap.modules) {
      const isDeprecated = deprecatedSet.has(entry.name.toLowerCase());
      modules.push({
        name: entry.name,
        description: entry.description ?? `${entry.name} module`,
        status: isDeprecated ? 'Deprecated' : 'Active',
      });
    }
  } catch {
    // Fallback: use result data only
    for (const name of [...result.created, ...result.updated]) {
      modules.push({ name, description: `${name} module`, status: 'Active' });
    }
    for (const name of result.deprecated) {
      modules.push({ name, description: `${name} module`, status: 'Deprecated' });
    }
  }

  return modules;
}

function inferFileDescription(filePath: string): string {
  const basename = path.basename(filePath);
  const ext = path.extname(filePath);

  if (basename === 'index.ts' || basename === 'index.js') return 'Module entry point';
  if (basename.endsWith('.test.ts') || basename.endsWith('.spec.ts')) return 'Test file';
  if (basename.endsWith('.service.ts')) return 'Service implementation';
  if (basename.endsWith('.controller.ts')) return 'Controller implementation';
  if (basename.endsWith('.types.ts')) return 'Type definitions';
  if (basename.endsWith('.utils.ts')) return 'Utility functions';
  if (basename.endsWith('.hbs')) return 'Handlebars template';

  const extDescriptions: Record<string, string> = {
    '.ts': 'TypeScript source',
    '.js': 'JavaScript source',
    '.md': 'Documentation',
    '.yaml': 'YAML configuration',
    '.yml': 'YAML configuration',
    '.json': 'JSON configuration',
  };

  return extDescriptions[ext] ?? 'Source file';
}
