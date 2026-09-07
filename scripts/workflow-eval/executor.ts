import { z } from 'zod';
import { effectiveInputCostUsd, outputCostUsd } from '../../src/lib/token-accounting.js';
import { EvaluationConfigSchema, ExecutorConfigSchema, UsageSchema, type ExecutorConfig, type EvaluationConfig } from './protocol.js';
import { boundedProcess } from './process.js';

type Caps = Pick<EvaluationConfig, 'max_input_tokens' | 'max_output_tokens'>;
type Usage = z.infer<typeof UsageSchema>;
const transportResponse = z.strictObject({ version: z.literal(1), request_id: z.number().int().positive(),
  action: z.unknown(), usage: UsageSchema.nullable() });
export type ExecutorResponse = z.infer<typeof transportResponse>;
export interface Message { role: 'user' | 'assistant' | 'tool'; content: string }

function cost(usage: Usage, config: ExecutorConfig): number {
  if (config.input_usd_per_mtok === undefined || config.output_usd_per_mtok === undefined || config.token_bound !== 'utf8-bytes') throw new Error('API pricing and token bounds required');
  // Configured rates MUST cover the provider's most expensive input/cache-write
  // and output classes; no discounted cache rate is used to reserve money.
  const pricing = { input_usd_per_mtok: config.input_usd_per_mtok, output_usd_per_mtok: config.output_usd_per_mtok,
    cache_read_multiplier: 1, cache_write_multiplier: 1 };
  const tokens = { ...usage, cache_read: 0, cache_write: 0 };
  return effectiveInputCostUsd(tokens, pricing) + outputCostUsd(tokens, pricing);
}

/** One shared budget for the entire batch, including all executor tiers. */
export class Budget {
  private committed = 0;
  private next = 0;
  private reservations = new Map<number, { config: ExecutorConfig; caps: Caps; reserved: number }>();
  constructor(private readonly maximumUsd: number | undefined, priorCommittedUsd = 0) {
    if (maximumUsd === undefined || !Number.isFinite(maximumUsd) || maximumUsd <= 0) throw new Error('Invalid budget');
    if (!Number.isFinite(priorCommittedUsd) || priorCommittedUsd < 0 || priorCommittedUsd > maximumUsd) throw new Error('Invalid prior budget commitment');
    this.committed = priorCommittedUsd;
  }
  get committedUsd(): number { return this.committed; }
  reserve(config: ExecutorConfig, caps: Caps): number {
    ExecutorConfigSchema.parse(config);
    z.strictObject({ max_input_tokens: z.number().int().positive(), max_output_tokens: z.number().int().positive() })
      .parse({ max_input_tokens: caps.max_input_tokens, max_output_tokens: caps.max_output_tokens });
    const reserved = cost({ input: caps.max_input_tokens, output: caps.max_output_tokens }, config);
    if (!Number.isFinite(reserved) || reserved < 0 || this.maximumUsd === undefined || this.committed + reserved > this.maximumUsd) throw new Error('Budget exhausted');
    this.committed += reserved;
    const id = ++this.next;
    this.reservations.set(id, { config, caps, reserved });
    return id;
  }
  settle(id: number, usage: Usage | null): void {
    const reservation = this.reservations.get(id);
    if (!reservation) throw new Error('Unknown or already settled reservation');
    this.reservations.delete(id);
    if (usage === null) return; // Unknown usage retains the entire reservation.
    UsageSchema.parse(usage);
    if (usage.input > reservation.caps.max_input_tokens || usage.output > reservation.caps.max_output_tokens) throw new Error('Provider usage exceeds enforced token cap');
    this.committed -= reservation.reserved - cost(usage, reservation.config);
  }
}

/** Controller launches, not provider-internal calls or subscription credits. */
export class RequestQuota {
  private consumed: number;
  private pending = new Set<number>();
  constructor(private readonly maximum: number | undefined, priorConsumed = 0) {
    if (maximum === undefined || !Number.isSafeInteger(maximum) || maximum <= 0 ||
      !Number.isSafeInteger(priorConsumed) || priorConsumed < 0 || priorConsumed > maximum) throw new Error('Invalid request quota');
    this.consumed = priorConsumed;
  }
  get committedUsd(): null { return null; }
  get requestsConsumed(): number { return this.consumed; }
  reserve(): number {
    if (this.maximum === undefined || this.consumed >= this.maximum) throw new Error('Request limit exhausted');
    const id = ++this.consumed;
    this.pending.add(id);
    return id;
  }
  settle(id: number, usage: Usage | null): void {
    if (!this.pending.delete(id)) throw new Error('Unknown or already settled reservation');
    if (usage !== null) UsageSchema.parse(usage);
    // Never refund a launched request, including failures and unknown usage.
  }
}

/** Stateless, one-request/one-response JSONL process. The complete conversation travels each turn. */
export class CommandExecutor {
  private nextRequest = 0;
  private busy = false;
  constructor(private readonly config: ExecutorConfig, private readonly limits: EvaluationConfig, private readonly budget: Budget | RequestQuota) {
    ExecutorConfigSchema.parse(config);
    EvaluationConfigSchema.parse(limits);
    if ((limits.execution_mode === 'subscription') !== (budget instanceof RequestQuota)) throw new Error('Execution mode and budget mismatch');
  }
  async request(messages: Message[], signal?: AbortSignal): Promise<ExecutorResponse> {
    if (process.platform === 'win32') throw new Error('Process-group termination unavailable on this platform');
    if (this.busy) throw new Error('Concurrent executor request refused');
    if (signal?.aborted) throw new Error('Executor request aborted');
    const request_id = ++this.nextRequest;
    const line = JSON.stringify({ version: 1, request_id, model: this.config.model, settings: this.config.settings,
      limits: { max_input_tokens: this.limits.max_input_tokens, max_output_tokens: this.limits.max_output_tokens,
        token_bound: this.config.token_bound }, messages }) + '\n';
    if (Buffer.byteLength(line) > this.limits.max_input_tokens) throw new Error('Input exceeds byte-based token bound');
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH };
    for (const key of this.config.env_keys) {
      const value = process.env[key];
      if (!value) throw new Error(`Missing configured credential: ${key}`);
      env[key] = value;
    }
    const reservation = this.budget.reserve(this.config, this.limits);
    this.busy = true;
    try {
      const response = await this.invoke(line, env, signal);
      if (response.request_id !== request_id) throw new Error('Response request ID mismatch');
      this.budget.settle(reservation, response.usage);
      return response;
    } catch (error) {
      // Do not refund a call whose charge cannot be proven. A settled reservation
      // (e.g. over-cap usage) is already closed and intentionally remains charged.
      try { this.budget.settle(reservation, null); } catch { /* already settled */ }
      throw error;
    } finally { this.busy = false; }
  }
  private async invoke(line: string, env: NodeJS.ProcessEnv, signal?: AbortSignal): Promise<ExecutorResponse> {
    const result = await boundedProcess({ command: this.config.command, args: this.config.args, env,
      input: line, timeoutMs: this.limits.timeout_ms, maxBytes: this.limits.max_output_bytes, signal });
    if (result.exitCode !== 0) throw new Error('Executor nonzero exit');
    try {
      const lines = result.output.trim().split('\n');
      if (lines.length !== 1) throw new Error('Expected one JSONL response');
      return transportResponse.parse(JSON.parse(lines[0]!));
    } catch { throw new Error('Invalid executor response'); }
  }
}
