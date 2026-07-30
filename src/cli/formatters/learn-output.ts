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
