import { readFile, readdir, lstat } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { atomicWrite } from '../src/lib/fs-utils.js';
import { SDD_STATIONS } from '../src/types/status.js';
import { EvaluationConfigSchema, FixturePathSchema, ObservedRunSchema, OracleSchema, ScenarioSchema, SCENARIO_IDS, type EvaluationConfig } from './workflow-eval/protocol.js';
import { digest, mandatoryLedger, type AssessedRun } from './workflow-eval/context.js';
import { Budget, CommandExecutor, RequestQuota } from './workflow-eval/executor.js';
import { runScenario } from './workflow-eval/runner.js';
import { captureNativeScenario } from './workflow-eval/native-runner.js';
import { adjudicateNativeCapture } from './workflow-eval/native-adjudication.js';
import { compareNativeBatches, freezeNativeBaseline } from './workflow-eval/native-comparison.js';
import { scoreRun } from './workflow-eval/scorer.js';
import { buildEvaluationReport, ComparisonPolicySchema, contentManifest, redactSecrets, writeEvaluationReport } from './workflow-eval/report.js';

const repository = fileURLToPath(new URL('../', import.meta.url));
const corpusRoot = join(repository, 'tests/fixtures/workflow-eval');
const strings = z.record(FixturePathSchema, z.string());
const SnapshotSchema = z.strictObject({ version: z.literal(1), instructions: strings });
const PolicySchema = z.strictObject({ audit: z.string().min(1), roots: z.array(z.strictObject({ station: z.enum(SDD_STATIONS), paths: z.array(FixturePathSchema).min(1) })).min(1),
  dependencies: z.record(FixturePathSchema, z.array(FixturePathSchema)) });
const PoliciesSchema = z.record(z.enum(SCENARIO_IDS), PolicySchema);
const ManifestSchema = z.strictObject({ digest: z.string().min(1), entries: z.array(z.strictObject({ path: z.string(), digest: z.string(), bytes: z.number().int().nonnegative() })) });
const BatchSchema = z.strictObject({ version: z.literal(1), variant: z.enum(['baseline', 'candidate']),
  redacted: z.boolean(),
  comparison_policy_digest: z.string().nullable(),
  snapshot: SnapshotSchema, policies: PoliciesSchema, runs: z.array(ObservedRunSchema),
  manifests: z.strictObject({ instructions: ManifestSchema, runner: ManifestSchema, corpus: ManifestSchema, oracle: ManifestSchema }),
  config_digest: z.string().min(1), runtime_revision: z.string().min(1), committed_usd: z.number().finite().nonnegative().nullable(),
  requests_consumed: z.number().int().nonnegative().optional() });
type Batch = z.infer<typeof BatchSchema>;
const json = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'));

export async function loadCorpus(root: string) {
  const publicFiles: Record<string, string> = {};
  const privateFiles: Record<string, string> = {};
  const scenarios = [];
  const oracles = [];
  for (const section of ['public', 'private']) {
    const names = (await readdir(join(root, section))).sort();
    if (JSON.stringify(names) !== JSON.stringify(SCENARIO_IDS.map((id) => `${id}.json`).sort())) throw new Error('Corpus must contain exactly eight versioned pairs');
  }
  for (const id of SCENARIO_IDS) {
    const input = await readFile(join(root, 'public', `${id}.json`), 'utf8');
    const expected = await readFile(join(root, 'private', `${id}.json`), 'utf8');
    const scenario = ScenarioSchema.parse(JSON.parse(input));
    const oracle = OracleSchema.parse(JSON.parse(expected));
    if (scenario.id !== id || scenario.setup !== id || oracle.id !== id) throw new Error('Corpus identity mismatch');
    scenarios.push(scenario); oracles.push(oracle);
    publicFiles[`${id}.json`] = input; privateFiles[`${id}.json`] = expected;
  }
  return { scenarios, oracles, corpus: contentManifest(publicFiles), oracle: contentManifest(privateFiles) };
}

async function captureTree(root: string, prefix: string, suffix: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Snapshot symlinks are not supported');
    if (!entry.isFile() || !entry.name.endsWith(suffix)) continue;
    const path = join(entry.parentPath, entry.name);
    files[`${prefix}/${relative(root, path).replaceAll('\\', '/')}`] = await readFile(path, 'utf8');
  }
  return files;
}

