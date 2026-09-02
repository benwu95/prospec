import * as path from 'node:path';
import type { ProspecConfig } from '../types/config.js';
import type { LanguageScope } from '../types/constitution.js';
import {
  resolveBasePaths,
  resolveArtifactLanguage,
  resolveTrustZoneLanguage,
  sameLanguage,
  isDefaultArtifactLanguage,
} from './config.js';
import { ruleFieldLabel } from './constitution-parser.js';
import { collapseWhitespace } from './text-lines.js';

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
 * Resolve which paths are written in the artifact language and which in the
 * trust-zone language, from the project's actual `paths.base_dir` /
 * `knowledge.base_path`. Both languages come from config too: `artifact_language`
 * and `trust_zone_language`, each defaulting to English.
 */
export function resolveLanguageScope(config: ProspecConfig, cwd: string): LanguageScope {
  const { baseDir, knowledgePath } = resolveBasePaths(config, cwd);
  const language = resolveArtifactLanguage(config);
  // One language, one spelling: `sameLanguage` is case-insensitive, and the two
  // generators would otherwise print the two fields' different spellings for what
  // the scope says is a single zone. English keeps the canonical spelling the
  // trust-zone resolver already applied — a lowercase `english` artifact language
  // must not leak into the trust zone, whose default every generator renders.
  const trustZoneResolved = resolveTrustZoneLanguage(config);
  const trustZoneLanguage =
    sameLanguage(language, trustZoneResolved) && !isDefaultArtifactLanguage(language)
      ? language
      : trustZoneResolved;
  // The ledger's other columns are keys, module names and enum tokens — English
  // whatever the trust zone's language. Said plainly only when the trust zone is
  // not English; the English wording is the pre-axis text the drift check pins.
  const ledgerOtherColumns = isDefaultArtifactLanguage(trustZoneLanguage)
    ? 'every other column stays English'
    : 'every other column is an identifier or enum and stays English';
  const base = relative(cwd, baseDir);
  const knowledge = relative(cwd, knowledgePath);
  // posix.join, not concatenation: a base_dir that resolves to cwd relativizes to
  // '.', and `${base}/x` would then emit the root-anchored '/x' — naming paths no
  // project file can match, in a rule verify grades MUST → FAIL.
  const underBase = (...segments: string[]): string => path.posix.join(base, ...segments);
  const underKnowledge = (...segments: string[]): string => path.posix.join(knowledge, ...segments);

  return {
    language,
    trustZoneLanguage,
    // Change artifacts and their archived summaries: the owner's own change
    // narrative. `specs/_archived-history/` holds archive summaries derived from
    // those artifacts, so it follows them rather than the English `specs/features/`.
    nativePaths: ['.prospec/changes/**', ARCHIVE_NATIVE_GLOB, underBase('specs/_archived-history/**')],
    trustZonePaths: [
      underBase('CONSTITUTION.md'),
      underBase('README.md'),
      underBase('index.md'),
      underBase('specs/product.md'),
      underBase('specs/features/**'),
      underKnowledge('**'),
    ],
    namedExceptions: [
      `keyword data — the \`aliases\` in \`${underKnowledge('module-map.yaml')}\` and the Aliases column of \`${underBase('index.md')}\` (native-language terms widen L1 keyword matching)`,
      `the \`description\` column of \`${underKnowledge('_lessons-ledger.md')}\` (each lesson — and its promotion provenance suffix — is quoted in the language of the original correction; ${ledgerOtherColumns})`,
      `correction evidence recorded in the original language in \`${underKnowledge('_playbook.md')}\` (its \`Re-evidence\` bullets)`,
      `\`${underKnowledge('_glossary.md')}\` as a whole (user-managed — the project owner picks its language)`,
    ],
    trustZoneExceptions: [
      `the \`**Spec:**\` block of \`.prospec/changes/**/delta-spec.md\` — it lands verbatim as the REQ body in \`${underBase('specs/features/**')}\`, so it is authored in THAT zone's language; the surrounding Before/After/Reason narrative stays in ${language}`,
    ],
  };
}

/**
 * The six context keys the entry config template renders its Language Policy
 * from. Both render sites — `prospec init` (via `lib/init-docs`) and
 * `prospec agent sync` — spread this, so neither can render the section with the
 * other's keys missing: Handlebars is non-strict, and a missing key renders an
 * empty path list instead of failing (which is exactly how init shipped an entry
 * config whose scope was blank while its Constitution stated the full one).
 */
