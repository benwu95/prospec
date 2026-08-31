import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type {
  AgentTriggersResult,
  AgentTriggersWriteResult,
} from '../../services/agent-triggers.service.js';
import { sanitizeTerminal } from './sanitize.js';

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
  const { isEnglish, missing } = result;
  const artifactLanguage = sanitizeTerminal(result.artifactLanguage);

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
    lines.push(`  ${sanitizeTerminal(skill.name)}:`);
    for (const word of skill.baseline) {
      lines.push(`    - ${sanitizeTerminal(word)}`);
    }
  }
  process.stdout.write(lines.join('\n') + '\n');
}

/** Format the write-back result: what was inserted, what was left untouched. */
export function formatAgentTriggersWriteOutput(
  result: AgentTriggersWriteResult,
  logLevel: LogLevel = 'normal',
): void {
  if (logLevel === 'quiet') return;

  const lines: string[] = [];
  if (result.written.length > 0) {
    lines.push(
      `${pc.green('✓')} Inserted skill_triggers for ${result.written.length} skill(s) into ${pc.cyan(sanitizeTerminal(result.configPath))}:`,
    );
    for (const skill of result.written) lines.push(`  - ${sanitizeTerminal(skill)}`);
  } else {

    lines.push(`${pc.yellow('●')} Nothing written — no missing skill_triggers entries in the scaffold`);
  }
  if (result.skippedExisting.length > 0) {
    const skipped = result.skippedExisting.map((s) => sanitizeTerminal(s)).join(', ');
    lines.push(
      pc.dim(`Skipped (existing entries are never overwritten): ${skipped}`),
    );
  }
  lines.push(`${pc.dim('→')} Run ${pc.cyan('`prospec agent sync`')} to redeploy skills with the new triggers`);
  process.stdout.write(lines.join('\n') + '\n');
}
