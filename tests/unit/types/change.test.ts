import { describe, it, expect } from 'vitest';
import {
  CHANGE_SCALES,
  CHANGE_STATUSES,
  ChangeMetadataSchema,
  PROVENANCE_AUDITED_STATUSES,
  SCALE_FORBIDDEN_ARTIFACTS,
  VERIFY_GRADES,
  NewQualityLogEntrySchema,
  QualityLogEntrySchema,
  forbiddenArtifacts,
  isProvenanceAudited,
} from '../../../src/types/change.js';
import type {
  ChangeMetadata,
  NewChangeMetadata,
  NewQualityLogEntry,
} from '../../../src/types/change.js';

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

describe('SCALE_FORBIDDEN_ARTIFACTS (REQ-TYPES-074)', () => {
  it('covers every scale — a new CHANGE_SCALES value cannot default to forbidding nothing', () => {
    expect(Object.keys(SCALE_FORBIDDEN_ARTIFACTS).sort()).toEqual([...CHANGE_SCALES].sort());
  });

  it('forbids the plan artifacts under quick', () => {
    expect([...forbiddenArtifacts('quick')].sort()).toEqual(['delta-spec.md', 'plan.md']);
  });

  it('forbids plan.md and tasks.md under backfill', () => {
    expect([...forbiddenArtifacts('backfill')].sort()).toEqual(['plan.md', 'tasks.md']);
  });

  it('forbids nothing under standard or full', () => {
    expect(forbiddenArtifacts('standard')).toEqual([]);
    expect(forbiddenArtifacts('full')).toEqual([]);
  });

  it('reads an absent scale as standard', () => {
    expect(forbiddenArtifacts(undefined)).toEqual([]);
  });

  it('reads an unknown scale as standard', () => {
    expect(forbiddenArtifacts('medium')).toEqual([]);
  });

  // An inherited key resolves truthy on a plain object literal, so a `??` fallback
  // would hand the caller `Object.prototype.constructor` — and every call site
  // does `.includes(...)` on the result.
  it.each(['constructor', 'toString', '__proto__'])(
    'reads the prototype key %s as standard, never as an inherited member',
    (key) => {
      const result = forbiddenArtifacts(key);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([]);
      expect(() => result.includes('plan.md')).not.toThrow();
    },
  );
});

describe('PROVENANCE_AUDITED_STATUSES (REQ-TYPES-075)', () => {
  it('audits implemented AND verified — the window verify opens stays inside the scope', () => {
    expect([...PROVENANCE_AUDITED_STATUSES].sort()).toEqual(['implemented', 'verified']);
  });

  it('names only real lifecycle statuses', () => {
    for (const status of PROVENANCE_AUDITED_STATUSES) {
      expect(CHANGE_STATUSES).toContain(status);
    }
  });

  // Absent for a different reason than the pre-review statuses: archive has moved
  // the bundle out of `.prospec/changes/`, so no collector can enumerate it and no
  // verdict exists to give. Recording it as an "exemption" would misdescribe that.
  it('leaves archived out of the registry', () => {
    expect([...PROVENANCE_AUDITED_STATUSES]).not.toContain('archived');
  });

  it.each([...PROVENANCE_AUDITED_STATUSES])('reports %s as audited', (status) => {
    expect(isProvenanceAudited(status)).toBe(true);
  });

  it.each(['story', 'plan', 'tasks', 'archived'])(
    'reports %s as unaudited',
    (status) => {
      expect(isProvenanceAudited(status)).toBe(false);
    },
  );

  it.each([null, undefined, '', 'IMPLEMENTED', 'verify'])(
    'reports the non-status %s as unaudited',
    (value) => {
      expect(isProvenanceAudited(value)).toBe(false);
    },
  );

  // Membership goes through a Set, never a plain-object lookup: an inherited key
  // resolves truthy on an object literal, which would admit a change whose
  // metadata carries a forged status — the trap `forbiddenArtifacts` guards above.
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'reports the prototype key %s as unaudited',
    (key) => {
      expect(isProvenanceAudited(key)).toBe(false);
    },
  );
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

describe('ChangeMetadataSchema issue (external-tracker registration, issue #131)', () => {
  it('accepts a change naming the tracker item it belongs to', () => {
    const r = ChangeMetadataSchema.safeParse({ ...base, issue: '#131' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.issue).toBe('#131');
  });

  it('accepts metadata without issue (backward compatible)', () => {
    const r = ChangeMetadataSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.issue).toBeUndefined();
  });

  // Shape-free by contract: prospec binds to no forge, so a hash ref, a full
  // URL and another tracker's id are all equally valid and none is normalized.
  it.each([
    ['#125', 'a bare hash reference'],
    ['https://github.com/benwu95/prospec/issues/131', 'a full URL'],
    ['ABC-123', 'another tracker id'],
  ])('accepts %s verbatim (%s)', (value) => {
    const r = ChangeMetadataSchema.safeParse({ ...base, issue: value });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.issue).toBe(value);
  });

  it('rejects a non-string issue — the value is free-form text, not a number', () => {
    expect(ChangeMetadataSchema.safeParse({ ...base, issue: 131 }).success).toBe(false);
  });
});

