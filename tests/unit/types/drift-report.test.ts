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
            source_path: 'prospec/ai-knowledge/_index.md',
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

    const missingCoverage = DriftReportSchema.safeParse({
      ...baseReport,
      structural: {
        ...baseReport.structural,
        knowledge_health: { modules: [] },
      },
    });
    expect(missingCoverage.success).toBe(false);
  });

  it('exposes exactly the five frozen check ids', () => {
    expect([...DRIFT_CHECK_IDS].sort()).toEqual(
      ['file-paths', 'import-direction', 'knowledge-health', 'req-references', 'task-completion'].sort(),
    );
    expect(DRIFT_CHECK_IDS).toHaveLength(5);
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
