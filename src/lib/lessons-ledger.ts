import type { LessonInput, LessonKind } from '../types/station.js';
import {
  findTable,
  renderMarkdownTable,
  replaceTableInDocument,
  type FindTableOptions,
} from './markdown-table.js';

/**
 * Deterministic mechanics for the lessons ledger
 * (`{knowledge_base_path}/_lessons-ledger.md`).
 *
 * The format truth stays in `references/promotion-format.hbs` — this module is
 * its executable copy for the parts that never needed an LLM: the keyed upsert
 * (frequency increment, source_changes / impact_modules union), the explicit
 * scoring rule (`freq≥3 ∧ modules≥2 ⇒ suggest`), and playbook TTL expiry.
 * Semantic matching ("are these the same lesson?" → the key) and conflict
 * detection between rules remain LLM judgment upstream.
 */

export const LEDGER_STATUSES = [
  'personal',
  'suggest-promote',
  'promoted',
  'declined',
  'retired',
] as const;
export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

export interface LedgerEntry {
  key: string;
  description: string;
  /** Distinct changes this lesson recurred across — an incremented counter, never re-derived. */
  frequency: number;
  impactModules: string[];
  kind: LessonKind;
  sourceChanges: string[];
  status: LedgerStatus;
}

export interface ScoreThresholds {
  frequency: number;
  impact_modules: number;
}

export const DEFAULT_SCORE_THRESHOLDS: ScoreThresholds = { frequency: 3, impact_modules: 2 };

const LEDGER_COLUMNS = [
  'key',
  'description',
  'frequency',
  'impact_modules',
  'kind',
  'source_changes',
  'status',
] as const;

// The real ledger has blank lines INSIDE the table (hand-edited over months) —
// stopping at the first non-`|` line would hide every row after the gap, so an
// upsert re-creates keys the ledger already holds. `spanBlankLines` scans
// across the gaps and ends at the last `|` row.
const LEDGER_TABLE: FindTableOptions = {
  isTarget: (headers) => headers.includes('key') && headers.includes('frequency'),
  spanBlankLines: true,
};

/** `2 (templates,tests)` → ['templates', 'tests']; a bare count or empty cell → []. */
function parseImpactModules(cell: string): string[] {
  const inParens = /\(([^)]*)\)/.exec(cell)?.[1] ?? '';
  return inParens
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
}

function toStatus(value: string): LedgerStatus {
  const v = value.trim() as LedgerStatus;
  return (LEDGER_STATUSES as readonly string[]).includes(v) ? v : 'personal';
}

