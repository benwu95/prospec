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
  it('appends a review entry with structured counts and stamps today when no date given', async () => {
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
    expect(written).toContain('criticals_found: 1');
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
    ).rejects.toThrow(/Both a composed entry and a verifier report/);
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
