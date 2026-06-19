import { describe, it, expect } from 'vitest';
import {
  buildDependencyRules,
  constitutionFallbackModuleMap,
  constitutionFallbackRules,
  evaluateDanglingPrefix,
  evaluateFeatureModules,
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
  FeatureMapGovernanceSource,
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
  featureMapGovernance: { available: true, featureMap: { features: [] }, moduleNames: [], specs: [] },
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

  it('counts a warn-only knowledge-health check and embeds its knowledge_health block', () => {
    const report = runChecks({
      ...emptyInputs,
      timestamps: {
        available: true,
        modules: [
          {
            name: 'lib',
            readme_path: 'k/modules/lib/README.md',
            readme_exists: false,
            last_src_commit: '2026-06-12T00:00:00Z',
            last_readme_commit: null,
          },
        ],
      },
    });
    expect(report.summary.warn_count).toBe(1);
    expect(report.summary.fail_count).toBe(0);
    expect(report.structural.checks.find((c) => c.id === 'knowledge-health')?.status).toBe('warn');
    expect(report.structural.knowledge_health).toEqual({
      modules: [
        { name: 'lib', last_src_commit: '2026-06-12T00:00:00Z', last_readme_commit: null, stale: true },
      ],
      coverage: { documented: 0, total: 1 },
    });
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

describe('unavailable sources without an explicit reason (default fallback message)', () => {
  it('evaluateReqReferences falls back to "source unavailable" when no reason is supplied', () => {
    const r = evaluateReqReferences({ available: false, ids: [] }, []);
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toBe('source unavailable');
  });

  it('evaluateFilePaths falls back to "source unavailable" when no reason is supplied', () => {
    const r = evaluateFilePaths({ available: false, links: [] });
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toBe('source unavailable');
  });

  it('evaluateImportDirection falls back to "source unavailable" when no reason is supplied', () => {
    const r = evaluateImportDirection({ available: false, edges: [] }, constitutionFallbackRules());
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toBe('source unavailable');
  });

  it('evaluateKnowledgeHealth falls back to "source unavailable" when no reason is supplied', () => {
    const r = evaluateKnowledgeHealth({ available: false, modules: [] });
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toBe('source unavailable');
  });

  it('evaluateTaskCompletion falls back to "source unavailable" when no reason is supplied', () => {
    const r = evaluateTaskCompletion({ available: false, changes: [] });
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toBe('source unavailable');
  });
});

describe('evaluateImportDirection — unknown from_module', () => {
  it('treats an edge whose from_module has no allow-list entry as illegal (?? false fallback)', () => {
    const rules = buildDependencyRules({
      modules: [{ name: 'a', paths: ['src/a'], keywords: [], relationships: { depends_on: ['b'] } }],
    });
    const r = evaluateImportDirection(
      {
        available: true,
        edges: [
          // 'ghost' is absent from the module map → allowed.get(...) is undefined → ?? false
          { from_path: 'src/ghost/x.ts', from_module: 'ghost', to_module: 'b', specifier: '../b/y.js', line: 4 },
        ],
      },
      rules,
    );
    expect(r.result.status).toBe('fail');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.detail).toContain('ghost → b');
  });
});

describe('evaluateKnowledgeHealth — isStale null-commit short circuit', () => {
  it('is never stale when the source commit is null even though a README exists (isStale L253)', () => {
    const r = evaluateKnowledgeHealth({
      available: true,
      modules: [
        {
          name: 'lib',
          readme_path: 'k/modules/lib/README.md',
          readme_exists: true,
          last_src_commit: null,
          last_readme_commit: '2026-06-11T00:00:00+00:00',
        },
      ],
    });
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
    expect(r.knowledgeHealth?.modules[0]?.stale).toBe(false);
  });

  it('is never stale when the README commit is null even though a README exists (isStale L253)', () => {
    const r = evaluateKnowledgeHealth({
      available: true,
      modules: [
        {
          name: 'lib',
          readme_path: 'k/modules/lib/README.md',
          readme_exists: true,
          last_src_commit: '2026-06-12T00:00:00+00:00',
          last_readme_commit: null,
        },
      ],
    });
    expect(r.result.status).toBe('pass');
    expect(r.knowledgeHealth?.modules[0]?.stale).toBe(false);
  });
});

describe('compareFindings — detail-level tiebreak (byCodepoint terminal operand)', () => {
  it('orders two findings that match on check/source_path/line purely by detail (L269 + L261 x<y)', () => {
    const report = runChecks({
      ...emptyInputs,
      reqDefinitions: { available: true, ids: [] },
      reqReferences: [
        { id: 'REQ-Z-001', source_path: 'a.md', line: 1 },
        { id: 'REQ-A-001', source_path: 'a.md', line: 1 },
      ],
    });
    // Same check, source_path, and line → tiebreak falls through to detail.
    // 'REQ-A-001' sorts before 'REQ-Z-001' by codepoint on the detail string.
    expect(report.structural.findings).toHaveLength(2);
    expect(report.structural.findings.map((f) => f.detail)).toEqual([
      'dangling reference: REQ-A-001 is not defined in any feature spec',
      'dangling reference: REQ-Z-001 is not defined in any feature spec',
    ]);
  });

  it('keeps the same detail order when the smaller id is supplied first (byCodepoint x>y branch)', () => {
    // Input order [A, Z] makes the comparator evaluate byCodepoint(Z-detail, A-detail)
    // → x > y → +1, exercising the opposite ternary side from the test above.
    const report = runChecks({
      ...emptyInputs,
      reqDefinitions: { available: true, ids: [] },
      reqReferences: [
        { id: 'REQ-A-001', source_path: 'a.md', line: 1 },
        { id: 'REQ-Z-001', source_path: 'a.md', line: 1 },
      ],
    });
    expect(report.structural.findings.map((f) => f.detail)).toEqual([
      'dangling reference: REQ-A-001 is not defined in any feature spec',
      'dangling reference: REQ-Z-001 is not defined in any feature spec',
    ]);
  });
});

describe('buildDependencyRules — module without relationships', () => {
  it('treats a module that declares no relationships as importing nothing (L60 optional-chain undefined side)', () => {
    const rules = buildDependencyRules({
      modules: [
        { name: 'a', paths: ['src/a'], keywords: [] },
        { name: 'b', paths: ['src/b'], keywords: [], relationships: { depends_on: [] } },
      ],
    });
    expect(rules.allowed.get('a')?.size).toBe(0);
    const r = evaluateImportDirection(
      {
        available: true,
        edges: [{ from_path: 'src/a/x.ts', from_module: 'a', to_module: 'b', specifier: '../b/y.js', line: 1 }],
      },
      rules,
    );
    // 'a' declares no depends_on at all, so importing 'b' is illegal.
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]?.detail).toContain('a → b');
  });
});

