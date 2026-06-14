import type { Command } from 'commander';
import { execute } from '../../services/knowledge.service.js';
import { formatKnowledgeOutput } from '../formatters/knowledge-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `knowledge` command group with `generate` subcommand.
 *
 * Usage:
 *   prospec knowledge generate [--dry-run]
 *
 * The parent `knowledge` command is a command group (no action).
 * `generate` is the subcommand that executes knowledge generation.
 */
export function registerKnowledgeCommand(program: Command): Command {
  const knowledge = program
    .command('knowledge')
    .description('AI Knowledge management');

  knowledge
    .command('generate')
    .description('(deprecated, use /prospec-knowledge-generate instead) Generate AI Knowledge documents')
    .option('--dry-run', 'Preview only, do not write files')
    .action(
      async (options: { dryRun?: boolean }) => {
        const globalOpts = program.opts<GlobalOptions>();
        const logLevel = resolveLogLevel(globalOpts);

        try {
          const result = await execute({
            dryRun: options.dryRun,
          });
          formatKnowledgeOutput(result, logLevel);
        } catch (err) {
          handleError(err, globalOpts.verbose ?? false);
        }
      },
    );

  return knowledge;
}
