import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { mandatoryLedger, observedContext, observedLedger, comparePairedRuns } from '../../../scripts/workflow-eval/context.js';
import { estimateTokens, TOKEN_ESTIMATOR_LABEL } from '../../../src/lib/token-accounting.js';
import { SCENARIO_IDS, type ObservedRun, type RunVerdict } from '../../../scripts/workflow-eval/protocol.js';

const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const policy = { audit: 'reviewed policy v1', roots: [{ station: 'tasks', paths: ['skill.md'] }],
  dependencies: { 'skill.md': ['ref.md'], 'ref.md': ['nested.md'], 'nested.md': [] } };
const files = { 'skill.md': '1234', 'ref.md': '5678', 'nested.md': 'abcd' };
const verdict: RunVerdict = { complete: true, failures: [], route_correct: 1, route_expected: 1,
  payload_first_pass: 0, payload_expected: 0, forbidden_actions: 0, false_pass: 0, suite_runs: 0, unnecessary_test_runs: 0 };
function runs(variant: 'baseline' | 'candidate') {
  return ['stronger', 'cheaper'].flatMap((tier) => SCENARIO_IDS.map((scenario) => ({
    run: { version: 1, source: 'live', events: [{ seq: 1, kind: 'attempt', action: { kind: 'finish', terminal: 'stop', message: 'Test fixture', claims_pass: false } },
      { seq: 2, kind: 'finish', terminal: 'stop', message: 'Test fixture', claims_pass: false }], files: {}, duration_ms: 1, stop_reason: 'finished',
      identity: { scenario, executor: tier, tier, model: tier, variant, instruction_digest: variant,
        runtime_revision: 'runtime', runner_digest: 'runner', corpus_digest: 'corpus', oracle_digest: 'oracle', settings_digest: 'settings' },
    } as ObservedRun, verdict: { ...verdict }, mandatory: mandatoryLedger(files, policy),
  })));
}
describe('workflow context accounting', () => {
  it('recurses through required references, preserves repeat loads and deduplicates content separately', () => {
    const ledger = mandatoryLedger(files, { ...policy, roots: [...policy.roots, ...policy.roots] });
    expect(ledger).toMatchObject({ available: true, estimated_tokens: 6, unique_estimated_tokens: 3 });
    expect(ledger.loads.map((l) => l.path)).toEqual(['skill.md', 'ref.md', 'nested.md', 'skill.md', 'ref.md', 'nested.md']);
  });
  it('refuses missing files, incomplete dependency inventories, cycles and unaudited policy', () => {
    expect(mandatoryLedger({ 'skill.md': 'text' }, policy).available).toBe(false);
    expect(mandatoryLedger(files, { ...policy, dependencies: {} }).available).toBe(false);
    expect(mandatoryLedger(files, { ...policy, audit: '' }).available).toBe(false);
    expect(mandatoryLedger(files, { ...policy, dependencies: { ...policy.dependencies, 'nested.md': ['skill.md'] } }).available).toBe(false);
  });
  it('separates provider usage from estimated reads and detects unknown or corrupt sources', () => {
    const run = runs('baseline')[0]!.run;
    run.events = [1, 2].map((seq) => ({ seq, kind: 'read', path: 'a.md', content: 'abcd', digest: digest('abcd'), category: 'skill', station: 'tasks' }));
    expect(observedContext(run)).toMatchObject({ estimated_tokens: 2, unique_estimated_tokens: 1, provider_usage: null });
    run.events.push({ seq: 3, kind: 'usage', input: 8, output: 3 });
    expect(observedContext(run).provider_usage).toEqual({ input: 8, output: 3 });
    const first = run.events[0];
    if (first?.kind === 'read') first.digest = 'wrong';
    expect(observedContext(run).available).toBe(false);
  });
  it('requires all 32 same-corpus, same-executor runs', () => {
    expect(comparePairedRuns(runs('baseline'), runs('candidate')).pass).toBe(true);
    expect(comparePairedRuns(runs('baseline').slice(1), runs('candidate')).pass).toBe(false);
    const candidate = runs('candidate');
    candidate[0]!.run.identity.settings_digest = 'changed';
    expect(comparePairedRuns(runs('baseline'), candidate).pass).toBe(false);
  });
  it('does not hide a cheaper executor regression behind another executor', () => {
    const baseline = runs('baseline');
    baseline[0]!.verdict.complete = false;
    const candidate = runs('candidate');
    candidate.at(-1)!.verdict.complete = false;
    expect(comparePairedRuns(baseline, candidate).pass).toBe(false);
  });
  it('refuses missing context, mandatory increases and synthetic evidence', () => {
    for (const mutate of [
      (r: ReturnType<typeof runs>[number]) => { r.mandatory.available = false; },
      (r: ReturnType<typeof runs>[number]) => { r.mandatory.estimated_tokens++; },
      (r: ReturnType<typeof runs>[number]) => { r.run.source = 'synthetic'; },
    ]) {
      const candidate = runs('candidate');
      mutate(candidate[0]!);
      expect(comparePairedRuns(runs('baseline'), candidate).pass).toBe(false);
    }
  });
  it('discloses a rise in forbidden actions or false PASS instead of scoring it', () => {
    // Demoted with the adjudicator's other negative detectors: the count is reported per
    // pair, and completion is what gates. Scoring it produced false greens in every
    // review round, and once a false negative.
    for (const mutate of [
      (r: ReturnType<typeof runs>[number]) => { r.verdict.forbidden_actions = 1; },
      (r: ReturnType<typeof runs>[number]) => { r.verdict.false_pass = 1; },
    ]) {
      const candidate = runs('candidate');
      mutate(candidate[0]!);
      const comparison = comparePairedRuns(runs('baseline'), candidate);
      expect(comparison.pass).toBe(true);
      expect(comparison.disclosures.join(' ')).toMatch(/Unsafe candidate/);
      expect(comparison.failures.join(' ')).not.toMatch(/Unsafe candidate/);
    }
  });
  it('reports what a run actually loaded, including repeats, without shrinking on unavailable content', () => {
    const ledger = observedLedger([
      { path: '.agents/skills/prospec-tasks/SKILL.md', station: 'tasks', content: 'a'.repeat(400) },
      { path: '.agents/skills/prospec-tasks/SKILL.md', station: 'tasks', content: 'a'.repeat(400) },
      { path: '.agents/skills/prospec-plan/SKILL.md', station: 'plan', content: 'b'.repeat(800) },
    ]);
    expect(ledger.available).toBe(true);
    expect(ledger.loads).toHaveLength(3);
    expect(ledger.estimated_tokens).toBe(ledger.unique_estimated_tokens + estimateTokens('a'.repeat(400)));
    expect(ledger.estimator).toBe(TOKEN_ESTIMATOR_LABEL);
    const partial = observedLedger([{ path: 'outside.md', station: 'other', content: null }]);
    expect(partial.available).toBe(false);
    expect(partial.errors).toEqual(['Unavailable content: outside.md']);
    expect(partial.estimated_tokens).toBe(0);
  });
});
