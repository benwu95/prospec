import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { vol } from 'memfs';
import { execute, executeOffline } from '../../../src/services/measure.service.js';
import { MeasurementReportInvalid, PrerequisiteError } from '../../../src/types/errors.js';
import {
  MeasurementReportSchema,
  type MeasurementReport,
  type SizeReport,
} from '../../../src/types/measurement.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

const validReport: MeasurementReport = {
  corpus: 'sdd-tasks-v1',
  git_commit: 'abc1234def5678',
  generated_at: '2026-06-11T00:00:00.000Z',
  runs: [
    {
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      pricing: {
        input_usd_per_mtok: 1,
        output_usd_per_mtok: 5,
        cache_read_multiplier: 0.1,
        cache_write_multiplier: 1.25,
      },
      aborted: false,
      spent_usd: 1.23,
      tasks: [
        {
          task_id: 'add-knowledge-service',
          status: 'ok',
          assemblies: [
            {
              strategy: 'prospec',
              cold: { provider: 'anthropic', input: 18_000, output: 200, cache_read: 0, cache_write: 0 },
              warm: { provider: 'anthropic', input: 1_800, output: 190, cache_read: 16_200, cache_write: 0 },
            },
          ],
        },
      ],
      summary: {
        measured_tasks: 1,
        skipped_tasks: 0,
        failed_tasks: 0,
        prospec_cache_hit_rate: 0.9,
        comparisons: [
          {
            baseline: 'full-dump',
            baseline_input_cold: 142_000,
            prospec_input_cold: 18_000,
            input_saving_ratio: 0.873,
            baseline_output: 210,
            prospec_output: 200,
            baseline_effective_cost_usd: 0.142,
            prospec_effective_cost_usd: 0.0034,
            effective_cost_saving_ratio: 0.976,
          },
        ],
      },
    },
  ],
};

