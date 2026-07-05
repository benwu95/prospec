import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { atomicWrite } from '../src/lib/fs-utils.js';
import {
  cacheHitRate,
  effectiveInputCostUsd,
  outputCostUsd,
  savingRatio,
  TOKEN_ESTIMATOR_LABEL,
} from '../src/lib/token-accounting.js';
import {
  ASSEMBLY_STRATEGIES,
  DEFAULT_REPORT_FILENAME,
  DEFAULT_SIZE_REPORT_FILENAME,
  MEASUREMENT_BASELINES,
  MeasurementReportSchema,
  SizeReportSchema,
  type AssemblyMeasurement,
  type BaselineComparison,
  type MeasurementReport,
  type ProviderRun,
  type TaskMeasurement,
  type TokenUsage,
} from '../src/types/measurement.js';
import { ALL_ADAPTERS, type ProviderAdapter } from './measure/providers.js';
import {
  assembleAll,
  assembleFullDump,
  listRepoFiles,
  loadCorpus,
  readRepoContents,
  AssemblyError,
  type Corpus,
} from './measure/assemble.js';
import { buildSizeReport } from './measure/offline.js';

/**
 * Token measurement benchmark runner (mode A, offline).
 *
 * Usage:
 *   pnpm measure:tokens [--provider anthropic[,openai,google]]
 *                       [--budget 10] [--report measurement-report.json]
 *                       [--prospec-glossary]
 *   pnpm measure:tokens --offline [--report size-report.json] [--prospec-glossary]
 *
 * Sends each assembled context twice (cold + warm, same assembly) per
 * strategy and records real provider usage. No thresholds, no CI gating —
 * the output is an honest report for humans.
 *
 * `--offline` needs no API key: it estimates context size with the
 * deterministic char/4 heuristic and writes a SizeReport (no cache, no cost —
 * those require a live provider call).
 *
 * Everything that can fail without an API call (corpus, repo snapshot,
 * git commit) is resolved up front, before any money is spent.
 */

const DEFAULT_BUDGET_USD = 10; // per provider run
const CORPUS_DIR = 'tests/fixtures/token-corpus';
const USER_PROMPT =
  'Based on the project context above, outline how you would implement this task. Reply briefly.';

interface CliArgs {
  providers?: string[];
  budgetUsd: number;
  reportPath: string;
  /** OPT-D8 comparison: include _glossary.md in the prospec assembly. */
  prospecGlossary: boolean;
  reportPathExplicit: boolean;
  /** Keyless mode: estimate context size only, no provider call. */
  offline: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  // normalize --key=value into --key value so both forms work
  const tokens = argv.flatMap((arg) => {
    const match = /^(--[a-z-]+)=(.*)$/.exec(arg);
    return match ? [match[1]!, match[2]!] : [arg];
  });

  const args: CliArgs = {
    budgetUsd: DEFAULT_BUDGET_USD,
    reportPath: DEFAULT_REPORT_FILENAME,
    prospecGlossary: false,
    reportPathExplicit: false,
    offline: false,
  };
  for (let i = 0; i < tokens.length; i += 1) {
    const arg = tokens[i];
    // pnpm forwards a literal `--` separator into argv — tolerate both forms
    if (arg === '--') continue;
    if (arg === '--offline') {
      args.offline = true;
    } else if (arg === '--prospec-glossary') {
      args.prospecGlossary = true;
    } else if (arg === '--provider') {
      args.providers = [...new Set((tokens[++i] ?? '').split(',').filter(Boolean))];
    } else if (arg === '--budget') {
      const raw = tokens[++i];
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) {
        console.error(`Invalid --budget value: ${raw ?? '(missing)'} — expected a positive number (USD)`);
        process.exit(1);
      }
      args.budgetUsd = value;
    } else if (arg === '--report') {
      const value = tokens[++i];
      if (!value) {
        console.error('Invalid --report value: expected a file path');
        process.exit(1);
      }
      args.reportPath = value;
      args.reportPathExplicit = true;
    } else {
      console.error(`Unknown option: ${arg}. Valid: --provider, --budget, --report, --prospec-glossary, --offline`);
      process.exit(1);
    }
  }
  // Default report filename: offline writes a size report; a glossary run keeps
  // its own file so the main report is not overwritten (both suffixes compose).
  if (!args.reportPathExplicit) {
    const base = args.offline ? DEFAULT_SIZE_REPORT_FILENAME : DEFAULT_REPORT_FILENAME;
    args.reportPath = args.prospecGlossary ? base.replace(/\.json$/, '.glossary.json') : base;
  }
  return args;
}

