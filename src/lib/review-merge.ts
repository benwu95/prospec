import {
  REVIEW_SEVERITIES,
  normalizeReviewStatus,
  type ReviewFinding,
  type ReviewSeverity,
} from '../types/station.js';
import {
  renderEvidenceSection,
  splitEvidenceSection,
  type EvidenceBlock,
} from './delegated-evidence.js';
import {
  findTable,
  renderMarkdownTable,
  replaceTableInDocument,
  type FindTableOptions,
} from './markdown-table.js';
import { trimTrailingNewlines } from './markdown-fences.js';

/**
 * Deterministic bookkeeping for the prospec-review cumulative findings table
 * (`.prospec/changes/<name>/review.md`).
 *
 * The reviewer's JUDGMENT stays upstream: which findings exist, their severity,
 * and — critically — finding IDENTITY across rounds (code edits shift line
 * numbers, so "is this the same finding as last round?" is the reviewer's call,
 * expressed by reusing the prior round's `id`). Given that input, this module
 * is pure mechanics: merge by identity, take the max severity, carry resolved
 * rows forward so they are never re-raised, render one canonical table plus the
 * evidence section beneath it.
 *
 * `repro` and `evidence` are the reviewer's evidence half, and they live in two
 * different places for one reason: exact round-tripping. `repro` is one command,
 * so it is a table column and rides the pipe-table engine's own `\|` escaping;
 * `evidence` is prose, so it lands in the marker-anchored section below as raw
 * lines. Both are CUMULATIVE — a later round that re-reports a finding without
 * them keeps what the artifact holds, because a fix round reports a status and
 * must not erase the reason the finding existed.
 */

export interface ReviewRow {
  /** Stable identity; legacy hand-written rows may lack one. */
  id?: string;
  location: string;
  severity: ReviewSeverity;
  lens: string;
  status: string;
  /** Review round in which this finding was first detected. */
  origin_round?: number;
  summary: string;
  /** The command that shows the defect — a table column, so it round-trips. */
  repro?: string;
  /** Full evidence prose; rendered into the evidence section, keyed by `id`. */
  evidence?: string;
}

export interface ReviewRoundCounts {
  criticals_found: number;
  criticals_fixed: number;
  majors: number;
}

const CANONICAL_HEADER = [
  'ID',
  'Location',
  'Severity',
  'Lens',
  'Status',
  'Origin',
  'Summary',
  'Repro',
] as const;

/** Column-name aliases accepted when parsing a pre-existing hand-written table. */
const COLUMN_ALIASES: Record<string, keyof ReviewRow> = {
  id: 'id',
  location: 'location',
  severity: 'severity',
  lens: 'lens',
  status: 'status',
  origin: 'origin_round',
  'origin round': 'origin_round',
  origin_round: 'origin_round',
  round: 'origin_round',
  summary: 'summary',
  description: 'summary',
  note: 'summary',
  finding: 'summary',
  repro: 'repro',
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
 *  Tolerates the legacy hand-written shapes: a missing ID / Summary / Repro / Origin
 *  column simply leaves that field unset. */
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
        else if (key === 'origin_round') {
          const n = parseInt(cell.trim(), 10);
          if (!Number.isNaN(n) && n > 0) row.origin_round = n;
        }
        else if (key === 'id' || key === 'repro') row[key] = cell || undefined;
        else if (key !== 'evidence') row[key] = cell;
      });
      return row;
    })
    .filter((r) => r.location !== '');
}

/**
 * Read a whole review.md: the content above the evidence section, plus the rows
 * with each row's evidence re-attached from the block anchored by its id.
 *
 * The split happens BEFORE the table search on purpose — evidence prose quotes
 * reports, and a quoted findings table would otherwise be the first table the
 * search finds.
 */
