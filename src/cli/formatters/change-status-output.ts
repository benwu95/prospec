import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { ChangeStatusResult } from '../../services/change-status.service.js';
import { sanitizeTerminal } from './sanitize.js';

/** Format the ChangeStatusResult: the transition, or the idempotent no-op. */
export function formatChangeStatusOutput(
  result: ChangeStatusResult,
  logLevel: LogLevel = 'normal',
): void {
  if (logLevel === 'quiet') return;

  const changeName = sanitizeTerminal(result.changeName);
  if (!result.changed) {
    process.stdout.write(
      `${pc.yellow('●')} ${changeName} is already at ${pc.cyan(result.to)} — no change\n`,
    );
    return;
  }
  process.stdout.write(
    `${pc.green('✓')} ${changeName}: status ${pc.dim(result.from)} → ${pc.cyan(result.to)}\n`,
  );
}
