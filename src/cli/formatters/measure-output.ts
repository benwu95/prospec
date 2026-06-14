import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { MeasureResult } from '../../services/measure.service.js';
import type { BaselineComparison, ProviderRun } from '../../types/measurement.js';
import { AGENT_PROVIDER_MAP } from '../../types/measurement.js';
import { sanitizeTerminal } from './sanitize.js';

/**
 * Format the MeasureResult for terminal output.
 *
 * Honesty rules (REQ-MEASURE-005/006):
 * - per-provider sections; numbers are comparable only within one provider
 * - input and output listed separately; warm numbers carry an asterisk
 * - both baselines always shown; no threshold-style verdicts, numbers only
 */

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function num(n: number): string {
  return n.toLocaleString('en-US');
}

function usd(n: number): string {
  return `$${n.toFixed(4)}`;
}

function agentsFor(provider: ProviderRun['provider']): string {
  return Object.entries(AGENT_PROVIDER_MAP)
    .filter(([, p]) => p === provider)
    .map(([agent]) => agent)
    .join(', ');
}

function formatComparison(c: BaselineComparison): string[] {
  const rows: Array<[string, string, string, string]> = [
    ['input tokens (cold)', num(c.baseline_input_cold), num(c.prospec_input_cold), pct(c.input_saving_ratio)],
    ['output tokens', num(c.baseline_output), num(c.prospec_output), '—'],
    ['effective input cost (warm*)', usd(c.baseline_effective_cost_usd), usd(c.prospec_effective_cost_usd), pct(c.effective_cost_saving_ratio)],
  ];
  const lines = [`  Baseline: ${pc.bold(c.baseline)}`];
  lines.push(`    ${'metric'.padEnd(30)}${'baseline'.padStart(12)}${'prospec'.padStart(12)}${'saving'.padStart(9)}`);
  for (const [metric, baseline, prospec, saving] of rows) {
    lines.push(`    ${metric.padEnd(30)}${baseline.padStart(12)}${prospec.padStart(12)}${saving.padStart(9)}`);
  }
  return lines;
}

function formatRun(run: ProviderRun): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(pc.bold(`── ${run.provider} (${sanitizeTerminal(run.model)}) — agents: ${agentsFor(run.provider)} ──`));

  const s = run.summary;
  const taskStats = `${s.measured_tasks} measured, ${s.skipped_tasks} skipped, ${s.failed_tasks} failed`;
  const abortedReason = sanitizeTerminal(run.aborted_reason ?? 'budget exhausted');
  lines.push(`  Tasks: ${taskStats}${run.aborted ? ` ${pc.yellow(`[aborted: ${abortedReason}]`)}` : ''}`);

  if (s.measured_tasks === 0) {
    // all-zero comparisons would read as "0% saving" — say what happened instead
    lines.push(pc.yellow('  No measured tasks — comparison table omitted. See per-task reasons in the report file.'));
    lines.push('');
    return lines;
  }

  lines.push(`  Spent: ${usd(run.spent_usd)} | Cache hit rate (prospec, warm*): ${pct(s.prospec_cache_hit_rate)}`);
  lines.push('');
  for (const comparison of s.comparisons) {
    lines.push(...formatComparison(comparison));
    lines.push('');
  }
  return lines;
}

export function formatMeasureOutput(
  result: MeasureResult,
  logLevel: LogLevel = 'normal',
): void {
  if (logLevel === 'quiet') return;

  const { report } = result;
  const lines: string[] = [];

  lines.push(pc.bold('Token Measurement Report'));
  lines.push(
    `Corpus: ${pc.cyan(sanitizeTerminal(report.corpus))} | Snapshot: ${pc.cyan(sanitizeTerminal(report.git_commit.slice(0, 12)))} | Generated: ${sanitizeTerminal(report.generated_at)}`,
  );
  lines.push(pc.dim('Numbers are comparable only within the same provider — never across providers or snapshots.'));

  for (const run of report.runs) {
    lines.push(...formatRun(run));
  }

  lines.push(pc.dim('* warm = synthetic cache hit (two back-to-back calls); production hit rates depend on the cache TTL.'));
  lines.push(pc.dim('G4 wording: input-token cost vs the full-dump baseline. Output tokens are unaffected and listed honestly.'));
  lines.push(pc.dim('copilot/codex are measured via their model provider (OpenAI), not the agent harness itself.'));

  process.stdout.write(lines.join('\n') + '\n');
}
