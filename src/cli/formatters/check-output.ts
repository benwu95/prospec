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
import {
  DRIFT_CHECK_IDS,
  type DriftCheckResult,
  type DriftFinding,
  type DriftReport,
  type KnowledgeSizeFinding,
} from '../../types/drift-report.js';
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
  if (logLevel === 'quiet') {
    // What was WRITTEN stays visible under --quiet (cli README): a run that
    // silently created change directories is the one thing quiet must not hide.
    // A drafting FAILURE is the other — it goes to stderr, so the success
    // stream stays a clean list of directories that now exist.
    if (result.kind === 'report' && result.autoDraftResult && !result.autoDraftResult.dryRun) {
      for (const c of result.autoDraftResult.changes) {
        if (c.action === 'created') console.log(sanitizeTerminal(c.name));
      }
      for (const c of result.autoDraftResult.changes) {
        if (c.action === 'failed') {
          console.error(
            `auto-draft failed: ${sanitizeTerminal(c.name)} — ${sanitizeTerminal(c.skipReason ?? 'unknown error')}`,
          );
        }
      }
    }
    if (result.kind === 'report' && result.autoDraftError !== undefined) {
      console.error(`auto-draft failed: ${sanitizeTerminal(result.autoDraftError)}`);
    }
    return;
  }

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
      // Which baselines were stamped, not just that something was — an identical
      // success line for "recorded both" and "recorded one" is the silence the
      // `deltaSpecSkipped` field exists to prevent, and it was previously written
      // by the service and read by nobody.
      console.log(
        result.deltaSpecSkipped === true
          ? `${pc.green('✓')} Recorded review baseline for change "${change}" — no delta-spec, so no delta-spec baseline was stamped`
          : `${pc.green('✓')} Recorded review + delta-spec baselines for change "${change}"`,
      );
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
    // Grouped by check id in DRIFT_CHECK_IDS order — the same order the status
    // list above uses — so each finding sits under its own type heading rather
    // than interleaved with unrelated checks.
    for (const id of DRIFT_CHECK_IDS) {
      const group = report.structural.findings.filter((f) => f.check === id);
      if (group.length === 0) continue;
      console.log(`  ${pc.bold(id)} ${groupCountLabel(group)}`);
      if (id === 'knowledge-size') {
        printKnowledgeSizeTiers(group);
      } else {
        for (const f of group) printFinding(f, '    ');
      }
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
  console.log(pc.dim(`Semantic consistency: ${report.semantic.status} (run prospec-review)`));
  if (result.reportPath) {
    console.log(pc.dim(`Report written: ${path.relative(process.cwd(), result.reportPath)}`));
  }

  if (result.autoDraftError) {
    console.log('');
    console.log(
      `${pc.yellow('●')} Auto-draft failed (the check verdicts above are unaffected): ${sanitizeTerminal(result.autoDraftError)}`,
    );
  }

  if (result.autoDraftResult) {
    const draft = result.autoDraftResult;
    console.log('');
    if (draft.changes.length === 0) {
      // Findings existed — none of them were draftable. Saying so matches what
      // `prospec change auto-draft` prints for the same state; a bare heading
      // over an empty list reads as a rendering bug.
      console.log(`${pc.green('✓')} No draftable drift findings`);
      return;
    }
    console.log(
      pc.bold(draft.dryRun ? 'Auto-Draft Fix Proposals [dry-run]:' : 'Auto-Draft Fix Proposals:'),
    );
    const verb = draft.dryRun ? 'Would draft fix' : 'Drafted fix';
    for (const c of draft.changes) {
      if (c.action === 'created') {
        console.log(
          `  ${pc.green('✓')} ${verb}: ${pc.bold(sanitizeTerminal(c.name))} (${sanitizeTerminal(c.target)})`,
        );
        for (const remedy of c.remedies) {
          console.log(`    ${pc.dim(`Remedy: ${sanitizeTerminal(remedy)}`)}`);
        }
      } else if (c.action === 'failed') {
        console.log(
          `  ${pc.red('✗')} Failed: ${sanitizeTerminal(c.name)} (${sanitizeTerminal(c.skipReason ?? 'unknown error')})`,
        );
      } else {
        console.log(
          `  ${pc.yellow('↷')} Skipped: ${sanitizeTerminal(c.name)} (${sanitizeTerminal(c.skipReason ?? 'idempotent')})`,
        );
      }
    }
    if (draft.createdCount > 0 && !draft.dryRun) {
      console.log(
        pc.cyan('\n→ Run `prospec status` — it routes each drafted change to its next station.'),
      );
    }
  }
}

