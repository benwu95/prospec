import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SIZE_REPORT_FILENAME,
  MeasurementReportSchema,
  SizeReportSchema,
  TaskMeasurementSchema,
} from '../../../src/types/measurement.js';

describe('TaskMeasurementSchema reason invariant', () => {
  it('accepts an ok task without a reason', () => {
    const r = TaskMeasurementSchema.safeParse({ task_id: 't1', status: 'ok' });
    expect(r.success).toBe(true);
  });

  it('rejects a failed/skipped task with no reason', () => {
    expect(TaskMeasurementSchema.safeParse({ task_id: 't1', status: 'failed' }).success).toBe(false);
    expect(TaskMeasurementSchema.safeParse({ task_id: 't1', status: 'skipped' }).success).toBe(false);
    expect(TaskMeasurementSchema.safeParse({ task_id: 't1', status: 'failed', reason: '' }).success).toBe(false);
  });

  it('accepts a failed task that carries a reason', () => {
    const r = TaskMeasurementSchema.safeParse({ task_id: 't1', status: 'failed', reason: 'timeout' });
    expect(r.success).toBe(true);
  });
});

describe('SizeReportSchema (offline size estimate)', () => {
  const validSize = {
    corpus: 'sdd-tasks-v1',
    git_commit: 'abc1234',
    generated_at: '2026-07-05T00:00:00Z',
    estimator: 'chars-per-token:4',
    tasks: [
      {
        task_id: 't1',
        estimates: [
          { strategy: 'full-dump', cold_input_tokens: 1000 },
          { strategy: 'naive-rag', cold_input_tokens: 400 },
          { strategy: 'prospec', cold_input_tokens: 200 },
        ],
      },
    ],
    comparisons: [
      { baseline: 'full-dump', baseline_input_tokens: 1000, prospec_input_tokens: 200, input_saving_ratio: 0.8 },
      { baseline: 'naive-rag', baseline_input_tokens: 400, prospec_input_tokens: 200, input_saving_ratio: 0.5 },
    ],
  };

  it('has a distinct default filename from the online report', () => {
    expect(DEFAULT_SIZE_REPORT_FILENAME).toBe('size-report.json');
  });

  it('accepts a well-formed size report', () => {
    const r = SizeReportSchema.safeParse(validSize);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.estimator).toBe('chars-per-token:4');
  });

  it('rejects a size report missing corpus or git_commit', () => {
    expect(SizeReportSchema.safeParse({ ...validSize, corpus: '' }).success).toBe(false);
    const noCommit: Partial<typeof validSize> = { ...validSize };
    delete noCommit.git_commit;
    expect(SizeReportSchema.safeParse(noCommit).success).toBe(false);
  });

  it('rejects a size report with no tasks (min 1)', () => {
    expect(SizeReportSchema.safeParse({ ...validSize, tasks: [] }).success).toBe(false);
  });

  it('rejects a negative or non-integer token estimate', () => {
    const bad = {
      ...validSize,
      tasks: [{ task_id: 't1', estimates: [{ strategy: 'prospec', cold_input_tokens: -5 }] }],
    };
    expect(SizeReportSchema.safeParse(bad).success).toBe(false);
    const fractional = {
      ...validSize,
      tasks: [{ task_id: 't1', estimates: [{ strategy: 'prospec', cold_input_tokens: 3.5 }] }],
    };
    expect(SizeReportSchema.safeParse(fractional).success).toBe(false);
  });

  it('does NOT accept provider/cache/cost fields — size report carries no online usage', () => {
    // A SizeReport must not be confused with a MeasurementReport: it has no `runs`.
    expect(MeasurementReportSchema.safeParse(validSize).success).toBe(false);
  });
});

describe('MeasurementReportSchema is unchanged by the size-report addition', () => {
  it('still requires at least one provider run', () => {
    const r = MeasurementReportSchema.safeParse({
      corpus: 'c',
      git_commit: 'abc',
      generated_at: '2026-07-05T00:00:00Z',
      runs: [],
    });
    expect(r.success).toBe(false);
  });
});
