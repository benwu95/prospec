import pc from 'picocolors';
import type { AutoDraftResult } from '../../types/auto-draft.js';
import type { LogLevel } from '../../types/config.js';
import { sanitizeTerminal } from './sanitize.js';

/**
 * Format the output of `prospec change auto-draft`.
 *
 * Every interpolated value here is free-form: a target and check id are derived
 * from a report's `source_path`, and a skip reason quotes a directory name.
 * They all route through `sanitizeTerminal` (cli README) — a report is data,
 * and data never gets to move the cursor.
 */
export function formatChangeAutoDraftOutput(result: AutoDraftResult, logLevel: LogLevel): void {
  if (logLevel === 'quiet') {
    // A dry run created nothing, so it prints nothing: the quiet stream is a
    // list of change directories that now exist, consumed by scripts.
    if (result.dryRun) return;
    for (const change of result.changes) {
      if (change.action === 'created') {
        console.log(sanitizeTerminal(change.name));
      }
    }
    return;
  }

  if (result.changes.length === 0) {
    console.log(pc.green('✓ No drift findings to auto-draft'));
    return;
  }

  if (result.dryRun) {
    console.log(pc.cyan('ℹ [dry-run] Simulating auto-draft (no files written):\n'));
  }

  const verb = result.dryRun ? 'Would draft fix' : 'Drafted fix';
  for (const change of result.changes) {
    if (change.action === 'created') {
      console.log(pc.green(`✓ ${verb}: ${pc.bold(sanitizeTerminal(change.name))}`));
      console.log(
        pc.dim(
          `  Target: ${sanitizeTerminal(change.target)} | Check: ${sanitizeTerminal(change.checkId)} | Scale: ${change.scale}`,
        ),
      );
      for (const remedy of change.remedies) {
        console.log(pc.dim(`  Remedy: ${sanitizeTerminal(remedy)}`));
      }
    } else if (change.action === 'failed') {
      console.log(
        pc.red(
          `✗ Failed: ${sanitizeTerminal(change.name)} (${sanitizeTerminal(change.skipReason ?? 'unknown error')})`,
        ),
      );
    } else {
      console.log(
        pc.yellow(
          `↷ Skipped: ${sanitizeTerminal(change.name)} (${sanitizeTerminal(change.skipReason ?? 'idempotent')})`,
        ),
      );
    }
  }

  const created = result.dryRun ? 'would be created' : 'created';
  const failed = result.failedCount > 0 ? `, ${result.failedCount} failed` : '';
  console.log(
    pc.dim(`\nTotal: ${result.createdCount} ${created}, ${result.skippedCount} skipped${failed}`),
  );

  if (result.createdCount > 0 && !result.dryRun) {
    console.log(
      pc.cyan('\n→ Run `prospec status` — it routes each drafted change to its next station.'),
    );
  }
}
