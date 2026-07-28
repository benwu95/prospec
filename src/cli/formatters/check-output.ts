import pc from 'picocolors';
import path from 'node:path';
import type { LogLevel } from '../../types/config.js';
import type {
  CheckResult,
  EscapedDefectsResult,
  InitCiResult,
  RecordReviewResult,
  RecordTestsResult,
} from '../../services/check.service.js';
import { DRIFT_CHECK_IDS, type DriftCheckResult, type DriftReport } from '../../types/drift-report.js';
import { sanitizeTerminal } from './sanitize.js';

// Shared terminal sanitiser, re-exported so existing importers (and the
// contract test) keep their `check-output` import path unchanged.
export { sanitizeTerminal };

/**
 * Format the drift check result for terminal output.
 *
 * Honesty rules (REQ-CLI-011):
 * - every check in DRIFT_CHECK_IDS is listed with its own status
 * - skipped checks show their reason explicitly and are never counted as PASS
 * - the semantic layer is always shown as not-checked, never graded
 */

const STATUS_LABEL: Record<DriftCheckResult['status'], string> = {
  pass: pc.green('PASS'),
  warn: pc.yellow('WARN'),
  fail: pc.red('FAIL'),
  skipped: pc.dim('SKIP'),
};

export function formatCheckOutput(
  result:
    | CheckResult
    | InitCiResult
    | RecordReviewResult
    | RecordTestsResult
    | EscapedDefectsResult,
  logLevel: LogLevel,
): void {
  if (logLevel === 'quiet') return;

  if (result.kind === 'record-tests') {
    formatRecordTests(result);
    return;
  }

  if (result.kind === 'escaped-defects') {
    formatEscapedDefects(result);
    return;
  }

  if (result.kind === 'record-review') {
    const change = sanitizeTerminal(result.change);
    if (result.recorded) {
      console.log(`${pc.green('✓')} Recorded review baseline for change "${change}"`);
    } else {
      console.log(
        `${pc.yellow('●')} Review baseline not recorded for "${change}" — ${sanitizeTerminal(result.reason ?? 'skipped')}`,
      );
    }
    return;
  }

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

  const constitution = report.structural.constitution;
  if (constitution) {
    const untagged = constitution.rules.filter((r) => r.severity === null).length;
    console.log(
      `Constitution rules: ${constitution.rules.length} parsed` +
        `${untagged > 0 ? pc.yellow(`, ${untagged} untagged`) : ''}`,
    );
  }

  console.log('');
  console.log(summaryLine(report));
  console.log(pc.dim(`Semantic consistency: ${report.semantic.status} (run /prospec-review)`));
  if (result.reportPath) {
    console.log(pc.dim(`Report written: ${path.relative(process.cwd(), result.reportPath)}`));
  }
}

/** A recorded run is reported by what happened, never as a verdict — the FAIL for
 *  a non-zero exit code belongs to the `test-provenance` check, not to this line. */
function formatRecordTests(result: RecordTestsResult): void {
  const cmd = result.command === undefined ? '' : ` (\`${sanitizeTerminal(result.command)}\`)`;
  if (!result.recorded) {
    console.log(
      `${pc.yellow('●')} Test baseline not recorded for "${sanitizeTerminal(result.change)}"${cmd}` +
        ` — ${sanitizeTerminal(result.reason ?? 'skipped')}`,
    );
    return;
  }
  const passed = result.exitCode === 0;
  const mark = passed ? pc.green('✓') : pc.red('✗');
  console.log(
    `${mark} Recorded test baseline for change "${sanitizeTerminal(result.change)}"${cmd}` +
      ` — exit ${result.exitCode}`,
  );
  if (!passed) {
    console.log('  → recorded as failing; `test-provenance` will FAIL until the suite is green');
  }
  if (result.treeChangedDuringRun === true) {
    console.log(
      `  ${pc.yellow('●')} the tree changed while the suite ran — the recorded fingerprint covers` +
        ' code the run may not have exercised',
    );
  }
}

function formatEscapedDefects(result: EscapedDefectsResult): void {
  const { report } = result;
  console.log(pc.bold('Escaped-defect rate per gate (from metadata `introduced_by`)'));
  console.log('');
  if (!report.ledger_available) {
    // Never claim a fact about records that were never opened.
    console.log(
      `  ${pc.dim('ledger unavailable')} — neither \`.prospec/changes/\` nor \`.prospec/archive/\` exists,` +
        ' so no gate record was read at all',
    );
  } else if (report.sample_count === 0) {
    console.log(
      `  ${pc.dim('no registered samples')} — no change records \`introduced_by\`, so no rate can be computed`,
    );
    console.log(pc.dim('  (an empty sample is not a 0% escape rate)'));
  } else {
    for (const g of report.gates) {
      const pct = `${(g.escaped_rate * 100).toFixed(1)}%`;
      const label = g.escaped > 0 ? pc.yellow(pct) : pc.green(pct);
      console.log(`  ${label}  ${sanitizeTerminal(g.gate)} — ${g.escaped}/${g.passed} passed changes later blamed`);
    }
    console.log('');
    console.log(`Samples: ${report.sample_count}`);
    for (const s of report.samples) {
      console.log(
        `  ${sanitizeTerminal(s.fix_change)} → blames ${sanitizeTerminal(s.introduced_by)}` +
          ` (gates passed: ${s.gates_passed.map(sanitizeTerminal).join(', ') || 'none'})`,
      );
    }
  }
  if (report.unresolved_references.length > 0) {
    console.log('');
    console.log(pc.yellow(`Unresolved \`introduced_by\` references: ${report.unresolved_references.length}`));
    for (const s of report.unresolved_references) {
      console.log(
        `  ${sanitizeTerminal(s.fix_change)} names "${sanitizeTerminal(s.introduced_by)}" — no single change in either ledger resolves it (missing, or the name is shared)`,
      );
    }
  }
  if (!report.archive_available) {
    console.log('');
    console.log(pc.dim('.prospec/archive/ not found — sample covers in-flight changes only'));
  }
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
