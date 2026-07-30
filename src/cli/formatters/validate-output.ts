import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { ValidateResult } from '../../services/validate.service.js';
import { sanitizeTerminal } from './sanitize.js';

/** Format the ValidateResult: the verdict plus findings; facts land as detail lines. */
export function formatValidateOutput(
  result: ValidateResult,
  logLevel: LogLevel = 'normal',
): void {
  if (logLevel === 'quiet') return;

  const verdict = result.ok ? pc.green('PASS') : pc.red('FAIL');
  const lines: string[] = [
    `validate ${result.kind} ${pc.cyan(sanitizeTerminal(result.target))}: ${verdict}`,
  ];
  for (const f of result.findings) {
    const message = sanitizeTerminal(f.message);
    lines.push(f.level === 'FAIL' ? `  ${pc.red('✗')} ${message}` : `  ${pc.dim('ℹ')} ${message}`);
  }
  if (result.facts && 'ncMarkers' in result.facts && result.facts.ncMarkers.length > 0) {
    lines.push(pc.dim('  [NEEDS CLARIFICATION] locations (semantic classification is the skill\'s):'));
    for (const m of result.facts.ncMarkers) {
      lines.push(pc.dim(`    L${m.line}: ${sanitizeTerminal(m.text)}`));
    }
  }
  process.stdout.write(lines.join('\n') + '\n');
}
