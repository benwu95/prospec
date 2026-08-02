import { REVIEW_SEVERITIES, type ReviewFinding, type ReviewSeverity } from '../types/station.js';
import {
  findTable,
  renderMarkdownTable,
  replaceTableInDocument,
  type FindTableOptions,
} from './markdown-table.js';

/**
 * Deterministic bookkeeping for the /prospec-review cumulative findings table
 * (`.prospec/changes/<name>/review.md`).
 *
 * The reviewer's JUDGMENT stays upstream: which findings exist, their severity,
 * and — critically — finding IDENTITY across rounds (code edits shift line
 * numbers, so "is this the same finding as last round?" is the reviewer's call,
 * expressed by reusing the prior round's `id`). Given that input, this module
 * is pure mechanics: merge by identity, take the max severity, carry resolved
 * rows forward so they are never re-raised, render one canonical table.
 */

export interface ReviewRow {
  /** Stable identity; legacy hand-written rows may lack one. */
  id?: string;
  location: string;
  severity: ReviewSeverity;
  lens: string;
  status: string;
  summary: string;
}

export interface ReviewRoundCounts {
  criticals_found: number;
  criticals_fixed: number;
  majors: number;
}

const CANONICAL_HEADER = ['ID', 'Location', 'Severity', 'Lens', 'Status', 'Summary'] as const;

/** Column-name aliases accepted when parsing a pre-existing hand-written table. */
const COLUMN_ALIASES: Record<string, keyof ReviewRow> = {
  id: 'id',
  location: 'location',
  severity: 'severity',
  lens: 'lens',
  status: 'status',
  summary: 'summary',
  description: 'summary',
  note: 'summary',
  finding: 'summary',
};

/** The findings table is the first markdown table whose header carries both a
 *  Location and a Severity column. */
const FINDINGS_TABLE: FindTableOptions = {
  isTarget: (headers) => headers.includes('location') && headers.includes('severity'),
};

function toSeverity(value: string): ReviewSeverity {
  const v = value.trim().toLowerCase();
  return (REVIEW_SEVERITIES as readonly string[]).includes(v)
    ? (v as ReviewSeverity)
    : 'major';
}

/** Parse the cumulative table out of an existing review.md (empty file → []).
 *  Tolerates the legacy 4-column hand-written shape (no ID / Summary). */
export function parseReviewRows(content: string): ReviewRow[] {
  const table = findTable(content.split('\n'), FINDINGS_TABLE);
  if (!table) return [];
  const columnFor = table.headers.map((h) => COLUMN_ALIASES[h.toLowerCase()]);
  return table.rows
    .map((cells) => {
      const row: ReviewRow = { location: '', severity: 'major', lens: '', status: 'open', summary: '' };
      cells.forEach((cell, i) => {
        const key = columnFor[i];
        if (!key) return;
        if (key === 'severity') row.severity = toSeverity(cell);
        else if (key === 'id') row.id = cell || undefined;
        else row[key] = cell;
      });
      return row;
    })
    .filter((r) => r.location !== '');
}

function severityMax(a: ReviewSeverity, b: ReviewSeverity): ReviewSeverity {
  return REVIEW_SEVERITIES.indexOf(a) >= REVIEW_SEVERITIES.indexOf(b) ? a : b;
}

function fallbackKey(location: string, lens: string): string {
  return `${location}|${lens}`;
}

/**
 * Merge one round's findings into the cumulative rows.
 *
 * Identity is the reviewer's, never the location string: an incoming `id`
 * matches the row carrying it, and an id no row carries opens a NEW row — the
 * one exception being a candidate row with no id at all, the pre-ids legacy
 * shape that such an id adopts. A finding without an id keys on
 * (location, lens) against the rows that predate this round, taken in table
 * order and each claimable once — so withholding an id costs cross-round
 * tracking, never the finding's own row, and re-merging the same round stays
 * byte-identical. A row leaves the location index the moment this round claims
 * it, and any row the round names by id is reserved before location matching
 * begins: `location` is overwritten from the finding, and identity asserted
 * outranks identity inferred regardless of the order findings arrive in.
 * Existing rows are never removed — they are the cross-round anchor. Severity only ever escalates
 * (max); status and summary take the incoming round's word.
 */
