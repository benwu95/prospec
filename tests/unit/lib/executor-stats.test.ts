import { describe, it, expect } from 'vitest';
import { aggregateExecutorStats, median } from '../../../src/lib/executor-stats.js';
import { ExecutorStatsReportSchema } from '../../../src/types/station.js';
import { VERIFY_GRADES, DIMENSION_RESULTS, DIMENSION_GRADED_BY } from '../../../src/types/change.js';

const AT = '2026-09-03T00:00:00.000Z';

function dim(
  name: string,
  result: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return { name, result, adjudicator: 'judgment', graded_by: 'fresh-subagent', ...over };
}

function verify(
  date: string,
  grade: string,
  dimensions: Record<string, unknown>[],
): Record<string, unknown> {
  return { skill: 'prospec-verify', date, result: 'PASS', warnings: [], grade, dimensions };
}

const stat = (report: ReturnType<typeof aggregateExecutorStats>, executor: string) =>
  report.stats.find((s) => s.executor === executor);

describe('aggregateExecutorStats (REQ-LIB-076)', () => {
  it('returns an empty, schema-valid report for an empty corpus', () => {
    const report = aggregateExecutorStats([], AT);
    expect(report).toEqual({
      generated_at: AT,
      total_changes_analyzed: 0,
      skipped: 0,
      unlabeled_dimensions: 0,
      stats: [],
    });
    expect(ExecutorStatsReportSchema.safeParse(report).success).toBe(true);
  });

  it('credits a verify entry\'s grade ONCE per distinct executor and samples spend once per (entry, executor)', () => {
    const report = aggregateExecutorStats(
      [
        {
          quality_log: [
            verify('2026-09-01', 'S', [
              dim('delta-spec-compliance', 'PASS', { executor: 'judge', spend: 12000 }),
              dim('constitution', 'WARN', { executor: 'judge', spend: 12000 }),
              dim('design', 'not-applicable', { executor: 'judge', spend: 12000 }),
            ]),
          ],
        },
      ],
      AT,
    );
    const judge = stat(report, 'judge')!;
    expect(judge.changes).toBe(1);
    expect(judge.verify_entries).toBe(1);
    expect(judge.grades.S).toBe(1);
    expect(judge.grades.A).toBe(0);
    expect(judge.dimension_results).toMatchObject({ PASS: 1, WARN: 1, FAIL: 0, 'not-applicable': 1, 'not-adjudicated': 0 });
    expect(judge.graded_by).toEqual({ 'fresh-subagent': 3, 'in-session': 0 });
    expect(judge.spend).toEqual({ samples: 1, median: 12000 });
    expect(report.unlabeled_dimensions).toBe(0);
  });

  it('carries a zero key for every registered grade, result and grading context', () => {
    const report = aggregateExecutorStats(
      [{ quality_log: [verify('2026-09-01', 'A', [dim('constitution', 'PASS', { executor: 'x' })])] }],
      AT,
    );
    const x = stat(report, 'x')!;
    expect(Object.keys(x.grades).sort()).toEqual([...VERIFY_GRADES].sort());
    expect(Object.keys(x.dimension_results).sort()).toEqual([...DIMENSION_RESULTS].sort());
    expect(Object.keys(x.graded_by).sort()).toEqual([...DIMENSION_GRADED_BY].sort());
  });

  it('counts a non-machine dimension without an executor as unlabeled, never as a group; machine dimensions are not counted', () => {
    const report = aggregateExecutorStats(
      [
        {
          quality_log: [
            verify('2026-09-01', 'S', [
              { name: 'task-completion', result: 'PASS', adjudicator: 'machine' },
              dim('constitution', 'PASS'),
              dim('design', 'PASS', { executor: '   ' }),
              { name: 'delta-spec-compliance', result: 'PASS' }, // pre-adjudicator record
            ]),
          ],
        },
      ],
      AT,
    );
    expect(report.stats).toEqual([]);
    expect(report.unlabeled_dimensions).toBe(3);
  });

  it('trims the executor and attributes different executors within one entry separately', () => {
    const report = aggregateExecutorStats(
      [
        {
          quality_log: [
            verify('2026-09-01', 'B', [
              dim('delta-spec-compliance', 'FAIL', { executor: ' a ', spend: 10 }),
              dim('constitution', 'PASS', { executor: 'b', spend: 30, graded_by: 'in-session' }),
              dim('design', 'PASS', { executor: 'a', spend: 10 }),
            ]),
          ],
        },
      ],
      AT,
    );
    expect(report.stats.map((s) => s.executor)).toEqual(['a', 'b']);
    expect(stat(report, 'a')!.grades.B).toBe(1);
    expect(stat(report, 'b')!.grades.B).toBe(1);
    expect(stat(report, 'a')!.spend).toEqual({ samples: 1, median: 10 });
    expect(stat(report, 'b')!.graded_by['in-session']).toBe(1);
  });

  it('computes the median over samples from many entries (odd and even counts)', () => {
    const entries = (spends: number[]) =>
      spends.map((s, i) => verify(`2026-09-0${i + 1}`, 'S', [dim('constitution', 'PASS', { executor: 'e', spend: s })]));
    expect(stat(aggregateExecutorStats([{ quality_log: entries([30, 10, 20]) }], AT), 'e')!.spend).toEqual({ samples: 3, median: 20 });
    expect(stat(aggregateExecutorStats([{ quality_log: entries([40, 10, 20, 30]) }], AT), 'e')!.spend).toEqual({ samples: 4, median: 25 });
    expect(stat(aggregateExecutorStats([{ quality_log: entries([]) .concat(verify('2026-09-01', 'S', [dim('constitution', 'PASS', { executor: 'e' })])) }], AT), 'e')!.spend).toEqual({ samples: 0, median: null });
  });

  it('ignores a negative or non-finite spend instead of crashing the whole report (review R1-1 pin)', () => {
    const report = aggregateExecutorStats(
      [
        {
          quality_log: [
            verify('2026-09-01', 'S', [
              dim('delta-spec-compliance', 'PASS', { executor: 'e', spend: -1 }),
              dim('constitution', 'PASS', { executor: 'e', spend: Number.NaN }),
              dim('design', 'PASS', { executor: 'e', spend: Number.POSITIVE_INFINITY }),
            ]),
            verify('2026-09-02', 'S', [dim('constitution', 'PASS', { executor: 'e', spend: 40 })]),
          ],
        },
      ],
      AT,
    );
    expect(stat(report, 'e')!.spend).toEqual({ samples: 1, median: 40 });
    expect(stat(report, 'e')!.grades.S).toBe(2);
  });

  it('counts a false green at most once per change for the review baseline executor', () => {
    const change = {
      review_provenance: { digest: 'd', date: '2026-09-01', graded_by: 'fresh-subagent', executor: 'reviewer' },
      quality_log: [
        verify('2026-09-01', 'C', [dim('constitution', 'FAIL', { executor: 'judge' })]),
        verify('2026-09-02', 'C', [dim('constitution', 'FAIL', { executor: 'judge' })]),
      ],
    };
    const report = aggregateExecutorStats([change], AT);
    const reviewer = stat(report, 'reviewer')!;
    expect(reviewer.review_baselines).toBe(1);
    expect(reviewer.false_greens).toBe(1);
    expect(reviewer.changes).toBe(1);
    expect(reviewer.verify_entries).toBe(0);
    expect(stat(report, 'judge')!.grades.C).toBe(2);
  });

  it('counts a same-day FAIL after the baseline (day granularity — the conservative lower bound the legend states)', () => {
    const report = aggregateExecutorStats(
      [
        {
          review_provenance: { digest: 'd', date: '2026-09-01', executor: 'reviewer' },
          quality_log: [verify('2026-09-01', 'C', [dim('constitution', 'FAIL', { executor: 'judge' })])],
        },
      ],
      AT,
    );
    expect(stat(report, 'reviewer')!.false_greens).toBe(1);
  });

  it('normalizes labels from untrusted archive metadata: line breaks and whitespace runs collapse to one space', () => {
    const report = aggregateExecutorStats(
      [
        {
          review_provenance: { digest: 'd', date: '2026-09-01', executor: 'jud\nge' },
          quality_log: [
            verify('2026-09-02', 'S', [
              dim('constitution', 'PASS', { executor: 'jud\nge' }),
              dim('design', 'PASS', { executor: '  jud   ge ' }),
            ]),
          ],
        },
      ],
      AT,
    );
    expect(report.stats.map((s) => s.executor)).toEqual(['jud ge']);
    expect(stat(report, 'jud ge')!.review_baselines).toBe(1);
    expect(stat(report, 'jud ge')!.dimension_results.PASS).toBe(2);
  });

  it('does not count a FAIL that predates the review baseline, nor a baseline without an executor', () => {
    const report = aggregateExecutorStats(
      [
        {
          review_provenance: { digest: 'd', date: '2026-09-02', executor: 'reviewer' },
          quality_log: [verify('2026-09-01', 'C', [dim('constitution', 'FAIL', { executor: 'judge' })])],
        },
        {
          review_provenance: { digest: 'd', date: '2026-09-01' },
          quality_log: [verify('2026-09-02', 'C', [dim('constitution', 'FAIL', { executor: 'judge' })])],
        },
      ],
      AT,
    );
    expect(stat(report, 'reviewer')!.false_greens).toBe(0);
    expect(stat(report, 'reviewer')!.review_baselines).toBe(1);
    expect(stat(report, 'judge')!.changes).toBe(2);
    expect(report.total_changes_analyzed).toBe(2);
  });

  it('ignores non-verify entries, malformed records and unknown grades, and threads `skipped` through', () => {
    const report = aggregateExecutorStats(
      [
        null,
        'garbage',
        { quality_log: 'not-an-array' },
        {
          quality_log: [
            { skill: 'prospec-review', date: '2026-09-01', result: 'PASS', dimensions: [dim('x', 'FAIL', { executor: 'nope' })] },
            verify('2026-09-01', 'Z', [dim('constitution', 'PASS', { executor: 'e' })]),
          ],
        },
      ],
      AT,
      2,
    );
    expect(report.skipped).toBe(2);
    expect(report.total_changes_analyzed).toBe(4);
    expect(report.stats.map((s) => s.executor)).toEqual(['e']);
    expect(Object.values(stat(report, 'e')!.grades).reduce((a, b) => a + b, 0)).toBe(0);
    expect(stat(report, 'e')!.verify_entries).toBe(1);
  });

  it('orders executors by code point, not locale', () => {
    const report = aggregateExecutorStats(
      [
        {
          quality_log: [
            verify('2026-09-01', 'S', [
              dim('constitution', 'PASS', { executor: 'b' }),
              dim('design', 'PASS', { executor: 'B' }),
              dim('delta-spec-compliance', 'PASS', { executor: 'a' }),
            ]),
          ],
        },
      ],
      AT,
    );
    expect(report.stats.map((s) => s.executor)).toEqual(['B', 'a', 'b']);
  });
});

describe('median', () => {
  it('handles empty, odd and even sample sets', () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
