import type { Command } from 'commander';
import { executeForChange } from '../../services/knowledge-update.service.js';
import { formatKnowledgeUpdateOutput } from '../formatters/knowledge-update-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';
import { collect } from '../parse-options.js';

/**
 * Register the `update` subcommand under the `knowledge` command group.
 *
 * Usage:
 *   prospec knowledge update [--change <name>] [--module <name>...]
 */
export function registerKnowledgeUpdateCommand(knowledge: Command, program: Command): void {
  knowledge
    .command('update')
    .description(
      'Incrementally sync index.md / module-map.yaml (and skeleton READMEs for new modules) from a change delta-spec',
    )
    .option('--change <name>', 'Change whose delta-spec drives the update')
    .option('--module <name>', 'Update these modules directly instead (repeatable)', collect, [])
    .action(async (options: { change?: string; module: string[] }) => {
      const globalOpts = program.opts<GlobalOptions>();
      const logLevel = resolveLogLevel(globalOpts);
      try {
        const result = await executeForChange({
          change: options.change,
          modules: options.module,
          quiet: globalOpts.quiet,
        });
        formatKnowledgeUpdateOutput(result, logLevel);
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
