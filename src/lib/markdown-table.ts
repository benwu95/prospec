/**
 * Shared markdown pipe-table primitives for the table-bearing documents
 * prospec owns (`review.md` findings, `_lessons-ledger.md`).
 *
 * Single source per PB-006: review-merge and lessons-ledger each hand-copied
 * this engine and the copies drifted — review-merge's row split once ignored
 * the `\|` escaping its own renderer wrote, a confirmed critical. Callers keep
 * their own header predicates, column vocabularies, and row filtering; this
 * module owns only the mechanics: escaped-pipe-aware row split, separator
 * detection, table location, cell escaping, rendering, and in-place
 * replacement that preserves surrounding prose.
 */

/**
 * Split one `| a | b |` row into trimmed cells, honoring the `\|` escaping
 * `renderMarkdownTable` writes (a plain split('|') would shear any cell
 * containing a pipe on re-parse) and unescaping `\|` back to `|`.
 */
export function splitTableRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/(?<!\\)\|\s*$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));
}

export function isSeparatorRow(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}/.test(line) && /^[\s|:-]+$/.test(line);
}

export interface TableBlock {
  /** Index of the header row. */
  start: number;
  /** Exclusive end — the line after the table's last `|` row. */
  end: number;
  /** Raw header cells (original casing). */
  headers: string[];
  /** Every line between the separator row and `end`, split into cells. */
  rows: string[][];
}

export interface FindTableOptions {
  /** Receives the header cells lowercased; true selects this table. */
  isTarget: (lowercaseHeaders: string[]) => boolean;
  /**
   * Scan across blank lines INSIDE the table and end at the last `|` row
   * (a hand-edited table can accumulate gaps; stopping at the first non-`|`
   * line would hide every row after the gap). Default: stop at the first
   * non-`|` line.
   */
  spanBlankLines?: boolean;
}

/** Locate the first table whose header satisfies `isTarget`; null when none exists. */
export function findTable(lines: string[], options: FindTableOptions): TableBlock | null {
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]!;
    if (!line.trimStart().startsWith('|')) continue;
    if (!isSeparatorRow(lines[i + 1] ?? '')) continue;
    const headers = splitTableRow(line);
    if (!options.isTarget(headers.map((h) => h.toLowerCase()))) continue;
    let end = i + 2;
    if (options.spanBlankLines) {
      let lastRowEnd = end;
      while (end < lines.length) {
        const candidate = lines[end]!;
        if (candidate.trimStart().startsWith('|')) {
          end++;
          lastRowEnd = end;
          continue;
        }
        if (candidate.trim() === '') {
          end++;
          continue;
        }
        break;
      }
      end = lastRowEnd;
    } else {
      while (end < lines.length && lines[end]!.trimStart().startsWith('|')) end++;
    }
    return {
      start: i,
      end,
      headers,
      rows: lines.slice(i + 2, end).map(splitTableRow),
    };
  }
  return null;
}

/** Escape a cell for rendering: `|` → `\|`, newlines flattened to spaces. */
export function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** Render header + `---` separator + escaped body rows (stable row order). */
export function renderMarkdownTable(
  columns: readonly string[],
  rows: ReadonlyArray<readonly string[]>,
): string {
  const header = `| ${columns.join(' | ')} |`;
  const separator = `|${columns.map(() => '---').join('|')}|`;
  const body = rows.map((cells) => `| ${cells.map(escapeTableCell).join(' | ')} |`);
  return [header, separator, ...body].join('\n');
}

export interface ReplaceTableOptions extends FindTableOptions {
  /** Heading line for the scaffold written when the document is empty. */
  scaffoldTitle: string;
}

/**
 * Replace the target table inside a document, preserving any prose before and
 * after it; a document without the table gets the table appended; an
 * empty/absent document gets a minimal scaffold under `scaffoldTitle`.
 */
export function replaceTableInDocument(
  content: string,
  table: string,
  options: ReplaceTableOptions,
): string {
  if (!content.trim()) {
    return `${options.scaffoldTitle}\n\n${table}\n`;
  }
  const lines = content.split('\n');
  const block = findTable(lines, options);
  if (!block) {
    return `${content.replace(/\n+$/, '')}\n\n${table}\n`;
  }
  const before = lines.slice(0, block.start).join('\n');
  const after = lines.slice(block.end).join('\n');
  return `${before}${before ? '\n' : ''}${table}${after.trim() ? `\n${after}` : '\n'}`;
}
