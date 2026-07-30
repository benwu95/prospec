import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { ChangeScaleResult } from '../../services/change-scale.service.js';
import { sanitizeTerminal } from './sanitize.js';

/** Format the ChangeScaleResult: the write, or the idempotent no-op. */
export function formatChangeScaleOutput(
  result: ChangeScaleResult,
  logLevel: LogLevel = 'normal',
): void {
  if (logLevel === 'quiet') return;

  const changeName = sanitizeTerminal(result.changeName);
  if (!result.changed) {
    process.stdout.write(
      `${pc.yellow('●')} ${changeName} is already scale ${pc.cyan(result.scale)} — no change\n`,
    );
    return;
  }
  process.stdout.write(
    `${pc.green('✓')} ${changeName}: scale ${result.from ? `${pc.dim(result.from)} → ` : ''}${pc.cyan(result.scale)}\n`,
  );
}
