import { formatEscalationDecision, formatEscalationHistoryLines } from './error-output.js';
import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { ChangeLogResult } from '../../services/change-log.service.js';
import { sanitizeTerminal } from './sanitize.js';

/** Format the ChangeLogResult: what was appended, where. */
export function formatChangeLogOutput(
  result: ChangeLogResult,
  logLevel: LogLevel = 'normal',
): void {
  if (logLevel === 'quiet') return;

  const { entry } = result;
  const lines: string[] = [
    `${pc.green('✓')} ${result.replay ? 'Accepted replay in' : 'Appended quality_log entry to'} ${pc.cyan(sanitizeTerminal(result.metadataPath))}`,
    `  skill: ${sanitizeTerminal(entry.skill)} · date: ${sanitizeTerminal(entry.date)} · result: ${entry.result}` +
      (entry.grade ? ` · grade: ${entry.grade}` : ''),
  ];
  if (entry.escalation?.kind === 'override') {
    const grant = entry.escalation;
    lines.push(`  One scoped grant: event=${sanitizeTerminal(grant.event_id)} · station=${sanitizeTerminal(grant.station)} · one new attempt`,
      `  reason: ${sanitizeTerminal(grant.reason)}`);
  }
  lines.push(...(result.escalation ? formatEscalationDecision(result.escalation) : []), ...formatEscalationHistoryLines(result.escalationHistory));
  if (entry.warnings.length > 0) {
    lines.push(`  warnings: ${entry.warnings.length}`);
  }
  if (entry.dimensions && entry.dimensions.length > 0) {
    lines.push(
      `  dimensions: ${entry.dimensions.map((d) => `${sanitizeTerminal(d.name)}=${d.result}`).join(', ')}`,
    );
  }
  process.stdout.write(lines.join('\n') + '\n');
}
