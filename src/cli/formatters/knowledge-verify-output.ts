import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { KnowledgeVerifyResult } from '../../services/knowledge-verify.service.js';
import { sanitizeTerminal } from './sanitize.js';

/** Report which modules were stamped as verified (with the confirmation instant) and which were skipped. */
export function formatKnowledgeVerifyOutput(
  result: KnowledgeVerifyResult,
  logLevel: LogLevel = 'normal',
): void {
  if (logLevel === 'quiet') return;

  const lines = [
    ...result.verified.map(
      (m) => `${pc.green('✓')} verified ${sanitizeTerminal(m)} @ ${sanitizeTerminal(result.timestamp)}`,
    ),
    ...result.skipped.map(
      (m) => `${pc.dim('–')} skipped ${sanitizeTerminal(m)} — already stamped today, later than its HEAD value`,
    ),
  ];
  process.stdout.write(lines.join('\n') + '\n');
}
