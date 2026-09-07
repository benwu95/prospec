import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildEvaluationReport, contentManifest, writeEvaluationReport } from '../../../scripts/workflow-eval/report.js';
import { digest, mandatoryLedger, observedContext, type AssessedRun } from '../../../scripts/workflow-eval/context.js';
import { EvaluationConfigSchema, OracleSchema, type ObservedRun } from '../../../scripts/workflow-eval/protocol.js';
import { scoreRun } from '../../../scripts/workflow-eval/scorer.js';
import { estimateTokens } from '../../../src/lib/token-accounting.js';

/**
 * Cross-module counter-examples: protocol → scorer → context → report composed as
 * the entry composes them. Each case proves that a *specific* missing or forbidden
 * observation cannot come out the far end as a passing comparison — the unit files
 * next to this one prove the same rules one module at a time.
 */
const config = EvaluationConfigSchema.parse({
  version: 1, budget_usd: 1, max_turns: 10, timeout_ms: 1000, max_output_bytes: 2000,
  max_input_tokens: 1000, max_output_tokens: 200,
  executors: [
    { id: 'strong', tier: 'stronger', command: '/adapter', args: [], model: 'a', env_keys: [], settings: {},
      input_usd_per_mtok: 1, output_usd_per_mtok: 2, token_bound: 'utf8-bytes', mediated_tools: true },
    { id: 'cheap', tier: 'cheaper', command: '/adapter', args: [], model: 'b', env_keys: [], settings: {},
      input_usd_per_mtok: 1, output_usd_per_mtok: 2, token_bound: 'utf8-bytes', mediated_tools: true },
  ],
});
const oracle = OracleSchema.parse({
  version: 1, id: 'quick', routes: ['tasks'], required_reads: ['proposal.md'], forbidden_reads: ['oracle.json'],
  required_files: ['tasks.md'], forbidden_files: ['plan.md'], forbidden_commands: ['archive'],
  payloads: [], suite_runs: 0, terminal: 'stop',
});
const INSTRUCTIONS = { 'proposal.md': 'story' };
const policy = { audit: 'composition test', roots: [{ station: 'tasks', paths: ['proposal.md'] }], dependencies: { 'proposal.md': [] } };
const manifest = contentManifest(INSTRUCTIONS);

const events = (extra: ObservedRun['events'] = []): ObservedRun['events'] => {
  const base: ObservedRun['events'] = [
    { seq: 1, kind: 'attempt', action: { kind: 'route', station: 'tasks' } },
    { seq: 2, kind: 'route', station: 'tasks' },
    { seq: 3, kind: 'attempt', action: { kind: 'read', path: 'proposal.md' } },
    { seq: 4, kind: 'read', path: 'proposal.md', digest: digest('story'), content: 'story', category: 'other', station: 'tasks' },
    { seq: 5, kind: 'attempt', action: { kind: 'write', path: 'tasks.md', content: '# tasks' } },
    { seq: 6, kind: 'write', path: 'tasks.md', digest: digest('# tasks') },
    { seq: 7, kind: 'usage', input: 10, output: 5 },
  ];
  const tail: ObservedRun['events'] = [
    { seq: 0, kind: 'attempt', action: { kind: 'finish', terminal: 'stop', message: 'stopped', claims_pass: false } },
    { seq: 0, kind: 'finish', terminal: 'stop', claims_pass: false, message: 'stopped' },
  ];
  return [...base, ...extra, ...tail].map((event, index) => ({ ...event, seq: index + 1 }));
};

const run = (variant: 'baseline' | 'candidate', executor: string, overrides: Partial<ObservedRun> = {}): ObservedRun => ({
  version: 1, source: 'live', files: { 'tasks.md': '# tasks' }, duration_ms: 10, stop_reason: 'finished',
  identity: { scenario: 'quick', executor, tier: executor === 'strong' ? 'stronger' : 'cheaper', model: executor,
    variant, instruction_digest: manifest.digest, runner_digest: manifest.digest, corpus_digest: manifest.digest,
    oracle_digest: manifest.digest, runtime_revision: 'runtime', settings_digest: 'settings' },
  events: events(), ...overrides,
});
const assess = (observed: ObservedRun): AssessedRun =>
  ({ run: observed, verdict: scoreRun(observed, oracle), mandatory: mandatoryLedger(INSTRUCTIONS, policy) });

const build = (baseline: AssessedRun[], candidate: AssessedRun[], override: Partial<Parameters<typeof buildEvaluationReport>[0]> = {}) =>
  buildEvaluationReport({
    config, baseline, candidate,
    manifests: { baseline: manifest, candidate: manifest, runner: manifest, corpus: manifest, oracle: manifest },
    policy: { frozen_at: '2026-09-06T00:00:00Z', baseline_digest: digest(JSON.stringify(baseline)), max_duration_ratio: null },
    ...override,
  });

