import type { Command } from 'commander';
import { execute } from '../../services/archive.service.js';
import { formatArchiveOutput } from '../formatters/archive-output.js';
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
 * delta-spec requirements to Feature Specs, and rebuild product.md +
 * feature-map.yaml. Names are required — the explicit target is the caller's
 * confirmation. `--dry-run` previews every mutation without writing.
 */
export function registerArchiveCommand(program: Command): void {
  program
    .command('archive')
    .description('Archive verified changes: move to .prospec/archive/, sync Feature Specs, rebuild product.md + feature-map.yaml')
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
}
