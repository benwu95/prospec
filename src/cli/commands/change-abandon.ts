import type { Command } from 'commander';
import type { GlobalOptions } from '../index.js';
import { collect } from '../parse-options.js';
import { resolveLogLevel } from '../log-level.js';
import { formatChangeAbandonOutput } from '../formatters/change-abandon-output.js';
import { handleError } from '../formatters/error-output.js';

export function registerChangeAbandonCommand(program: Command): void {
  const change = program.commands.find((command) => command.name() === 'change');
  if (!change) return;
  change.command('abandon')
    .description('End an attempt, retaining its artifacts and project-scoped Git work')
    .argument('<name>', 'Change to abandon')
    .requiredOption('--reason <text>', 'Why this attempt is ending')
    .option('--overturned <field>', 'Existing scalar Premise leaf disproved by evidence (repeatable)', collect, [])
    .option('--json', 'Emit JSON; failures go to stderr with exit status 1')
    .action(async (name: string, options: { reason: string; overturned: string[]; json?: boolean }) => {
      const global = program.opts<GlobalOptions>();
      try {
        const { execute } = await import('../../services/change-abandon.service.js');
        const result = await execute({ name, reason: options.reason, overturned: options.overturned });
        if (options.json) process.stdout.write(JSON.stringify(result) + '\n');
        else formatChangeAbandonOutput(result, resolveLogLevel(global));
      } catch (error) { handleError(error, global.verbose ?? false, options.json); }
    });
}
