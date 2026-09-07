import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runScenario } from '../../../scripts/workflow-eval/runner.js';
import { EvaluationConfigSchema, ScenarioSchema, type ObservedRun } from '../../../scripts/workflow-eval/protocol.js';

vi.setConfig({ testTimeout: 90_000 });
const limits = EvaluationConfigSchema.parse({ version: 1, budget_usd: 1, max_turns: 2, timeout_ms: 10000,
  max_output_bytes: 10000, max_input_tokens: 10000, max_output_tokens: 1000,
  executors: [{ id: 'fake', tier: 'cheaper', command: 'fake', args: [], model: 'fake', env_keys: [], settings: {},
    input_usd_per_mtok: 1, output_usd_per_mtok: 1, token_bound: 'utf8-bytes', mediated_tools: true }] });
const scenario = ScenarioSchema.parse({ version: 1, id: 'quick', setup: 'quick', entry_skill: 'prospec-tasks', task: 'Plan only',
  files: { '.prospec.yaml': 'version: "1.0"\nproject:\n  name: fixture\n',
    '.prospec/changes/x/metadata.yaml': 'name: x\ncreated_at: "2026-09-05"\nstatus: story\nscale: quick\n' } });
const identity: ObservedRun['identity'] = { scenario: 'quick', executor: 'fake', tier: 'cheaper', model: 'fake', variant: 'baseline',
  instruction_digest: 'i', runtime_revision: 'r', runner_digest: 'h', corpus_digest: 'c', oracle_digest: 'o', settings_digest: 's' };
const base = { scenario, limits, identity, source: 'synthetic' as const, instructions: {} };
describe('workflow scenario orchestration', () => {
  it.each(['main', 'delegation'])('records request quota exhaustion in %s as a limit, not a model success', async (surface) => {
    const run = await runScenario({ ...base, executor: { async request() {
      if (surface === 'main') throw new Error('Request limit exhausted');
      return { version: 1, request_id: 1, usage: null, action: { kind: 'delegate', schema: 'review',
        path: '.prospec/changes/x/review.json', prompt: 'Review', reads: ['.prospec/changes/x/metadata.yaml'] } };
    } }, delegateExecutor: { async request() { throw new Error('Request limit exhausted'); } } });
    expect(run.stop_reason).toBe('limit');
    expect(run.events.some((e) => e.kind === 'error')).toBe(true);
    expect(run.events.some((e) => e.kind === 'finish')).toBe(false);
    expect(run.files['.prospec/changes/x/review.json']).toBeUndefined();
  });
  it('preserves partial traces at action limits without claiming completion', async () => {
    const run = await runScenario({ ...base, executor: { async request() { return { version: 1, request_id: 1, usage: null, action: { kind: 'route', station: 'tasks' } }; } } });
    expect(run.stop_reason).toBe('limit');
    expect(run.events.filter((e) => e.kind === 'attempt')).toHaveLength(2);
    expect(run.events.filter((e) => e.kind === 'usage-unavailable')).toHaveLength(2);
    expect(run.files['.prospec/changes/x/metadata.yaml']).toContain('status: story');
  });
  it('preserves forbidden proposals without executing them', async () => {
    const run = await runScenario({ ...base, executor: { async request() { return { version: 1, request_id: 1, usage: null, action: { kind: 'shell', command: 'anything' } }; } } });
    expect(run.stop_reason).toBe('forbidden');
    expect(run.events.at(-1)?.kind).toBe('denied');
  });
  it('enforces an action cap independently of the turn limit', async () => {
    const run = await runScenario({ ...base, limits: { ...limits, max_actions: 1 }, executor: { async request() {
      return { version: 1, request_id: 1, usage: null, action: { kind: 'route', station: 'tasks' } };
    } } });
    expect(run.stop_reason).toBe('limit');
    expect(run.events.filter((e) => e.kind === 'attempt')).toHaveLength(1);
  });
  it('keeps transport failure evidence and ends on deadline cancellation', async () => {
    const run = await runScenario({ ...base, limits: { ...limits, timeout_ms: 30 }, executor: { async request(_messages, signal) {
      await new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
      throw new Error('unreachable');
    } } });
    expect(run.stop_reason).toBe('timeout');
    expect(run.events.some((e) => e.kind === 'error')).toBe(true);
  });
  it('never overwrites scenario state with an instruction snapshot', async () => {
    const run = await runScenario({ ...base, instructions: { '.prospec.yaml': 'wrong' }, executor: { async request() { throw new Error('must not run'); } } });
    expect(run.stop_reason).toBe('error');
  });
  it('accepts an explicit terminal without turning synthetic runs into live evidence', async () => {
    const run = await runScenario({ ...base, executor: { async request() { return { version: 1, request_id: 1, usage: { input: 1, output: 1 },
      action: { kind: 'finish', terminal: 'stop', message: 'Cannot complete', claims_pass: false } }; } } });
    expect(run.stop_reason).toBe('finished');
    expect(run.source).toBe('synthetic');
  });
  it('executes fresh-context delegation with isolated selected context and records usage', async () => {
    let calls = 0;
    const path = '.prospec/changes/x/review.json';
    const run = await runScenario({ ...base, executor: { async request() {
      return { version: 1, request_id: ++calls, usage: { input: 1, output: 1 }, action: calls === 1
        ? { kind: 'delegate', schema: 'review', path, prompt: 'Review independently', reads: ['.prospec/changes/x/metadata.yaml'] }
        : { kind: 'finish', terminal: 'stop', message: 'Done', claims_pass: false } };
    } }, delegateExecutor: { async request(messages) {
      expect(messages).toHaveLength(1);
      expect(Object.keys(JSON.parse(messages[0]!.content))).toEqual(['task', 'schema', 'context', 'instruction']);
      expect(JSON.parse(messages[0]!.content).context).toEqual({ '.prospec/changes/x/metadata.yaml': scenario.files['.prospec/changes/x/metadata.yaml'] });
      return { version: 1, request_id: 1, usage: { input: 5, output: 2 }, action: { kind: 'write', path, content: '[]' } };
    } } });
    expect(run.stop_reason).toBe('finished');
    expect(run.events.filter((e) => e.kind === 'usage')).toHaveLength(3);
    expect(run.events.find((e) => e.kind === 'payload')).toMatchObject({ valid: true, source: 'fresh-executor' });
    expect(run.files[path]).toBe('[]');
  });
  it('installs instruction snapshots before historical evidence is certified', async () => {
    const equivalent = ScenarioSchema.parse(JSON.parse(await readFile(resolve('tests/fixtures/workflow-eval/public/equivalent-commit.json'), 'utf8')));
    let calls = 0;
    const run = await runScenario({ ...base, scenario: equivalent, identity: { ...identity, scenario: 'equivalent-commit' },
      instructions: { '.agents/skills/prospec-ff/SKILL.md': '# Skill snapshot' },
      executor: { async request(messages) {
        if (calls++ === 0) return { version: 1, request_id: calls, usage: null, action: { kind: 'cli', args: ['check', '--change', 'x', '--json'] } };
        expect(messages.at(-1)?.content).not.toMatch(/review-provenance.*FAIL|test-provenance.*FAIL/);
        return { version: 1, request_id: calls, usage: null, action: { kind: 'finish', terminal: 'handoff', message: 'Done', claims_pass: false } };
      } } });
    const output = run.events.find((e) => e.kind === 'command');
    expect(output).toBeDefined();
    if (output?.kind === 'command') expect(output.output).not.toMatch(/FAIL.*(?:review|test)-provenance/);
  });
});
