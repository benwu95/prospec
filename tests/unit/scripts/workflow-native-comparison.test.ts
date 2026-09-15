import { describe, expect, it } from 'vitest';
import { compareNativeBatches, freezeNativeBaseline, NativeBaselinePolicySchema, policyDigestOf } from '../../../scripts/workflow-eval/native-comparison.js';
import { NativeCliSchema } from '../../../scripts/workflow-eval/native.js';
import { SCENARIO_IDS } from '../../../scripts/workflow-eval/protocol.js';

const manifests = { instructions: 'i'.repeat(64), corpus: 'c'.repeat(64), oracle: 'o'.repeat(64), runner: 'r'.repeat(64) };
const run = (cli: string, scenario: string, overrides: Record<string, unknown> = {}) => ({
  version: 1, scenario, cli, model: cli === 'claude' ? 'fable' : 'flash', project_root: `/home/evaluator/${scenario}`,
  digests: { config: 'cfg', runtime: 'rt', instructions: manifests.instructions },
  transport: { exit_code: 0, duration_ms: 1000, terminal_success: true, records: 10, parse_errors: 0 },
  context: { available: true, errors: [], estimator: 'chars/4', loads: [], estimated_tokens: 500, unique_estimated_tokens: 400 },
  operations: 5, dimensions: {}, disclosure: [],
  metrics: {
    strict: { complete: false, failures: ['independent_receipt'], route_correct: 1, route_expected: 1,
      payload_valid: 0, payload_expected: 0, forbidden_actions: 0, false_pass: 0, suite_runs: 0, unnecessary_test_runs: 0 },
    graded: { complete: true, failures: [], route_correct: 1, route_expected: 1,
      payload_valid: 0, payload_expected: 0, forbidden_actions: 0, false_pass: 0, suite_runs: 0, unnecessary_test_runs: 0 },
    ...overrides,
  },
});
const batch = (overrides: Record<string, Record<string, unknown>> = {}) =>
  NativeCliSchema.options.flatMap((cli) => SCENARIO_IDS.map((id) => run(cli, id, overrides[`${cli}-${id}`] ?? {})));
const current = { corpus: manifests.corpus, oracle: manifests.oracle, runner: manifests.runner };
const candidateOf = (runs: ReturnType<typeof batch>, instructions = 'n'.repeat(64)) =>
  runs.map((entry) => ({ ...entry, digests: { ...entry.digests, instructions } }));

