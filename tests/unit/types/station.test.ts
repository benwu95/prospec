import { describe, it, expect } from 'vitest';
import {
  REVIEW_SEVERITIES,
  RELAYED_FIELD_MAX_CHARS,
  ReviewFindingSchema,
  ReviewFindingsInputSchema,
  VERIFY_DIMENSIONS,
  JUDGMENT_DIMENSION_NAMES,
  MACHINE_DIMENSION_NAMES,
  JudgmentDimensionInputSchema,
  JudgmentDimensionsInputSchema,
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

describe('RELAYED_FIELD_MAX_CHARS', () => {
  const base = {
    id: 'F-1',
    location: 'src/lib/foo.ts:42',
    severity: 'major' as const,
    lens: 'correctness',
    summary: 'off-by-one in loop bound',
  };

  // Version-controlled baseline. Every field rendered OUTSIDE a table cell — the
  // digest lines and the evidence-block anchor — must be in here: the first
  // version of this set omitted `id` and `lens`, and both turned out to be
  // forgeable (a newline in `lens` mints a digest line carrying a `repro:` the
  // loop is told to run; a newline in `id` mints a second block under another
  // finding's anchor). Adding a relayed field is a deliberate act that touches
  // this list AND the reference's ceiling table.
  it('is the closed set of relayed fields — evidence is deliberately absent', () => {
    expect(Object.keys(RELAYED_FIELD_MAX_CHARS).sort()).toEqual([
      'id',
      'lens',
      'location',
      'repro',
      'summary',
    ]);
    expect(RELAYED_FIELD_MAX_CHARS).not.toHaveProperty('evidence');
  });

  it.each(Object.keys(RELAYED_FIELD_MAX_CHARS) as Array<keyof typeof RELAYED_FIELD_MAX_CHARS>)(
    'rejects a %s one character past its ceiling and accepts it at the ceiling',
    (field) => {
      const ceiling = RELAYED_FIELD_MAX_CHARS[field];
      const at = { ...base, repro: 'pnpm test', [field]: 'x'.repeat(ceiling) };
      const past = { ...base, repro: 'pnpm test', [field]: 'x'.repeat(ceiling + 1) };
      expect(ReviewFindingSchema.safeParse(at).success).toBe(true);
      const rejected = ReviewFindingSchema.safeParse(past);
      expect(rejected.success).toBe(false);
      if (!rejected.success) {
        expect(rejected.error.issues.some((i) => i.path.join('.') === field)).toBe(true);
      }
    },
  );

  it.each(Object.keys(RELAYED_FIELD_MAX_CHARS) as Array<keyof typeof RELAYED_FIELD_MAX_CHARS>)(
    'refuses a line break in %s — it is rendered as a cell or as a raw line',
    (field) => {
      const r = ReviewFindingSchema.safeParse({
        ...base,
        repro: 'pnpm test',
        [field]: 'first line\nsecond line',
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues.some((i) => i.path.join('.') === field)).toBe(true);
      }
    },
  );

  it('accepts a line break in evidence — it is prose, not a cell', () => {
    expect(
      ReviewFindingSchema.safeParse({ ...base, evidence: 'first\n\nsecond' }).success,
    ).toBe(true);
  });

  it('accepts evidence far past every ceiling — it never enters a return payload', () => {
    const evidence = 'e'.repeat(Math.max(...Object.values(RELAYED_FIELD_MAX_CHARS)) * 20);
    const r = ReviewFindingSchema.safeParse({ ...base, evidence });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.evidence).toHaveLength(evidence.length);
  });
});

describe('ReviewFindingSchema cross-field rules', () => {
  const critical = {
    id: 'F-1',
    location: 'src/lib/foo.ts:42',
    severity: 'critical' as const,
    lens: 'correctness',
    summary: 'off-by-one in loop bound',
  };

  it('requires repro on a critical — the orchestrator verifies by running, not by reading', () => {
    const r = ReviewFindingSchema.safeParse(critical);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'repro')).toBe(true);
    }
    expect(ReviewFindingSchema.safeParse({ ...critical, repro: 'pnpm vitest run x' }).success).toBe(
      true,
    );
  });

  it('does not require repro below critical', () => {
    expect(ReviewFindingSchema.safeParse({ ...critical, severity: 'major' }).success).toBe(true);
    expect(ReviewFindingSchema.safeParse({ ...critical, severity: 'minor' }).success).toBe(true);
  });

  it.each(['repro', 'evidence'] as const)('requires id when %s is present', (field) => {
    const withoutId = {
      location: critical.location,
      severity: 'major' as const,
      lens: critical.lens,
      summary: critical.summary,
    };
    const r = ReviewFindingSchema.safeParse({ ...withoutId, [field]: 'value' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'id')).toBe(true);
    }
    expect(ReviewFindingSchema.safeParse({ ...withoutId, id: 'F-1', [field]: 'value' }).success).toBe(
      true,
    );
  });
});

