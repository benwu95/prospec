import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { execute } from '../../../src/services/learn-stats.service.js';
import { executeYield } from '../../../src/services/learn.service.js';
import { PrerequisiteError } from '../../../src/types/errors.js';
import { EXECUTOR_STATS_REPORT_FILENAME, ExecutorStatsReportSchema } from '../../../src/types/station.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

vi.mock('../../../src/lib/config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/lib/config.js')>()),
  readConfig: vi.fn().mockImplementation(async () => ({ project: { name: 'demo' } })),
  resolveBasePaths: vi.fn(),
}));

const CWD = '/repo';
const NOW = () => new Date('2026-09-03T00:00:00.000Z');

const metadata = (executor: string, grade = 'S', result = 'PASS', review?: string) =>
  [
    'name: c',
    'status: archived',
    'quality_log:',
    '  - skill: prospec-verify',
    '    date: 2026-09-02',
    '    result: PASS',
    '    warnings: []',
    `    grade: ${grade}`,
    '    dimensions:',
    `      - name: constitution`,
    `        result: ${result}`,
    '        adjudicator: judgment',
    '        graded_by: fresh-subagent',
    `        executor: ${executor}`,
    ...(review ? ['review_provenance:', '  digest: d', '  date: 2026-09-01', `  executor: ${review}`] : []),
    '',
  ].join('\n');

beforeEach(() => {
  vol.reset();
});

describe('learn-stats.service (REQ-SERVICES-108)', () => {
  it('reports an empty corpus when the archive is absent, exit-clean and read-only', async () => {
    vol.fromJSON({ '/repo/.keep': '' });
    const { report, reportPath } = await execute({ cwd: CWD, now: NOW });
    expect(report.total_changes_analyzed).toBe(0);
    expect(report.stats).toEqual([]);
    expect(reportPath).toBeUndefined();
    expect(vol.existsSync(`/repo/${EXECUTOR_STATS_REPORT_FILENAME}`)).toBe(false);
  });

  it('aggregates every archived metadata.yaml and skips the unreadable ones', async () => {
    vol.fromJSON({
      '/repo/.prospec/archive/2026-09-01-a/metadata.yaml': metadata('judge', 'S', 'PASS', 'reviewer'),
      '/repo/.prospec/archive/2026-09-02-b/metadata.yaml': metadata('judge', 'C', 'FAIL', 'reviewer'),
      '/repo/.prospec/archive/2026-09-03-c/metadata.yaml': ': : not yaml [',
      '/repo/.prospec/archive/2026-09-04-d/metadata.yaml': '- just\n- a list\n',
      '/repo/.prospec/archive/2026-09-05-e/review.md': '# no metadata here\n',
      '/repo/.prospec/archive/stray.txt': 'ignored',
    });
    const { report } = await execute({ cwd: CWD, now: NOW });
    expect(report.generated_at).toBe('2026-09-03T00:00:00.000Z');
    expect(report.total_changes_analyzed).toBe(2);
    expect(report.skipped).toBe(3);
    const judge = report.stats.find((s) => s.executor === 'judge')!;
    expect(judge.grades).toMatchObject({ S: 1, C: 1 });
    expect(judge.dimension_results).toMatchObject({ PASS: 1, FAIL: 1 });
    const reviewer = report.stats.find((s) => s.executor === 'reviewer')!;
    expect(reviewer.review_baselines).toBe(2);
    expect(reviewer.false_greens).toBe(1);
  });

  it('writes executor-stats-report.json under cwd with --json and returns the path', async () => {
    vol.fromJSON({ '/repo/.prospec/archive/2026-09-01-a/metadata.yaml': metadata('judge') });
    const { report, reportPath } = await execute({ cwd: CWD, json: true, now: NOW });
    expect(reportPath).toBe(`/repo/${EXECUTOR_STATS_REPORT_FILENAME}`);
    const onDisk = JSON.parse(vol.readFileSync(reportPath!, 'utf-8') as string);
    expect(onDisk).toEqual(report);
    expect(ExecutorStatsReportSchema.safeParse(onDisk).success).toBe(true);
  });

  it('shares --corpus semantics with learn yield: an explicit non-directory is refused, extra dirs are merged', async () => {
    vol.fromJSON({
      '/repo/.prospec/archive/2026-09-01-a/metadata.yaml': metadata('judge'),
      '/elsewhere/corpus/2026-09-02-b/metadata.yaml': metadata('drafter'),
      '/repo/not-a-dir.txt': 'x',
    });
    await expect(execute({ cwd: CWD, extraCorpusDirs: ['/nowhere'] })).rejects.toBeInstanceOf(PrerequisiteError);
    await expect(execute({ cwd: CWD, extraCorpusDirs: ['not-a-dir.txt'] })).rejects.toThrow(/--corpus/);
    const { report } = await execute({ cwd: CWD, extraCorpusDirs: ['../elsewhere/corpus'], now: NOW });
    expect(report.stats.map((s) => s.executor)).toEqual(['drafter', 'judge']);
  });

  it('never touches the archive it reads (no metadata rewritten, no config read)', async () => {
    const content = metadata('judge');
    vol.fromJSON({ '/repo/.prospec/archive/2026-09-01-a/metadata.yaml': content });
    await execute({ cwd: CWD, now: NOW });
    expect(vol.readFileSync('/repo/.prospec/archive/2026-09-01-a/metadata.yaml', 'utf-8')).toBe(content);
    const { readConfig } = await import('../../../src/lib/config.js');
    expect(vi.mocked(readConfig)).not.toHaveBeenCalled();
  });

  it('leaves learn yield\'s corpus order and refusal text unchanged (shared enumeration)', async () => {
    vol.fromJSON({
      '/repo/.prospec/archive/2026-01-02-b/review.md': '# Review Findings: b\n\n| ID | Location | Severity | Lens | Status | Summary |\n|---|---|---|---|---|---|\n| C-1 | a.ts:1 | critical | security | fixed | bug |\n',
      '/repo/.prospec/archive/2026-01-01-a/review.md': '# Review Findings: a\n\n| ID | Location | Severity | Lens | Status | Summary |\n|---|---|---|---|---|---|\n',
    });
    const report = await executeYield({ cwd: CWD });
    expect(report.total_changes_analyzed).toBe(2);
    expect(report.stats.find((s) => s.lens === 'security')?.last_yield_change).toBe('b');
    await expect(executeYield({ cwd: CWD, extraCorpusDirs: ['/nowhere'] })).rejects.toThrow(/--corpus is not an existing directory/);
  });
});
