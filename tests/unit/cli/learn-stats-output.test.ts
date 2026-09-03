import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatExecutorStatsOutput } from '../../../src/cli/formatters/learn-output.js';
import type { LearnStatsResult } from '../../../src/services/learn-stats.service.js';
import type { ExecutorStat } from '../../../src/types/station.js';

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

const stat = (over: Partial<ExecutorStat> = {}): ExecutorStat => ({
  executor: 'judge',
  changes: 3,
  verify_entries: 4,
  grades: { S: 3, A: 1, B: 0, C: 0, D: 0 },
  dimension_results: { PASS: 10, WARN: 1, FAIL: 1, 'not-applicable': 0, 'not-adjudicated': 0 },
  graded_by: { 'fresh-subagent': 12, 'in-session': 0 },
  spend: { samples: 4, median: 15000 },
  review_baselines: 2,
  false_greens: 1,
  ...over,
});

const result = (stats: ExecutorStat[], reportPath?: string): LearnStatsResult => ({
  report: {
    generated_at: '2026-09-03T00:00:00.000Z',
    total_changes_analyzed: 5,
    skipped: 1,
    unlabeled_dimensions: 7,
    stats,
  },
  ...(reportPath ? { reportPath } : {}),
});

describe('formatExecutorStatsOutput (REQ-CLI-052)', () => {
  it('prints corpus totals and one block per executor with only the non-zero counts', () => {
    const out = captureStdout(() => formatExecutorStatsOutput(result([stat()])));
    expect(out).toContain('5 changes analyzed, 1 skipped, 7 unlabeled dimensions');
    expect(out).toContain('judge');
    expect(out).toContain('3 changes, 4 verify entries');
    expect(out).toContain('grades:      S=3 A=1');
    expect(out).not.toContain('B=0');
    expect(out).toContain('dimensions:  PASS=10 WARN=1 FAIL=1');
    expect(out).toContain('graded_by:   fresh-subagent=12');
    expect(out).toContain('median 15000 (4 samples)');
    expect(out).toContain('2 baselines, 1 false greens');
    expect(out).toContain('day granularity');
    expect(out).not.toContain('Report written');
  });

  it('reports an empty corpus honestly and prints no legend', () => {
    const out = captureStdout(() => formatExecutorStatsOutput(result([])));
    expect(out).toContain('No executor labels found');
    expect(out).not.toContain('false greens =');
  });

  it('shows missing spend samples and names the --json report path', () => {
    const out = captureStdout(() =>
      formatExecutorStatsOutput(
        result([stat({ spend: { samples: 0, median: null } })], '/repo/executor-stats-report.json'),
      ),
    );
    expect(out).toContain('no samples');
    expect(out).toContain('Report written: /repo/executor-stats-report.json');
  });

  it('sanitizes executor labels (project-declared free text) before printing', () => {
    const esc = String.fromCharCode(27);
    const out = captureStdout(() => formatExecutorStatsOutput(result([stat({ executor: `jud${esc}[31mge` })])));
    // sanitizeTerminal strips the C0 escape; the visible remainder must not start a color code
    expect(out).not.toContain(`${esc}[31mge`);
    expect(out).toContain('jud');
  });

  it('prints nothing in quiet mode', () => {
    expect(captureStdout(() => formatExecutorStatsOutput(result([stat()]), 'quiet'))).toBe('');
  });
});