export function entryLanguageContext(scope: LanguageScope): {
  language_is_english: boolean;
  trust_zone_is_english: boolean;
  language_single_zone: boolean;
  trust_zone_language: string;
  language_native_paths: string;
  language_trust_zone_paths: string;
} {
  return {
    language_is_english: isDefaultArtifactLanguage(scope.language),
    trust_zone_is_english: isDefaultArtifactLanguage(scope.trustZoneLanguage),
    language_single_zone: sameLanguage(scope.language, scope.trustZoneLanguage),
    trust_zone_language: scope.trustZoneLanguage,
    language_native_paths: formatPathList(scope.nativePaths),
    language_trust_zone_paths: formatPathList(scope.trustZonePaths),
  };
}

/** Render a path set as a backtick-quoted, comma-separated list. */
export function formatPathList(paths: string[]): string {
  return paths.map((p) => `\`${p}\``).join(', ');
}

/** How a Constitution's Language Policy relates to the rule the resolved scope renders. */
export type LanguagePolicyComparison =
  | 'missing-section'
  | 'no-description'
  | 'legacy-english-seed'
  | 'stale-seed'
  | 'diverged'
  | 'in-sync';

/**
 * Compare a Constitution's Language Policy `**Description**:` with the one the
 * resolved scope renders — the ONE comparison both `prospec check`
 * (`language-policy-drift`) and `prospec upgrade` (its stale signal) read.
 *
 * Only the Description is compared: it is machine-generated from the scope, so a
 * mismatch means the Constitution and the entry config no longer state one scope.
 * Rationale and Verify are the owner's to reword. Whitespace runs are collapsed
 * on both sides — list indentation and blank lines are formatting, not scope.
 *
 * The pre-fix seed marker keeps its legacy semantics: an English-only project
 * whose seed also said English has nothing to migrate (`legacy-english-seed`);
 * any other project still carrying the marker is `stale-seed`.
 *
 * `expectedDescription` is a string, not the rule, because `constitution-rules`
 * already imports this module — taking the rule here would close a cycle.
 */
export function compareLanguagePolicy(
  constitution: string,
  expectedDescription: string,
  scope: Pick<LanguageScope, 'language' | 'trustZoneLanguage'>,
): LanguagePolicyComparison {
  const section = languagePolicySection(constitution);
  if (section === null) return 'missing-section';

  if (section.includes(STALE_SEED_MARKER)) {
    const englishOnly =
      isDefaultArtifactLanguage(scope.language) && isDefaultArtifactLanguage(scope.trustZoneLanguage);
    return englishOnly && section.includes(STALE_SEED_ENGLISH) ? 'legacy-english-seed' : 'stale-seed';
  }

  const actual = descriptionField(section);
  if (actual === null) return 'no-description';
  return normalizeProse(actual) === normalizeProse(expectedDescription) ? 'in-sync' : 'diverged';
}

/**
 * Whether `prospec upgrade` should offer the consent-gated rewrite: the seed is
 * untouched in a project it does not fit, or the Description was reworded away
 * from (or the languages changed under) what the resolved scope now renders.
 */
export function isLanguagePolicyStale(
  constitution: string,
  expectedDescription: string,
  scope: Pick<LanguageScope, 'language' | 'trustZoneLanguage'>,
): boolean {
  const verdict = compareLanguagePolicy(constitution, expectedDescription, scope);
  return verdict === 'stale-seed' || verdict === 'diverged';
}

const DESCRIPTION_LABEL = ruleFieldLabel('Description');
const RATIONALE_LABEL = ruleFieldLabel('Rationale');
const VERIFY_LABEL = ruleFieldLabel('Verify');
const PRINCIPLE_SEPARATOR = /^---\s*$/;
const ANY_HEADING = /^#{1,6}\s/;

/** The next rule field, the principle separator, or any heading ends the Description. */
const endsDescription = (line: string): boolean =>
  RATIONALE_LABEL.test(line) || VERIFY_LABEL.test(line) || PRINCIPLE_SEPARATOR.test(line) || ANY_HEADING.test(line);

function descriptionField(section: string): string | null {
  const lines = section.split('\n');
  const start = lines.findIndex((line) => DESCRIPTION_LABEL.test(line.trimStart()));
  if (start === -1) return null;

  const body = [(lines[start] ?? '').trimStart().replace(DESCRIPTION_LABEL, '').trimStart()];
  for (const line of lines.slice(start + 1)) {
    if (endsDescription(line.trimStart())) break;
    body.push(line);
  }
  return body.join('\n');
}

const normalizeProse = collapseWhitespace;

/** Slice the Language Policy principle out of a Constitution, heading excluded. */
function languagePolicySection(constitution: string): string | null {
  const lines = constitution.split('\n');
  const start = lines.findIndex((line) => /^#{2,4}\s.*Language Policy\s*$/.test(line));
  if (start === -1) return null;

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{2,4}\s/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}