function assess(batch: Batch, corpus: Awaited<ReturnType<typeof loadCorpus>>): AssessedRun[] {
  if (batch.redacted) throw new Error('Redacted batch cannot certify exact evidence identity');
  if (batch.manifests.instructions.digest !== contentManifest(batch.snapshot.instructions).digest ||
      batch.manifests.corpus.digest !== corpus.corpus.digest || batch.manifests.oracle.digest !== corpus.oracle.digest) throw new Error('Batch content identity mismatch');
  return batch.runs.map((run) => ({ run, verdict: scoreRun(run, corpus.oracles.find((o) => o.id === run.identity.scenario)!),
    mandatory: mandatoryLedger({ ...corpus.scenarios.find((s) => s.id === run.identity.scenario)!.files, ...batch.snapshot.instructions, ...run.files }, batch.policies[run.identity.scenario]) }));
}

const parseCliArguments = (args: string[]) => parseArgs({ args, allowPositionals: true, options: {
  live: { type: 'boolean' }, config: { type: 'string' }, out: { type: 'string' }, snapshot: { type: 'string' },
  executor: { type: 'string' }, scenario: { type: 'string' }, ledger: { type: 'string' },
  'scoped-permissions': { type: 'boolean' },
  'docker-config': { type: 'string' }, capture: { type: 'string' }, standard: { type: 'string' },
  instructions: { type: 'string' }, mandatory: { type: 'string' }, runtime: { type: 'string' },
  'freeze-runtime': { type: 'string' }, variant: { type: 'string' }, baseline: { type: 'string' }, candidate: { type: 'string' }, policy: { type: 'string' },
} });

/** Modes below read saved evidence or drive one capture; each owns its own exit code. */
type CliValues = ReturnType<typeof parseCliArguments>['values'];
type ModeContext = { v: CliValues; required: (name: keyof CliValues) => string;
  corpus: Awaited<ReturnType<typeof loadCorpus>>; log: (text: string) => void };

async function runNativeCapture({ v, required, corpus, log }: ModeContext): Promise<number> {
  const scenario = corpus.scenarios.find((s) => s.id === required('scenario'));
  if (!scenario) throw new Error('Unknown scenario');
  const result = await captureNativeScenario({ config: await json(required('config')), executor: required('executor'), scenario,
    instructions: await json(required('instructions')), runtime: required('runtime'), output: required('out'), ledger: required('ledger'), scopedPermissions: v['scoped-permissions'],
    ...(v['docker-config'] ? { docker: await json(v['docker-config']) } : {}) });
  log(`Native capture saved: ${result.output}; launches consumed: ${result.requests_consumed}. Workflow UNASSESSED; retained fixture: ${result.cwd}`);
  return 1; // Capture is evidence for adjudication, never automated PASS.
}

/** Adjudicate the capture stored in one directory: the one derivation both modes trust. */
async function adjudicateCaptureAt(directory: string, corpus: Awaited<ReturnType<typeof loadCorpus>>) {
  const part = (name: string) => json(join(directory, name));
  const identity = await part('identity.json');
  const { scenario } = z.object({ scenario: z.object({ id: z.enum(SCENARIO_IDS) }) }).parse(identity);
  const oracle = corpus.oracles.find((o) => o.id === scenario.id)!;
  return adjudicateNativeCapture({ identity, ...Object.fromEntries(await Promise.all(
    ['before', 'after', 'transport'].map(async (name) => [name, await part(`${name}.json`)]))) }, oracle);
}

async function runAdjudication({ v, required, corpus, log }: ModeContext): Promise<number> {
  // Reads saved evidence only: no model call, no quota, no capture mutation.
  const directory = required('capture');
  const adjudication = await adjudicateCaptureAt(directory, corpus);
  await atomicWrite(v.out ?? join(directory, 'adjudication.json'), JSON.stringify(adjudication, null, 2) + '\n');
  const summary = (standard: 'strict' | 'graded') => `${standard} ${adjudication.metrics[standard].complete ? 'complete' : `incomplete (${adjudication.metrics[standard].failures.join(', ')})`}`;
  log(`Adjudicated ${adjudication.scenario} (${adjudication.cli}): ${summary('strict')}; ${summary('graded')}. One capture, not a certified comparison.`);
  return 0;
}

