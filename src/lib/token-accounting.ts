import type { Pricing, TokenUsage } from '../types/measurement.js';

/**
 * Deterministic token accounting — pure functions only.
 *
 * No fs, no network, no hardcoded provider pricing: cache discount and
 * write-surcharge rates always come in via the Pricing parameter so the
 * same math serves any provider.
 */

const MTOK = 1_000_000;
const CHARS_PER_TOKEN = 4;
const MIN_KEYWORD_LENGTH = 3;

/**
 * Saving of `candidate` relative to `baseline`: (baseline - candidate) / baseline.
 * Returns 0 when baseline is 0; negative when candidate exceeds baseline.
 */
export function savingRatio(baseline: number, candidate: number): number {
  if (baseline === 0) return 0;
  return (baseline - candidate) / baseline;
}

/**
 * Fraction of prompt tokens served from cache: cache_read / total prompt tokens.
 */
export function cacheHitRate(usage: TokenUsage): number {
  const totalPrompt = usage.input + usage.cache_read + usage.cache_write;
  if (totalPrompt === 0) return 0;
  return usage.cache_read / totalPrompt;
}

/**
 * Effective input-side cost in USD: base-rate input plus cache reads and
 * writes billed at their pricing multipliers.
 */
export function effectiveInputCostUsd(usage: TokenUsage, pricing: Pricing): number {
  const weightedTokens =
    usage.input +
    usage.cache_read * pricing.cache_read_multiplier +
    usage.cache_write * pricing.cache_write_multiplier;
  return (weightedTokens / MTOK) * pricing.input_usd_per_mtok;
}

/** Output-side cost in USD. */
export function outputCostUsd(usage: TokenUsage, pricing: Pricing): number {
  return (usage.output / MTOK) * pricing.output_usd_per_mtok;
}

// --- naive-rag deterministic scoring ---

/**
 * Extract dedup'd lowercase keywords (alphanumeric runs of length >= 3),
 * preserving first-occurrence order.
 */
export function tokenizeKeywords(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const word of words) {
    if (word.length < MIN_KEYWORD_LENGTH) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    keywords.push(word);
  }
  return keywords;
}

/** Count how many keywords appear (as substrings) in the candidate text. */
export function keywordOverlapScore(keywords: string[], candidateText: string): number {
  const haystack = candidateText.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) score += 1;
  }
  return score;
}

export interface RelevanceCandidate {
  id: string;
  text: string;
}

export interface RankedCandidate extends RelevanceCandidate {
  score: number;
}

/**
 * Rank candidates by keyword overlap with the task text.
 * Ties break by id ascending (lexicographic) so results are deterministic.
 */
export function rankByRelevance(
  taskText: string,
  candidates: RelevanceCandidate[],
): RankedCandidate[] {
  const keywords = tokenizeKeywords(taskText);
  return candidates
    .map((candidate) => ({ ...candidate, score: keywordOverlapScore(keywords, candidate.text) }))
    // Tie-break by codepoint, NOT localeCompare — ICU collation varies per
    // environment and would make the documented ordering non-deterministic.
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Rough token estimate: ~4 characters per token, rounded up. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Walk items in given (ranked) order, selecting each whose estimated token
 * count fits the remaining budget. Oversized items are skipped, not fatal.
 */
export function selectWithinBudget(
  items: RelevanceCandidate[],
  tokenBudget: number,
): string[] {
  const selected: string[] = [];
  let remaining = tokenBudget;
  for (const item of items) {
    const cost = estimateTokens(item.text);
    if (cost === 0 || cost > remaining) continue;
    selected.push(item.id);
    remaining -= cost;
  }
  return selected;
}
