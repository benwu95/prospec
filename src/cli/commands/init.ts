import type { Command } from 'commander';
import { execute } from '../../services/init.service.js';
import { formatInitOutput } from '../formatters/init-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { DEFAULT_ARTIFACT_LANGUAGE } from '../../types/config.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `init` command onto the program.
 *
 * Usage:
 *   prospec init [--name <name>] [--agents <list>]
 *
 * --agents accepts a comma-separated list and skips interactive selection (CI/CD mode).
 */
export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize Prospec project structure')
    .option('--name <name>', 'Specify the project name')
    .option(
      '--agents <list>',
      'AI agents (comma-separated, skips interactive selection)',
      (value: string) => value.split(',').map((s) => s.trim()),
    )
    .option(
      '--language <language>',
      `Primary language for AI-generated documents (default: ${DEFAULT_ARTIFACT_LANGUAGE}, skips interactive prompt)`,
    )
    .action(async (options: { name?: string; agents?: string[]; language?: string }) => {
      const globalOpts = program.opts<GlobalOptions>();
      const logLevel = resolveLogLevel(globalOpts);

      try {
        const result = await execute({
          name: options.name,
          agents: options.agents,
          language: options.language,
        });
        formatInitOutput(result, logLevel);
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
