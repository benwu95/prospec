import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatMeasureOutput } from '../../../src/cli/formatters/measure-output.js';
import type { MeasureResult } from '../../../src/services/measure.service.js';
import type {
  BaselineComparison,
  ProviderRun,
  ProviderSummary,
  MeasurementReport,
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

  it('appends the trailing G4 / warm / copilot footnotes and a final newline', () => {
    const { out } = captureOutput(makeResult([makeRun()]));
    expect(out).toContain('warm = synthetic cache hit');
    expect(out).toContain('G4 wording');
    expect(out).toContain('copilot/codex are measured via their model provider (OpenAI)');
    expect(out.endsWith('\n')).toBe(true);
  });

  it('defaults to normal level when logLevel is omitted (produces output)', () => {
    const { out, write } = captureOutput(makeResult([makeRun()]));
    expect(write).toHaveBeenCalled();
    expect(out).toContain('Token Measurement Report');
  });
});

describe('formatRun — agentsFor mapping by provider', () => {
  it('maps anthropic to claude', () => {
    const { out } = captureOutput(makeResult([makeRun({ provider: 'anthropic', model: 'claude-x' })]));
    expect(out).toContain('agents: claude');
    expect(out).toContain('── anthropic (claude-x)');
  });

  it('maps openai to both codex and copilot', () => {
    const { out } = captureOutput(makeResult([makeRun({ provider: 'openai', model: 'gpt-x' })]));
    expect(out).toMatch(/agents: (codex, copilot|copilot, codex)/);
  });

  it('maps google to antigravity', () => {
    const { out } = captureOutput(makeResult([makeRun({ provider: 'google', model: 'gemini-x' })]));
    expect(out).toContain('agents: antigravity');
  });
});

describe('formatRun — aborted branch (L57 binary-expr, L58 cond-expr)', () => {
  it('does not show an aborted marker when run is not aborted (L58 side false)', () => {
    const { out } = captureOutput(makeResult([makeRun({ aborted: false })]));
    expect(out).not.toContain('[aborted:');
  });

  it('shows the explicit aborted_reason when present (L57 left side)', () => {
    const { out } = captureOutput(
      makeResult([makeRun({ aborted: true, aborted_reason: 'rate limited' })]),
    );
    expect(out).toContain('[aborted: rate limited]');
  });

  it('falls back to "budget exhausted" when aborted but no reason (L57 ?? right side)', () => {
    const { out } = captureOutput(makeResult([makeRun({ aborted: true, aborted_reason: undefined })]));
    expect(out).toContain('[aborted: budget exhausted]');
  });

  it('sanitizes terminal escape sequences embedded in an untrusted aborted_reason (L57 sanitizeTerminal)', () => {
    const ESC = String.fromCharCode(27);
    const { out } = captureOutput(
      makeResult([makeRun({ aborted: true, aborted_reason: `${ESC}[31mhacked${ESC}[0m` })]),
    );
    expect(out).toContain('[aborted: [31mhacked[0m]');
    expect(out).not.toContain(`${ESC}[31m`);
  });
});

describe('formatRun — no measured tasks branch (L60 if)', () => {
  it('omits the comparison table and shows the explanation when measured_tasks is 0', () => {
    const summary = makeSummary({ measured_tasks: 0, skipped_tasks: 2, failed_tasks: 1 });
    const { out } = captureOutput(makeResult([makeRun({ summary })]));
    expect(out).toContain('0 measured, 2 skipped, 1 failed');
    expect(out).toContain('No measured tasks — comparison table omitted');
    // L67-72 must NOT run: no Spent / cache-hit line, no Baseline table
    expect(out).not.toContain('Spent:');
    expect(out).not.toContain('Cache hit rate');
    expect(out).not.toContain('Baseline:');
  });
});

describe('formatRun — measured tasks branch (L67-71)', () => {
  it('renders the spent / cache-hit line and the comparison table when measured_tasks > 0', () => {
    const { out } = captureOutput(makeResult([makeRun()]));
    expect(out).toContain('3 measured, 1 skipped, 0 failed');
    // usd() formatting: 4 decimal places with a leading $
    expect(out).toContain('Spent: $0.5000');
    // pct() formatting: one decimal place with a %
    expect(out).toContain('Cache hit rate (prospec, warm*): 87.5%');
  });
});

describe('formatComparison — table rows and number formatting', () => {
  it('renders the baseline label and the three metric rows with num/usd/pct formatting', () => {
    const { out } = captureOutput(makeResult([makeRun()]));
    expect(out).toContain('Baseline:');
    expect(out).toContain('full-dump');
    // num() uses en-US thousands separators
    expect(out).toContain('120,000');
    expect(out).toContain('8,000');
    expect(out).toContain('input tokens (cold)');
    // pct() of input_saving_ratio 0.9333 -> 93.3%
    expect(out).toContain('93.3%');
    expect(out).toContain('output tokens');
    expect(out).toContain('4,200');
    // output row saving column is a literal em-dash placeholder; the run header also
    // contains an em-dash, so bind the assertion to the output-tokens row specifically
    const outputRow = out.split('\n').find((l) => l.includes('output tokens'));
    expect(outputRow).toMatch(/—\s*$/);
    expect(out).toContain('effective input cost (warm*)');
    // usd() with 4 decimals
    expect(out).toContain('$1.2345');
    expect(out).toContain('$0.0876');
    // effective_cost_saving_ratio 0.929 -> 92.9%
    expect(out).toContain('92.9%');
    // table header row
    expect(out).toContain('metric');
    expect(out).toContain('baseline');
    expect(out).toContain('prospec');
    expect(out).toContain('saving');
  });

  it('renders one Baseline block per comparison', () => {
    const summary = makeSummary({
      comparisons: [
        makeComparison({ baseline: 'full-dump' }),
        makeComparison({ baseline: 'naive-rag' }),
      ],
    });
    const { out } = captureOutput(makeResult([makeRun({ summary })]));
    expect(out).toContain('full-dump');
    expect(out).toContain('naive-rag');
    const baselineCount = out.split('Baseline:').length - 1;
    expect(baselineCount).toBe(2);
  });
});

describe('formatMeasureOutput — multiple runs', () => {
  it('renders a section per run in report.runs', () => {
    const { out } = captureOutput(
      makeResult([
        makeRun({ provider: 'anthropic', model: 'claude-x' }),
        makeRun({ provider: 'google', model: 'gemini-x' }),
      ]),
    );
    expect(out).toContain('── anthropic (claude-x)');
    expect(out).toContain('── google (gemini-x)');
  });
});

describe('formatRun — model name sanitization', () => {
  it('strips terminal escape sequences from an untrusted model name', () => {
    const ESC = '\u001b';
    const { out } = captureOutput(
      makeResult([makeRun({ provider: 'anthropic', model: `${ESC}[31mevil${ESC}[0m` })]),
    );
    // sanitizeTerminal removes the ESC bytes but keeps the printable remainder
    expect(out).toContain('[31mevil[0m');
    expect(out).not.toContain(`${ESC}[31m`);
  });
});
