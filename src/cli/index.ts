#!/usr/bin/env node

// Must precede any picocolors import — disables color for non-TTY stdout.
import './setup-color.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { handleError } from './formatters/error-output.js';
import { ConfigNotFound } from '../types/errors.js';
import { registerInitCommand } from './commands/init.js';
import { registerQuickstartCommand } from './commands/quickstart.js';
import { registerUpgradeCommand } from './commands/upgrade.js';
import { registerPrintTemplateCommand } from './commands/print-template.js';
import { registerKnowledgeCommand } from './commands/knowledge-generate.js';
import { registerKnowledgeInitCommand } from './commands/knowledge-init.js';
import { registerAgentCommand } from './commands/agent-sync.js';
import { registerConfigCommand } from './commands/config.js';
import { registerChangeCommand } from './commands/change-story.js';
import { registerChangePlanCommand } from './commands/change-plan.js';
import { registerChangeTasksCommand } from './commands/change-tasks.js';
import { registerMeasureCommand } from './commands/measure.js';
import { registerCheckCommand } from './commands/check.js';
import { registerMcpCommand } from './commands/mcp.js';
import { PROSPEC_VERSION } from '../types/version.js';

/**
 * Commands that do NOT require .prospec.yaml to exist.
 */
const INIT_COMMANDS = new Set(['init', 'quickstart', 'help', 'print-template', 'config']);

/**
 * Resolve verbose/quiet from global options into a log level.
 */
export type GlobalOptions = {
  verbose?: boolean;
  quiet?: boolean;
};

export function createProgram(): Command {
  const program = new Command();

  program
    .name('prospec')
    .description('Progressive Spec-Driven Development CLI')
    .version(PROSPEC_VERSION)
    .option('--verbose', 'Enable verbose output')
    .option('-q, --quiet', 'Quiet mode (results only, suitable for CI/CD)')
    .configureOutput({
      outputError: (str, write) => write(pc.red(str)),
    })
    .showSuggestionAfterError()
    .showHelpAfterError('(use --help for additional information)')
    .exitOverride();

  // preAction hook: check .prospec.yaml existence for non-init commands
  program.hook('preAction', (_thisCommand, actionCommand) => {
    const cmdName = actionCommand.name();
    // Walk up to find if any ancestor is in INIT_COMMANDS
    let cmd: Command | null = actionCommand;
    while (cmd) {
      if (INIT_COMMANDS.has(cmd.name())) return;
      cmd = cmd.parent;
    }

    // Skip check for root program (e.g. --version, --help)
    if (cmdName === 'prospec') return;

    // `mcp serve --cwd <dir>` targets another project root, so the guard must
    // resolve .prospec.yaml against that dir — not the directory the agent was
    // launched from (which may not be a Prospec project at all).
    const targetCwd = (actionCommand.opts() as { cwd?: string }).cwd;
    if (targetCwd !== undefined) {
      const configPath = path.join(targetCwd, '.prospec.yaml');
      if (!fs.existsSync(configPath)) throw new ConfigNotFound(configPath);
      return;
    }

    if (!fs.existsSync('.prospec.yaml')) {
      throw new ConfigNotFound();
    }
  });

  // Register subcommand groups
  registerInitCommand(program);
  registerQuickstartCommand(program);
  registerUpgradeCommand(program);
  registerPrintTemplateCommand(program);
  const knowledge = registerKnowledgeCommand(program);
  registerKnowledgeInitCommand(knowledge, program);
  registerAgentCommand(program);
  registerConfigCommand(program);
  registerChangeCommand(program);
  registerChangePlanCommand(program);
  registerChangeTasksCommand(program);
  registerMeasureCommand(program);
  registerCheckCommand(program);
  registerMcpCommand(program);

  return program;
}

/**
 * Main entry point — parse argv and handle errors.
 */
async function main(): Promise<void> {
  const program = createProgram();

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    // Commander throws on --help/--version with exitOverride; ignore clean exits
    if (
      err instanceof Error &&
      'exitCode' in err &&
      (err as { exitCode: number }).exitCode === 0
    ) {
      return;
    }

    // Commander parse errors (unknown option, missing arg) already outputted
    if (
      err instanceof Error &&
      'code' in err &&
      typeof (err as { code: string }).code === 'string' &&
      (err as { code: string }).code.startsWith('commander.')
    ) {
      process.exitCode = 1;
      return;
    }

    const opts = program.opts<GlobalOptions>();
    handleError(err, opts.verbose ?? false);
  }
}

main();
