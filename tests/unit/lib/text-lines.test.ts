import { describe, it, expect } from 'vitest';
import { stripTrailingCr } from '../../../src/lib/text-lines.js';

describe('stripTrailingCr', () => {
  it('removes the carriage return a CRLF split leaves behind', () => {
    expect(stripTrailingCr('- [x] T1 done\r')).toBe('- [x] T1 done');
  });

  it('returns an LF-split line unchanged', () => {
    expect(stripTrailingCr('- [x] T1 done')).toBe('- [x] T1 done');
  });

  it('leaves a carriage return that is not the final character in place', () => {
    // The primitive is a view for MATCHING, not a normalizer: rewriting interior
    // bytes would silently edit the text a parser then reports as the file's own.
    expect(stripTrailingCr('a\rb')).toBe('a\rb');
    expect(stripTrailingCr('a\rb\r')).toBe('a\rb');
  });

  it('removes exactly one carriage return, not a run of them', () => {
    expect(stripTrailingCr('a\r\r')).toBe('a\r');
  });

  it('handles the degenerate inputs a split produces', () => {
    expect(stripTrailingCr('')).toBe('');
    // A lone `\r` line ending (classic Mac) is NOT a line separator for
    // `split('\n')`, so this is what a whole such document collapses to.
    expect(stripTrailingCr('\r')).toBe('');
  });
});