export function mergeFindings(existing: ReviewRow[], incoming: ReviewFinding[]): ReviewRow[] {
  const merged = existing.map((r) => ({ ...r }));
  const byId = new Map<string, ReviewRow>();
  const byFallback = new Map<string, ReviewRow[]>();
  const seededAt = new Map<ReviewRow, string>();
  for (const row of merged) {
    if (row.id) byId.set(row.id, row);
    const key = fallbackKey(row.location, row.lens);
    seededAt.set(row, key);
    const queue = byFallback.get(key);
    if (queue) queue.push(row);
    else byFallback.set(key, [row]);
  }

  const claim = (row: ReviewRow): void => {
    const key = seededAt.get(row);
    const queue = key === undefined ? undefined : byFallback.get(key);
    const at = queue?.indexOf(row) ?? -1;
    if (queue && at !== -1) queue.splice(at, 1);
  };

  // Reserve every row this round names by id before any location matching:
  // identity asserted outranks identity inferred, whichever order the findings
  // arrive in. Without this an id-less finding could claim the very row a later
  // finding names — collapsing two findings into one row, the defect this
  // whole rule exists to prevent.
  for (const finding of incoming) {
    const named = finding.id === undefined ? undefined : byId.get(finding.id);
    if (named) claim(named);
  }

  for (const finding of incoming) {
    const status = finding.status ?? 'open';
    const candidate = byFallback.get(fallbackKey(finding.location, finding.lens))?.[0];
    const target = finding.id
      ? (byId.get(finding.id) ?? (candidate?.id ? undefined : candidate))
      : candidate;
    if (target) {
      // Redundant for an id match — the pass above already reserved it — but
      // keeping it unconditional makes "a claimed row is out of the index" a
      // local guarantee, not one that depends on that pass staying exhaustive.
      claim(target);
      target.severity = severityMax(target.severity, finding.severity);
      target.location = finding.location;
      target.status = status;
      target.summary = finding.summary;
      if (finding.id && !target.id) {
        target.id = finding.id;
        byId.set(finding.id, target);
      }
    } else {
      const row: ReviewRow = {
        id: finding.id,
        location: finding.location,
        severity: finding.severity,
        lens: finding.lens,
        status,
        summary: finding.summary,
      };
      merged.push(row);
      if (row.id) byId.set(row.id, row);
    }
  }
  return merged;
}

/** One round's structured counts (for `prospec change log` review fields) —
 *  computed from the ROUND's findings, not the cumulative table. */
export function roundCounts(incoming: ReviewFinding[]): ReviewRoundCounts {
  const criticals = incoming.filter((f) => f.severity === 'critical');
  return {
    criticals_found: criticals.length,
    criticals_fixed: criticals.filter((f) => (f.status ?? 'open') === 'fixed').length,
    majors: incoming.filter((f) => f.severity === 'major').length,
  };
}

/** Render the canonical cumulative table (stable row order = merge order). */
export function renderReviewTable(rows: ReviewRow[]): string {
  return renderMarkdownTable(
    CANONICAL_HEADER,
    rows.map((r) => [r.id ?? '', r.location, r.severity, r.lens, r.status, r.summary]),
  );
}

/**
 * Replace the findings table inside an existing review.md, preserving any
 * prose before and after it; a file without a table gets the table appended;
 * an empty/absent file gets a minimal scaffold.
 */
export function renderReviewDocument(
  content: string,
  rows: ReviewRow[],
  changeName: string,
): string {
  return replaceTableInDocument(content, renderReviewTable(rows), {
    ...FINDINGS_TABLE,
    scaffoldTitle: `# Review Findings: ${changeName}`,
  });
}
