import type { ReviewRow } from './review-merge.js';
import {
  REVIEW_CONFIRMED_STATUSES,
  hasReviewStatus,
  LensYieldThresholdsSchema,
  type LensYieldStat,
  type LensYieldThresholds,
  type LensYieldReport,
  type LensRetirementAction,
} from '../types/station.js';

export const DEFAULT_LENS_THRESHOLDS: LensYieldThresholds = LensYieldThresholdsSchema.parse({});

export interface ChangeReviewEntry {
  changeName: string;
  rows: ReviewRow[];
  date?: string;
  lensesRun?: string[];
}

/**
 * Normalize lens identifier (trim whitespace and convert to lowercase for matching).
 */
export function normalizeLens(lens: string): string {
  return lens.trim().toLowerCase();
}

/**
 * Check whether a review finding status is confirmed (i.e. 'confirmed', 'fixed', or 'verified').
 */
export function isConfirmedFinding(status: string | undefined | null): boolean {
  return hasReviewStatus(REVIEW_CONFIRMED_STATUSES, status);
}

/**
 * Compute confirmed yield statistics across changes.
 */
export function calculateLensYield(
  corpus: ChangeReviewEntry[],
  customThresholds?: Partial<LensYieldThresholds>,
): LensYieldStat[] {
  const thresholds: LensYieldThresholds = {
    ...DEFAULT_LENS_THRESHOLDS,
    ...customThresholds,
  };

  if (corpus.length === 0) {
    return [];
  }

  // Map normalized lens name -> display name and accumulated metrics
  const lensMap = new Map<
    string,
    {
      displayName: string;
      invocations: number;
      confirmedFindings: number;
      changesWithConfirmed: number;
      lastYieldChange?: string;
      consecutiveZeroChanges: number;
      declaredInvocations: number;
    }
  >();

  const ensureLens = (raw: string) => {
    const norm = normalizeLens(raw);
    let data = lensMap.get(norm);
    if (!data) {
      data = {
        displayName: raw.trim(),
        invocations: 0,
        confirmedFindings: 0,
        changesWithConfirmed: 0,
        consecutiveZeroChanges: 0,
        declaredInvocations: 0,
      };
      lensMap.set(norm, data);
    }
    return data;
  };

  // Traverse changes chronologically
  for (const change of corpus) {
    // Group findings for this change by normalized lens
    const changeLensFindings = new Map<string, ReviewRow[]>();
    for (const row of change.rows) {
      if (!row.lens || row.lens.trim() === '') continue;
      const norm = normalizeLens(row.lens);
      const list = changeLensFindings.get(norm) ?? [];
      list.push(row);
      changeLensFindings.set(norm, list);
    }

    // Declared lenses are the ground truth for "this lens ran"; a lens that was
    // not declared but reported a finding ran too (rows proxy) and is counted,
    // otherwise its confirmed findings would vanish from the statistics.
    const declared = new Map<string, string>();
    for (const l of change.lensesRun ?? []) {
      if (l && l.trim()) declared.set(normalizeLens(l), l);
    }
    const invoked = new Map(declared);
    for (const row of change.rows) {
      if (!row.lens || !row.lens.trim()) continue;
      const norm = normalizeLens(row.lens);
      if (!invoked.has(norm)) invoked.set(norm, row.lens);
    }

    for (const [norm, raw] of invoked) {
      const lensData = ensureLens(raw);
      lensData.invocations += 1;
      if (declared.has(norm)) {
        lensData.declaredInvocations += 1;
      }
      const findingsInChange = changeLensFindings.get(norm) ?? [];
      const confirmedCount = findingsInChange.filter((r) =>
        isConfirmedFinding(r.status),
      ).length;
      lensData.confirmedFindings += confirmedCount;

      if (confirmedCount > 0) {
        lensData.changesWithConfirmed += 1;
        lensData.lastYieldChange = change.changeName;
        lensData.consecutiveZeroChanges = 0;
      } else {
        lensData.consecutiveZeroChanges += 1;
      }
    }
  }

  // Build raw stats
  const rawStats: LensYieldStat[] = [];
  for (const data of lensMap.values()) {
    const yieldRatio =
      data.invocations > 0
        ? Math.round((data.changesWithConfirmed / data.invocations) * 1000) / 1000
        : 0;
    const confirmedPerInvocation =
      data.invocations > 0
        ? Math.round((data.confirmedFindings / data.invocations) * 100) / 100
        : 0;

    rawStats.push({
      lens: data.displayName,
      invocations: data.invocations,
      declared_invocations: data.declaredInvocations,
      confirmed_findings: data.confirmedFindings,
      yield_ratio: yieldRatio,
      confirmed_per_invocation: confirmedPerInvocation,
      consecutive_zero_changes: data.consecutiveZeroChanges,
      last_yield_change: data.lastYieldChange,
      action: 'keep',
      invocation_source: data.declaredInvocations > 0 ? 'declared' : 'rows',
    });
  }

  return recommendLensRetirement(rawStats, thresholds);
}

/**
 * Assign retirement recommendations and sort by yield ascending.
 */
export function recommendLensRetirement(
  stats: LensYieldStat[],
  thresholds: LensYieldThresholds,
): LensYieldStat[] {
  const result: LensYieldStat[] = stats.map((stat) => {
    let action: LensRetirementAction = 'keep';
    let reason = 'Yield meets criteria';

    if (stat.invocation_source === 'rows') {
      return {
        ...stat,
        action: 'keep',
        reason:
          'Invocation count is a proxy (rows only) — declare lenses at merge time to enable retirement',
      };
    }

    // Only declared runs count toward the evidence bar: a legacy (rows-only)
    // change can reset the streak with a real finding, but must not by itself
    // make a lens eligible for retirement.
    const declaredRuns = stat.declared_invocations ?? stat.invocations;
    const enough = declaredRuns >= thresholds.min_invocations;
    if (enough && stat.consecutive_zero_changes >= thresholds.consecutive_zero_threshold) {
      action = 'retire';
      reason = `Consecutive zero confirmed findings for ${stat.consecutive_zero_changes} changes (threshold: ${thresholds.consecutive_zero_threshold}; ${declaredRuns} declared invocations)`;
    } else if (enough && stat.yield_ratio < thresholds.min_yield) {
      action = 'review';
      reason = `Yield ratio (${stat.yield_ratio}) below threshold (${thresholds.min_yield})`;
    } else if (!enough) {
      reason = `Only ${declaredRuns} declared invocation(s) — below min_invocations ${thresholds.min_invocations}`;
    }

    return {
      ...stat,
      action,
      reason,
    };
  });

  // Sort by yield ascending, then by consecutive_zero_changes descending
  result.sort((a, b) => {
    if (a.yield_ratio !== b.yield_ratio) {
      return a.yield_ratio - b.yield_ratio;
    }
    return b.consecutive_zero_changes - a.consecutive_zero_changes;
  });

  return result;
}

/**
 * Build complete LensYieldReport.
 */
export function buildLensYieldReport(
  stats: LensYieldStat[],
  totalChangesAnalyzed: number,
  thresholds: LensYieldThresholds,
): LensYieldReport {
  return {
    generated_at: new Date().toISOString(),
    total_changes_analyzed: totalChangesAnalyzed,
    thresholds,
    stats,
  };
}