describe('QualityDimensionSchema result vocabulary (REQ-TYPES-064)', () => {
  const entry = (result: string) => ({
    ...base,
    quality_log: [
      {
        skill: 'prospec-verify',
        date: '2026-07-06',
        result: 'PASS',
        warnings: [],
        grade: 'A',
        dimensions: [{ name: 'delta-spec-compliance', result }],
      },
    ],
  });

  // /prospec-verify mandates `not-applicable` for a dimension its scale skips
  // (quick has no delta-spec, backfill no tasks.md) and forbids reporting it as
  // PASS. A three-state-only dimension schema would reject correct metadata.
  it.each(['PASS', 'WARN', 'FAIL', 'not-applicable', 'not-adjudicated'])(
    'accepts the dimension result %s',
    (r) => {
      expect(ChangeMetadataSchema.safeParse(entry(r)).success).toBe(true);
    },
  );

  it('still rejects a grade leaking into a dimension result', () => {
    expect(ChangeMetadataSchema.safeParse(entry('A')).success).toBe(false);
  });

  it('keeps the gate result a strict three-state — not-applicable is dimension-only', () => {
    const r = ChangeMetadataSchema.safeParse({
      ...base,
      quality_log: [
        { skill: 'prospec-verify', date: '2026-07-06', result: 'not-applicable', warnings: [] },
      ],
    });
    expect(r.success).toBe(false);
  });

  // `not-adjudicated` (engine could not run) must stay distinct from
  // `not-applicable` (dimension is moot) — and neither may leak to the gate.
  it('keeps not-adjudicated out of the gate result too', () => {
    const r = ChangeMetadataSchema.safeParse({
      ...base,
      quality_log: [
        { skill: 'prospec-verify', date: '2026-07-06', result: 'not-adjudicated', warnings: [] },
      ],
    });
    expect(r.success).toBe(false);
  });
});

describe('QualityDimensionSchema adjudicator', () => {
  const dim = (adjudicator?: string) => ({
    ...base,
    quality_log: [
      {
        skill: 'prospec-verify',
        date: '2026-07-28',
        result: 'PASS',
        warnings: [],
        grade: 'A',
        dimensions: [{ name: 'task-completion', result: 'PASS', ...(adjudicator === undefined ? {} : { adjudicator }) }],
      },
    ],
  });

  it.each(['machine', 'judgment'])('accepts adjudicator %s', (a) => {
    const r = ChangeMetadataSchema.safeParse(dim(a));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.quality_log?.[0]?.dimensions?.[0]?.adjudicator).toBe(a);
  });

  it('accepts a dimension with no adjudicator (entries written before the field existed)', () => {
    expect(ChangeMetadataSchema.safeParse(dim()).success).toBe(true);
  });

  it('rejects an invented adjudicator', () => {
    expect(ChangeMetadataSchema.safeParse(dim('vibes')).success).toBe(false);
  });
});

