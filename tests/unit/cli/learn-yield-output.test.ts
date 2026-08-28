import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatLensYieldOutput } from '../../../src/cli/formatters/learn-output.js';
import type { LensYieldReport } from '../../../src/types/station.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function captureStdout(fn: () => void): string {
  const writes: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    writes.push(String(chunk));
    return true;
  });
  fn();
  return writes.join('');
}

const baseReport: LensYieldReport = {
  generated_at: '2026-08-28T00:00:00Z',
  total_changes_analyzed: 5,
  thresholds: {
    consecutive_zero_threshold: 5,
    min_invocations: 3,
    min_yield: 0.1,
  },
  stats: [
    {
      lens: 'correctness',
      invocations: 5,
      confirmed_findings: 10,
      yield_ratio: 1.0,
      consecutive_zero_changes: 0,
      action: 'keep',
      reason: 'Yield meets criteria',
      invocation_source: 'declared',
    },
    {
      lens: 'dead-lens',
      invocations: 5,
      confirmed_findings: 0,
      yield_ratio: 0.0,
      consecutive_zero_changes: 5,
      action: 'retire',
      reason: 'Consecutive zero confirmed findings for 5 changes',
      invocation_source: 'declared',
    },
  ],
};

describe('learn yield output formatter', () => {
  it('formats table output and retirement recommendations', () => {
    const out = captureStdout(() => formatLensYieldOutput(baseReport));
    expect(out).toContain('Review Lens Confirmed Yield Statistics (5 changes analyzed)');
    expect(out).toContain('correctness');
    expect(out).toContain('dead-lens');
    expect(out).toContain('100.0%');
    expect(out).toContain('0.0%');
    expect(out).toContain('retire');
    expect(out).toContain('keep');
    expect(out).toContain('Staleness Retirement Recommendations:');
    expect(out).toContain('dead-lens: Consecutive zero confirmed findings for 5 changes');
  });

  it('shows the invocation source column, distinguishing declared from rows-proxy keeps', () => {
    const report: LensYieldReport = {
      ...baseReport,
      stats: [
        {
          // Lens names deliberately carry NO 'declared'/'rows' token, so the
          // per-row assertions below can only pass if the Source column actually
          // renders each row's invocation_source value.
          lens: 'lens-a',
          invocations: 5,
          confirmed_findings: 8,
          yield_ratio: 0.8,
          consecutive_zero_changes: 0,
          action: 'keep',
          reason: 'Yield meets criteria',
          invocation_source: 'declared',
        },
        {
          lens: 'lens-b',
          invocations: 2,
          confirmed_findings: 1,
          yield_ratio: 0.5,
          consecutive_zero_changes: 0,
          action: 'keep',
          reason: 'Invocation count is a proxy (rows only)',
          invocation_source: 'rows',
        },
      ],
    };
    const out = captureStdout(() => formatLensYieldOutput(report));
    expect(out).toContain('Source');
    const declaredLine = out.split('\n').find((l) => l.includes('lens-a'));
    const rowsLine = out.split('\n').find((l) => l.includes('lens-b'));
    // Both rows are `keep`, but the Source column tells a healthy declared keep
    // apart from a proxy-protected one — and the lens names carry no source token,
    // so these assertions fail if the column stops rendering per-row values.
    expect(declaredLine).toContain('declared');
    expect(rowsLine).toContain('rows');
  });

  it('outputs raw JSON when json option is true', () => {
    const out = captureStdout(() => formatLensYieldOutput(baseReport, { json: true }));
    const parsed = JSON.parse(out);
    expect(parsed.total_changes_analyzed).toBe(5);
    expect(parsed.stats.length).toBe(2);
    expect(parsed.stats[1].action).toBe('retire');
  });

  it('prints nothing in quiet mode', () => {
    const out = captureStdout(() => formatLensYieldOutput(baseReport, { logLevel: 'quiet' }));
    expect(out).toBe('');
  });

  it('handles empty stats gracefully', () => {
    const out = captureStdout(() =>
      formatLensYieldOutput({
        generated_at: '2026-08-28T00:00:00Z',
        total_changes_analyzed: 0,
        thresholds: baseReport.thresholds,
        stats: [],
      }),
    );
    expect(out).toContain('No review findings found across analyzed changes.');
  });
});
