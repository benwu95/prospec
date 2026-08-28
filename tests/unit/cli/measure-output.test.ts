import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatMeasureOutput, formatSizeOutput } from '../../../src/cli/formatters/measure-output.js';
import type { MeasureResult, SizeMeasureResult } from '../../../src/services/measure.service.js';
import type {
  BaselineComparison,
  ProviderRun,
  ProviderSummary,
  MeasurementReport,
  SizeReport,
} from '../../../src/types/measurement.js';

function makeComparison(over: Partial<BaselineComparison> = {}): BaselineComparison {
  return {
    baseline: 'full-dump',
    baseline_input_cold: 120000,
    prospec_input_cold: 8000,
    input_saving_ratio: 0.9333,
    baseline_output: 4200,
    prospec_output: 4200,
    baseline_effective_cost_usd: 1.2345,
    prospec_effective_cost_usd: 0.0876,
    effective_cost_saving_ratio: 0.929,
    ...over,
  };
}

function makeSummary(over: Partial<ProviderSummary> = {}): ProviderSummary {
  return {
    measured_tasks: 3,
    skipped_tasks: 1,
    failed_tasks: 0,
    prospec_cache_hit_rate: 0.875,
    comparisons: [makeComparison()],
    ...over,
  };
}

function makeRun(over: Partial<ProviderRun> = {}): ProviderRun {
  return {
    provider: 'anthropic',
    model: 'claude-sonnet-4',
    pricing: {
      input_usd_per_mtok: 3,
      output_usd_per_mtok: 15,
      cache_read_multiplier: 0.1,
      cache_write_multiplier: 1.25,
    },
    aborted: false,
    spent_usd: 0.5,
    tasks: [],
    summary: makeSummary(),
    ...over,
  };
}

function makeResult(runs: ProviderRun[]): MeasureResult {
  const report: MeasurementReport = {
    corpus: 'sdd-tasks-v1',
    git_commit: 'abcdef0123456789',
    generated_at: '2026-06-17T00:00:00Z',
    runs,
  };
  return { reportPath: '/tmp/measurement-report.json', report };
}

function captureOutput(result: MeasureResult, logLevel?: 'quiet' | 'normal' | 'verbose'): {
  out: string;
  write: ReturnType<typeof vi.spyOn>;
} {
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  if (logLevel === undefined) {
    formatMeasureOutput(result);
  } else {
    formatMeasureOutput(result, logLevel);
  }
  const out = write.mock.calls.map((c) => String(c[0])).join('');
  return { out, write };
}

afterEach(() => vi.restoreAllMocks());

describe('formatMeasureOutput — quiet level (L80 if#0)', () => {
  it('writes nothing when logLevel is quiet', () => {
    const { out, write } = captureOutput(makeResult([makeRun()]), 'quiet');
    expect(write).not.toHaveBeenCalled();
    expect(out).toBe('');
  });
});

describe('formatMeasureOutput — header and footnotes', () => {
  it('renders the report header with corpus, 12-char snapshot, and generated_at', () => {
    const { out } = captureOutput(makeResult([makeRun()]));
    expect(out).toContain('Token Measurement Report');
    expect(out).toContain('Corpus:');
    expect(out).toContain('sdd-tasks-v1');
    // git_commit is sliced to 12 chars
    expect(out).toContain('abcdef012345');
    expect(out).not.toContain('abcdef0123456789');
    expect(out).toContain('2026-06-17T00:00:00Z');
  });

  it('appends the final newline and new footnotes', () => {
    const { out } = captureOutput(makeResult([makeRun()]));
    expect(out).toContain('Baseline calculates the codebase size multiplied by the number of turns');
    expect(out).toContain('Actual represents the context window tokens actually consumed');
    expect(out.endsWith('\n')).toBe(true);
  });

  it('defaults to normal level when logLevel is omitted (produces output)', () => {
    const { out, write } = captureOutput(makeResult([makeRun()]));
    expect(write).toHaveBeenCalled();
    expect(out).toContain('Token Measurement Report');
  });
});

describe('formatMeasureOutput — multiple runs', () => {
  it('renders a section per run source', () => {
    const { out } = captureOutput(
      makeResult([
        makeRun({ source: 'claude', provider: 'anthropic', model: 'claude-x' }),
        makeRun({ source: 'antigravity', provider: 'google', model: 'gemini-x' }),
      ]),
    );
    expect(out).toContain('── Source: claude ──');
    expect(out).toContain('── Source: antigravity ──');
  });
});

function makeSizeResult(over: Partial<SizeReport> = {}): SizeMeasureResult {
  const sizeReport: SizeReport = {
    corpus: 'sdd-tasks-v1',
    git_commit: 'abcdef0123456789',
    generated_at: '2026-07-05T00:00:00Z',
    estimator: 'chars-per-token:4',
    tasks: [
      {
        task_id: 't1',
        estimates: [
          { strategy: 'full-dump', cold_input_tokens: 120000 },
          { strategy: 'naive-rag', cold_input_tokens: 9000 },
          { strategy: 'prospec', cold_input_tokens: 8000 },
        ],
      },
    ],
    comparisons: [
      { baseline: 'full-dump', baseline_input_tokens: 120000, prospec_input_tokens: 8000, input_saving_ratio: 0.9333 },
      { baseline: 'naive-rag', baseline_input_tokens: 9000, prospec_input_tokens: 8000, input_saving_ratio: 0.1111 },
    ],
    ...over,
  };
  return { reportPath: '/tmp/size-report.json', sizeReport };
}

function captureSize(result: SizeMeasureResult, logLevel?: 'quiet' | 'normal' | 'verbose'): {
  out: string;
  write: ReturnType<typeof vi.spyOn>;
} {
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  if (logLevel === undefined) formatSizeOutput(result);
  else formatSizeOutput(result, logLevel);
  const out = write.mock.calls.map((c) => String(c[0])).join('');
  return { out, write };
}

describe('formatSizeOutput — offline size estimate', () => {
  it('writes nothing when logLevel is quiet', () => {
    const { out, write } = captureSize(makeSizeResult(), 'quiet');
    expect(write).not.toHaveBeenCalled();
    expect(out).toBe('');
  });

  it('renders the offline header with corpus, 12-char snapshot, and estimator', () => {
    const { out } = captureSize(makeSizeResult());
    expect(out).toContain('Token Size Estimate (offline — no API call)');
    expect(out).toContain('sdd-tasks-v1');
    expect(out).toContain('abcdef012345');
    expect(out).not.toContain('abcdef0123456789');
    expect(out).toContain('chars-per-token:4');
  });

  it('renders one Baseline block per comparison with num/pct formatting', () => {
    const { out } = captureSize(makeSizeResult());
    expect(out).toContain('120,000');
    expect(out).toContain('8,000');
    expect(out).toContain('93.3%');
    const baselineCount = out.split('Baseline:').length - 1;
    expect(baselineCount).toBe(2);
    expect(out).toContain('est. input tokens (cold)');
  });

  it('shows no cache/cost columns and no threshold-style verdict (REQ-MEASURE-015 honesty)', () => {
    const { out } = captureSize(makeSizeResult());
    expect(out).not.toContain('Cache hit rate');
    expect(out).not.toMatch(/\$\d/); // no dollar-cost figures
    expect(out).not.toMatch(/threshold|verdict|\bpass\b|\bfail\b/i);
    // states plainly it is an estimate and that cache/cost need a key
    expect(out).toContain('Deterministic char-based size estimate');
    expect(out).toContain('require a provider API key');
  });
});
