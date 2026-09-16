import pc from 'picocolors';
import { ESCAPING_RULE_TEXT } from '../../types/cli-help.js';
import { sanitizeTerminal } from './sanitize.js';

/**
 * The one line a table-writing command adds when the engine rewrote at least one
 * cell — absent otherwise, so the digest stays byte-identical for clean rounds.
 * The rule sentence is the same constant the command's help prints; it still
 * crosses the terminal sanitizer like every other formatter string, so this
 * formatter holds the same invariant as its siblings.
 */
export function formatEscapingNotice(escapedCells: number): string | undefined {
  if (escapedCells <= 0) return undefined;
  return `${pc.yellow('⚠')} ${escapedCells} cell(s) escaped on write — ${sanitizeTerminal(ESCAPING_RULE_TEXT)}`;
}
