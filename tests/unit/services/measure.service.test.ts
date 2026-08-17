import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { vol } from 'memfs';
import { execute, executeOffline } from '../../../src/services/measure.service.js';
import { MeasurementReportInvalid, PrerequisiteError } from '../../../src/types/errors.js';
import {
  
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
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, PROSPEC_MOCK_HOME: '/home/user' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('reads local session logs and computes a report', async () => {
    // We mock `git ls-files` inside the service by letting the fallback run on memfs.
    // So we need some ts/md files in cwd to give us a baseline > 0.
    vol.fromJSON({
      '/proj/src/index.ts': 'console.log("hello");',
      '/home/user/.gemini/antigravity-cli/brain/session-123/.system_generated/logs/transcript.jsonl': 
        JSON.stringify({ source: 'USER', type: 'USER_INPUT', content: 'hello', created_at: new Date().toISOString() }) + '\n' +
        JSON.stringify({ source: 'MODEL', type: 'PLANNER_RESPONSE', content: 'world', created_at: new Date().toISOString() }) + '\n',
    });

    const result = await execute({ cwd: '/proj' });

    expect(result.report.corpus).toBe('local-session');
    expect(result.report.git_commit).toBe('HEAD');
    expect(result.report.runs.length).toBeGreaterThan(0);
    expect(result.report.runs[0]?.provider).toBe('google');
    expect(result.report.runs[0]?.summary.measured_tasks).toBe(1);
  });

  it('throws PrerequisiteError when no local logs are found', async () => {
    vol.fromJSON({ '/proj/src/index.ts': 'console.log("hi");' }); // no logs in /home/user

    const error = await execute({ cwd: '/proj' }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(PrerequisiteError);
    expect((error as PrerequisiteError).message).toContain('No local logs found');
    expect((error as PrerequisiteError).suggestion).toContain('generate some logs');
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

describe('measure.service executeProjection', () => {
  it('projects token budget by scanning files based on metadata.yaml scale', async () => {
    // Setup virtual filesystem with the required files
    vol.fromJSON({
      '/proj/.prospec/changes/my-change/metadata.yaml': `
name: my-change
created_at: 2026-08-09T00:00:00.000Z
status: implemented
scale: standard
related_modules:
  - cli
      `,
      '/proj/.prospec/changes/my-change/delta-spec.md': `
**Feature:** token-measurement
      `,
      '/proj/prospec/index.md': 'L1 Index',
      '/proj/prospec/ai-knowledge/_conventions.md': 'L1 Conventions',
      '/proj/prospec/ai-knowledge/modules/cli/README.md': 'CLI Module L2',
      '/proj/prospec/specs/features/token-measurement.md': 'Feature Spec Content',
      '/proj/.agents/skills/prospec-implement/SKILL.md': 'Implement Skill',
      '/proj/.agents/skills/prospec-implement/references/ref1.md': 'Reference Content',
    });

    const { executeProjection } = await import('../../../src/services/measure.service.js');
    const result = await executeProjection({ cwd: '/proj', change: 'my-change' });

    expect(result.scale).toBe('standard');
    expect(result.l1.count).toBe(2); // index.md and _conventions.md found
    expect(result.l2.count).toBe(1);
    expect(result.specs.count).toBe(1);
    expect(result.skills.count).toBe(1);
    expect(result.references.count).toBe(1);
    expect(result.total_tokens).toBeGreaterThan(0);
  });
});

