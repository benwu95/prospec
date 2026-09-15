import { describe, expect, it, vi } from 'vitest';
import { EvaluationConfigSchema } from '../../../scripts/workflow-eval/protocol.js';
import { Budget, CommandExecutor, RequestQuota } from '../../../scripts/workflow-eval/executor.js';

vi.setConfig({ testTimeout: 90_000 });
const executor = { id: 'subscription', tier: 'stronger', command: process.execPath, args: [],
  model: 'synthetic', env_keys: [], settings: {}, token_bound: 'unavailable', mediated_tools: true };
const input = { version: 1, execution_mode: 'subscription', max_requests: 3,
  max_turns: 50, max_actions: 100, timeout_ms: 10000, max_output_bytes: 10000,
  max_input_tokens: 2000, max_output_tokens: 200,
  executors: [executor, { ...executor, id: 'second', tier: 'cheaper' }] };
const responder = `let text='';process.stdin.on('data',x=>text+=x);process.stdin.on('end',()=>{const r=JSON.parse(text);process.stdout.write(JSON.stringify({version:1,request_id:r.request_id,action:{kind:'route',station:'tasks'},usage:null})+'\\n');});`;

describe('subscription execution limits', () => {
  it('accepts explicit request limits without invented pricing or USD budget', () => {
    const config = EvaluationConfigSchema.parse(input);
    expect(config.execution_mode).toBe('subscription');
    expect(config.budget_usd).toBeUndefined();
    expect(config.executors[0]!.input_usd_per_mtok).toBeUndefined();
  });
  it('rejects missing limits, fake prices, unmediated tools and API fallback configuration', () => {
    for (const patch of [{ max_requests: undefined }, { max_requests: 0 }, { budget_usd: 5 },
      { execution_mode: 'api' }, { executors: [executor] },
      { executors: input.executors.map((e) => ({ ...e, input_usd_per_mtok: 0 })) },
      { executors: input.executors.map((e) => ({ ...e, mediated_tools: false })) }]) {
      expect(EvaluationConfigSchema.safeParse({ ...input, ...patch }).success).toBe(false);
    }
  });
  it('shares a nonrefundable request quota across main calls, delegation and prior baseline', async () => {
    const config = EvaluationConfigSchema.parse(input);
    const quota = new RequestQuota(3, 1);
    const options = { ...config.executors[0]!, args: ['-e', responder] };
    const main = new CommandExecutor(options, config, quota);
    const delegate = new CommandExecutor(options, config, quota);
    expect((await main.request([{ role: 'user', content: 'task' }])).usage).toBeNull();
    await delegate.request([{ role: 'user', content: 'fresh review' }]);
    expect(quota.requestsConsumed).toBe(3);
    expect(quota.committedUsd).toBeNull();
    await expect(main.request([{ role: 'user', content: 'over limit' }])).rejects.toThrow(/request limit/i);
    expect(quota.requestsConsumed).toBe(3);
  });
  it('counts failed requests without automatically retrying or reclaiming quota', async () => {
    const config = EvaluationConfigSchema.parse(input);
    const quota = new RequestQuota(1);
    const adapter = new CommandExecutor({ ...config.executors[0]!, args: ['-e', 'process.exit(2)'] }, config, quota);
    await expect(adapter.request([{ role: 'user', content: 'task' }])).rejects.toThrow(/exit/i);
    await expect(adapter.request([{ role: 'user', content: 'task' }])).rejects.toThrow(/request limit/i);
    expect(quota.requestsConsumed).toBe(1);
  });
  it('validates persisted quota rather than treating invalid or exhausted values as a fresh batch', () => {
    for (const value of [-1, 4, NaN, 0.5]) expect(() => new RequestQuota(3, value)).toThrow();
    for (const value of [0, -1, Infinity, 1.5]) expect(() => new RequestQuota(value)).toThrow();
    const quota = new RequestQuota(3, 3);
    expect(() => quota.reserve()).toThrow(/request limit/i);
  });
  it('rejects a mismatched limiter and never refunds settled requests', () => {
    const config = EvaluationConfigSchema.parse(input);
    expect(() => new CommandExecutor(config.executors[0]!, config, new Budget(1))).toThrow(/mode/i);
    expect(() => new Budget(1).reserve(config.executors[0]!, config)).toThrow(/pricing/i);
    const quota = new RequestQuota(2);
    const id = quota.reserve();
    quota.settle(id, { input: 50000, output: 10000 });
    expect(quota.requestsConsumed).toBe(1); // Observed usage is not a subscription token cap.
    expect(() => quota.settle(id, null)).toThrow(/settled/i);
  });
});
