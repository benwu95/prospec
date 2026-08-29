import type { Command } from 'commander';
import { formatAgentSyncOutput } from '../formatters/agent-sync-output.js';
import {
  formatAgentTriggersOutput,
  formatAgentTriggersWriteOutput,
} from '../formatters/agent-triggers-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { VALID_AGENTS } from '../../types/config.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `agent` command group with `sync` and `triggers` subcommands.
 *
 * Usage:
 *   prospec agent sync [--cli <name>]
 *   prospec agent triggers
 *
 * The parent `agent` command is a command group (no action). `sync` regenerates
 * agent config + Skills; `triggers` emits a read-only fill-missing
 * `skill_triggers` localization scaffold.
 */
export function registerAgentCommand(program: Command): void {
  const agent = program
    .command('agent')
    .description('AI Agent configuration management');

  agent
    .command('sync')
    .description('Sync AI Agent configuration and Skills')
    .option('--cli <name>', `Specify a particular CLI (${VALID_AGENTS.join('/')})`)
    .action(
      async (options: { cli?: string }) => {
        const globalOpts = program.opts<GlobalOptions>();
        const logLevel = resolveLogLevel(globalOpts);

        try {
          const { execute } = await import('../../services/agent-sync.service.js');
          const result = await execute({
            cli: options.cli,
          });
          formatAgentSyncOutput(result, logLevel);
        } catch (err) {
          handleError(err, globalOpts.verbose ?? false);
        }
      },
    );

  agent
    .command('triggers')
    .description(
      'Emit a fill-missing skill_triggers localization scaffold (English baselines from SKILL_DEFINITIONS)',
    )
    .option(
      '--write <file>',
      'Write a translated scaffold back into .prospec.yaml (fill-missing, comment-preserving)',
    )
    .action(async (options: { write?: string }) => {
      const globalOpts = program.opts<GlobalOptions>();
      const logLevel = resolveLogLevel(globalOpts);

      try {
        const { execute: agentTriggersExecute, executeWrite: agentTriggersWrite } = await import(
          '../../services/agent-triggers.service.js'
        );
        if (options.write) {
          const result = await agentTriggersWrite({ from: options.write });
          formatAgentTriggersWriteOutput(result, logLevel);
        } else {
          const result = await agentTriggersExecute({});
          formatAgentTriggersOutput(result, logLevel);
        }
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
