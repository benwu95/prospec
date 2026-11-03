import type { Pricing, TokenUsage } from '../types/token-accounting.js';

const MTOK = 1_000_000;
const CHARS_PER_TOKEN = 4;

export function effectiveInputCostUsd(usage: Pick<TokenUsage, 'input' | 'cache_read' | 'cache_write'>, pricing: Pricing): number {
  const weightedTokens =
    usage.input +
    usage.cache_read * pricing.cache_read_multiplier +
    usage.cache_write * pricing.cache_write_multiplier;
  return (weightedTokens / MTOK) * pricing.input_usd_per_mtok;
}

export function outputCostUsd(usage: Pick<TokenUsage, 'output'>, pricing: Pricing): number {
  return (usage.output / MTOK) * pricing.output_usd_per_mtok;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export const TOKEN_ESTIMATOR_LABEL = `chars-per-token:${CHARS_PER_TOKEN}`;
