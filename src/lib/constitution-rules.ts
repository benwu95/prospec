import type { TechStackResult } from './detector.js';
import type { ConstitutionRule, LanguageScope } from '../types/constitution.js';
import { isDefaultArtifactLanguage, sameLanguage } from './config.js';
import { formatPathList } from './language-policy.js';

/**
 * Stack-appropriate starter Constitution rules.
 *
 * `prospec init` seeds CONSTITUTION.md with these so the file is usable from
 * day one instead of an empty placeholder (the root cause of OPT-B1: an empty
 * Constitution makes every gate and verify compliance check a no-op). Each
 * rule carries an RFC-2119 severity that verify grades against.
 */

const PYTHON_RULES: ConstitutionRule[] = [
  {
    severity: 'MUST',
    name: 'Authenticated API endpoints',
    description: 'All API endpoints require authentication unless explicitly public.',
    rationale: 'Unauthenticated endpoints are the most common source of data exposure.',
    check: 'Each route handler resolves an auth dependency/decorator.',
  },
  {
    severity: 'MUST',
    name: 'Tested public functions',
    description: 'Every public function ships with unit tests.',
    rationale: 'Untested code regresses silently; tests encode intended behavior.',
    check: 'Each public symbol has a corresponding test.',
  },
  {
    severity: 'SHOULD',
    name: 'Clean architecture boundaries',
    description: 'Business logic lives in domain/service layers, not in route handlers.',
    rationale: 'Keeping I/O out of domain logic keeps it testable and reusable.',
    check: 'Route handlers call a service and contain no direct DB/ORM/query calls.',
  },
  {
    severity: 'SHOULD',
    name: 'Structured API errors',
    description: 'API errors follow a consistent structured format (e.g. RFC 7807).',
    rationale: 'A uniform error contract lets clients handle failures predictably.',
    check: 'Error responses include a stable type/title/status shape.',
  },
];

const TYPESCRIPT_RULES: ConstitutionRule[] = [
  {
    severity: 'MUST',
    name: 'No any in public APIs',
    description: 'Public function and module signatures avoid `any`; use `unknown` or generics.',
    rationale: '`any` disables type checking at exactly the boundaries that need it most.',
    check: 'No `: any` in exported signatures.',
  },
  {
    severity: 'MUST',
    name: 'Tested public functions',
    description: 'Every public function ships with unit tests.',
    rationale: 'Untested code regresses silently; tests encode intended behavior.',
    check: 'Each export has a corresponding test.',
  },
  {
    severity: 'SHOULD',
    name: 'One-way dependency direction',
    description: 'Modules import in one direction only; no upward or circular imports.',
    rationale: 'A clean dependency graph keeps layers independently testable.',
    check: 'Lower layers do not import higher layers.',
  },
  {
    severity: 'SHOULD',
    name: 'Validate input at boundaries',
    description: 'External input is parsed/validated at system boundaries, not trusted.',
    rationale: 'Validating once at the edge prevents malformed data spreading inward.',
    check: 'Boundary handlers parse input before use.',
  },
];

const GENERIC_RULES: ConstitutionRule[] = [
  {
    severity: 'MUST',
    name: 'No committed secrets',
    description: 'Credentials and secrets never enter version control; use env or a secret store.',
    rationale: 'A leaked secret in history is effectively permanent and high-impact.',
    check: 'No credential-like strings in tracked files.',
  },
  {
    severity: 'MUST',
    name: 'Changes ship with tests',
    description: 'Every functional change includes tests covering it.',
    rationale: 'Tests are the regression safety net and the spec of intended behavior.',
    check: 'Feature changes have accompanying tests.',
  },
  {
    severity: 'SHOULD',
    name: 'Explicit error handling',
    description: 'Errors are handled explicitly at boundaries; no silent catch-all swallowing.',
    rationale: 'Swallowed errors hide failures until they surface as production incidents.',
    check: 'grep finds no empty `catch {}` or bare `except:` blocks.',
  },
  {
    severity: 'SHOULD',
    name: 'Documented public interfaces',
    description: 'Public interfaces have a brief description of intent and contract.',
    rationale: 'Undocumented contracts drift and get misused by callers.',
    check: 'Each exported interface has a preceding doc comment.',
  },
];

/** The surfaces that stay English whatever either zone's document language is. */
const CODE_SURFACES = 'code, identifiers, technical terms, and git commit messages';

/**
 * The Language Policy rule seeded into every Constitution by `prospec init`.
 *
 * Takes a resolved `LanguageScope` rather than bare language strings: the same
 * scope renders the agent entry config's declaration, so the two documents
 * cannot disagree about which paths follow which language (see
 * `lib/language-policy.ts`). The rule is stated by path so a verify audit can
 * decide by file location instead of re-interpreting what "AI-generated
 * documents" covers.
 *
 * Its form follows the two resolved languages. Both English → the condensed
 * single sentence. Both the same non-English language → one language over both
 * path sets. Different → the two-zone form, whose trust-zone clause names
 * `trustZoneLanguage`. No form hardcodes a trust-zone language; the two forms a
 * default project can reach (both English; English trust zone) render exactly
 * the pre-axis text, because `language-policy-drift` compares Constitutions
 * against this Description and a changed default would WARN every existing
 * project.
 */
