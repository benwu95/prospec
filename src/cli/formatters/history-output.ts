import type { LogLevel } from '../../types/config.js';
import type { HistoryImportResult, HistoryPathsResult } from '../../types/history.js';
import { sanitizeTerminal } from './sanitize.js';

export function formatHistoryPathsOutput(result: HistoryPathsResult, level: LogLevel = 'normal'): void {
  if (level !== 'quiet') {
    for (const [key, value] of Object.entries(result.paths)) process.stdout.write(`${key}: ${sanitizeTerminal(value ?? '(non-Git)')}\n`);
  }
  for (const diagnostic of result.diagnostics) process.stderr.write(`${sanitizeTerminal(diagnostic.path)}: ${sanitizeTerminal(diagnostic.reason)}\n`);
}

export function formatHistoryImportOutput(result: HistoryImportResult, level: LogLevel = 'normal'): void {
  if (result.dryRun && level !== 'quiet') process.stdout.write('Dry-run — nothing was written.\n');
  for (const entry of result.entries) {
    const failed = entry.outcome === 'conflicting' || entry.outcome === 'failed';
    if (!failed && level === 'quiet') continue;
    const line = `${entry.outcome} ${entry.kind}/${entry.identity}: ${entry.source} → ${entry.destination}${entry.reason ? ` — ${entry.reason}` : ''}`;
    (failed ? process.stderr : process.stdout).write(sanitizeTerminal(line) + '\n');
  }
}
