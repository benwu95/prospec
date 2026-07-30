import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatValidateOutput } from '../../../src/cli/formatters/validate-output.js';
import type { ValidateResult } from '../../../src/services/validate.service.js';

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

function baseResult(overrides: Partial<ValidateResult> = {}): ValidateResult {
  return {
    kind: 'slug',
    target: 'user-profile',
    ok: true,
    findings: [],
    ...overrides,
  };
}

describe('validate-output', () => {
  it('prints the verdict line with kind and target', () => {
    const out = captureStdout(() => formatValidateOutput(baseResult(), 'normal'));
    expect(out).toContain('validate slug user-profile: PASS');
  });

  it('prints FAIL findings and NC marker locations', () => {
    const out = captureStdout(() =>
      formatValidateOutput(
        baseResult({
          kind: 'backfill-draft',
          target: '.prospec/changes/x/backfill-draft.md',
          ok: false,
          findings: [{ level: 'FAIL', message: 'missing Feature header' }],
          facts: {
            featureHeaderCount: 0,
            storyHeaderCount: 1,
            ncMarkers: [{ line: 12, text: '[NEEDS CLARIFICATION] why retries?' }],
          },
        }),
        'normal',
      ),
    );
    expect(out).toContain('FAIL');
    expect(out).toContain('missing Feature header');
    expect(out).toContain('L12: [NEEDS CLARIFICATION] why retries?');
  });

  it('prints nothing in quiet mode', () => {
    const out = captureStdout(() => formatValidateOutput(baseResult(), 'quiet'));
    expect(out).toBe('');
  });

  it('strips control characters from target, finding messages, and NC marker text', () => {
    const out = captureStdout(() =>
      formatValidateOutput(
        baseResult({
          kind: 'backfill-draft',
          target: `evil${BEL}slug`,
          ok: false,
          findings: [{ level: 'FAIL', message: `bad${BEL}finding` }],
          facts: {
            featureHeaderCount: 1,
            storyHeaderCount: 1,
            ncMarkers: [{ line: 3, text: `raw${BEL}artifact line` }],
          },
        }),
        'normal',
      ),
    );
    expect(out.includes(BEL)).toBe(false);
    expect(out).toContain('evilslug');
    expect(out).toContain('badfinding');
    expect(out).toContain('rawartifact line');
  });
});
