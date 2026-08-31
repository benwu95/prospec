/**
 * Constitution rule types.
 *
 * A Constitution rule carries an RFC-2119 severity so `prospec-verify` can
 * grade violations by weight (MUST → FAIL, SHOULD → WARN, MAY → INFO) instead
 * of treating every principle equally.
 */

/** RFC-2119 severity for a Constitution rule. */
export type ConstitutionSeverity = 'MUST' | 'SHOULD' | 'MAY';

/**
 * Resolved language scope for the seeded Language Policy rule.
 *
 * The path sets are the single source shared by the Constitution rule and the
 * agent entry config (CLAUDE.md/AGENTS.md): both are generated from one
 * `LanguageScope`, so the two documents cannot declare contradictory scopes.
 * Paths are repo-relative POSIX globs resolved from `paths.base_dir` and
 * `knowledge.base_path` — never hardcoded defaults.
 */
export interface LanguageScope {
  /** Resolved artifact language (free-form; 'English' when unset/blank). */
  language: string;
  /** Paths written in `language` — change artifacts and their archived summaries. */
  nativePaths: string[];
  /** Trust-zone paths that stay English regardless of `language`. */
  englishPaths: string[];
  /** Trust-zone spots where `language` is allowed, each with its reason. */
  namedExceptions: string[];
  /**
   * The reverse exceptions: spots inside `nativePaths` that stay English, each
   * with its reason. A change artifact may carry text destined for the trust zone
   * verbatim, and the rule must say so — otherwise a MUST audit reads that text as
   * a violation of the very rule that requires it.
   */
  englishExceptions: string[];
}

/** A single guided Constitution rule. */
export interface ConstitutionRule {
  /** RFC-2119 weight; drives verify's FAIL/WARN/INFO grading. */
  severity: ConstitutionSeverity;
  /** Short rule name (becomes the principle heading). */
  name: string;
  /** What the rule requires. */
  description: string;
  /** Why the rule matters. */
  rationale: string;
  /** How to verify compliance — a hint for verify; mechanical where possible. */
  check?: string;
}
