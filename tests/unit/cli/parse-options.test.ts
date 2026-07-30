import { describe, it, expect } from 'vitest';
import { InvalidArgumentError } from 'commander';
import { collect, parseDate, parseDepth } from '../../../src/cli/parse-options.js';

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

describe('collect', () => {
  it('accumulates repeated option values in order', () => {
    expect(collect('b', collect('a', []))).toEqual(['a', 'b']);
  });

  it('does not mutate the previous accumulator', () => {
    const previous = ['a'];
    expect(collect('b', previous)).toEqual(['a', 'b']);
    expect(previous).toEqual(['a']);
  });
});

describe('parseDate', () => {
  it('accepts a bare ISO 8601 date and returns it unchanged', () => {
    expect(parseDate('2026-07-30')).toBe('2026-07-30');
  });

  it('rejects non-ISO shapes with the user-visible commander error', () => {
    for (const bad of ['2026-7-30', '30-07-2026', '2026-07-30T00:00:00Z', 'today']) {
      expect(() => parseDate(bad)).toThrow(InvalidArgumentError);
      expect(() => parseDate(bad)).toThrow('expected a bare ISO 8601 date (YYYY-MM-DD)');
    }
  });
});
