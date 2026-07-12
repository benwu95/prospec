import type { Command } from 'commander';
import { execute } from '../../services/config-example.service.js';
import { formatConfigExampleOutput } from '../formatters/config-example-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';

/**
 * Register the `config` command group with the `example` subcommand.
 *
 * Usage:
 *   prospec config example
 *
 * The parent `config` command is a command group (no action). `example` prints
 * the complete annotated .prospec.yaml reference. Registered in INIT_COMMANDS so
 * it runs on an uninitialized project — the example is schema documentation,
 * project-agnostic.
 */
export function registerConfigCommand(program: Command): void {
  const config = program
    .command('config')
    .description('Configuration helpers');

  config
    .command('example')
    .description('Print a complete, annotated .prospec.yaml reference (all fields)')
    .action(async () => {
      const globalOpts = program.opts<GlobalOptions>();
      try {
        const result = await execute();
        formatConfigExampleOutput(result);
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
