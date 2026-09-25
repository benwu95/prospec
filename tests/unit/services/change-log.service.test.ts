import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { execute } from '../../../src/services/change-log.service.js';
import { MetadataValidationError, PrerequisiteError } from '../../../src/types/errors.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

beforeEach(() => {
  vol.reset();
});

const CWD = '/repo';
const PATH = '/repo/.prospec/changes/add-widget/metadata.yaml';

const METADATA = `name: add-widget
created_at: 2026-07-13T09:51:00.000Z
status: implemented
# note that must survive
scale: standard
`;

function seed(): void {
  vol.fromJSON({ [PATH]: METADATA });
}

describe('change-log service', () => {
  it('appends a review close entry without count fields and stamps today when no date given', async () => {
    seed();
    const result = await execute({
      cwd: CWD,
      entry: {
        skill: 'prospec-review',
        result: 'WARN',
        warnings: ['one unresolved major'],
        criticals_found: 1,
        criticals_fixed: 1,
        majors: 1,
      },
    });
    expect(result.changeName).toBe('add-widget');
    expect(result.entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const written = vol.readFileSync(PATH, 'utf-8') as string;
    expect(written).toContain('# note that must survive');
    expect(written).toContain('skill: prospec-review');
    expect(written).not.toContain('criticals_found');
    expect(written).not.toContain('criticals_fixed');
    expect(written).not.toContain('majors');
  });

  it('uses the explicit date and appends after existing entries', async () => {
    vol.fromJSON({
      [PATH]: `${METADATA}quality_log:
  - skill: prospec-ff
    date: 2026-07-29
    result: PASS
    warnings: []
`,
    });
    await execute({
      cwd: CWD,
      entry: { skill: 'prospec-verify', result: 'PASS', warnings: [], grade: 'S', date: '2026-07-30' },
    });
    const written = vol.readFileSync(PATH, 'utf-8') as string;
    const ffIndex = written.indexOf('prospec-ff');
    const verifyIndex = written.indexOf('prospec-verify');
    expect(ffIndex).toBeGreaterThan(-1);
    expect(verifyIndex).toBeGreaterThan(ffIndex);
    expect(written).toContain('grade: S');
    expect(written).toContain('date: 2026-07-30');
  });

  it('refuses a malformed entry and leaves the file untouched', async () => {
    seed();
    await expect(
      execute({
        cwd: CWD,
        // @ts-expect-error — a grade in `result` is the canonical malformation.
        entry: { skill: 'prospec-verify', result: 'A', warnings: [] },
      }),
    ).rejects.toThrow();
    expect(vol.readFileSync(PATH, 'utf-8')).toBe(METADATA);
  });

  it('refuses to write when the existing metadata fails the schema', async () => {
    vol.fromJSON({ [PATH]: METADATA.replace('status: implemented', 'status: shipped') });
    await expect(
      execute({ cwd: CWD, entry: { skill: 's', result: 'PASS', warnings: [] } }),
    ).rejects.toThrow(MetadataValidationError);
  });
});

describe('change-log service — planning verifier report (REQ-SERVICES-109)', () => {
  const REPORT = '/repo/plan-verifier.json';
  const dims = (result: 'PASS' | 'WARN' | 'FLAWS' = 'PASS') =>
    Object.fromEntries(
      ['project_layering', 'blast_radius', 'state_safety', 'delta_spec', 'reuse'].map((d) => [d, { result, rationale: `${d} ok` }]),
    );
  const payload = (over: Record<string, unknown> = {}) => ({
    verdict: 'PASS',
    dimensions: dims(),
    evidence: 'audit text',
    warnings: [],
    ...over,
  });
  const seedReport = (json: unknown) => {
    seed();
    vol.writeFileSync(REPORT, typeof json === 'string' ? json : JSON.stringify(json));
  };
  const record = () => execute({ cwd: CWD, verifierReport: { skill: 'prospec-plan', path: REPORT } });
  const unchanged = () => expect(vol.readFileSync(PATH, 'utf-8')).toBe(METADATA);

  it('records a PASS report as result PASS under the station skill', async () => {
    seedReport(payload());
    const result = await record();
    expect(result.entry).toMatchObject({ skill: 'prospec-plan', result: 'PASS', warnings: [], verifier_verdict: 'PASS' });
    const written = vol.readFileSync(PATH, 'utf-8') as string;
    expect(written).toContain('skill: prospec-plan');
    // the sink's provenance stamp — what tells the router this entry IS the verifier's verdict
    expect(written).toContain('verifier_verdict: PASS');
  });

  it('stamps the plan verifier entry with the decision.json recommendation it audited, and only a valid one', async () => {
    const decision = {
      recommended_option: 'option-b',
      evaluation_matrix: ['blast_radius_complexity', 'constitution_layering', 'extensibility_simplicity'].map((dimension) => ({ dimension, winner: 'tie', score_rationale: 'x' })),
      rationale: 'x',
      graded_by: 'in-session',
    };
    const decisionPath = '/repo/.prospec/changes/add-widget/candidates/decision.json';
    const seedDecision = (value: unknown) => {
      vol.mkdirSync('/repo/.prospec/changes/add-widget/candidates', { recursive: true });
      vol.writeFileSync(decisionPath, JSON.stringify(value));
    };
    seedReport(payload());
    seedDecision(decision);
    expect((await record()).entry.audited_option).toBe('option-b');
    expect(vol.readFileSync(PATH, 'utf-8')).toContain('audited_option: option-b');

    seedReport(payload());
    seedDecision({ ...decision, graded_by: undefined });
    expect((await record()).entry.audited_option).toBeUndefined();
    await expect(execute({ cwd: CWD, entry: { skill: 'prospec-plan', result: 'PASS', warnings: [], audited_option: 'option-a' } })).rejects.toThrow(/may not carry verifier_verdict or audited_option/);
  });

  it('maps FLAWS to FAIL and folds the payload warnings plus each non-PASS dimension rationale into warnings', async () => {
    seedReport(payload({ verdict: 'FLAWS', dimensions: { ...dims(), reuse: { result: 'FLAWS', rationale: 'owner bypassed' } }, warnings: ['tighten step 3'] }));
    const result = await record();
    expect(result.entry.result).toBe('FAIL');
    expect(result.entry.verifier_verdict).toBe('FLAWS');
    expect(result.entry.warnings).toEqual(['tighten step 3', 'reuse: owner bypassed']);
  });

  it('maps WARN to WARN', async () => {
    seedReport(payload({ verdict: 'WARN', dimensions: { ...dims(), blast_radius: { result: 'WARN', rationale: 'wide' } } }));
    expect((await record()).entry).toMatchObject({ result: 'WARN', warnings: ['blast_radius: wide'] });
  });

  it.each([
    ['unknown verdict enum', payload({ verdict: 'FLAW' }), /verdict/],
    ['lower-case verdict is not normalized', payload({ verdict: 'flaws' }), /verdict/],
    ['missing dimension key', payload({ dimensions: Object.fromEntries(Object.entries(dims()).filter(([k]) => k !== 'reuse')) }), /reuse/],
    ['extra top-level key', payload({ extra: 1 }), /extra|Unrecognized/],
    ['extra dimension', payload({ dimensions: { ...dims(), bonus: { result: 'PASS', rationale: 'x' } } }), /bonus|Unrecognized/],
    ['missing evidence', Object.fromEntries(Object.entries(payload()).filter(([k]) => k !== 'evidence')), /evidence/],
    ['multi-line rationale', payload({ dimensions: { ...dims(), reuse: { result: 'PASS', rationale: 'a\nb' } } }), /single line/],
    ['over-ceiling warning', payload({ warnings: ['x'.repeat(501)] }), /ceiling/],
  ])('refuses %s before any write', async (_label, json, message) => {
    seedReport(json);
    await expect(record()).rejects.toThrow(PrerequisiteError);
    await expect(record()).rejects.toThrow(message);
    unchanged();
  });

  it('refuses a skill without a verifier report contract before reading the file', async () => {
    seed();
    await expect(execute({ cwd: CWD, verifierReport: { skill: 'prospec-review', path: '/repo/none.json' } })).rejects.toThrow(/not defined for skill/);
    unchanged();
  });

  it('refuses a missing file and non-JSON content', async () => {
    seed();
    await expect(record()).rejects.toThrow(/not found/);
    seedReport('{ not json');
    await expect(record()).rejects.toThrow(/not valid JSON/);
    unchanged();
  });

  it('refuses a composed entry alongside a verifier report, and neither', async () => {
    seedReport(payload());
    await expect(
      execute({ cwd: CWD, entry: { skill: 'prospec-plan', result: 'PASS', warnings: [] }, verifierReport: { skill: 'prospec-plan', path: REPORT } }),
    ).rejects.toThrow(/More than one verdict source/);
    await expect(execute({ cwd: CWD })).rejects.toThrow(/Nothing to record/);
    unchanged();
  });

  it('validates a tasks verifier report against its own four dimensions', async () => {
    seed();
    const tasksDims = Object.fromEntries(
      ['bidirectional_coverage', 'dag_topological_order', 'tdd_module_closure', 'task_sizing_schema'].map((d) => [d, { result: 'PASS', rationale: 'ok' }]),
    );
    vol.writeFileSync(REPORT, JSON.stringify({ verdict: 'PASS', dimensions: tasksDims, evidence: 'e' }));
    expect((await execute({ cwd: CWD, verifierReport: { skill: 'prospec-tasks', path: REPORT } })).entry.skill).toBe('prospec-tasks');
    vol.writeFileSync(REPORT, JSON.stringify({ verdict: 'PASS', dimensions: dims(), evidence: 'e' }));
    await expect(execute({ cwd: CWD, verifierReport: { skill: 'prospec-tasks', path: REPORT } })).rejects.toThrow(PrerequisiteError);
  });
});

describe('change-log service — review round counts audit (REQ-SERVICES-112, REQ-CLI-025, REQ-TESTS-121)', () => {
  const ROUND_1_COUNTS = `${METADATA}quality_log:
  - skill: prospec-review
    date: '2026-09-19'
    result: PASS
    warnings: []
    round: 1
    criticals_found: 0
    criticals_fixed: 0
    majors: 0
`;

  it('records log_mismatch warning, coerces PASS to WARN, and leaves CLI truth untouched when count flag differs', async () => {
    vol.fromJSON({ [PATH]: ROUND_1_COUNTS });
    const result = await execute({
      cwd: CWD,
      entry: {
        skill: 'prospec-review',
        result: 'PASS',
        warnings: [],
        criticals_found: 2,
        majors: 1,
      },
    });

    expect(result.entry.result).toBe('WARN');
    expect(result.entry.warnings).toEqual([
      'log_mismatch: criticals_found expected 0 got 2, majors expected 0 got 1',
    ]);
    expect(result.entry.criticals_found).toBeUndefined();
    expect(result.entry.majors).toBeUndefined();
    expect(result.entry.round).toBeUndefined();

    // Verify truth entry was NOT overwritten
    const written = vol.readFileSync(PATH, 'utf-8') as string;
    expect(written).toContain('round: 1\n    criticals_found: 0');
  });

  it('records no log_mismatch warning and preserves result when supplied count flags match', async () => {
    vol.fromJSON({
      [PATH]: `${METADATA}quality_log:
  - skill: prospec-review
    date: '2026-09-19'
    result: WARN
    warnings: []
    round: 1
    criticals_found: 1
    criticals_fixed: 0
    majors: 2
`,
    });
    const result = await execute({
      cwd: CWD,
      entry: {
        skill: 'prospec-review',
        result: 'PASS',
        warnings: [],
        criticals_found: 1,
        criticals_fixed: 0,
        majors: 2,
      },
    });

    expect(result.entry.result).toBe('PASS');
    expect(result.entry.warnings).toEqual([]);
    expect(result.entry.criticals_found).toBeUndefined();
  });

  it('records no log_mismatch warning when count flags are omitted', async () => {
    vol.fromJSON({ [PATH]: ROUND_1_COUNTS });
    const result = await execute({
      cwd: CWD,
      entry: {
        skill: 'prospec-review',
        result: 'PASS',
        warnings: [],
      },
    });

    expect(result.entry.result).toBe('PASS');
    expect(result.entry.warnings).toEqual([]);
  });

  it('skips audit when no prior prospec-review counts entry exists', async () => {
    seed();
    const result = await execute({
      cwd: CWD,
      entry: {
        skill: 'prospec-review',
        result: 'PASS',
        warnings: [],
        criticals_found: 5,
      },
    });

    expect(result.entry.result).toBe('PASS');
    expect(result.entry.warnings).toEqual([]);
    expect(result.entry.criticals_found).toBeUndefined();
  });

  it('compares against highest-round counts entry when multiple rounds exist', async () => {
    vol.fromJSON({
      [PATH]: `${METADATA}quality_log:
  - skill: prospec-review
    date: '2026-09-19'
    result: WARN
    warnings: []
    round: 1
    criticals_found: 3
    criticals_fixed: 0
    majors: 0
  - skill: prospec-review
    date: '2026-09-19'
    result: WARN
    warnings: []
  - skill: prospec-review
    date: '2026-09-19'
    result: PASS
    warnings: []
    round: 2
    criticals_found: 0
    criticals_fixed: 3
    majors: 0
`,
    });

    // Matches round 2 (highest round) -> no mismatch
    const matching = await execute({
      cwd: CWD,
      entry: {
        skill: 'prospec-review',
        result: 'PASS',
        warnings: [],
        criticals_found: 0,
        criticals_fixed: 3,
        majors: 0,
      },
    });
    expect(matching.entry.warnings).toEqual([]);

    // Mismatches round 2 -> log_mismatch
    const mismatch = await execute({
      cwd: CWD,
      entry: {
        skill: 'prospec-review',
        result: 'PASS',
        warnings: [],
        criticals_found: 3,
      },
    });
    expect(mismatch.entry.result).toBe('WARN');
    expect(mismatch.entry.warnings).toEqual([
      'log_mismatch: criticals_found expected 0 got 3',
    ]);
  });
});

describe('change-log service — plan sign-off (REQ-SERVICES-117)', () => {
  const DIR = '/repo/.prospec/changes/add-widget';
  const PLAN_METADATA = `name: add-widget
created_at: 2026-07-13T09:51:00.000Z
status: plan
scale: full
quality_log:
  - skill: prospec-plan
    date: 2026-09-24
    result: WARN
    warnings:
      - sizing note
    verifier_verdict: WARN
    audited_option: option-a
`;
  const candidate = (id: string) =>
    JSON.stringify({ id, title: id, overview: 'o', trade_offs: { pros: [], cons: [], blast_radius: 'b' } });
  const decision = (overrides: Record<string, unknown> = {}) =>
    `${JSON.stringify(
      {
        recommended_option: 'option-a',
        evaluation_matrix: [
          { dimension: 'blast_radius_complexity', winner: 'option-a', score_rationale: 'x' },
          { dimension: 'constitution_layering', winner: 'tie', score_rationale: 'x' },
          { dimension: 'extensibility_simplicity', winner: 'option-a', score_rationale: 'x' },
        ],
        rationale: 'in-session',
        graded_by: 'in-session',
        ...overrides,
      },
      null,
      2,
    )}\n`;
  function seedPlan(files: Record<string, string | null> = {}): void {
    const tree: Record<string, string> = {
      [PATH]: PLAN_METADATA,
      [`${DIR}/candidates/option-a.json`]: candidate('option-a'),
      [`${DIR}/candidates/option-b.json`]: candidate('option-b'),
      [`${DIR}/candidates/decision.json`]: decision(),
    };
    for (const [file, content] of Object.entries(files)) {
      if (content === null) delete tree[file];
      else tree[file] = content;
    }
    vol.fromJSON(tree);
  }
  const snapshot = () => vol.toJSON();

  it('records the sign-off: decision.json graded_by → human, then a stamped PASS entry', async () => {
    seedPlan();
    const result = await execute({
      cwd: CWD,
      signoff: { skill: 'prospec-plan', option: 'option-a', notes: ['looks right'], date: '2026-09-25' },
    });
    expect(result.entry).toEqual({
      skill: 'prospec-plan',
      date: '2026-09-25',
      result: 'PASS',
      warnings: ['looks right'],
      signoff_option: 'option-a',
    });
    const written = JSON.parse(vol.readFileSync(`${DIR}/candidates/decision.json`, 'utf-8') as string);
    expect(written.graded_by).toBe('human');
    expect(written.recommended_option).toBe('option-a');
    expect(vol.readFileSync(PATH, 'utf-8')).toContain('signoff_option: option-a');
  });

  it('is idempotent to re-run after a partial failure left decision.json already human', async () => {
    seedPlan({ [`${DIR}/candidates/decision.json`]: decision({ graded_by: 'human' }) });
    await execute({ cwd: CWD, signoff: { skill: 'prospec-plan', option: 'option-a' } });
    expect(vol.readFileSync(PATH, 'utf-8')).toContain('signoff_option: option-a');
  });

  it('accepts hybrid without a candidate file when the decision recommends hybrid', async () => {
    seedPlan({
      [PATH]: PLAN_METADATA.replace('audited_option: option-a', 'audited_option: hybrid'),
      [`${DIR}/candidates/decision.json`]: decision({ recommended_option: 'hybrid', hybrid_recommendation: 'a + b' }),
    });
    const result = await execute({ cwd: CWD, signoff: { skill: 'prospec-plan', option: 'hybrid' } });
    expect(result.entry.signoff_option).toBe('hybrid');
  });

  const refusals: Array<[string, () => void, { skill?: string; option?: string }, RegExp]> = [
    ['a non-plan skill', () => seedPlan(), { skill: 'prospec-tasks' }, /not defined for skill/],
    ['an unknown option', () => seedPlan(), { option: 'option-z' }, /not one of/],
    ['no plan verifier result', () => seedPlan({ [PATH]: PLAN_METADATA.replace(/quality_log:[\s\S]*/, '') }), {}, /No plan verifier result/],
    ['a latest verifier FAIL', () => seedPlan({ [PATH]: PLAN_METADATA.replace('result: WARN', 'result: FAIL').replace('verifier_verdict: WARN', 'verifier_verdict: FLAWS') }), {}, /is FAIL/],
    ['a missing candidate file', () => seedPlan({ [`${DIR}/candidates/option-a.json`]: null }), {}, /recommended_option 'option-a' is not a valid candidate/],
    ['a candidate file carrying another id', () => seedPlan({ [`${DIR}/candidates/option-a.json`]: candidate('option-b') }), {}, /option-a\.json: file name does not match its id/],
    ['a matrix winner naming no valid candidate', () => seedPlan({ [`${DIR}/candidates/option-b.json`]: null, [`${DIR}/candidates/decision.json`]: decision({ evaluation_matrix: [
      { dimension: 'blast_radius_complexity', winner: 'option-b', score_rationale: 'x' },
      { dimension: 'constitution_layering', winner: 'tie', score_rationale: 'x' },
      { dimension: 'extensibility_simplicity', winner: 'option-a', score_rationale: 'x' },
    ] }) }), {}, /blast_radius_complexity winner 'option-b' is not a valid candidate/],
    ['a hybrid recommendation without its text', () => seedPlan({ [`${DIR}/candidates/decision.json`]: decision({ recommended_option: 'hybrid' }) }), { option: 'hybrid' }, /hybrid needs a hybrid_recommendation/],
    ['a hybrid recommendation over one valid candidate', () => seedPlan({ [`${DIR}/candidates/option-b.json`]: null, [`${DIR}/candidates/decision.json`]: decision({ recommended_option: 'hybrid', hybrid_recommendation: 'a + b' }) }), { option: 'hybrid' }, /hybrid needs at least two valid candidates/],
    ['a missing decision.json', () => seedPlan({ [`${DIR}/candidates/decision.json`]: null }), {}, /decision\.json is missing/],
    ['a legacy decision.json without graded_by', () => seedPlan({ [`${DIR}/candidates/decision.json`]: decision({ graded_by: undefined }) }), {}, /failed validation/],
    ['an option other than the recommendation', () => seedPlan(), { option: 'option-b' }, /differs from decision\.json recommended_option/],
    ['a decision rewritten after the verifier audited another option', () => seedPlan({ [`${DIR}/candidates/decision.json`]: decision({ recommended_option: 'option-b' }) }), { option: 'option-b' }, /the latest plan verifier report audited option-a/],
    ['a recommendation changed after the audit behind a Break-Glass WARN', () => seedPlan({
      [PATH]: `${PLAN_METADATA}  - skill: prospec-plan\n    date: 2026-09-24\n    result: WARN\n    warnings:\n      - "Manual override: accept"\n`,
      [`${DIR}/candidates/decision.json`]: decision({ recommended_option: 'option-b' }),
    }), { option: 'option-b' }, /the latest plan verifier report audited option-a/],
    ['a Break-Glass override with no verifier report at all', () => seedPlan({
      [PATH]: PLAN_METADATA.replace(/ {2}- skill: prospec-plan[\s\S]*/, '  - skill: prospec-plan\n    date: 2026-09-24\n    result: WARN\n    warnings:\n      - "Manual override: verifier unavailable"\n'),
    }), {}, /No plan verifier report is recorded \(only a Break-Glass override\)/],
    ['a verifier entry recorded before decision.json existed', () => seedPlan({ [PATH]: PLAN_METADATA.replace('    audited_option: option-a\n', '') }), {}, /stamps no audited recommendation/],
  ];

  it.each(refusals)('refuses %s and writes nothing', async (_label, arrange, overrides, message) => {
    arrange();
    const before = snapshot();
    await expect(
      execute({ cwd: CWD, signoff: { skill: overrides.skill ?? 'prospec-plan', option: overrides.option ?? 'option-a' } }),
    ).rejects.toThrow(message);
    expect(snapshot()).toEqual(before);
  });

  it('names the remedies when the decision cannot be signed', async () => {
    seedPlan({ [`${DIR}/candidates/decision.json`]: null });
    await expect(execute({ cwd: CWD, signoff: { skill: 'prospec-plan', option: 'option-a' } })).rejects.toMatchObject({
      suggestion: expect.stringMatching(/record the plan verifier report after candidates\/decision\.json is written.*add `graded_by` to a legacy decision\.json and re-record the plan verifier.*PROSPEC_PAUSE_AT/),
    });
  });

  it('names the re-selection path when the option differs from the recommendation', async () => {
    seedPlan();
    await expect(execute({ cwd: CWD, signoff: { skill: 'prospec-plan', option: 'option-b' } })).rejects.toMatchObject({
      suggestion: expect.stringMatching(/revise plan\.md.*re-record the plan verifier/),
    });
  });

  it('refuses a composed entry forging signoff_option', async () => {
    seedPlan();
    const before = snapshot();
    await expect(
      execute({ cwd: CWD, entry: { skill: 'prospec-plan', result: 'PASS', warnings: [], signoff_option: 'option-a' } }),
    ).rejects.toThrow(/may not carry signoff_option/);
    expect(snapshot()).toEqual(before);
  });

  it('refuses two verdict sources, and names all three forms when none is given', async () => {
    seedPlan();
    await expect(
      execute({ cwd: CWD, entry: { skill: 'prospec-plan', result: 'PASS', warnings: [] }, signoff: { skill: 'prospec-plan', option: 'option-a' } }),
    ).rejects.toThrow(PrerequisiteError);
    await expect(execute({ cwd: CWD })).rejects.toThrow(/--result, --verifier-report or --signoff/);
  });
});