/** Parse ledger rows out of the file content (no table → []). */
export function parseLedger(content: string): LedgerEntry[] {
  const table = findTable(content.split('\n'), LEDGER_TABLE);
  if (!table) return [];
  return table.rows
    .filter((cells) => (cells[0] ?? '') !== '')
    // A gap-spanning table may repeat a header or separator row — never
    // parse those as lessons.
    .filter((cells) => cells[0]!.toLowerCase() !== 'key')
    .filter((cells) => !cells.every((c) => c === '' || /^:?-+:?$/.test(c)))
    .map((cells) => ({
      key: cells[0]!,
      description: cells[1] ?? '',
      frequency: Number.parseInt(cells[2] ?? '1', 10) || 1,
      impactModules: parseImpactModules(cells[3] ?? ''),
      kind: (cells[4] as LessonKind) ?? 'convention',
      sourceChanges: (cells[5] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      status: toStatus(cells[6] ?? 'personal'),
    }));
}

export interface UpsertResult {
  entries: LedgerEntry[];
  /** What the upsert did — the CLI reports it, the skill narrates it. */
  action: 'created' | 'incremented' | 'unchanged';
  warnings: string[];
}

/**
 * Keyed idempotent upsert. `frequency` counts DISTINCT source changes: a
 * re-report from an already-recorded change unions metadata but does not
 * increment. The stored description and kind win over a re-report's (the
 * ledger row may carry hand-written provenance suffixes) — a kind mismatch is
 * surfaced as a warning, never silently overwritten.
 */
export function upsertLesson(entries: LedgerEntry[], lesson: LessonInput): UpsertResult {
  const next = entries.map((e) => ({
    ...e,
    impactModules: [...e.impactModules],
    sourceChanges: [...e.sourceChanges],
  }));
  const warnings: string[] = [];
  const existing = next.find((e) => e.key === lesson.key);

  if (!existing) {
    next.push({
      key: lesson.key,
      description: lesson.description,
      frequency: 1,
      impactModules: [...new Set(lesson.impact_modules)],
      kind: lesson.kind,
      sourceChanges: [lesson.source_change],
      status: 'personal',
    });
    return { entries: next, action: 'created', warnings };
  }

  if (existing.kind !== lesson.kind) {
    warnings.push(
      `kind mismatch for ${lesson.key}: ledger has '${existing.kind}', input says '${lesson.kind}' — ledger value kept`,
    );
  }
  for (const m of lesson.impact_modules) {
    if (!existing.impactModules.includes(m)) existing.impactModules.push(m);
  }
  if (existing.sourceChanges.includes(lesson.source_change)) {
    return { entries: next, action: 'unchanged', warnings };
  }
  existing.sourceChanges.push(lesson.source_change);
  existing.frequency += 1;
  return { entries: next, action: 'incremented', warnings };
}

export interface ScoreSuggestion {
  key: string;
  detail: string;
}

export interface ScoreResult {
  entries: LedgerEntry[];
  suggestions: ScoreSuggestion[];
}

/**
 * Apply the explicit promotion rule. Only `personal` rows can advance to
 * `suggest-promote`; `promoted` / `declined` / `retired` are never touched
 * (declined items are not re-suggested). Every suggestion — including a row
 * already at `suggest-promote` — emits the auditable score detail.
 */
export function scoreLessons(
  entries: LedgerEntry[],
  thresholds: ScoreThresholds = DEFAULT_SCORE_THRESHOLDS,
): ScoreResult {
  const next = entries.map((e) => ({ ...e }));
  const suggestions: ScoreSuggestion[] = [];
  const rule = `rule=freq≥${thresholds.frequency} ∧ modules≥${thresholds.impact_modules} ⇒ suggest`;
  for (const entry of next) {
    const qualifies =
      entry.frequency >= thresholds.frequency &&
      entry.impactModules.length >= thresholds.impact_modules;
    if (!qualifies) continue;
    if (entry.status === 'personal') entry.status = 'suggest-promote';
    if (entry.status === 'suggest-promote') {
      suggestions.push({
        key: entry.key,
        detail: `frequency=${entry.frequency} · impact_modules=${entry.impactModules.length} · kind=${entry.kind} · ${rule}`,
      });
    }
  }
  return { entries: next, suggestions };
}

/** Render the canonical ledger table (row order = entry order, stable). */
export function renderLedgerTable(entries: LedgerEntry[]): string {
  return renderMarkdownTable(
    LEDGER_COLUMNS,
    entries.map((e) => [
      e.key,
      e.description,
      String(e.frequency),
      e.impactModules.length > 0
        ? `${e.impactModules.length} (${e.impactModules.join(',')})`
        : '0',
      e.kind,
      e.sourceChanges.join(', '),
      e.status,
    ]),
  );
}

/** Replace the ledger table in the file, preserving surrounding prose. */
export function renderLedgerDocument(content: string, entries: LedgerEntry[]): string {
  return replaceTableInDocument(content, renderLedgerTable(entries), {
    ...LEDGER_TABLE,
    scaffoldTitle: '# Lessons Ledger',
  });
}

/** `- **TTL**: review by 2026-12-11` lines in `_playbook.md`, with their entry heading. */
export interface PlaybookTtl {
  entry: string;
  reviewBy: string; // YYYY-MM-DD
}

/** Parse playbook TTL lines; entries whose review-by date is before `today`
 *  belong on the needs-review list. Conflict detection stays LLM judgment. */
export function expiredPlaybookEntries(playbookContent: string, today: string): PlaybookTtl[] {
  const lines = playbookContent.split('\n');
  let currentEntry = '';
  const expired: PlaybookTtl[] = [];
  for (const line of lines) {
    const heading = /^###\s+(.+)$/.exec(line);
    if (heading) {
      currentEntry = heading[1]!.trim();
      continue;
    }
    const ttl = /\*\*TTL\*\*:\s*(?:review by\s*)?(\d{4}-\d{2}-\d{2})/.exec(line);
    if (ttl && currentEntry && ttl[1]! < today) {
      expired.push({ entry: currentEntry, reviewBy: ttl[1]! });
    }
  }
  return expired;
}
