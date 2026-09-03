import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { InitResult, TechStackResult } from '../../services/init.service.js';
// From its canonical home in the leaf `types` layer (not via init.service),
// so this always-static formatter drags neither init.service's @inquirer /
// template → handlebars chain into the registration graph nor a forbidden
// cli→lib import.
import { isDefaultArtifactLanguage } from '../../types/config.js';
import { sanitizeTerminal } from './sanitize.js';

/**
 * Format the InitResult for terminal output with proper styling.
 *
 * Output structure:
 * 1. Created files list (✓ green checkmarks)
 * 2. Detected tech stack (cyan values)
 * 3. AI Assistants status (✓ detected, ○ not installed)
 * 4. Selected agents summary
 * 5. Next steps suggestion (dim → with cyan command)
 *
 * @param result - The initialization result from init service
 * @param logLevel - Controls output verbosity (quiet shows nothing, normal/verbose show same output)
 */
export function formatInitOutput(
  result: InitResult,
  logLevel: LogLevel = 'normal',
): void {
  // In quiet mode, output nothing
  if (logLevel === 'quiet') return;

  const lines: string[] = [];

  // 1. Created files section
  for (const file of result.createdFiles) {
    lines.push(`${pc.green('✓')} Created ${sanitizeTerminal(file)}`);
  }

  // 2. Tech stack section (only if detected)
  if (hasTechStack(result.techStack)) {
    lines.push(''); // Empty line separator
    lines.push(formatTechStackLine(result.techStack));
  }

  // 3. AI Assistants section
  lines.push(''); // Empty line separator
  lines.push('AI Assistants:');
  for (const agent of result.agentInfos) {
    lines.push(formatAgentLine(agent));
  }

  // 4. Selected agents summary (only if agents were selected)
  if (result.selectedAgents.length > 0) {
    lines.push(''); // Empty line separator
    lines.push(`Selected agents: ${result.selectedAgents.map(sanitizeTerminal).join(', ')}`);
  }

  // 5. Document language (Language Policy seeded into CONSTITUTION.md). The
  //    seeded rule is path-scoped, so name the scope here too — "document
  //    language" alone reads as "every document", which is the ambiguity that let
  //    the Constitution and the entry config drift apart.
  lines.push(''); // Empty line separator
  const languageScopeNote = isDefaultArtifactLanguage(result.artifactLanguage)
    ? ''
    : ` for change artifacts; the trust zone (Knowledge base, specs/features, index.md, Constitution) in ${sanitizeTerminal(result.trustZoneLanguage)}`;
  lines.push(
    `Document language: ${pc.cyan(sanitizeTerminal(result.artifactLanguage))}${languageScopeNote} (Language Policy added to CONSTITUTION.md)`,
  );

  // 6. Next steps suggestion
  lines.push(''); // Empty line separator
  lines.push(
    `${pc.dim('→')} Run ${pc.cyan('`prospec agent sync`')} to generate AI configurations`,
  );
  if (!isDefaultArtifactLanguage(result.artifactLanguage)) {
    lines.push(
      `${pc.dim('→')} After syncing, you can add ${pc.cyan(sanitizeTerminal(result.artifactLanguage))} trigger words via ${pc.cyan('skill_triggers')} in .prospec.yaml (agent sync will show a tip)`,
    );
  }

  // Output all lines
  process.stdout.write(lines.join('\n') + '\n');
}

/**
 * Format a single tech stack line with cyan highlighting.
 * Example: "Tech stack detected: TypeScript / Node.js"
 */
function formatTechStackLine(techStack: TechStackResult): string {
  const parts: string[] = [];

  if (techStack.language) {
    parts.push(capitalizeFirst(sanitizeTerminal(techStack.language)));
  }
  if (techStack.framework) {
    parts.push(capitalizeFirst(sanitizeTerminal(techStack.framework)));
  }
  if (techStack.package_manager) {
    // Only add package manager if no framework (avoid clutter)
    if (!techStack.framework) {
      parts.push(capitalizeFirst(sanitizeTerminal(techStack.package_manager)));
    }
  }

  const stackValue = parts.join(' / ');
  return `Tech stack detected: ${pc.cyan(stackValue)}`;
}

/**
 * Format a single agent line with status indicator.
 * Example: "  ✓ Claude Code (detected)"
 * Example: "  ○ GitHub Copilot CLI (not installed)"
 */
function formatAgentLine(agent: {
  name: string;
  id: string;
  detected: boolean;
}): string {
  const name = sanitizeTerminal(agent.name);
  if (agent.detected) {
    return `  ${pc.green('✓')} ${name} (detected)`;
  } else {
    return `  ${pc.dim('○')} ${name} (not installed)`;
  }
}

/**
 * Check if tech stack has any detected values.
 */
function hasTechStack(ts: TechStackResult): boolean {
  return !!(ts.language || ts.framework || ts.package_manager);
}

/**
 * Capitalize the first letter of a string.
 */
function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

