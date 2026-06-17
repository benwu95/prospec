import { describe, it, expect } from 'vitest';
import { parseDepth } from '../../../src/cli/parse-options.js';

describe('parseDepth', () => {
  it('parses a positive integer', () => {
    expect(parseDepth('5')).toBe(5);
  });

  it('throws on a non-numeric value (no silent NaN)', () => {
    expect(() => parseDepth('abc')).toThrow(/must be a positive integer/);
  });

  it('throws on zero and negatives', () => {
    expect(() => parseDepth('0')).toThrow(/must be a positive integer/);
    expect(() => parseDepth('-3')).toThrow(/must be a positive integer/);
  });
});