async function runFrozenComparison(mode: string, { v, required, corpus, log }: ModeContext): Promise<number> {
  // Both read adjudicated evidence only; neither calls a model or rewrites a capture.
  // Each recorded adjudication is RE-DERIVED from the capture beside it: a metric that
  // no longer follows from its own evidence is refused. Without this the candidate side
  // is self-asserted, while the frozen baseline is bound to its pairs by digest.
  const batch = async (directory: string) => Promise.all((await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))
    .map(async (entry) => {
      const base = join(directory, entry.name);
      const stored = await json(join(base, 'adjudication.json'));
      if (JSON.stringify(stored) !== JSON.stringify(await adjudicateCaptureAt(base, corpus))) {
        throw new Error(`Recorded adjudication does not follow from its capture: ${base}`);
      }
      return stored;
    }));
  if (mode === 'freeze') {
    const snapshot = SnapshotSchema.parse(await json(required('instructions')));
    const runner = contentManifest(await runnerTree(repository));
    const policy = freezeNativeBaseline(await batch(required('capture')), {
      instructions: contentManifest(snapshot.instructions).digest, corpus: corpus.corpus.digest,
      oracle: corpus.oracle.digest, runner: runner.digest });
    await atomicWrite(required('out'), JSON.stringify(policy, null, 2) + '\n');
    log(`Baseline frozen: ${policy.pairs.length} pairs, digest ${policy.digest.slice(0, 12)}; completion strict ${JSON.stringify(policy.totals.strict)}, graded ${JSON.stringify(policy.totals.graded)}.`);
    return 0;
  }
  const report = compareNativeBatches(await json(required('baseline')), await batch(required('candidate')), v.standard ?? 'graded',
  { corpus: corpus.corpus.digest, oracle: corpus.oracle.digest, runner: contentManifest(await runnerTree(repository)).digest });
  await atomicWrite(required('out'), JSON.stringify(report, null, 2) + '\n');
  log(`Paired comparison (${report.standard}): ${report.verdict.toUpperCase()}${report.reasons.length ? ` — ${report.reasons.join('; ')}` : ''}`);
  return report.verdict === 'pass' ? 0 : 1;
}

/** No external calls in offline/compare. Only the live branch constructs configured executors. */
export async function main(args = process.argv.slice(2), log: (text: string) => void = console.log, evaluate: typeof runScenario = runScenario): Promise<number> {
  const parsed = parseCliArguments(args);
  const [mode] = parsed.positionals;
  if (parsed.positionals.length !== 1 || !['offline', 'live', 'native', 'adjudicate', 'freeze', 'compare-native', 'compare'].includes(mode!)) throw new Error('Mode must be offline, live, native, adjudicate, freeze, compare-native or compare');
  const v = parsed.values;
  const required = (name: keyof typeof v): string => {
    const value = v[name];
    if (typeof value !== 'string' || !value) throw new Error(`--${name} is required`);
    return value;
  };
  if ((mode === 'live' || mode === 'native') && v.live !== true) throw new Error('Explicit --live opt-in is required before any paid call');
  const corpus = await loadCorpus(corpusRoot);
  const context: ModeContext = { v, required, corpus, log };
  if (mode === 'native') return runNativeCapture(context);
  if (mode === 'adjudicate') return runAdjudication(context);
  if (mode === 'freeze' || mode === 'compare-native') return runFrozenComparison(mode!, context);
  if (mode === 'offline') {
    if (v.snapshot) {
      const instructions = await captureTree(join(repository, '.agents/skills'), '.agents/skills', '.md');
      await atomicWrite(v.snapshot, JSON.stringify({ version: 1, instructions }, null, 2) + '\n');
    }
    if (v['freeze-runtime']) await atomicWrite(v['freeze-runtime'], await readFile(required('runtime'), 'utf8'));
    if (v.baseline || v.policy) {
      const baseline = BatchSchema.parse(await json(required('baseline')));
      const policy = { frozen_at: new Date().toISOString(), baseline_digest: digest(JSON.stringify(assess(baseline, corpus))), max_duration_ratio: null };
      await atomicWrite(required('policy'), JSON.stringify(policy, null, 2) + '\n');
    }
    log('8 versioned scenarios validated offline; no model calls.');
    return 0;
  }
  const config = EvaluationConfigSchema.parse(await json(required('config')));
  if (mode === 'compare') return runMediatedComparison(config, context);
  return runMediatedEvaluation(config, context, evaluate);
}

