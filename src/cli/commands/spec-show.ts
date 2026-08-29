import type { Command } from 'commander';
import { formatSpecShowOutput } from '../formatters/spec-show-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { collect } from '../parse-options.js';

/**
 * Register the `spec` command group with the `show` subcommand.
 *
 * Usage:
 *   prospec spec show <feature> [--req <ids>] [--story <ids>]
 */
export function registerSpecCommand(program: Command): void {
  const spec = program.command('spec').description('Read the permanent Feature Specs');

  spec
    .command('show')
    .description('Print the requirements a change touches, by REQ id or story')
    .argument('<feature>', 'Feature slug — the spec filename without `.md`')
    .option('--req <ids>', 'REQ id (repeatable; comma-separated accepted)', collect, [])
    .option('--story <ids>', 'Story id such as US-1 (repeatable; comma-separated accepted)', collect, [])
    .action(async (feature: string, options: { req: string[]; story: string[] }) => {
      const globalOpts = program.opts<GlobalOptions>();
      try {
        const { execute } = await import('../../services/spec-show.service.js');
        const result = await execute({ feature, req: options.req, story: options.story });
        formatSpecShowOutput(result);
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
