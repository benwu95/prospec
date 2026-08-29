import * as fs from 'node:fs';
import * as path from 'node:path';
import { isSafeResourceName } from '../lib/knowledge-reader.js';
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
    // Every mutating service path.joins the resolved name, so a traversal name
    // must be refused here — before any existence probe or downstream write.
    if (!isSafeResourceName(explicitChange)) {
      throw new PrerequisiteError(
        `'${explicitChange}' is not a valid change name`,
        'A change name must match [A-Za-z0-9][A-Za-z0-9._-]* with no path separators or ".." — pass the directory name under .prospec/changes/',
      );
    }
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
    .filter((e) => e.isDirectory() && isSafeResourceName(e.name))
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

  // Deferred so the many non-interactive services that share this resolver
  // (check / change-log / verify-record / …) never pull @inquirer into their
  // startup graph — it loads only when an interactive pick actually happens.
  const { select } = await import('@inquirer/prompts');
  return select({
    message: promptMessage,
    choices: changeNames.map((name) => ({ name, value: name })),
  });
}