function sumUsages(provider: TokenUsage['provider'], usages: TokenUsage[]): TokenUsage {
  return usages.reduce(
    (acc, u) => ({
      ...acc,
      input: acc.input + u.input,
      output: acc.output + u.output,
      cache_read: acc.cache_read + u.cache_read,
      cache_write: acc.cache_write + u.cache_write,
    }),
    { provider, input: 0, output: 0, cache_read: 0, cache_write: 0 },
  );
}

function totalPromptTokens(usage: TokenUsage): number {
  return usage.input + usage.cache_read + usage.cache_write;
}

function buildSummary(adapter: ProviderAdapter, tasks: TaskMeasurement[]): ProviderRun['summary'] {
  const okTasks = tasks.filter((t) => t.status === 'ok');
  const byStrategy = (strategy: AssemblyMeasurement['strategy']) =>
    okTasks.flatMap((t) => t.assemblies.filter((a) => a.strategy === strategy));

  const prospecCold = sumUsages(adapter.provider, byStrategy('prospec').map((a) => a.cold));
  const prospecWarm = sumUsages(adapter.provider, byStrategy('prospec').map((a) => a.warm));

  const comparisons: BaselineComparison[] = MEASUREMENT_BASELINES.map((baseline) => {
    const baselineCold = sumUsages(adapter.provider, byStrategy(baseline).map((a) => a.cold));
    // warm-vs-warm: both sides were measured with caching enabled; comparing
    // baseline cold against prospec warm would inflate the saving ratio
    const baselineWarm = sumUsages(adapter.provider, byStrategy(baseline).map((a) => a.warm));
    const baselineCost = effectiveInputCostUsd(baselineWarm, adapter.pricing);
    const prospecWarmCost = effectiveInputCostUsd(prospecWarm, adapter.pricing);
    return {
      baseline,
      baseline_input_cold: totalPromptTokens(baselineCold),
      prospec_input_cold: totalPromptTokens(prospecCold),
      input_saving_ratio: savingRatio(totalPromptTokens(baselineCold), totalPromptTokens(prospecCold)),
      baseline_output: baselineCold.output,
      prospec_output: prospecCold.output,
      baseline_effective_cost_usd: baselineCost,
      prospec_effective_cost_usd: prospecWarmCost,
      effective_cost_saving_ratio: savingRatio(baselineCost, prospecWarmCost),
    };
  });

  return {
    measured_tasks: okTasks.length,
    skipped_tasks: tasks.filter((t) => t.status === 'skipped').length,
    failed_tasks: tasks.filter((t) => t.status === 'failed').length,
    prospec_cache_hit_rate: okTasks.length > 0 ? cacheHitRate(prospecWarm) : 0,
    comparisons,
  };
}

interface RunInputs {
  corpus: Corpus;
  contents: Map<string, string>;
  fullDump: string;
  prospecGlossary: boolean;
}

