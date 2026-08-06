import type { Command } from 'commander';
import { execute, executeFinalize } from '../../services/archive.service.js';
import {
  formatArchiveOutput,
  formatArchiveFinalizeOutput,
} from '../formatters/archive-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `archive` command.
 *
 * Usage:
 *   prospec archive <name...> [--dry-run]
 *
 * Deterministic archive mutations (REQ-CLI-024): move the change bundle to
 * `.prospec/archive/{date}-{name}/`, generate the summary scaffold, sync
 * delta-spec requirements to Feature Specs, and sync product.md's Feature Map +
 * feature-map.yaml. Names are required — the explicit target is the caller's
 * confirmation. `--dry-run` previews every mutation without writing.
 */
export function registerArchiveCommand(program: Command): void {
  const archive = program
    .command('archive')
    .description("Archive verified changes: move to .prospec/archive/, sync Feature Specs, sync product.md's Feature Map + feature-map.yaml")
    .argument('<names...>', 'change name(s) under .prospec/changes/ to archive')
    .option('--dry-run', 'compute and print every planned mutation without writing anything')
    .action(async (names: string[], opts: { dryRun?: boolean }) => {
      const globalOpts = program.opts<GlobalOptions>();
      const logLevel = resolveLogLevel(globalOpts);

      try {
        const result = await execute({ names, dryRun: opts.dryRun ?? false });
        formatArchiveOutput(result, logLevel);
        const unhonored =
          result.refused.length > 0 || result.notFound.length > 0 || result.skipped.length > 0;
        if (unhonored) {
          process.exitCode = 1;
        }
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });

  // The POST-JUDGMENT step: runs after the skill overwrote summary.md and
  // graduated the REQs; `prospec archive <name>` itself runs before them.
  archive
    .command('finalize')
    .description('Post-judgment archive step: copy the finalized summary into spec history and reconcile feature-spec counters')
    .argument('<name>', 'archived change name (the .prospec/archive/{date}-{name} bundle)')
    .option('--dry-run', 'compute and print the planned mutations without writing anything')
    // `--dry-run` is declared on BOTH `archive` and `archive finalize`, and
    // commander binds such a flag to the PARENT — the subcommand's own `opts`
    // arrives empty, so reading it would silently write on a dry run.
    // `optsWithGlobals()` sees the value wherever it landed.
    .action(async function (this: Command, name: string) {
      const globalOpts = program.opts<GlobalOptions>();
      const logLevel = resolveLogLevel(globalOpts);
      try {
        const { dryRun } = this.optsWithGlobals<{ dryRun?: boolean }>();
        const result = await executeFinalize({ name, dryRun: dryRun ?? false });
        formatArchiveFinalizeOutput(result, logLevel);
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