describe('QualityDimensionSchema grading context (graded_by / executor / spend, REQ-TYPES-022)', () => {
  const dim = (extra: Record<string, unknown>) => ({
    ...base,
    quality_log: [
      {
        skill: 'prospec-verify',
        date: '2026-08-22',
        result: 'PASS',
        warnings: [],
        grade: 'A',
        dimensions: [{ name: 'delta-spec-compliance', result: 'PASS', adjudicator: 'judgment', ...extra }],
      },
    ],
  });

  it.each(['fresh-subagent', 'in-session'])('accepts graded_by %s', (g) => {
    const r = ChangeMetadataSchema.safeParse(dim({ graded_by: g }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.quality_log?.[0]?.dimensions?.[0]?.graded_by).toBe(g);
  });

  it('rejects an invented graded_by', () => {
    expect(ChangeMetadataSchema.safeParse(dim({ graded_by: 'myself' })).success).toBe(false);
  });

  it('accepts optional executor (free string) and spend (non-negative int)', () => {
    const r = ChangeMetadataSchema.safeParse(
      dim({ graded_by: 'fresh-subagent', executor: 'opus-tier, fresh subagent', spend: 18500 }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      const d = r.data.quality_log?.[0]?.dimensions?.[0];
      expect(d?.executor).toBe('opus-tier, fresh subagent');
      expect(d?.spend).toBe(18500);
    }
  });

  it('rejects a negative or non-integer spend', () => {
    expect(ChangeMetadataSchema.safeParse(dim({ spend: -1 })).success).toBe(false);
    expect(ChangeMetadataSchema.safeParse(dim({ spend: 1.5 })).success).toBe(false);
  });

  it('accepts a dimension omitting all three (machine dimensions, pre-existing entries)', () => {
    expect(ChangeMetadataSchema.safeParse(dim({})).success).toBe(true);
  });
});

describe('ReviewProvenanceSchema graded_by (REQ-TYPES-053)', () => {
  const withProvenance = (rp: Record<string, unknown>) => ({
    ...base,
    review_provenance: { digest: 'abc', date: '2026-08-22', ...rp },
  });

  it.each(['fresh-subagent', 'in-session'])('accepts review_provenance.graded_by %s', (g) => {
    const r = ChangeMetadataSchema.safeParse(withProvenance({ graded_by: g }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.review_provenance?.graded_by).toBe(g);
  });

  it('accepts review_provenance without graded_by (backward-compatible)', () => {
    expect(ChangeMetadataSchema.safeParse(withProvenance({})).success).toBe(true);
  });

  it('rejects an invented review_provenance.graded_by', () => {
    expect(ChangeMetadataSchema.safeParse(withProvenance({ graded_by: 'nope' })).success).toBe(false);
  });
});

describe('TestProvenanceSchema (REQ-TYPES-066)', () => {
  const withProvenance = (over: Record<string, unknown>) => ({
    ...base,
    test_provenance: { command: 'pnpm test', exit_code: 0, digest: 'abc', date: '2026-07-28', ...over },
  });

  it('accepts a recorded run and keeps a non-zero exit code (a failing suite IS the fact)', () => {
    const r = ChangeMetadataSchema.safeParse(withProvenance({ exit_code: 1 }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.test_provenance?.exit_code).toBe(1);
  });

  it('accepts metadata without test_provenance (every pre-existing change stays valid)', () => {
    const r = ChangeMetadataSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.test_provenance).toBeUndefined();
  });

  it('rejects a non-integer exit code or a missing digest', () => {
    expect(ChangeMetadataSchema.safeParse(withProvenance({ exit_code: 1.5 })).success).toBe(false);
    const noDigest = { ...base, test_provenance: { command: 'pnpm test', exit_code: 0, date: '2026-07-28' } };
    expect(ChangeMetadataSchema.safeParse(noDigest).success).toBe(false);
  });
});

describe('DeltaSpecProvenanceSchema (REQ-TYPES-078)', () => {
  const withProvenance = (over: Record<string, unknown>) => ({
    ...base,
    delta_spec_provenance: { digest: 'abc', date: '2026-08-08', ...over },
  });

  it('accepts a recorded delta-spec baseline', () => {
    const r = ChangeMetadataSchema.safeParse(withProvenance({}));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.delta_spec_provenance?.digest).toBe('abc');
  });

  it('accepts metadata without it (every pre-existing change stays valid)', () => {
    const r = ChangeMetadataSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.delta_spec_provenance).toBeUndefined();
  });

  it('rejects a missing digest — a baseline with no fingerprint proves nothing', () => {
    const noDigest = { ...base, delta_spec_provenance: { date: '2026-08-08' } };
    expect(ChangeMetadataSchema.safeParse(noDigest).success).toBe(false);
  });

  // Loose like its two siblings: a read must never strip an unmodeled key.
  it('keeps unmodeled keys on read', () => {
    const r = ChangeMetadataSchema.safeParse(withProvenance({ note: 'x' }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.delta_spec_provenance).toMatchObject({ note: 'x' });
  });
});

describe('ChangeMetadataSchema related_modules (bare module names, REQ-TYPES-064)', () => {
  // The index.md Module column is bold (`**types**`); a consumer that forwards the
  // cell verbatim writes an unresolvable module name that downstream module
  // derivation (archive Entry Gate) then looks up as a directory.
  it.each([
    ['markdown emphasis', '**types**'],
    ['single-asterisk emphasis', '*lib*'],
    ['backticks', '`services`'],
    ['leading whitespace', ' lib'],
    ['trailing whitespace', 'lib '],
    ['empty string', ''],
  ])('rejects related_modules with %s', (_label, value) => {
    const r = ChangeMetadataSchema.safeParse({ ...base, related_modules: [value] });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'related_modules.0')).toBe(true);
    }
  });

  it.each(['types', 'lib', 'api-middleware', 'user_profile', 'Core.Domain'])(
    'accepts the bare module name %s',
    (value) => {
      const r = ChangeMetadataSchema.safeParse({ ...base, related_modules: [value] });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.related_modules).toEqual([value]);
    },
  );

  it('reports the offending index when only one entry is malformed', () => {
    const r = ChangeMetadataSchema.safeParse({
      ...base,
      related_modules: ['types', '**lib**', 'services'],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('related_modules.1');
      expect(paths).not.toContain('related_modules.0');
      expect(paths).not.toContain('related_modules.2');
    }
  });

  it('accepts metadata without related_modules (backward compatible)', () => {
    const r = ChangeMetadataSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.related_modules).toBeUndefined();
  });
});

