import type { Command } from 'commander';
import { execute } from '../../services/knowledge-init.service.js';
import { formatKnowledgeInitOutput } from '../formatters/knowledge-init-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import type { LogLevel } from '../../types/config.js';
import { parseDepth } from '../parse-options.js';

/**
 * Resolve log level from global options.
 */
function resolveLogLevel(opts: GlobalOptions): LogLevel {
  if (opts.quiet) return 'quiet';
  if (opts.verbose) return 'verbose';
  return 'normal';
}

/**
 * Register the `init` subcommand under the `knowledge` command group.
 *
 * Usage:
 *   prospec knowledge init [--dry-run] [--depth <n>]
 */
export function registerKnowledgeInitCommand(
  knowledge: Command,
  program: Command,
): void {
  knowledge
    .command('init')
    .description('Scan the project and generate raw-scan.md and empty skeletons')
    .option('--dry-run', 'Preview only, do not write files')
    .option('--depth <n>', 'Directory scan depth', parseDepth, 10)
    .action(
      async (options: { dryRun?: boolean; depth?: number }) => {
        const globalOpts = program.opts<GlobalOptions>();
        const logLevel = resolveLogLevel(globalOpts);

        try {
          const result = await execute({
            dryRun: options.dryRun,
            depth: options.depth,
          });
          formatKnowledgeInitOutput(result, logLevel);
        } catch (err) {
          handleError(err, globalOpts.verbose ?? false);
        }
      },
    );
}
