import type { TechStackResult } from './detector.js';
import type { ConstitutionRule } from '../types/constitution.js';

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
