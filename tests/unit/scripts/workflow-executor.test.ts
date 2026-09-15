import { describe, expect, it, vi } from 'vitest';
import { Budget, CommandExecutor } from '../../../scripts/workflow-eval/executor.js';
import { EvaluationConfigSchema } from '../../../scripts/workflow-eval/protocol.js';

const config = EvaluationConfigSchema.parse({ version: 1, budget_usd: 1, max_turns: 10,
  timeout_ms: 10000, max_output_bytes: 10000, max_input_tokens: 2000, max_output_tokens: 200,
  executors: [{ id: 'fake', tier: 'cheaper', command: process.execPath, args: [], model: 'fake', env_keys: [], settings: {},
    input_usd_per_mtok: 1, output_usd_per_mtok: 2, token_bound: 'utf8-bytes', mediated_tools: true }] });
const responder = `let text='';process.stdin.on('data',x=>text+=x);process.stdin.on('end',()=>{const r=JSON.parse(text);process.stdout.write(JSON.stringify({version:1,request_id:r.request_id,action:{kind:'route',station:'tasks'},usage:{input:10,output:5}})+'\\n');});`;
vi.setConfig({ testTimeout: 90_000 });
function executor(code = responder, overrides = {}) {
  const budget = new Budget(config.budget_usd);
  return { budget, adapter: new CommandExecutor({ ...config.executors[0]!, args: ['-e', code] }, { ...config, ...overrides }, budget) };
}
describe('bounded command executor', () => {
  it('uses ordered request IDs and settles observed usage', async () => {
    const { budget, adapter } = executor();
    const a = await adapter.request([{ role: 'user', content: 'hello' }]);
    const b = await adapter.request([{ role: 'user', content: 'next' }]);
    expect([a.request_id, b.request_id]).toEqual([1, 2]);
    expect(a.action).toEqual({ kind: 'route', station: 'tasks' });
    expect(budget.committedUsd).toBeCloseTo(0.00004);
  });
  it('reserves worst-case cost and never releases unknown usage', () => {
    const budget = new Budget(0.005);
    const reservation = budget.reserve(config.executors[0]!, config);
    expect(budget.committedUsd).toBeCloseTo(0.0024);
    budget.settle(reservation, null);
    expect(budget.committedUsd).toBeCloseTo(0.0024);
    expect(() => budget.settle(reservation, { input: 1, output: 1 })).toThrow();
    budget.reserve(config.executors[0]!, config);
    expect(() => budget.reserve(config.executors[0]!, config)).toThrow(/budget/i);
  });
  it('retains reservations when usage exceeds the enforced caps', () => {
    const budget = new Budget(1);
    const reservation = budget.reserve(config.executors[0]!, config);
    expect(() => budget.settle(reservation, { input: 2001, output: 0 })).toThrow(/cap/i);
    expect(budget.committedUsd).toBeCloseTo(0.0024);
  });
  it.each([
    ['process.stdout.write("not json\\n")', 'response'],
    ['process.stdout.write("x".repeat(20000))', 'bytes'],
    ['setInterval(()=>{},1000)', 'timeout'],
    [responder.replace('request_id:r.request_id', 'request_id:99'), 'request'],
    [responder.replace('output:5', 'output:201'), 'cap'],
    ['process.exit(2)', 'exit'],
  ])('rejects transport failure: %s', async (code, reason) => {
    const { adapter, budget } = executor(code, { timeout_ms: reason === 'timeout' ? 300 : 10000 });
    await expect(adapter.request([{ role: 'user', content: 'hello' }])).rejects.toThrow(new RegExp(reason!, 'i'));
    expect(budget.committedUsd).toBeGreaterThan(0);
  });
  it('rejects oversized input before reserving or invoking an adapter', async () => {
    const { adapter, budget } = executor();
    await expect(adapter.request([{ role: 'user', content: 'x'.repeat(3000) }])).rejects.toThrow(/input/i);
    expect(budget.committedUsd).toBe(0);
  });
  it('requires configured credentials but does not include values in error messages', async () => {
    const adapter = new CommandExecutor({ ...config.executors[0]!, env_keys: ['WORKFLOW_EVAL_TEST_MISSING_KEY'] }, config, new Budget(1));
    await expect(adapter.request([{ role: 'user', content: 'hi' }])).rejects.toThrow(/credential/i);
  });
  it('preserves malformed action attempts for the gateway to observe and reject', async () => {
    const { adapter } = executor(responder.replace("kind:'route',station:'tasks'", "kind:'shell',command:'forbidden'"));
    expect((await adapter.request([{ role: 'user', content: 'hi' }])).action).toEqual({ kind: 'shell', command: 'forbidden' });
  });
});
