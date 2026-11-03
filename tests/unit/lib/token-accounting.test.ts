import { describe, it, expect } from 'vitest';
import * as accounting from '../../../src/lib/token-accounting.js';
import { effectiveInputCostUsd, estimateTokens } from '../../../src/lib/token-accounting.js';
import type { Pricing, TokenUsage } from '../../../src/types/token-accounting.js';

function usage(partial: Partial<TokenUsage>): TokenUsage {
  return { input: 0, output: 0, cache_read: 0, cache_write: 0, ...partial };
}

const pricing: Pricing = {
  input_usd_per_mtok: 1,
  output_usd_per_mtok: 5,
  cache_read_multiplier: 0.1,
  cache_write_multiplier: 1.25,
};


describe('effectiveInputCostUsd', () => {
  it('bills input at base rate, cache_read and cache_write at their multipliers', () => {
    const u = usage({ input: 1_000_000, cache_read: 1_000_000, cache_write: 1_000_000 });
    expect(effectiveInputCostUsd(u, pricing)).toBeCloseTo(1 + 0.1 + 1.25);
  });

  it('takes pricing as a parameter — different multipliers change the result', () => {
    const u = usage({ input: 1_000_000, cache_read: 1_000_000 });
    const openaiLike: Pricing = { ...pricing, cache_read_multiplier: 0.5, cache_write_multiplier: 1 };
    expect(effectiveInputCostUsd(u, pricing)).toBeCloseTo(1.1);
    expect(effectiveInputCostUsd(u, openaiLike)).toBeCloseTo(1.5);
  });

  it('weights cache_read by its multiplier into the input-rate cost', () => {
    const u = usage({ input: 123_456, cache_read: 7_890 });
    // (123456 + 7890 * 0.1) / 1_000_000 * 1 — a weighting/MTOK regression fails this.
    expect(effectiveInputCostUsd(u, pricing)).toBeCloseTo(((123_456 + 7_890 * 0.1) / 1_000_000) * 1, 9);
  });
});

describe('estimateTokens', () => {
  it('estimates ~4 chars per token, rounding up', () => {
    expect(estimateTokens('a'.repeat(8))).toBe(2);
    expect(estimateTokens('a'.repeat(9))).toBe(3);
  });

  it('returns 0 for empty text', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('shared accounting surface', () => {
  it('exports only the four capabilities with surviving callers', () => {
    expect(Object.keys(accounting).sort()).toEqual([
      'TOKEN_ESTIMATOR_LABEL', 'effectiveInputCostUsd', 'estimateTokens', 'outputCostUsd',
    ]);
  });

  it('accounts output independently of input and applies caller pricing', () => {
    expect(accounting.outputCostUsd({ output: 200_000 }, pricing)).toBe(1);
    expect(accounting.outputCostUsd({ output: 0 }, pricing)).toBe(0);
    expect(accounting.TOKEN_ESTIMATOR_LABEL).toBe('chars-per-token:4');
  });
});
