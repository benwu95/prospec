import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatReviewMergeOutput } from '../../../src/cli/formatters/review-merge-output.js';
import type { ReviewMergeResult } from '../../../src/services/review-merge.service.js';

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

function baseResult(overrides: Partial<ReviewMergeResult> = {}): ReviewMergeResult {
  return {
    changeName: 'feat-x',
    reviewPath: '.prospec/changes/feat-x/review.md',
    totalRows: 4,
    round: { criticals_found: 1, criticals_fixed: 1, majors: 2 },
    ...overrides,
  };
}

describe('review-merge-output', () => {
  // The round-counts line feeds `prospec change log --skill prospec-review` —
  // its `criticals_found=` shape is a parse contract for the review skill.
  it('pins the round-counts parse contract', () => {
    const out = captureStdout(() => formatReviewMergeOutput(baseResult(), 'normal'));
    expect(out).toContain('round: criticals_found=1 · criticals_fixed=1 · majors=2');
  });

  it('prints the cumulative merge summary', () => {
    const out = captureStdout(() => formatReviewMergeOutput(baseResult(), 'normal'));
    expect(out).toContain('Merged review round into .prospec/changes/feat-x/review.md (4 row(s) cumulative)');
  });

  it('prints nothing in quiet mode', () => {
    const out = captureStdout(() => formatReviewMergeOutput(baseResult(), 'quiet'));
    expect(out).toBe('');
  });

  it('strips control characters from the review path', () => {
    const out = captureStdout(() =>
      formatReviewMergeOutput(baseResult({ reviewPath: `re${BEL}view.md` }), 'normal'),
    );
    expect(out.includes(BEL)).toBe(false);
    expect(out).toContain('review.md');
  });
});