/** A recorded run is reported by what happened, never as a verdict — the FAIL for
 *  a non-zero exit code belongs to the `test-provenance` check, not to this line. */
function formatRecordTests(result: RecordTestsResult): void {
  const cmd = result.command === undefined ? '' : ` (\`${sanitizeTerminal(result.command)}\`)`;
  if (result.treeChangedDuringRun === true) {
    console.log(`  ${pc.yellow('●')} inputs changed during the run — passing evidence is not certified; re-run after inputs settle`);
  }
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

function printFinding(f: DriftFinding, indent: string): void {
  const where = f.line === undefined ? f.source_path : `${f.source_path}:${f.line}`;
  const sev = f.severity === 'fail' ? pc.red('fail') : pc.yellow('warn');
  console.log(`${indent}[${sev}] ${sanitizeTerminal(where)}`);
  console.log(`${indent}       ${sanitizeTerminal(f.detail)}`);
}

/**
 * Split the knowledge-size group into an over-budget sub-section (shown first —
 * a real violation to converge) and an approaching-headroom one (a pressure
 * signal), each further grouped by surface + budget so the shared threshold and
 * remedy print once as a heading and each finding line stays terse. Tiers read
 * off the structured `knowledge_size` field, not the prose; a finding without it
 * (an older report) falls back to a flat listing.
 */
function printKnowledgeSizeTiers(group: DriftFinding[]): void {
  const structured = group.filter((f) => f.knowledge_size !== undefined);
  const bare = group.filter((f) => f.knowledge_size === undefined);

  const tiers: Array<[string, 'over' | 'headroom']> = [
    ['over budget', 'over'],
    ['approaching budget (headroom)', 'headroom'],
  ];
  for (const [label, tier] of tiers) {
    const inTier = structured.filter((f) => f.knowledge_size!.tier === tier);
    if (inTier.length === 0) continue;
    console.log(`    ${pc.bold(label)} (${inTier.length})`);
    for (const { meta: m, findings: surfaceGroup } of groupBySurface(inTier)) {
      const cmp = tier === 'over' ? '>' : 'approaching';
      console.log(
        `      ${pc.bold(m.surface)} ${pc.dim(`· ${cmp} ${m.budget} ${m.budget_key} (${surfaceGroup.length})`)}`,
      );
      if (m.remedy !== undefined) console.log(`        ${pc.dim(m.remedy)}`);
      for (const f of surfaceGroup) {
        const meta = f.knowledge_size!;
        console.log(
          `        [${pc.yellow('warn')}] ${sanitizeTerminal(f.source_path)} ${pc.dim(`— ${meta.actual} ${meta.unit}`)}`,
        );
      }
    }
  }
  for (const f of bare) printFinding(f, '    ');
}

/** Group knowledge-size findings by (surface, budget_key), preserving first-seen order.
 *  Each group carries the shared meta (its findings share surface/budget/remedy). */
function groupBySurface(
  findings: DriftFinding[],
): Array<{ meta: KnowledgeSizeFinding; findings: DriftFinding[] }> {
  const groups = new Map<string, { meta: KnowledgeSizeFinding; findings: DriftFinding[] }>();
  for (const f of findings) {
    const m = f.knowledge_size!;
    const key = `${m.surface} ${m.budget_key}`;
    const bucket = groups.get(key);
    if (bucket) bucket.findings.push(f);
    else groups.set(key, { meta: m, findings: [f] });
  }
  return [...groups.values()];
}

/** Per-check finding tally, e.g. "(2 fail)", "(3 warn)", "(1 fail, 2 warn)". */
function groupCountLabel(group: DriftFinding[]): string {
  const fail = group.filter((f) => f.severity === 'fail').length;
  const warn = group.length - fail;
  const parts = [
    fail > 0 ? pc.red(`${fail} fail`) : '',
    warn > 0 ? pc.yellow(`${warn} warn`) : '',
  ].filter(Boolean);
  return `(${parts.join(', ')})`;
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
