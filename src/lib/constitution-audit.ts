import { DRIFT_CHECK_IDS, type ConstitutionRuleEntry } from '../types/drift-report.js';
import { mapCheckStatusToVerdict, type MachineVerdict } from './change-gate.js';
import type { ConstitutionRuleJudgment } from '../types/station.js';

const LEGAL_CHECK_ID_SET = new Set<string>(DRIFT_CHECK_IDS);

/**
 * Returns whether a check id is legal to declare on a Constitution rule: a member
 * of `DRIFT_CHECK_IDS`, the checks `prospec check` actually runs at verify time.
 * A check that verify cannot run (a pnpm/CI gate) would only ever resolve to
 * `not-adjudicated`, so declaring it buys nothing and is not admitted (REQ-LIB-083).
 */
export function isLegalCheckId(id: string): boolean {
  return LEGAL_CHECK_ID_SET.has(id);
}

export type { MachineVerdict };

export interface ConstitutionMachineLedgerEntry {
  rule_name: string;
  check_id: string;
  coverage?: string;
  verdict: MachineVerdict;
}

export interface ConstitutionAuditViolation {
  rule_name: string;
  check_id: string;
  machine_verdict: string;
  grader_result: string;
  reason: string;
}

export interface AuditConstitutionOptions {
  rules: readonly ConstitutionRuleEntry[];
  /** A declared check's per-change status, as `adjudicateChangeCheck(...).status`. */
  resolveStatus: (checkId: string) => string;
  graderEntries?: readonly ConstitutionRuleJudgment[];
}

export interface ConstitutionAuditResult {
  machineLedger: ConstitutionMachineLedgerEntry[];
  /**
   * The de-duplicated rule NAMES the grader must supply a non-empty statement for:
   * rules with no `check_id`, declared rules carrying a `covers:` clause (a coverage
   * gap the grader audits), and declared rules whose check is `not-adjudicated`
   * (the machine could not grade it). A rule that qualifies on several counts still
   * appears once, so it is never double-charged.
   */
  requiredStatements: string[];
  violations: ConstitutionAuditViolation[];
}

/**
 * Pure engine for Constitution verification audit (REQ-LIB-083).
 *
 * Slices the machine half of verify 3/5:
 * 1. Fills machine verdicts from resolveStatus for declared rules (skipped/unprovable -> not-adjudicated)
 * 2. Computes the SET of rule names the grader must write a statement for (no check_id, coverage gap, or not-adjudicated) — de-duplicated
 * 3. Enforces anti-flip discipline: grader may only keep the machine verdict or add WARN over a machine PASS
 */
export function auditConstitution(options: AuditConstitutionOptions): ConstitutionAuditResult {
  const { rules, resolveStatus, graderEntries = [] } = options;

  const machineLedger: ConstitutionMachineLedgerEntry[] = [];
  const ruleMachineVerdict = new Map<string, MachineVerdict>();
  const declaredRuleMap = new Map<string, ConstitutionRuleEntry>();
  const requiredStatementSet = new Set<string>();

  for (const rule of rules) {
    const hasCovers = rule.coverage !== undefined && rule.coverage.trim().length > 0;

    if (!rule.check_id) {
      requiredStatementSet.add(rule.name);
      continue;
    }

    declaredRuleMap.set(rule.name, rule);
    const verdict = mapCheckStatusToVerdict(resolveStatus(rule.check_id));
    ruleMachineVerdict.set(rule.name, verdict);
    machineLedger.push({
      rule_name: rule.name,
      check_id: rule.check_id,
      ...(hasCovers ? { coverage: rule.coverage!.trim() } : {}),
      verdict,
    });

    // A declared rule needs a grader statement when it declares a partial-coverage
    // gap, or when its check could not be adjudicated (the grader audits it whole).
    // The Set keys by rule name, so a rule that is both is charged exactly once.
    if (hasCovers || verdict === 'not-adjudicated') {
      requiredStatementSet.add(rule.name);
    }
  }

  // Grader entries anti-flip check for declared rules:
  // result is only permitted in { machine verdict } ∪ { WARN (when machine === PASS) }
  const violations: ConstitutionAuditViolation[] = [];
  for (const graderEntry of graderEntries) {
    const declaredRule = declaredRuleMap.get(graderEntry.name);
    if (!declaredRule || !declaredRule.check_id) {
      // Undeclared rules are graded by human judgment without anti-flip constraint
      continue;
    }

    const machineVerdict = ruleMachineVerdict.get(graderEntry.name) ?? 'not-adjudicated';
    const graderResult = graderEntry.result;

    const isIdentical = graderResult === machineVerdict;
    const isAddWarnOverPass = machineVerdict === 'PASS' && graderResult === 'WARN';

    if (!isIdentical && !isAddWarnOverPass) {
      violations.push({
        rule_name: graderEntry.name,
        check_id: declaredRule.check_id,
        machine_verdict: machineVerdict,
        grader_result: graderResult,
        reason: `grader reported "${graderResult}" for declared rule "${graderEntry.name}" whose machine verdict is "${machineVerdict}" — only identical verdict or WARN over PASS is permitted`,
      });
    }
  }

  // Codepoint sort violations by rule_name
  violations.sort((a, b) => (a.rule_name < b.rule_name ? -1 : a.rule_name > b.rule_name ? 1 : 0));

  return {
    machineLedger,
    requiredStatements: [...requiredStatementSet].sort(),
    violations,
  };
}
