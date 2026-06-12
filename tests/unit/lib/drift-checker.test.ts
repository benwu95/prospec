import { describe, it, expect } from 'vitest';
import {
  buildDependencyRules,
  constitutionFallbackModuleMap,
  constitutionFallbackRules,
  evaluateFilePaths,
  evaluateImportDirection,
  evaluateKnowledgeHealth,
  evaluateReqReferences,
  evaluateTaskCompletion,
  runChecks,
  type DriftCheckInputs,
} from '../../../src/lib/drift-checker.js';
import { DRIFT_CHECK_IDS } from '../../../src/types/drift-report.js';
import type {
  GitTimestampSource,
  TaskSource,
} from '../../../src/lib/drift-sources.js';

const emptyInputs: DriftCheckInputs = {
  reqDefinitions: { available: true, ids: [] },
  reqReferences: [],
  links: { available: true, links: [] },
  importEdges: { available: true, edges: [] },
  dependencyRules: constitutionFallbackRules(),
  timestamps: { available: true, modules: [] },
  tasks: { available: true, changes: [] },
  generatedAt: '2026-06-12T00:00:00Z',
};

describe('evaluateReqReferences', () => {
  it('fails on dangling references with source location', () => {
    const r = evaluateReqReferences(
      { available: true, ids: ['REQ-A-001'] },
      [
        { id: 'REQ-A-001', source_path: 'a.md', line: 1 },
        { id: 'REQ-B-009', source_path: 'b.md', line: 7 },
      ],
    );
    expect(r.result.status).toBe('fail');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ source_path: 'b.md', line: 7, severity: 'fail' });
    expect(r.findings[0]?.detail).toContain('REQ-B-009');
  });

  it('passes when every reference resolves', () => {
    const r = evaluateReqReferences({ available: true, ids: ['REQ-A-001'] }, [
      { id: 'REQ-A-001', source_path: 'a.md', line: 1 },
    ]);
    expect(r.result.status).toBe('pass');
  });

  it('skips with reason when the definition source is unavailable', () => {
    const r = evaluateReqReferences({ available: false, reason: 'source unavailable: x', ids: [] }, []);
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toContain('source unavailable');
  });
});

describe('evaluateFilePaths', () => {
  it('fails only on non-existing targets', () => {
    const r = evaluateFilePaths({
      available: true,
      links: [
        { raw_target: 'ok.md', resolved_path: 'docs/ok.md', exists: true, source_path: 'docs/a.md', line: 1 },
        { raw_target: 'gone.md', resolved_path: 'docs/gone.md', exists: false, source_path: 'docs/a.md', line: 2 },
      ],
    });
    expect(r.result.status).toBe('fail');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.detail).toContain('docs/gone.md');
  });

  it('skips with reason when no markdown roots exist (FR-007 honesty)', () => {
    const r = evaluateFilePaths({ available: false, reason: 'source unavailable: no markdown roots (specs/knowledge) found', links: [] });
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toContain('source unavailable');
  });
});

describe('evaluateImportDirection', () => {
  it('fails edges not declared in depends_on (module-map driven, REQ-LIB-014 AC4)', () => {
    const rules = buildDependencyRules({
      modules: [
        { name: 'a', paths: ['src/a'], keywords: [], relationships: { depends_on: ['b'] } },
        { name: 'b', paths: ['src/b'], keywords: [], relationships: { depends_on: [] } },
      ],
    });
    const r = evaluateImportDirection(
      {
        available: true,
        edges: [
          { from_path: 'src/a/x.ts', from_module: 'a', to_module: 'b', specifier: '../b/y.js', line: 1 },
          { from_path: 'src/b/y.ts', from_module: 'b', to_module: 'a', specifier: '../a/x.js', line: 2 },
        ],
      },
      rules,
    );
    expect(r.result.status).toBe('fail');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.detail).toContain('b → a');
  });

  it('constitution fallback allows lower-layer imports and rejects upward ones', () => {
    const rules = constitutionFallbackRules();
    expect(rules.source).toBe('constitution-fallback');
    const ok = evaluateImportDirection(
      {
        available: true,
        edges: [{ from_path: 'src/cli/c.ts', from_module: 'cli', to_module: 'types', specifier: '../types/t.js', line: 1 }],
      },
      rules,
    );
    expect(ok.result.status).toBe('pass');
    const bad = evaluateImportDirection(
      {
        available: true,
        edges: [{ from_path: 'src/lib/l.ts', from_module: 'lib', to_module: 'services', specifier: '../services/s.js', line: 1 }],
      },
      rules,
    );
    expect(bad.result.status).toBe('fail');
  });

  it('skips with reason when no module path exists on disk (FR-007 honesty)', () => {
    const r = evaluateImportDirection(
      { available: false, reason: 'source unavailable: none of the module paths exist on disk', edges: [] },
      constitutionFallbackRules(),
    );
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toContain('source unavailable');
  });
});

