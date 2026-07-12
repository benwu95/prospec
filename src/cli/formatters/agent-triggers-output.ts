import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { AgentTriggersResult } from '../../services/agent-triggers.service.js';

/**
 * Format the trigger-localization scaffold for `prospec agent triggers`.
 *
 * - non-English with a gap → a paste-ready `skill_triggers:` YAML block on
 *   stdout (the result), preceded by a header comment naming the target language
 * - English, or every skill already localized → an informational note on stderr
 *   (suppressed in quiet), leaving stdout byte-empty so piping captures nothing
 *   misleading
 */
export function formatAgentTriggersOutput(
  result: AgentTriggersResult,
  logLevel: LogLevel = 'normal',
): void {
  const { artifactLanguage, isEnglish, missing } = result;

  if (isEnglish) {
    if (logLevel !== 'quiet') {
      process.stderr.write(
        `${pc.cyan('ℹ')} artifact_language is English — the English trigger baselines are already the final triggers; no skill_triggers localization needed.\n`,
      );
    }
    return;
  }

  if (missing.length === 0) {
    if (logLevel !== 'quiet') {
      process.stderr.write(
        `${pc.cyan('ℹ')} All skills already have a ${artifactLanguage} skill_triggers entry — nothing to localize.\n`,
      );
    }
    return;
  }

  const lines: string[] = [
    '# Native-language skill_triggers scaffold — translate each English baseline',
    `# value into ${artifactLanguage}, then add these entries under skill_triggers`,
    '# in .prospec.yaml (existing entries are left untouched).',
    'skill_triggers:',
  ];
  for (const skill of missing) {
    lines.push(`  ${skill.name}:`);
    for (const word of skill.baseline) {
      lines.push(`    - ${word}`);
    }
  }
  process.stdout.write(lines.join('\n') + '\n');
}
