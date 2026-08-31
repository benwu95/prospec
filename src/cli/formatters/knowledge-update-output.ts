import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { KnowledgeUpdateForChangeResult } from '../../services/knowledge-update.service.js';
import { sanitizeTerminal } from './sanitize.js';

/**
 * Format the KnowledgeUpdateForChangeResult. The `README content pending`
 * block is the honest boundary of the mechanical update: those READMEs carry
 * LLM-authored knowledge the service deliberately never regenerates.
 */
export function formatKnowledgeUpdateOutput(
  result: KnowledgeUpdateForChangeResult,
  logLevel: LogLevel = 'normal',
): void {
  if (logLevel === 'quiet') return;

  const lines: string[] = [];
  if (result.changeName) {
    lines.push(`Knowledge update driven by change ${pc.cyan(sanitizeTerminal(result.changeName))}`);
  }
  for (const file of result.generatedFiles) {
    lines.push(`${pc.green('✓')} ${file.action}: ${sanitizeTerminal(file.path)}`);
  }
  if (result.deprecated.length > 0) {
    const deprecated = result.deprecated.map((m) => sanitizeTerminal(m)).join(', ');
    lines.push(`${pc.yellow('●')} deprecated: ${deprecated}`);
  }
  if (result.sweptFiles && result.sweptFiles.length > 0) {
    for (const swept of result.sweptFiles) {
      if (swept.savings > 0) {
        lines.push(`${pc.green('✓')} swept: ${sanitizeTerminal(swept.module)} (${swept.savings} tokens saved)`);
      } else {
        lines.push(`${pc.gray('●')} swept: ${sanitizeTerminal(swept.module)} (none)`);
      }
    }
  }
  if (result.readmePending.length > 0) {
    lines.push('');
    lines.push(
      `${pc.yellow('●')} README content pending (judgment — update via prospec-knowledge-update):`,
    );
    for (const mod of result.readmePending) lines.push(`  - ${sanitizeTerminal(mod)}`);
  }
  if (result.stampOnly.length > 0) {
    lines.push('');
    lines.push(
      `${pc.yellow('●')} stamp-only (diff-attributed, e.g. generated files — knowledge verify, no README edit):`,
    );
    for (const mod of result.stampOnly) lines.push(`  - ${sanitizeTerminal(mod)}`);
  }
  for (const warning of result.warnings) {
    lines.push(`${pc.yellow('⚠')} ${sanitizeTerminal(warning)}`);
  }
  if (lines.length === 0) {
    lines.push(`${pc.yellow('●')} Nothing to update`);
  }
  process.stdout.write(lines.join('\n') + '\n');
}
