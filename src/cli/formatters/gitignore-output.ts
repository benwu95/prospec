import pc from 'picocolors';
import type { GitignoreBlockResult } from '../../types/gitignore-block.js';
import { sanitizeTerminal } from './sanitize.js';

const BLOCK_PURPOSE = 'prospec block: ignores local artifacts, re-includes prospec skills';

/**
 * The `.gitignore` status line shared by init, agent sync, quickstart and upgrade
 * (REQ-CLI-063) — present only when the writer created or changed the file.
 */
export function formatGitignoreStatus(result: GitignoreBlockResult | undefined): string | undefined {
  if (result?.status === 'created') return `${pc.green('✓')} Created .gitignore (${BLOCK_PURPOSE})`;
  if (result?.status === 'updated') return `${pc.green('✓')} Updated .gitignore (${BLOCK_PURPOSE})`;
  return undefined;
}

/** The writer's warnings and suggested lines are diagnostics: on stderr, in quiet mode too. */
export function writeGitignoreWarnings(result: GitignoreBlockResult | undefined): void {
  for (const warning of result?.warnings ?? []) {
    process.stderr.write(`${pc.yellow('⚠')} ${sanitizeTerminal(warning)}\n`);
  }
  const lines = result?.suggestedLines ?? [];
  if (lines.length === 0) return;
  process.stderr.write(`${pc.cyan('ℹ')} Add these lines at the end of .gitignore to re-include the prospec skills:\n`);
  // Unindented: `.gitignore` reads leading spaces as part of the pattern.
  for (const line of lines) process.stderr.write(`${sanitizeTerminal(line)}\n`);
}
