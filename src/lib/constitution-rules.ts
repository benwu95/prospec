import type { TechStackResult } from './detector.js';
import type { ConstitutionRule, LanguageScope } from '../types/constitution.js';
import { isDefaultArtifactLanguage } from './config.js';
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

/**
 * The Language Policy rule seeded into every Constitution by `prospec init`.
 *
 * Takes a resolved `LanguageScope` rather than a bare language string: the same
 * scope renders the agent entry config's declaration, so the two documents
 * cannot disagree about which paths are English (see `lib/language-policy.ts`).
 * The rule is stated by path so a verify audit can decide by file location
 * instead of re-interpreting what "AI-generated documents" covers.
 */
export function languagePolicyRule(scope: LanguageScope): ConstitutionRule {
  const { language, nativePaths, englishPaths, namedExceptions } = scope;

  // An English project has one zone, so the exemption clauses would only add
  // noise to a MUST rule the owner has to read.
  if (isDefaultArtifactLanguage(language)) {
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

  const exceptions = namedExceptions.map((e) => `  - ${e}`).join('\n');

  return {
    severity: 'MUST',
    name: 'Language Policy',
    description: `Change artifacts and their archived summaries — ${formatPathList(nativePaths)} — are written in ${language}. The trust zone — ${formatPathList(englishPaths)} — always remains in English, as do code, identifiers, technical terms, and git commit messages: it is technical reference read next to the code and cited in English, and is **explicitly NOT** subject to the ${language} requirement. Named exceptions inside the trust zone, which MAY use ${language}:\n${exceptions}`,
    rationale: `The project owner reviews their own change narrative in ${language}, while the trust zone stays English so it reads like the code it documents and travels beyond this project. Both this rule and the agent entry config are generated from one resolved path set, so the two cannot drift into contradicting each other.`,
    check: `Files under ${formatPathList(nativePaths)} are written in ${language}; ${formatPathList(englishPaths)}, code, technical terms, and commit messages are in English. The named exceptions above are NOT violations, and an audit does NOT flag the English trust zone as a Language-Policy violation.`,
  };
}

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
