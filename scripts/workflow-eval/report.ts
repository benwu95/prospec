import { z } from 'zod';
import { atomicWrite } from '../../src/lib/fs-utils.js';
import { renderMarkdownTable } from '../../src/lib/markdown-table.js';
import { EvaluationConfigSchema, type EvaluationConfig } from './protocol.js';
import { comparePairedRuns, digest, observedContext, type AssessedRun } from './context.js';

export function contentManifest(files: Record<string, string>) {
  const entries = Object.keys(files).sort().map((path) => ({ path, digest: digest(files[path]!), bytes: Buffer.byteLength(files[path]!) }));
  return { digest: digest(JSON.stringify(entries)), entries };
}
export type ContentManifest = ReturnType<typeof contentManifest>;

export function redactConfig(input: EvaluationConfig) {
  const config = EvaluationConfigSchema.parse(input);
  return { ...config, executors: config.executors.map(({ command, args, settings, ...safe }) => ({
    ...safe, adapter_digest: digest(JSON.stringify({ command, args })), settings_digest: digest(JSON.stringify(settings)),
  })) };
}

export const ComparisonPolicySchema = z.strictObject({
  frozen_at: z.iso.datetime(), baseline_digest: z.string().min(1),
  max_duration_ratio: z.number().finite().positive().nullable(),
});
export type ComparisonPolicy = z.infer<typeof ComparisonPolicySchema>;
export interface ReportInput {
  config: EvaluationConfig; baseline: AssessedRun[]; candidate: AssessedRun[];
  manifests: Record<'baseline' | 'candidate' | 'runner' | 'corpus' | 'oracle', ContentManifest>;
  policy: ComparisonPolicy;
}

export function buildEvaluationReport(input: ReportInput) {
  const policy = ComparisonPolicySchema.parse(input.policy);
  const comparison = comparePairedRuns(input.baseline, input.candidate);
  if (policy.baseline_digest !== digest(JSON.stringify(input.baseline))) comparison.failures.push('Comparison policy is not bound to this baseline');
  const rows = [...input.baseline, ...input.candidate];
  for (const row of rows) {
    const identity = row.run.identity;
    const expected = input.manifests[identity.variant];
    if (identity.instruction_digest !== expected.digest || identity.runner_digest !== input.manifests.runner.digest ||
        identity.corpus_digest !== input.manifests.corpus.digest || identity.oracle_digest !== input.manifests.oracle.digest) {
      comparison.failures.push(`Manifest mismatch: ${identity.executor}/${identity.scenario}/${identity.variant}`);
    }
    if (!observedContext(row.run).available) comparison.failures.push(`Observed context digest mismatch: ${identity.executor}/${identity.scenario}`);
  }
  if (policy.max_duration_ratio !== null) {
    for (const after of input.candidate) {
      const before = input.baseline.find((r) => r.run.identity.executor === after.run.identity.executor && r.run.identity.scenario === after.run.identity.scenario);
      if (!before || before.run.duration_ms <= 0 || after.run.duration_ms / before.run.duration_ms > policy.max_duration_ratio) {
        comparison.failures.push(`Frozen duration policy exceeded: ${after.run.identity.executor}/${after.run.identity.scenario}`);
      }
    }
  }
  comparison.pass = comparison.failures.length === 0;
  return { version: 1 as const, config: redactConfig(input.config), policy, manifests: input.manifests,
    comparison, runs: rows.map((row) => ({ ...row, observed: observedContext(row.run) })) };
}
export type EvaluationReport = ReturnType<typeof buildEvaluationReport>;

function markdown(report: EvaluationReport): string {
  const rows = report.runs.map(({ run, verdict, mandatory, observed }) => [
    run.identity.executor, run.identity.scenario, run.identity.variant, verdict.complete ? 'complete' : 'incomplete',
    `${verdict.route_correct}/${verdict.route_expected}`, `${verdict.payload_first_pass}/${verdict.payload_expected}`,
    String(verdict.forbidden_actions), String(verdict.false_pass), String(verdict.unnecessary_test_runs),
    observed.provider_usage ? `${observed.provider_usage.input}/${observed.provider_usage.output}` : 'unavailable',
    String(run.duration_ms), mandatory.available ? String(mandatory.estimated_tokens) : 'unavailable',
  ]);
  return `# Workflow evaluation\n\n${report.comparison.pass ? 'PASS' : 'INCOMPLETE / FAIL'}\n\n` +
    'Scope: the bounded scenario endpoints, not every station in a complete SDD lifecycle. Synthetic runs are tool tests, never model evidence.\n\n' +
    renderMarkdownTable(['Executor', 'Scenario', 'Variant', 'Completion', 'Route', 'First payload', 'Forbidden', 'False PASS', 'Extra suites', 'Provider input/output', 'ms', 'Mandatory estimate'], rows) +
    '\n\n## Comparison failures\n\n' + (report.comparison.failures.map((f) => `- ${f}`).join('\n') || 'None') +
    '\n\n## Disclosed observations (reported, never scored)\n\n' + (report.comparison.disclosures.map((d) => `- ${d}`).join('\n') || 'None') +
    '\n\nFull traces, per-station loads (including repeats), unique-content estimates, manifests and the frozen policy are in the companion JSON. Provider usage is separate from the named character-based estimator.\n';
}

/** Redaction is applied to strings before serialization, including escaped trace content. */
export function redactSecrets(value: unknown, secrets: string[]): unknown {
  if (typeof value === 'string') return secrets.filter(Boolean).reduce((s, secret) => s.split(secret).join('[REDACTED]'), value);
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, secrets));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [redactSecrets(k, secrets), redactSecrets(v, secrets)]));
  return value;
}

export async function writeEvaluationReport(basePath: string, report: EvaluationReport, secrets: string[]): Promise<void> {
  await atomicWrite(`${basePath}.json`, JSON.stringify(redactSecrets(report, secrets), null, 2) + '\n');
  await atomicWrite(`${basePath}.md`, redactSecrets(markdown(report), secrets) as string);
}