beforeEach(() => {
  vol.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('measure.service execute', () => {
  it('reads and validates an existing report', async () => {
    vol.fromJSON({ '/proj/measurement-report.json': JSON.stringify(validReport) });

    const result = await execute({ cwd: '/proj' });

    expect(result.report.corpus).toBe('sdd-tasks-v1');
    expect(result.report.runs[0]?.provider).toBe('anthropic');
    expect(result.reportPath).toBe('/proj/measurement-report.json');
  });

  it('resolves a custom report path against cwd instead of the default filename', async () => {
    // Seed ONLY the custom path; the default filename is absent so the
    // PrerequisiteError branch would fire if reportPath were ignored.
    vol.fromJSON({ '/proj/out/report.json': JSON.stringify(validReport) });

    const result = await execute({ cwd: '/proj', reportPath: 'out/report.json' });

    expect(result.reportPath).toBe('/proj/out/report.json');
    expect(result.report.corpus).toBe('sdd-tasks-v1');
  });

  it('throws PrerequisiteError with runner guidance when the report is missing', async () => {
    vol.fromJSON({ '/proj/.keep': '' });

    const error = await execute({ cwd: '/proj' }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(PrerequisiteError);
    expect((error as PrerequisiteError).suggestion).toMatch(/measure:tokens/);
  });

  it('throws MeasurementReportInvalid for broken JSON', async () => {
    vol.fromJSON({ '/proj/measurement-report.json': '{ not json' });

    await expect(execute({ cwd: '/proj' })).rejects.toThrow(MeasurementReportInvalid);
  });

  it('throws MeasurementReportInvalid when required fields are missing (no git_commit)', async () => {
    const withoutCommit: Partial<MeasurementReport> = { ...validReport };
    delete withoutCommit.git_commit;
    vol.fromJSON({ '/proj/measurement-report.json': JSON.stringify(withoutCommit) });

    await expect(execute({ cwd: '/proj' })).rejects.toThrow(MeasurementReportInvalid);
    await expect(execute({ cwd: '/proj' })).rejects.toThrow(/git_commit/);
  });

  it('surfaces the Zod refine message when a failed task is missing its reason', async () => {
    const badTaskReport = {
      ...validReport,
      runs: [
        {
          ...validReport.runs[0],
          tasks: [{ task_id: 'x', status: 'failed', assemblies: [] }],
        },
      ],
    };
    vol.fromJSON({ '/proj/measurement-report.json': JSON.stringify(badTaskReport) });

    const error = await execute({ cwd: '/proj' }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(MeasurementReportInvalid);
    expect((error as MeasurementReportInvalid).message).toContain(
      'a skipped or failed task must carry a non-empty reason',
    );
  });

  // L32 binary-expr#1: cwd defaults to process.cwd() when options.cwd is omitted.
  it('resolves the report against process.cwd() when cwd is not provided', async () => {
    vol.fromJSON({ '/work/measurement-report.json': JSON.stringify(validReport) });
    vi.spyOn(process, 'cwd').mockReturnValue('/work');

    const result = await execute({});

    expect(process.cwd).toHaveBeenCalled();
    expect(result.reportPath).toBe('/work/measurement-report.json');
    expect(result.report.corpus).toBe('sdd-tasks-v1');
  });

  // L51 cond-expr#1: the catch falls back to the literal 'invalid JSON' when the
  // thrown value is not an Error instance.
  it('uses the "invalid JSON" fallback detail when JSON.parse throws a non-Error', async () => {
    vol.fromJSON({ '/proj/measurement-report.json': 'whatever' });
    vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw 'a bare string, not an Error';
    });

    const error = await execute({ cwd: '/proj' }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(MeasurementReportInvalid);
    expect((error as MeasurementReportInvalid).message).toContain('(invalid JSON)');
    expect((error as MeasurementReportInvalid).message).not.toContain('a bare string');
  });

  // L62 cond-expr#1: when schema validation throws something that is NOT a
  // ZodError, the detail is produced via String(err) instead of issue mapping.
  it('uses String(err) for the detail when schema validation throws a non-ZodError', async () => {
    vol.fromJSON({ '/proj/measurement-report.json': JSON.stringify(validReport) });
    vi.spyOn(MeasurementReportSchema, 'parse').mockImplementation(() => {
      throw new RangeError('schema blew up');
    });

    const error = await execute({ cwd: '/proj' }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(MeasurementReportInvalid);
    expect((error as MeasurementReportInvalid).message).toContain('RangeError: schema blew up');
  });
});

const validSizeReport: SizeReport = {
  corpus: 'sdd-tasks-v1',
  git_commit: 'abc1234def5678',
  generated_at: '2026-07-05T00:00:00.000Z',
  estimator: 'chars-per-token:4',
  tasks: [
    {
      task_id: 'add-knowledge-service',
      estimates: [
        { strategy: 'full-dump', cold_input_tokens: 142_000 },
        { strategy: 'naive-rag', cold_input_tokens: 5_000 },
        { strategy: 'prospec', cold_input_tokens: 4_000 },
      ],
    },
  ],
  comparisons: [
    { baseline: 'full-dump', baseline_input_tokens: 142_000, prospec_input_tokens: 4_000, input_saving_ratio: 0.9718 },
    { baseline: 'naive-rag', baseline_input_tokens: 5_000, prospec_input_tokens: 4_000, input_saving_ratio: 0.2 },
  ],
};

describe('measure.service executeOffline', () => {
  it('reads and validates an existing size report (default filename)', async () => {
    vol.fromJSON({ '/proj/size-report.json': JSON.stringify(validSizeReport) });

    const result = await executeOffline({ cwd: '/proj' });

    expect(result.sizeReport.estimator).toBe('chars-per-token:4');
    expect(result.reportPath).toBe('/proj/size-report.json');
  });

  it('does not fall back to the online default filename', async () => {
    // Only the online report exists; offline must look for size-report.json and miss.
    vol.fromJSON({ '/proj/measurement-report.json': JSON.stringify(validReport) });

    const error = await executeOffline({ cwd: '/proj' }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(PrerequisiteError);
  });

  it('throws PrerequisiteError pointing at --offline when the size report is missing', async () => {
    vol.fromJSON({ '/proj/.keep': '' });

    const error = await executeOffline({ cwd: '/proj' }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(PrerequisiteError);
    expect((error as PrerequisiteError).suggestion).toMatch(/measure:tokens --offline/);
  });

  it('throws MeasurementReportInvalid when the size report fails schema (empty tasks)', async () => {
    vol.fromJSON({ '/proj/size-report.json': JSON.stringify({ ...validSizeReport, tasks: [] }) });

    await expect(executeOffline({ cwd: '/proj' })).rejects.toThrow(MeasurementReportInvalid);
  });
});
