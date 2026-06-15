import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { QuickstartResult } from '../../services/quickstart.service.js';

/**
 * Format the QuickstartResult for terminal output.
 *
 * Output structure:
 * 1. Per-step status (✓ created / ○ skipped)
 * 2. Agent-sync hints (e.g. native-language trigger localization) passed through
 * 3. Next step — the exact slash command to run in the AI agent
 *
 * @param result - The quickstart orchestrator result
 * @param logLevel - Controls output verbosity (quiet shows nothing)
 */
export function formatQuickstartOutput(
  result: QuickstartResult,
  logLevel: LogLevel = 'normal',
): void {
  // Warnings are diagnostics: always emitted, on stderr, even in quiet mode
  for (const warning of result.agentSync.warnings) {
    process.stderr.write(`${pc.yellow('⚠')} ${warning}\n`);
  }

  if (logLevel === 'quiet') return;

  const lines: string[] = [];

  // 1. Per-step status
  for (const step of result.steps) {
    if (step.status === 'skipped') {
      lines.push(`${pc.dim('○')} ${step.name} ${pc.dim('(already done, skipped)')}`);
    } else {
      lines.push(`${pc.green('✓')} ${step.name}`);
    }
  }

  // 2. Hints from agent sync (e.g. populate native-language skill_triggers)
  for (const hint of result.agentSync.hints) {
    lines.push('');
    lines.push(`${pc.cyan('ℹ')} ${hint}`);
  }

  // 3. Next step — the AI-agent hand-off (knowledge generation needs an LLM)
  lines.push('');
  lines.push(
    `${pc.dim('→')} Scaffold ready. In your AI agent, run ${pc.cyan(`\`${result.nextStep}\``)} to localize triggers, sync, and generate AI Knowledge.`,
  );

  process.stdout.write(lines.join('\n') + '\n');
}
