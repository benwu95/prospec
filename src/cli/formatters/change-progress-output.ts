import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { ChangeProgressResult } from '../../services/change-progress.service.js';
import { sanitizeTerminal } from './sanitize.js';

/**
 * Format the ChangeProgressResult. The `Progress X/Y` line is a parse contract
 * for the implement skill's progress anchor — keep its shape stable.
 */
export function formatChangeProgressOutput(
  result: ChangeProgressResult,
  logLevel: LogLevel = 'normal',
): void {
  if (logLevel === 'quiet') return;

  const lines: string[] = [];
  if (result.completedTask) {
    lines.push(`${pc.green('✓')} Completed: ${sanitizeTerminal(result.completedTask)}`);
  } else if (result.alreadyChecked) {
    lines.push(`${pc.yellow('●')} Task already checked — no change`);
  }

  const { checked, total } = result.progress;
  lines.push(
    `Progress ${checked}/${total}` + (result.allCodeDone ? ' (Complete)' : ''),
  );
  if (result.nextTask) {
    lines.push(`Next: ${sanitizeTerminal(result.nextTask)}`);
  }
  if (result.uncheckedManual.length > 0) {
    lines.push(pc.dim(`Unchecked [M] reminders: ${result.uncheckedManual.length}`));
    for (const t of result.uncheckedManual) lines.push(pc.dim(`  - ${sanitizeTerminal(t)}`));
  }
  if (result.uncheckedVerification.length > 0) {
    lines.push(pc.dim(`Unchecked [V] reminders: ${result.uncheckedVerification.length}`));
    for (const t of result.uncheckedVerification) lines.push(pc.dim(`  - ${sanitizeTerminal(t)}`));
  }
  if (result.allCodeDone) {
    lines.push(
      `${pc.dim('→')} All code tasks done — run ${pc.cyan('`prospec change status implemented`')}, then ${pc.cyan('/prospec-review')}`,
    );
  }
  process.stdout.write(lines.join('\n') + '\n');
}
