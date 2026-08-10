import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parseYaml } from './yaml-utils.js';
import { ModuleDetectionError } from '../types/errors.js';
import { ModuleMapSchema, type ModuleMap } from '../types/module-map.js';
import { FeatureMapSchema, type FeatureMap } from '../types/feature-map.js';
import type { SearchModulesResult, SearchMatchField } from '../types/mcp.js';
import { INDEX_TABLE_COLUMNS, INDEX_COLUMN } from '../types/knowledge.js';
import { estimateTokens } from './token-accounting.js';
import { parseSpecSlices, type SpecContent } from './spec-headings.js';

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

/** A contained read's outcome — the reason is what separates the three nulls. */
export type ContainedRead =
  | { ok: true; text: string }
  | { ok: false; reason: 'absent' | 'escaped' | 'unreadable' };

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

/**
 * The bare value of a rendered `index.md` table cell.
 *
 * The Module column is emphasized for display (`**types**`), but the module
 * NAME is the undecorated text — every consumer resolves it against
 * `module-map.yaml` or a module directory, so decoration silently targets a
 * module that does not exist. Single source for both consumers of that column
 * (`parseIndexModules` here and `matchRelatedModules` in change-story): two
 * copies with different character sets would disagree on a module's identity.
 * Kept in step with `BareModuleNameSchema`, which rejects what this strips.
 */
