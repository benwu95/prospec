import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { ArchiveResult, ArchiveFinalizeResult } from '../../services/archive.service.js';
import { sanitizeTerminal } from './sanitize.js';

/**
 * Format the ArchiveResult for terminal output.
 *
 * Dry-run: the full planned-mutation list (action, target, detail).
 * Real run: archived changes, synced Feature Specs, affected modules.
 * Skipped / refused / not-found targets are failure-class output: they go to
 * stderr (each sets exit code 1 in the command) and stay visible under
 * --quiet, like handleError output.
 * Pending convergence (REQ-SERVICES-072) is warning-class: the spec body the
 * sync deliberately did NOT replace is work a human still owes, so it goes to
 * stderr too — unswallowable under --quiet — but it never fails the command.
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

  if (result.pendingConvergence.length > 0) {
    const verb = result.dryRun ? 'would keep' : 'kept';
    process.stderr.write(
      `${pc.yellow('!')} ${result.pendingConvergence.length} REQ body/bodies ${verb} their existing text — graduation worklist:\n`,
    );
    for (const p of result.pendingConvergence) {
      process.stderr.write(
        `  ${pc.yellow('·')} ${sanitizeTerminal(p.feature)} ${sanitizeTerminal(p.reqId)} — ${sanitizeTerminal(p.reason)}\n`,
      );
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

/** Format the ArchiveFinalizeResult: the history copy + counter reconciliations. */
export function formatArchiveFinalizeOutput(
  result: ArchiveFinalizeResult,
  logLevel: LogLevel = 'normal',
): void {
  if (logLevel === 'quiet') return;

  const lines: string[] = [];
  if (result.dryRun) {
    lines.push(`${pc.yellow('●')} dry-run — planned mutations for finalize ${sanitizeTerminal(result.changeName)}:`);
    for (const m of result.planned) {
      lines.push(`  ${pc.dim('→')} ${sanitizeTerminal(m.target)}: ${sanitizeTerminal(m.detail)}`);
    }
  } else {
    lines.push(
      `${pc.green('✓')} Copied finalized summary to ${pc.cyan(sanitizeTerminal(result.historyPath))} (committed spec history)`,
    );
    if (result.reconciled.length > 0) {
      lines.push('Reconciled feature-spec counters:');
      for (const r of result.reconciled) {
        lines.push(
          `  ${pc.green('✓')} ${sanitizeTerminal(r.file)}: story_count ${r.from.story_count ?? '—'} → ${r.to.story_count}, req_count ${r.from.req_count ?? '—'} → ${r.to.req_count}`,
        );
      }
    } else {
      lines.push(pc.dim('Feature-spec counters already consistent — nothing to reconcile'));
    }
  }
  process.stdout.write(lines.join('\n') + '\n');
}
