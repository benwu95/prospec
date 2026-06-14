import * as fs from 'node:fs';
import * as path from 'node:path';
import { select } from '@inquirer/prompts';
import { PrerequisiteError } from '../types/errors.js';

/**
 * Resolve which change to work on. Shared by `change plan` and `change tasks`.
 *
 * Strategy:
 * 1. If `explicitChange` is provided → validate and use it
 * 2. Scan `.prospec/changes/`
 * 3. One change → auto-select; multiple → prompt (or error in --quiet); zero → error
 *
 * @param promptMessage - the interactive select message (phase-specific)
 */
export async function resolveChange(
  cwd: string,
  explicitChange: string | undefined,
  quiet: boolean | undefined,
  promptMessage: string,
): Promise<string> {
  if (explicitChange) {
    const changeDir = path.join(cwd, '.prospec', 'changes', explicitChange);
    if (!fs.existsSync(changeDir)) {
      throw new PrerequisiteError(
        `Change '${explicitChange}' not found`,
        'Verify the change name is correct, or run `prospec change story` to create a new change',
      );
    }
    return explicitChange;
  }

  const changesDir = path.join(cwd, '.prospec', 'changes');
  if (!fs.existsSync(changesDir)) {
    throw new PrerequisiteError(
      'No changes found',
      'Run `prospec change story <name>` first to create a change request',
    );
  }

  const changeNames = fs
    .readdirSync(changesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  if (changeNames.length === 0) {
    throw new PrerequisiteError(
      'No changes found',
      'Run `prospec change story <name>` first to create a change request',
    );
  }

  if (changeNames.length === 1) {
    return changeNames[0]!;
  }

  if (quiet) {
    throw new PrerequisiteError(
      `Multiple changes found: ${changeNames.join(', ')}`,
      'Use `--change <name>` to specify which change to use',
    );
  }

  return select({
    message: promptMessage,
    choices: changeNames.map((name) => ({ name, value: name })),
  });
}