describe('JudgmentDimensionsInputSchema', () => {
  const dimension = {
    name: 'delta-spec-compliance',
    result: 'PASS' as const,
    graded_by: 'fresh-subagent' as const,
  };

  it('parses a bare verdict — evidence and repro are optional', () => {
    const r = JudgmentDimensionInputSchema.safeParse(dimension);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.evidence).toBeUndefined();
      expect(r.data.repro).toBeUndefined();
    }
  });

  it('requires graded_by and constrains it to the two-value enum (issue #203)', () => {
    const noContext = { name: dimension.name, result: dimension.result };
    expect(JudgmentDimensionInputSchema.safeParse(noContext).success).toBe(false);
    expect(JudgmentDimensionInputSchema.safeParse({ ...dimension, graded_by: 'in-session' }).success).toBe(true);
    expect(JudgmentDimensionInputSchema.safeParse({ ...dimension, graded_by: 'myself' }).success).toBe(false);
  });

  it('accepts optional executor (non-empty string) and spend (non-negative int)', () => {
    const r = JudgmentDimensionInputSchema.safeParse({ ...dimension, executor: 'fresh subagent', spend: 12000 });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.executor).toBe('fresh subagent');
      expect(r.data.spend).toBe(12000);
    }
    expect(JudgmentDimensionInputSchema.safeParse({ ...dimension, spend: -1 }).success).toBe(false);
    expect(JudgmentDimensionInputSchema.safeParse({ ...dimension, executor: '' }).success).toBe(false);
    // rendered as one line by `learn stats` — a line break is refused at the schema layer
    expect(JudgmentDimensionInputSchema.safeParse({ ...dimension, executor: 'jud\nge' }).success).toBe(false);
  });

  it('accepts the non-adjudicated dimension results verify reports', () => {
    expect(
      JudgmentDimensionInputSchema.safeParse({ ...dimension, result: 'not-applicable' }).success,
    ).toBe(true);
    expect(JudgmentDimensionInputSchema.safeParse({ ...dimension, result: 'ok' }).success).toBe(
      false,
    );
  });

  it('shares the finding ceilings rather than declaring its own', () => {
    const past = { ...dimension, summary: 's'.repeat(RELAYED_FIELD_MAX_CHARS.summary + 1) };
    expect(JudgmentDimensionInputSchema.safeParse(past).success).toBe(false);
    const evidence = 'e'.repeat(RELAYED_FIELD_MAX_CHARS.summary * 20);
    expect(JudgmentDimensionInputSchema.safeParse({ ...dimension, evidence }).success).toBe(true);
  });

  it('refuses an over-long name under its OWN name, not the ceiling it borrows', () => {
    // `name` shares the `id` ceiling because it plays the same structural role,
    // but a message reading "id is 101 characters" sends the caller looking for a
    // field its payload does not have.
    const r = JudgmentDimensionInputSchema.safeParse({
      ...dimension,
      name: 'n'.repeat(RELAYED_FIELD_MAX_CHARS.id + 1),
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const message = r.error.issues.map((i) => i.message).join(' ');
      expect(message).toContain('name is');
      expect(message).not.toContain('id is');
    }
  });

  it('refuses a line break in name — it anchors the evidence block', () => {
    expect(
      JudgmentDimensionInputSchema.safeParse({ ...dimension, name: 'a\nb' }).success,
    ).toBe(false);
  });

  it('is an array payload, like the findings input', () => {
    expect(JudgmentDimensionsInputSchema.safeParse([dimension]).success).toBe(true);
    expect(JudgmentDimensionsInputSchema.safeParse({ dimensions: [dimension] }).success).toBe(false);
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
    expect(VALIDATE_KINDS).toEqual([
      'slug',
      'backfill-draft',
      'promote-scaffold',
      'design-spec',
      'module-readme',
    ]);
  });
});
