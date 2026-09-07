import { z } from 'zod';
import { digest } from './context.js';
import { NativeMetricsSchema } from './native-adjudication.js';
import { NativeCliSchema } from './native.js';
import { SCENARIO_IDS } from './protocol.js';

const hash = z.string().min(1);
// The adjudicator is the only producer of these metrics, so its schema is the
// single source here; the mediated path's `VerdictSchema` is a different producer.
const MetricsSchema = NativeMetricsSchema;
export const AdjudicationSchema = z.object({
  version: z.literal(1), scenario: z.enum(SCENARIO_IDS), cli: NativeCliSchema,
  digests: z.object({ config: hash, runtime: hash, instructions: hash }),
  transport: z.object({ duration_ms: z.number().finite().nonnegative() }),
  context: z.object({ available: z.boolean(), errors: z.array(z.string()),
    estimated_tokens: z.number(), unique_estimated_tokens: z.number() }),
  metrics: z.object({ strict: MetricsSchema, graded: MetricsSchema }),
});
type Adjudication = z.infer<typeof AdjudicationSchema>;
const StandardSchema = z.enum(['strict', 'graded']);
type Standard = z.infer<typeof StandardSchema>;

export const NativeBaselinePolicySchema = z.strictObject({
  version: z.literal(1), frozen_at: z.string(), digest: hash,
  manifests: z.strictObject({ instructions: hash, corpus: hash, oracle: hash, runner: hash }),
  identity: z.strictObject({ config: hash, runtime: hash, instructions: hash }),
  // Frozen but deliberately unenforced: observed reads and wall clock vary per run.
  max_duration_ratio: z.null(),
  totals: z.strictObject({ strict: z.record(z.string(), z.number()), graded: z.record(z.string(), z.number()),
    context: z.record(z.string(), z.number()), duration_ms: z.record(z.string(), z.number()) }),
  pairs: z.array(z.strictObject({ cli: NativeCliSchema, scenario: z.enum(SCENARIO_IDS),
    strict: MetricsSchema, graded: MetricsSchema,
    context_tokens: z.number(), context_available: z.boolean(), duration_ms: z.number() })),
});
export type NativeBaselinePolicy = z.infer<typeof NativeBaselinePolicySchema>;

const key = (run: { cli: string; scenario: string }) => `${run.cli}-${run.scenario}`;
/** Sum one number per run, grouped by executor — the only shape these totals take. */
const groupByCli = <T extends { cli: string }>(runs: readonly T[], value: (entry: T) => number): Record<string, number> => {
  const totals: Record<string, number> = {};
  for (const entry of runs) totals[entry.cli] = (totals[entry.cli] ?? 0) + value(entry);
  return totals;
};
const completed = (standard: Standard) => (entry: { metrics: Adjudication['metrics'] }) => entry.metrics[standard].complete ? 1 : 0;
/** Exported so a test can build a TAMPERED-but-self-consistent policy on purpose. */
export const policyDigestOf = (policy: Pick<NativeBaselinePolicy, 'manifests' | 'identity' | 'pairs'>) =>
  digest(JSON.stringify({ manifests: policy.manifests, identity: policy.identity, pairs: policy.pairs }));
/** Totals are DERIVED from the frozen pairs; the recorded copy is only an echo. */
const pairTotals = (pairs: NativeBaselinePolicy['pairs'], standard: Standard) =>
  groupByCli(pairs, (pair) => pair[standard].complete ? 1 : 0);
const pairSums = (pairs: NativeBaselinePolicy['pairs'], value: (pair: NativeBaselinePolicy['pairs'][number]) => number) =>
  groupByCli(pairs, value);
const sameTotals = (left: Record<string, number>, right: Record<string, number>) =>
  JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());
/**
 * A frozen policy is not trusted on its face: its own content digest is recomputed,
 * and every recorded total must still follow from its pairs. Editing the file to
 * lower the bar therefore fails the comparison instead of passing a regression.
 */
function verifyBaseline(baseline: NativeBaselinePolicy): string[] {
  const reasons: string[] = [];
  // Coverage first: `freeze` requires every pair, but nothing re-checked that the policy
  // being COMPARED against still has them. A `pairs: []` policy with a self-consistent
  // digest passed a 16/16-incomplete candidate as `pass` with no reasons at all
  // (round-5 A5-1), which is the opposite of this function's contract.
  const expected = NativeCliSchema.options.flatMap((cli) => SCENARIO_IDS.map((scenario) => `${cli}-${scenario}`));
  const present = new Set(baseline.pairs.map((pair) => key(pair)));
  const missing = expected.filter((name) => !present.has(name));
  if (missing.length) reasons.push(`Frozen baseline is missing pair ${missing.join(', ')}`);
  if (policyDigestOf(baseline) !== baseline.digest) reasons.push('Frozen baseline digest does not match its own manifests, identity and pairs');
  for (const standard of StandardSchema.options) {
    if (!sameTotals(baseline.totals[standard], pairTotals(baseline.pairs, standard))) {
      reasons.push(`Frozen baseline ${standard} totals do not match its pairs`);
    }
  }
  if (!sameTotals(baseline.totals.context, pairSums(baseline.pairs, (pair) => pair.context_tokens))) {
    reasons.push('Frozen baseline context totals do not match its pairs');
  }
  if (!sameTotals(baseline.totals.duration_ms, pairSums(baseline.pairs, (pair) => pair.duration_ms))) {
    reasons.push('Frozen baseline duration totals do not match its pairs');
  }
  return reasons;
}
const completion = (runs: Adjudication[], standard: Standard) => groupByCli(runs, completed(standard));
const sumBy = (runs: Adjudication[], value: (run: Adjudication) => number) => groupByCli(runs, value);
/** Null, not zero, when any run in the group could not be measured. */
const contextTotals = (runs: Adjudication[]): Record<string, number | null> => {
  const totals: Record<string, number | null> = {};
  for (const run of runs) {
    const current = totals[run.cli];
    totals[run.cli] = current === null || !run.context.available ? null : (current ?? 0) + run.context.estimated_tokens;
  }
  return totals;
};

