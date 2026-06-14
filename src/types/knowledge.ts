/**
 * Canonical `_index.md` module-table column schema — the single source of truth.
 *
 * Every _index.md emitter (init scaffold, knowledge-update) and every parser
 * (change-story related-module matching) derives its columns from here. Templates
 * cannot import TypeScript, so the render service injects INDEX_TABLE_HEADER /
 * INDEX_TABLE_SEPARATOR into the template context; static skill-doc examples are
 * locked to these strings by contract tests. Adding or reordering a column is a
 * one-line edit to INDEX_TABLE_COLUMNS — header, separator, and indices follow.
 */
export const INDEX_TABLE_COLUMNS = [
  'Module',
  'Keywords',
  'Aliases',
  'Status',
  'Description',
  'Rationale',
  'Depends On',
] as const;

export type IndexTableColumn = (typeof INDEX_TABLE_COLUMNS)[number];

/**
 * Zero-based column positions into INDEX_TABLE_COLUMNS. Literal so tuple indexing
 * stays type-safe; locked to the array's order by a contract test (knowledge.test.ts
 * asserts each equals INDEX_TABLE_COLUMNS.indexOf(name)), so the array stays the
 * single source of order — reorder it without updating these and the test fails.
 */
export const INDEX_COLUMN = {
  MODULE: 0,
  KEYWORDS: 1,
  ALIASES: 2,
  STATUS: 3,
  DESCRIPTION: 4,
  RATIONALE: 5,
  DEPENDS_ON: 6,
} as const;

/** Rendered Markdown header row, e.g. `| Module | Keywords | … | Depends On |`. */
export const INDEX_TABLE_HEADER = `| ${INDEX_TABLE_COLUMNS.join(' | ')} |`;

/** Rendered Markdown separator row aligned to the canonical column count. */
export const INDEX_TABLE_SEPARATOR = `| ${INDEX_TABLE_COLUMNS.map(() => '---').join(' | ')} |`;