/** Report-only comparison of two recorded mediated batches; no model call. */
async function runMediatedComparison(config: EvaluationConfig, { required, corpus, log }: ModeContext): Promise<number> {
  const baseline = BatchSchema.parse(await json(required('baseline')));
  const candidate = BatchSchema.parse(await json(required('candidate')));
  const policy = ComparisonPolicySchema.parse(await json(required('policy')));
  if (baseline.config_digest !== digest(JSON.stringify(config)) || candidate.config_digest !== baseline.config_digest) throw new Error('Configuration changed between batches');
  if (candidate.comparison_policy_digest !== digest(JSON.stringify(policy))) throw new Error('Comparison policy changed after candidate execution');
  const report = buildEvaluationReport({ config, baseline: assess(baseline, corpus), candidate: assess(candidate, corpus),
    manifests: { baseline: baseline.manifests.instructions, candidate: candidate.manifests.instructions,
      runner: baseline.manifests.runner, corpus: corpus.corpus, oracle: corpus.oracle },
    policy });
  await writeEvaluationReport(required('out'), report, config.executors.flatMap((e) => e.env_keys.map((key) => process.env[key] ?? '')));
  log(report.comparison.pass ? 'PASS' : 'INCOMPLETE / FAIL');
  return report.comparison.pass ? 0 : 1;
}

/**
 * Everything that must hold BEFORE a paid call: a frozen runtime bundle, both
 * executor tiers, available credentials and adapters, and a provable mandatory
 * context for every scenario. Refusing here costs nothing; refusing later does.
 */
async function preflightLiveRun(config: EvaluationConfig, corpus: Awaited<ReturnType<typeof loadCorpus>>,
  snapshot: z.infer<typeof SnapshotSchema>, policies: z.infer<typeof PoliciesSchema>, runtimePath: string) {
  const runtime = resolve(runtimePath);
  if (!(await lstat(runtime)).isFile() || !runtime.endsWith('.mjs')) throw new Error('Live runtime must be a frozen standalone .mjs bundle');
  if (!config.executors.some((e) => e.tier === 'stronger') || !config.executors.some((e) => e.tier === 'cheaper')) throw new Error('Both executor tiers are required');
  for (const executor of config.executors) {
    if (executor.env_keys.some((key) => !process.env[key])) throw new Error('Configured credentials are unavailable');
    if (!(await lstat(executor.command)).isFile()) throw new Error('Configured adapter executable is unavailable');
  }
  for (const scenario of corpus.scenarios) {
    if (!mandatoryLedger({ ...scenario.files, ...snapshot.instructions }, policies[scenario.id]).available) throw new Error(`Mandatory context is unprovable: ${scenario.id}`);
  }
  return { runtime, runtimeRevision: `bundle-sha256:${digest(await readFile(runtime, 'utf8'))}` };
}

