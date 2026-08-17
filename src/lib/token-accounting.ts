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

/** Provenance label for how `estimateTokens` counts — the single source both the
 *  offline size-report producer and any display cite, so the heuristic is named
 *  in one place (never a hand-copied magic string). */
export const TOKEN_ESTIMATOR_LABEL = `chars-per-token:${CHARS_PER_TOKEN}`;

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

export interface LocalTokenEntry {
  timestamp: string;
  sessionId: string;
  model: string;
  rawInput: number;
  cachedInput: number;
  cacheWrite: number;
  output: number;
  source: string;
}

const BASE_SYSTEM_PROMPT_TOKENS = 2500;

export function parseAntigravityLogs(
  logContent: string,
  sessionId: string,
  modelName: string = 'unknown'
): LocalTokenEntry[] {
  const entries: LocalTokenEntry[] = [];
  let sessionHistoryChars = 0;
  
  const lines = logContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('{')) continue;
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
    try {
      data = JSON.parse(trimmed);
    } catch {
      continue;
    }
    
    const tsRaw = data.created_at;
    if (!tsRaw) continue;
    let ts: string;
    try {
      ts = new Date(tsRaw).toISOString();
    } catch {
      ts = new Date().toISOString();
    }
    
    const content = typeof data.content === 'string' ? data.content : '';
    const src = data.source;
    const toolCalls = Array.isArray(data.tool_calls) ? data.tool_calls : [];
    
    let stepLen = content.length;
    for (const tc of toolCalls) {
      stepLen += JSON.stringify(tc).length;
    }
    
    let inTok = 0;
    let outTok = 0;
    let cachedTok = 0;
    
    if (src === 'MODEL') {
      const explicitInMatch = trimmed.match(/"(?:input_tokens|prompt_tokens)"\s*:\s*(\d+)/);
      if (explicitInMatch) {
        inTok = parseInt(explicitInMatch[1] ?? '0', 10);
        const outMatch = trimmed.match(/"(?:output_tokens|completion_tokens)"\s*:\s*(\d+)/);
        if (outMatch) outTok = parseInt(outMatch[1] ?? '0', 10);
        const cacheMatch = trimmed.match(/"(?:cache_read_input_tokens|cached_tokens)"\s*:\s*(\d+)/);
        if (cacheMatch) cachedTok = parseInt(cacheMatch[1] ?? '0', 10);
      } else {
        inTok = BASE_SYSTEM_PROMPT_TOKENS + Math.max(0, Math.floor(sessionHistoryChars / 3.5));
        outTok = Math.max(1, Math.floor(stepLen / 3.5));
      }
      
      if (inTok > 0 || outTok > 0) {
        entries.push({
          timestamp: ts,
          sessionId,
          model: modelName,
          rawInput: inTok,
          cachedInput: cachedTok,
          cacheWrite: 0,
          output: outTok,
          source: 'antigravity',
        });
      }
      sessionHistoryChars += stepLen;
    } else {
      sessionHistoryChars += stepLen;
    }
  }
  return entries;
}

export interface ClaudeLogContent {
  sessionId: string;
  content: string;
}

export function parseClaudeLogs(logs: ClaudeLogContent[]): LocalTokenEntry[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const best = new Map<string, any>();

  for (const log of logs) {
    const lines = log.content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes('"usage"')) continue;
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
      try {
        data = JSON.parse(trimmed);
      } catch {
        continue;
      }
      
      const message = data.message;
      if (!message || typeof message !== 'object') continue;
      
      const usage = message.usage;
      if (!usage || typeof usage !== 'object') continue;
      
      const model = message.model || 'unknown';
      if (typeof model === 'string' && model.startsWith('<')) continue;
      
      const msgId = message.id || '';
      const reqId = data.requestId || '';
      const key = `${msgId}::${reqId}`;
      
      const prev = best.get(key);
      const currentOutput = usage.output_tokens || 0;
      if (prev && (prev.usage.output_tokens || 0) >= currentOutput) {
        continue;
      }
      
      best.set(key, {
        usage,
        model,
        timestamp: data.timestamp,
        sessionId: data.sessionId || log.sessionId,
      });
    }
  }

  const entries: LocalTokenEntry[] = [];
  for (const record of best.values()) {
    const usage = record.usage;
    const creation = usage.cache_creation || {};
    let write5m = creation.ephemeral_5m_input_tokens || 0;
    const write1h = creation.ephemeral_1h_input_tokens || 0;
    if (write5m === 0 && write1h === 0) {
      write5m = usage.cache_creation_input_tokens || 0;
    }
    
    let ts: string;
    try {
      ts = record.timestamp ? new Date(record.timestamp).toISOString() : new Date().toISOString();
    } catch {
      ts = new Date().toISOString();
    }
    
    entries.push({
      timestamp: ts,
      sessionId: record.sessionId,
      model: record.model,
      rawInput: usage.input_tokens || 0,
      cachedInput: usage.cache_read_input_tokens || 0,
      cacheWrite: write5m + write1h,
      output: usage.output_tokens || 0,
      source: 'claude',
    });
  }
  return entries;
}

export interface CodexLogContent {
  sessionId: string;
  content: string;
}

