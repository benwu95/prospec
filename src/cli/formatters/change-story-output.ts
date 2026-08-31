import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { ChangeStoryResult } from '../../services/change-story.service.js';
import { sanitizeTerminal } from './sanitize.js';

/**
 * Format the ChangeStoryResult for terminal output with proper styling.
 *
 * Output structure:
 * 1. Created files list (✓ green checkmarks)
 * 2. Related modules (if matched)
 * 3. Next steps suggestion
 */
export function formatChangeStoryOutput(
  result: ChangeStoryResult,
  logLevel: LogLevel = 'normal',
): void {
  if (logLevel === 'quiet') return;

  const lines: string[] = [];

  // 1. Created files — worded by what actually happened: `createdFiles` lists
  // the change's artifacts, and under a dry run none of them are on disk.
  const verb = result.dryRun ? 'Would create' : 'Created';
  for (const file of result.createdFiles) {
    lines.push(`${pc.green('✓')} ${verb} ${sanitizeTerminal(file)}`);
  }

  // 2. Description (if provided)
  if (result.description) {
    lines.push('');
    lines.push(`Description: ${pc.cyan(sanitizeTerminal(result.description))}`);
  }

  // 3. Related modules (if matched)
  if (result.relatedModules.length > 0) {
    lines.push('');
    lines.push('Related modules:');
    for (const mod of result.relatedModules) {
      lines.push(`  ${pc.green('●')} ${sanitizeTerminal(mod.name)} — ${pc.dim(sanitizeTerminal(mod.description))}`);
    }
  }

  // 4. Next steps
  lines.push('');
  lines.push(
    `${pc.dim('→')} Edit ${pc.cyan(`\`.prospec/changes/${sanitizeTerminal(result.changeName)}/proposal.md\``)} to fill in your User Story`,
  );
  lines.push(
    `${pc.dim('→')} Then run ${pc.cyan('`prospec change plan`')} to generate the implementation plan`,
  );

  process.stdout.write(lines.join('\n') + '\n');
}

