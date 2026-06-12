import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parseYaml } from './yaml-utils.js';
import { ModuleDetectionError } from '../types/errors.js';
import { ModuleMapSchema, type ModuleMap } from '../types/module-map.js';
import type { SearchModulesResult, SearchMatchField } from '../types/mcp.js';

/**
 * Knowledge content read layer (REQ-MCP-006) — whole-document reads for the
 * MCP server, kept separate from the drift fact extractors in
 * drift-sources.ts. Every function re-reads from disk on call; callers must
 * not cache (REQ-MCP-002 per-request semantics).
 *
 * The archived-spec exclusion below is the single source shared with
 * drift-sources.ts so the MCP spec listing and `prospec check` can never
 * drift apart (REQ-MCP-003).
 */

/** Archived spec material is historical — excluded from listings and checks. */
export const ARCHIVED_PREFIX = '_archived';

// Both the `_archived-…` directory convention and flat `_archived….md` files.
export const ARCHIVED_EXCLUDES = ['**/_archived*', '**/_archived*/**'];

export function isArchivedSpec(filename: string): boolean {
  return path.basename(filename).startsWith(ARCHIVED_PREFIX);
}

/**
 * Resource name guard — a module/spec name must never traverse paths.
 * Rejects separators, `..`, and hidden/empty names (REQ-MCP-002 AC4).
 */
export function isSafeResourceName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && !name.includes('..');
}

// --- Content reads (null = not found; callers map to MCP errors) ---

export function readIndex(knowledgePath: string): string | null {
  return readTextIfExists(path.join(knowledgePath, '_index.md'), knowledgePath);
}

export function readPlaybook(knowledgePath: string): string | null {
  return readTextIfExists(path.join(knowledgePath, '_playbook.md'), knowledgePath);
}

export function readModuleMapRaw(knowledgePath: string): string | null {
  return readTextIfExists(path.join(knowledgePath, 'module-map.yaml'), knowledgePath);
}

export function readModuleReadme(knowledgePath: string, moduleName: string): string | null {
  if (!isSafeResourceName(moduleName)) return null;
  return readTextIfExists(path.join(knowledgePath, 'modules', moduleName, 'README.md'), knowledgePath);
}

/** List active (non-archived) feature spec names, without the .md extension. */
export function listFeatureSpecs(featuresDir: string): string[] {
  if (!existsSync(featuresDir)) return [];
  return readdirSync(featuresDir)
    .filter((f) => f.endsWith('.md') && !isArchivedSpec(f))
    .map((f) => f.slice(0, -'.md'.length))
    .sort();
}

export function readFeatureSpec(featuresDir: string, name: string): string | null {
  if (!isSafeResourceName(name)) return null;
  const filename = `${name}.md`;
  if (isArchivedSpec(filename)) return null;
  return readTextIfExists(path.join(featuresDir, filename), featuresDir);
}

// --- module-map load + clamp (moved verbatim from check.service.ts) ---

