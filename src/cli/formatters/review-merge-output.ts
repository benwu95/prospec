import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { ReviewMergeResult } from '../../services/review-merge.service.js';
import { sanitizeTerminal } from './sanitize.js';

/** Format the ReviewMergeResult: cumulative table size + this round's counts. */
export function formatReviewMergeOutput(
  result: ReviewMergeResult,
  logLevel: LogLevel = 'normal',
): void {
  if (logLevel === 'quiet') return;

  const { round } = result;
  process.stdout.write(
    [
      `${pc.green('✓')} Merged review round into ${pc.cyan(sanitizeTerminal(result.reviewPath))} (${result.totalRows} row(s) cumulative)`,
      `  round: criticals_found=${round.criticals_found} · criticals_fixed=${round.criticals_fixed} · majors=${round.majors}`,
      `${pc.dim('→')} Record the round with ${pc.cyan('`prospec change log --skill prospec-review …`')} using these counts`,
    ].join('\n') + '\n',
  );
}
