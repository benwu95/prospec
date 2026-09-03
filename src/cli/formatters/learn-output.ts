import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { LearnUpsertResult } from '../../services/learn.service.js';
import { sanitizeTerminal } from './sanitize.js';

/** Format the LearnUpsertResult: upsert action, score details, TTL expiry list. */
export function formatLearnUpsertOutput(
  result: LearnUpsertResult,
  logLevel: LogLevel = 'normal',
): void {
  if (logLevel === 'quiet') return;

  const lines: string[] = [
    // `action` describes the ENTRY, not the file — "Ledger created" would read
    // as if the whole ledger had just been written.
    `${pc.green('✓')} Ledger entry ${result.action}: ${pc.cyan(sanitizeTerminal(result.ledgerPath))}`,
  ];
  for (const w of result.warnings) {
    lines.push(`${pc.yellow('⚠')} ${sanitizeTerminal(w)}`);
  }
  if (result.suggestions.length > 0) {
    lines.push('Suggest-promote (auditable score details):');
    for (const s of result.suggestions) {
      lines.push(`  - ${sanitizeTerminal(s.key)}: ${sanitizeTerminal(s.detail)}`);
    }
  }
  if (result.expiredPlaybook.length > 0) {
    lines.push('Playbook entries past TTL (needs-review):');
    for (const e of result.expiredPlaybook) {
      lines.push(`  - ${sanitizeTerminal(e.entry)} (review by ${sanitizeTerminal(e.reviewBy)})`);
    }
  }
  process.stdout.write(lines.join('\n') + '\n');
}

/** Format the LensYieldReport: statistics table, JSON mode, and retirement recommendations. */
export function formatLensYieldOutput(
  report: import('../../types/station.js').LensYieldReport,
  options: { json?: boolean; logLevel?: LogLevel } = {},
): void {
  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  if (options.logLevel === 'quiet') return;

  const lines: string[] = [];
  lines.push(
    `${pc.bold('Review Lens Confirmed Yield Statistics')} (${report.total_changes_analyzed} changes analyzed)`,
  );
  lines.push('');

  if (report.stats.length === 0) {
    lines.push(pc.dim('No review findings found across analyzed changes.'));
    process.stdout.write(lines.join('\n') + '\n');
    return;
  }

  // Format table rows
  // `Source` distinguishes a declared invocation from a rows-proxy one: a
  // rows-proxy lens is force-kept and can never be retired, so without this
  // column its `keep` is indistinguishable from a healthy declared `keep`.
  const headers = ['Lens', 'Invocations', 'Source', 'Confirmed', 'Yield', 'Consecutive Zero', 'Action'];
  const rawRows = report.stats.map((s) => {
    const yieldPct = `${(s.yield_ratio * 100).toFixed(1)}%`;
    return [
      sanitizeTerminal(s.lens),
      String(s.invocations),
      s.invocation_source,
      String(s.confirmed_findings),
      yieldPct,
      String(s.consecutive_zero_changes),
      s.action,
    ];
  });

  const rows = report.stats.map((s, idx) => {
    const raw = rawRows[idx]!;
    const actionColor =
      s.action === 'retire' ? pc.red : s.action === 'review' ? pc.yellow : pc.green;
    return [raw[0]!, raw[1]!, raw[2]!, raw[3]!, raw[4]!, raw[5]!, actionColor(raw[6]!)];
  });

  // Calculate column widths using uncolored raw strings
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rawRows.map((r) => r[i]?.length ?? 0)),
  );

  const formatRow = (cells: string[], rawCells: string[]) =>
    cells
      .map((c, i) => {
        const rawLen = rawCells[i]?.length ?? 0;
        const pad = ' '.repeat(Math.max(0, colWidths[i]! - rawLen));
        return c + pad;
      })
      .join('  ');

  lines.push(pc.dim(formatRow(headers, headers)));
  lines.push(pc.dim(colWidths.map((w) => '─'.repeat(w)).join('  ')));
  for (let i = 0; i < rows.length; i++) {
    lines.push(formatRow(rows[i]!, rawRows[i]!));
  }


  const retirementCandidates = report.stats.filter((s) => s.action === 'retire');
  if (retirementCandidates.length > 0) {
    lines.push('');
    lines.push(pc.yellow(pc.bold('Staleness Retirement Recommendations:')));
    for (const r of retirementCandidates) {
      lines.push(
        `  ${pc.red('●')} ${pc.bold(sanitizeTerminal(r.lens))}: ${sanitizeTerminal(r.reason ?? '')}`,
      );
    }
  }

  process.stdout.write(lines.join('\n') + '\n');
}