export function loadModuleMap(knowledgePath: string, cwd: string): ModuleMap | null {
  // same containment as readModuleMapRaw — a map symlinked outside the root
  // degrades to "missing" on EVERY surface (raw read, listing, health,
  // dependency answers); split paths here once served contradicting truths
  const raw = readTextIfExists(path.join(knowledgePath, 'module-map.yaml'), knowledgePath);
  if (raw === null) return null;
  const parsed = ModuleMapSchema.safeParse(parseYaml(raw));
  if (!parsed.success) {
    // fail loudly — silently swapping a present-but-broken map for the
    // constitution fallback would check against the wrong ruleset
    throw new ModuleDetectionError(
      `module-map.yaml is invalid: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return clampModulePaths(parsed.data, cwd);
}

/** Drop module paths that escape the repo — they must never drive scanning or reads. */
export function clampModulePaths(moduleMap: ModuleMap, cwd: string): ModuleMap {
  return {
    modules: moduleMap.modules.map((m) => ({
      ...m,
      paths: m.paths.filter((p) => {
        const rel = path.relative(cwd, path.resolve(cwd, p));
        return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
      }),
    })),
  };
}

// --- _index.md module table parsing + search (REQ-MCP-005) ---

export interface IndexModule {
  name: string;
  keywords: string[];
  aliases: string[];
  description: string;
}

/**
 * Parse the module table inside the prospec:auto block of _index.md.
 * Column positions are resolved from the header row, so reordering columns
 * in the template does not silently break the search fields.
 */
export function parseIndexModules(indexContent: string): IndexModule[] {
  const auto = sliceAutoBlock(indexContent);
  const rows = auto
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .map((line) =>
      line
        .replace(/^\s*\|/, '')
        .replace(/\|\s*$/, '')
        .split('|')
        .map((cell) => cell.trim()),
    );
  const header = rows.find((cells) => cells.some((c) => /^module$/i.test(c)));
  if (header === undefined) return [];
  const col = (label: string): number => header.findIndex((c) => c.toLowerCase() === label);
  const nameCol = col('module');
  const keywordsCol = col('keywords');
  const aliasesCol = col('aliases');
  const descriptionCol = col('description');
  const modules: IndexModule[] = [];
  for (const cells of rows) {
    const raw = cells[nameCol] ?? '';
    const name = raw.replace(/\*\*/g, '').trim();
    if (raw === '' || name === '' || /^module$/i.test(name) || /^[-: ]+$/.test(name)) continue;
    modules.push({
      name,
      keywords: splitList(cells[keywordsCol]),
      aliases: splitList(cells[aliasesCol]),
      description: cells[descriptionCol] ?? '',
    });
  }
  return modules;
}

const FIELD_WEIGHTS: Record<SearchMatchField, number> = { name: 3, keywords: 2, aliases: 1 };

/**
 * Deterministic module search — normalized term-OR matching with weighted
 * field ranking. `-`, `_` and whitespace are equivalent separators, so
 * `drift checker` and `drift-checker` are the same query. Ties break on
 * codepoint order of the module name (never locale-dependent) so the same
 * input is byte-identical across environments.
 */
export function searchModules(query: string, modules: IndexModule[]): SearchModulesResult {
  const terms = normalizeSearchText(query).split(' ').filter(Boolean);
  if (terms.length === 0) return emptySearchResult();

  const ranked: Array<{
    module: string;
    matched_field: SearchMatchField;
    description: string;
    weight: number;
    hits: number;
  }> = [];

  for (const m of modules) {
    const fields: Record<SearchMatchField, string> = {
      name: normalizeSearchText(m.name),
      keywords: normalizeSearchText(m.keywords.join(' ')),
      aliases: normalizeSearchText(m.aliases.join(' ')),
    };
    let best: { field: SearchMatchField; weight: number } | null = null;
    // distinct matched query terms — a term hitting several fields counts
    // once, or the secondary sort key would diverge from REQ-MCP-005's
    // 命中 term 數 (count of matched terms, not field hits)
    const matchedTerms = new Set<string>();
    for (const field of Object.keys(FIELD_WEIGHTS) as SearchMatchField[]) {
      const matched = terms.filter((t) => fields[field].includes(t));
      if (matched.length === 0) continue;
      for (const t of matched) matchedTerms.add(t);
      if (best === null || FIELD_WEIGHTS[field] > best.weight) {
        best = { field, weight: FIELD_WEIGHTS[field] };
      }
    }
    if (best !== null) {
      ranked.push({
        module: m.name,
        matched_field: best.field,
        description: m.description,
        weight: best.weight,
        hits: matchedTerms.size,
      });
    }
  }

  ranked.sort(
    (a, b) =>
      b.weight - a.weight || b.hits - a.hits || (a.module < b.module ? -1 : a.module > b.module ? 1 : 0),
  );

  if (ranked.length === 0) return emptySearchResult();
  return { matches: ranked.map(({ module, matched_field, description }) => ({ module, matched_field, description })) };
}

export function normalizeSearchText(text: string): string {
  return text.toLowerCase().replace(/[-_\s]+/g, ' ').trim();
}

function emptySearchResult(): SearchModulesResult {
  return {
    matches: [],
    suggestion: 'No modules matched — read knowledge://index to browse all modules',
  };
}

function sliceAutoBlock(content: string): string {
  const start = content.indexOf('<!-- prospec:auto-start -->');
  const end = content.indexOf('<!-- prospec:auto-end -->');
  if (start === -1 || end === -1 || end < start) return content;
  return content.slice(start, end);
}

function splitList(cell: string | undefined): string[] {
  if (cell === undefined || cell === '') return [];
  return cell
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Read a file only if its real path stays under the real root — a committed
 * symlink pointing outside the served tree must read as not-found, never as
 * content (same threat model as clampModulePaths: nothing in the knowledge
 * or spec tree may become an oracle for files outside it).
 */
function readTextIfExists(filePath: string, root: string): string | null {
  if (!existsSync(filePath)) return null;
  const real = realpathSync(filePath);
  const rel = path.relative(realpathSync(root), real);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return readFileSync(real, 'utf-8');
}