export function stripCellEmphasis(cell: string): string {
  return cell.replace(/[*`~]/g, '').trim();
}

// --- Content reads (null = not found; callers map to MCP errors) ---

/**
 * Read the root index at `<baseDir>/index.md`. Takes the resolved base dir
 * (resolveBasePaths().baseDir) — NOT the knowledge path — so the read side can
 * never disagree with the services that write the index when `knowledge.base_path`
 * is not a direct child of `paths.base_dir`.
 */
export function readIndex(baseDir: string): string | null {
  return readContainedText(path.join(baseDir, 'index.md'), baseDir);
}

export function readPlaybook(knowledgePath: string): string | null {
  return readContainedText(path.join(knowledgePath, '_playbook.md'), knowledgePath);
}

export function readModuleMapRaw(knowledgePath: string): string | null {
  return readContainedText(path.join(knowledgePath, 'module-map.yaml'), knowledgePath);
}

// Raw text, like readModuleMapRaw — the MCP feature-map resource serves the file
// verbatim; parsing/validation lives in loadFeatureMap (the governance path), not here.
export function readFeatureMapRaw(knowledgePath: string): string | null {
  return readContainedText(path.join(knowledgePath, 'feature-map.yaml'), knowledgePath);
}

export function readModuleReadme(knowledgePath: string, moduleName: string): string | null {
  if (!isSafeResourceName(moduleName)) return null;
  return readContainedText(path.join(knowledgePath, 'modules', moduleName, 'README.md'), knowledgePath);
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
  return readContainedText(path.join(featuresDir, filename), featuresDir);
}

export function loadFeatureSpecContent(featuresDir: string, feature: string): { specContent: SpecContent; mainFile: string } | null {
  const main = readFeatureSpec(featuresDir, feature);
  if (main === null) return null;
  const mainFile = path.join(featuresDir, `${feature}.md`);
  const slicesList = parseSpecSlices(main);
  if (slicesList.length === 0) {
    return { specContent: main, mainFile };
  }
  const slices: Record<string, string> = {};
  for (const sliceName of slicesList) {
    const resolvedSlice = path.join(featuresDir, feature, `${sliceName}.md`);
    const sliceContent = readContainedText(resolvedSlice, featuresDir);
    if (sliceContent !== null) {
      slices[sliceName] = sliceContent;
    }
  }
  return { specContent: { main, slices }, mainFile };
}

// Product spec — the PRD entry point at specs/product.md (root is specsPath, the
// parent of featuresDir). Whole-document read like readPlaybook; realpath-contained.
export function readProduct(specsPath: string): string | null {
  return readContainedText(path.join(specsPath, 'product.md'), specsPath);
}

// --- module-map load + clamp (moved verbatim from check.service.ts) ---

export function loadModuleMap(knowledgePath: string, cwd: string): ModuleMap | null {
  // same containment as readModuleMapRaw — a map symlinked outside the root
  // degrades to "missing" on EVERY surface (raw read, listing, health,
  // dependency answers); split paths here once served contradicting truths
  const read = readContained(path.join(knowledgePath, 'module-map.yaml'), knowledgePath);
  // A map that is THERE but unreadable must not read as "no map": the fallback
  // ruleset would silently take over and dependency-direction would be judged
  // against the wrong rules — the same failure the schema check fails loudly on.
  if (!read.ok && read.reason === 'unreadable') {
    throw new ModuleDetectionError(
      'module-map.yaml exists but cannot be read (a directory in its place, revoked permissions, or too large) — fix the file rather than letting the Constitution fallback ruleset take over',
    );
  }
  if (!read.ok) return null;
  const parsed = ModuleMapSchema.safeParse(parseYaml(read.text));
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

/**
 * Load feature-map.yaml — the feature→module index. Returns null when absent
 * (the two governance drift checks then skip — never a false positive). A
 * present-but-invalid map fails loud (same contract as loadModuleMap), so the
 * checks never run against a half-parsed index. Entries whose `feature` slug is
 * not a safe resource name are dropped — the slug is compared against on-disk
 * feature specs, so a traversal-shaped name must never reach that comparison.
 */
export function loadFeatureMap(knowledgePath: string): FeatureMap | null {
  const read = readContained(path.join(knowledgePath, 'feature-map.yaml'), knowledgePath);
  // Same rule as loadModuleMap: absent → the governance checks skip; present but
  // unreadable → loud, so a broken index never reads as "no index".
  if (!read.ok && read.reason === 'unreadable') {
    throw new ModuleDetectionError(
      'feature-map.yaml exists but cannot be read (a directory in its place, revoked permissions, or too large) — fix the file rather than letting the governance checks skip',
    );
  }
  if (!read.ok) return null;
  const parsed = FeatureMapSchema.safeParse(parseYaml(read.text));
  if (!parsed.success) {
    throw new ModuleDetectionError(
      `feature-map.yaml is invalid: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return {
    features: parsed.data.features
      .filter((f) => isSafeResourceName(f.feature))
      // module names are compared against on-disk module dirs and (in knowledge-update)
      // drive README writes — drop any traversal-shaped name at the load boundary, the
      // same guard already applied to the feature slug above.
      .map((f) => ({ ...f, modules: f.modules.filter((m) => isSafeResourceName(m)) })),
  };
}

// --- index.md module table parsing + search (REQ-MCP-005) ---

export interface IndexModule {
  name: string;
  keywords: string[];
  aliases: string[];
  description: string;
  rationale: string;
  dependsOn: string[];
}

/**
 * Parse the module table inside the prospec:auto block of index.md.
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
  // Resolve column positions by the canonical labels (single source: types/knowledge.ts),
  // looked up in the header row so column reordering stays safe.
  const col = (label: string): number =>
    header.findIndex((c) => c.toLowerCase() === label.toLowerCase());
  const nameCol = col(INDEX_TABLE_COLUMNS[INDEX_COLUMN.MODULE]);
  const keywordsCol = col(INDEX_TABLE_COLUMNS[INDEX_COLUMN.KEYWORDS]);
  const aliasesCol = col(INDEX_TABLE_COLUMNS[INDEX_COLUMN.ALIASES]);
  const descriptionCol = col(INDEX_TABLE_COLUMNS[INDEX_COLUMN.DESCRIPTION]);
  const rationaleCol = col(INDEX_TABLE_COLUMNS[INDEX_COLUMN.RATIONALE]);
  const dependsOnCol = col(INDEX_TABLE_COLUMNS[INDEX_COLUMN.DEPENDS_ON]);
  const modules: IndexModule[] = [];
  for (const cells of rows) {
    const raw = cells[nameCol] ?? '';
    const name = stripCellEmphasis(raw);
    if (raw === '' || name === '' || /^module$/i.test(name) || /^[-: ]+$/.test(name)) continue;
    modules.push({
      name,
      keywords: splitList(cells[keywordsCol]),
      aliases: splitList(cells[aliasesCol]),
      description: cells[descriptionCol] ?? '',
      rationale: cells[rationaleCol] ?? '',
      dependsOn: splitList(cells[dependsOnCol]),
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
  return {
    matches: ranked.map(({ module, matched_field, description }) => ({
      module,
      matched_field,
      description,
      category: [] as string[],
    })),
  };
}

/**
 * Attach each match's ordered category list from module-map.yaml — the single
 * source of truth. searchModules ranks over name/keywords/aliases only; category
 * never affects ranking, it is joined here after the fact. A missing map, an
 * unmatched module name, or an unset category all yield [].
 */
export function attachModuleCategories(
  result: SearchModulesResult,
  moduleMap: ModuleMap | null,
): SearchModulesResult {
  if (moduleMap === null) return result;
  const byName = new Map(moduleMap.modules.map((m) => [m.name, m.category ?? []] as const));
  return {
    ...result,
    matches: result.matches.map((m) => ({ ...m, category: byName.get(m.module) ?? [] })),
  };
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
 *
 * A path that passes containment but cannot be READ (a symlink to a directory,
 * revoked permissions, a file too large) also reads as absent: every caller
 * already degrades a null into a graceful missing, whereas a throw here aborts
 * the caller — one pathological file would fail an entire `prospec check`
 * instead of costing a single measurement. Only the READ is forgiven; a
 * schema-invalid document still throws from its parser (`invalid → loud`).
 *
 * THE single implementation of this invariant: `lib/drift-sources` delegates
 * here with its own root instead of keeping a second copy, which is how the two
 * drifted into disagreeing about read failures in the first place (PB-006).
 */
export function readContainedText(filePath: string, root: string): string | null {
  const read = readContained(filePath, root);
  return read.ok ? read.text : null;
}

/**
 * `readContainedText` with the reason kept — for the few callers that must tell
 * the three nulls apart. Absence is not always neutral: a MISSING
 * `module-map.yaml` legitimately means "no map, use the fallback ruleset", while
 * a present-but-unreadable one must stay LOUD, or a broken file silently swaps
 * the ruleset that dependency-direction is judged against (`invalid → loud`
 * covers the schema; this covers the read).
 */
export function readContained(filePath: string, root: string): ContainedRead {
  if (!existsSync(filePath)) return { ok: false, reason: 'absent' };
  let real: string;
  try {
    real = realpathSync(filePath);
    if (!isContainedPath(real, root)) return { ok: false, reason: 'escaped' };
  } catch {
    return { ok: false, reason: 'absent' };
  }
  try {
    return { ok: true, text: readFileSync(real, 'utf-8') };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}

/**
 * Whether `target` stays under `root` once both are resolved — THE containment
 * predicate. `drift-sources`'s existence probe shares it rather than keeping a
 * third copy of the same three lines (PB-006 names that copy explicitly); it
 * cannot share the whole read, because a markdown link pointing at a real
 * directory must count as EXISTING while being unreadable.
 */
export function isContainedPath(target: string, root: string): boolean {
  try {
    const rel = path.relative(realpathSync(root), realpathSync(target));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  } catch {
    return false;
  }
}

/**
 * Automated Sweep Phase 3a
 * Applies 3 criteria: mechanized content compression, replaced content removal, absorbed content removal.
 */
export function sweepModuleReadme(content: string): { swept: string; savings: number } {
  let swept = content;
  
  // 1. Mechanized content compression
  swept = swept.replace(
    /^This is the `([^`]+)` module.*(?:\nIt was generated automatically\.)?\s*/gm,
    '`$1` module\n'
  );

  // 2. Replaced content removal (block)
  swept = swept.replace(/<!--\s*sweep:\s*replaced\s*-->[\s\S]*?<!--\s*\/sweep\s*-->\n?/g, '');

  // 3. Absorbed content removal (block)
  swept = swept.replace(/<!--\s*sweep:\s*absorbed\s*-->[\s\S]*?<!--\s*\/sweep\s*-->\n?/g, '');

  const beforeTokens = estimateTokens(content);
  const afterTokens = estimateTokens(swept);

  return { swept, savings: Math.max(0, beforeTokens - afterTokens) };
}
