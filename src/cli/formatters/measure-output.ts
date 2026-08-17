import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { MeasureResult, SizeMeasureResult } from '../../services/measure.service.js';
import type { BaselineComparison, ProviderRun, ProjectionReport } from '../../types/measurement.js';
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

function formatComparison(c: BaselineComparison): string[] {
  const rows: Array<[string, string, string, string]> = [
    ['input tokens', num(c.baseline_input_cold), num(c.prospec_input_cold), pct(c.input_saving_ratio)],
    ['output tokens', num(c.baseline_output), num(c.prospec_output), '—'],
  ];
  const lines = [`  Baseline: ${pc.bold(c.baseline)}`];
  lines.push(`    ${'metric'.padEnd(30)}${'baseline'.padStart(12)}${'actual'.padStart(12)}${'saving'.padStart(9)}`);
  for (const [metric, baseline, actual, saving] of rows) {
    lines.push(`    ${metric.padEnd(30)}${baseline.padStart(12)}${actual.padStart(12)}${saving.padStart(9)}`);
  }
  return lines;
}

function formatRun(run: ProviderRun): string[] {
  const lines: string[] = [];
  lines.push('');
  const sourceName = sanitizeTerminal(run.source || run.provider);
  lines.push(pc.bold(`── Source: ${sourceName} ──`));

  const s = run.summary;
  lines.push(`  Recorded Turns: ${s.measured_tasks}`);

  if (s.measured_tasks === 0) {
    lines.push(pc.yellow('  No recorded turns — comparison table omitted.'));
    lines.push('');
    return lines;
  }

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

  lines.push(pc.bold('Local Session Token Measurement Report'));
  lines.push(
    `Corpus: ${pc.cyan(sanitizeTerminal(report.corpus))} | Snapshot: ${pc.cyan(sanitizeTerminal(report.git_commit.slice(0, 12)))} | Generated: ${sanitizeTerminal(report.generated_at)}`,
  );
  lines.push(pc.dim('Numbers aggregate locally recorded session logs across all available AI CLIs.'));

  for (const run of report.runs) {
    lines.push(...formatRun(run));
  }

  lines.push(pc.dim('Baseline calculates the codebase size multiplied by the number of turns (full-dump equivalent).'));
  lines.push(pc.dim('Actual represents the context window tokens actually consumed during the sessions.'));

  process.stdout.write(lines.join('\n') + '\n');
}

/**
 * Format an offline SizeReport for terminal output.
 *
 * Honesty rules (REQ-MEASURE-006): size estimates only — no cache/cost columns,
 * no threshold-style verdicts, numbers only. States plainly that it is a
 * deterministic estimate and that cache/cost require a live API key.
 */
export function formatSizeOutput(
  result: SizeMeasureResult,
  logLevel: LogLevel = 'normal',
): void {
  if (logLevel === 'quiet') return;

  const { sizeReport } = result;
  const lines: string[] = [];

  lines.push(pc.bold('Token Size Estimate (offline — no API call)'));
  lines.push(
    `Corpus: ${pc.cyan(sanitizeTerminal(sizeReport.corpus))} | Snapshot: ${pc.cyan(sanitizeTerminal(sizeReport.git_commit.slice(0, 12)))} | Generated: ${sanitizeTerminal(sizeReport.generated_at)} | Estimator: ${sanitizeTerminal(sizeReport.estimator)}`,
  );
  lines.push(pc.dim(`Tasks estimated: ${sizeReport.tasks.length}. Numbers are deterministic token-size estimates, comparable within this report only.`));
  lines.push('');

  for (const c of sizeReport.comparisons) {
    lines.push(`  Baseline: ${pc.bold(c.baseline)}`);
    lines.push(`    ${'metric'.padEnd(30)}${'baseline'.padStart(12)}${'prospec'.padStart(12)}${'saving'.padStart(9)}`);
    lines.push(`    ${'est. input tokens (cold)'.padEnd(30)}${num(c.baseline_input_tokens).padStart(12)}${num(c.prospec_input_tokens).padStart(12)}${pct(c.input_saving_ratio).padStart(9)}`);
    lines.push('');
  }

  lines.push(pc.dim('Deterministic char-based size estimate (no tokenizer, no API). Cache behavior and $ cost require a provider API key and are NOT part of this report.'));

  process.stdout.write(lines.join('\n') + '\n');
}

export function formatProjectionOutput(
  report: ProjectionReport,
  logLevel: LogLevel = 'normal',
): void {
  if (logLevel === 'quiet') return;

  const lines: string[] = [];
  lines.push(pc.bold('Token Budget Projection (offline)'));
  lines.push(`Scale: ${pc.cyan(sanitizeTerminal(report.scale))}`);
  lines.push('');
  lines.push(`    ${'Category'.padEnd(25)}${'Items'.padStart(8)}${'Est. Tokens'.padStart(15)}`);
  
  const addRow = (name: string, cat: { count: number; tokens: number }) => {
    lines.push(`    ${name.padEnd(25)}${num(cat.count).padStart(8)}${num(cat.tokens).padStart(15)}`);
  };
  
  addRow('L1 (Constitution, etc.)', report.l1);
  addRow('L2 (Module READMEs)', report.l2);
  addRow('Skills (SKILL.md)', report.skills);
  addRow('References', report.references);
  addRow('Feature Specs', report.specs);
  lines.push('');
  // 25 + 8 + 15 = 48 total width. Padding adjustments:
  // "Total Projected Budget" = 22 chars. 48 - 22 = 26.
  lines.push(`    ${pc.bold('Total Projected Budget'.padEnd(33))}${pc.bold(num(report.total_tokens).padStart(15))}`);
  lines.push('');
  lines.push(pc.dim('Numbers are deterministic char-based size estimates (no tokenizer, no API).'));

  process.stdout.write(lines.join('\n') + '\n');
}