describe('evaluateKnowledgeHealth', () => {
  const stamps = (over: Partial<GitTimestampSource['modules'][number]>): GitTimestampSource => ({
    available: true,
    modules: [
      {
        name: 'lib',
        readme_path: 'k/modules/lib/README.md',
        readme_exists: true,
        last_src_commit: '2026-06-10T00:00:00+00:00',
        last_readme_commit: '2026-06-11T00:00:00+00:00',
        ...over,
      },
    ],
  });

  it('warns (never fails) when source is newer than README', () => {
    const r = evaluateKnowledgeHealth(
      stamps({ last_src_commit: '2026-06-12T00:00:00+00:00' }),
    );
    expect(r.result.status).toBe('warn');
    expect(r.findings[0]?.severity).toBe('warn');
    expect(r.knowledgeHealth?.modules[0]?.stale).toBe(true);
  });

  it('compares timestamps by instant, not by string (timezone offsets)', () => {
    // Same instant expressed in different offsets must NOT be stale.
    const r = evaluateKnowledgeHealth(
      stamps({
        last_src_commit: '2026-06-11T08:00:00+08:00',
        last_readme_commit: '2026-06-11T00:00:00+00:00',
      }),
    );
    expect(r.result.status).toBe('pass');
    expect(r.knowledgeHealth?.modules[0]?.stale).toBe(false);
  });

  it('treats a missing README as a coverage gap warning', () => {
    const r = evaluateKnowledgeHealth(
      stamps({ readme_exists: false, last_readme_commit: null }),
    );
    expect(r.result.status).toBe('warn');
    expect(r.findings[0]?.detail).toContain('coverage gap');
    expect(r.knowledgeHealth?.coverage).toEqual({ documented: 0, total: 1 });
  });

  it('skips with reason when git timestamps are unavailable', () => {
    const r = evaluateKnowledgeHealth({ available: false, reason: 'source unavailable: not a git repository', modules: [] });
    expect(r.result.status).toBe('skipped');
    expect(r.knowledgeHealth).toBeUndefined();
  });

  it('never produces a fail status regardless of findings volume (REQ-LIB-015 AC1)', () => {
    const r = evaluateKnowledgeHealth({
      available: true,
      modules: Array.from({ length: 5 }, (_, i) => ({
        name: `m${i}`,
        readme_path: `k/m${i}/README.md`,
        readme_exists: false,
        last_src_commit: '2026-06-12T00:00:00Z',
        last_readme_commit: null,
      })),
    });
    expect(r.result.status).toBe('warn');
  });
});

describe('evaluateTaskCompletion', () => {
  const tasks = (items: Array<[boolean, 'code' | 'manual' | 'verification']>): TaskSource => ({
    available: true,
    changes: [
      {
        name: 'c1',
        tasks_path: '.prospec/changes/c1/tasks.md',
        tasks: items.map(([checked, kind], i) => ({ checked, kind, text: `t${i}`, line: i + 1 })),
      },
    ],
  });

  it('fails on unchecked code tasks only — [M]/[V] never count (REQ-LIB-016)', () => {
    const r = evaluateTaskCompletion(tasks([[false, 'code'], [false, 'manual'], [false, 'verification'], [true, 'code']]));
    expect(r.result.status).toBe('fail');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.line).toBe(1);
  });

  it('passes when all code tasks are checked', () => {
    const r = evaluateTaskCompletion(tasks([[true, 'code'], [false, 'manual']]));
    expect(r.result.status).toBe('pass');
  });

  it('skips with reason when .prospec/changes is unavailable', () => {
    const r = evaluateTaskCompletion({ available: false, reason: 'source unavailable: .prospec/changes/ not found', changes: [] });
    expect(r.result.status).toBe('skipped');
  });
});

