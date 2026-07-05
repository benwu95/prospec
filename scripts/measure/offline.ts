import {
  estimateTokens,
  savingRatio,
  TOKEN_ESTIMATOR_LABEL,
} from '../../src/lib/token-accounting.js';
import {
  ASSEMBLY_STRATEGIES,
  MEASUREMENT_BASELINES,
  type AssemblyStrategy,
  type SizeBaselineComparison,
  type SizeReport,
  type SizeTaskEstimate,
} from '../../src/types/measurement.js';
import { assembleAll, AssemblyError, type Corpus } from './assemble.js';

/**
 * Offline size estimation — the keyless half of the measurement harness. It
 * reuses the same API-free context assembly as the online runner but replaces
 * the provider call with the deterministic char/4 estimate: no key, no cache,
 * no cost. Pure (no fs, no network) so it is directly unit-testable.
 */

export interface OfflineSizeInputs {
  corpus: Corpus;
  contents: Map<string, string>;
  fullDump: string;
  includeGlossary?: boolean;
}

export interface OfflineSizeMeta {
  git_commit: string;
  generated_at: string;
}

export interface OfflineSizeResult {
  report: SizeReport;
  /** Tasks whose live refs could not be assembled — skipped, mirroring the online runner. */
  skipped: Array<{ task_id: string; reason: string }>;
}

/**
 * Assemble each corpus task's three strategies and estimate the cold input size.
 * A task whose refs are missing is skipped (not fatal); at least one task must
 * assemble or the report cannot be built.
 */
export function buildSizeReport(
  inputs: OfflineSizeInputs,
  meta: OfflineSizeMeta,
): OfflineSizeResult {
  const tasks: SizeTaskEstimate[] = [];
  const skipped: Array<{ task_id: string; reason: string }> = [];
  const totals: Record<AssemblyStrategy, number> = {
    'full-dump': 0,
    'naive-rag': 0,
    prospec: 0,
  };

  for (const task of inputs.corpus.tasks) {
    let contexts: Record<AssemblyStrategy, string>;
    try {
      contexts = assembleAll(inputs.contents, task, inputs.fullDump, {
        includeGlossary: inputs.includeGlossary ?? false,
      });
    } catch (err) {
      skipped.push({
        task_id: task.id,
        reason: err instanceof AssemblyError ? err.message : String(err),
      });
      continue;
    }
    const estimates = ASSEMBLY_STRATEGIES.map((strategy) => {
      const cold_input_tokens = estimateTokens(contexts[strategy]);
      totals[strategy] += cold_input_tokens;
      return { strategy, cold_input_tokens };
    });
    tasks.push({ task_id: task.id, estimates });
  }

  if (tasks.length === 0) {
    throw new AssemblyError('offline size report: no corpus task could be assembled');
  }

  const comparisons: SizeBaselineComparison[] = MEASUREMENT_BASELINES.map((baseline) => ({
    baseline,
    baseline_input_tokens: totals[baseline],
    prospec_input_tokens: totals.prospec,
    input_saving_ratio: savingRatio(totals[baseline], totals.prospec),
  }));

  return {
    report: {
      corpus: inputs.corpus.id,
      git_commit: meta.git_commit,
      generated_at: meta.generated_at,
      estimator: TOKEN_ESTIMATOR_LABEL,
      tasks,
      comparisons,
    },
    skipped,
  };
}
