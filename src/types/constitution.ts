/**
 * Constitution rule types.
 *
 * A Constitution rule carries an RFC-2119 severity so `/prospec-verify` can
 * grade violations by weight (MUST → FAIL, SHOULD → WARN, MAY → INFO) instead
 * of treating every principle equally.
 */

/** RFC-2119 severity for a Constitution rule. */
export type ConstitutionSeverity = 'MUST' | 'SHOULD' | 'MAY';

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
