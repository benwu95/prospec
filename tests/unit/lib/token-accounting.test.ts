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

  it('weights cache_read by its multiplier into the input-rate cost', () => {
    const u = usage({ input: 123_456, cache_read: 7_890 });
    // (123456 + 7890 * 0.1) / 1_000_000 * 1 — a weighting/MTOK regression fails this.
    expect(effectiveInputCostUsd(u, pricing)).toBeCloseTo(((123_456 + 7_890 * 0.1) / 1_000_000) * 1, 9);
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
    { id: 'src/services/knowledge-update.service.ts', text: 'src/services/knowledge-update.service.ts knowledge' },
    { id: 'src/lib/scanner.ts', text: 'src/lib/scanner.ts scanDir' },
  ];

  it('sorts by score descending', () => {
    const ranked = rankByRelevance('update knowledge service', candidates);
    expect(ranked[0]?.id).toBe('src/services/knowledge-update.service.ts');
  });

  it('breaks ties by id ascending (deterministic)', () => {
    const tied = [
      { id: 'b.ts', text: 'unrelated' },
      { id: 'a.ts', text: 'unrelated' },
    ];
    const ranked = rankByRelevance('something else entirely', tied);
    expect(ranked.map((r) => r.id)).toEqual(['a.ts', 'b.ts']);
  });

  it('orders score-desc with id-ascending tie-break, regardless of insertion order', () => {
    // Insertion order deliberately differs from final order, and beta.ts/alpha.ts
    // tie on score (1) so the id tie-break is load-bearing: dropping it would leave
    // beta.ts before alpha.ts (ES2019 stable sort preserves insertion order on ties).
    const items = [
      { id: 'omega.ts', text: 'omega unrelated' }, // score 0
      { id: 'beta.ts', text: 'beta service' }, // score 1 (service)
      { id: 'zeta.ts', text: 'zeta knowledge service' }, // score 2
      { id: 'alpha.ts', text: 'alpha service' }, // score 1 (service)
    ];
    const ranked = rankByRelevance('knowledge service', items);
    expect(ranked.map((r) => r.id)).toEqual(['zeta.ts', 'alpha.ts', 'beta.ts', 'omega.ts']);
    expect(ranked.map((r) => r.score)).toEqual([2, 1, 1, 0]);
  });

  it('breaks ties by codepoint, ordering uppercase before lowercase', () => {
    // localeCompare is locale/ICU-dependent and typically orders 'about' before
    // 'CONSTITUTION'; codepoint order puts uppercase first (C=0x43 < a=0x61).
    const tied = [
      { id: 'about.md', text: 'unrelated' },
      { id: 'CONSTITUTION.md', text: 'unrelated' },
    ];
    const ranked = rankByRelevance('something else entirely', tied);
    expect(ranked.map((r) => r.id)).toEqual(['CONSTITUTION.md', 'about.md']);
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

import {
  parseAntigravityLogs,
  parseClaudeLogs,
  parseCodexLogs,
  parseCopilotLogs,
  calculateTheoreticalBaseline,
  parseLocalLogs
} from '../../../src/lib/token-accounting.js';

describe('calculateTheoreticalBaseline', () => {
  it('sums estimateTokens for all given files content', () => {
    const contents = ['a'.repeat(40), 'a'.repeat(80)]; // 10 tokens + 20 tokens = 30
    expect(calculateTheoreticalBaseline(contents)).toBe(30);
  });
});

describe('parseAntigravityLogs', () => {
  it('extracts input and output tokens per turn correctly', () => {
    const jsonl = `{"created_at":"2023-01-01T00:00:00Z","type":"PLANNER_RESPONSE","content":"hmm","tool_calls":[],"source":"MODEL","usage":{"input_tokens":100,"output_tokens":20}}
{"created_at":"2023-01-01T00:00:01Z","type":"USER_INPUT","content":"hi"}
{"created_at":"2023-01-01T00:00:02Z","type":"PLANNER_RESPONSE","content":"ho","tool_calls":[],"source":"MODEL","usage":{"input_tokens":150,"output_tokens":30,"cached_tokens":50,"cache_write_tokens":0}}`;
    const entries = parseAntigravityLogs(jsonl, 'sess1');
    expect(entries).toHaveLength(2);
    expect(entries[0]?.rawInput).toBe(100);
    expect(entries[0]?.output).toBe(20);
    expect(entries[1]?.rawInput).toBe(150);
    expect(entries[1]?.cachedInput).toBe(50);
    expect(entries[1]?.source).toBe('antigravity');
    expect(entries[1]?.sessionId).toBe('sess1');
  });

  it('infers missing input tokens by character length of concatenated history', () => {
    const jsonl = `{"created_at":"2023-01-01T00:00:00Z","type":"USER_INPUT","content":"${'a'.repeat(400)}","source":"USER"}
{"created_at":"2023-01-01T00:00:01Z","type":"PLANNER_RESPONSE","content":"${'b'.repeat(20)}","tool_calls":[],"source":"MODEL"}`; // 100 in, 5 out
    const entries = parseAntigravityLogs(jsonl, 'sess2');
    expect(entries[0]?.rawInput).toBe(2614); // BASE 2500 + 400/3.5
    expect(entries[0]?.output).toBe(5);
  });
});

describe('parseClaudeLogs', () => {
  it('deduplicates turns by reqId and aggregates write tokens in 5m windows', () => {
    const jsonl = `{"requestId":"r1","message":{"id":"m1","usage":{"input_tokens":100,"output_tokens":20,"cache_creation_input_tokens":10}}}
{"requestId":"r1","message":{"id":"m1","usage":{"input_tokens":100,"output_tokens":50,"cache_creation_input_tokens":10}}}
{"requestId":"r2","message":{"id":"m2","usage":{"input_tokens":200,"output_tokens":10,"cache_read_input_tokens":30}}}`;
    const entries = parseClaudeLogs([{ sessionId: 'c1', content: jsonl }]);
    expect(entries).toHaveLength(2); // two msg/req pairs
    expect(entries[0]?.rawInput).toBe(100);
    expect(entries[0]?.output).toBe(50); // takes max output
    expect(entries[0]?.cacheWrite).toBe(10); // from cache_creation
    expect(entries[1]?.rawInput).toBe(200);
    expect(entries[1]?.cachedInput).toBe(30);
    expect(entries[1]?.source).toBe('claude');
  });
});

describe('parseCodexLogs', () => {
  it('extracts tokens from token_count events', () => {
    const jsonl = `{"type":"turn_context","payload":{"model":"gpt-4"}}
{"type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"prompt_tokens":30,"completion_tokens":5}}}}
{"usage":{"input_tokens":100,"output_tokens":10}}`;
    const entries = parseCodexLogs([{ sessionId: 'codex1', content: jsonl }]);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.rawInput).toBe(30);
    expect(entries[0]?.output).toBe(5);
    expect(entries[0]?.model).toBe('gpt-4');
    expect(entries[1]?.rawInput).toBe(100);
    expect(entries[1]?.output).toBe(10);
    expect(entries[1]?.source).toBe('codex');
  });
});

describe('parseCopilotLogs', () => {
  it('extracts gen_ai.usage attributes', () => {
    const jsonl = `{"attributes":{"gen_ai.usage.input_tokens":50,"gen_ai.usage.output_tokens":10,"gen_ai.response.model":"gpt-3.5"}}
{"attributes":{"other":1}}`;
    const entries = parseCopilotLogs([{ filename: 'copilot1', content: jsonl }]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.rawInput).toBe(50);
    expect(entries[0]?.output).toBe(10);
    expect(entries[0]?.model).toBe('gpt-3.5');
    expect(entries[0]?.source).toBe('copilot');
  });
});

describe('parseLocalLogs', () => {
  it('aggregates all sources and sorts by timestamp', () => {
    const sources = {
      antigravity: [{ sessionId: 'a', logContent: '{"created_at":"2023-01-02T00:00:00Z","type":"PLANNER_RESPONSE","content":"x","source":"MODEL","usage":{"input_tokens":10,"output_tokens":1}}' }],
      claude: [{ sessionId: 'c', content: '{"timestamp":"2023-01-01T00:00:00Z","requestId":"1","message":{"id":"1","usage":{"input_tokens":20,"output_tokens":2}}}' }]
    };
    const entries = parseLocalLogs(sources);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.source).toBe('claude'); // earlier date
    expect(entries[1]?.source).toBe('antigravity'); // later date
  });
});