describe('native baseline freezing and paired comparison', () => {
  it('freezes a complete two-executor batch with its content identity', () => {
    const policy = freezeNativeBaseline(batch(), manifests);
    expect(NativeBaselinePolicySchema.parse(policy)).toBeTruthy();
    expect(policy.pairs).toHaveLength(16);
    expect(policy.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(policy.totals.graded).toMatchObject({ agy: 8, claude: 8 });
    expect(policy.totals.strict).toMatchObject({ agy: 0, claude: 0 });
    // The same batch freezes to the same policy digest; one changed metric does not.
    expect(freezeNativeBaseline(batch(), manifests).digest).toBe(policy.digest);
    const changed = freezeNativeBaseline(batch({ 'agy-quick': { graded: { ...run('agy', 'quick').metrics.graded, complete: false } } }), manifests);
    expect(changed.digest).not.toBe(policy.digest);
    expect(changed.totals.graded.agy).toBe(7);
  });
  it('refuses to freeze an incomplete batch or mixed instruction identities', () => {
    expect(() => freezeNativeBaseline(batch().slice(1), manifests)).toThrow(/pair/i);
    expect(() => freezeNativeBaseline([...batch(), run('claude', 'quick')], manifests)).toThrow(/duplicate/i);
    const mixed = batch();
    mixed[3] = { ...mixed[3]!, digests: { ...mixed[3]!.digests, instructions: 'z'.repeat(64) } };
    expect(() => freezeNativeBaseline(mixed, manifests)).toThrow(/identity/i);
  });
  it('gates on completion and reports the disclosed safety counts', () => {
    const policy = freezeNativeBaseline(batch(), manifests);
    const clean = compareNativeBatches(policy, candidateOf(batch()), 'graded', current);
    expect(clean).toMatchObject({ verdict: 'pass', standard: 'graded', pairs: 16 });
    expect(clean.completion).toMatchObject({ agy: { baseline: 8, candidate: 8 }, claude: { baseline: 8, candidate: 8 } });
    const regressed = compareNativeBatches(policy, candidateOf(batch({
      'claude-quick': { graded: { ...run('claude', 'quick').metrics.graded, complete: false, failures: ['routes'] } } })), 'graded', current);
    expect(regressed.verdict).toBe('fail');
    expect(regressed.reasons.join(' ')).toMatch(/claude/);
    // Forbidden actions and false PASS are the adjudicator's DISCLOSED dimensions, so a
    // rise is reported per pair and does not gate — the same reason the adjudicator
    // stopped scoring them. The number still travels, in `warnings` and in the report.
    const forbidden = compareNativeBatches(policy, candidateOf(batch({
      'agy-quick': { graded: { ...run('agy', 'quick').metrics.graded, forbidden_actions: 1 } } })), 'graded', current);
    expect(forbidden.verdict).toBe('pass');
    expect(forbidden.warnings.join(' ')).toMatch(/Forbidden actions rose for agy-quick/);
    expect(forbidden.forbidden_actions.agy).toMatchObject({ baseline: 0, candidate: 1 });
    const falsePass = compareNativeBatches(policy, candidateOf(batch({
      'agy-quick': { graded: { ...run('agy', 'quick').metrics.graded, false_pass: 1 } } })), 'graded', current);
    expect(falsePass.verdict).toBe('pass');
    expect(falsePass.warnings.join(' ')).toMatch(/False pass claims rose for agy-quick/);
  });
  it('derives the gate from the frozen pairs and refuses a tampered policy', () => {
    const policy = freezeNativeBaseline(batch(), manifests);
    // Lowering the recorded totals must not lower the bar: the gate reads the pairs.
    const lowered = { ...policy, totals: { ...policy.totals, graded: { agy: 0, claude: 0 } } };
    const regressed = candidateOf(batch(Object.fromEntries(NativeCliSchema.options.flatMap((cli) =>
      SCENARIO_IDS.map((id) => [`${cli}-${id}`, { graded: { ...run(cli, id).metrics.graded, complete: false, failures: ['routes'] } }])))));
    const tampered = compareNativeBatches(lowered, regressed, 'graded', current);
    expect(tampered.verdict).not.toBe('pass');
    expect(tampered.reasons.join(' ')).toMatch(/totals do not match|digest/i);
    // Rewriting a pair without re-freezing breaks the policy's own content digest.
    const rewritten = { ...policy, pairs: policy.pairs.map((pair, index) =>
      index === 0 ? { ...pair, graded: { ...pair.graded, complete: false } } : pair) };
    const broken = compareNativeBatches(rewritten, candidateOf(batch()), 'graded', current);
    expect(broken.verdict).toBe('incomplete');
    expect(broken.reasons.join(' ')).toMatch(/digest/i);
    // An untouched policy still verifies and still gates on real completion.
    expect(compareNativeBatches(policy, regressed, 'graded', current).verdict).toBe('fail');
  });
  it('reports forbidden actions and false PASS against the baseline, not against zero', () => {
    const dirty = (cli: string, id: string) => ({ graded: { ...run(cli, id).metrics.graded, forbidden_actions: 2, false_pass: 1 } });
    const dirtyOverrides = Object.fromEntries(NativeCliSchema.options.flatMap((cli) =>
      SCENARIO_IDS.map((id) => [`${cli}-${id}`, dirty(cli, id)])));
    const policy = freezeNativeBaseline(batch(dirtyOverrides), manifests);
    expect(policy.totals.graded).toMatchObject({ agy: 8, claude: 8 });
    // The baseline itself attempts forbidden actions, so an equal candidate is not a regression.
    const equal = compareNativeBatches(policy, candidateOf(batch(dirtyOverrides)), 'graded', current);
    expect(equal.verdict).toBe('pass');
    expect(equal.forbidden_actions).toMatchObject({ agy: { baseline: 16, candidate: 16 } });
    expect(equal.false_pass).toMatchObject({ claude: { baseline: 8, candidate: 8 } });
    // A rise above the frozen baseline is reported per pair, against that pair's own
    // count — never against zero, which the baseline itself does not meet.
    const worse = compareNativeBatches(policy, candidateOf(batch({ ...dirtyOverrides,
      'agy-quick': { graded: { ...run('agy', 'quick').metrics.graded, forbidden_actions: 3, false_pass: 1 } } })), 'graded', current);
    expect(worse.verdict).toBe('pass');
    expect(worse.warnings.join(' ')).toMatch(/Forbidden actions rose for agy-quick: 2 → 3/);
    // Completion is the gate, and it is untouched here.
    expect(worse.completion.agy).toMatchObject({ baseline: 8, candidate: 8 });
  });
  it('derives the required pair set from the executor schema, not a literal list', () => {
    expect(NativeCliSchema.options.length).toBeGreaterThan(1);
    for (const cli of NativeCliSchema.options) {
      const withoutOneExecutor = batch().filter((entry) => entry.cli !== cli);
      expect(() => freezeNativeBaseline(withoutOneExecutor, manifests)).toThrow(new RegExp(`${cli}-`));
    }
  });
  it('compares forbidden actions and false PASS per pair, not as a per-executor total', () => {
    // One dirty scenario in the baseline must not hide a NEW violation elsewhere: the
    // per-executor totals are identical here, which is why they could never be the
    // comparison unit — even now that the comparison only reports these counts.
    const policy = freezeNativeBaseline(batch({
      'agy-quick': { graded: { ...run('agy', 'quick').metrics.graded, forbidden_actions: 3, false_pass: 1 } } }), manifests);
    const moved = compareNativeBatches(policy, candidateOf(batch({
      'agy-standard-ui': { graded: { ...run('agy', 'standard-ui').metrics.graded, forbidden_actions: 3, false_pass: 1 } } })), 'graded', current);
    expect(moved.warnings.join(' ')).toContain('agy-standard-ui');
    expect(moved.warnings.join(' ')).toMatch(/0 → 3/);
    expect(moved.forbidden_actions.agy).toMatchObject({ baseline: 3, candidate: 3 });
  });
  it('refuses a comparison whose corpus, oracle or runner no longer matches the frozen manifests', () => {
    const policy = freezeNativeBaseline(batch(), manifests);
    for (const key of ['corpus', 'oracle', 'runner'] as const) {
      const drifted = compareNativeBatches(policy, candidateOf(batch()), 'graded', { ...current, [key]: 'z'.repeat(64) });
      expect(drifted.verdict, key).toBe('incomplete');
      expect(drifted.reasons.join(' '), key).toMatch(/manifest/i);
    }
  });
  it('carries observed context and duration forward as reported evidence, not as a gate', () => {
    const policy = freezeNativeBaseline(batch(), manifests);
    expect(policy.max_duration_ratio).toBeNull();
    expect(policy.totals.context).toMatchObject({ agy: 4000, claude: 4000 });
    expect(policy.pairs[0]).toMatchObject({ context_tokens: 500, context_available: true, duration_ms: 1000 });
    const heavier = candidateOf(batch()).map((entry) => ({ ...entry,
      context: { ...entry.context, estimated_tokens: 900 }, transport: { ...entry.transport, duration_ms: 4000 } }));
    const report = compareNativeBatches(policy, heavier, 'graded', current);
    // Observed reads vary between runs, so a rise is disclosed, never scored as failure.
    expect(report.verdict).toBe('pass');
    expect(report.context.agy).toMatchObject({ baseline: 4000, candidate: 7200 });
    expect(report.warnings.join(' ')).toMatch(/context/i);
    expect(report.duration.claude).toMatchObject({ baseline: 8000, candidate: 32000 });
    const unavailable = candidateOf(batch()).map((entry) => ({ ...entry,
      context: { ...entry.context, available: false, errors: ['Unavailable content: x'] } }));
    const partial = compareNativeBatches(policy, unavailable, 'graded', current);
    expect(partial.verdict).toBe('pass');
    expect(partial.context.agy?.candidate).toBeNull();
    expect(partial.warnings.join(' ')).toMatch(/unavailable/i);
  });
  it('refuses a frozen policy that does not carry the pairs it claims to bind', () => {
    const policy = freezeNativeBaseline(batch(), manifests);
    // A self-consistent digest over an EMPTY pair set passed a fully regressed candidate
    // as `pass` with no reasons at all (round-5 A5-1): coverage is checked first now.
    const emptied = { ...policy, pairs: [], totals: { strict: {}, graded: {}, context: {}, duration_ms: {} } };
    const hollow = compareNativeBatches({ ...emptied, digest: policyDigestOf(emptied) }, candidateOf(batch()), 'graded', current);
    expect(hollow.verdict).toBe('incomplete');
    expect(hollow.reasons.join(' ')).toMatch(/missing pair/i);
    // One dropped pair is refused for the same reason.
    const partial = { ...policy, pairs: policy.pairs.slice(1) };
    const short = compareNativeBatches({ ...partial, digest: policyDigestOf(partial) }, candidateOf(batch()), 'graded', current);
    expect(short.verdict).toBe('incomplete');
    expect(short.reasons.join(' ')).toMatch(/missing pair/i);
  });
  it('never turns an incomplete or mismatched pairing into a pass', () => {
    const policy = freezeNativeBaseline(batch(), manifests);
    const missing = compareNativeBatches(policy, candidateOf(batch()).slice(2), 'graded', current);
    expect(missing.verdict).toBe('incomplete');
    expect(missing.reasons.join(' ')).toMatch(/missing/i);
    // Same instruction snapshot on both sides measures nothing.
    const unchanged = compareNativeBatches(policy, batch(), 'graded', current);
    expect(unchanged.verdict).toBe('incomplete');
    expect(unchanged.reasons.join(' ')).toMatch(/instruction/i);
    const drifted = candidateOf(batch());
    drifted[0] = { ...drifted[0]!, digests: { ...drifted[0]!.digests, runtime: 'other' } };
    const mismatch = compareNativeBatches(policy, drifted, 'graded', current);
    expect(mismatch.verdict).toBe('incomplete');
    expect(mismatch.reasons.join(' ')).toMatch(/identity/i);
    // The strict standard is scored from the same frozen policy, not a re-freeze.
    const strict = compareNativeBatches(policy, candidateOf(batch()), 'strict', current);
    expect(strict).toMatchObject({ verdict: 'pass', standard: 'strict' });
    expect(strict.completion.claude).toMatchObject({ baseline: 0, candidate: 0 });
  });
});
