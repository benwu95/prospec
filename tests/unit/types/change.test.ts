import { describe, it, expect } from 'vitest';
import { ChangeMetadataSchema } from '../../../src/types/change.js';

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
