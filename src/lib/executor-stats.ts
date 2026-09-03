import { DIMENSION_GRADED_BY, DIMENSION_RESULTS, VERIFY_GRADES } from '../types/change.js';
import { normalizeExecutorLabel } from './config.js';
import {
  ExecutorStatsReportSchema,
  type ExecutorStat,
  type ExecutorStatsReport,
} from '../types/station.js';

/**
 * Pure per-executor aggregation over parsed archive `metadata.yaml` documents —
 * the first consumer of the self-declared `executor` field (`prospec learn stats`).
 *
 * Every rule lives here and nowhere else:
 * - the group key is `quality_log[].dimensions[].executor`, normalized by
 *   `normalizeExecutorLabel` (trimmed, whitespace runs — line breaks included —
 *   collapsed to one space: archive metadata is untrusted input and a label must
 *   never forge a report line); a non-machine dimension without one increments
 *   `unlabeled_dimensions` and forms no group;
 * - each `prospec-verify` entry carrying a `grade` credits that grade ONCE to every
 *   distinct executor among its dimensions;
 * - dimension results and grading contexts are counted per dimension;
 * - `spend` takes ONE sample per (entry, executor) — the flag form copies one spend
 *   onto every dimension, so per-dimension sampling would triple it — and only a
 *   finite, non-negative value is a sample: the report contract is never-fatal, so a
 *   corrupt spend is ignored rather than allowed to fail the final schema parse;
 * - a false green is counted at most once per change for the executor named in
 *   `review_provenance.executor` when a `prospec-verify` entry dated on or after
 *   the baseline carries any FAIL dimension (day granularity: a conservative
 *   lower bound, since a same-day FAIL-then-record sequence also counts).
 *
 * Records are `unknown` on purpose: archive metadata is read leniently (pre-schema
 * records included), so every field is type-guarded rather than trusted.
 */
export function aggregateExecutorStats(
  records: unknown[],
  generatedAt: string,
  skipped = 0,
): ExecutorStatsReport {
  const groups = new Map<string, MutableStat>();
  let unlabeled = 0;

  for (const record of records) {
    if (!isRecord(record)) continue;
    const executorsInChange = new Set<string>();
    const verifyEntries = asArray(record.quality_log).filter(isVerifyEntry);

    for (const entry of verifyEntries) {
      const executorsInEntry = new Set<string>();
      const spendSampled = new Set<string>();
      for (const dim of asArray(entry.dimensions)) {
        if (!isRecord(dim)) continue;
        const executor = typeof dim.executor === 'string' ? normalizeExecutorLabel(dim.executor) : '';
        if (executor === '') {
          if (dim.adjudicator !== 'machine') unlabeled++;
          continue;
        }
        const stat = group(groups, executor);
        executorsInEntry.add(executor);
        executorsInChange.add(executor);
        if (isOneOf(dim.result, DIMENSION_RESULTS)) stat.dimension_results[dim.result]++;
        if (isOneOf(dim.graded_by, DIMENSION_GRADED_BY)) stat.graded_by[dim.graded_by]++;
        if (isSpendSample(dim.spend) && !spendSampled.has(executor)) {
          spendSampled.add(executor);
          stat.spendSamples.push(dim.spend);
        }
      }
      for (const executor of executorsInEntry) {
        const stat = group(groups, executor);
        stat.verify_entries++;
        if (isOneOf(entry.grade, VERIFY_GRADES)) stat.grades[entry.grade]++;
      }
    }

    const baseline = isRecord(record.review_provenance) ? record.review_provenance : undefined;
    const reviewerRaw = baseline?.executor;
    const reviewer = typeof reviewerRaw === 'string' ? normalizeExecutorLabel(reviewerRaw) : '';
    if (reviewer !== '') {
      const stat = group(groups, reviewer);
      stat.review_baselines++;
      executorsInChange.add(reviewer);
      const baselineDate = typeof baseline?.date === 'string' ? baseline.date : '';
      const failedAfterBaseline = verifyEntries.some(
        (entry) =>
          typeof entry.date === 'string' &&
          entry.date >= baselineDate &&
          asArray(entry.dimensions).some((dim) => isRecord(dim) && dim.result === 'FAIL'),
      );
      if (failedAfterBaseline) stat.false_greens++;
    }

    for (const executor of executorsInChange) group(groups, executor).changes++;
  }

  const stats: ExecutorStat[] = [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, s]) => ({
      executor: s.executor,
      changes: s.changes,
      verify_entries: s.verify_entries,
      grades: s.grades,
      dimension_results: s.dimension_results,
      graded_by: s.graded_by,
      spend: { samples: s.spendSamples.length, median: median(s.spendSamples) },
      review_baselines: s.review_baselines,
      false_greens: s.false_greens,
    }));

  return ExecutorStatsReportSchema.parse({
    generated_at: generatedAt,
    total_changes_analyzed: records.length,
    skipped,
    unlabeled_dimensions: unlabeled,
    stats,
  });
}

interface MutableStat extends Omit<ExecutorStat, 'spend'> {
  spendSamples: number[];
}

function group(groups: Map<string, MutableStat>, executor: string): MutableStat {
  let stat = groups.get(executor);
  if (!stat) {
    stat = {
      executor,
      changes: 0,
      verify_entries: 0,
      grades: zeroed(VERIFY_GRADES),
      dimension_results: zeroed(DIMENSION_RESULTS),
      graded_by: zeroed(DIMENSION_GRADED_BY),
      spendSamples: [],
      review_baselines: 0,
      false_greens: 0,
    };
    groups.set(executor, stat);
  }
  return stat;
}

function zeroed<const K extends readonly string[]>(keys: K): Record<K[number], number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K[number], number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isSpendSample(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isVerifyEntry(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.skill === 'prospec-verify';
}

function isOneOf<const K extends readonly string[]>(value: unknown, keys: K): value is K[number] {
  return typeof value === 'string' && (keys as readonly string[]).includes(value);
}

/** Median of the samples; `null` when there are none. */
export function median(samples: readonly number[]): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
