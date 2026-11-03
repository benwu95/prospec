import { describe, it, expect } from 'vitest';
import { auditConstitution, assessConstitutionApplicability, isLegalCheckId } from '../../../src/lib/constitution-audit.js';
import { DRIFT_CHECK_IDS, type ConstitutionRuleEntry } from '../../../src/types/drift-report.js';
import type { ConstitutionRuleJudgment } from '../../../src/types/station.js';

describe('proven-backfill Constitution applicability', () => {
  const rules: ConstitutionRuleEntry[] = [
    { name: 'Legacy layering', severity: 'MUST', has_verify_hint: true, line: 1, check_id: 'import-direction' },
    { name: 'Artifact integrity', severity: 'MUST', has_verify_hint: true, line: 2 },
  ];
  const debt: ConstitutionRuleJudgment = { name: 'Legacy layering', result: 'FAIL',
    applicability: 'pre-existing-code', statement: 'src/legacy.ts is unchanged; new artifacts comply.' };
  const artifact: ConstitutionRuleJudgment = { name: 'Artifact integrity', result: 'PASS', statement: 'No invented intent.' };
  const assess = (graderEntries: ConstitutionRuleJudgment[], provenBackfill = true) =>
    assessConstitutionApplicability({ rules, graderEntries, provenBackfill });

  it('selects only explicitly evidenced debt while preserving the raw rule verdict', () => {
    expect(assess([debt, artifact])).toEqual({ informationalRules: ['Legacy layering'], errors: [] });
    expect(debt.result).toBe('FAIL');
    expect(assess([{ ...debt, applicability: undefined }, artifact])).toEqual({ informationalRules: [], errors: [] });
  });

  it('does not grant debt applicability without proven backfill provenance', () => {
    expect(assess([debt, artifact], false).errors).toEqual([expect.stringContaining('proven backfill')]);
  });

  it('keeps legacy partial judgments admissible when no debt exemption is claimed', () => {
    expect(assess([], false)).toEqual({ informationalRules: [], errors: [] });
  });

  it('records evidenced WARN debt without changing the supplied verdict', () => {
    expect(assess([{ ...debt, result: 'WARN' }, artifact]).informationalRules).toEqual(['Legacy layering']);
  });

  it('refuses debt classifications against an ambiguous source rule inventory', () => {
    const result = assessConstitutionApplicability({ rules: [...rules, rules[0]!], graderEntries: [debt, artifact], provenBackfill: true });
    expect(result.informationalRules).toEqual([]);
    expect(result.errors).toEqual([expect.stringContaining('must be unique')]);
  });

  it.each([
    { entries: [debt] },
    { entries: [debt, artifact, artifact] },
    { entries: [debt, { ...artifact, name: 'Unknown rule' }] },
  ])('requires complete, unique, known rule coverage: %j', ({ entries }) => {
    expect(assess(entries).errors.length).toBeGreaterThan(0);
    expect(assess(entries).informationalRules).toEqual([]);
  });
});

