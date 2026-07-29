import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { ArchiveResult } from '../../services/archive.service.js';
import { sanitizeTerminal } from './sanitize.js';

/**
 * Format the ArchiveResult for terminal output.
 *
 * Dry-run: the full planned-mutation list (action, target, detail).
 * Real run: archived changes, synced Feature Specs, affected modules.
 * Skipped / refused / not-found targets are failure-class output: they go to
 * stderr (each sets exit code 1 in the command) and stay visible under
 * --quiet, like handleError output.
 */
export function formatArchiveOutput(result: ArchiveResult, logLevel: LogLevel): void {
  if (logLevel !== 'quiet') {
    if (result.dryRun) {
      console.log(pc.bold('Dry-run — nothing was written. Planned mutations:'));
      if (result.planned.length === 0) {
        console.log(pc.dim('  (none)'));
      }
      for (const p of result.planned) {
        console.log(`  ${pc.cyan(p.action.padEnd(6))} ${sanitizeTerminal(p.target)}`);
        console.log(`         ${pc.dim(sanitizeTerminal(p.detail))}`);
      }
    } else {
      for (const a of result.archived) {
        const summaryNote = a.summaryGenerated ? '' : pc.yellow(' (summary generation failed)');
        console.log(
          `${pc.green('✓')} archived ${sanitizeTerminal(a.name)} → ${sanitizeTerminal(a.archivePath)}${summaryNote}`,
        );
      }
      if (result.specFiles.length > 0) {
        console.log(pc.bold('Feature Specs synced:'));
        for (const specFile of result.specFiles) {
          console.log(`  ${sanitizeTerminal(specFile)}`);
        }
      }
      if (result.affectedModules.length > 0) {
        const modules = result.affectedModules.map((m) => sanitizeTerminal(m)).join(', ');
        console.log(`${pc.dim('Affected modules:')} ${modules}`);
      }
    }

  }

  for (const name of result.skipped) {
    const reason = result.skippedReasons[name] ?? 'archive failed';
    process.stderr.write(
      `${pc.yellow('!')} skipped ${sanitizeTerminal(name)} — ${sanitizeTerminal(reason)}\n`,
    );
  }
  for (const r of result.refused) {
    process.stderr.write(
      `${pc.red('✗')} refused ${sanitizeTerminal(r.name)} — ${sanitizeTerminal(r.reason)}\n`,
    );
  }
  for (const name of result.notFound) {
    process.stderr.write(
      `${pc.red('✗')} not found ${sanitizeTerminal(name)} — no such change under .prospec/changes/; run \`prospec status\` to list in-progress changes\n`,
    );
  }
}