describe('unmodeled keys survive validation at every level (REQ-TYPES-064)', () => {
  it('keeps a top-level key the schema does not model', () => {
    const r = ChangeMetadataSchema.safeParse({ ...base, archived_at: '2026-07-06' });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as Record<string, unknown>).archived_at).toBe('2026-07-06');
  });

  it('keeps an unmodeled key inside a quality_log entry', () => {
    const r = ChangeMetadataSchema.safeParse({
      ...base,
      quality_log: [
        { skill: 'prospec-verify', date: '2026-07-06', result: 'PASS', warnings: [], notes: 'kept' },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data.quality_log?.[0] as Record<string, unknown>).notes).toBe('kept');
    }
  });

  it('keeps an unmodeled key inside review_provenance and a dimension', () => {
    const r = ChangeMetadataSchema.safeParse({
      ...base,
      review_provenance: { digest: 'd', date: '2026-07-06', extra: 1 },
      quality_log: [
        {
          skill: 'prospec-verify',
          date: '2026-07-06',
          result: 'PASS',
          warnings: [],
          dimensions: [{ name: 'tests', result: 'PASS', note: 'kept' }],
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data.review_provenance as Record<string, unknown>).extra).toBe(1);
      const dim = r.data.quality_log?.[0]?.dimensions?.[0] as Record<string, unknown>;
      expect(dim.note).toBe('kept');
    }
  });

  it('still injects the warnings default — the one deliberate divergence (additive only)', () => {
    const r = ChangeMetadataSchema.safeParse({
      ...base,
      quality_log: [{ skill: 'prospec-plan', date: '2026-07-06', result: 'PASS' }],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.quality_log?.[0]?.warnings).toEqual([]);
  });

  it('keeps the strict build view free of an index signature (compile-time guard)', () => {
    // @ts-expect-error — NewChangeMetadata must still reject a typo'd key.
    const typo: NewChangeMetadata = { ...base, scal: 'quick' };
    // The loose read view intentionally accepts it, so the two views differ.
    const loose: ChangeMetadata = { ...base, scal: 'quick' };
    expect(typo.name).toBe(loose.name);
  });
});