function parseBatch(input: unknown[], label: string): Adjudication[] {
  const runs = input.map((entry) => AdjudicationSchema.parse(entry));
  const seen = new Set<string>();
  for (const run of runs) {
    if (seen.has(key(run))) throw new Error(`Duplicate ${label} adjudication: ${key(run)}`);
    seen.add(key(run));
  }
  const expected = NativeCliSchema.options.flatMap((cli) => SCENARIO_IDS.map((scenario) => `${cli}-${scenario}`));
  const missing = expected.filter((name) => !seen.has(name));
  if (missing.length) throw new Error(`Incomplete ${label}: missing pair ${missing.join(', ')}`);
  return runs;
}

/**
 * Freeze an adjudicated baseline batch so a later candidate cannot move the bar.
 * Every pair must be present and share one instruction identity; a partial batch
 * is refused rather than averaged.
 */
export function freezeNativeBaseline(input: unknown[], manifests: NativeBaselinePolicy['manifests']): NativeBaselinePolicy {
  const runs = parseBatch(input, 'baseline');
  const identity = runs[0]!.digests;
  if (runs.some((run) => run.digests.config !== identity.config || run.digests.runtime !== identity.runtime ||
    run.digests.instructions !== identity.instructions)) throw new Error('Baseline content identity mismatch across runs');
  const pairs = [...runs].sort((a, b) => key(a).localeCompare(key(b)))
    .map((run) => ({ cli: run.cli, scenario: run.scenario, strict: run.metrics.strict, graded: run.metrics.graded,
      context_tokens: run.context.estimated_tokens, context_available: run.context.available,
      duration_ms: run.transport.duration_ms }));
  const policy = { version: 1 as const, frozen_at: new Date().toISOString(),
    digest: policyDigestOf({ manifests, identity, pairs }), manifests, identity, max_duration_ratio: null,
    totals: { strict: completion(runs, 'strict'), graded: completion(runs, 'graded'),
      context: sumBy(runs, (run) => run.context.estimated_tokens), duration_ms: sumBy(runs, (run) => run.transport.duration_ms) },
    pairs };
  return NativeBaselinePolicySchema.parse(policy);
}

/**
 * What counts as a regression. Completion is compared per executor, while forbidden
 * actions and false PASS are compared per PAIR: an absolute threshold the baseline
 * itself misses discriminates nothing, and a per-executor sum lets a new violation hide
 * behind an existing one in another scenario (round-2 C2-2).
 */
function regressionFailures(baseline: NativeBaselinePolicy, candidate: Adjudication[], standard: Standard,
  baselineTotals: Record<string, number>, totals: Record<string, number>): { failures: string[]; warnings: string[] } {
  const failures: string[] = [];
  const warnings: string[] = [];
  for (const [cli, baselineTotal] of Object.entries(baselineTotals)) {
    const candidateTotal = totals[cli] ?? 0;
    if (candidateTotal < baselineTotal) failures.push(`Completion regressed for ${cli}: ${baselineTotal} → ${candidateTotal}`);
  }
  // Forbidden actions and false PASS come from the adjudicator's DISCLOSED dimensions —
  // positive detectors over an incomplete trace. A rise is reported per pair and never
  // gates, for the same reason the adjudicator stopped scoring them.
  for (const run of candidate) {
    const pair = baseline.pairs.find((entry) => key(entry) === key(run));
    if (!pair) continue;
    for (const [label, value] of [['Forbidden actions', 'forbidden_actions'], ['False pass claims', 'false_pass']] as const) {
      const before = pair[standard][value];
      const after = run.metrics[standard][value];
      if (after > before) warnings.push(`${label} rose for ${key(run)}: ${before} → ${after} (disclosed, not a gate)`);
    }
  }
  return { failures, warnings };
}

