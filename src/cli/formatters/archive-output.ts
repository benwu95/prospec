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
 * A declined product.md sync (REQ-CLI-033) is warning-class for the same reason.
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

  // Warning-class like the two worklists below it: the run succeeded, but the
  // Feature Map is NOT current and this line is the only thing that says so — a
  // silent non-write reads exactly like a successful sync.
  if (result.productSpecDeclined !== null) {
    process.stderr.write(
      `${pc.yellow('!')} product.md Feature Map not synced (${sanitizeTerminal(result.productSpecDeclined.reason)}) — ${sanitizeTerminal(result.productSpecDeclined.detail)}\n`,
    );
  }

  // BLOCKING-class from here down. These two were warnings once: the report
  // printed and the spec was written anyway, so the authored text left the trust
  // zone with a stderr line as its only trace. The spec is now left untouched, and
  // the wording has to say so — a reader who sees "archived" above a yellow line
  // will otherwise assume the write went through (REQ-CLI-032 / REQ-CLI-034).
  if (result.refusedRequirements.length > 0) {
    const verb = result.dryRun ? 'would be refused' : 'refused';
    process.stderr.write(
      `${pc.red('✗')} ${result.refusedRequirements.length} REQ(s) ${verb} — a landing block was cut short by a label the delta-spec template does not own; the feature spec was left unchanged:\n`,
    );
    for (const r of result.refusedRequirements) {
      process.stderr.write(
        `  ${pc.red('·')} ${sanitizeTerminal(r.feature)} ${sanitizeTerminal(r.reqId)} — ` +
          `\`**${sanitizeTerminal(r.label)}:**\` ends the \`**${sanitizeTerminal(r.block)}:**\` block, swallowing ${r.swallowedCount} line(s) from:\n` +
          `      ${sanitizeTerminal(r.firstSwallowedLine)}\n`,
      );
    }
    process.stderr.write(
      `  fix the block each refusal names — inline the labelled section as bullets; a \`**Dropped:**\` declaration does NOT release a refusal\n`,
    );
  }

  if (result.droppedBehavior.length > 0) {
    const verb = result.dryRun ? 'would drop' : 'dropped';
    process.stderr.write(
      `${pc.red('✗')} ${result.droppedBehavior.length} REQ body/bodies ${verb} authored behavior that was not declared deliberate — the feature spec was left unchanged:\n`,
    );
    for (const d of result.droppedBehavior) {
      process.stderr.write(
        `  ${pc.red('·')} ${sanitizeTerminal(d.feature)} ${sanitizeTerminal(d.reqId)}:\n`,
      );
      // In full, one per line: a count cannot tell a reader what to restore.
      for (const bullet of d.bullets) {
        process.stderr.write(`      ${sanitizeTerminal(bullet)}\n`);
      }
    }
    process.stderr.write(
      `  restore each bullet into the \`**Spec:**\` block, or list it under \`**Dropped:**\` to record that its exact text is intentionally not carried forward\n`,
    );
  }

  // Informational: the loss happened and was declared, so nothing is held back.
  // Printed anyway — a deliberate removal is still a removal, and the graduation
  // phase confirms it against the merged file.
  if (result.acknowledgedDrops.length > 0) {
    process.stderr.write(
      `${pc.yellow('!')} ${result.acknowledgedDrops.length} REQ body/bodies replaced text the delta-spec declared intentional:\n`,
    );
    for (const d of result.acknowledgedDrops) {
      process.stderr.write(
        `  ${pc.yellow('·')} ${sanitizeTerminal(d.feature)} ${sanitizeTerminal(d.reqId)}:\n`,
      );
      for (const bullet of d.bullets) {
        process.stderr.write(`      ${sanitizeTerminal(bullet)}\n`);
      }
    }
  }

  // A declaration matching nothing means the author is describing a body the spec
  // no longer has — worth saying, not worth blocking on.
  if (result.staleDeclarations.length > 0) {
    process.stderr.write(
      `${pc.yellow('!')} ${result.staleDeclarations.length} stale \`**Dropped:**\` declaration(s) — these bullets were not dropped; the delta-spec may describe an older body:\n`,
    );
    for (const d of result.staleDeclarations) {
      process.stderr.write(
        `  ${pc.yellow('·')} ${sanitizeTerminal(d.feature)} ${sanitizeTerminal(d.reqId)}:\n`,
      );
      for (const bullet of d.bullets) {
        process.stderr.write(`      ${sanitizeTerminal(bullet)}\n`);
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

/** Format the ArchiveFinalizeResult: the history copy + counter reconciliations. */
export function formatArchiveFinalizeOutput(
  result: ArchiveFinalizeResult,
  logLevel: LogLevel = 'normal',
): void {
  // A refused reconciliation goes to stderr and survives --quiet, like the other
  // worklists this command hands a human (pendingConvergence / droppedBehavior).
  // It was written to stdout under the normal-verbosity guard, which meant
  // `finalize --quiet` left a spec's counter untouched and said nothing at all —
  // trading a silent wrong write for a silent non-write. It does not set an exit
  // code: nothing failed, a file was deliberately not rewritten.
  if (result.refusedReconciliations.length > 0) {
    process.stderr.write(
      `${pc.yellow('!')} ${result.refusedReconciliations.length} feature spec(s) left untouched — the recount refused to zero a declared counter:\n`,
    );
    for (const r of result.refusedReconciliations) {
      process.stderr.write(
        `  ${pc.yellow('!')} ${sanitizeTerminal(r.file)}: declares story_count ${r.from.story_count ?? '—'}, req_count ${r.from.req_count ?? '—'} — ${sanitizeTerminal(r.reason)}\n`,
      );
    }
  }

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
    } else if (result.refusedReconciliations.length === 0) {
      // Suppressed when something was refused: "already consistent" beside a
      // refusal line is two contradicting claims about the same files.
      lines.push(pc.dim('Feature-spec counters already consistent — nothing to reconcile'));
    }
  }
  process.stdout.write(lines.join('\n') + '\n');
}
