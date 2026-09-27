import type { LessonInput, LessonKind } from '../types/station.js';
import {
  findTable,
  countEscapedCells,
  renderMarkdownTable,
  replaceTableInDocument,
  type FindTableOptions,
} from './markdown-table.js';
import { stripTrailingCr } from './text-lines.js';
import { withoutFencedBlocks } from './markdown-fences.js';
import { parseStationTokens } from './constitution-parser.js';
import { estimateTokens } from './token-accounting.js';
import { normalizeStationName, type SddStation } from '../types/status.js';

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

  // A retired row's counters are its only evidence that the pattern was real,
  // and its root cause is gone — so an unattended harvest must not raise them.
  // Refusing loudly keeps the guarantee mechanical instead of leaving it to
  // whoever happens to read the sweep rules.
  if (existing.status === 'retired') {
    warnings.push(
      `retired row ${lesson.key}: frequency not incremented and no metadata unioned — record this occurrence in its description, or deliberately un-retire the row if the pattern is live again`,
    );
    return { entries: next, action: 'unchanged', warnings };
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

/** The cells one ledger row renders to — the single list both the table and the escaped-cell count use. */
function ledgerRowCells(e: LedgerEntry): string[] {
  return [
    e.key,
    e.description,
    String(e.frequency),
    e.impactModules.length > 0 ? `${e.impactModules.length} (${e.impactModules.join(',')})` : '0',
    e.kind,
    e.sourceChanges.join(', '),
    e.status,
  ];
}

/**
 * How many cells the table engine rewrites in the ONE row this upsert wrote or
 * updated, counted over the row as it renders (the stored description wins over
 * a re-report's, so the input text is never what gets escaped). An `unchanged`
 * upsert — retired row, or a source change already recorded — wrote nothing and
 * counts 0.
 */
export function escapedCellsFor(
  entries: readonly LedgerEntry[],
  action: UpsertResult['action'],
  key: string,
): number {
  if (action === 'unchanged') return 0;
  const row = entries.find((e) => e.key === key);
  return row ? countEscapedCells([ledgerRowCells(row)]) : 0;
}

/** Render the canonical ledger table (row order = entry order, stable). */
export function renderLedgerTable(entries: LedgerEntry[]): string {
  return renderMarkdownTable(LEDGER_COLUMNS, entries.map(ledgerRowCells));
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

/**
 * The retirement marker the Staleness Sweep writes on a retired playbook entry.
 * Case-sensitive on purpose, and a line that also carries `UN-RETIRED` is NOT a
 * retirement: a live entry records its retire-then-revive history as
 * `- **Retired {date}, UN-RETIRED {date}**`, and reading that as retired would
 * drop a live rule from the needs-review list for good.
 */
const PLAYBOOK_RETIRED_MARKER = /^\s*-\s+\*\*RETIRED\b(?!.*UN-RETIRED)/m;

const PLAYBOOK_TTL = /\*\*TTL\*\*:\s*(?:review by\s*)?(\d{4}-\d{2}-\d{2})/;

/** One `###`-headed block of `_playbook.md`: the heading text, its raw body lines
 *  (whatever endings the file uses) and the 1-based heading line. */
export interface PlaybookBlock {
  heading: string;
  lines: string[];
  line: number;
}

/** A `#`/`##` heading ends the block above it — `## Retired Entries` follows the last live entry. */
const PLAYBOOK_SECTION_HEADING = /^#{1,2}\s/;

/** THE rule for what one playbook block is — a `###` heading up to the next
 *  `###`, or to the `#`/`##` heading that ends its section — shared by the TTL
 *  report and the catalog, so the two cannot disagree. Headings are judged on
 *  the fence-blanked view (as the Constitution parser judges its rules), so a
 *  `# comment` inside a Guidance code fence splits nothing; the body lines are
 *  collected raw, so a block keeps its fences and whatever endings the file uses. */
export function splitPlaybookBlocks(playbookContent: string): PlaybookBlock[] {
  const raw = playbookContent.split('\n');
  const blocks: PlaybookBlock[] = [];
  let current: PlaybookBlock | null = null;
  withoutFencedBlocks(raw).forEach((view, i) => {
    const line = stripTrailingCr(view);
    const heading = /^###\s+(.+)$/.exec(line);
    if (heading) {
      current = { heading: heading[1]!.trim(), lines: [], line: i + 1 };
      blocks.push(current);
      return;
    }
    if (PLAYBOOK_SECTION_HEADING.test(line)) {
      current = null;
      return;
    }
    current?.lines.push(raw[i]!);
  });
  return blocks;
}

/** Parse playbook TTL lines; entries whose review-by date is before `today`
 *  belong on the needs-review list, except entries already retired.
 *  Conflict detection stays LLM judgment. */
export function expiredPlaybookEntries(playbookContent: string, today: string): PlaybookTtl[] {
  const expired: PlaybookTtl[] = [];
  for (const { heading, lines } of splitPlaybookBlocks(playbookContent)) {
    const block = lines.join('\n');
    // A retired entry's TTL is spent by definition — re-reporting it would
    // re-open a decision already made, so the needs-review list would grow
    // monotonically with dead rules.
    if (PLAYBOOK_RETIRED_MARKER.test(block)) continue;
    const ttl = PLAYBOOK_TTL.exec(block);
    if (ttl && ttl[1]! < today) expired.push({ entry: heading, reviewBy: ttl[1]! });
  }
  return expired;
}

/** A promoted playbook entry, as the catalog reads it. */
export interface PlaybookEntry {
  id: string;
  title: string;
  kind: string | null;
  /** The Source line's `modules=N (a, b)` list; null when the list is absent. */
  modules: string[] | null;
  /** null means no usable declaration; unknown nonempty tokens remain for diagnostics. */
  stations: 'all' | string[] | null;
  /** The `review by` date; null on a retired entry. */
  ttl: string | null;
  retired: boolean;
  /** The block verbatim, heading included, trailing blank lines trimmed. */
  text: string;
  tokens: number;
  overLimit: boolean;
}

export const PLAYBOOK_ENTRY_TOKEN_LIMIT = 300;

export interface PlaybookCatalogItem {
  entry: PlaybookEntry;
  /** The entry's modules intersect the request; this sorts station catalogs. */
  matched: boolean;
  /** Whether this entry's full text is printed. */
  bodySelected: boolean;
}

export type PlaybookWarning =
  | { kind: 'fallback' }
  | { kind: 'unknown-station'; id: string; token: string }
  | { kind: 'over-limit'; id: string; tokens: number; limit: number };

export type PlaybookSelectionMode = 'modules' | 'station' | 'legacy-fallback';

export type PlaybookSelection =
  | { kind: 'catalog'; catalog: PlaybookCatalogItem[]; mode: PlaybookSelectionMode; warnings: PlaybookWarning[] }
  | { kind: 'entry'; entry: PlaybookEntry; warnings: PlaybookWarning[] }
  | { kind: 'miss'; id: string };

/** `PB-{NNN}` — the format block's placeholder — is not an entry. */
const PLAYBOOK_ENTRY_HEADING = /^(PB-\d+):\s*(.+)$/;
const PLAYBOOK_SOURCE_LINE = /^\s*-\s+\*\*Source\*\*/;
/** The Source line's first module list — later bullets (`Strengthened …`) repeat
 *  `modules=N (…)` for the absorbed key, which is provenance, not the entry's scope. */
const PLAYBOOK_MODULES = /modules=\d+\s*\(([^)]*)\)/;
const PLAYBOOK_KIND = /\*\*Kind\*\*:\s*([^·]+?)\s*(?:·|$)/;
const PLAYBOOK_STATIONS_LINE = /^\s*-\s+\*\*Stations\*\*:\s*(.*)$/i;

export function parsePlaybookEntries(playbookContent: string): PlaybookEntry[] {
  const entries: PlaybookEntry[] = [];
  for (const block of splitPlaybookBlocks(playbookContent)) {
    const heading = PLAYBOOK_ENTRY_HEADING.exec(block.heading);
    if (heading === null) continue;
    const body = [...block.lines];
    while (body.length > 0 && stripTrailingCr(body[body.length - 1]!).trim() === '') body.pop();
    const bodyText = body.join('\n');
    const source = body.find((l) => PLAYBOOK_SOURCE_LINE.test(l)) ?? '';
    const moduleList = PLAYBOOK_MODULES.exec(source)?.[1];
    const retired = PLAYBOOK_RETIRED_MARKER.test(bodyText);
    const declaration = withoutFencedBlocks(body)
      .map((line) => PLAYBOOK_STATIONS_LINE.exec(stripTrailingCr(line))?.[1])
      .find((value) => value !== undefined);
    const parsedStations = declaration === undefined ? [] : parseStationTokens(declaration);
    const text = [`### ${block.heading}`, ...body].join('\n');
    const tokens = estimateTokens(text);
    entries.push({
      id: heading[1]!,
      title: heading[2]!.trim(),
      kind: PLAYBOOK_KIND.exec(stripTrailingCr(source))?.[1] ?? null,
      modules:
        moduleList === undefined
          ? null
          : moduleList
              .split(',')
              .map((m) => m.trim())
              .filter((m) => m.length > 0),
      stations: parsedStations === 'all' || parsedStations.length > 0 ? parsedStations : null,
      ttl: retired ? null : (PLAYBOOK_TTL.exec(bodyText)?.[1] ?? null),
      retired,
      text,
      tokens,
      overLimit: tokens > PLAYBOOK_ENTRY_TOKEN_LIMIT,
    });
  }
  return entries;
}

/**
 * The per-change playbook view: every active entry in the catalog, with station
 * declarations selecting bodies in station mode and modules selecting them in
 * legacy mode, or one active entry by exact id. Retired entries are excluded.
 */
export function selectPlaybookEntries(
  entries: PlaybookEntry[],
  selector: { modules: string[] } | { station: SddStation; modules?: string[] } | { id: string },
): PlaybookSelection {
  const active = entries.filter((e) => !e.retired);
  if ('id' in selector) {
    const entry = active.find((e) => e.id === selector.id);
    return entry === undefined ? { kind: 'miss', id: selector.id } : { kind: 'entry', entry, warnings: playbookWarnings([entry]) };
  }
  const station = 'station' in selector ? selector.station : undefined;
  const fallback = station !== undefined && active.every((entry) => entry.stations === null);
  const requestedModules = selector.modules ?? (fallback
    ? active.flatMap((entry) => entry.modules ?? [])
    : []);
  const wanted = new Set(requestedModules.map((m) => m.trim()).filter((m) => m.length > 0));
  const items = active.map((entry) => ({
    entry,
    matched: entry.modules !== null && entry.modules.some((m) => wanted.has(m)),
    bodySelected: false,
  }));
  for (const item of items) {
    item.bodySelected = station !== undefined && !fallback
      ? item.entry.stations === 'all' || (item.entry.stations?.includes(station) ?? false)
      : item.matched;
  }
  return {
    kind: 'catalog',
    catalog: [...items.filter((i) => i.matched), ...items.filter((i) => !i.matched)],
    mode: fallback ? 'legacy-fallback' : station === undefined ? 'modules' : 'station',
    warnings: [...(fallback ? [{ kind: 'fallback' } as const] : []), ...playbookWarnings(active)],
  };
}

function playbookWarnings(entries: PlaybookEntry[]): PlaybookWarning[] {
  const warnings: PlaybookWarning[] = [];
  for (const entry of entries) {
    if (entry.stations !== null && entry.stations !== 'all') {
      for (const token of new Set(entry.stations.filter((station) => normalizeStationName(station) === null))) {
        warnings.push({ kind: 'unknown-station', id: entry.id, token });
      }
    }
    if (entry.overLimit) warnings.push({ kind: 'over-limit', id: entry.id, tokens: entry.tokens, limit: PLAYBOOK_ENTRY_TOKEN_LIMIT });
  }
  return warnings;
}
