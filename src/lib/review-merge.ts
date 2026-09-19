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
  countEscapedCells,
  findTable,
  renderMarkdownTable,
  replaceTableInDocument,
  type FindTableOptions,
} from './markdown-table.js';
import { trimTrailingNewlines } from './markdown-fences.js';
import { EMPTY_TEST_FAILURE_STREAK, type TestFailureStreak } from '../types/cascade.js';
import { PrerequisiteError } from '../types/errors.js';

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

/** The cells one row renders to — the single list both the table and the escaped-cell count use. */
function reviewRowCells(r: ReviewRow): string[] {
  return [
    r.id ?? '',
    r.location,
    r.severity,
    r.lens,
    r.status,
    r.origin_round !== undefined ? String(r.origin_round) : '1',
    r.summary,
    r.repro ?? '',
  ];
}

/** Render the canonical cumulative table (stable row order = merge order). */
export function renderReviewTable(rows: ReviewRow[]): string {
  return renderMarkdownTable(CANONICAL_HEADER, rows.map(reviewRowCells));
}

/**
 * How many cells the table engine rewrites (a `|` or a line break) among the
 * merged rows THIS round wrote or updated — counted over the cells the row
 * actually renders to, so a value the merge discarded (a re-reported `lens`,
 * which is never overwritten) is not counted, and a carried-forward row the
 * round did not touch is not counted either.
 */
export function escapedCellsFor(
  merged: readonly ReviewRow[],
  incoming: readonly ReviewFinding[],
): number {
  const touched = new Set<ReviewRow>();
  const byId = new Map(merged.filter((r) => r.id !== undefined).map((r) => [r.id!, r]));
  // Same two-pass order as mergeFindings: asserted identity reserves its row first,
  // whatever order the findings arrive in, so an id-less finding cannot steal it.
  for (const f of incoming) {
    if (f.id === undefined) continue;
    const row = byId.get(f.id);
    if (row) touched.add(row);
  }
  for (const f of incoming) {
    if (f.id !== undefined) continue;
    // Same claim-once semantics as the merge's fallback queue: two id-less findings
    // at one (location, lens) are two rows, so each claims the next unclaimed one.
    const row = merged.find(
      (r) => r.location === f.location && r.lens === f.lens && !touched.has(r),
    );
    if (row) touched.add(row);
  }
  return countEscapedCells([...touched].map(reviewRowCells));
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
  /** Distinct failed test attempts `review merge` observed in a row (bounded). */
  consecutiveTestFailures?: number;
  /** The ids retained for that streak, at most the effective threshold. */
  testFailureAttemptIds?: string[];
}

