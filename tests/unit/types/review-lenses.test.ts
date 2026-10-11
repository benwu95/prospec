import { describe, it, expect, expectTypeOf } from 'vitest';
import { REVIEW_LENSES, type ReviewLensDefinition } from '../../../src/types/review-lenses.js';

const expected = [
  ['correctness', 'must-run', ['correctness & edge cases']],
  ['security', 'must-run', ['security & data integrity', 'security-data-integrity', 'security/data-integrity']],
  ['spec-architecture', 'must-run', []],
  ['performance', 'conditional', ['efficiency / performance', 'efficiency/performance']],
  ['maintainability', 'conditional', ['maintainability / DRY', 'maintainability/DRY']],
  ['docs-claims', 'conditional', []],
  ['parallel-site-completeness', 'conditional', ['parallel-site completeness']],
  ['test-quality', 'conditional', []],
];

describe('review lens registry', () => {
  it('pins all eight IDs, policy classes and explicit aliases independently', () => {
    expect(REVIEW_LENSES.map(({ id, classification, aliases }) => [id, classification, aliases])).toEqual(expected);
  });
  it('has unique complete lookup keys and nonempty presentation fields', () => {
    const keys = REVIEW_LENSES.flatMap(({ id, aliases }) => [id, ...aliases].map((key) => key.trim().toLowerCase()));
    expect(new Set(keys).size).toBe(keys.length);
    for (const lens of REVIEW_LENSES) {
      expect(lens.label.trim()).not.toBe('');
      expect(lens.summary.trim()).not.toBe('');
    }
  });
  it('exposes readonly entries and aliases', () => {
    expectTypeOf(REVIEW_LENSES).toMatchTypeOf<readonly ReviewLensDefinition[]>();
    expectTypeOf(REVIEW_LENSES).not.toMatchTypeOf<ReviewLensDefinition[]>();
    expectTypeOf<ReviewLensDefinition['aliases']>().toEqualTypeOf<readonly string[]>();
    expectTypeOf<ReviewLensDefinition>().toEqualTypeOf<Readonly<ReviewLensDefinition>>();
  });
});