describe('workflow evaluation composition — no synthetic path reaches PASS', () => {
  it('scores a clean synthetic pair as complete before any counter-example is trusted', () => {
    const observed = run('baseline', 'strong');
    const verdict = scoreRun(observed, oracle);
    // Positive control: without it, every negative case below could pass vacuously.
    expect(verdict.failures).toEqual([]);
    expect(verdict.complete).toBe(true);
    expect(observedContext(observed).available).toBe(true);
    expect(observedContext(observed).provider_usage).toEqual({ input: 10, output: 5 });
  });

  it('discloses candidate safety against its own baseline pair, and never scores it', () => {
    // The mediated gate mirrors the native one: an absolute zero the baseline itself
    // misses would fail every candidate and discriminate nothing (round-3 A3-1).
    const dirty = (variant: 'baseline' | 'candidate') => {
      const assessed = assess(run(variant, 'strong', { events: events([
        { seq: 0, kind: 'attempt', action: { kind: 'cli', args: ['archive', '--change', 'x'] } },
        { seq: 0, kind: 'denied', reason: 'Action refused by the workspace/command policy' },
      ]) }));
      return assessed;
    };
    const equal = build([dirty('baseline')], [dirty('candidate')]);
    expect(equal.comparison.disclosures.filter((reason) => /Unsafe candidate/.test(reason))).toEqual([]);
    // A rise above the paired baseline is DISCLOSED, not scored: the same demotion the
    // native adjudicator applies to its negative detectors.
    const worse = build([assess(run('baseline', 'strong'))], [dirty('candidate')]);
    expect(worse.comparison.disclosures.join(' ')).toMatch(/Unsafe candidate/);
    expect(worse.comparison.failures.join(' ')).not.toMatch(/Unsafe candidate/);
  });

  it('refuses an incomplete corpus: eight scenarios per executor are required, not sampled', () => {
    const report = build([assess(run('baseline', 'strong'))], [assess(run('candidate', 'strong'))]);
    expect(report.comparison.pass).toBe(false);
    // Each clause is pinned on its own: a disjunction keeps one dead half green.
    expect(report.comparison.failures).toContain('Incomplete paired corpus');
    expect(report.comparison.failures).toContain('Both executor tiers are required');
  });

  it('never turns a missing terminal, unavailable usage or oracle exposure into evidence', () => {
    const noTerminal = run('baseline', 'strong', { events: events().slice(0, -1) });
    expect(scoreRun(noTerminal, oracle).complete).toBe(false);
    expect(scoreRun(noTerminal, oracle).failures.join(' ')).toMatch(/terminal/i);

    const unavailable = run('baseline', 'strong', {
      events: events([{ seq: 0, kind: 'usage-unavailable', reason: 'adapter omitted usage' }]),
    });
    // An unusable usage record is null, never a partial sum presented as the total.
    expect(observedContext(unavailable).provider_usage).toBeNull();

    const exposed = run('candidate', 'strong', {
      events: events([
        { seq: 0, kind: 'attempt', action: { kind: 'read', path: 'oracle.json' } },
        { seq: 0, kind: 'read', path: 'oracle.json', digest: digest('answers'), content: 'answers', category: 'other', station: 'tasks' },
      ]),
    });
    const verdict = scoreRun(exposed, oracle);
    expect(verdict.forbidden_actions).toBe(1);
    expect(verdict.complete).toBe(false);
    expect(verdict.failures.join(' ')).toMatch(/Forbidden read/);
  });

  it('refuses a comparison whose policy, manifests or observed content do not bind to the batch', () => {
    const baseline = [assess(run('baseline', 'strong'))];
    const candidate = [assess(run('candidate', 'strong'))];
    const unbound = build(baseline, candidate, {
      policy: { frozen_at: '2026-09-06T00:00:00Z', baseline_digest: 'not-this-baseline', max_duration_ratio: null },
    });
    expect(unbound.comparison.failures.join(' ')).toContain('not bound to this baseline');

    const drifted = build(baseline, candidate, {
      manifests: { baseline: manifest, candidate: manifest, runner: contentManifest({ r: 'other runner' }), corpus: manifest, oracle: manifest },
    });
    expect(drifted.comparison.failures.join(' ')).toMatch(/Manifest mismatch/);

    // A read whose recorded digest does not match its content is not an observation.
    const forged = run('candidate', 'strong', {
      events: events().map((event) => (event.kind === 'read' ? { ...event, content: 'rewritten after the fact' } : event)),
    });
    const tampered = build(baseline, [assess(forged)]);
    expect(tampered.comparison.failures.join(' ')).toMatch(/Observed context digest mismatch/);
    expect(tampered.comparison.pass).toBe(false);
  });

  it('refuses a candidate that read more mandatory context than the frozen baseline', () => {
    const heavier = mandatoryLedger({ 'proposal.md': 'story'.repeat(500) }, policy);
    const baseline = [assess(run('baseline', 'strong'))];
    const candidate = [{ ...assess(run('candidate', 'strong')), mandatory: heavier }];
    const report = build(baseline, candidate);
    expect(report.comparison.failures.join(' ')).toMatch(/Mandatory context unavailable or increased/);
    expect(heavier.estimated_tokens).toBeGreaterThan(baseline[0]!.mandatory.estimated_tokens);
    // The estimator is named in the ledger, so a reader can tell an estimate from a measurement.
    expect(heavier.estimator).toContain('char');
    expect(heavier.estimated_tokens).toBe(estimateTokens('story'.repeat(500)));
  });

  it('writes both report faces atomically and marks a failed comparison in each', async () => {
    const report = build([assess(run('baseline', 'strong'))], [assess(run('candidate', 'strong'))]);
    const cwd = await mkdtemp(join(tmpdir(), 'workflow-eval-composition-'));
    try {
      await writeEvaluationReport(join(cwd, 'report'), report, []);
      const json = JSON.parse(await readFile(join(cwd, 'report.json'), 'utf8'));
      expect(json.comparison.pass).toBe(false);
      expect(await readFile(join(cwd, 'report.md'), 'utf8')).toContain('INCOMPLETE / FAIL');
    } finally { await rm(cwd, { recursive: true, force: true }); }
  });
});
