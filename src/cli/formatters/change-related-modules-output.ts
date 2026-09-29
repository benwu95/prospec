import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { ChangeRelatedModulesResult } from '../../services/change-related-modules.service.js';
import { sanitizeTerminal } from './sanitize.js';

const list = (modules: string[]) => `[${modules.map(sanitizeTerminal).join(', ')}]`;

/** Format the ChangeRelatedModulesResult: the write, or the idempotent no-op. */
export function formatChangeRelatedModulesOutput(
  result: ChangeRelatedModulesResult,
  logLevel: LogLevel = 'normal',
): void {
  if (logLevel === 'quiet') return;

  const changeName = sanitizeTerminal(result.changeName);
  if (!result.changed) {
    process.stdout.write(
      `${pc.yellow('●')} ${changeName} already has related_modules ${pc.cyan(list(result.modules))} — no change\n`,
    );
    return;
  }
  process.stdout.write(
    `${pc.green('✓')} ${changeName}: related_modules ${pc.dim(list(result.from))} → ${pc.cyan(list(result.modules))}\n`,
  );
}