const governance = (
  specs: FeatureMapGovernanceSource['specs'],
  features: FeatureMapGovernanceSource['featureMap']['features'],
): FeatureMapGovernanceSource => ({
  available: true,
  featureMap: { features },
  moduleNames: ['lib', 'types'],
  specs,
});

const unavailableGovernance: FeatureMapGovernanceSource = {
  available: false,
  reason: 'source unavailable: feature-map.yaml not present (optional index — checks skipped)',
  featureMap: { features: [] },
  moduleNames: [],
  specs: [],
};

describe('evaluateDanglingPrefix (REQ-LIB-018)', () => {
  it('skips when feature-map.yaml is unavailable (never a false positive)', () => {
    const r = evaluateDanglingPrefix(unavailableGovernance);
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toContain('source unavailable');
  });

  it('passes when every prefix is a module or a declared req_prefix', () => {
    const r = evaluateDanglingPrefix(
      governance(
        [
          {
            feature: 'alpha',
            source_path: 'specs/features/alpha.md',
            reqs: [
              { id: 'REQ-LIB-001', prefix: 'LIB', line: 1 },
              { id: 'REQ-DOM-002', prefix: 'DOM', line: 2 },
            ],
          },
        ],
        [{ feature: 'alpha', modules: ['lib'], req_prefixes: ['DOM'], status: 'active' }],
      ),
    );
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('warns once per distinct illegal prefix, at its first occurrence (warn-class)', () => {
    const r = evaluateDanglingPrefix(
      governance(
        [
          {
            feature: 'alpha',
            source_path: 'specs/features/alpha.md',
            reqs: [
              { id: 'REQ-GHOST-001', prefix: 'GHOST', line: 5 },
              { id: 'REQ-GHOST-002', prefix: 'GHOST', line: 9 },
            ],
          },
        ],
        [{ feature: 'alpha', modules: ['lib'], status: 'active' }],
      ),
    );
    expect(r.result.status).toBe('warn');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ check: 'dangling-prefix', severity: 'warn', line: 5 });
    expect(r.findings[0]?.detail).toContain('GHOST');
  });

  it('flips pass→warn when a declared req_prefix is removed (mutation sense)', () => {
    const specs = [
      { feature: 'alpha', source_path: 'a.md', reqs: [{ id: 'REQ-DOM-001', prefix: 'DOM', line: 1 }] },
    ];
    expect(
      evaluateDanglingPrefix(
        governance(specs, [{ feature: 'alpha', modules: ['lib'], req_prefixes: ['DOM'], status: 'active' }]),
      ).result.status,
    ).toBe('pass');
    expect(
      evaluateDanglingPrefix(
        governance(specs, [{ feature: 'alpha', modules: ['lib'], status: 'active' }]),
      ).result.status,
    ).toBe('warn');
  });

  it('treats declared req_prefixes case-insensitively (lowercase curation does not spuriously warn)', () => {
    const r = evaluateDanglingPrefix(
      governance(
        [{ feature: 'alpha', source_path: 'a.md', reqs: [{ id: 'REQ-DOM-001', prefix: 'DOM', line: 1 }] }],
        [{ feature: 'alpha', modules: ['lib'], req_prefixes: ['dom'], status: 'active' }],
      ),
    );
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });
});

