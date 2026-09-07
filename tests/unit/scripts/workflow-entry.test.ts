import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { main, loadCorpus } from '../../../scripts/evaluate-workflow.js';
import { atomicWrite } from '../../../src/lib/fs-utils.js';
import { SCENARIO_IDS } from '../../../scripts/workflow-eval/protocol.js';
import type { runScenario } from '../../../scripts/workflow-eval/runner.js';

vi.setConfig({ testTimeout: 90_000 });

describe('workflow evaluator entry', () => {
  it('validates all eight pairs offline without any executor configuration', async () => {
    const logs: string[] = [];
    expect(await main(['offline'], (s) => logs.push(s))).toBe(0);
    expect(logs.join('\n')).toContain('8');
    expect(logs.join('\n')).toContain('no model calls');
    expect((await loadCorpus(resolve('tests/fixtures/workflow-eval'))).scenarios).toHaveLength(8);
  });
  it('refuses paid mode before reading configuration without explicit live opt-in', async () => {
    await expect(main(['live', '--config', '/missing/config'])).rejects.toThrow(/opt-in/i);
  });
  it('rejects unknown commands and flags', async () => {
    await expect(main(['anything'])).rejects.toThrow(/mode/i);
    await expect(main(['offline', '--surprise'])).rejects.toThrow();
  });
  it('writes an offline snapshot containing only shipped skill Markdown', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'workflow-entry-'));
    try {
      const output = join(cwd, 'snapshot.json');
      expect(await main(['offline', '--snapshot', output], () => {})).toBe(0);
      const snapshot = JSON.parse(await readFile(output, 'utf8'));
      const paths = Object.keys(snapshot.instructions);
      expect(paths.length).toBeGreaterThan(0);
      expect(paths.every((p) => p.startsWith('.agents/skills/') && p.endsWith('.md'))).toBe(true);
      expect(paths.some((p) => p.includes('private') || p.includes('oracle'))).toBe(false);
      const runtime = join(cwd, 'runtime.js');
      await atomicWrite(runtime, '// frozen fixture runtime');
      await main(['offline', '--runtime', runtime, '--freeze-runtime', join(cwd, 'frozen.mjs')], () => {});
      expect(await readFile(join(cwd, 'frozen.mjs'), 'utf8')).toBe('// frozen fixture runtime');
    } finally { await rm(cwd, { recursive: true, force: true }); }
  });
  it('adjudicates a saved native capture without any model call or quota use', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'workflow-adjudicate-'));
    try {
      const root = '/home/evaluator/quick';
      const files = (extra: Record<string, string> = {}) => ({ encoding: 'base64',
        files: Object.fromEntries(Object.entries({ '.prospec/changes/x/metadata.yaml': 'name: x\ncreated_at: "2026-09-05"\nstatus: story\nscale: quick\n', ...extra })
          .map(([path, content]) => [path, Buffer.from(content).toString('base64')])), unavailable: [] });
      await atomicWrite(join(cwd, 'identity.json'), JSON.stringify({ version: 1, executor: { cli: 'claude', model: 'claude-fable-5-1' },
        project_root: root, scenario: { id: 'quick' }, config_digest: 'c', runtime_digest: 'r', instructions_digest: 'i' }));
      await atomicWrite(join(cwd, 'before.json'), JSON.stringify({ artifacts: files() }));
      await atomicWrite(join(cwd, 'after.json'), JSON.stringify({ artifacts: files(), runtime_unchanged: true }));
      await atomicWrite(join(cwd, 'transport.json'), JSON.stringify({ exit_code: 124, duration_ms: 296602, failure: null,
        observation: { records: [], parse_errors: [], terminal_success: false } }));
      const logs: string[] = [];
      expect(await main(['adjudicate', '--capture', cwd], (s) => logs.push(s))).toBe(0);
      const adjudication = JSON.parse(await readFile(join(cwd, 'adjudication.json'), 'utf8'));
      expect(adjudication.metrics.strict.complete).toBe(false);
      expect(adjudication.metrics.graded.complete).toBe(false);
      expect(adjudication.metrics.strict.failures).toContain('execution');
      expect(adjudication.dimensions.artifacts.strict).toBe('violated');
      expect(logs.join('\n')).toContain('not a certified comparison');
      expect(logs.join('\n')).toMatch(/strict incomplete/);
      await expect(main(['adjudicate'])).rejects.toThrow(/capture/i);
    } finally { await rm(cwd, { recursive: true, force: true }); }
  });
  it('freezes real captures and refuses an adjudication that no longer follows from its capture', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'workflow-freeze-'));
    try {
      // Real captures, adjudicated by the same derivation compare-native re-runs: a
      // synthetic metrics file would prove the arithmetic (see workflow-native-comparison)
      // but never that the recorded evidence is bound to the capture it came from.
      const encode = (content: string) => Buffer.from(content).toString('base64');
      const artifacts = { encoding: 'base64', unavailable: [],
        files: { '.prospec/changes/x/metadata.yaml': encode('name: x\ncreated_at: "2026-09-05"\nstatus: story\nscale: quick\n') } };
      const write = async (root: string, instructions: string) => {
        for (const cli of ['agy', 'claude']) for (const id of SCENARIO_IDS) {
          const base = join(cwd, root, `${cli}-${id}`);
          await atomicWrite(join(base, 'identity.json'), JSON.stringify({ version: 1, executor: { cli, model: 'test-model' },
            project_root: `/home/evaluator/${id}`, scenario: { id }, config_digest: 'cfg', runtime_digest: 'rt', instructions_digest: instructions }));
          await atomicWrite(join(base, 'before.json'), JSON.stringify({ artifacts }));
          await atomicWrite(join(base, 'after.json'), JSON.stringify({ artifacts, runtime_unchanged: true }));
          await atomicWrite(join(base, 'transport.json'), JSON.stringify({ exit_code: 0, duration_ms: 1000, failure: null,
            observation: { records: [], parse_errors: [], terminal_success: true } }));
          expect(await main(['adjudicate', '--capture', base], () => {})).toBe(0);
        }
      };
      await write('baseline', 'baseline-snapshot');
      const snapshot = join(cwd, 'snapshot.json');
      await atomicWrite(snapshot, JSON.stringify({ version: 1, instructions: { '.agents/skills/x/SKILL.md': '# x' } }));
      const policy = join(cwd, 'policy.json');
      const logs: string[] = [];
      expect(await main(['freeze', '--capture', join(cwd, 'baseline'), '--instructions', snapshot, '--out', policy], (m) => logs.push(m))).toBe(0);
      const frozen = JSON.parse(await readFile(policy, 'utf8'));
      expect(frozen.pairs).toHaveLength(16);
      // Minimal captures prove nothing about workflow completion, and say so.
      expect(frozen.totals.graded).toMatchObject({ agy: 0, claude: 0 });
      expect(logs.join(' ')).toContain('16 pairs');
      await write('candidate', 'candidate-snapshot');
      const report = join(cwd, 'comparison.json');
      expect(await main(['compare-native', '--baseline', policy, '--candidate', join(cwd, 'candidate'),
        '--standard', 'strict', '--out', report], (m) => logs.push(m))).toBe(0);
      expect(JSON.parse(await readFile(report, 'utf8'))).toMatchObject({ verdict: 'pass', standard: 'strict', pairs: 16 });
      // Hand-editing a recorded metric is refused: the capture, not the file, decides.
      const tampered = join(cwd, 'candidate', 'claude-quick', 'adjudication.json');
      const stored = JSON.parse(await readFile(tampered, 'utf8'));
      stored.metrics.strict.complete = true;
      stored.metrics.strict.failures = [];
      await atomicWrite(tampered, JSON.stringify(stored, null, 2) + '\n');
      await expect(main(['compare-native', '--baseline', policy, '--candidate', join(cwd, 'candidate'),
        '--standard', 'strict', '--out', report], () => {})).rejects.toThrow(/does not follow from its capture/);
    } finally { await rm(cwd, { recursive: true, force: true }); }
  });
  it('requires configuration and a frozen policy for comparison', async () => {
    await expect(main(['compare'])).rejects.toThrow(/required/i);
  });
  it.each(['api', 'subscription'])('persists %s paired batches and policy (synthetic hook only)', async (mode) => {
    const cwd = await mkdtemp(join(tmpdir(), 'workflow-batch-'));
    try {
      const config = JSON.parse(await readFile(resolve('scripts/workflow-eval/config.example.json'), 'utf8'));
      if (mode === 'subscription') {
        config.execution_mode = mode;
        config.max_requests = 32;
        delete config.budget_usd;
        for (const executor of config.executors) {
          delete executor.input_usd_per_mtok;
          delete executor.output_usd_per_mtok;
          executor.token_bound = 'unavailable';
          executor.args = ['-e', `let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{const r=JSON.parse(s);console.log(JSON.stringify({version:1,request_id:r.request_id,action:{kind:'route',station:'tasks'},usage:null}))});`];
        }
      }
      vi.stubEnv('WORKFLOW_ENTRY_TEST_KEY', 'synthetic-credential-not-sent-to-model');
      for (const executor of config.executors) { executor.command = process.execPath; executor.env_keys = ['WORKFLOW_ENTRY_TEST_KEY']; }
      const paths = Object.fromEntries(['config', 'instructions', 'mandatory', 'baseline', 'candidate', 'policy'].map((name) => [name, join(cwd, `${name}.json`)]));
      await atomicWrite(paths.config!, JSON.stringify(config));
      await atomicWrite(paths.instructions!, JSON.stringify({ version: 1, instructions: { '.agents/skills/test/SKILL.md': '# Test' } }));
      const policy = { audit: 'Synthetic test policy only', roots: [{ station: 'tasks', paths: ['.agents/skills/test/SKILL.md'] }], dependencies: { '.agents/skills/test/SKILL.md': [] } };
      await atomicWrite(paths.mandatory!, JSON.stringify(Object.fromEntries(SCENARIO_IDS.map((id) => [id, policy]))));
      const runtime = join(cwd, 'runtime.mjs');
      await atomicWrite(runtime, '// Synthetic runtime fixture; never executed');
      const common = ['--live', '--config', paths.config!, '--instructions', paths.instructions!, '--mandatory', paths.mandatory!, '--runtime', runtime];
      let calls = 0;
      const evaluate: typeof runScenario = async (options) => {
        calls++;
        // Exercise one actual transport per executor/variant; all 32 scenario
        // iterations still run. Per-request transport semantics have their own suite.
        if (mode === 'subscription' && options.scenario.id === 'quick') await options.executor.request([{ role: 'user', content: 'Synthetic transport test; no model' }]);
        // Simulated controller shape for entry tests, not a provider invocation.
        return { version: 1, identity: options.identity, source: 'live', events: [], files: {}, duration_ms: 1, stop_reason: 'finished' };
      };
      expect(await main(['live', ...common, '--variant', 'baseline', '--out', paths.baseline!], () => {}, evaluate)).toBe(0);
      expect(calls).toBe(16);
      if (mode === 'subscription') expect(JSON.parse(await readFile(paths.baseline!, 'utf8'))).toMatchObject({ committed_usd: null, requests_consumed: 2 });
      await main(['offline', '--baseline', paths.baseline!, '--policy', paths.policy!], () => {});
      expect(await main(['live', ...common, '--variant', 'candidate', '--baseline', paths.baseline!, '--policy', paths.policy!, '--out', paths.candidate!], () => {}, evaluate)).toBe(0);
      expect(calls).toBe(32);
      if (mode === 'subscription') expect(JSON.parse(await readFile(paths.candidate!, 'utf8'))).toMatchObject({ committed_usd: null, requests_consumed: 4 });
      const compare = ['compare', '--config', paths.config!, '--baseline', paths.baseline!, '--candidate', paths.candidate!, '--policy', paths.policy!, '--out', join(cwd, 'comparison')];
      expect(await main(compare, () => {})).toBe(1);
      const report = JSON.parse(await readFile(join(cwd, 'comparison.json'), 'utf8'));
      expect(report.runs).toHaveLength(32);
      expect(report.comparison.pass).toBe(false);
      if (mode === 'subscription') {
        const baseline = JSON.parse(await readFile(paths.baseline!, 'utf8'));
        await atomicWrite(paths.baseline!, JSON.stringify({ ...baseline, requests_consumed: 32 }));
        expect(await main(['live', ...common, '--variant', 'candidate', '--baseline', paths.baseline!, '--policy', paths.policy!, '--out', join(cwd, 'exhausted.json')], () => {}, evaluate)).toBe(1);
        expect(calls).toBe(32);
        delete baseline.requests_consumed;
        await atomicWrite(paths.baseline!, JSON.stringify(baseline));
        await expect(main(['live', ...common, '--variant', 'candidate', '--baseline', paths.baseline!, '--policy', paths.policy!, '--out', join(cwd, 'missing.json')], () => {}, evaluate)).rejects.toThrow(/accounting unavailable/i);
        await atomicWrite(paths.baseline!, JSON.stringify({ ...baseline, requests_consumed: 2 }));
      }
      const changed = JSON.parse(await readFile(paths.policy!, 'utf8'));
      changed.max_duration_ratio = 999;
      await atomicWrite(paths.policy!, JSON.stringify(changed));
      await expect(main(compare, () => {})).rejects.toThrow(/policy changed/i);
      await atomicWrite(runtime, '// changed runtime');
      await expect(main(['live', ...common, '--variant', 'candidate', '--baseline', paths.baseline!, '--policy', paths.policy!, '--out', paths.candidate!], () => {}, evaluate)).rejects.toThrow(/baseline/i);
      expect(calls).toBe(32);
    } finally { await rm(cwd, { recursive: true, force: true }); }
  });
});
