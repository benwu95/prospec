import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentManifest, redactConfig, writeEvaluationReport, buildEvaluationReport } from '../../../scripts/workflow-eval/report.js';
import { EvaluationConfigSchema } from '../../../scripts/workflow-eval/protocol.js';
import { digest, mandatoryLedger, type AssessedRun } from '../../../scripts/workflow-eval/context.js';

const config = EvaluationConfigSchema.parse({ version: 1, budget_usd: 1, max_turns: 10,
  timeout_ms: 1000, max_output_bytes: 2000, max_input_tokens: 1000, max_output_tokens: 200,
  executors: [{ id: 'cheap', tier: 'cheaper', command: '/local/secret/adapter', args: ['credential'],
    model: 'test', env_keys: ['MODEL_KEY'], settings: { token: 'credential' },
    input_usd_per_mtok: 1, output_usd_per_mtok: 2, token_bound: 'utf8-bytes', mediated_tools: true }] });
describe('workflow evidence reporting', () => {
  it('uses stable sorted content manifests, including dirty instruction bytes', () => {
    expect(contentManifest({ b: 'two', a: 'one' })).toEqual(contentManifest({ a: 'one', b: 'two' }));
    expect(contentManifest({ a: 'one' }).digest).not.toBe(contentManifest({ a: 'edited' }).digest);
  });
  it('never serializes adapter argv, paths, environment values or arbitrary settings', () => {
    const safe = redactConfig(config);
    expect(JSON.stringify(safe)).not.toContain('credential');
    expect(JSON.stringify(safe)).not.toContain('/local/secret');
    expect(safe.executors[0]?.env_keys).toEqual(['MODEL_KEY']);
    expect(safe.executors[0]?.settings_digest).toMatch(/^[a-f0-9]{64}$/);
  });
  it('reports missing pairs as incomplete, not successful model evidence', async () => {
    const report = buildEvaluationReport({ config, baseline: [], candidate: [],
      manifests: { baseline: contentManifest({ a: 'before' }), candidate: contentManifest({ a: 'after' }),
        runner: contentManifest({ r: 'runner' }), corpus: contentManifest({ c: 'corpus' }), oracle: contentManifest({ o: 'oracle' }) },
      policy: { frozen_at: '2026-09-06T00:00:00Z', baseline_digest: 'baseline', max_duration_ratio: null },
    });
    expect(report.comparison.pass).toBe(false);
    expect(report.runs).toEqual([]);
    const cwd = await mkdtemp(join(tmpdir(), 'workflow-report-'));
    try {
      await writeEvaluationReport(join(cwd, 'report'), report, []);
      expect(JSON.parse(await readFile(join(cwd, 'report.json'), 'utf8')).comparison.pass).toBe(false);
      expect(await readFile(join(cwd, 'report.md'), 'utf8')).toContain('INCOMPLETE / FAIL');
      report.comparison.failures.push('secret-value');
      await writeEvaluationReport(join(cwd, 'redacted'), report, ['secret-value']);
      for (const ext of ['json', 'md']) {
        const output = await readFile(join(cwd, `redacted.${ext}`), 'utf8');
        expect(output).not.toContain('secret-value');
        expect(output).toContain('[REDACTED]');
      }
    } finally { await rm(cwd, { recursive: true, force: true }); }
  });
  it('evaluates frozen timing policies and reports real usage separately from estimates', () => {
    const manifest = contentManifest({ a: 'text' });
    const row: AssessedRun = { run: { version: 1, source: 'synthetic', identity: { scenario: 'quick', executor: 'fake', tier: 'cheaper', model: 'fake',
      variant: 'baseline', instruction_digest: manifest.digest, runner_digest: manifest.digest, corpus_digest: manifest.digest,
      oracle_digest: manifest.digest, runtime_revision: 'runtime', settings_digest: 'settings' }, files: {},
      events: [{ seq: 1, kind: 'usage', input: 10, output: 3 }], duration_ms: 1, stop_reason: 'finished' },
    verdict: { complete: false, failures: ['Missing'], route_correct: 0, route_expected: 1, payload_first_pass: 0, payload_expected: 1,
      forbidden_actions: 0, false_pass: 0, suite_runs: 0, unnecessary_test_runs: 0 },
    mandatory: mandatoryLedger({ a: 'text' }, { audit: 'test', roots: [{ station: 'tasks', paths: ['a'] }], dependencies: { a: [] } }) };
    const after = { ...row, run: { ...row.run, identity: { ...row.run.identity, variant: 'candidate' as const }, duration_ms: 3 } };
    const report = buildEvaluationReport({ config, baseline: [row], candidate: [after],
      manifests: { baseline: manifest, candidate: manifest, runner: manifest, corpus: manifest, oracle: manifest },
      policy: { frozen_at: '2026-09-06T00:00:00Z', baseline_digest: digest(JSON.stringify([row])), max_duration_ratio: 2 } });
    expect(report.comparison.failures.some((f) => f.includes('duration policy'))).toBe(true);
    expect(report.runs[0]?.observed.provider_usage).toEqual({ input: 10, output: 3 });
  });
});