describe('runChecks', () => {
  it('assembles a schema-valid report with frozen check order and not-checked semantic layer', () => {
    const report = runChecks(emptyInputs);
    expect(report.structural.checks.map((c) => c.id)).toEqual([...DRIFT_CHECK_IDS]);
    expect(report.semantic.status).toBe('not-checked');
    expect(report.summary).toEqual({ fail_count: 0, warn_count: 0, skipped_count: 0 });
  });

  it('sorts findings deterministically and is byte-identical across runs (SC-003)', () => {
    const inputs: DriftCheckInputs = {
      ...emptyInputs,
      reqDefinitions: { available: true, ids: [] },
      reqReferences: [
        { id: 'REQ-Z-001', source_path: 'z.md', line: 9 },
        { id: 'REQ-A-001', source_path: 'a.md', line: 2 },
        { id: 'REQ-A-001', source_path: 'a.md', line: 1 },
      ],
      links: {
        available: true,
        links: [
          { raw_target: 'x.md', resolved_path: 'docs/x.md', exists: false, source_path: 'docs/a.md', line: 3 },
        ],
      },
    };
    const r1 = runChecks(inputs);
    const r2 = runChecks(inputs);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    expect(r1.structural.findings.map((f) => `${f.check}:${f.source_path}:${f.line}`)).toEqual([
      'file-paths:docs/a.md:3',
      'req-references:a.md:1',
      'req-references:a.md:2',
      'req-references:z.md:9',
    ]);
    expect(r1.summary.fail_count).toBe(2);
  });

  it('counts skipped checks in the summary and keeps strict-relevant fails apart', () => {
    const report = runChecks({
      ...emptyInputs,
      timestamps: { available: false, reason: 'source unavailable: not a git repository', modules: [] },
      tasks: { available: false, reason: 'source unavailable: .prospec/changes/ not found', changes: [] },
    });
    expect(report.summary.skipped_count).toBe(2);
    expect(report.summary.fail_count).toBe(0);
    const skippedChecks = report.structural.checks.filter((c) => c.status === 'skipped');
    expect(skippedChecks.every((c) => (c.reason ?? '').length > 0)).toBe(true);
  });
});

describe('report integrity', () => {
  it('sorts findings by codepoint, not locale collation (cross-environment determinism)', () => {
    const report = runChecks({
      ...emptyInputs,
      reqDefinitions: { available: true, ids: [] },
      reqReferences: [
        { id: 'REQ-A-001', source_path: 'a.md', line: 1 },
        { id: 'REQ-B-001', source_path: 'B.md', line: 1 },
      ],
    });
    // codepoint order puts uppercase 'B.md' before lowercase 'a.md' regardless of locale
    expect(report.structural.findings.map((f) => f.source_path)).toEqual(['B.md', 'a.md']);
  });

  it('throws the typed DriftReportInvalid when the assembled report violates the schema', () => {
    expect(() =>
      runChecks({
        ...emptyInputs,
        // empty reason on an unavailable source → skipped check without a valid reason
        reqDefinitions: { available: false, reason: '', ids: [] },
      }),
    ).toThrowError(expect.objectContaining({ code: 'DRIFT_REPORT_INVALID' }));
  });
});

describe('constitutionFallbackModuleMap', () => {
  it('declares the four Constitution layers with downward-only depends_on', () => {
    const map = constitutionFallbackModuleMap();
    expect(map.modules.map((m) => m.name)).toEqual(['cli', 'services', 'lib', 'types']);
    const lib = map.modules.find((m) => m.name === 'lib');
    expect(lib?.relationships?.depends_on).toEqual(['types']);
  });
});