async function runProvider(
  adapter: ProviderAdapter,
  inputs: RunInputs,
  budgetUsd: number,
): Promise<ProviderRun> {
  const model = adapter.defaultModel;
  const tasks: TaskMeasurement[] = [];
  let spentUsd = 0;
  let aborted = false;
  let abortedReason: string | undefined;

  const budgetExhausted = (): boolean => spentUsd >= budgetUsd;

  for (const task of inputs.corpus.tasks) {
    if (budgetExhausted()) {
      aborted = true;
      abortedReason = `Budget of US$${budgetUsd} exhausted after US$${spentUsd.toFixed(2)}`;
      break;
    }

    let contexts: Record<AssemblyMeasurement['strategy'], string>;
    try {
      contexts = assembleAll(inputs.contents, task, inputs.fullDump, {
        includeGlossary: inputs.prospecGlossary,
      });
    } catch (err) {
      const reason = err instanceof AssemblyError ? err.message : String(err);
      tasks.push({ task_id: task.id, status: 'skipped', reason, assemblies: [] });
      continue;
    }

    try {
      const assemblies: AssemblyMeasurement[] = [];
      for (const strategy of ASSEMBLY_STRATEGIES) {
        // re-check inside the task: one task issues 6 calls (2 carrying the
        // full repo dump) — without this, a tight budget overshoots unbounded
        if (budgetExhausted()) {
          aborted = true;
          abortedReason = `Budget of US$${budgetUsd} exhausted mid-task at ${task.id} (US$${spentUsd.toFixed(2)})`;
          break;
        }
        // cold + warm reuse the exact same assembled context; spend is booked
        // per call so a throwing warm still counts the billed cold call
        const context = contexts[strategy];
        const cold = await adapter.send(context, USER_PROMPT, model);
        spentUsd += effectiveInputCostUsd(cold, adapter.pricing) + outputCostUsd(cold, adapter.pricing);
        const warm = await adapter.send(context, USER_PROMPT, model);
        spentUsd += effectiveInputCostUsd(warm, adapter.pricing) + outputCostUsd(warm, adapter.pricing);
        assemblies.push({ strategy, cold, warm });
      }
      if (aborted) {
        tasks.push({
          task_id: task.id,
          status: 'skipped',
          reason: 'budget exhausted mid-task; partial strategy data discarded',
          assemblies: [],
        });
        break;
      }
      tasks.push({ task_id: task.id, status: 'ok', assemblies });
      console.log(`  [${adapter.provider}] ${task.id} ok (spent US$${spentUsd.toFixed(2)})`);
    } catch (err) {
      tasks.push({
        task_id: task.id,
        status: 'failed',
        reason: err instanceof Error ? err.message : String(err),
        assemblies: [],
      });
      console.warn(`  [${adapter.provider}] ${task.id} failed: ${String(err).slice(0, 120)}`);
    }
  }

  return {
    provider: adapter.provider,
    model,
    pricing: adapter.pricing,
    aborted,
    ...(abortedReason ? { aborted_reason: abortedReason } : {}),
    spent_usd: spentUsd,
    tasks,
    summary: buildSummary(adapter, tasks),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();

  // Offline: estimate context size with no provider call (no API key needed).
  if (args.offline) {
    const gitCommit = execSync('git rev-parse HEAD', { cwd }).toString().trim();
    const corpus = loadCorpus(path.join(cwd, CORPUS_DIR));
    const files = await listRepoFiles(cwd);
    const contents = readRepoContents(cwd, files);
    const fullDump = assembleFullDump(contents);
    const { report, skipped } = buildSizeReport(
      { corpus, contents, fullDump, includeGlossary: args.prospecGlossary },
      { git_commit: gitCommit, generated_at: new Date().toISOString() },
    );
    const validated = SizeReportSchema.parse(report);
    await atomicWrite(path.join(cwd, args.reportPath), JSON.stringify(validated, null, 2) + '\n');
    for (const s of skipped) console.warn(`  Skipped ${s.task_id}: ${s.reason}`);
    console.log(
      `\nOffline size estimate written to ${args.reportPath} (estimator: ${TOKEN_ESTIMATOR_LABEL}).\n` +
        'Deterministic char-based size estimate — no API call. Cache behavior and $ cost require a provider API key and are NOT part of this report.\n' +
        'View with: prospec measure --offline',
    );
    return;
  }

  const explicit = args.providers !== undefined;

  if (explicit) {
    const valid = new Set<string>(ALL_ADAPTERS.map((a) => a.provider));
    const unknown = args.providers!.filter((p) => !valid.has(p));
    if (unknown.length > 0) {
      console.error(`Unknown provider(s): ${unknown.join(', ')}. Valid: ${[...valid].join(', ')}`);
      process.exit(1);
    }
  }
  const requested = explicit
    ? ALL_ADAPTERS.filter((a) => args.providers!.includes(a.provider))
    : [...ALL_ADAPTERS];

  const available = requested.filter((a) => a.apiKey() !== undefined);
  for (const adapter of requested.filter((a) => a.apiKey() === undefined)) {
    console.warn(`Skipping ${adapter.provider}: no API key (set ${adapter.envKeys.join(' or ')})`);
  }
  if (available.length === 0) {
    console.error(
      'No provider has an API key set. Nothing measured; no report written. ' +
        'Run with --offline for a keyless size estimate.',
    );
    process.exit(1);
  }

  // resolve everything fallible BEFORE spending money on API calls
  const gitCommit = execSync('git rev-parse HEAD', { cwd }).toString().trim();
  const corpus = loadCorpus(path.join(cwd, CORPUS_DIR));
  const files = await listRepoFiles(cwd);
  const contents = readRepoContents(cwd, files);
  const fullDump = assembleFullDump(contents);
  const inputs: RunInputs = { corpus, contents, fullDump, prospecGlossary: args.prospecGlossary };

  const runs: ProviderRun[] = [];
  for (const adapter of available) {
    console.log(`Measuring with ${adapter.provider} (${adapter.defaultModel})...`);
    runs.push(await runProvider(adapter, inputs, args.budgetUsd));
  }

  const report: MeasurementReport = MeasurementReportSchema.parse({
    corpus: corpus.id,
    git_commit: gitCommit,
    generated_at: new Date().toISOString(),
    runs,
  });

  await atomicWrite(path.join(cwd, args.reportPath), JSON.stringify(report, null, 2) + '\n');
  console.log(`\nReport written to ${args.reportPath}. View with: prospec measure`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
