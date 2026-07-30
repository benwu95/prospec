import { describe, it, expect } from 'vitest';
import {
  REVIEW_SEVERITIES,
  ReviewFindingSchema,
  ReviewFindingsInputSchema,
  VERIFY_DIMENSIONS,
  JUDGMENT_DIMENSION_NAMES,
  MACHINE_DIMENSION_NAMES,
  LESSON_KINDS,
  LessonInputSchema,
  VALIDATE_KINDS,
} from '../../../src/types/station.js';

describe('ReviewFindingSchema', () => {
  const base = {
    location: 'src/lib/foo.ts:42',
    severity: 'major',
    lens: 'correctness',
    summary: 'off-by-one in loop bound',
  };

  it('parses a minimal finding and defaults status to open', () => {
    const r = ReviewFindingSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe('open');
      expect(r.data.id).toBeUndefined();
    }
  });

  it('accepts an explicit id for cross-round identity', () => {
    const r = ReviewFindingSchema.safeParse({ ...base, id: 'F-001', status: 'fixed' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.id).toBe('F-001');
  });

  it('rejects an unknown severity — the max-merge needs a closed ordering', () => {
    expect(ReviewFindingSchema.safeParse({ ...base, severity: 'blocker' }).success).toBe(false);
  });

  it('rejects an empty location or summary', () => {
    expect(ReviewFindingSchema.safeParse({ ...base, location: '' }).success).toBe(false);
    expect(ReviewFindingSchema.safeParse({ ...base, summary: '' }).success).toBe(false);
  });

  it('severities are ordered weakest → strongest for index-based max', () => {
    expect(REVIEW_SEVERITIES).toEqual(['minor', 'major', 'critical']);
  });

  it('the findings payload is an array of findings', () => {
    expect(ReviewFindingsInputSchema.safeParse([base, { ...base, id: 'F-2' }]).success).toBe(true);
    expect(ReviewFindingsInputSchema.safeParse({ findings: [base] }).success).toBe(false);
  });
});

describe('VERIFY_DIMENSIONS registry', () => {
  it('registers the 5+1 dimensions with their adjudicators', () => {
    expect(VERIFY_DIMENSIONS.map((d) => d.name)).toEqual([
      'task-completion',
      'delta-spec-compliance',
      'constitution',
      'knowledge',
      'tests',
      'design',
    ]);
  });

  it('splits machine vs judgment names per the two-adjudicator contract', () => {
    expect(MACHINE_DIMENSION_NAMES).toEqual(['task-completion', 'knowledge', 'tests']);
    expect(JUDGMENT_DIMENSION_NAMES).toEqual(['delta-spec-compliance', 'constitution', 'design']);
  });
});

describe('LessonInputSchema', () => {
  const lesson = {
    key: 'fix/rework-misses-parallel-site',
    description: 'a fix must sweep its family of parallel sites',
    kind: 'playbook',
    source_change: 'enforce-metadata-schema',
  };

  it('parses a lesson and defaults impact_modules to empty', () => {
    const r = LessonInputSchema.safeParse(lesson);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.impact_modules).toEqual([]);
  });

  it('rejects an unknown kind — promotion routing is a closed set', () => {
    expect(LESSON_KINDS).toEqual(['convention', 'playbook', 'constitution']);
    expect(LessonInputSchema.safeParse({ ...lesson, kind: 'note' }).success).toBe(false);
  });

  it('rejects an empty key — the deterministic key is the upsert identity', () => {
    expect(LessonInputSchema.safeParse({ ...lesson, key: '' }).success).toBe(false);
  });
});

describe('VALIDATE_KINDS', () => {
  it('is the closed artifact-kind set the validate command grades', () => {
    expect(VALIDATE_KINDS).toEqual(['slug', 'backfill-draft', 'promote-scaffold', 'design-spec']);
  });
});
