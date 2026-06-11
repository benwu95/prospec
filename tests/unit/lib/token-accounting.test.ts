import { describe, it, expect } from 'vitest';
import {
  savingRatio,
  cacheHitRate,
  effectiveInputCostUsd,
  tokenizeKeywords,
  keywordOverlapScore,
  rankByRelevance,
  estimateTokens,
  selectWithinBudget,
} from '../../../src/lib/token-accounting.js';
import type { Pricing, TokenUsage } from '../../../src/types/measurement.js';

function usage(partial: Partial<TokenUsage>): TokenUsage {
  return {
    provider: 'anthropic',
    input: 0,
    output: 0,
    cache_read: 0,
    cache_write: 0,
    ...partial,
  };
}

const pricing: Pricing = {
  input_usd_per_mtok: 1,
  output_usd_per_mtok: 5,
  cache_read_multiplier: 0.1,
  cache_write_multiplier: 1.25,
};

describe('savingRatio', () => {
  it('computes (baseline - candidate) / baseline', () => {
    expect(savingRatio(100_000, 20_000)).toBeCloseTo(0.8);
  });

  it('returns 0 when baseline is 0 (no division by zero)', () => {
    expect(savingRatio(0, 500)).toBe(0);
  });

  it('returns a negative ratio when candidate exceeds baseline (honest, no clamping)', () => {
    expect(savingRatio(100, 150)).toBeCloseTo(-0.5);
  });
});

describe('cacheHitRate', () => {
  it('computes cache_read over total prompt tokens', () => {
    expect(cacheHitRate(usage({ input: 100, cache_read: 900 }))).toBeCloseTo(0.9);
  });

  it('counts cache_write tokens in the denominator', () => {
    expect(cacheHitRate(usage({ input: 100, cache_read: 800, cache_write: 100 }))).toBeCloseTo(0.8);
  });

  it('returns 0 when there are no prompt tokens', () => {
    expect(cacheHitRate(usage({}))).toBe(0);
  });
});

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

  it('is deterministic for identical inputs', () => {
    const u = usage({ input: 123_456, cache_read: 7_890 });
    expect(effectiveInputCostUsd(u, pricing)).toBe(effectiveInputCostUsd(u, pricing));
  });
});

describe('tokenizeKeywords', () => {
  it('lowercases, splits on non-alphanumerics, drops short words, dedupes', () => {
    expect(tokenizeKeywords('Add Module-Map YAML to module map')).toEqual([
      'add',
      'module',
      'map',
      'yaml',
    ]);
  });

  it('returns an empty list for empty text', () => {
    expect(tokenizeKeywords('')).toEqual([]);
  });
});

describe('keywordOverlapScore', () => {
  it('counts keywords appearing in the candidate text', () => {
    const keywords = tokenizeKeywords('add a service for module map');
    expect(keywordOverlapScore(keywords, 'src/services/module-map.service.ts')).toBe(3);
  });

  it('matches case-insensitively', () => {
    expect(keywordOverlapScore(['readme'], 'modules/cli/README.md')).toBe(1);
  });
});

describe('rankByRelevance', () => {
  const candidates = [
    { id: 'src/lib/config.ts', text: 'src/lib/config.ts readConfig' },
    { id: 'src/services/knowledge.service.ts', text: 'src/services/knowledge.service.ts knowledge' },
    { id: 'src/lib/scanner.ts', text: 'src/lib/scanner.ts scanDir' },
  ];

  it('sorts by score descending', () => {
    const ranked = rankByRelevance('update knowledge service', candidates);
    expect(ranked[0]?.id).toBe('src/services/knowledge.service.ts');
  });

  it('breaks ties by id ascending (deterministic)', () => {
    const tied = [
      { id: 'b.ts', text: 'unrelated' },
      { id: 'a.ts', text: 'unrelated' },
    ];
    const ranked = rankByRelevance('something else entirely', tied);
    expect(ranked.map((r) => r.id)).toEqual(['a.ts', 'b.ts']);
  });

  it('is deterministic across calls', () => {
    const a = rankByRelevance('update knowledge service', candidates);
    const b = rankByRelevance('update knowledge service', candidates);
    expect(a).toEqual(b);
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

describe('selectWithinBudget', () => {
  it('selects ranked items until the token budget is exhausted', () => {
    const items = [
      { id: 'first', text: 'a'.repeat(40) }, // ~10 tokens
      { id: 'second', text: 'a'.repeat(40) }, // ~10 tokens
      { id: 'third', text: 'a'.repeat(40) }, // ~10 tokens
    ];
    expect(selectWithinBudget(items, 20)).toEqual(['first', 'second']);
  });

  it('skips an oversized item but keeps trying smaller later items', () => {
    const items = [
      { id: 'huge', text: 'a'.repeat(400) }, // ~100 tokens
      { id: 'small', text: 'a'.repeat(40) }, // ~10 tokens
    ];
    expect(selectWithinBudget(items, 20)).toEqual(['small']);
  });

  it('returns an empty list for zero budget', () => {
    expect(selectWithinBudget([{ id: 'x', text: 'abcd' }], 0)).toEqual([]);
  });
});