export function parseCodexLogs(logs: CodexLogContent[]): LocalTokenEntry[] {
  const entries: LocalTokenEntry[] = [];
  
  for (const log of logs) {
    let currentModel = 'unknown';
    const lines = log.content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
      try {
        data = JSON.parse(trimmed);
      } catch {
        continue;
      }
      
      if (data.type === 'turn_context') {
        const payload = data.payload || {};
        if (payload.model) currentModel = payload.model;
        continue;
      }
      
      if (data.type === 'event_msg') {
        const payload = data.payload || {};
        if (payload.type === 'token_count') {
          const info = payload.info || {};
          const usage = info.last_token_usage;
          if (!usage) continue;
          
          const inTok = usage.input_tokens || usage.prompt_tokens || 0;
          const outTok = usage.output_tokens || usage.completion_tokens || 0;
          const cacheRead = usage.cache_read_input_tokens || 0;
          
          let ts = new Date().toISOString();
          if (data.timestamp) {
            try { ts = new Date(data.timestamp).toISOString(); } catch { /* ignore */ }
          }
          
          entries.push({
            timestamp: ts,
            sessionId: log.sessionId,
            model: currentModel,
            rawInput: inTok,
            cachedInput: cacheRead,
            cacheWrite: 0,
            output: outTok,
            source: 'codex'
          });
        }
        continue;
      }
      
      const usage = data.usage || (data.data && data.data.usage) || (data.result && data.result.usage);
      if (usage && typeof usage === 'object') {
        const inTok = usage.input_tokens || usage.prompt_tokens || 0;
        const outTok = usage.output_tokens || usage.completion_tokens || 0;
        const cacheRead = usage.cache_read_input_tokens || 0;
        
        let ts = new Date().toISOString();
        if (data.timestamp) {
          try { ts = new Date(data.timestamp).toISOString(); } catch { /* ignore */ }
        }
        
        entries.push({
          timestamp: ts,
          sessionId: log.sessionId,
          model: data.model || currentModel,
          rawInput: inTok,
          cachedInput: cacheRead,
          cacheWrite: 0,
          output: outTok,
          source: 'codex'
        });
      }
    }
  }
  return entries;
}

export interface CopilotLogContent {
  filename: string;
  content: string;
}

export function parseCopilotLogs(logs: CopilotLogContent[]): LocalTokenEntry[] {
  const entries: LocalTokenEntry[] = [];
  
  for (const log of logs) {
    const lines = log.content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes('"attributes"')) continue;
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
      try {
        data = JSON.parse(trimmed);
      } catch {
        continue;
      }
      
      const attrs = data.attributes;
      if (!attrs || typeof attrs !== 'object') continue;
      
      const inTok = attrs['gen_ai.usage.input_tokens'] || 0;
      const outTok = attrs['gen_ai.usage.output_tokens'] || 0;
      const cacheRead = attrs['gen_ai.usage.cache_read.input_tokens'] || 0;
      
      if (inTok === 0 && outTok === 0) continue;
      
      let ts = new Date().toISOString();
      const tsRaw = data.endTime || data.time || data.timestamp;
      try {
        if (Array.isArray(tsRaw) && tsRaw.length > 0) {
          ts = new Date(tsRaw[0] * 1000).toISOString();
        } else if (typeof tsRaw === 'number') {
          if (tsRaw > 1e16) ts = new Date(tsRaw / 1e6).toISOString();
          else if (tsRaw > 1e12) ts = new Date(tsRaw).toISOString();
          else ts = new Date(tsRaw * 1000).toISOString();
        } else if (typeof tsRaw === 'string') {
          ts = new Date(tsRaw).toISOString();
        }
      } catch { /* ignore */ }
      
      const sessionId = attrs['gen_ai.conversation.id'] || attrs['copilot_chat.session_id'] || data.traceId || 'unknown';
      const model = attrs['gen_ai.response.model'] || attrs['gen_ai.request.model'] || 'unknown';
      
      entries.push({
        timestamp: ts,
        sessionId: String(sessionId),
        model: String(model),
        rawInput: inTok,
        cachedInput: cacheRead,
        cacheWrite: 0,
        output: outTok,
        source: 'copilot'
      });
    }
  }
  return entries;
}

export function calculateTheoreticalBaseline(filesContent: string[]): number {
  let total = 0;
  for (const content of filesContent) {
    total += estimateTokens(content);
  }
  return total;
}

export interface LocalLogSources {
  antigravity?: { logContent: string; sessionId: string; modelName?: string }[];
  claude?: ClaudeLogContent[];
  codex?: CodexLogContent[];
  copilot?: CopilotLogContent[];
}

export function parseLocalLogs(sources: LocalLogSources): LocalTokenEntry[] {
  const allEntries: LocalTokenEntry[] = [];
  
  if (sources.antigravity) {
    for (const log of sources.antigravity) {
      allEntries.push(...parseAntigravityLogs(log.logContent, log.sessionId, log.modelName));
    }
  }
  if (sources.claude) {
    allEntries.push(...parseClaudeLogs(sources.claude));
  }
  if (sources.codex) {
    allEntries.push(...parseCodexLogs(sources.codex));
  }
  if (sources.copilot) {
    allEntries.push(...parseCopilotLogs(sources.copilot));
  }
  
  return allEntries.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
}
