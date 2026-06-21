import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { UpgradeResult } from '../../services/upgrade.service.js';

/**
 * Format the UpgradeResult for terminal output.
 *
 * 1. Agent-sync warnings (always, on stderr, even in quiet mode)
 * 2. Version delta + agent-sync status
 * 3. Upgrade report — skills missing triggers
 * 4. Agent-sync hints, then the next step (/prospec-upgrade)
 *
 * The report is plain stdout text so the /prospec-upgrade skill can read it back
 * after shelling out to `prospec upgrade`.
 *
 * @param result - The upgrade orchestrator result
 * @param logLevel - Controls output verbosity (quiet shows nothing on stdout)
 */
export function formatUpgradeOutput(
  result: UpgradeResult,
  logLevel: LogLevel = 'normal',
): void {
  // Warnings are diagnostics: always emitted, on stderr, even in quiet mode
  for (const warning of result.agentSync.warnings) {
    process.stderr.write(`${pc.yellow('⚠')} ${warning}\n`);
  }

  if (logLevel === 'quiet') return;

  const { report } = result;
  const lines: string[] = [];

  // 1. Version delta + agent sync
  lines.push(
    `${pc.green('✓')} version ${report.versionFrom} ${pc.dim('→')} ${report.versionTo}`,
  );
  lines.push(`${pc.green('✓')} agent sync (${result.agentSync.totalFiles} files)`);

  // 2. Upgrade report — what /prospec-upgrade should act on (with confirmation)
  lines.push('');
  lines.push(pc.bold('Upgrade report:'));
  if (report.missingTriggers.length > 0) {
    lines.push(
      `${pc.yellow('•')} skills missing triggers: ${report.missingTriggers.join(', ')}`,
    );
  } else {
    lines.push(`${pc.dim('•')} skill triggers up to date`);
  }

  // 3. Agent-sync hints
  for (const hint of result.agentSync.hints) {
    lines.push('');
    lines.push(`${pc.cyan('ℹ')} ${hint}`);
  }

  // 4. Next step — the AI-agent hand-off (consent-gated doc review needs an LLM)
  lines.push('');
  lines.push(
    `${pc.dim('→')} .prospec.yaml upgraded and agents synced. In your AI agent, run ${pc.cyan(`\`${result.nextStep}\``)} to review init-created doc formats (with your confirmation) and localize any new-skill triggers.`,
  );

  process.stdout.write(lines.join('\n') + '\n');
}
