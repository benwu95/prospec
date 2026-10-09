import type { ChangeAbandonResult } from '../../types/abandon.js';
import type { LogLevel } from '../../types/config.js';
import { sanitizeTerminal } from './sanitize.js';

export function formatChangeAbandonOutput(result: ChangeAbandonResult, level: LogLevel = 'normal'): void {
  if (level === 'quiet') return;
  const lines = [
    `Abandoned: ${result.changeName}`,
    `Reason: ${result.reason}`,
    `Abandoned artifacts: ${result.archiveDir}`,
    `Preservation: ${result.preservationDir}`,
    `Preserved files: ${result.preservedFileCount} (captured manifest entries; excludes gitlink pins)`,
    'Work tree was not restored; the preserved count is not its current dirty-file count.',
    'Inspect the preservation data and decide whether to restore the work using version control.',
    `Scope: Prospec project ${result.projectRoot} (Git prefix: ${result.gitPrefix || '.'})`,
    'Tracker summary (local text to copy):',
    `${result.issue ?? 'No tracker registered'}: attempt ${result.changeName} abandoned — ${result.reason}. Artifacts and work retained at ${result.archiveDir}.`,
    'Retry: create a new Story for the same issue and explain retry_difference in its Premise.',
  ];
  process.stdout.write(lines.map((line) => sanitizeTerminal(line)).join('\n') + '\n');
}
