import type { Command } from 'commander';
import { formatKnowledgeVerifyOutput } from '../formatters/knowledge-verify-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `verify` subcommand under the `knowledge` command group.
 *
 * Usage:
 *   prospec knowledge verify <module>...
 *
 * Stamps `last_verified` for each named module in module-map.yaml — the dated
 * confirmation the `knowledge:check` gate requires and `knowledge-health` reads.
 */
export function registerKnowledgeVerifyCommand(knowledge: Command, program: Command): void {
  knowledge
    .command('verify')
    .description('Stamp last_verified for the named modules (confirm their knowledge is current)')
    .argument('<module...>', 'Module name(s) to stamp as verified')
    .action(async (modules: string[]) => {
      const globalOpts = program.opts<GlobalOptions>();
      const logLevel = resolveLogLevel(globalOpts);
      try {
        const { execute } = await import('../../services/knowledge-verify.service.js');
        const result = await execute({ modules });
        formatKnowledgeVerifyOutput(result, logLevel);
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