/** The only branch that constructs configured executors and spends budget. */
async function runMediatedEvaluation(config: EvaluationConfig, { required, corpus, log }: ModeContext,
  evaluate: typeof runScenario): Promise<number> {
  const variant = z.enum(['baseline', 'candidate']).parse(required('variant'));
  const snapshot = SnapshotSchema.parse(await json(required('instructions')));
  const policies = PoliciesSchema.parse(await json(required('mandatory')));
  const { runtime, runtimeRevision } = await preflightLiveRun(config, corpus, snapshot, policies, required('runtime'));
  const runnerFiles = await runnerTree(repository);
  const batch: Batch = { version: 1, variant, redacted: false, comparison_policy_digest: null, snapshot, policies, runs: [], config_digest: digest(JSON.stringify(config)),
    runtime_revision: runtimeRevision, committed_usd: config.execution_mode === 'subscription' ? null : 0,
    manifests: { instructions: contentManifest(snapshot.instructions), runner: contentManifest(runnerFiles), corpus: corpus.corpus, oracle: corpus.oracle } };
  let prior = 0;
  let priorRequests = 0;
  if (variant === 'candidate') {
    const baseline = BatchSchema.parse(await json(required('baseline')));
    const policy = ComparisonPolicySchema.parse(await json(required('policy')));
    batch.comparison_policy_digest = digest(JSON.stringify(policy));
    if (baseline.variant !== 'baseline' || baseline.runs.length !== config.executors.length * SCENARIO_IDS.length || baseline.runs.some((r) => r.source !== 'live') ||
        baseline.config_digest !== batch.config_digest || baseline.runtime_revision !== runtimeRevision ||
        baseline.manifests.runner.digest !== batch.manifests.runner.digest || policy.baseline_digest !== digest(JSON.stringify(assess(baseline, corpus)))) throw new Error('Complete compatible baseline and pre-frozen policy are required');
    if (config.execution_mode === 'subscription') {
      if (baseline.committed_usd !== null || baseline.requests_consumed === undefined) throw new Error('Baseline subscription accounting unavailable');
      priorRequests = baseline.requests_consumed;
    } else {
      if (baseline.committed_usd === null) throw new Error('Baseline API accounting unavailable');
      prior = baseline.committed_usd;
    }
  }
  const budget = config.execution_mode === 'subscription' ? new RequestQuota(config.max_requests, priorRequests) : new Budget(config.budget_usd, prior);
  const secrets = config.executors.flatMap((e) => e.env_keys.map((key) => process.env[key] ?? '')).filter(Boolean);
  const output = required('out');
  evaluation: for (const executor of config.executors) for (const scenario of corpus.scenarios) {
    if (budget instanceof RequestQuota && budget.requestsConsumed >= config.max_requests!) {
      log('Request limit exhausted; remaining scenarios are incomplete. No automatic retry.');
      return 1;
    }
    if (`bundle-sha256:${digest(await readFile(runtime, 'utf8'))}` !== runtimeRevision) throw new Error('Frozen runtime changed during evaluation');
    const identity = { scenario: scenario.id, executor: executor.id, tier: executor.tier, model: executor.model, variant,
      instruction_digest: batch.manifests.instructions.digest, runtime_revision: runtimeRevision,
      runner_digest: batch.manifests.runner.digest, corpus_digest: corpus.corpus.digest, oracle_digest: corpus.oracle.digest,
      settings_digest: digest(JSON.stringify({ executor, config_digest: batch.config_digest })) };
    batch.runs.push(await evaluate({ scenario, identity, source: 'live', instructions: snapshot.instructions, limits: config, runtimeCli: runtime,
      executor: new CommandExecutor(executor, config, budget), delegateExecutor: new CommandExecutor(executor, config, budget) }));
    batch.committed_usd = budget.committedUsd;
    if (budget instanceof RequestQuota) batch.requests_consumed = budget.requestsConsumed;
    const redacted = redactSecrets(batch, secrets);
    const safe = BatchSchema.parse(redacted);
    safe.redacted = JSON.stringify(redacted) !== JSON.stringify(batch);
    await atomicWrite(output, JSON.stringify(safe, null, 2) + '\n');
    log(redactSecrets(`${variant} ${executor.id}/${scenario.id}: ${batch.runs.at(-1)!.stop_reason}`, secrets) as string);
    if (batch.runs.at(-1)!.stop_reason === 'budget') break evaluation;
  }
  return batch.runs.length === config.executors.length * SCENARIO_IDS.length ? 0 : 1;
}


/** The runner's content identity: every evaluator module AND this entry script. */
async function runnerTree(repository: string): Promise<Record<string, string>> {
  const files = await captureTree(join(repository, 'scripts/workflow-eval'), 'scripts/workflow-eval', '.ts');
  files['scripts/evaluate-workflow.ts'] = await readFile(fileURLToPath(import.meta.url), 'utf8');
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((code) => { process.exitCode = code; }).catch(() => {
    console.error('Workflow evaluation refused or failed. Check configuration, input identities, required flags and the preserved batch; no automatic retry.');
    process.exitCode = 1;
  });
}
