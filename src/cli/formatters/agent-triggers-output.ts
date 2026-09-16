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

  const { missingExclusions } = result;
  if (missing.length === 0 && missingExclusions.length === 0) {
    if (logLevel !== 'quiet') {
      process.stderr.write(
        `${pc.cyan('ℹ')} All skills already have a ${artifactLanguage} skill_triggers entry and a skill_exclusions entry — nothing to localize.\n`,
      );
    }
    return;
  }

  const lines: string[] = [
    '# Native-language localization scaffold — translate each English baseline value',
    `# into ${artifactLanguage}, then add these entries under the same key in .prospec.yaml`,
    '# (existing entries are left untouched). Under skill_triggers go the words that should',
    '# invoke the skill; under skill_exclusions go short phrases naming what it is NOT for.',
  ];
  const block = (key: string, skills: typeof missing): void => {
    if (skills.length === 0) return;
    lines.push(`${key}:`);
    for (const skill of skills) {
      lines.push(`  ${sanitizeTerminal(skill.name)}:`);
      for (const word of skill.baseline) {
        lines.push(`    - ${sanitizeTerminal(word)}`);
      }
    }
  };
  block('skill_triggers', missing);
  block('skill_exclusions', missingExclusions);
  process.stdout.write(lines.join('\n') + '\n');
}

/** Format the write-back result: what was inserted, what was left untouched. */
export function formatAgentTriggersWriteOutput(
  result: AgentTriggersWriteResult,
  logLevel: LogLevel = 'normal',
): void {
  if (logLevel === 'quiet') return;

  const lines: string[] = [];
  const report = (key: string, written: string[], skipped: string[]): void => {
    if (written.length > 0) {
      lines.push(
        `${pc.green('✓')} Inserted ${key} for ${written.length} skill(s) into ${pc.cyan(sanitizeTerminal(result.configPath))}:`,
      );
      for (const skill of written) lines.push(`  - ${sanitizeTerminal(skill)}`);
    }
    if (skipped.length > 0) {
      const names = skipped.map((s) => sanitizeTerminal(s)).join(', ');
      const label = key === 'skill_triggers' ? 'Skipped' : `Skipped ${key}`;
      lines.push(pc.dim(`${label} (existing entries are never overwritten): ${names}`));
    }
  };
  report('skill_triggers', result.written, result.skippedExisting);
  report('skill_exclusions', result.writtenExclusions, result.skippedExistingExclusions);
  if (result.written.length + result.writtenExclusions.length === 0) {
    lines.push(`${pc.yellow('●')} Nothing written — no missing skill_triggers or skill_exclusions entries in the scaffold`);
  }
  lines.push(`${pc.dim('→')} Run ${pc.cyan('`prospec agent sync`')} to redeploy skills with the new triggers`);
  process.stdout.write(lines.join('\n') + '\n');
}
