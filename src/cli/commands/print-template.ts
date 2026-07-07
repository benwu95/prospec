import type { Command } from 'commander';
import { execute } from '../../services/print-template.service.js';
import { formatPrintTemplateOutput } from '../formatters/print-template-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';

/**
 * Register the `print-template` command onto the program.
 *
 * Usage:
 *   prospec print-template <path>
 *
 * This command outputs the raw template content of a bundled template.
 * It is registered in INIT_COMMANDS so it can be run on uninitialized projects.
 */
export function registerPrintTemplateCommand(program: Command): void {
  program
    .command('print-template <path>')
    .description('Print the raw content of a bundled template by its relative path')
    .action(async (templatePath: string) => {
      const globalOpts = program.opts<GlobalOptions>();
      try {
        const result = await execute({ templatePath });
        formatPrintTemplateOutput(result);
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
