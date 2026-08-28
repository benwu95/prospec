import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { execute, executeYield } from '../../../src/services/learn.service.js';
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
