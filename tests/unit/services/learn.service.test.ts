import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { execute, executePlaybook, executeYield } from '../../../src/services/learn.service.js';
import { PrerequisiteError } from '../../../src/types/errors.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

vi.mock('../../../src/lib/config.js', () => ({
  readConfig: vi.fn().mockImplementation(async () => globalThis.__learnTestConfig ?? {
    project: { name: 'demo' },
  }),
  resolveBasePaths: vi.fn().mockReturnValue({
    baseDir: '/repo/prospec',
    knowledgePath: '/repo/prospec/ai-knowledge',
    constitutionPath: '/repo/prospec/CONSTITUTION.md',
    specsPath: '/repo/prospec/specs',
  }),
}));

declare global {
   
  var __learnTestConfig: Record<string, unknown> | undefined;
}

beforeEach(() => {
  vol.reset();
  globalThis.__learnTestConfig = undefined;
});

const CWD = '/repo';
const LEDGER = '/repo/prospec/ai-knowledge/_lessons-ledger.md';
const LESSON = '/repo/lesson.json';

const LEDGER_CONTENT = `# Lessons Ledger

| key | description | frequency | impact_modules | kind | source_changes | status |
|-----|-------------|-----------|----------------|------|----------------|--------|
| fix/parallel-site | 修 fix 漏平行位置 | 2 | 1 (lib) | playbook | change-a, change-b | personal |
`;

const lesson = {
  key: 'fix/parallel-site',
  description: 'sweep the family',
  kind: 'playbook',
  source_change: 'change-c',
  impact_modules: ['services'],
};

function seed(lessonJson: unknown = lesson, ledger: string = LEDGER_CONTENT): void {
  vol.fromJSON({ [LEDGER]: ledger, [LESSON]: JSON.stringify(lessonJson) });
}

