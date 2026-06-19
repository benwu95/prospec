import { describe, it, expect } from 'vitest';
import { CHANGE_SCALES, ChangeMetadataSchema } from '../../../src/types/change.js';

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
