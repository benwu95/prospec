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
    evidenceBlocks: 0,
    criticals: [],
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
  it('prints each critical as a claim line plus its repro line', () => {
    const out = captureStdout(() =>
      formatReviewMergeOutput(
        baseResult({
          criticals: [
            { id: 'F-1', location: 'src/a.ts:42', lens: 'correctness', summary: 'off-by-one', repro: "pnpm vitest run a -t 'bound'" },
            { id: 'F-2', location: 'src/b.ts:8', lens: 'security', summary: 'unguarded write' },
          ],
        }),
        'normal',
      ),
    );
    expect(out).toContain('F-1 · src/a.ts:42 · correctness — off-by-one');
    expect(out).toContain("repro: pnpm vitest run a -t 'bound'");
    expect(out).toContain('F-2 · src/b.ts:8 · security — unguarded write');
    // F-2 has no repro: the digest must not invent one
    expect(out.match(/repro:/g)).toHaveLength(1);
  });

  it('omits the criticals block when the round found none', () => {
    const out = captureStdout(() => formatReviewMergeOutput(baseResult(), 'normal'));
    expect(out).not.toContain('criticals to verify');
  });

  it('names the evidence block count only when the artifact holds some', () => {
    expect(captureStdout(() => formatReviewMergeOutput(baseResult(), 'normal'))).not.toContain(
      'evidence block',
    );
    expect(
      captureStdout(() => formatReviewMergeOutput(baseResult({ evidenceBlocks: 3 }), 'normal')),
    ).toContain('3 evidence block(s)');
  });

  it('strips control characters from every finding-supplied field', () => {
    const out = captureStdout(() =>
      formatReviewMergeOutput(
        baseResult({
          criticals: [
            { id: `F${BEL}1`, location: `a${BEL}.ts:1`, lens: `x${BEL}`, summary: `s${BEL}`, repro: `pnpm${BEL} a` },
          ],
        }),
        'normal',
      ),
    );
    expect(out.includes(BEL)).toBe(false);
    expect(out).toContain('a.ts:1');
  });
});