export function languagePolicyRule(scope: LanguageScope): ConstitutionRule {
  const { language, trustZoneLanguage, nativePaths, trustZonePaths, namedExceptions, trustZoneExceptions } =
    scope;
  const trustZoneIsEnglish = isDefaultArtifactLanguage(trustZoneLanguage);

  if (sameLanguage(language, trustZoneLanguage)) {
    // One zone, so the exemption clauses would only add noise to a MUST rule the
    // owner has to read.
    if (trustZoneIsEnglish) {
      return {
        severity: 'MUST',
        name: 'Language Policy',
        description:
          'All generated documents, code, identifiers, technical terms, and git commit messages are written in English.',
        rationale:
          'One declared document language keeps generated artifacts consistent and reviewable; English code, terminology, and commit history follow industry convention.',
        check:
          'Generated documents, code, technical terms, and commit messages are in English.',
      };
    }
    return {
      severity: 'MUST',
      name: 'Language Policy',
      description: `All generated documents — change artifacts and their archived summaries (${formatPathList(nativePaths)}) and the trust zone (${formatPathList(trustZonePaths)}) — are written in ${language}; ${CODE_SURFACES} stay English.`,
      rationale: `The project owner reads both the change narrative and the trust zone in ${language}, while ${CODE_SURFACES} stay English so the project reads like the ecosystem it ships into. Both this rule and the agent entry config are generated from one resolved path set, so the two cannot drift into contradicting each other.`,
      check: `Files under ${formatPathList(nativePaths)} and ${formatPathList(trustZonePaths)} are written in ${language}; code, technical terms, and commit messages are in English.`,
    };
  }

  const exceptions = namedExceptions.map((e) => `  - ${e}`).join('\n');
  // The reverse direction, stated in the same rule: a change artifact may carry
  // text destined for the trust zone verbatim, and a MUST audit that has not been
  // told so reads that text as a violation of this very rule.
  const reverse = trustZoneExceptions.length === 0
    ? ''
    : `\n\nNamed exceptions inside the change-artifact zone, which stay **${trustZoneLanguage}** because their content is copied into the trust zone verbatim:\n${trustZoneExceptions.map((e) => `  - ${e}`).join('\n')}`;

  // An English trust zone shares its language with the code surfaces, so one
  // clause covers both; any other trust-zone language has to name them apart.
  const trustClause = trustZoneIsEnglish
    ? `always remains in ${trustZoneLanguage}, as do ${CODE_SURFACES}: it is technical reference read next to the code and cited in ${trustZoneLanguage}, and is **explicitly NOT** subject to the ${language} requirement`
    : `is written in ${trustZoneLanguage}, and is **explicitly NOT** subject to the ${language} requirement; ${CODE_SURFACES} stay English`;
  const rationaleTrust = trustZoneIsEnglish
    ? `while the trust zone stays ${trustZoneLanguage} so it reads like the code it documents and travels beyond this project`
    : `and reads the trust zone in ${trustZoneLanguage}, while ${CODE_SURFACES} stay English so the project reads like the ecosystem it ships into`;
  const checkTrust = trustZoneIsEnglish
    ? `${formatPathList(trustZonePaths)}, code, technical terms, and commit messages are in ${trustZoneLanguage}`
    : `${formatPathList(trustZonePaths)} are written in ${trustZoneLanguage}; code, technical terms, and commit messages are in English`;

  return {
    severity: 'MUST',
    name: 'Language Policy',
    description: `Change artifacts and their archived summaries — ${formatPathList(nativePaths)} — are written in ${language}. The trust zone — ${formatPathList(trustZonePaths)} — ${trustClause}. Named exceptions inside the trust zone, which MAY use ${language}:\n${exceptions}${reverse}`,
    rationale: `The project owner reviews their own change narrative in ${language}, ${rationaleTrust}. Both this rule and the agent entry config are generated from one resolved path set, so the two cannot drift into contradicting each other.`,
    check: `Files under ${formatPathList(nativePaths)} are written in ${language}; ${checkTrust}. The named exceptions above are NOT violations — in either direction — and an audit does NOT flag the ${trustZoneLanguage} trust zone as a Language-Policy violation.`,
  };
}

/**
 * Every rule name `prospec init` may seed — the stack example rules across all
 * stacks plus the always-seeded Language Policy. The single source the drift
 * engine subtracts from a parsed Constitution to decide whether any
 * project-authored principle remains (`constitution-severity`). Aggregating all
 * stacks is deliberate: a rule the owner kept verbatim from any starter set is
 * still boilerplate, and the Constitution does not record which stack seeded it.
 */
export const SEEDED_CONSTITUTION_RULE_NAMES: ReadonlySet<string> = new Set(
  [...PYTHON_RULES, ...TYPESCRIPT_RULES, ...GENERIC_RULES]
    .map((r) => r.name)
    .concat('Language Policy'),
);

/**
 * Return 3-5 starter Constitution rules appropriate to the detected stack.
 * Unknown or undetected languages fall back to language-neutral rules.
 */
export function exampleRulesFor(techStack: TechStackResult): ConstitutionRule[] {
  switch (techStack.language) {
    case 'python':
      return PYTHON_RULES;
    case 'typescript':
    case 'javascript':
      return TYPESCRIPT_RULES;
    default:
      return GENERIC_RULES;
  }
}
