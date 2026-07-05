import {
  INDEX_TABLE_COLUMNS,
  INDEX_TABLE_HEADER,
  INDEX_TABLE_SEPARATOR,
  INDEX_COLUMN,
} from '../types/knowledge.js';
import type { ModuleMap } from '../types/module-map.js';
import { parseIndexModules } from './knowledge-reader.js';

/**
 * index.md module-table rendering + curated-column migration.
 *
 * The `prospec:auto` block's module table is generated from `module-map.yaml`
 * (the single source for the curated columns Keywords / Aliases / Rationale, and
 * Depends On via `relationships.depends_on`). This module builds each row from
 * that data — never blanking a curated column to `—` — and backfills existing
 * curated `index.md` content into module-map on the fly (no-clobber) so a project
 * that curated in index.md migrates losslessly on its next knowledge update.
 */

/** Placeholder for an empty cell — also treated as "no value" on parse-back. */
export const EMPTY_CELL = '—';

/**
 * A module's display data for one index-table row. Only name/status/description
 * are always known; the curated columns are optional (a freshly-detected module
 * may have none yet) and render as `—` when absent.
 */
export interface IndexRowModule {
  name: string;
  status: string;
  description: string;
  keywords?: string[];
  aliases?: string[];
  rationale?: string;
  dependsOn?: string[];
}

function scalarCell(value: string | undefined): string {
  return value === undefined || value.trim() === '' ? EMPTY_CELL : value;
}

function listCell(items: string[] | undefined): string {
  const joined = (items ?? [])
    .map((s) => s.trim())
    .filter((s) => s !== '' && s !== EMPTY_CELL)
    .join(', ');
  return joined === '' ? EMPTY_CELL : joined;
}

/** Render one Markdown table row, cells positioned by the canonical schema. */
export function buildIndexRow(m: IndexRowModule): string {
  const cells = INDEX_TABLE_COLUMNS.map((_, i) => {
    switch (i) {
      case INDEX_COLUMN.MODULE:
        return `**${m.name}**`;
      case INDEX_COLUMN.KEYWORDS:
        return listCell(m.keywords);
      case INDEX_COLUMN.ALIASES:
        return listCell(m.aliases);
      case INDEX_COLUMN.STATUS:
        return scalarCell(m.status);
      case INDEX_COLUMN.DESCRIPTION:
        return scalarCell(m.description);
      case INDEX_COLUMN.RATIONALE:
        return scalarCell(m.rationale);
      case INDEX_COLUMN.DEPENDS_ON:
        return listCell(m.dependsOn);
      default:
        return EMPTY_CELL;
    }
  });
  return `| ${cells.join(' | ')} |`;
}

/** Header + separator + one row per module (flat table). */
export function buildIndexTable(modules: IndexRowModule[]): string {
  return [INDEX_TABLE_HEADER, INDEX_TABLE_SEPARATOR, ...modules.map(buildIndexRow)].join('\n');
}

function isEmptyScalar(v: string | undefined): boolean {
  return v === undefined || v.trim() === '' || v.trim() === EMPTY_CELL;
}

function isEmptyList(a: readonly string[] | undefined): boolean {
  return a === undefined || a.every((s) => s.trim() === '' || s.trim() === EMPTY_CELL);
}

/**
 * No-clobber migration: seed each module-map entry's curated columns
 * (keywords / aliases / rationale / description) from an existing `index.md`
 * whenever the module-map field is empty/missing. NEVER overwrites a non-empty
 * module-map value, so it is bootstrap-once + idempotent — a second run over the
 * same inputs reports `changed: false`.
 *
 * `Depends On` is intentionally NOT backfilled: it renders from the
 * drift-enforced `relationships.depends_on`, and the index column can carry
 * display shorthands (`all`) that are not real module names.
 */
export function backfillCuratedFromIndex(
  indexContent: string,
  moduleMap: ModuleMap,
): { moduleMap: ModuleMap; changed: boolean } {
  const byName = new Map(
    parseIndexModules(indexContent).map((p) => [p.name.toLowerCase(), p] as const),
  );
  let changed = false;

  const modules = moduleMap.modules.map((entry) => {
    const idx = byName.get(entry.name.toLowerCase());
    if (idx === undefined) return entry;

    const next = { ...entry };
    if (isEmptyList(next.keywords) && !isEmptyList(idx.keywords)) {
      next.keywords = idx.keywords;
      changed = true;
    }
    if (isEmptyList(next.aliases) && !isEmptyList(idx.aliases)) {
      next.aliases = idx.aliases;
      changed = true;
    }
    if (isEmptyScalar(next.rationale) && !isEmptyScalar(idx.rationale)) {
      next.rationale = idx.rationale;
      changed = true;
    }
    if (isEmptyScalar(next.description) && !isEmptyScalar(idx.description)) {
      next.description = idx.description;
      changed = true;
    }
    return next;
  });

  return { moduleMap: { ...moduleMap, modules }, changed };
}