describe('constitution-audit (REQ-LIB-083)', () => {
  const sampleRules: ConstitutionRuleEntry[] = [
    {
      name: 'Language Policy',
      severity: 'MUST',
      has_verify_hint: true,
      line: 10,
      check_id: 'language-policy-drift',
      coverage: 'change artifacts only',
    },
    {
      name: 'One-way Dependency',
      severity: 'MUST',
      has_verify_hint: true,
      line: 20,
      check_id: 'import-direction',
    },
    {
      name: 'TDD',
      severity: 'MUST',
      has_verify_hint: true,
      line: 30,
      check_id: 'test-provenance',
    },
    {
      name: 'User Stories Follow INVEST',
      severity: 'MUST',
      has_verify_hint: true,
      line: 40,
    },
    {
      name: 'Atomic Commits',
      severity: 'MUST',
      has_verify_hint: false,
      line: 50,
    },
  ];

  describe('machine verdict filling from resolveStatus', () => {
    it('fills PASS, WARN, FAIL from resolveStatus', () => {
      const statuses: Record<string, string> = {
        'language-policy-drift': 'pass',
        'import-direction': 'warn',
        'test-provenance': 'fail',
      };
      const result = auditConstitution({
        rules: sampleRules,
        resolveStatus: (checkId) => statuses[checkId] ?? 'skipped',
      });

      expect(result.machineLedger).toEqual([
        {
          rule_name: 'Language Policy',
          check_id: 'language-policy-drift',
          coverage: 'change artifacts only',
          verdict: 'PASS',
        },
        {
          rule_name: 'One-way Dependency',
          check_id: 'import-direction',
          coverage: undefined,
          verdict: 'WARN',
        },
        {
          rule_name: 'TDD',
          check_id: 'test-provenance',
          coverage: undefined,
          verdict: 'FAIL',
        },
      ]);
    });

    it('maps skipped and unprovable to not-adjudicated (never PASS)', () => {
      const statuses: Record<string, string> = {
        'language-policy-drift': 'skipped',
        'import-direction': 'unprovable',
        'test-provenance': 'unknown-status',
      };
      const result = auditConstitution({
        rules: sampleRules,
        resolveStatus: (checkId) => statuses[checkId] ?? 'skipped',
      });

      expect(result.machineLedger.map((e) => [e.rule_name, e.verdict])).toEqual([
        ['Language Policy', 'not-adjudicated'],
        ['One-way Dependency', 'not-adjudicated'],
        ['TDD', 'not-adjudicated'],
      ]);
    });
  });

  describe('statement threshold calculation', () => {
    it('computes threshold as: (no check_id rules) + (declared rules with covers) + (declared rules not-adjudicated)', () => {
      // sampleRules has:
      // - 2 rules without check_id (INVEST, Atomic Commits)
      // - 1 declared rule with covers (Language Policy, pass)
      // - 1 declared rule without covers (One-way Dependency, pass)
      // - 1 declared rule without covers (TDD, skipped -> not-adjudicated)
      // Expected threshold = 2 + 1 + 1 = 4.
      const statuses: Record<string, string> = {
        'language-policy-drift': 'pass',
        'import-direction': 'pass',
        'test-provenance': 'skipped',
      };
      const result = auditConstitution({
        rules: sampleRules,
        resolveStatus: (checkId) => statuses[checkId] ?? 'skipped',
      });

      expect(result.requiredStatements).toEqual([
        'Atomic Commits',
        'Language Policy',
        'TDD',
        'User Stories Follow INVEST',
      ]);
    });

    it('computes required statements when all declared checks pass and have no covers', () => {
      const rules: ConstitutionRuleEntry[] = [
        { name: 'R1', severity: 'MUST', has_verify_hint: true, line: 10, check_id: 'c1' },
        { name: 'R2', severity: 'MUST', has_verify_hint: true, line: 20 },
      ];
      const result = auditConstitution({
        rules,
        resolveStatus: () => 'pass',
      });
      // R1 has check_id and no covers and passes -> not required
      // R2 has no check_id -> required
      expect(result.requiredStatements).toEqual(['R2']);
    });

    it('charges a rule that is both covers-bearing AND not-adjudicated exactly once', () => {
      const rules: ConstitutionRuleEntry[] = [
        {
          name: 'Partial-and-skipped',
          severity: 'MUST',
          has_verify_hint: true,
          line: 10,
          check_id: 'language-policy-drift',
          coverage: 'only part of the rule',
        },
      ];
      const result = auditConstitution({
        rules,
        resolveStatus: () => 'skipped', // -> not-adjudicated
      });
      // covers + not-adjudicated must not double-count: exactly one required statement
      expect(result.requiredStatements).toEqual(['Partial-and-skipped']);
    });
  });

  describe('anti-flip validation', () => {
    it('allows grader to report identical verdict or add WARN over machine PASS', () => {
      const statuses: Record<string, string> = {
        'language-policy-drift': 'pass',
        'import-direction': 'pass',
        'test-provenance': 'warn',
      };
      const result = auditConstitution({
        rules: sampleRules,
        resolveStatus: (checkId) => statuses[checkId] ?? 'skipped',
        graderEntries: [
          // machine PASS -> grader adds WARN (allowed!)
          { name: 'Language Policy', result: 'WARN', statement: 'Extra note' },
          // machine PASS -> grader keeps PASS (allowed!)
          { name: 'One-way Dependency', result: 'PASS' },
          // machine WARN -> grader keeps WARN (allowed!)
          { name: 'TDD', result: 'WARN' },
          // undeclared rule -> grader can report any result (allowed!)
          { name: 'User Stories Follow INVEST', result: 'FAIL', statement: 'Violated INVEST' },
        ],
      });

      expect(result.violations).toEqual([]);
    });

    it('reports violation when grader flips PASS to FAIL on a declared rule', () => {
      const result = auditConstitution({
        rules: sampleRules,
        resolveStatus: () => 'pass',
        graderEntries: [
          { name: 'One-way Dependency', result: 'FAIL', statement: 'Flipped' },
        ],
      });

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.rule_name).toBe('One-way Dependency');
      expect(result.violations[0]?.machine_verdict).toBe('PASS');
      expect(result.violations[0]?.grader_result).toBe('FAIL');
    });

    it('reports violation when grader flips WARN to PASS on a declared rule', () => {
      const result = auditConstitution({
        rules: sampleRules,
        resolveStatus: () => 'warn',
        graderEntries: [
          { name: 'One-way Dependency', result: 'PASS', statement: 'Overturned' },
        ],
      });

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.rule_name).toBe('One-way Dependency');
      expect(result.violations[0]?.machine_verdict).toBe('WARN');
      expect(result.violations[0]?.grader_result).toBe('PASS');
    });

    it('reports violation when grader flips FAIL to PASS or WARN on a declared rule', () => {
      const result = auditConstitution({
        rules: sampleRules,
        resolveStatus: () => 'fail',
        graderEntries: [
          { name: 'One-way Dependency', result: 'PASS' },
          { name: 'TDD', result: 'WARN' },
        ],
      });

      expect(result.violations).toHaveLength(2);
      expect(result.violations.map((v) => [v.rule_name, v.grader_result])).toEqual([
        ['One-way Dependency', 'PASS'],
        ['TDD', 'WARN'],
      ]);
    });

    it('reports violation when grader reports FAIL on a machine WARN declared rule', () => {
      const result = auditConstitution({
        rules: sampleRules,
        resolveStatus: () => 'warn',
        graderEntries: [
          { name: 'One-way Dependency', result: 'FAIL' },
        ],
      });

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.grader_result).toBe('FAIL');
    });

    it('reports violation when grader flips not-adjudicated to PASS or FAIL', () => {
      const result = auditConstitution({
        rules: sampleRules,
        resolveStatus: () => 'skipped',
        graderEntries: [
          { name: 'One-way Dependency', result: 'PASS' },
        ],
      });

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.machine_verdict).toBe('not-adjudicated');
      expect(result.violations[0]?.grader_result).toBe('PASS');
    });

    it('sorts violations by rule_name in codepoint order', () => {
      const result = auditConstitution({
        rules: sampleRules,
        resolveStatus: () => 'fail',
        graderEntries: [
          { name: 'TDD', result: 'PASS' },
          { name: 'Language Policy', result: 'PASS' },
        ],
      });

      expect(result.violations.map((v) => v.rule_name)).toEqual([
        'Language Policy',
        'TDD',
      ]);
    });
  });

  describe('isLegalCheckId', () => {
    it('recognizes every member of DRIFT_CHECK_IDS as legal', () => {
      for (const id of DRIFT_CHECK_IDS) {
        expect(isLegalCheckId(id)).toBe(true);
      }
    });

    it('rejects any id that is not a DRIFT_CHECK_IDS member, including pnpm/CI gates', () => {
      expect(isLegalCheckId('unknown-check')).toBe(false);
      expect(isLegalCheckId('')).toBe(false);
      // pnpm/CI gates verify cannot run at verify time are not legal declarations
      expect(isLegalCheckId('counts:check')).toBe(false);
      expect(isLegalCheckId('agents:check')).toBe(false);
      expect(isLegalCheckId('typecheck')).toBe(false);
      expect(isLegalCheckId('counts:unknown')).toBe(false);
    });
  });
});
