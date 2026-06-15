import type { Command } from 'commander';
import { execute } from '../../services/quickstart.service.js';
import { formatQuickstartOutput } from '../formatters/quickstart-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { DEFAULT_ARTIFACT_LANGUAGE } from '../../types/config.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `quickstart` command onto the program.
 *
 * Usage:
 *   prospec quickstart [--name <name>] [--agents <list>] [--language <language>]
 *
 * One-command brownfield onboarding: chains init + agent sync (skipping
 * already-completed steps), then prints the slash command to run in the AI
 * agent. Registered in INIT_COMMANDS — it runs before .prospec.yaml exists.
 * Options mirror `init` and pass through to it (`--agents`/`--language` skip
 * the interactive prompts for CI/non-TTY).
 */
export function registerQuickstartCommand(program: Command): void {
  program
    .command('quickstart')
    .description('One-command onboarding: init + agent sync, then hand off to /prospec-quickstart')
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
        formatQuickstartOutput(result, logLevel);
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
