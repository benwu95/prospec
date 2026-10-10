import type { Command } from 'commander';
import { COMMAND_HELP_SPECS, renderCommandHelp } from '../../types/cli-help.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';
import { handleError } from '../formatters/error-output.js';
import { formatHistoryPathsOutput, formatHistoryImportOutput } from '../formatters/history-output.js';

export function registerHistoryCommand(program: Command): void {
  const history = program.command('history').description('Inspect canonical terminal history and import legacy bundles');
  history.command('paths').description('Show source and canonical history paths without writes')
    .option('--json', 'Emit structured paths and diagnostics')
    .addHelpText('after', renderCommandHelp(COMMAND_HELP_SPECS['history paths']))
    .action(async (options: { json?: boolean }) => {
      const global = program.opts<GlobalOptions>();
      try {
        const { executePaths } = await import('../../services/history-import.service.js');
        const result = await executePaths();
        if (options.json) process.stdout.write(JSON.stringify(result) + '\n');
        else formatHistoryPathsOutput(result, resolveLogLevel(global));
      } catch (error) { handleError(error, global.verbose ?? false, options.json); }
    });
  history.command('import').description('Copy legacy terminal bundles into canonical history, retaining sources')
    .requiredOption('--from <project-root>', 'Registered same-repository project root containing local history')
    .option('--dry-run', 'Preview admissions without writes')
    .option('--json', 'Emit structured per-entry outcomes; unfulfilled entries exit 1')
    .addHelpText('after', renderCommandHelp(COMMAND_HELP_SPECS['history import']))
    .action(async (options: { from: string; dryRun?: boolean; json?: boolean }) => {
      const global = program.opts<GlobalOptions>();
      try {
        const { execute } = await import('../../services/history-import.service.js');
        const result = await execute({ from: options.from, dryRun: options.dryRun });
        if (options.json) process.stdout.write(JSON.stringify(result) + '\n');
        else formatHistoryImportOutput(result, resolveLogLevel(global));
        if (result.entries.some(entry => entry.outcome === 'conflicting' || entry.outcome === 'failed')) process.exitCode = 1;
      } catch (error) { handleError(error, global.verbose ?? false, options.json); }
    });
}
