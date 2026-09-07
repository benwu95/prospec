import { describe, expect, it } from 'vitest';
import {
  ActionSchema, EvaluationConfigSchema, EventSchema, OracleSchema,
  ScenarioSchema, validatePayload,
} from '../../../scripts/workflow-eval/protocol.js';

describe('workflow evaluation protocol', () => {
  const scenario = { version: 1, id: 'quick', task: 'Finish planning.', files: {
    'proposal.md': 'A small change',
  }, setup: 'quick', entry_skill: 'prospec-tasks' };
  const oracle = { version: 1, id: 'quick', routes: ['tasks', 'implement'],
    required_reads: ['proposal.md'], forbidden_reads: ['plan.md'],
    required_files: ['tasks.md'], forbidden_files: ['plan.md'], forbidden_commands: ['archive'],
    payloads: ['prospec-tasks'], allow_writes: true, allow_delegation: true, required_signals: [], required_commands: [], required_receipts: [], required_states: {}, required_log_skills: {}, suite_runs: 0, terminal: 'handoff' };

  it('accepts versioned public input separately from private expectations', () => {
    expect(ScenarioSchema.parse(scenario)).toEqual(scenario);
    expect(OracleSchema.parse(oracle)).toEqual(oracle);
    expect(ScenarioSchema.safeParse({ ...scenario, oracle }).success).toBe(false);
  });
  it.each(['version', 'task', 'files', 'setup', 'entry_skill'])('requires public %s', (key) => {
    const input: Record<string, unknown> = { ...scenario };
    delete input[key];
    expect(ScenarioSchema.safeParse(input).success).toBe(false);
  });
  it.each(['routes', 'payloads', 'suite_runs', 'terminal', 'forbidden_commands'])('requires oracle %s', (key) => {
    const input: Record<string, unknown> = { ...oracle };
    delete input[key];
    expect(OracleSchema.safeParse(input).success).toBe(false);
  });
  it('rejects unsupported versions, routes, setup names and unsafe fixture paths', () => {
    expect(ScenarioSchema.safeParse({ ...scenario, version: 2 }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ ...scenario, setup: 'unknown' }).success).toBe(false);
    expect(OracleSchema.safeParse({ ...oracle, routes: ['fake'] }).success).toBe(false);
    for (const file of ['../oracle.json', '/tmp/a', 'C:/a', 'a\\b', '.git/config']) {
      expect(ScenarioSchema.safeParse({ ...scenario, files: { [file]: '' } }).success).toBe(false);
    }
  });
  it('uses real station schemas rather than accepting a model success claim', () => {
    expect(validatePayload('prospec-plan', { verdict: 'PASS' }).success).toBe(false);
    expect(validatePayload('review', []).success).toBe(true);
    expect(validatePayload('review', [{ severity: 'invented' }]).success).toBe(false);
  });
  it('requires finite positive live bounds and rejects secrets in config fields', () => {
    const config = { version: 1, budget_usd: 1, max_turns: 20, max_actions: 200, timeout_ms: 1000,
      max_output_bytes: 10000, max_input_tokens: 1000, max_output_tokens: 200,
      executors: [{ id: 'strong', tier: 'stronger', command: 'adapter', args: [],
        model: 'configured-model', env_keys: ['MODEL_KEY'], settings: {},
        input_usd_per_mtok: 1, output_usd_per_mtok: 2, token_bound: 'utf8-bytes',
        mediated_tools: true }] };
    expect(EvaluationConfigSchema.parse(config)).toEqual(config);
    expect(EvaluationConfigSchema.safeParse({ ...config, budget_usd: 0 }).success).toBe(false);
    expect(EvaluationConfigSchema.safeParse({ ...config, timeout_ms: Infinity }).success).toBe(false);
    expect(EvaluationConfigSchema.safeParse({ ...config, api_key: 'secret' }).success).toBe(false);
    expect(EvaluationConfigSchema.safeParse({ ...config, executors: [...config.executors, ...config.executors] }).success).toBe(false);
  });
  it('accepts only mediated action proposals and controller event shapes', () => {
    expect(ActionSchema.safeParse({ kind: 'shell', command: 'rm -rf /' }).success).toBe(false);
    expect(ActionSchema.parse({ kind: 'read', path: 'proposal.md' }).kind).toBe('read');
    expect(EventSchema.safeParse({ seq: 0, kind: 'route', station: 'tasks' }).success).toBe(false);
    expect(EventSchema.parse({ seq: 1, kind: 'route', station: 'tasks' }).kind).toBe('route');
  });
});
