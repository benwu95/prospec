import type { TokenUsage } from '../../src/types/measurement.js';

/**
 * Provider response → neutral TokenUsage mapping.
 *
 * Pure functions, unit-tested. Neutral semantics:
 * - input: uncached input tokens billed at base rate
 * - cache_read: input tokens served from the provider's prompt cache
 * - cache_write: cache write tokens; 0 for providers without write metering
 */

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export interface OpenAiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
}

export interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount?: number | null;
  cachedContentTokenCount?: number | null;
  /** Billed at output rate but excluded from candidatesTokenCount. */
  thoughtsTokenCount?: number | null;
}

/** Anthropic reports uncached input and cache read/write separately. */
export function mapAnthropicUsage(usage: AnthropicUsage): TokenUsage {
  return {
    provider: 'anthropic',
    input: usage.input_tokens,
    output: usage.output_tokens,
    cache_read: usage.cache_read_input_tokens ?? 0,
    cache_write: usage.cache_creation_input_tokens ?? 0,
  };
}

/** OpenAI includes cached tokens inside prompt_tokens; no write metering. */
export function mapOpenAiUsage(usage: OpenAiUsage): TokenUsage {
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    provider: 'openai',
    input: Math.max(0, usage.prompt_tokens - cached),
    output: usage.completion_tokens,
    cache_read: cached,
    cache_write: 0,
  };
}

/**
 * Gemini includes cached tokens inside promptTokenCount; no write metering.
 * Thinking tokens are billed as output, so they fold into `output` even
 * though the runner disables thinking — defense against partial suppression.
 */
export function mapGeminiUsage(usage: GeminiUsageMetadata): TokenUsage {
  const cached = usage.cachedContentTokenCount ?? 0;
  return {
    provider: 'google',
    input: Math.max(0, usage.promptTokenCount - cached),
    output: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
    cache_read: cached,
    cache_write: 0,
  };
}
