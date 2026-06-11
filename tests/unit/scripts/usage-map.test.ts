import { describe, it, expect } from 'vitest';
import {
  mapAnthropicUsage,
  mapGeminiUsage,
  mapOpenAiUsage,
} from '../../../scripts/measure/usage-map.js';
import { TokenUsageSchema } from '../../../src/types/measurement.js';

describe('mapAnthropicUsage', () => {
  it('maps cache read/write fields into the neutral schema', () => {
    const usage = mapAnthropicUsage({
      input_tokens: 120,
      output_tokens: 50,
      cache_read_input_tokens: 18_000,
      cache_creation_input_tokens: 400,
    });
    expect(usage).toEqual({
      provider: 'anthropic',
      input: 120,
      output: 50,
      cache_read: 18_000,
      cache_write: 400,
    });
    expect(() => TokenUsageSchema.parse(usage)).not.toThrow();
  });

  it('treats absent cache fields as 0', () => {
    const usage = mapAnthropicUsage({ input_tokens: 10, output_tokens: 5 });
    expect(usage.cache_read).toBe(0);
    expect(usage.cache_write).toBe(0);
  });
});

describe('mapOpenAiUsage', () => {
  it('splits cached_tokens out of prompt_tokens and meters no cache writes', () => {
    const usage = mapOpenAiUsage({
      prompt_tokens: 20_000,
      completion_tokens: 80,
      prompt_tokens_details: { cached_tokens: 18_000 },
    });
    expect(usage).toEqual({
      provider: 'openai',
      input: 2_000,
      output: 80,
      cache_read: 18_000,
      cache_write: 0,
    });
    expect(() => TokenUsageSchema.parse(usage)).not.toThrow();
  });

  it('handles missing prompt_tokens_details', () => {
    const usage = mapOpenAiUsage({ prompt_tokens: 500, completion_tokens: 10 });
    expect(usage.input).toBe(500);
    expect(usage.cache_read).toBe(0);
  });

  it('never produces negative input when cached exceeds prompt count', () => {
    const usage = mapOpenAiUsage({
      prompt_tokens: 100,
      completion_tokens: 0,
      prompt_tokens_details: { cached_tokens: 150 },
    });
    expect(usage.input).toBe(0);
  });
});

describe('mapGeminiUsage', () => {
  it('splits cachedContentTokenCount out of promptTokenCount and meters no cache writes', () => {
    const usage = mapGeminiUsage({
      promptTokenCount: 20_000,
      candidatesTokenCount: 60,
      cachedContentTokenCount: 15_000,
    });
    expect(usage).toEqual({
      provider: 'google',
      input: 5_000,
      output: 60,
      cache_read: 15_000,
      cache_write: 0,
    });
    expect(() => TokenUsageSchema.parse(usage)).not.toThrow();
  });

  it('treats absent optional counts as 0', () => {
    const usage = mapGeminiUsage({ promptTokenCount: 300 });
    expect(usage.output).toBe(0);
    expect(usage.cache_read).toBe(0);
    expect(usage.cache_write).toBe(0);
  });

  it('folds billed thinking tokens into output', () => {
    const usage = mapGeminiUsage({
      promptTokenCount: 300,
      candidatesTokenCount: 40,
      thoughtsTokenCount: 200,
    });
    expect(usage.output).toBe(240);
  });
});