/** Identity binding: the instructions must differ, and nothing else may. */
function candidateIdentityReasons(baseline: NativeBaselinePolicy, candidate: Adjudication[]): string[] {
  const reasons: string[] = [];
  if (candidate.some((run) => run.digests.config !== baseline.identity.config || run.digests.runtime !== baseline.identity.runtime)) {
    reasons.push('Candidate content identity differs from the frozen baseline beyond its instructions');
  }
  if (candidate.every((run) => run.digests.instructions === baseline.identity.instructions)) {
    reasons.push('Candidate carries the baseline instruction snapshot; the comparison measures nothing');
  }
  if (new Set(candidate.map((run) => run.digests.instructions)).size !== 1) {
    reasons.push('Candidate runs do not share one instruction identity');
  }
  return reasons;
}

/** Observed reads vary per run, so context movement is disclosed rather than scored. */
function contextWarnings(baseline: NativeBaselinePolicy, candidateContext: Record<string, number | null>): string[] {
  const warnings: string[] = [];
  for (const [cli, total] of Object.entries(candidateContext)) {
    const before = baseline.totals.context[cli] ?? 0;
    if (total === null) warnings.push(`Observed context unavailable for ${cli}; the candidate total cannot be compared`);
    else if (total > before) warnings.push(`Observed instruction context rose for ${cli}: ${before} → ${total} estimated tokens (observed reads vary per run; not a gate)`);
  }
  return warnings;
}

/**
 * Compare a candidate batch against the frozen baseline under one evidence
 * standard. Absent pairs, a drifted runner/config identity or an unchanged
 * instruction snapshot leave the comparison incomplete — never a pass.
 */
export function compareNativeBatches(policy: unknown, candidateInput: unknown[], standardInput: unknown,
  current: { corpus: string; oracle: string; runner: string }) {
  const baseline = NativeBaselinePolicySchema.parse(policy);
  const standard = StandardSchema.parse(standardInput);
  const reasons: string[] = [...verifyBaseline(baseline)];
  // The instructions are SUPPOSED to differ; the corpus, its private oracles and the
  // adjudicating runner are not. Comparing across a changed judge measures the judge.
  for (const [name, digest] of Object.entries(current)) {
    if (baseline.manifests[name as keyof typeof current] !== digest) {
      reasons.push(`Frozen baseline ${name} manifest does not match the current ${name}`);
    }
  }
  let candidate: Adjudication[] = [];
  try { candidate = parseBatch(candidateInput, 'candidate'); }
  catch (error) { reasons.push(error instanceof Error ? error.message : 'Unreadable candidate batch'); }
  if (candidate.length) reasons.push(...candidateIdentityReasons(baseline, candidate));
  const incomplete = reasons.length > 0;
  const baselineTotals = pairTotals(baseline.pairs, standard);
  const totals = candidate.length ? completion(candidate, standard) : {};
  const baselineForbidden = pairSums(baseline.pairs, (pair) => pair[standard].forbidden_actions);
  const baselineFalsePass = pairSums(baseline.pairs, (pair) => pair[standard].false_pass);
  const candidateForbidden = sumBy(candidate, (run) => run.metrics[standard].forbidden_actions);
  const candidateFalsePass = sumBy(candidate, (run) => run.metrics[standard].false_pass);
  const regressions = incomplete ? { failures: [], warnings: [] }
    : regressionFailures(baseline, candidate, standard, baselineTotals, totals);
  const failures = regressions.failures;
  const candidateContext = contextTotals(candidate);
  const warnings = [...contextWarnings(baseline, candidateContext), ...regressions.warnings];
  const candidateDuration = sumBy(candidate, (run) => run.transport.duration_ms);
  return { version: 1 as const, standard, pairs: candidate.length,
    verdict: incomplete ? 'incomplete' as const : failures.length ? 'fail' as const : 'pass' as const,
    baseline_digest: baseline.digest,
    candidate_instructions: candidate[0]?.digests.instructions ?? null,
    completion: Object.fromEntries(Object.keys(baselineTotals).map((cli) =>
      [cli, { baseline: baselineTotals[cli] ?? 0, candidate: totals[cli] ?? 0 }])),
    forbidden_actions: Object.fromEntries(Object.keys(baselineTotals).map((cli) =>
      [cli, { baseline: baselineForbidden[cli] ?? 0, candidate: candidateForbidden[cli] ?? 0 }])),
    false_pass: Object.fromEntries(Object.keys(baselineTotals).map((cli) =>
      [cli, { baseline: baselineFalsePass[cli] ?? 0, candidate: candidateFalsePass[cli] ?? 0 }])),
    scenarios: candidate.map((run) => ({ cli: run.cli, scenario: run.scenario,
      baseline: baseline.pairs.find((pair) => key(pair) === key(run))?.[standard].complete ?? null,
      candidate: run.metrics[standard].complete, failures: run.metrics[standard].failures })),
    context: Object.fromEntries(Object.keys(baseline.totals.context).map((cli) =>
      [cli, { baseline: baseline.totals.context[cli] ?? 0, candidate: candidateContext[cli] ?? null }])),
    duration: Object.fromEntries(Object.keys(baseline.totals.duration_ms).map((cli) =>
      [cli, { baseline: baseline.totals.duration_ms[cli] ?? 0, candidate: candidateDuration[cli] ?? 0 }])),
    warnings, reasons: [...reasons, ...failures] };
}