describe('evaluateFeatureModules (REQ-LIB-019)', () => {
  it('skips when feature-map.yaml is unavailable', () => {
    const r = evaluateFeatureModules(unavailableGovernance);
    expect(r.result.status).toBe('skipped');
  });

  it('passes when a module-prefix REQ module is declared in the feature modules', () => {
    const r = evaluateFeatureModules(
      governance(
        [{ feature: 'alpha', source_path: 'a.md', reqs: [{ id: 'REQ-LIB-001', prefix: 'LIB', line: 3 }] }],
        [{ feature: 'alpha', modules: ['lib'], status: 'active' }],
      ),
    );
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('fails when a module-prefix REQ references a module absent from feature modules (fail-class)', () => {
    const r = evaluateFeatureModules(
      governance(
        [{ feature: 'alpha', source_path: 'a.md', reqs: [{ id: 'REQ-TYPES-001', prefix: 'TYPES', line: 7 }] }],
        [{ feature: 'alpha', modules: ['lib'], status: 'active' }],
      ),
    );
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]).toMatchObject({ check: 'feature-modules', severity: 'fail', line: 7 });
    expect(r.findings[0]?.detail).toContain('types');
  });

  it('skips a feature spec with no feature-map entry — dangling-prefix still covers its prefixes', () => {
    const r = evaluateFeatureModules(
      governance(
        [{ feature: 'orphan', source_path: 'o.md', reqs: [{ id: 'REQ-TYPES-001', prefix: 'TYPES', line: 1 }] }],
        [{ feature: 'alpha', modules: ['lib'], status: 'active' }],
      ),
    );
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('ignores non-module prefixes (those belong to dangling-prefix)', () => {
    const r = evaluateFeatureModules(
      governance(
        [{ feature: 'alpha', source_path: 'a.md', reqs: [{ id: 'REQ-DOM-001', prefix: 'DOM', line: 1 }] }],
        [{ feature: 'alpha', modules: ['lib'], status: 'active' }],
      ),
    );
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });
});
