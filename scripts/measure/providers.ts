import type { MeasurementProvider, Pricing, TokenUsage } from '../../src/types/measurement.js';
import {
  mapAnthropicUsage,
  mapGeminiUsage,
  mapOpenAiUsage,
  type AnthropicUsage,
  type GeminiUsageMetadata,
  type OpenAiUsage,
} from './usage-map.js';

/**
 * Provider adapters — each encapsulates client call, caching enablement,
 * usage mapping, pricing table, and a low-cost default model.
 *
 * REST APIs are called via built-in fetch (no SDK dependency). The measured
 * quantity is context size and cache behavior, not model capability, so
 * low-cost tiers are the defaults. Pricing values are overridable defaults
 * (USD per MTok) matching the providers' published rates for those models.
 */

/** Uniform output cap — output content is irrelevant to the measurement. */
export const MAX_OUTPUT_TOKENS = 256;

export interface ProviderAdapter {
  readonly provider: MeasurementProvider;
  readonly defaultModel: string;
  readonly pricing: Pricing;
  readonly envKeys: string[];
  apiKey(): string | undefined;
  /** Send one request with the assembled context as system prompt. Caching enabled. */
  send(systemContext: string, userPrompt: string, model: string): Promise<TokenUsage>;
}

/** Single source of truth: the skip-warning lists the same names that are read. */
function firstEnv(envKeys: string[]): string | undefined {
  return envKeys.map((name) => process.env[name]).find((v) => v && v.length > 0);
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return response.json();
}

export const anthropicAdapter: ProviderAdapter = {
  provider: 'anthropic',
  defaultModel: 'claude-haiku-4-5',
  pricing: {
    input_usd_per_mtok: 1,
    output_usd_per_mtok: 5,
    cache_read_multiplier: 0.1,
    cache_write_multiplier: 1.25, // 5-minute ephemeral cache writes
  },
  envKeys: ['ANTHROPIC_API_KEY'],
  apiKey() {
    return firstEnv(this.envKeys);
  },
  async send(systemContext, userPrompt, model) {
    const data = (await postJson(
      'https://api.anthropic.com/v1/messages',
      {
        'x-api-key': this.apiKey() ?? '',
        'anthropic-version': '2023-06-01',
      },
      {
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: [
          // Explicit cache breakpoint after the stable context prefix
          { type: 'text', text: systemContext, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: userPrompt }],
      },
    )) as { usage: AnthropicUsage };
    return mapAnthropicUsage(data.usage);
  },
};

export const openaiAdapter: ProviderAdapter = {
  provider: 'openai',
  // 1M-token context: the full-dump baseline (~150k tokens) must fit,
  // which rules out 128k-window models like gpt-4o-mini
  defaultModel: 'gpt-4.1-mini',
  pricing: {
    input_usd_per_mtok: 0.4,
    output_usd_per_mtok: 1.6,
    cache_read_multiplier: 0.25, // automatic prefix caching discount
    cache_write_multiplier: 1, // no write metering
  },
  envKeys: ['OPENAI_API_KEY'],
  apiKey() {
    return firstEnv(this.envKeys);
  },
  async send(systemContext, userPrompt, model) {
    // Caching is automatic for prompt prefixes >= 1024 tokens; no opt-in field
    const data = (await postJson(
      'https://api.openai.com/v1/chat/completions',
      { authorization: `Bearer ${this.apiKey() ?? ''}` },
      {
        model,
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: systemContext },
          { role: 'user', content: userPrompt },
        ],
      },
    )) as { usage: OpenAiUsage };
    return mapOpenAiUsage(data.usage);
  },
};

export const googleAdapter: ProviderAdapter = {
  provider: 'google',
  defaultModel: 'gemini-2.5-flash',
  pricing: {
    input_usd_per_mtok: 0.3,
    output_usd_per_mtok: 2.5,
    cache_read_multiplier: 0.25, // implicit caching discount
    cache_write_multiplier: 1, // no write metering for implicit caching
  },
  envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  apiKey() {
    return firstEnv(this.envKeys);
  },
  async send(systemContext, userPrompt, model) {
    // Implicit caching is automatic for repeated prompt prefixes
    const data = (await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { 'x-goog-api-key': this.apiKey() ?? '' },
      {
        systemInstruction: { parts: [{ text: systemContext }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          // thinking is on by default for 2.5 models and billed at output
          // rate outside candidatesTokenCount — disable so spend is exact
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
    )) as { usageMetadata: GeminiUsageMetadata };
    return mapGeminiUsage(data.usageMetadata);
  },
};

export const ALL_ADAPTERS: readonly ProviderAdapter[] = [
  anthropicAdapter,
  openaiAdapter,
  googleAdapter,
];