export function parseReviewDocument(content: string): { before: string; rows: ReviewRow[] } {
  const { before, blocks } = splitEvidenceSection(content);
  const rows = parseReviewRows(before);
  for (const row of rows) {
    const block = row.id === undefined ? undefined : blocks.get(row.id);
    if (block) row.evidence = block.body;
  }
  return { before, rows };
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
 * (max); status and summary take the incoming round's word. `repro` and
 * `evidence` are the exception: only a round that SUPPLIES them overwrites
 * them, so re-reporting a finding as fixed cannot blank the evidence recorded
 * when it was raised.
 */
export function mergeFindings(
  existing: ReviewRow[],
  incoming: ReviewFinding[],
  currentRound: number = 1,
): ReviewRow[] {
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
      target.origin_round = target.origin_round ?? 1;
      if (finding.repro !== undefined) target.repro = finding.repro;
      if (finding.evidence !== undefined) target.evidence = finding.evidence;
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
        origin_round: currentRound,
        summary: finding.summary,
        repro: finding.repro,
        evidence: finding.evidence,
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
  let criticals_found = 0;
  let criticals_fixed = 0;
  let majors = 0;
  for (const f of incoming) {
    if (f.severity === 'critical') {
      criticals_found++;
      if (normalizeReviewStatus(f.status) === 'fixed') criticals_fixed++;
    } else if (f.severity === 'major') {
      majors++;
    }
  }
  return { criticals_found, criticals_fixed, majors };
}

/** Render the canonical cumulative table (stable row order = merge order). */
export function renderReviewTable(rows: ReviewRow[]): string {
  return renderMarkdownTable(
    CANONICAL_HEADER,
    rows.map((r) => [
      r.id ?? '',
      r.location,
      r.severity,
      r.lens,
      r.status,
      r.origin_round !== undefined ? String(r.origin_round) : '1',
      r.summary,
      r.repro ?? '',
    ]),
  );
}

/** The evidence blocks a row set carries, in table-row order — so the section is
 *  a function of the merged rows, never of the order blocks were parsed in. */
export function evidenceBlocksFor(rows: readonly ReviewRow[]): EvidenceBlock[] {
  return rows.flatMap((r) =>
    r.id !== undefined && r.evidence !== undefined && r.evidence !== ''
      ? [{ key: r.id, body: r.evidence }]
      : [],
  );
}

const encodeToken = (s: string): string => encodeURIComponent(s);
const decodeToken = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export interface ReviewMetrics {
  round?: number;
  spendBefore?: number;
  lastRoundSpend?: number;
  cumulativeSpend?: number;
  loopBase?: number;
  provenanceDigest?: string;
  lenses?: string[];
  trials?: Record<string, (boolean | undefined)[]>;
}

/** Parse cumulative review metrics embedded in review.md comments. */
export function parseReviewMetrics(content: string): ReviewMetrics {
  const match = content.match(/<!--\s*prospec:review-metrics\s+((?:\w+="[^"]*"\s*)*)-->/);
  if (!match) return {};
  const attrs = Object.fromEntries(
    [...match[1]!.matchAll(/(\w+)="([^"]*)"/g)].map(([, k, v]) => [k!, v!]),
  );

  let trials: Record<string, (boolean | undefined)[]> | undefined;
  if (attrs.signatures) {
    trials = {};
    for (const part of attrs.signatures.split(',')) {
      const sep = part.lastIndexOf(':');
      if (sep <= 0) continue;
      const id = decodeToken(part.slice(0, sep).trim());
      const history = part.slice(sep + 1);
      if (id && /^[PF_]+$/i.test(history)) {
        trials[id] = history.split('').map((c) => {
          const upper = c.toUpperCase();
          return upper === 'P' ? true : upper === 'F' ? false : undefined;
        });
      }
    }
  }

  const round = attrs.round ? parseInt(attrs.round, 10) : undefined;
  const spendBefore = attrs.spend_before !== undefined ? parseInt(attrs.spend_before, 10) : undefined;
  const lastRoundSpend = attrs.round_spend !== undefined ? parseInt(attrs.round_spend, 10) : undefined;
  const cumulativeSpend =
    attrs.cumulative_spend !== undefined
      ? parseInt(attrs.cumulative_spend, 10)
      : spendBefore !== undefined && lastRoundSpend !== undefined
        ? spendBefore + lastRoundSpend
        : undefined;
  const loopBase = attrs.loop_base !== undefined ? parseInt(attrs.loop_base, 10) : undefined;
  const provenanceDigest = attrs.provenance || undefined;
  const lenses = attrs.lenses
    ? attrs.lenses
        .split(',')
        .map((s) => decodeToken(s.trim()))
        .filter(Boolean)
    : undefined;

  return {
    round: !isNaN(round as number) ? round : undefined,
    spendBefore: spendBefore !== undefined && !isNaN(spendBefore) ? spendBefore : undefined,
    lastRoundSpend: lastRoundSpend !== undefined && !isNaN(lastRoundSpend) ? lastRoundSpend : undefined,
    cumulativeSpend: cumulativeSpend !== undefined && !isNaN(cumulativeSpend) ? cumulativeSpend : undefined,
    loopBase: loopBase !== undefined && !isNaN(loopBase) ? loopBase : undefined,
    provenanceDigest,
    lenses,
    trials,
  };
}

/**
 * Replace the findings table inside an existing review.md, preserving any
 * prose before and after it, then re-render the evidence section beneath;
 * a file without a table gets the table appended; an empty/absent file gets a
 * minimal scaffold.
 *
 * The old evidence section is split off before the table search, so passing a
 * whole document is safe: the section is rebuilt from `rows`, never duplicated —
 * and whatever followed it is put back, because that is where the review skill
 * is told to append its artifact-language sentence.
 */
export function renderReviewDocument(
  content: string,
  rows: ReviewRow[],
  changeName: string,
  metrics?: ReviewMetrics,
): string {
  const { before, after } = splitEvidenceSection(content);
  const existingMetrics = parseReviewMetrics(before);
  const effectiveMetrics: ReviewMetrics = metrics
    ? {
        round: metrics.round ?? existingMetrics.round,
        spendBefore: metrics.spendBefore ?? existingMetrics.spendBefore,
        lastRoundSpend: metrics.lastRoundSpend,
        cumulativeSpend: metrics.cumulativeSpend,
        loopBase: metrics.loopBase ?? existingMetrics.loopBase,
        provenanceDigest: metrics.provenanceDigest ?? existingMetrics.provenanceDigest,
        lenses: metrics.lenses ?? existingMetrics.lenses,
        trials: metrics.trials ?? existingMetrics.trials,
      }
    : existingMetrics;
  const cleanedBefore = before.replace(/<!--\s*prospec:review-metrics[\s\S]*?-->\n?/g, '');

  const attrs: string[] = [];
  if (effectiveMetrics.round !== undefined) {
    attrs.push(`round="${effectiveMetrics.round}"`);
  }
  if (effectiveMetrics.spendBefore !== undefined) {
    attrs.push(`spend_before="${effectiveMetrics.spendBefore}"`);
  }
  if (effectiveMetrics.lastRoundSpend !== undefined) {
    attrs.push(`round_spend="${effectiveMetrics.lastRoundSpend}"`);
  }
  if (effectiveMetrics.cumulativeSpend !== undefined) {
    attrs.push(`cumulative_spend="${effectiveMetrics.cumulativeSpend}"`);
  }
  if (effectiveMetrics.loopBase !== undefined && effectiveMetrics.loopBase > 0) {
    attrs.push(`loop_base="${effectiveMetrics.loopBase}"`);
  }
  if (effectiveMetrics.provenanceDigest) {
    attrs.push(`provenance="${effectiveMetrics.provenanceDigest}"`);
  }
  if (effectiveMetrics.lenses && effectiveMetrics.lenses.length > 0) {
    attrs.push(`lenses="${effectiveMetrics.lenses.map(encodeToken).join(',')}"`);
  }
  if (effectiveMetrics.trials && Object.keys(effectiveMetrics.trials).length > 0) {
    const sigStr = Object.entries(effectiveMetrics.trials)
      .filter(([, hist]) => hist.length > 0)
      .map(
        ([id, hist]) =>
          `${encodeToken(id)}:${Array.from(hist).map((p) => (p === true ? 'P' : p === false ? 'F' : '_')).join('')}`,
      )
      .join(',');
    if (sigStr) {
      attrs.push(`signatures="${sigStr}"`);
    }
  }

  const metricsComment = attrs.length > 0 ? `<!-- prospec:review-metrics ${attrs.join(' ')} -->\n` : '';
  const table = replaceTableInDocument(cleanedBefore, renderReviewTable(rows), {
    ...FINDINGS_TABLE,
    scaffoldTitle: `# Review Findings: ${changeName}`,
  });
  const section = renderEvidenceSection(evidenceBlocksFor(rows));
  const tail = [section, after].filter((part) => part !== '').join('\n\n');
  const tableWithMetrics = metricsComment ? `${metricsComment}${table}` : table;
  if (tail === '') return tableWithMetrics;
  return `${trimTrailingNewlines(tableWithMetrics)}\n\n${tail}\n`;
}
