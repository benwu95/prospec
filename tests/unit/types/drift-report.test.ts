import { describe, it, expect } from 'vitest';
import { DRIFT_CHECK_IDS, DriftReportSchema } from '../../../src/types/drift-report.js';
import { DriftReportInvalid } from '../../../src/types/errors.js';

const passingCheck = (id: string) => ({ id, status: 'pass' as const });

const baseReport = {
  version: 1,
  generated_at: '2026-06-12T00:00:00Z',
  structural: {
    checks: DRIFT_CHECK_IDS.map(passingCheck),
    findings: [],
  },
  semantic: { status: 'not-checked' as const },
  summary: { fail_count: 0, warn_count: 0, skipped_count: 0 },
};

describe('DriftReportSchema', () => {
  it('accepts a well-formed all-pass report', () => {
    expect(DriftReportSchema.safeParse(baseReport).success).toBe(true);
  });

  it('rejects a semantic layer claiming pass (must stay not-checked)', () => {
    const r = DriftReportSchema.safeParse({
      ...baseReport,
      semantic: { status: 'pass' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a skipped check without a reason', () => {
    const r = DriftReportSchema.safeParse({
      ...baseReport,
      structural: {
        ...baseReport.structural,
        checks: [
          ...DRIFT_CHECK_IDS.slice(1).map(passingCheck),
          { id: 'task-completion', status: 'skipped' },
        ],
      },
    });
    expect(r.success).toBe(false);
  });

  it('accepts a skipped check carrying a reason', () => {
    const r = DriftReportSchema.safeParse({
      ...baseReport,
      structural: {
        ...baseReport.structural,
        checks: [
          ...DRIFT_CHECK_IDS.slice(1).map(passingCheck),
          { id: 'task-completion', status: 'skipped', reason: 'source unavailable: .prospec/changes/ not found' },
        ],
      },
      summary: { fail_count: 0, warn_count: 0, skipped_count: 1 },
    });
    expect(r.success).toBe(true);
  });

  it('requires findings to carry check, severity, source_path and detail', () => {
    const r = DriftReportSchema.safeParse({
      ...baseReport,
      structural: {
        ...baseReport.structural,
        findings: [{ check: 'req-references', severity: 'fail', detail: 'dangling REQ-X-001' }],
      },
    });
    expect(r.success).toBe(false);

    const ok = DriftReportSchema.safeParse({
      ...baseReport,
      structural: {
        ...baseReport.structural,
        findings: [
          {
            check: 'req-references',
            severity: 'fail',
            source_path: 'prospec/index.md',
            line: 12,
            detail: 'dangling REQ-X-001',
          },
        ],
      },
      summary: { fail_count: 1, warn_count: 0, skipped_count: 0 },
    });
    expect(ok.success).toBe(true);
  });

  it('rejects a finding with severity pass or skipped (findings are warn/fail only)', () => {
    for (const severity of ['pass', 'skipped']) {
      const r = DriftReportSchema.safeParse({
        ...baseReport,
        structural: {
          ...baseReport.structural,
          findings: [
            { check: 'file-paths', severity, source_path: 'a.md', detail: 'x' },
          ],
        },
      });
      expect(r.success).toBe(false);
    }
  });

  it('locks the frozen knowledge health field contract', () => {
    const r = DriftReportSchema.safeParse({
      ...baseReport,
      structural: {
        ...baseReport.structural,
        knowledge_health: {
          modules: [
            {
              name: 'lib',
              last_src_commit: '2026-06-11T10:00:00Z',
              last_readme_commit: '2026-06-10T09:00:00Z',
              stale: true,
            },
            { name: 'cli', last_src_commit: '2026-06-01T00:00:00Z', last_readme_commit: null, stale: true },
          ],
          coverage: { documented: 5, total: 6 },
        },
      },
    });
    expect(r.success).toBe(true);

    // additive-only extension: a module carrying the sub-module timestamp parses,
    // and every pre-existing key keeps its name and meaning
    const withSubModule = DriftReportSchema.safeParse({
      ...baseReport,
      structural: {
        ...baseReport.structural,
        knowledge_health: {
          modules: [
            {
              name: 'templates',
              last_src_commit: '2026-06-11T10:00:00Z',
              last_readme_commit: '2026-06-10T09:00:00Z',
              last_sub_module_commit: '2026-06-12T09:00:00Z',
              stale: false,
            },
          ],
          coverage: { documented: 6, total: 6 },
        },
      },
    });
    expect(withSubModule.success).toBe(true);
    expect(
      withSubModule.success
        ? Object.keys(withSubModule.data.structural.knowledge_health!.modules[0]!)
        : [],
    ).toEqual(['name', 'last_src_commit', 'last_readme_commit', 'last_sub_module_commit', 'stale']);

    // absent, never null-filled: the key carries a real commit or is not there at all,
    // so a consumer never has to distinguish "no sub-module" from "unknown timestamp"
    const nullFilled = DriftReportSchema.safeParse({
      ...baseReport,
      structural: {
        ...baseReport.structural,
        knowledge_health: {
          modules: [
            {
              name: 'templates',
              last_src_commit: '2026-06-11T10:00:00Z',
              last_readme_commit: '2026-06-10T09:00:00Z',
              last_sub_module_commit: null,
              stale: true,
            },
          ],
          coverage: { documented: 6, total: 6 },
        },
      },
    });
    expect(nullFilled.success).toBe(false);

    const missingCoverage = DriftReportSchema.safeParse({
      ...baseReport,
      structural: {
        ...baseReport.structural,
        knowledge_health: { modules: [] },
      },
    });
    expect(missingCoverage.success).toBe(false);
  });

  it('exposes exactly the twenty-one frozen check ids', () => {
    expect([...DRIFT_CHECK_IDS].sort()).toEqual(
      [
        'artifact-language',
        'constitution-severity',
        'dangling-prefix',
        'delta-spec-landing-fidelity',
        'delta-spec-provenance',
        'feature-modules',
        'file-paths',
        'import-direction',
        'knowledge-health',
        'knowledge-size',
        'mcp-readme-counts',
        'metadata-completeness',
        'req-id-uniqueness',
        'req-references',
        'review-provenance',
        'spec-counters',
        'task-completion',
        'test-provenance',
        'unjustified-budget-override',
        'canonical-doc-drift',
        'language-policy-drift',
      ].sort(),
    );
    expect(DRIFT_CHECK_IDS).toHaveLength(21);
  });

  // The registry is FROZEN: report `checks[]` order and the CLI's status-line order
  // both derive from it, so the existing ids must keep their relative positions.
  // Asserted UNSORTED and literal — a sorted comparison cannot see a reorder.
  it('keeps the pre-existing eleven ids in their frozen order (additive-only growth)', () => {
    expect([...DRIFT_CHECK_IDS].slice(0, 11)).toEqual([
      'req-references',
      'file-paths',
      'import-direction',
      'knowledge-health',
      'task-completion',
      'dangling-prefix',
      'feature-modules',
      'mcp-readme-counts',
      'review-provenance',
      'metadata-completeness',
      'knowledge-size',
    ]);
    expect([...DRIFT_CHECK_IDS].slice(11)).toEqual([
      'test-provenance',
      'constitution-severity',
      'artifact-language',
      'spec-counters',
      'delta-spec-provenance',
      'unjustified-budget-override',
      'canonical-doc-drift',
      'delta-spec-landing-fidelity',
      'req-id-uniqueness',
      'language-policy-drift',
    ]);
  });

  it('accepts the optional constitution inventory, including an untagged rule', () => {
    const r = DriftReportSchema.safeParse({
      ...baseReport,
      structural: {
        ...baseReport.structural,
        constitution: {
          rules: [
            { name: 'Language Policy', severity: 'MUST', has_verify_hint: true, line: 10 },
            { name: 'Legacy rule', severity: null, has_verify_hint: false, line: 42 },
          ],
        },
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejects an unknown severity and a non-positive line in the inventory', () => {
    for (const rule of [
      { name: 'X', severity: 'CRITICAL', has_verify_hint: false, line: 3 },
      { name: 'X', severity: 'MUST', has_verify_hint: false, line: 0 },
      { name: '', severity: 'MUST', has_verify_hint: false, line: 3 },
    ]) {
      const r = DriftReportSchema.safeParse({
        ...baseReport,
        structural: { ...baseReport.structural, constitution: { rules: [rule] } },
      });
      expect(r.success, JSON.stringify(rule)).toBe(false);
    }
  });

  it('stays valid without the constitution section (absent = no facts, not all-tagged)', () => {
    expect(DriftReportSchema.safeParse(baseReport).success).toBe(true);
  });

  it('rejects an unknown check id', () => {
    const r = DriftReportSchema.safeParse({
      ...baseReport,
      structural: {
        ...baseReport.structural,
        checks: [...DRIFT_CHECK_IDS.map(passingCheck), { id: 'vibes', status: 'pass' }],
      },
    });
    expect(r.success).toBe(false);
  });
});

describe('knowledge_size structured finding field (REQ-TYPES-083)', () => {
  const withField = (knowledge_size: unknown) =>
    DriftReportSchema.safeParse({
      ...baseReport,
      structural: {
        ...baseReport.structural,
        findings: [
          {
            check: 'knowledge-size',
            severity: 'warn',
            source_path: 'prospec/index.md',
            detail: 'L1 file over token budget: 3118 tokens',
            knowledge_size,
          },
        ],
      },
      summary: { fail_count: 0, warn_count: 1, skipped_count: 0 },
    });

  const overFacts = {
    surface: 'L1 file',
    budget_key: 'l1_per_file',
    budget: 1500,
    actual: 3118,
    unit: 'tokens',
    tier: 'over',
    remedy: 'trim it, or move detail down into the L2 file that owns it',
  };

  it('accepts a knowledge-size finding carrying the structured facts', () => {
    const r = withField(overFacts);
    expect(r.success).toBe(true);
    expect(r.success ? r.data.structural.findings[0]!.knowledge_size : null).toEqual(overFacts);
  });

  it('accepts the headroom tier with no remedy (remedy is optional)', () => {
    const headroom = {
      surface: 'L1 file',
      budget_key: 'l1_per_file',
      budget: 1500,
      actual: 1276,
      unit: 'tokens',
      tier: 'headroom',
    };
    expect(withField(headroom).success).toBe(true);
  });

  it('is optional and additive — a finding without it still validates', () => {
    const r = DriftReportSchema.safeParse({
      ...baseReport,
      structural: {
        ...baseReport.structural,
        findings: [{ check: 'req-references', severity: 'fail', source_path: 'a.md', detail: 'x' }],
      },
      summary: { fail_count: 1, warn_count: 0, skipped_count: 0 },
    });
    expect(r.success).toBe(true);
    expect(r.success ? r.data.structural.findings[0]!.knowledge_size : 'MISSING').toBeUndefined();
  });

  it('rejects an unknown tier or unit, and a missing required sub-field', () => {
    expect(withField({ ...overFacts, tier: 'exceeded' }).success).toBe(false);
    expect(withField({ ...overFacts, unit: 'bytes' }).success).toBe(false);
    const noBudgetKey = {
      surface: 'L1 file',
      budget: 1500,
      actual: 3118,
      unit: 'tokens',
      tier: 'over',
    };
    expect(withField(noBudgetKey).success).toBe(false);
  });
});

describe('DriftReportInvalid', () => {
  it('carries code and an actionable suggestion', () => {
    const err = new DriftReportInvalid('prospec-report.json', 'semantic.status invalid');
    expect(err.code).toBe('DRIFT_REPORT_INVALID');
    expect(err.suggestion).toBe(
      'Regenerate the report with `prospec check --json` — do not edit it by hand',
    );
    expect(err.message).toContain('prospec-report.json');
  });
});

describe('snapshot trace compatibility', () => {
  it('retains versioned snapshot diagnostics without changing check order', () => {
    const trace = { fingerprint_version: 'snapshot-v2', scope: 'repository-inputs-v2', head: 'abc', reason: 'unreadable' };
    const report = DriftReportSchema.parse({ ...baseReport, snapshot: trace });
    expect(report).toHaveProperty('snapshot', trace);
    expect(report.structural.checks.map((c) => c.id)).toEqual(DRIFT_CHECK_IDS);
  });
});
