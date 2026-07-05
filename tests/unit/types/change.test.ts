import { describe, it, expect } from 'vitest';
import { CHANGE_SCALES, ChangeMetadataSchema, VERIFY_GRADES } from '../../../src/types/change.js';

const base = {
  name: 'x',
  created_at: '2026-06-07T00:00:00Z',
  status: 'plan' as const,
};

describe('ChangeMetadataSchema quality_log', () => {
  it('accepts metadata with a quality_log entry', () => {
    const r = ChangeMetadataSchema.safeParse({
      ...base,
      quality_log: [
        {
          skill: 'prospec-plan',
          date: '2026-06-07',
          result: 'WARN',
          warnings: ['TDD strategy not explicit'],
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.quality_log?.[0]?.result).toBe('WARN');
  });

  it('accepts metadata without quality_log (backward compatible)', () => {
    expect(ChangeMetadataSchema.safeParse(base).success).toBe(true);
  });

  it('validates a well-formed quality_log shape', () => {
    const r = ChangeMetadataSchema.safeParse({
      ...base,
      quality_log: [{ skill: 's', date: 'd', result: 'PASS', warnings: [] }],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.quality_log).toHaveLength(1);
  });

  it('accepts every lifecycle status including implemented', () => {
    for (const s of ['story', 'plan', 'tasks', 'implemented', 'verified', 'archived']) {
      expect(
        ChangeMetadataSchema.safeParse({ ...base, status: s }).success,
      ).toBe(true);
    }
  });

  it('rejects a result outside PASS/WARN/FAIL (no fourth state)', () => {
    const r = ChangeMetadataSchema.safeParse({
      ...base,
      quality_log: [{ skill: 's', date: 'd', result: 'INFO', warnings: [] }],
    });
    expect(r.success).toBe(false);
  });
});

describe('ChangeMetadataSchema scale (REQ-TYPES-026)', () => {
  it('exposes exactly the four scale levels (incl. promotion-time backfill)', () => {
    expect(CHANGE_SCALES).toEqual(['quick', 'standard', 'full', 'backfill']);
  });

  it('accepts each valid scale value', () => {
    for (const scale of CHANGE_SCALES) {
      const r = ChangeMetadataSchema.safeParse({ ...base, scale });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.scale).toBe(scale);
    }
  });

  it('rejects a scale outside the enum', () => {
    expect(
      ChangeMetadataSchema.safeParse({ ...base, scale: 'medium' }).success,
    ).toBe(false);
  });

  it('accepts metadata without scale (backward compatible, treated as standard)', () => {
    const r = ChangeMetadataSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.scale).toBeUndefined();
  });
});

describe('ChangeMetadataSchema quality_log structured fields (issue #61)', () => {
  it('accepts a verify entry carrying grade + dimensions', () => {
    const r = ChangeMetadataSchema.safeParse({
      ...base,
      status: 'verified',
      quality_log: [
        {
          skill: 'prospec-verify',
          date: '2026-07-05',
          result: 'PASS',
          warnings: [],
          grade: 'A',
          dimensions: [
            { name: 'tasks', result: 'PASS' },
            { name: 'spec-compliance', result: 'WARN' },
          ],
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.quality_log?.[0]?.grade).toBe('A');
      expect(r.data.quality_log?.[0]?.dimensions).toHaveLength(2);
    }
  });

  it('accepts a review entry carrying criticals/majors counts', () => {
    const r = ChangeMetadataSchema.safeParse({
      ...base,
      quality_log: [
        {
          skill: 'prospec-review',
          date: '2026-07-05',
          result: 'WARN',
          warnings: [],
          criticals_found: 2,
          criticals_fixed: 2,
          majors: 3,
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.quality_log?.[0]?.criticals_fixed).toBe(2);
  });

  it('accepts an entry omitting all structured fields (backward compatible)', () => {
    const r = ChangeMetadataSchema.safeParse({
      ...base,
      quality_log: [{ skill: 'prospec-plan', date: 'd', result: 'PASS', warnings: [] }],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.quality_log?.[0]?.grade).toBeUndefined();
      expect(r.data.quality_log?.[0]?.criticals_found).toBeUndefined();
    }
  });

  it('keeps result strictly PASS/WARN/FAIL — a grade never goes in result', () => {
    // The grade lives in `grade`; `result` must reject an S/A/B/C/D value.
    const r = ChangeMetadataSchema.safeParse({
      ...base,
      quality_log: [{ skill: 'prospec-verify', date: 'd', result: 'S', warnings: [] }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects a grade outside S/A/B/C/D', () => {
    expect(VERIFY_GRADES).toEqual(['S', 'A', 'B', 'C', 'D']);
    const r = ChangeMetadataSchema.safeParse({
      ...base,
      quality_log: [{ skill: 'prospec-verify', date: 'd', result: 'PASS', warnings: [], grade: 'E' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects a negative or non-integer critical count', () => {
    const r = ChangeMetadataSchema.safeParse({
      ...base,
      quality_log: [{ skill: 'prospec-review', date: 'd', result: 'PASS', warnings: [], criticals_found: -1 }],
    });
    expect(r.success).toBe(false);
    const fractional = ChangeMetadataSchema.safeParse({
      ...base,
      quality_log: [{ skill: 'prospec-review', date: 'd', result: 'PASS', warnings: [], majors: 1.5 }],
    });
    expect(fractional.success).toBe(false);
  });
});

describe('ChangeMetadataSchema introduced_by (escaped-defect registration, issue #61)', () => {
  it('accepts a change naming the change that introduced the defect', () => {
    const r = ChangeMetadataSchema.safeParse({ ...base, introduced_by: 'fix-init-clobber-add-upgrade' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.introduced_by).toBe('fix-init-clobber-add-upgrade');
  });

  it('accepts metadata without introduced_by (backward compatible)', () => {
    const r = ChangeMetadataSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.introduced_by).toBeUndefined();
  });
});
