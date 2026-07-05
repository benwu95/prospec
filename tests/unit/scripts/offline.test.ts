import { describe, it, expect } from 'vitest';
import { buildSizeReport } from '../../../scripts/measure/offline.js';
import { assembleFullDump, AssemblyError, type Corpus } from '../../../scripts/measure/assemble.js';
import { SizeReportSchema } from '../../../src/types/measurement.js';
import { TOKEN_ESTIMATOR_LABEL } from '../../../src/lib/token-accounting.js';

const KB = 'prospec/ai-knowledge';

// A small in-memory repo snapshot — the same shape the harness reads at run time.
// No provider adapter, no fs, no network: buildSizeReport is pure.
const contents = new Map<string, string>([
  [`${KB}/_conventions.md`, 'conventions body '.repeat(40)],
  ['prospec/index.md', 'index body '.repeat(40)],
  [`${KB}/modules/lib/README.md`, 'lib readme body '.repeat(40)],
  ['src/lib/token-accounting.ts', 'export const x = 1;\n'.repeat(80)],
]);
const fullDump = assembleFullDump(contents);
const meta = { git_commit: 'deadbeefcafe', generated_at: '2026-07-05T00:00:00.000Z' };

describe('buildSizeReport (offline size estimation)', () => {
  it('estimates every strategy for an assemblable task and stamps the estimator label', () => {
    const corpus: Corpus = {
      id: 'test-corpus',
      tasks: [{ id: 'ok-task', title: 'work on lib', modules: ['lib'], description: 'touch lib' }],
    };
    const { report, skipped } = buildSizeReport({ corpus, contents, fullDump }, meta);

    expect(report.estimator).toBe(TOKEN_ESTIMATOR_LABEL);
    expect(report.corpus).toBe('test-corpus');
    expect(report.git_commit).toBe('deadbeefcafe');
    expect(skipped).toHaveLength(0);
    expect(report.tasks).toHaveLength(1);
    expect(report.tasks[0]?.estimates.map((e) => e.strategy).sort()).toEqual([
      'full-dump',
      'naive-rag',
      'prospec',
    ]);
    // deterministic positive estimates, and prospec is the smallest (layered subset)
    const byStrategy = Object.fromEntries(report.tasks[0]!.estimates.map((e) => [e.strategy, e.cold_input_tokens]));
    expect(byStrategy['prospec']).toBeGreaterThan(0);
    expect(byStrategy['full-dump']).toBeGreaterThan(byStrategy['prospec']!);
  });

  it('produces a schema-valid report with a comparison per baseline', () => {
    const corpus: Corpus = {
      id: 'test-corpus',
      tasks: [{ id: 'ok-task', title: 'work on lib', modules: ['lib'], description: 'touch lib' }],
    };
    const { report } = buildSizeReport({ corpus, contents, fullDump }, meta);

    expect(SizeReportSchema.safeParse(report).success).toBe(true);
    expect(report.comparisons.map((c) => c.baseline).sort()).toEqual(['full-dump', 'naive-rag']);
    const fullDumpCmp = report.comparisons.find((c) => c.baseline === 'full-dump')!;
    expect(fullDumpCmp.baseline_input_tokens).toBeGreaterThan(fullDumpCmp.prospec_input_tokens);
    expect(fullDumpCmp.input_saving_ratio).toBeGreaterThan(0);
    expect(fullDumpCmp.input_saving_ratio).toBeLessThanOrEqual(1);
    // prospec total is the same regardless of which baseline it is compared against
    const naiveCmp = report.comparisons.find((c) => c.baseline === 'naive-rag')!;
    expect(fullDumpCmp.prospec_input_tokens).toBe(naiveCmp.prospec_input_tokens);
  });

  it('skips a task whose live refs are missing (mirrors the online runner), never fatal', () => {
    const corpus: Corpus = {
      id: 'test-corpus',
      tasks: [
        { id: 'ok-task', title: 'work on lib', modules: ['lib'], description: 'touch lib' },
        { id: 'broken-task', title: 'ghost', modules: ['ghost'], description: 'missing module readme' },
      ],
    };
    const { report, skipped } = buildSizeReport({ corpus, contents, fullDump }, meta);

    expect(report.tasks.map((t) => t.task_id)).toEqual(['ok-task']);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.task_id).toBe('broken-task');
    expect(skipped[0]?.reason).toMatch(/does not exist/);
  });

  it('throws when no corpus task can be assembled (report needs ≥1 task)', () => {
    const corpus: Corpus = {
      id: 'test-corpus',
      tasks: [{ id: 'broken', title: 'ghost', modules: ['ghost'], description: 'x' }],
    };
    expect(() => buildSizeReport({ corpus, contents, fullDump }, meta)).toThrow(AssemblyError);
  });
});
