import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { executeYield } from '../../../src/services/learn.service.js';
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

const review = (lenses: string[], rows: string[]): string =>
  `<!-- prospec:review-metrics round="1" lenses="${lenses.join(',')}" -->\n# Review Findings: x\n\n| ID | Location | Severity | Lens | Status | Summary |\n|---|---|---|---|---|---|\n${rows.map((r) => `${r}\n`).join('')}`;

describe('executeYield service', () => {
  it('returns empty report when .prospec/archive is empty or does not exist', async () => {
    const report = await executeYield({ cwd: CWD });
    expect(report.total_changes_analyzed).toBe(0);
    expect(report.stats).toEqual([]);
    expect(report.thresholds.consecutive_zero_threshold).toBe(5);
  });

  it('scans archived reviews and computes lens yield report', async () => {
    vol.fromJSON({
      '/repo/.prospec/archive/2026-01-01-change-one/review.md': `<!-- prospec:review-metrics round="1" lenses="correctness,security" -->
# Review Findings: change-one

| ID | Location | Severity | Lens | Status | Summary |
|---|---|---|---|---|---|
| C-1 | src/a.ts:10 | critical | correctness | fixed | bug in a |
| M-1 | src/b.ts:20 | major | security | not-found | false positive |
`,
      '/repo/.prospec/archive/2026-01-02-change-two/review.md': `<!-- prospec:review-metrics round="1" lenses="correctness,security" -->
# Review Findings: change-two

| ID | Location | Severity | Lens | Status | Summary |
|---|---|---|---|---|---|
| C-2 | src/c.ts:15 | critical | correctness | verified | bug in c |
| M-2 | src/d.ts:25 | major | security | not-found | false positive 2 |
`,
    });

    const report = await executeYield({
      cwd: CWD,
      consecutiveZeroThreshold: 2,
      minInvocations: 2,
    });

    expect(report.total_changes_analyzed).toBe(2);
    expect(report.stats.length).toBe(2);

    const correctness = report.stats.find((s) => s.lens === 'correctness');
    expect(correctness).toBeDefined();
    expect(correctness?.invocations).toBe(2);
    expect(correctness?.confirmed_findings).toBe(2);
    expect(correctness?.yield_ratio).toBe(1);
    expect(correctness?.action).toBe('keep');

    const security = report.stats.find((s) => s.lens === 'security');
    expect(security).toBeDefined();
    expect(security?.invocations).toBe(2);
    expect(security?.confirmed_findings).toBe(0);
    expect(security?.consecutive_zero_changes).toBe(2);
    expect(security?.action).toBe('retire');
  });

  it('honors config overrides for thresholds', async () => {
    globalThis.__learnTestConfig = {
      project: { name: 'demo' },
      learn: {
        lens_thresholds: {
          consecutive_zero_threshold: 3,
          min_invocations: 1,
          min_yield: 0.2,
        },
      },
    };

    vol.fromJSON({
      '/repo/.prospec/archive/2026-01-01-change-one/review.md': `
# Review Findings: change-one

| ID | Location | Severity | Lens | Status | Summary |
|---|---|---|---|---|---|
| C-1 | src/a.ts:10 | critical | style | not-found | bad format |
`,
    });

    const report = await executeYield({ cwd: CWD });
    expect(report.thresholds.consecutive_zero_threshold).toBe(3);
    expect(report.thresholds.min_invocations).toBe(1);
    expect(report.thresholds.min_yield).toBe(0.2);
  });

  it('merges --corpus directories resolved against cwd and orders changes chronologically (REQ-CLI-044)', async () => {
    vol.fromJSON({
      '/repo/.prospec/archive/2026-01-03-c/review.md': review(['security'], []),
      '/elsewhere/corpus/2026-01-01-a/review.md': review(['security'], ['| C-1 | a.ts:1 | critical | security | fixed | bug |']),
      '/elsewhere/corpus/2026-01-02-b/review.md': review(['security'], []),
    });
    const report = await executeYield({
      cwd: CWD,
      extraCorpusDirs: ['../elsewhere/corpus'],
      consecutiveZeroThreshold: 2,
      minInvocations: 3,
    });
    expect(report.total_changes_analyzed).toBe(3);
    const security = report.stats.find((s) => s.lens === 'security');
    expect(security?.invocations).toBe(3);
    expect(security?.last_yield_change).toBe('a');
    expect(security?.consecutive_zero_changes).toBe(2); // b, c after a — order matters
    expect(security?.action).toBe('retire');
  });

  it('refuses a --corpus path that is not an existing directory, while the default archive may be absent', async () => {
    vol.fromJSON({ '/repo/not-a-dir.txt': 'x' });
    await expect(executeYield({ cwd: CWD, extraCorpusDirs: ['/nowhere'] })).rejects.toBeInstanceOf(PrerequisiteError);
    await expect(executeYield({ cwd: CWD, extraCorpusDirs: ['not-a-dir.txt'] })).rejects.toThrow(/--corpus/);
    const report = await executeYield({ cwd: CWD });
    expect(report.total_changes_analyzed).toBe(0);
  });

  it('orders same-day and undated changes by code point, independent of the process locale', async () => {
    vol.fromJSON({
      '/repo/.prospec/archive/2026-02-01-Foo/review.md': review(['security'], ['| C-1 | a.ts:1 | critical | security | fixed | bug |']),
      '/repo/.prospec/archive/2026-02-01-bar/review.md': review(['security'], []),
      '/repo/.prospec/archive/undated/review.md': review(['security'], []),
    });
    const report = await executeYield({ cwd: CWD });
    const security = report.stats.find((s) => s.lens === 'security');
    // undated first, then 'Foo' (U+0046) before 'bar' (U+0062): bar is the last, zero-yield, observation
    expect(security?.last_yield_change).toBe('Foo');
    expect(security?.consecutive_zero_changes).toBe(1);
  });
});
