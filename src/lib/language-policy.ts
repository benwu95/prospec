import * as path from 'node:path';
import type { ProspecConfig } from '../types/config.js';
import type { LanguageScope } from '../types/constitution.js';
import { resolveBasePaths, resolveArtifactLanguage } from './config.js';

/**
 * The resolved language scope — one source for every generated statement of it.
 *
 * `prospec init` seeds the Constitution's Language Policy rule and
 * `prospec agent sync` writes the entry config's language declaration. Both used
 * to spell the scope out by hand, so a change to one silently contradicted the
 * other: the Constitution demanded the AI Knowledge base in the artifact
 * language while CLAUDE.md declared it permanently English. Since verify audits
 * only the Constitution and grades a MUST violation as FAIL, a fresh project was
 * set against itself whichever document its agent obeyed. Generating both from
 * this module removes the seam.
 */

/** The old seeded wording — its presence marks an untouched pre-fix rule. */
const STALE_SEED_MARKER = 'All AI-generated documents (change artifacts and AI Knowledge)';

const toPosix = (p: string): string => p.replace(/\\/g, '/');

const relative = (cwd: string, absolute: string): string => toPosix(path.relative(cwd, absolute));

/**
 * Resolve which paths are written in the artifact language and which stay
 * English, from the project's actual `paths.base_dir` / `knowledge.base_path`.
 */
export function resolveLanguageScope(config: ProspecConfig, cwd: string): LanguageScope {
  const { baseDir, knowledgePath } = resolveBasePaths(config, cwd);
  const base = relative(cwd, baseDir);
  const knowledge = relative(cwd, knowledgePath);

  return {
    language: resolveArtifactLanguage(config),
    // Change artifacts and their archived summaries: the owner's own change
    // narrative. `specs/_archived-history/` holds archive summaries derived from
    // those artifacts, so it follows them rather than the English `specs/features/`.
    nativePaths: ['.prospec/changes/**', '.prospec/archive/**', `${base}/specs/_archived-history/**`],
    englishPaths: [
      `${base}/CONSTITUTION.md`,
      `${base}/README.md`,
      `${base}/index.md`,
      `${base}/specs/features/**`,
      `${knowledge}/**`,
    ],
    namedExceptions: [
      `keyword data — the \`aliases\` in \`${knowledge}/module-map.yaml\`, the Aliases column of \`${base}/index.md\`, and the Alias column of \`${knowledge}/_glossary.md\` (native-language terms widen L1 keyword matching)`,
      `the \`description\` column of \`${knowledge}/_lessons-ledger.md\` (each lesson is quoted in the language of the original correction)`,
      `verbatim correction evidence quoted in \`${knowledge}/_playbook.md\``,
      `\`${knowledge}/_glossary.md\` as a whole (user-managed — the project owner picks its language)`,
    ],
  };
}

/** Render a path set as a backtick-quoted, comma-separated list. */
export function formatPathList(paths: string[]): string {
  return paths.map((p) => `\`${p}\``).join(', ');
}

/**
 * Whether a Constitution still carries the pre-fix seeded Language Policy.
 *
 * Deliberately narrow: it matches only the exact phrase `prospec init` used to
 * write, scoped to the Language Policy section. A project owner who already
 * reworded the rule — or who quotes the old phrasing in another principle — is
 * never nagged, and `prospec upgrade` only ever reports this; rewriting the
 * section needs the consent the `/prospec-upgrade` skill asks for.
 */
export function isSeededLanguagePolicyStale(constitution: string): boolean {
  const section = languagePolicySection(constitution);
  return section !== null && section.includes(STALE_SEED_MARKER);
}

/** Slice the Language Policy principle out of a Constitution, heading excluded. */
function languagePolicySection(constitution: string): string | null {
  const lines = constitution.split('\n');
  const start = lines.findIndex((line) => /^#{2,4}\s.*Language Policy\s*$/.test(line));
  if (start === -1) return null;

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{2,4}\s/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}
