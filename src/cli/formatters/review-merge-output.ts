import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { ReviewMergeResult } from '../../services/review-merge.service.js';
import { sanitizeTerminal } from './sanitize.js';

/**
 * Format the ReviewMergeResult: where the round landed, this round's counts, and
 * the round's criticals as a bounded digest.
 *
 * This output IS the orchestrating context's whole intake for a review round —
 * the reviewer wrote its findings (evidence included) to a file and returned
 * only that path, so what a caller acts on is printed here. The evidence prose
 * is deliberately absent: `review.md` holds it, and each critical carries the
 * command that shows the defect instead, so existence is confirmed by running
 * something rather than by reading a paragraph.
 */
export function formatReviewMergeOutput(
  result: ReviewMergeResult,
  logLevel: LogLevel = 'normal',
): void {
  if (logLevel === 'quiet') return;

  const { round } = result;
  const evidence =
    result.evidenceBlocks > 0 ? `, ${result.evidenceBlocks} evidence block(s)` : '';
  const lines = [
    `${pc.green('✓')} Merged review round into ${pc.cyan(sanitizeTerminal(result.reviewPath))} (${result.totalRows} row(s) cumulative${evidence})`,
    `  round: criticals_found=${round.criticals_found} · criticals_fixed=${round.criticals_fixed} · majors=${round.majors}`,
  ];
  if (result.criticals.length > 0) {
    lines.push(`  ${pc.bold('criticals to verify before any fix')}:`);
    for (const c of result.criticals) {
      const id = c.id === undefined ? '' : `${sanitizeTerminal(c.id)} · `;
      lines.push(
        `    ${id}${sanitizeTerminal(c.location)} · ${sanitizeTerminal(c.lens)} — ${sanitizeTerminal(c.summary)}`,
      );
      if (c.repro !== undefined) {
        lines.push(`      repro: ${pc.cyan(sanitizeTerminal(c.repro))}`);
      }
    }
  }
  lines.push(
    `${pc.dim('→')} Record the round with ${pc.cyan('`prospec change log --skill prospec-review …`')} using these counts`,
  );
  process.stdout.write(lines.join('\n') + '\n');
}
