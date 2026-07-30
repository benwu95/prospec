import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatChangeLogOutput } from '../../../src/cli/formatters/change-log-output.js';
import type { ChangeLogResult } from '../../../src/services/change-log.service.js';

// BEL (0x07) is a C0 control char that picocolors never emits (it only uses ESC
// for color), so asserting "no BEL in output" proves the injected control bytes
// were stripped without being confused by terminal-color escape sequences.
const BEL = String.fromCharCode(0x07);

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

function baseResult(overrides: Partial<ChangeLogResult> = {}): ChangeLogResult {
  return {
    changeName: 'feat-x',
    metadataPath: '.prospec/changes/feat-x/metadata.yaml',
    entry: {
      skill: 'prospec-review',
      date: '2026-07-30',
      result: 'PASS',
      warnings: [],
    },
    ...overrides,
  };
}

describe('change-log-output', () => {
  it('prints the appended entry summary with grade and dimensions', () => {
    const out = captureStdout(() =>
      formatChangeLogOutput(
        baseResult({
          entry: {
            skill: 'prospec-verify',
            date: '2026-07-30',
            result: 'PASS',
            warnings: ['one thing'],
            grade: 'A',
            dimensions: [{ name: 'tests', result: 'PASS' }],
          },
        }),
        'normal',
      ),
    );
    expect(out).toContain('Appended quality_log entry to .prospec/changes/feat-x/metadata.yaml');
    expect(out).toContain('skill: prospec-verify · date: 2026-07-30 · result: PASS · grade: A');
    expect(out).toContain('warnings: 1');
    expect(out).toContain('dimensions: tests=PASS');
  });

  it('prints nothing in quiet mode', () => {
    const out = captureStdout(() => formatChangeLogOutput(baseResult(), 'quiet'));
    expect(out).toBe('');
  });

  it('strips control characters from skill name, date, dimension names, and path', () => {
    const out = captureStdout(() =>
      formatChangeLogOutput(
        baseResult({
          metadataPath: `meta${BEL}data.yaml`,
          entry: {
            skill: `evil${BEL}skill`,
            date: `2026${BEL}-07-30`,
            result: 'PASS',
            warnings: [],
            dimensions: [{ name: `dim${BEL}name`, result: 'PASS' }],
          },
        }),
        'normal',
      ),
    );
    expect(out.includes(BEL)).toBe(false);
    expect(out).toContain('metadata.yaml');
    expect(out).toContain('evilskill');
    expect(out).toContain('2026-07-30');
    expect(out).toContain('dimname=PASS');
  });
});
