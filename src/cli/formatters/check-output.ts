import pc from 'picocolors';
import path from 'node:path';
import type { LogLevel } from '../../types/config.js';
import type { CheckResult, InitCiResult } from '../../services/check.service.js';
import { DRIFT_CHECK_IDS, type DriftCheckResult, type DriftReport } from '../../types/drift-report.js';

/**
 * Format the drift check result for terminal output.
 *
 * Honesty rules (REQ-CLI-011):
 * - all five checks are listed with their own status
 * - skipped checks show their reason explicitly and are never counted as PASS
 * - the semantic layer is always shown as not-checked, never graded
 */

const STATUS_LABEL: Record<DriftCheckResult['status'], string> = {
  pass: pc.green('PASS'),
  warn: pc.yellow('WARN'),
  fail: pc.red('FAIL'),
  skipped: pc.dim('SKIP'),
};

/**
 * Findings embed raw repo strings (link targets, task text) — strip C0/C1
 * control characters so an untrusted clone cannot inject ANSI/OSC sequences
 * into the developer's terminal.
 */
export function sanitizeTerminal(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');
}

export function formatCheckOutput(result: CheckResult | InitCiResult, logLevel: LogLevel): void {
  if (logLevel === 'quiet') return;

  if (result.kind === 'init-ci') {
    const rel = path.relative(process.cwd(), result.workflowPath);
    if (result.created) {
      console.log(`${pc.green('✓')} Created ${rel}`);
      console.log('  → Review the workflow, then commit it to enable the CI drift gate');
    } else {
      console.log(`${pc.yellow('●')} ${rel} already exists — left untouched (rerun-safe)`);
    }
    return;
  }

  const { report } = result;
  console.log(pc.bold('Prospec drift check (structural — deterministic, zero LLM)'));
  console.log('');

  for (const id of DRIFT_CHECK_IDS) {
    const check = report.structural.checks.find((c) => c.id === id);
    if (!check) continue;
    const reason =
      check.status === 'skipped' ? pc.dim(` — ${sanitizeTerminal(check.reason ?? '')}`) : '';
    console.log(`  ${STATUS_LABEL[check.status]}  ${id}${reason}`);
  }

  if (report.structural.findings.length > 0) {
    console.log('');
    console.log(pc.bold('Findings:'));
    for (const f of report.structural.findings) {
      const where = f.line === undefined ? f.source_path : `${f.source_path}:${f.line}`;
      const sev = f.severity === 'fail' ? pc.red('fail') : pc.yellow('warn');
      console.log(`  [${sev}] ${sanitizeTerminal(where)}`);
      console.log(`         ${sanitizeTerminal(f.detail)}`);
    }
  }

  const health = report.structural.knowledge_health;
  if (health) {
    console.log('');
    console.log(
      `Knowledge coverage: ${health.coverage.documented}/${health.coverage.total} modules documented` +
        `${staleSuffix(health.modules)}`,
    );
  }

  console.log('');
  console.log(summaryLine(report));
  console.log(pc.dim(`Semantic consistency: ${report.semantic.status} (run /prospec-review)`));
  if (result.reportPath) {
    console.log(pc.dim(`Report written: ${path.relative(process.cwd(), result.reportPath)}`));
  }
}

function staleSuffix(modules: Array<{ stale: boolean }>): string {
  const stale = modules.filter((m) => m.stale).length;
  return stale > 0 ? pc.yellow(`, ${stale} stale`) : '';
}

function summaryLine(report: DriftReport): string {
  const { fail_count, warn_count, skipped_count } = report.summary;
  const checked = report.structural.checks.length - skipped_count;
  const parts = [
    fail_count > 0 ? pc.red(`${fail_count} fail`) : pc.green('0 fail'),
    warn_count > 0 ? pc.yellow(`${warn_count} warn`) : '0 warn',
    skipped_count > 0 ? pc.dim(`${skipped_count} skipped (not counted as pass)`) : '0 skipped',
  ];
  return `Checked ${checked}/${report.structural.checks.length} checks: ${parts.join(', ')}`;
}
