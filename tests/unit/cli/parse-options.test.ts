import { describe, it, expect } from 'vitest';
import { InvalidArgumentError } from 'commander';
import {
  collect,
  parseDate,
  parseDepth,
  parseIntOption,
  parseBoundedInt,
  parseRatio,
} from '../../../src/cli/parse-options.js';

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

describe('parseIntOption', () => {
  it('parses positive integers for min=1', () => {
    const parser = parseIntOption('test', 1);
    expect(parser('3')).toBe(3);
    expect(() => parser('0')).toThrow(InvalidArgumentError);
    expect(() => parser('-1')).toThrow(InvalidArgumentError);
    expect(() => parser('abc')).toThrow(InvalidArgumentError);
    expect(() => parser('1.5')).toThrow(InvalidArgumentError);
  });

  it('parses non-negative integers for min=0', () => {
    const parser = parseIntOption('test', 0);
    expect(parser('0')).toBe(0);
    expect(parser('500')).toBe(500);
    expect(() => parser('-1')).toThrow(InvalidArgumentError);
  });
});

describe('parseBoundedInt', () => {
  it('accepts integer within bounds', () => {
    const parser = parseBoundedInt('rounds', 1, 5);
    expect(parser('1')).toBe(1);
    expect(parser('3')).toBe(3);
    expect(parser('5')).toBe(5);
  });

  it('rejects values outside bounds or non-integer', () => {
    const parser = parseBoundedInt('rounds', 1, 5);
    expect(() => parser('0')).toThrow(InvalidArgumentError);
    expect(() => parser('6')).toThrow(InvalidArgumentError);
    expect(() => parser('2.5')).toThrow(InvalidArgumentError);
    expect(() => parser('xyz')).toThrow(InvalidArgumentError);
  });
});

describe('parseRatio', () => {
  it('accepts numbers between 0.0 and 1.0', () => {
    const parser = parseRatio('ratio');
    expect(parser('0')).toBe(0);
    expect(parser('0.5')).toBe(0.5);
    expect(parser('1.0')).toBe(1);
  });

  it('rejects numbers outside [0, 1] or non-numeric', () => {
    const parser = parseRatio('ratio');
    expect(() => parser('-0.1')).toThrow(InvalidArgumentError);
    expect(() => parser('1.1')).toThrow(InvalidArgumentError);
    expect(() => parser('abc')).toThrow(InvalidArgumentError);
    expect(() => parser('0.5abc')).toThrow(InvalidArgumentError);
    expect(() => parser('0.5%')).toThrow(InvalidArgumentError);
  });
});