const METRICS_COMMENT = /<!--\s*prospec:review-metrics\s+((?:\w+="[^"]*"\s*)*)-->/g;

function metricsAttributes(content: string): Array<Record<string, string>> {
  return [...content.matchAll(METRICS_COMMENT)].map((match) =>
    Object.fromEntries([...match[1]!.matchAll(/(\w+)="([^"]*)"/g)].map(([, k, v]) => [k!, v!])),
  );
}

/** Strict read of the test-failure attributes; `null` when they are malformed. */
function readTestFailureAttributes(attrs: Record<string, string>): Pick<ReviewMetrics, 'consecutiveTestFailures' | 'testFailureAttemptIds'> | null {
  if (attrs.test_failures === undefined && attrs.test_failure_ids === undefined) return {};
  if (attrs.test_failures === undefined || !/^\d+$/.test(attrs.test_failures)) return null;
  const ids = attrs.test_failure_ids === undefined || attrs.test_failure_ids === ''
    ? []
    : attrs.test_failure_ids.split(',').map((s) => decodeToken(s.trim()));
  if (ids.some((id) => id === '')) return null;
  return { consecutiveTestFailures: parseInt(attrs.test_failures, 10), testFailureAttemptIds: ids };
}

function metricsFromAttributes(attrs: Record<string, string>): ReviewMetrics {
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
    // Lenient: a malformed test field reads as absent here; the strict parser
    // the merge writes through refuses it instead.
    ...(readTestFailureAttributes(attrs) ?? {}),
  };
}

/** Parse cumulative review metrics embedded in review.md comments (lenient — for
 *  read-only consumers such as `learn yield`, which must not choke on a hand-edited
 *  archived review). The first comment wins; malformed fields read as absent. */
export function parseReviewMetrics(content: string): ReviewMetrics {
  const [attrs] = metricsAttributes(content);
  return attrs ? metricsFromAttributes(attrs) : {};
}

/**
 * The parse `review merge` writes through: a document with two metrics comments
 * or with malformed test-failure fields is refused with a repair hint BEFORE any
 * byte is written, so a corrupt streak is never silently read as zero.
 */
export function parseReviewMetricsStrict(content: string): ReviewMetrics {
  const all = metricsAttributes(content);
  if (all.length > 1) {
    throw new PrerequisiteError(
      `review.md carries ${all.length} \`prospec:review-metrics\` comments; exactly one is allowed`,
      'Delete the stale review-metrics comment(s) by hand so one remains, then re-run the merge',
    );
  }
  const attrs = all[0];
  if (!attrs) return {};
  if (readTestFailureAttributes(attrs) === null) {
    throw new PrerequisiteError(
      'review.md carries malformed test-failure metrics (`test_failures` must be a non-negative integer and every `test_failure_ids` token non-empty) in its `prospec:review-metrics` comment',
      'Repair or remove the `test_failures` / `test_failure_ids` attributes by hand, then re-run the merge',
    );
  }
  return metricsFromAttributes(attrs);
}

/** The bounded streak a metrics record carries; legacy records read as empty. */
export function readTestFailureStreak(metrics: ReviewMetrics): TestFailureStreak {
  return {
    consecutiveTestFailures: metrics.consecutiveTestFailures ?? 0,
    testFailureAttemptIds: metrics.testFailureAttemptIds ?? [],
  };
}

/** What one `review merge` observed about the target's latest test attempt. */
export type TestFailureObservation =
  | { kind: 'failed'; attemptId: string }
  | { kind: 'green' }
  | { kind: 'none' };

/**
 * Fold one observation into the streak. Only a NEW failed attempt id counts — a
 * replayed id (including an older one still retained) never increments, so a
 * CLI retry is not a new failure; the count saturates at the effective
 * threshold and the retained ids are bounded to it (the most recent ones). A
 * fresh certified green clears everything; any other observation (missing,
 * running, exemptions) changes nothing.
 */
export function reduceTestFailureStreak(
  streak: TestFailureStreak,
  observation: TestFailureObservation,
  threshold: number,
): TestFailureStreak {
  if (observation.kind === 'green') return EMPTY_TEST_FAILURE_STREAK;
  if (observation.kind === 'none') return streak;
  if (streak.testFailureAttemptIds.includes(observation.attemptId)) return streak;
  return {
    consecutiveTestFailures: Math.min(streak.consecutiveTestFailures + 1, threshold),
    testFailureAttemptIds: [...streak.testFailureAttemptIds, observation.attemptId].slice(-threshold),
  };
}

/** Render the one metrics comment (with its trailing newline), or '' when there
 *  is nothing to record. The ONLY writer of that comment's attributes. */
export function renderReviewMetricsComment(metrics: ReviewMetrics): string {
  const attrs: string[] = [];
  if (metrics.round !== undefined) {
    attrs.push(`round="${metrics.round}"`);
  }
  if (metrics.spendBefore !== undefined) {
    attrs.push(`spend_before="${metrics.spendBefore}"`);
  }
  if (metrics.lastRoundSpend !== undefined) {
    attrs.push(`round_spend="${metrics.lastRoundSpend}"`);
  }
  if (metrics.cumulativeSpend !== undefined) {
    attrs.push(`cumulative_spend="${metrics.cumulativeSpend}"`);
  }
  if (metrics.loopBase !== undefined && metrics.loopBase > 0) {
    attrs.push(`loop_base="${metrics.loopBase}"`);
  }
  if (metrics.provenanceDigest) {
    attrs.push(`provenance="${metrics.provenanceDigest}"`);
  }
  if (metrics.lenses && metrics.lenses.length > 0) {
    attrs.push(`lenses="${metrics.lenses.map(encodeToken).join(',')}"`);
  }
  if (metrics.trials && Object.keys(metrics.trials).length > 0) {
    const sigStr = Object.entries(metrics.trials)
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
  const streak = readTestFailureStreak(metrics);
  if (streak.consecutiveTestFailures > 0 || streak.testFailureAttemptIds.length > 0) {
    attrs.push(`test_failures="${streak.consecutiveTestFailures}"`);
    if (streak.testFailureAttemptIds.length > 0) {
      attrs.push(`test_failure_ids="${streak.testFailureAttemptIds.map(encodeToken).join(',')}"`);
    }
  }
  return attrs.length > 0 ? `<!-- prospec:review-metrics ${attrs.join(' ')} -->\n` : '';
}

/**
 * Splice ONLY the test-failure attributes into a document's metrics comment,
 * preserving every byte outside that comment and every non-test metric value —
 * the refusal-path write, which must never rebuild findings or evidence. An
 * absent document becomes a metrics-only file; a document without a comment
 * gets one prepended.
 */
export function replaceReviewMetrics(content: string, streak: TestFailureStreak): string {
  const existing = parseReviewMetricsStrict(content);
  const comment = renderReviewMetricsComment({ ...existing, ...streak });
  const match = new RegExp(METRICS_COMMENT.source).exec(content);
  if (match) {
    const end = match.index + match[0].length;
    const newlineAfter = content[end] === '\n' ? 1 : 0;
    return content.slice(0, match.index) + comment + content.slice(end + newlineAfter);
  }
  return comment + content;
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
        consecutiveTestFailures: metrics.consecutiveTestFailures ?? existingMetrics.consecutiveTestFailures,
        testFailureAttemptIds: metrics.testFailureAttemptIds ?? existingMetrics.testFailureAttemptIds,
      }
    : existingMetrics;
  const cleanedBefore = before.replace(/<!--\s*prospec:review-metrics[\s\S]*?-->\n?/g, '');

  const metricsComment = renderReviewMetricsComment(effectiveMetrics);
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

/** Marks the start of a machine-written clean-review statement in review.md. */
export const REVIEW_CLEAN_START_MARKER = '<!-- prospec:review-clean -->';
/** Marks the end of a machine-written clean-review statement in review.md. */
export const REVIEW_CLEAN_END_MARKER = '<!-- prospec:review-clean-end -->';

const RE_META = /[.*+?^${}()|[\]\\]/g;
const CLEAN_START_ESC = REVIEW_CLEAN_START_MARKER.replace(RE_META, '\\$&');
const CLEAN_END_ESC = REVIEW_CLEAN_END_MARKER.replace(RE_META, '\\$&');
// Matches ONLY a well-formed clean block — start marker, ONE single-line sentence,
// end marker — with its surrounding blank lines. The single-line body (`[^\n]*`) is
// what a machine-written block always is, and it is what stops the strip from
// over-reaching: a findings doc that merely QUOTES a marker in evidence prose is not a
// single-line block so it never matches, and the body can never span the newlines
// between an evidence-prose start and a far-away end (so the evidence-section-end
// marker is never swallowed).
const REVIEW_CLEAN_BLOCK_RE = new RegExp(
  `\\n*${CLEAN_START_ESC}\\n[^\\n]*\\n${CLEAN_END_ESC}\\n*`,
  'g',
);

/**
 * Strip a machine-written clean-review block from a review document. Callers pass
 * `existingContent` through this before re-rendering so a stale clean sentence from an
 * earlier 0-finding round is not carried forward into a later round that has findings
 * (which would leave "no issues found" above a real row). A document with no well-formed
 * clean block is returned byte-for-byte untouched — the newline collapse runs only after
 * a block was actually removed, so it never rewrites spacing in a findings document that
 * has none, and a marker merely quoted in evidence prose is never matched.
 */
export function stripCleanReviewBlock(content: string): string {
  const afterBlock = content.replace(REVIEW_CLEAN_BLOCK_RE, '\n\n');
  if (afterBlock === content) return content;
  return afterBlock.replace(/\n{3,}/g, '\n\n');
}

/**
 * Wraps a non-empty clean-review sentence in dedicated markers below the document's
 * evidence section, stripping any prior clean block first for byte-idempotency.
 * When `sentence` is undefined or empty/whitespace, returns `rendered` unchanged.
 */
export function applyCleanReviewSentence(rendered: string, sentence?: string): string {
  if (!sentence || sentence.trim() === '') {
    return rendered;
  }
  const stripped = stripCleanReviewBlock(rendered);
  const base = trimTrailingNewlines(stripped);
  const cleanBlock = `${REVIEW_CLEAN_START_MARKER}\n${sentence.trim()}\n${REVIEW_CLEAN_END_MARKER}`;
  return base === '' ? `${cleanBlock}\n` : `${base}\n\n${cleanBlock}\n`;
}

