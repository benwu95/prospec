import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatVerifyRecordOutput } from '../../../src/cli/formatters/verify-record-output.js';
import type { VerifyRecordResult } from '../../../src/services/verify-record.service.js';

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

function baseResult(overrides: Partial<VerifyRecordResult> = {}): VerifyRecordResult {
  return {
    changeName: 'feat-x',
    grade: 'A',
    result: 'PASS',
    dimensions: [
      { name: 'task-completion', result: 'PASS', adjudicator: 'machine' },
      { name: 'spec-compliance', result: 'PASS', adjudicator: 'judgment' },
    ],
    warnings: [],
    statusAdvanced: true,
    gradeGraduates: true,
    excludedFromGrade: [],
    ...overrides,
  };
}

describe('verify-record-output', () => {
  it('prints both ledgers, the grade, and the status effect', () => {
    const out = captureStdout(() => formatVerifyRecordOutput(baseResult(), 'normal'));
    expect(out).toContain('Machine ledger:  task-completion=PASS');
    expect(out).toContain('Judgment ledger: spec-compliance=PASS');
    expect(out).toContain('Quality Grade: A (result: PASS)');
    expect(out).toContain('feat-x: status → verified');
  });

  it('prints the unchanged-status line when the grade does not graduate', () => {
    const out = captureStdout(() =>
      formatVerifyRecordOutput(
        baseResult({ grade: 'B', statusAdvanced: false, gradeGraduates: false }),
        'normal',
      ),
    );
    expect(out).toContain('feat-x: status unchanged (only S/A graduate)');
  });

  it('prints nothing in quiet mode', () => {
    const out = captureStdout(() => formatVerifyRecordOutput(baseResult(), 'quiet'));
    expect(out).toBe('');
  });

  it('strips control characters from change name, dimension names, warnings, and exclusions', () => {
    const out = captureStdout(() =>
      formatVerifyRecordOutput(
        baseResult({
          changeName: `evil${BEL}change`,
          dimensions: [
            { name: `mach${BEL}dim`, result: 'PASS', adjudicator: 'machine' },
            { name: `judg${BEL}dim`, result: 'WARN', adjudicator: 'judgment' },
          ],
          warnings: [`warn${BEL}text`],
          excludedFromGrade: [`excl${BEL}dim`],
        }),
        'normal',
      ),
    );
    expect(out.includes(BEL)).toBe(false);
    expect(out).toContain('evilchange');
    expect(out).toContain('machdim=PASS');
    expect(out).toContain('judgdim=WARN');
    expect(out).toContain('warntext');
    expect(out).toContain('excldim');
  });

  it('prints the self-verification cap with its dimensions and remedy', () => {
    const out = captureStdout(() =>
      formatVerifyRecordOutput(
        baseResult({
          grade: 'A',
          selfVerifiedCap: {
            dimensions: ['delta-spec-compliance'],
            remedy: 'Re-grade in fresh context, then re-run `prospec verify record`.',
          },
        }),
        'normal',
      ),
    );
    expect(out).toContain('Grade capped below S');
    expect(out).toContain('delta-spec-compliance');
    expect(out).toContain('Re-grade in fresh context');
  });

  it('omits the cap line when there is no self-verification, and sanitizes it when present', () => {
    expect(captureStdout(() => formatVerifyRecordOutput(baseResult(), 'normal'))).not.toContain(
      'Grade capped below S',
    );
    const out = captureStdout(() =>
      formatVerifyRecordOutput(
        baseResult({ selfVerifiedCap: { dimensions: [`d${BEL}im`], remedy: `fix${BEL}it` } }),
        'normal',
      ),
    );
    expect(out.includes(BEL)).toBe(false);
    expect(out).toContain('dim');
    expect(out).toContain('fixit');
  });
});

describe('status line honesty (already-verified vs grade-too-low)', () => {
  it('reads as success when the grade graduates but status was already verified', () => {
    const out = captureStdout(() =>
      formatVerifyRecordOutput(
        baseResult({ grade: 'A', result: 'PASS', statusAdvanced: false }),
        'normal',
      ),
    );
    expect(out).toContain('already verified');
    expect(out).not.toContain('only S/A graduate');
  });

  it('still says only S/A graduate when the grade does not graduate', () => {
    const out = captureStdout(() =>
      formatVerifyRecordOutput(
        baseResult({ grade: 'B', result: 'WARN', statusAdvanced: false, gradeGraduates: false }),
        'normal',
      ),
    );
    expect(out).toContain('only S/A graduate');
    expect(out).not.toContain('already verified');
  });
  it('names verify.md when the run recorded judgment evidence, and nothing otherwise', () => {
    const withEvidence = captureStdout(() =>
      formatVerifyRecordOutput(
        baseResult({ evidencePath: '.prospec/changes/feat-x/verify.md' }),
        'normal',
      ),
    );
    expect(withEvidence).toContain('Judgment evidence: .prospec/changes/feat-x/verify.md');
    expect(captureStdout(() => formatVerifyRecordOutput(baseResult(), 'normal'))).not.toContain(
      'Judgment evidence:',
    );
  });
});