describe('NewQualityLogEntrySchema (strict build view)', () => {
  it('parses a station-built entry and injects the warnings default', () => {
    const r = NewQualityLogEntrySchema.safeParse({
      skill: 'prospec-review',
      date: '2026-07-30',
      result: 'PASS',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.warnings).toEqual([]);
  });

  it('keeps the loose read view accepting unmodeled keys the strict type rejects', () => {
    const withExtra = {
      skill: 'prospec-verify',
      date: '2026-07-30',
      result: 'PASS',
      warnings: [],
      legacy_field: 'kept',
    };
    const loose = QualityLogEntrySchema.safeParse(withExtra);
    expect(loose.success).toBe(true);
    if (loose.success) expect((loose.data as Record<string, unknown>).legacy_field).toBe('kept');
    // @ts-expect-error — NewQualityLogEntry must still reject a typo'd key.
    const typo: NewQualityLogEntry = { ...withExtra };
    expect(typo.skill).toBe('prospec-verify');
  });

  it('rejects a grade in result — the gate three-state is not the grade slot', () => {
    const r = NewQualityLogEntrySchema.safeParse({
      skill: 'prospec-verify',
      date: '2026-07-30',
      result: 'A',
    });
    expect(r.success).toBe(false);
  });
});

describe('versioned input evidence', () => {
  it('validates attempt fields rather than accepting an opaque unknown object', () => {
    expect(ChangeMetadataSchema.safeParse({ ...base, test_attempt: { id: 'a', outcome: 'invented' } }).success).toBe(false);
    expect(ChangeMetadataSchema.safeParse({ ...base, test_attempt: { id: 'a', outcome: 'timeout', exit_code: null } }).success).toBe(false);
  });

  it('keeps honest attempts without an exit and preserves future fields', () => {
    const attempt = { id: 'a', outcome: 'running', date: '2026-09-05', future: true };
    expect(ChangeMetadataSchema.parse({ ...base, test_attempt: attempt }).test_attempt).toEqual(attempt);
  });

  it('validates optional fingerprint fields while reading legacy records', () => {
    const record = { digest: 'd', date: '2026-09-05' };
    expect(ChangeMetadataSchema.safeParse({ ...base, review_provenance: record }).success).toBe(true);
    expect(ChangeMetadataSchema.safeParse({ ...base, review_provenance: { ...record, fingerprint_version: 2 } }).success).toBe(false);
    expect(ChangeMetadataSchema.parse({ ...base, review_provenance: { ...record, fingerprint_version: 'future', scope: 'future' } }).review_provenance?.scope).toBe('future');
  });
});
