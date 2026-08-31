import * as path from 'node:path';
import { DEFAULT_ARTIFACT_LANGUAGE } from '../types/config.js';
import type { ProspecConfig } from '../types/config.js';
import type { LanguageScope } from '../types/constitution.js';
import { resolveBasePaths, resolveArtifactLanguage, isDefaultArtifactLanguage } from './config.js';

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

/** The old seed as an English project got it — the one case with nothing to migrate. */
const STALE_SEED_ENGLISH = `${STALE_SEED_MARKER} are written in English`;

const toPosix = (p: string): string => p.replace(/\\/g, '/');

/**
 * The gitignored archive copy's glob, named once.
 *
 * It is part of the native-language scope (its summaries follow the change
 * narrative), but consumers that SCAN the scope must subtract it — it is not in
 * version control and its content is a copy of what already shipped. Exported so
 * the subtraction is keyed on this constant instead of a hand-written twin.
 */
export const ARCHIVE_NATIVE_GLOB = '.prospec/archive/**';

const relative = (cwd: string, absolute: string): string =>
  toPosix(path.relative(cwd, absolute)) || '.';

/**
 * Resolve which paths are written in the artifact language and which stay
 * English, from the project's actual `paths.base_dir` / `knowledge.base_path`.
 */
export function resolveLanguageScope(config: ProspecConfig, cwd: string): LanguageScope {
  const { baseDir, knowledgePath } = resolveBasePaths(config, cwd);
  const base = relative(cwd, baseDir);
  const knowledge = relative(cwd, knowledgePath);
  // posix.join, not concatenation: a base_dir that resolves to cwd relativizes to
  // '.', and `${base}/x` would then emit the root-anchored '/x' — naming paths no
  // project file can match, in a rule verify grades MUST → FAIL.
  const underBase = (...segments: string[]): string => path.posix.join(base, ...segments);
  const underKnowledge = (...segments: string[]): string => path.posix.join(knowledge, ...segments);

  return {
    language: resolveArtifactLanguage(config),
    // Change artifacts and their archived summaries: the owner's own change
    // narrative. `specs/_archived-history/` holds archive summaries derived from
    // those artifacts, so it follows them rather than the English `specs/features/`.
    nativePaths: ['.prospec/changes/**', ARCHIVE_NATIVE_GLOB, underBase('specs/_archived-history/**')],
    englishPaths: [
      underBase('CONSTITUTION.md'),
      underBase('README.md'),
      underBase('index.md'),
      underBase('specs/product.md'),
      underBase('specs/features/**'),
      underKnowledge('**'),
    ],
    namedExceptions: [
      `keyword data — the \`aliases\` in \`${underKnowledge('module-map.yaml')}\` and the Aliases column of \`${underBase('index.md')}\` (native-language terms widen L1 keyword matching)`,
      `the \`description\` column of \`${underKnowledge('_lessons-ledger.md')}\` (each lesson — and its promotion provenance suffix — is quoted in the language of the original correction; every other column stays English)`,
      `correction evidence recorded in the original language in \`${underKnowledge('_playbook.md')}\` (its \`Re-evidence\` bullets)`,
      `\`${underKnowledge('_glossary.md')}\` as a whole (user-managed — the project owner picks its language)`,
    ],
    englishExceptions: [
      `the \`**Spec:**\` block of \`.prospec/changes/**/delta-spec.md\` — it lands verbatim as the REQ body in \`${underBase('specs/features/**')}\`, so it is authored in THAT zone's language; the surrounding Before/After/Reason narrative stays in ${resolveArtifactLanguage(config)}`,
    ],
  };
}

/**
 * The three context keys the entry config template renders its Language Policy
 * from. Both render sites — `prospec init` (via `lib/init-docs`) and
 * `prospec agent sync` — spread this, so neither can render the section with the
 * other's keys missing: Handlebars is non-strict, and a missing key renders an
 * empty path list instead of failing (which is exactly how init shipped an entry
 * config whose scope was blank while its Constitution stated the full one).
 */
export function entryLanguageContext(scope: LanguageScope): {
  language_is_english: boolean;
  language_native_paths: string;
  language_english_paths: string;
} {
  return {
    language_is_english: isDefaultArtifactLanguage(scope.language),
    language_native_paths: formatPathList(scope.nativePaths),
    language_english_paths: formatPathList(scope.englishPaths),
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
 * section needs the consent the `prospec-upgrade` skill asks for.
 *
 * `language` is the project's CURRENT artifact language. Only the combination
 * "English project whose seed also said English" has nothing to migrate: an
 * English project whose seed still names another language (the owner switched
 * `artifact_language` after init) carries a Constitution demanding that language
 * for everything while its entry config declares one English zone — precisely the
 * self-contradiction this signal exists to surface.
 */
export function isSeededLanguagePolicyStale(
  constitution: string,
  language: string = DEFAULT_ARTIFACT_LANGUAGE,
): boolean {
  const section = languagePolicySection(constitution);
  if (section === null || !section.includes(STALE_SEED_MARKER)) return false;

  return !(isDefaultArtifactLanguage(language) && section.includes(STALE_SEED_ENGLISH));
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
