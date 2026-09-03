import type { Command } from 'commander';
import { formatInitOutput } from '../formatters/init-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { DEFAULT_ARTIFACT_LANGUAGE } from '../../types/config.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `init` command onto the program.
 *
 * Usage:
 *   prospec init [--name <name>] [--agents <list>] [--language <language>] [--trust-zone-language <language>]
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
    .option(
      '--trust-zone-language <language>',
      `Language of the trust zone — Knowledge base, Feature Specs, Constitution; sets it and skips its prompt (CI default: ${DEFAULT_ARTIFACT_LANGUAGE}; interactive init asks only when the artifact language is non-English, defaulting to it)`,
    )
    .action(async (options: { name?: string; agents?: string[]; language?: string; trustZoneLanguage?: string }) => {
      const globalOpts = program.opts<GlobalOptions>();
      const logLevel = resolveLogLevel(globalOpts);

      try {
        const { execute } = await import('../../services/init.service.js');
        const result = await execute({
          name: options.name,
          agents: options.agents,
          language: options.language,
          trustZoneLanguage: options.trustZoneLanguage,
        });
        formatInitOutput(result, logLevel);
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