describe('learn service', () => {
  it('increments on a distinct source change and emits the score detail at the threshold', async () => {
    seed();
    const result = await execute({ cwd: CWD, lessonPath: LESSON, today: '2026-07-30' });
    expect(result.action).toBe('incremented');
    expect(result.suggestions).toEqual([
      {
        key: 'fix/parallel-site',
        detail: 'frequency=3 · impact_modules=2 · kind=playbook · rule=freq≥3 ∧ modules≥2 ⇒ suggest',
      },
    ]);
    const written = vol.readFileSync(LEDGER, 'utf-8') as string;
    expect(written).toContain('| 3 | 2 (lib,services) |');
    expect(written).toContain('suggest-promote');
    expect(written).toContain('# Lessons Ledger');
    // no module-map in this fixture — the supplied modules still count, but the
    // result discloses that they were unverifiable
    expect(result.warnings.join(' ')).toContain('could not be verified');
  });

  it('drops an impact module unknown to module-map from scoring and warns, instead of silently scoring it', async () => {
    seed({ ...lesson, impact_modules: ['phantom'] });
    vol.writeFileSync(
      '/repo/prospec/ai-knowledge/module-map.yaml',
      'modules:\n  - name: lib\n    paths: ["src/lib/**"]\n    keywords: ["lib"]\n',
    );
    const result = await execute({ cwd: CWD, lessonPath: LESSON, today: '2026-07-30' });
    expect(result.warnings.join(' ')).toContain('phantom');
    // phantom must not push impact_modules to the ≥2 threshold → no suggestion
    expect(result.suggestions).toEqual([]);
    const written = vol.readFileSync(LEDGER, 'utf-8') as string;
    expect(written).toContain('| 3 | 1 (lib) |');
    expect(written).not.toContain('phantom');
  });

  it('scores known modules as before when module-map declares them (case-insensitive), without a module warning', async () => {
    seed();
    vol.writeFileSync(
      '/repo/prospec/ai-knowledge/module-map.yaml',
      'modules:\n  - name: lib\n    paths: ["src/lib/**"]\n    keywords: ["lib"]\n  - name: Services\n    paths: ["src/services/**"]\n    keywords: ["services"]\n',
    );
    const result = await execute({ cwd: CWD, lessonPath: LESSON, today: '2026-07-30' });
    expect(result.suggestions).toEqual([
      {
        key: 'fix/parallel-site',
        detail: 'frequency=3 · impact_modules=2 · kind=playbook · rule=freq≥3 ∧ modules≥2 ⇒ suggest',
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('is idempotent for an already-recorded source change', async () => {
    seed({ ...lesson, source_change: 'change-a', impact_modules: [] });
    const result = await execute({ cwd: CWD, lessonPath: LESSON, today: '2026-07-30' });
    expect(result.action).toBe('unchanged');
    expect(vol.readFileSync(LEDGER, 'utf-8')).toContain('| 2 | 1 (lib) |');
  });

  it('creates the ledger scaffold when none exists', async () => {
    vol.fromJSON({ [LESSON]: JSON.stringify({ ...lesson, key: 'new/lesson' }) });
    const result = await execute({ cwd: CWD, lessonPath: LESSON, today: '2026-07-30' });
    expect(result.action).toBe('created');
    expect(vol.readFileSync(LEDGER, 'utf-8')).toContain('| new/lesson |');
  });

  it('honors .prospec.yaml learn.thresholds overrides in the rule string', async () => {
    globalThis.__learnTestConfig = {
      project: { name: 'demo' },
      learn: { thresholds: { frequency: 2, impact_modules: 1 } },
    };
    seed({ ...lesson, impact_modules: [] });
    const result = await execute({ cwd: CWD, lessonPath: LESSON, today: '2026-07-30' });
    expect(result.suggestions[0]!.detail).toContain('rule=freq≥2 ∧ modules≥1 ⇒ suggest');
  });

  it('lists playbook entries past TTL as needs-review', async () => {
    seed();
    vol.mkdirSync('/repo/prospec/ai-knowledge', { recursive: true });
    vol.writeFileSync(
      '/repo/prospec/ai-knowledge/_playbook.md',
      '### PB-001: rule\n- **TTL**: review by 2026-01-01\n',
    );
    const result = await execute({ cwd: CWD, lessonPath: LESSON, today: '2026-07-30' });
    expect(result.expiredPlaybook).toEqual([{ entry: 'PB-001: rule', reviewBy: '2026-01-01' }]);
  });

  it('rejects malformed lesson input with guidance', async () => {
    seed({ key: '', description: 'd', kind: 'playbook', source_change: 'c' });
    await expect(execute({ cwd: CWD, lessonPath: LESSON })).rejects.toThrow(
      /Lesson failed validation/,
    );
  });
});

describe('learn yield service', () => {
  it('computes lens yield report across archived reviews', async () => {
    vol.fromJSON({
      '/repo/.prospec/archive/2026-01-01-feat-a/review.md': `
# Review Findings: feat-a
| ID | Location | Severity | Lens | Status | Origin | Summary | Repro |
|---|---|---|---|---|---|---|---|
| F-1 | a.ts:1 | critical | correctness | fixed | 1 | bug |  |
`,
      '/repo/.prospec/archive/2026-01-02-feat-b/review.md': `
# Review Findings: feat-b
| ID | Location | Severity | Lens | Status | Origin | Summary | Repro |
|---|---|---|---|---|---|---|---|
| F-2 | b.ts:1 | major | security | not-found | 1 | fp |  |
`,
    });

    const report = await executeYield({ cwd: CWD });
    expect(report.total_changes_analyzed).toBe(2);
    expect(report.stats.length).toBe(2);
    const correctness = report.stats.find((s) => s.lens === 'correctness');
    expect(correctness?.invocations).toBe(1);
    expect(correctness?.confirmed_findings).toBe(1);
  });

  it('rejects invalid learn.lens_thresholds in .prospec.yaml with PrerequisiteError', async () => {
    globalThis.__learnTestConfig = {
      project: { name: 'demo' },
      learn: {
        lens_thresholds: {
          min_invocations: -1, // invalid negative number
        },
      },
    };

    await expect(executeYield({ cwd: CWD })).rejects.toThrow(PrerequisiteError);
  });
});

// REQ-SERVICES-123 — the per-change playbook reader: readPlaybook → catalog engine.
describe('learn playbook service', () => {
  const PLAYBOOK = '/repo/prospec/ai-knowledge/_playbook.md';
  const CONTENT = `## Entries

### PB-001: Lib rule
- **Source**: a · **Criteria**: freq=3, modules=2 (lib, cli) · **Kind**: convention · **Approved-by**: x · **Date**: 2026-06-13
- **TTL**: review by 2027-01-01
- **Guidance**: lib.

### PB-002: Templates rule
- **Source**: b · **Criteria**: freq=3, modules=1 (templates) · **Kind**: playbook · **Approved-by**: x · **Date**: 2026-06-13
- **TTL**: review by 2027-01-01
- **Guidance**: templates.

## Retired Entries

### PB-003: Gone
- **Source**: c · **Criteria**: freq=3, modules=1 (lib) · **Kind**: playbook · **Approved-by**: x · **Date**: 2026-06-13
- **RETIRED 2026-08-04**: gone.
`;

  it('returns the whole active catalog with module matches first', async () => {
    vol.fromJSON({ [PLAYBOOK]: CONTENT });
    const r = await executePlaybook({ cwd: CWD, modules: ['lib,services'] });
    expect(r.available).toBe(true);
    expect(r.path).toBe('prospec/ai-knowledge/_playbook.md');
    expect(r.catalog.map((c) => [c.entry.id, c.matched])).toEqual([
      ['PB-001', true],
      ['PB-002', false],
    ]);
    expect(r.entry).toBeNull();
  });

  it('accepts station-only and station plus modules, and returns mode and diagnostics', async () => {
    vol.fromJSON({ [PLAYBOOK]: CONTENT });
    const stationOnly = await executePlaybook({ cwd: CWD, station: 'prospec-implement' });
    expect(stationOnly.mode).toBe('legacy-fallback');
    expect(stationOnly.warnings).toContainEqual({ kind: 'fallback' });
    const withModules = await executePlaybook({ cwd: CWD, station: 'implement', modules: ['lib'] });
    expect(withModules.catalog[0]?.entry.id).toBe('PB-001');
  });

  it('diagnoses all active catalog entries but only the requested id in id mode', async () => {
    const content = CONTENT.replace('- **Guidance**: lib.', '- **Stations**: plan, bogus\n- **Guidance**: ' + 'x'.repeat(1200))
      .replace('- **Guidance**: templates.', '- **Stations**: implement\n- **Guidance**: ' + 'y'.repeat(1200));
    vol.fromJSON({ [PLAYBOOK]: content });
    const catalog = await executePlaybook({ cwd: CWD, station: 'implement' });
    expect(catalog.mode).toBe('station');
    expect(catalog.warnings.map((w) => [w.kind, 'id' in w ? w.id : ''])).toEqual([
      ['unknown-station', 'PB-001'], ['over-limit', 'PB-001'], ['over-limit', 'PB-002'],
    ]);
    const one = await executePlaybook({ cwd: CWD, id: 'PB-002' });
    expect(one.warnings.map((w) => [w.kind, 'id' in w ? w.id : ''])).toEqual([['over-limit', 'PB-002']]);
  });

  it('validates every selector combination before trying to read the playbook', async () => {
    for (const options of [
      { cwd: CWD, station: '' },
      { cwd: CWD, station: 'all' },
      { cwd: CWD, station: 'bogus' },
      { cwd: CWD, station: 'plan', id: 'PB-001' },
      { cwd: CWD, station: 'plan', modules: [' '] },
    ]) {
      await expect(executePlaybook(options)).rejects.toThrow(PrerequisiteError);
    }
  });

  it('returns one entry by id and refuses an unknown or retired id by name', async () => {
    vol.fromJSON({ [PLAYBOOK]: CONTENT });
    expect((await executePlaybook({ cwd: CWD, id: 'PB-002' })).entry?.id).toBe('PB-002');
    await expect(executePlaybook({ cwd: CWD, id: 'PB-999' })).rejects.toThrow(/PB-999/);
    await expect(executePlaybook({ cwd: CWD, id: 'PB-003' })).rejects.toThrow(PrerequisiteError);
  });

  it('reports an absent playbook as unavailable with an empty catalog, never an error', async () => {
    vol.fromJSON({ '/repo/prospec/ai-knowledge/.keep': '' });
    expect(await executePlaybook({ cwd: CWD, modules: ['lib'] })).toEqual({
      path: 'prospec/ai-knowledge/_playbook.md',
      available: false,
      catalog: [],
      entry: null,
      mode: 'modules',
      warnings: [],
    });
  });

  it('refuses a playbook that exists but cannot be read, naming the path and the reason — never an empty catalog', async () => {
    // a directory where the file should be: exists, contained, unreadable
    vol.mkdirSync(PLAYBOOK, { recursive: true });
    const err = await executePlaybook({ cwd: CWD, modules: ['lib'] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PrerequisiteError);
    expect((err as PrerequisiteError).message).toContain('prospec/ai-knowledge/_playbook.md');
    expect((err as PrerequisiteError).message).toContain('unreadable');
    expect((err as PrerequisiteError).suggestion).toBe('Make it a readable file');
  });

  it('refuses a playbook that resolves outside the knowledge directory, naming the path and the reason', async () => {
    vol.fromJSON({ '/repo/outside.md': CONTENT, '/repo/prospec/ai-knowledge/.keep': '' });
    vol.symlinkSync('/repo/outside.md', PLAYBOOK);
    const err = await executePlaybook({ cwd: CWD, id: 'PB-001' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PrerequisiteError);
    expect((err as PrerequisiteError).message).toContain('prospec/ai-knowledge/_playbook.md');
    expect((err as PrerequisiteError).message).toContain('escaped');
    expect((err as PrerequisiteError).suggestion).toContain('outside the knowledge directory');
  });

  it('refuses when neither selector, both selectors, or no usable module name is given, naming the flags', async () => {
    vol.fromJSON({ [PLAYBOOK]: CONTENT });
    for (const options of [{ cwd: CWD }, { cwd: CWD, modules: ['lib'], id: 'PB-001' }]) {
      const err = await executePlaybook(options).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PrerequisiteError);
      expect((err as PrerequisiteError).message).toContain('--modules');
      expect((err as PrerequisiteError).message).toContain('--id');
    }
    await expect(executePlaybook({ cwd: CWD, modules: [' , '] })).rejects.toThrow(/--modules/);
  });
});
