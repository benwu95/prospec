import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatMeasureOutput } from '../../../src/cli/formatters/measure-output.js';
import { formatProspecError } from '../../../src/cli/formatters/error-output.js';
import { PrerequisiteError } from '../../../src/types/errors.js';
import type { MeasureResult } from '../../../src/services/measure.service.js';

// BEL (0x07) is a C0 control char that picocolors never emits (it only uses ESC
// for color), so asserting "no BEL in output" proves the injected control bytes
// were stripped without being confused by terminal-color escape sequences.
const BEL = String.fromCharCode(0x07);

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
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

function captureStderr(fn: () => void): string {
  const writes: string[] = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    writes.push(String(chunk));
    return true;
  });
  fn();
  return writes.join('');
}

describe('measure-output terminal sanitization (B13)', () => {
  it('strips control characters from report-derived strings', () => {
    const report = {
      corpus: `corpus${BEL}x`,
      git_commit: `${BEL}abcdef012345`,
      generated_at: `2026-01-01${BEL}`,
      runs: [
        {
          provider: 'anthropic',
          model: `claude${BEL}-x`,
          pricing: {},
          aborted: true,
          aborted_reason: `budget${BEL} gone`,
          spent_usd: 0,
          tasks: [],
          summary: {
            measured_tasks: 0,
            skipped_tasks: 0,
            failed_tasks: 0,
            prospec_cache_hit_rate: 0,
            comparisons: [],
          },
        },
      ],
    };

    const out = captureStdout(() =>
      formatMeasureOutput({ report } as unknown as MeasureResult),
    );

    expect(out.includes(BEL)).toBe(false);
    // legible content is preserved — only the control byte is removed
    expect(out).toContain('corpusx');
    expect(out).toContain('claude-x');
  });
});

describe('error-output terminal sanitization (B14)', () => {
  it('strips control characters from message and suggestion on stderr', () => {
    const err = new PrerequisiteError(`bad${BEL} thing`, `then ${BEL}fix it`);
    const out = captureStderr(() => formatProspecError(err));

    expect(out.includes(BEL)).toBe(false);
    expect(out).toContain('bad thing');
    expect(out).toContain('fix it');
  });
});
