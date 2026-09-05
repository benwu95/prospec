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
  evaluateKnowledgeSize,
  evaluateBudgetOverrides,
  evaluateMcpReadmeCounts,
  evaluateMetadataCompleteness,
  evaluateReqReferences,
  evaluateReqIdUniqueness,
  evaluateArtifactLanguage,
  evaluateLanguagePolicyDrift,
  evaluateConstitutionSeverity,
  evaluateReviewProvenance,
  evaluateDeltaSpecProvenance,
  evaluateDeltaSpecLandingFidelity,
  evaluateSpecCounters,
  evaluateTaskCompletion,
  evaluateTestProvenance,
  evaluateCanonicalDocDrift,
  runChecks,
  type DriftCheckInputs,
} from '../../../src/lib/drift-checker.js';
import { DRIFT_CHECK_IDS, DRIFT_CHECK_SCOPES } from '../../../src/types/drift-report.js';
import { parseConstitutionRules } from '../../../src/lib/constitution-parser.js';
import { exampleRulesFor } from '../../../src/lib/constitution-rules.js';
import type { TechStackResult } from '../../../src/lib/detector.js';
import type {
  ArtifactLanguageSource,
  LanguagePolicyDriftSource,
  ConstitutionRuleSource,
  FeatureMapGovernanceSource,
  GitTimestampSource,
  KnowledgeSizeItem,
  KnowledgeSizeSource,
  MetadataCompletenessSource,
  ReviewProvenanceSource,
  DeltaSpecProvenanceSource,
  DeltaSpecLandingFidelitySource,
  LandingFidelityEntry,
  SpecCounterSource,
  TaskSource,
  TestProvenanceSource,
} from '../../../src/lib/drift-sources.js';
import { whenThenBullets } from '../../../src/lib/landing-fidelity.js';
import {
  KNOWLEDGE_SIZE_KINDS,
  KNOWLEDGE_SIZE_RULES,
  type KnowledgeSizeBudget,
  type KnowledgeSizeKind,
} from '../../../src/types/config.js';
import { TOKEN_ESTIMATOR_LABEL } from '../../../src/lib/token-accounting.js';

// Deliberately tighter than the shipped defaults so a fixture can bust a budget
// with a small number; every field is present so adding a threshold is a compile
// error here rather than a silently ungraded surface.
const BASE_SIZE_BUDGET: KnowledgeSizeBudget = {
  l1_per_file: 1500,
  l2_per_module: 400,
  readme_max_lines: 100,
  spec_per_file: 800,
  demand_knowledge_per_file: 900,
  skill_per_file: 700,
  reference_per_file: 600,
  headroom: 1.0,
};

const emptyInputs: DriftCheckInputs = {
  reqDefinitions: { available: true, ids: [] },
  reqIdUniqueness: { available: true, definitions: new Map() },
  reqReferences: [],
  links: { available: true, links: [] },
  importEdges: { available: true, edges: [] },
  dependencyRules: constitutionFallbackRules(),
  timestamps: { available: true, modules: [] },
  tasks: { available: true, changes: [] },
  featureMapGovernance: { available: true, featureMap: { features: [] }, moduleNames: [], specs: [] },
  mcpReadmeCounts: { available: true, claims: [] },
  reviewProvenance: { available: true, current_digest: 'CUR', working_tree_clean: true, changes: [] },
  deltaSpecProvenance: { available: true, changes: [] },
  deltaSpecLandingFidelity: { available: true, changes: [], entries: [] },
  metadataCompleteness: { available: true, changes: [] },
  knowledgeSize: {
    available: true,
    budget: { ...BASE_SIZE_BUDGET },
    items: [],
  },
  budgetOverrides: {
    available: true,
    source_path: '.prospec.yaml',
    overrides: [],
  },
  testProvenance: {
    available: true,
    command_unavailable_reason: null,
    current_digest: 'CUR',
    working_tree_clean: true,
    changes: [],
  },
  artifactLanguage: { available: true, language: 'Traditional Chinese (Taiwan)', files: [] },
  specCounters: { available: true, specs: [] },
  canonicalDocDrift: { available: true, docs: [] },
  languagePolicyDrift: {
    available: true,
    source_path: 'prospec/CONSTITUTION.md',
    artifact_language: 'Traditional Chinese (Taiwan)',
    trust_zone_language: 'English',
    verdict: 'in-sync',
  },
  constitutionRules: {
    available: true,
    source_path: 'prospec/CONSTITUTION.md',
    rules: [{ name: 'Tagged rule', severity: 'MUST', has_verify_hint: true, line: 5 }],
  },
  generatedAt: '2026-06-12T00:00:00Z',
};

const SIZE_BUDGET: KnowledgeSizeBudget = { ...BASE_SIZE_BUDGET };
const sizeSrc = (items: KnowledgeSizeItem[], budget: KnowledgeSizeBudget = SIZE_BUDGET): KnowledgeSizeSource => ({
  available: true,
  budget,
  items,
});

describe('evaluateKnowledgeSize (REQ-LIB-027)', () => {
  it('skips (never PASS) when the source is unavailable', () => {
    const r = evaluateKnowledgeSize({ available: false, reason: 'source unavailable: knowledge base not found', budget: SIZE_BUDGET, items: [] });
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toContain('source unavailable');
    expect(r.findings).toHaveLength(0);
  });

  it('passes when every file is within budget (boundary ≤ is not over)', () => {
    const r = evaluateKnowledgeSize(sizeSrc([
      { source_path: 'prospec/index.md', kind: 'l1', tokens: 1500, lines: 60 },
      { source_path: 'prospec/ai-knowledge/modules/x/README.md', kind: 'l2', tokens: 400, lines: 100 },
    ]));
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('warns on an L1 file over the per-file token budget', () => {
    const r = evaluateKnowledgeSize(sizeSrc([
      { source_path: 'prospec/index.md', kind: 'l1', tokens: 3118, lines: 61 },
    ]));
    expect(r.result.status).toBe('warn');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ check: 'knowledge-size', severity: 'warn', source_path: 'prospec/index.md' });
    expect(r.findings[0]!.detail).toContain('3118');
    expect(r.findings[0]!.detail).toContain('1500');
  });

  it('warns on an over-budget sub-module with the same L2 budget as a README', () => {
    const r = evaluateKnowledgeSize(sizeSrc([
      { source_path: 'prospec/ai-knowledge/modules/templates/README.md', kind: 'l2', tokens: 300, lines: 40 },
      { source_path: 'prospec/ai-knowledge/modules/templates/skill-authoring.md', kind: 'l2', tokens: 500, lines: 40 },
    ]));
    expect(r.result.status).toBe('warn');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({
      source_path: 'prospec/ai-knowledge/modules/templates/skill-authoring.md',
    });
    expect(r.findings[0]!.detail).not.toContain('README');
  });

  it('warns on an L2 README over the per-module token budget', () => {
    const r = evaluateKnowledgeSize(sizeSrc([
      { source_path: 'prospec/ai-knowledge/modules/lib/README.md', kind: 'l2', tokens: 4683, lines: 100 },
    ]));
    expect(r.result.status).toBe('warn');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.detail).toContain('token budget');
    expect(r.findings[0]!.detail).toContain('4683');
  });

  it('warns on an L2 README over the line budget independently of tokens', () => {
    const r = evaluateKnowledgeSize(sizeSrc([
      { source_path: 'prospec/ai-knowledge/modules/x/README.md', kind: 'l2', tokens: 100, lines: 130 },
    ]));
    expect(r.result.status).toBe('warn');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.detail).toContain('line budget');
    expect(r.findings[0]!.detail).toContain('130');
  });

  it('emits both token and line findings when an L2 README busts both', () => {
    const r = evaluateKnowledgeSize(sizeSrc([
      { source_path: 'prospec/ai-knowledge/modules/x/README.md', kind: 'l2', tokens: 4683, lines: 130 },
    ]));
    expect(r.result.status).toBe('warn');
    expect(r.findings).toHaveLength(2);
    expect(r.findings.map((f) => f.detail).join(' ')).toMatch(/token budget/);
    expect(r.findings.map((f) => f.detail).join(' ')).toMatch(/line budget/);
  });

  it('honours the budget carried on the source (config override)', () => {
    const r = evaluateKnowledgeSize(sizeSrc(
      [{ source_path: 'prospec/index.md', kind: 'l1', tokens: 3118, lines: 61 }],
      { ...BASE_SIZE_BUDGET, l1_per_file: 10000 },
    ));
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('warns when token usage crosses the headroom threshold (pressure signal)', () => {
    const budget = { ...BASE_SIZE_BUDGET, headroom: 0.85 }; // 1500 * 0.85 = 1275
    const r = evaluateKnowledgeSize(sizeSrc([
      { source_path: 'prospec/index.md', kind: 'l1', tokens: 1276, lines: 60 },
    ], budget));
    expect(r.result.status).toBe('warn');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.detail).toContain('pressure signal');
    expect(r.findings[0]?.detail).toContain('1276');
    expect(r.findings[0]?.detail).toContain('0.85');
  });

  it('stays silent when token usage is exactly at the headroom threshold', () => {
    const budget = { ...BASE_SIZE_BUDGET, headroom: 0.85 }; // 1500 * 0.85 = 1275
    const r = evaluateKnowledgeSize(sizeSrc([
      { source_path: 'prospec/index.md', kind: 'l1', tokens: 1275, lines: 60 },
    ], budget));
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  // Each kind's expected limit is a LITERAL, not `BASE_SIZE_BUDGET[rule.tokenKey]`:
  // reading the limit through the rule under test makes the fixture move with the
  // defect, so re-binding a kind to the wrong budget field stays green. The
  // literal-vs-registry agreement is what makes these cases falsifiable; the
  // registry still drives the case LIST, so a new kind with no entry here fails
  // the completeness assertion below rather than shipping ungraded.
  const EXPECTED_LIMIT: Record<KnowledgeSizeKind, number> = {
    l1: 1500,
    l2: 400,
    spec: 800,
    'demand-knowledge': 900,
    skill: 700,
    reference: 600,
  };

  it('covers every kind, and each expected limit matches the budget its rule names', () => {
    expect(Object.keys(EXPECTED_LIMIT).sort()).toEqual([...KNOWLEDGE_SIZE_KINDS].sort());
    for (const kind of KNOWLEDGE_SIZE_KINDS) {
      expect(BASE_SIZE_BUDGET[KNOWLEDGE_SIZE_RULES[kind].tokenKey], kind).toBe(EXPECTED_LIMIT[kind]);
    }
  });

  describe.each(KNOWLEDGE_SIZE_KINDS.map((kind) => [kind, KNOWLEDGE_SIZE_RULES[kind]] as const))(
    'kind %s',
    (kind, rule) => {
      it('warns above its own token budget and stays silent at the inclusive boundary', () => {
        const limit = EXPECTED_LIMIT[kind]!;
        const at = evaluateKnowledgeSize(sizeSrc([{ source_path: 'f.md', kind, tokens: limit, lines: 1 }]));
        expect(at.findings).toHaveLength(0);

        const over = evaluateKnowledgeSize(sizeSrc([{ source_path: 'f.md', kind, tokens: limit + 1, lines: 1 }]));
        expect(over.result.status).toBe('warn');
        const tokenFindings = over.findings.filter((f) => f.detail.includes('token budget'));
        expect(tokenFindings).toHaveLength(1);
        expect(tokenFindings[0]!.detail).toContain(String(limit + 1));
        expect(tokenFindings[0]!.detail).toContain(String(limit));
        expect(tokenFindings[0]!.detail).toContain(rule.tokenKey);
        expect(tokenFindings[0]!.detail).toContain(rule.remedy);
      });

      it('grades lines only when its rule declares a line budget', () => {
        const r = evaluateKnowledgeSize(sizeSrc([
          { source_path: 'f.md', kind, tokens: 1, lines: BASE_SIZE_BUDGET.readme_max_lines + 1 },
        ]));
        const lineFindings = r.findings.filter((f) => f.detail.includes('line budget'));
        expect(lineFindings).toHaveLength('lineKey' in rule ? 1 : 0);
      });

      it('honours a config override of its own budget field', () => {
        const limit = EXPECTED_LIMIT[kind]!;
        const r = evaluateKnowledgeSize(sizeSrc(
          [{ source_path: 'f.md', kind, tokens: limit + 1, lines: 1 }],
          { ...BASE_SIZE_BUDGET, [rule.tokenKey]: limit + 1 },
        ));
        expect(r.findings.filter((f) => f.detail.includes('token budget'))).toHaveLength(0);
      });
    },
  );

  it('names the remedy that fits the surface, not one generic instruction', () => {
    const r = evaluateKnowledgeSize(sizeSrc([
      { source_path: 'prospec/specs/features/big.md', kind: 'spec', tokens: 9999, lines: 1 },
      { source_path: 'prospec/ai-knowledge/_lessons-ledger.md', kind: 'demand-knowledge', tokens: 9999, lines: 1 },
      { source_path: '.claude/skills/prospec-verify/SKILL.md', kind: 'skill', tokens: 9999, lines: 1 },
    ]));
    const detailOf = (p: string): string => r.findings.find((f) => f.source_path === p)!.detail;
    expect(detailOf('prospec/specs/features/big.md')).toContain('slices');
    expect(detailOf('prospec/ai-knowledge/_lessons-ledger.md')).toContain('prospec-learn');
    expect(detailOf('.claude/skills/prospec-verify/SKILL.md')).toContain('on-demand reference');
  });
});

describe('evaluateKnowledgeSize — structured knowledge_size field (REQ-LIB-054)', () => {
  const l1 = KNOWLEDGE_SIZE_RULES.l1;
  const l2 = KNOWLEDGE_SIZE_RULES.l2;

  it('carries over-budget token facts, and keeps `detail` byte-identical', () => {
    const r = evaluateKnowledgeSize(sizeSrc([
      { source_path: 'prospec/index.md', kind: 'l1', tokens: 3118, lines: 61 },
    ]));
    const f = r.findings[0]!;
    expect(f.knowledge_size).toEqual({
      surface: l1.label,
      budget_key: 'l1_per_file',
      budget: 1500,
      actual: 3118,
      unit: 'tokens',
      tier: 'over',
      remedy: l1.remedy,
    });
    expect(f.detail).toBe(
      `${l1.label} over token budget: 3118 tokens (${TOKEN_ESTIMATOR_LABEL}) > 1500 l1_per_file budget — ${l1.remedy}`,
    );
  });

  it('marks the headroom tier with no remedy, and keeps `detail` byte-identical', () => {
    const budget = { ...BASE_SIZE_BUDGET, headroom: 0.85 }; // 1500 * 0.85 = 1275
    const r = evaluateKnowledgeSize(sizeSrc([
      { source_path: 'prospec/index.md', kind: 'l1', tokens: 1276, lines: 60 },
    ], budget));
    const f = r.findings[0]!;
    expect(f.knowledge_size).toEqual({
      surface: l1.label,
      budget_key: 'l1_per_file',
      budget: 1500,
      actual: 1276,
      unit: 'tokens',
      tier: 'headroom',
    });
    expect(f.knowledge_size!.remedy).toBeUndefined();
    expect(f.detail).toBe(
      `${l1.label} pressure signal: 1276 tokens (${TOKEN_ESTIMATOR_LABEL}) approaches 1500 l1_per_file budget (headroom 0.85)`,
    );
  });

  it('reports a line-budget bust in `lines`, and keeps `detail` byte-identical', () => {
    const r = evaluateKnowledgeSize(sizeSrc([
      { source_path: 'prospec/ai-knowledge/modules/x/README.md', kind: 'l2', tokens: 100, lines: 130 },
    ]));
    const f = r.findings[0]!;
    expect(f.knowledge_size).toEqual({
      surface: l2.label,
      budget_key: 'readme_max_lines',
      budget: 100,
      actual: 130,
      unit: 'lines',
      tier: 'over',
      remedy: l2.remedy,
    });
    expect(f.detail).toBe(
      `${l2.label} over line budget: 130 lines > 100 readme_max_lines budget — ${l2.remedy}`,
    );
  });

  it('attaches the field to every knowledge-size finding, token and line alike', () => {
    const r = evaluateKnowledgeSize(sizeSrc([
      { source_path: 'prospec/ai-knowledge/modules/x/README.md', kind: 'l2', tokens: 4683, lines: 130 },
    ]));
    expect(r.findings).toHaveLength(2);
    expect(r.findings.every((f) => f.knowledge_size !== undefined)).toBe(true);
    expect(r.findings.map((f) => f.knowledge_size!.unit).sort()).toEqual(['lines', 'tokens']);
  });
});

describe('evaluateBudgetOverrides', () => {
  it('passes when source is unavailable', () => {
    const r = evaluateBudgetOverrides({ available: false, reason: 'no yaml', source_path: '.prospec.yaml', overrides: [] });
    expect(r.result.status).toBe('skipped');
  });

  it('passes when there are no overrides', () => {
    const r = evaluateBudgetOverrides({ available: true, source_path: '.prospec.yaml', overrides: [] });
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('warns when a budget override lacks a comment', () => {
    const r = evaluateBudgetOverrides({
      available: true,
      source_path: '.prospec.yaml',
      overrides: [{ key: 'demand_knowledge_per_file', value: 15000, defaultValue: 10000, hasComment: false, line: 12 }],
    });
    expect(r.result.status).toBe('warn');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.detail).toContain('unjustified budget override');
    expect(r.findings[0]?.detail).toContain('demand_knowledge_per_file');
    expect(r.findings[0]?.line).toBe(12);
  });

  it('passes when a budget override has a comment', () => {
    const r = evaluateBudgetOverrides({
      available: true,
      source_path: '.prospec.yaml',
      overrides: [{ key: 'demand_knowledge_per_file', value: 15000, defaultValue: 10000, hasComment: true, line: 12 }],
    });
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });
});

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

describe('evaluateReqIdUniqueness (REQ-LIB-068)', () => {
  it('fails once per definition site when an id is defined in more than one place, naming all sites', () => {
    const r = evaluateReqIdUniqueness({
      available: true,
      definitions: new Map([
        [
          'REQ-LIB-001',
          [
            { feature: 'drift-checks', source_path: 'drift-checks.md', line: 23 },
            { feature: 'standalone-binary', source_path: 'standalone-binary.md', line: 39 },
          ],
        ],
        ['REQ-LIB-002', [{ feature: 'drift-checks', source_path: 'drift-checks.md', line: 32 }]],
      ]),
    });
    expect(r.result.status).toBe('fail');
    expect(r.findings).toHaveLength(2); // one per site of the single colliding id; the unique id yields none
    expect(r.findings.map((f) => `${f.source_path}:${f.line}`).sort()).toEqual([
      'drift-checks.md:23',
      'standalone-binary.md:39',
    ]);
    expect(r.findings.every((f) => f.severity === 'fail' && f.detail.includes('REQ-LIB-001'))).toBe(true);
    // the detail names every collision site (with its feature), not just the anchored one
    expect(r.findings[0]?.detail).toContain('drift-checks.md:23 (drift-checks)');
    expect(r.findings[0]?.detail).toContain('standalone-binary.md:39 (standalone-binary)');
  });

  it('passes when every id is defined exactly once', () => {
    const r = evaluateReqIdUniqueness({
      available: true,
      definitions: new Map([
        ['REQ-LIB-001', [{ feature: 'drift-checks', source_path: 'drift-checks.md', line: 23 }]],
        ['REQ-LIB-002', [{ feature: 'standalone-binary', source_path: 'standalone-binary.md', line: 39 }]],
      ]),
    });
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('skips with reason when the source is unavailable', () => {
    const r = evaluateReqIdUniqueness({
      available: false,
      reason: 'source unavailable: no feature specs in dir',
      definitions: new Map(),
    });
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
        last_sub_module_commit: null,
        last_verified: '2026-06-11T00:00:00+00:00',
        ...over,
      },
    ],
  });

  it('warns (never fails) when source is newer than last_verified', () => {
    const r = evaluateKnowledgeHealth(
      stamps({ last_src_commit: '2026-06-12T00:00:00+00:00' }),
    );
    expect(r.result.status).toBe('warn');
    expect(r.findings[0]?.severity).toBe('warn');
    expect(r.knowledgeHealth?.modules[0]?.stale).toBe(true);
  });

  it('compares by UTC day, normalizing timezone offsets', () => {
    // Same instant expressed in different offsets is the same UTC day → NOT stale.
    const r = evaluateKnowledgeHealth(
      stamps({
        last_src_commit: '2026-06-11T08:00:00+08:00',
        last_verified: '2026-06-11T00:00:00+00:00',
      }),
    );
    expect(r.result.status).toBe('pass');
    expect(r.knowledgeHealth?.modules[0]?.stale).toBe(false);
  });

  it('is NOT stale when source was committed later the same UTC day it was verified (co-commit)', () => {
    // The load-bearing case: `last_verified` is stamped moments before the commit that
    // carries both it and the source, so the source commit instant is LATER than the
    // stamp. Same-day comparison keeps that fresh; an instant comparison would wrongly
    // mark every freshly-committed module stale forever.
    const r = evaluateKnowledgeHealth(
      stamps({
        last_src_commit: '2026-06-11T18:30:00+00:00',
        last_verified: '2026-06-11T09:00:00+00:00',
      }),
    );
    expect(r.result.status).toBe('pass');
    expect(r.knowledgeHealth?.modules[0]?.stale).toBe(false);
  });

  it('is not stale when last_verified is at or after the source commit', () => {
    const r = evaluateKnowledgeHealth(
      stamps({
        last_src_commit: '2026-06-11T00:00:00+00:00',
        last_verified: '2026-06-12T00:00:00+00:00',
      }),
    );
    expect(r.result.status).toBe('pass');
    expect(r.knowledgeHealth?.modules[0]?.stale).toBe(false);
  });

  it('is stale when a documented module has no last_verified, regardless of its knowledge commits', () => {
    const r = evaluateKnowledgeHealth(
      stamps({
        last_src_commit: '2026-06-10T00:00:00+00:00',
        last_readme_commit: '2026-06-20T00:00:00+00:00',
        last_verified: null,
      }),
    );
    expect(r.result.status).toBe('warn');
    expect(r.knowledgeHealth?.modules[0]?.stale).toBe(true);
    expect(r.findings[0]?.detail).toContain('no last_verified');
  });

  it('reports a documented module stale when source outruns last_verified, naming last_verified', () => {
    const r = evaluateKnowledgeHealth(
      stamps({
        last_src_commit: '2026-06-14T00:00:00+00:00',
        last_verified: '2026-06-13T00:00:00+00:00',
      }),
    );
    expect(r.result.status).toBe('warn');
    expect(r.findings[0]?.detail).toContain('2026-06-13T00:00:00+00:00');
  });

  it('reports a module with no README as a coverage gap, not a timestamp verdict', () => {
    const r = evaluateKnowledgeHealth(
      stamps({
        readme_exists: false,
        last_readme_commit: null,
        last_src_commit: '2026-06-10T00:00:00+00:00',
        last_verified: '2026-06-20T00:00:00+00:00',
      }),
    );
    // last_verified is fresh, but a module with no README is stale by the coverage rule
    expect(r.knowledgeHealth?.modules[0]?.stale).toBe(true);
    expect(r.findings[0]?.detail).toContain('coverage gap');
  });

  it('keeps the frozen report keys and adds last_verified additively (present) / omits it (absent)', () => {
    const present = evaluateKnowledgeHealth(stamps({}));
    expect(Object.keys(present.knowledgeHealth!.modules[0]!)).toEqual([
      'name',
      'last_src_commit',
      'last_readme_commit',
      'stale',
      'last_verified',
    ]);
    const absent = evaluateKnowledgeHealth(stamps({ last_verified: null }));
    expect(Object.keys(absent.knowledgeHealth!.modules[0]!)).toEqual([
      'name',
      'last_src_commit',
      'last_readme_commit',
      'stale',
    ]);
  });

  it('still carries last_sub_module_commit when present (frozen contract)', () => {
    const r = evaluateKnowledgeHealth(
      stamps({ last_sub_module_commit: '2026-06-13T00:00:00+00:00' }),
    );
    expect(r.knowledgeHealth?.modules[0]).toMatchObject({
      last_readme_commit: '2026-06-11T00:00:00+00:00',
      last_sub_module_commit: '2026-06-13T00:00:00+00:00',
    });
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
        last_sub_module_commit: null,
        last_verified: null,
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

  it('enumerates the changes it graded as subjects, anchored under their change directory (REQ-TYPES-027)', () => {
    const r = evaluateTaskCompletion(tasks([[false, 'code']]));
    expect(r.result.subjects).toEqual(['c1']);
    expect(r.findings[0]?.source_path.startsWith('.prospec/changes/c1/')).toBe(true);
    // no tasks.md anywhere → nobody enumerated, honestly
    expect(evaluateTaskCompletion({ available: true, changes: [] }).result.subjects).toEqual([]);
  });
});

describe('evaluateDeltaSpecProvenance (REQ-LIB-045)', () => {
  const src = (
    over: Partial<DeltaSpecProvenanceSource['changes'][number]> = {},
  ): DeltaSpecProvenanceSource => ({
    available: true,
    changes: [
      {
        name: 'c1',
        source_path: '.prospec/changes/c1/metadata.yaml',
        status: 'implemented',
        scale: 'standard',
        recorded_digest: 'CUR',
        current_digest: 'CUR',
        delta_spec_present: true,
        backfill_draft_present: false,
        ...over,
      },
    ],
  });

  it('skips when the source is unavailable (no changes dir)', () => {
    const r = evaluateDeltaSpecProvenance({
      available: false,
      reason: 'source unavailable: .prospec/changes/ not found (not version-controlled)',
      changes: [],
    });
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toContain('.prospec/changes/');
  });

  it('passes when the recorded fingerprint still matches the delta-spec', () => {
    const r = evaluateDeltaSpecProvenance(src());
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('fails when an audited change has no recorded delta-spec baseline', () => {
    const r = evaluateDeltaSpecProvenance(src({ recorded_digest: null }));
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]?.detail).toContain('no delta-spec baseline');
  });

  // The failure this whole check exists for: review corrected a REQ, the landing
  // block was never updated, and archive is about to copy the pre-review text.
  it('fails (stale) when the delta-spec moved after the baseline was recorded', () => {
    const r = evaluateDeltaSpecProvenance(src({ recorded_digest: 'OLD', current_digest: 'CUR' }));
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]?.detail).toContain('stale delta-spec');
    // The remediation must point at the landing block, not at the code — pointing
    // at the code is what the other two provenance findings already do.
    expect(r.findings[0]?.detail).toMatch(/\*\*Spec:\*\*|landing block/);
  });

  it('skips a change whose scale carries no delta-spec, without failing it', () => {
    const r = evaluateDeltaSpecProvenance(
      src({ scale: 'quick', delta_spec_present: false, current_digest: null, recorded_digest: null }),
    );
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  // Present but unreadable is NOT the same as absent. Reporting it as a plain
  // "stale" would send the author to edit a file they cannot read.
  it('fails with its own reason when the delta-spec exists but cannot be read', () => {
    const r = evaluateDeltaSpecProvenance(src({ delta_spec_present: true, current_digest: null }));
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]?.detail).toContain('could not be read');
  });

  it('exempts a PROVEN backfill — it never runs review, so no baseline can exist', () => {
    const r = evaluateDeltaSpecProvenance(
      src({ scale: 'backfill', backfill_draft_present: true, recorded_digest: null }),
    );
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('grants NO exemption to an unproven backfill (scale alone is hand-editable)', () => {
    const r = evaluateDeltaSpecProvenance(
      src({ scale: 'backfill', backfill_draft_present: false, recorded_digest: null }),
    );
    expect(r.result.status).toBe('fail');
  });

  it('does not flag a change before review is due (story/plan/tasks)', () => {
    for (const status of ['story', 'plan', 'tasks']) {
      const r = evaluateDeltaSpecProvenance(src({ status, recorded_digest: null }));
      expect(r.result.status, status).toBe('pass');
    }
  });

  // The verify→archive window is exactly where this gate has to hold: the landing
  // blocks graduate at archive, which happens while the change is `verified`.
  it('audits a verified change — the window between verify and archive is in scope', () => {
    const r = evaluateDeltaSpecProvenance(src({ status: 'verified', recorded_digest: 'OLD' }));
    expect(r.result.status).toBe('fail');
  });
});

describe('evaluateReviewProvenance', () => {
  const src = (
    over: Partial<ReviewProvenanceSource['changes'][number]>,
    current = 'CUR',
    workingTreeClean: boolean | null = false,
  ): ReviewProvenanceSource => ({
    available: true,
    current_digest: current,
    working_tree_clean: workingTreeClean,
    changes: [
      {
        name: 'c1',
        source_path: '.prospec/changes/c1/metadata.yaml',
        status: 'implemented',
        scale: 'standard',
        recorded_digest: 'CUR',
        version_supported: true,
        backfill_draft_present: false,
        ...over,
      },
    ],
  });

  it('skips when the source is unavailable (not git / no changes dir)', () => {
    const r = evaluateReviewProvenance({
      available: false,
      reason: 'source unavailable: not a git repository',
      current_digest: null,
      working_tree_clean: null,
      changes: [],
    });
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toContain('not a git repository');
  });

  it('passes when an implemented change has a fresh recorded digest', () => {
    const r = evaluateReviewProvenance(src({ recorded_digest: 'CUR' }));
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('fails when an implemented, non-backfill change has no recorded review', () => {
    const r = evaluateReviewProvenance(src({ recorded_digest: null }));
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]?.detail).toContain('no review recorded');
  });

  it('fails (stale) when the recorded digest no longer matches the current code', () => {
    const r = evaluateReviewProvenance(src({ recorded_digest: 'OLD' }, 'CUR'));
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]?.detail).toContain('stale review');
  });

  // Commit-induced staleness (HEAD moved after --record-review) on a CLEAN tree: the
  // cheap remedy is to re-record, not to re-run the whole adversarial review.
  it('stale + clean tree still requires a completed review', () => {
    const r = evaluateReviewProvenance(src({ recorded_digest: 'OLD' }, 'CUR', true));
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]?.detail).toContain('stale review');
    expect(r.findings[0]?.detail).not.toContain('working tree is clean');
    expect(r.findings[0]?.detail).toContain('re-run prospec-review');
    expect(r.findings[0]?.detail).toContain('code changed since the recorded review');
  });

  // Unknown signal (null: not git / a git capture failed) must NEVER read as clean —
  // it keeps the code-changed wording, the fail-closed default.
  it('stale + unknown clean signal (null) → keeps the code-changed wording', () => {
    const r = evaluateReviewProvenance(src({ recorded_digest: 'OLD' }, 'CUR', null));
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]?.detail).toContain('code changed since the recorded review');
    expect(r.findings[0]?.detail).not.not.toContain('working tree is clean');
  });

  it('exempts a PROVEN backfill (backfill-draft.md present) even without a review', () => {
    const r = evaluateReviewProvenance(
      src({ scale: 'backfill', backfill_draft_present: true, recorded_digest: null }),
    );
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  // Aligned with test-provenance by #103: `scale` is hand-editable metadata, so
  // without the draft it buys no exemption — typing `scale: backfill` must not
  // become a review-gate bypass.
  it('grants NO exemption to an unproven backfill (no backfill-draft.md)', () => {
    const r = evaluateReviewProvenance(
      src({ scale: 'backfill', backfill_draft_present: false, recorded_digest: null }),
    );
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]?.detail).toContain('no review recorded');
  });

  it('does not flag a change before review is due (story/plan/tasks)', () => {
    for (const status of ['story', 'plan', 'tasks']) {
      const r = evaluateReviewProvenance(src({ status, recorded_digest: null }));
      expect(r.result.status).toBe('pass');
      expect(r.findings).toHaveLength(0);
    }
  });

  // The verified→archived window: reaching grade S/A ends neither the audit nor the
  // need to re-review. Before REQ-TYPES-075 both cases below passed silently, so
  // code edited after verify could graduate REQs no review round had ever seen.
  it('fails (stale) when a VERIFIED change was edited after its recorded review', () => {
    const r = evaluateReviewProvenance(src({ status: 'verified', recorded_digest: 'OLD' }, 'CUR'));
    expect(r.result.status).toBe('fail');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.detail).toContain('stale review');
  });

  it('fails when a VERIFIED change carries no recorded review at all', () => {
    const r = evaluateReviewProvenance(src({ status: 'verified', recorded_digest: null }));
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]?.detail).toContain('no review recorded');
  });

  it('passes a VERIFIED change whose recorded review still matches the code', () => {
    const r = evaluateReviewProvenance(src({ status: 'verified', recorded_digest: 'CUR' }));
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('keeps the draft-gated backfill exemption at VERIFIED too', () => {
    const r = evaluateReviewProvenance(
      src({ status: 'verified', scale: 'backfill', backfill_draft_present: true, recorded_digest: 'OLD' }),
    );
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
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
            last_sub_module_commit: null,
            last_verified: null,
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

describe('evaluateKnowledgeHealth — last_verified signal edges', () => {
  it('is never stale when the source commit is null, even with a README and a last_verified', () => {
    const r = evaluateKnowledgeHealth({
      available: true,
      modules: [
        {
          name: 'lib',
          readme_path: 'k/modules/lib/README.md',
          readme_exists: true,
          last_src_commit: null,
          last_readme_commit: '2026-06-11T00:00:00+00:00',
          last_sub_module_commit: null,
          last_verified: '2026-06-11T00:00:00+00:00',
        },
      ],
    });
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
    expect(r.knowledgeHealth?.modules[0]?.stale).toBe(false);
  });

  it('reads only last_verified: a documented module with a fresh last_verified is not stale even when its README/sub-module commits are null', () => {
    const r = evaluateKnowledgeHealth({
      available: true,
      modules: [
        {
          name: 'lib',
          readme_path: 'k/modules/lib/README.md',
          readme_exists: true,
          last_src_commit: '2026-06-12T00:00:00+00:00',
          last_readme_commit: null,
          last_sub_module_commit: null,
          last_verified: '2026-06-13T00:00:00+00:00',
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

describe('evaluateSpecCounters (REQ-LIB-042)', () => {
  const claim = (over: Partial<SpecCounterSource['specs'][number]> = {}) => ({
    source_path: 'prospec/specs/features/widget.md',
    feature: 'widget',
    declared: { story_count: 1, req_count: 2 },
    actual: { story_count: 1, req_count: 2 },
    ...over,
  });

  it('skips when the source is unavailable (never a vacuous pass)', () => {
    const r = evaluateSpecCounters({ available: false, reason: 'no feature specs', specs: [] });
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toBe('no feature specs');
  });

  it('passes when every declared counter matches its body', () => {
    expect(evaluateSpecCounters({ available: true, specs: [claim()] }).result.status).toBe('pass');
  });

  it('warns per disagreeing counter, naming the field, the declared and the actual value', () => {
    const r = evaluateSpecCounters({
      available: true,
      specs: [claim({ declared: { story_count: 4, req_count: 10 } })],
    });
    expect(r.result.status).toBe('warn');
    expect(r.findings).toHaveLength(2);
    expect(r.findings.every((f) => f.severity === 'warn')).toBe(true);
    expect(r.findings.map((f) => f.detail).join('\n')).toMatch(/req_count.*10.*2/s);
    expect(r.findings.map((f) => f.detail).join('\n')).toMatch(/story_count.*4.*1/s);
  });

  it('never warns about a counter the frontmatter does not declare', () => {
    const r = evaluateSpecCounters({
      available: true,
      specs: [claim({ declared: { story_count: null, req_count: null } })],
    });
    expect(r.result.status).toBe('pass');
    expect(r.findings).toEqual([]);
  });

  // Ordering is runChecks' contract (one codepoint sort over every check's
  // findings), so it is pinned THERE — an evaluator that sorted its own slice
  // would still not make the report deterministic.
  it('reaches the report codepoint-sorted alongside every other check', () => {
    const report = runChecks({
      ...emptyInputs,
      specCounters: {
        available: true,
        specs: [
          claim({ source_path: 'z.md', declared: { story_count: 1, req_count: 9 } }),
          claim({ source_path: 'a.md', declared: { story_count: 1, req_count: 9 } }),
        ],
      },
    });
    const paths = report.structural.findings
      .filter((f) => f.check === 'spec-counters')
      .map((f) => f.source_path);
    expect(paths).toEqual(['a.md', 'z.md']);
    expect(report.structural.checks.find((c) => c.id === 'spec-counters')?.status).toBe('warn');
  });
});

describe('evaluateMcpReadmeCounts (REQ-LIB-020)', () => {
  const claim = (over: Partial<import('../../../src/lib/drift-sources.js').McpReadmeCountClaim>) => ({
    module: 'services',
    readme_path: 'k/modules/services/README.md',
    line: 26,
    noun: 'resources',
    source_path: 'src/services/mcp.service.ts',
    claimed: 6,
    actual: 6,
    ...over,
  });

  it('skips when module-map is unavailable (never a false positive)', () => {
    const r = evaluateMcpReadmeCounts({
      available: false,
      reason: 'source unavailable: module-map.yaml not found — module boundaries unknown',
      claims: [],
    });
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toContain('source unavailable');
  });

  it('falls back to "source unavailable" when no reason is supplied', () => {
    const r = evaluateMcpReadmeCounts({ available: false, claims: [] });
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toBe('source unavailable');
  });

  it('passes when every declared count matches the code', () => {
    const r = evaluateMcpReadmeCounts({ available: true, claims: [claim({}), claim({ noun: 'tools', claimed: 2, actual: 2 })] });
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('warns (never fails) with file:line + expected-vs-actual on a mismatch', () => {
    const r = evaluateMcpReadmeCounts({ available: true, claims: [claim({ claimed: 6, actual: 8 })] });
    expect(r.result.status).toBe('warn');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({
      check: 'mcp-readme-counts',
      severity: 'warn',
      source_path: 'k/modules/services/README.md',
      line: 26,
    });
    expect(r.findings[0]?.detail).toContain('6 resources');
    expect(r.findings[0]?.detail).toContain('8');
    expect(r.findings[0]?.detail).toContain('src/services/mcp.service.ts');
  });

  it('reports only the mismatched claim when one of several drifts', () => {
    const r = evaluateMcpReadmeCounts({
      available: true,
      claims: [claim({ noun: 'resources', claimed: 6, actual: 6 }), claim({ noun: 'tools', claimed: 2, actual: 3 })],
    });
    expect(r.result.status).toBe('warn');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.detail).toContain('2 tools');
  });
});

describe('change-scoped evaluators enumerate their subjects under the change directory (REQ-TYPES-027, REQ-TESTS-113)', () => {
  it('review-provenance', () => {
    const r = evaluateReviewProvenance({ available: true, current_digest: 'CUR', working_tree_clean: true, changes: [
      { name: 'ok', source_path: '.prospec/changes/ok/metadata.yaml', status: 'implemented', scale: 'standard', recorded_digest: 'CUR', version_supported: true, backfill_draft_present: false },
      { name: 'stale', source_path: '.prospec/changes/stale/metadata.yaml', status: 'implemented', scale: 'standard', recorded_digest: 'OLD', version_supported: true, backfill_draft_present: false },
    ] });
    expect(r.result.subjects).toEqual(['ok', 'stale']);
    expect(r.findings.map((f) => f.source_path)).toEqual(['.prospec/changes/stale/metadata.yaml']);
  });
  it('metadata-completeness (unparseable changes included)', () => {
    const r = evaluateMetadataCompleteness({ available: true, changes: [
      { name: 'ok', source_path: '.prospec/changes/ok/metadata.yaml', status: 'tasks', missing_fields: [], missing_verify_grade: false },
      { name: 'broken', source_path: '.prospec/changes/broken/metadata.yaml', status: 'tasks', missing_fields: ['scale'], missing_verify_grade: false },
    ] });
    expect(r.result.subjects).toEqual(['ok', 'broken']);
    expect(r.findings.every((f) => f.source_path.startsWith('.prospec/changes/broken/'))).toBe(true);
  });
  it('test-provenance', () => {
    const base = { source_path: '', status: 'implemented', scale: 'standard', recorded_digest: 'CUR', version_supported: true, attempt_matches: true, recorded_exit_code: 0, recorded_command: 'pnpm test', backfill_draft_present: false };
    const r = evaluateTestProvenance({ available: true, command_unavailable_reason: null, current_digest: 'CUR', working_tree_clean: true, changes: [
      { ...base, name: 'ok', source_path: '.prospec/changes/ok/metadata.yaml' },
      { ...base, name: 'red', source_path: '.prospec/changes/red/metadata.yaml', recorded_exit_code: 1 },
    ] });
    expect(r.result.subjects).toEqual(['ok', 'red']);
    expect(r.findings.map((f) => f.source_path)).toEqual(['.prospec/changes/red/metadata.yaml']);
  });
  it('delta-spec-provenance', () => {
    const base = { status: 'implemented', scale: 'standard', recorded_digest: 'D', current_digest: 'D', delta_spec_present: true, backfill_draft_present: false };
    const r = evaluateDeltaSpecProvenance({ available: true, changes: [
      { ...base, name: 'ok', source_path: '.prospec/changes/ok/metadata.yaml' },
      { ...base, name: 'moved', source_path: '.prospec/changes/moved/metadata.yaml', current_digest: 'E' },
    ] });
    expect(r.result.subjects).toEqual(['ok', 'moved']);
    expect(r.findings.map((f) => f.source_path)).toEqual(['.prospec/changes/moved/metadata.yaml']);
  });
  // Driven by the scope registry, not a hand-kept list: a check added to
  // DRIFT_CHECK_SCOPES as `change` without threading `subjects` through its
  // evaluator turns red here; a `repository` check that starts emitting them does too.
  it('every check emits subjects exactly when DRIFT_CHECK_SCOPES says it is change-scoped', () => {
    const report = runChecks(emptyInputs);
    for (const id of DRIFT_CHECK_IDS) {
      const check = report.structural.checks.find((c) => c.id === id)!;
      if (DRIFT_CHECK_SCOPES[id] === 'change') {
        expect(check.subjects, `${id} is change-scoped and must enumerate subjects`).toEqual([]);
      } else {
        expect(check.subjects, `${id} is repository-scoped and must not enumerate subjects`).toBeUndefined();
      }
    }
  });
});

describe('evaluateMetadataCompleteness', () => {
  const change = (
    over: Partial<MetadataCompletenessSource['changes'][number]> = {},
  ): MetadataCompletenessSource['changes'][number] => ({
    name: 'demo',
    source_path: '.prospec/changes/demo/metadata.yaml',
    status: 'tasks',
    missing_fields: [],
    missing_verify_grade: false,
    ...over,
  });
  const src = (
    over: Partial<MetadataCompletenessSource['changes'][number]> = {},
  ): MetadataCompletenessSource => ({ available: true, changes: [change(over)] });

  it('skips when the source is unavailable (never a fabricated pass)', () => {
    const r = evaluateMetadataCompleteness({
      available: false,
      reason: 'source unavailable: .prospec/changes/ not found (not version-controlled)',
      changes: [],
    });
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toContain('source unavailable');
  });

  it('falls back to "source unavailable" when no reason is supplied', () => {
    const r = evaluateMetadataCompleteness({ available: false, changes: [] });
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toBe('source unavailable');
  });

  it('passes a complete in-progress change with no verify grade (no false-block)', () => {
    const r = evaluateMetadataCompleteness(src({ status: 'implemented' }));
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('fails and lists the missing required field(s)', () => {
    const r = evaluateMetadataCompleteness(src({ missing_fields: ['scale', 'created_at'] }));
    expect(r.result.status).toBe('fail');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({
      check: 'metadata-completeness',
      severity: 'fail',
      source_path: '.prospec/changes/demo/metadata.yaml',
    });
    expect(r.findings[0]?.detail).toContain('scale');
    expect(r.findings[0]?.detail).toContain('created_at');
  });

  it('fails a verified change missing the /prospec-verify S/A grade', () => {
    const r = evaluateMetadataCompleteness(src({ status: 'verified', missing_verify_grade: true }));
    expect(r.result.status).toBe('fail');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.detail).toContain('verified');
    expect(r.findings[0]?.detail).toContain('S/A grade');
  });

  it('passes a verified change that has the grade recorded', () => {
    const r = evaluateMetadataCompleteness(src({ status: 'verified', missing_verify_grade: false }));
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('emits both findings when a change is missing fields AND a grade', () => {
    const r = evaluateMetadataCompleteness(
      src({ status: 'verified', missing_fields: ['name'], missing_verify_grade: true }),
    );
    expect(r.result.status).toBe('fail');
    expect(r.findings).toHaveLength(2);
  });
});

describe('evaluateTestProvenance (REQ-LIB-033)', () => {
  const src = (
    over: Partial<TestProvenanceSource['changes'][number]>,
    current = 'CUR',
    workingTreeClean: boolean | null = false,
  ): TestProvenanceSource => ({
    available: true,
    command_unavailable_reason: null,
    current_digest: current,
    working_tree_clean: workingTreeClean,
    changes: [
      {
        name: 'c1',
        source_path: '.prospec/changes/c1/metadata.yaml',
        status: 'implemented',
        scale: 'standard',
        recorded_digest: 'CUR',
        version_supported: true,
        attempt_matches: true,
        recorded_exit_code: 0,
        recorded_command: 'pnpm test',
        backfill_draft_present: false,
        ...over,
      },
    ],
  });

  // Review pin (Q-1): an `unavailable` attempt is a per-change skip, not a
  // per-repository one. Alone it skips the whole check (unchanged); beside a
  // failing sibling the check FAILs for the sibling and the unavailable change
  // is recorded under `subject_skips`, so a per-change gate reads it as skipped.
  it('records an unavailable attempt as a per-subject skip when a sibling produces findings (REQ-LIB-077)', () => {
    const unavailable = { name: 'a', source_path: '.prospec/changes/a/metadata.yaml', status: 'implemented', scale: 'standard', attempt_outcome: 'unavailable', recorded_digest: null, recorded_exit_code: null, recorded_command: '', backfill_draft_present: false };
    const failing = { ...unavailable, name: 'b', source_path: '.prospec/changes/b/metadata.yaml', attempt_outcome: 'failed' };
    const alone = evaluateTestProvenance({ available: true, command_unavailable_reason: null, current_digest: 'd', working_tree_clean: true, changes: [unavailable] });
    expect(alone.result.status).toBe('skipped');
    const withSibling = evaluateTestProvenance({ available: true, command_unavailable_reason: null, current_digest: 'd', working_tree_clean: true, changes: [unavailable, failing] });
    expect(withSibling.result.status).toBe('fail');
    expect(withSibling.result.subjects).toEqual(['a', 'b']);
    expect(withSibling.result.subject_skips?.['a']).toMatch(/^test command unavailable:/);
    expect(withSibling.result.subject_skips?.['b']).toBeUndefined();
    // a machine-level unavailable command skips every change that produced no finding
    const machine = evaluateTestProvenance({ available: true, command_unavailable_reason: 'unset', current_digest: 'd', working_tree_clean: true, changes: [{ ...unavailable, attempt_outcome: undefined }, { ...failing, attempt_outcome: undefined, recorded_exit_code: 1, recorded_digest: 'd' }] });
    expect(machine.result.status).toBe('fail');
    expect(machine.result.subject_skips?.['a']).toBe('unset');
  });

  it('skips (never PASS) when the source is unavailable', () => {
    const r = evaluateTestProvenance({
      available: false,
      reason: 'source unavailable: not a git repository',
      command_unavailable_reason: null,
      current_digest: null,
      working_tree_clean: null,
      changes: [],
    });
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toContain('source unavailable');
    expect(r.findings).toHaveLength(0);
  });

  it('passes when the recorded run matches the current code and exited 0', () => {
    const r = evaluateTestProvenance(src({}));
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('fails when no test run was ever recorded', () => {
    const r = evaluateTestProvenance(src({ recorded_digest: null, recorded_exit_code: null, recorded_command: '' }));
    expect(r.result.status).toBe('fail');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ check: 'test-provenance', severity: 'fail' });
    expect(r.findings[0]?.detail).toContain('no test run recorded');
    expect(r.findings[0]?.detail).toContain('--record-tests');
  });

  it('fails when the recorded run predates the current code (stale)', () => {
    const r = evaluateTestProvenance(src({ recorded_digest: 'OLD' }));
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]?.detail).toContain('stale test run');
  });

  // Mirror of review-provenance: a clean tree means the recorded run predates the
  // commit (outcome unknown, not a failure) → re-record, not "code changed".
  it('stale + clean tree still requires a valid test run', () => {
    const r = evaluateTestProvenance(src({ recorded_digest: 'OLD' }, 'CUR', true));
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]?.detail).toContain('stale test run');
    expect(r.findings[0]?.detail).not.toContain('working tree is clean');
    expect(r.findings[0]?.detail).toContain('prospec check --record-tests');
    expect(r.findings[0]?.detail).toContain('code changed since the recorded run');
  });

  it('stale + unknown clean signal (null) → keeps the code-changed wording', () => {
    const r = evaluateTestProvenance(src({ recorded_digest: 'OLD' }, 'CUR', null));
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]?.detail).toContain('code changed since the recorded run');
    expect(r.findings[0]?.detail).not.not.toContain('working tree is clean');
  });

  it('fails when the recorded run exited non-zero, naming the command and code', () => {
    const r = evaluateTestProvenance(src({ recorded_exit_code: 1 }));
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]?.detail).toContain('failing test run');
    // the whole rendered clause — a bare '1' would match the change name "c1"
    expect(r.findings[0]?.detail).toContain('`pnpm test` exited 1');
  });

  it('fails when a run was recorded without an exit code', () => {
    const r = evaluateTestProvenance(src({ recorded_exit_code: null }));
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]?.detail).toContain('without a status');
  });

  it('exempts a PROVEN backfill from the missing-record branch (brownfield code has no run)', () => {
    const r = evaluateTestProvenance(
      src({ scale: 'backfill', backfill_draft_present: true, recorded_digest: null }),
    );
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('exempts a PROVEN backfill from the stale branch (outcome unknown, same as no run)', () => {
    const r = evaluateTestProvenance(
      src({ scale: 'backfill', backfill_draft_present: true, recorded_digest: 'OLD' }),
    );
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  // The verify contract is explicit: "never suppress a recorded non-zero exit".
  // Since 5/5 now adopts this status verbatim, exempting it would make a red suite
  // graduate to `verified` with no way for the agent to intervene.
  it('NEVER exempts a recorded FAILING run, even for a proven backfill', () => {
    const r = evaluateTestProvenance(
      src({ scale: 'backfill', backfill_draft_present: true, recorded_exit_code: 3 }),
    );
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]?.detail).toContain('`pnpm test` exited 3');
  });

  // Branch precedence matters: if staleness were tested first, this record would
  // take the backfill-exempt path and the recorded failure would be suppressed —
  // exactly what the verify contract forbids ("never suppress a recorded non-zero exit").
  it('NEVER exempts a recorded failing run that is ALSO stale (proven backfill)', () => {
    const r = evaluateTestProvenance(
      src({
        scale: 'backfill',
        backfill_draft_present: true,
        recorded_digest: 'OLD',
        recorded_exit_code: 3,
      }),
    );
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]?.detail).toContain('`pnpm test` exited 3');
    expect(r.findings[0]?.detail).toContain('the record is stale');
  });

  // #103 must-fix 1: an unresolvable command used to flip the whole SOURCE
  // unavailable before enumeration, so a recorded red run never reached this
  // evaluator. A recorded failure is a fact that needs no runnable command —
  // it is judged BEFORE the command-unavailability skip.
  it('fails a recorded non-zero exit even when the test command is unresolvable', () => {
    const r = evaluateTestProvenance({
      ...src({ recorded_exit_code: 1 }),
      command_unavailable_reason: 'test command unavailable: no test command configured',
    });
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]?.detail).toContain('`pnpm test` exited 1');
  });

  it('skips honestly when the command is unresolvable and nothing recorded failed', () => {
    const r = evaluateTestProvenance({
      ...src({ recorded_digest: null, recorded_exit_code: null, recorded_command: '' }),
      command_unavailable_reason:
        'test command unavailable: no test command configured — set tech_stack.test_command in .prospec.yaml',
    });
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toContain('no test command configured');
    expect(r.findings).toHaveLength(0);
  });

  it('skips a stale GREEN record when the command is unresolvable (cannot demand a re-run)', () => {
    const r = evaluateTestProvenance({
      ...src({ recorded_digest: 'OLD', recorded_exit_code: 0 }),
      command_unavailable_reason: 'test command unavailable: no test command configured',
    });
    expect(r.result.status).toBe('skipped');
    expect(r.findings).toHaveLength(0);
  });

  it('still exempts a proven backfill whose stale record was GREEN', () => {
    const r = evaluateTestProvenance(
      src({
        scale: 'backfill',
        backfill_draft_present: true,
        recorded_digest: 'OLD',
        recorded_exit_code: 0,
      }),
    );
    expect(r.result.status).toBe('pass');
  });

  // `scale` is hand-editable metadata; without the draft it must not buy any
  // relaxation, or typing `scale: backfill` bypasses the tested-code gate.
  it('grants NO relaxation to an unproven backfill (no backfill-draft.md)', () => {
    const r = evaluateTestProvenance(
      src({ scale: 'backfill', backfill_draft_present: false, recorded_digest: null }),
    );
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]?.detail).toContain('no test run recorded');
  });

  // `archived` is here for a different reason than the pre-review statuses: a
  // collector cannot enumerate a bundle archive has moved out of
  // `.prospec/changes/`, so a source claiming one is a shape that never occurs.
  it('exempts a change before tests are due, and has no verdict for archived', () => {
    for (const status of ['story', 'plan', 'tasks', 'archived']) {
      const r = evaluateTestProvenance(src({ status, recorded_digest: null }));
      expect(r.result.status, status).toBe('pass');
      expect(r.findings, status).toHaveLength(0);
    }
  });

  // Mirror of review-provenance's verified cases: the two gates read one registry,
  // so a scope that covered only review would still let an unverified test record
  // reach archive.
  it('fails (stale) when a VERIFIED change was edited after its recorded run', () => {
    const r = evaluateTestProvenance(src({ status: 'verified', recorded_digest: 'OLD' }));
    expect(r.result.status).toBe('fail');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.detail).toContain('stale test run');
  });

  it('fails when a VERIFIED change carries no recorded run at all', () => {
    const r = evaluateTestProvenance(
      src({ status: 'verified', recorded_digest: null, recorded_exit_code: null, recorded_command: '' }),
    );
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]?.detail).toContain('no test run recorded');
  });

  it('passes a VERIFIED change whose recorded run still matches the code', () => {
    const r = evaluateTestProvenance(src({ status: 'verified' }));
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('keeps the recorded-failure branch outranking staleness at VERIFIED', () => {
    const r = evaluateTestProvenance(
      src({ status: 'verified', recorded_digest: 'OLD', recorded_exit_code: 3 }),
    );
    expect(r.result.status).toBe('fail');
    expect(r.findings[0]?.detail).toContain('`pnpm test` exited 3');
    expect(r.findings[0]?.detail).toContain('the record is stale');
  });

  it('keeps the draft-gated backfill exemption at VERIFIED too', () => {
    const r = evaluateTestProvenance(
      src({ status: 'verified', scale: 'backfill', backfill_draft_present: true, recorded_digest: 'OLD' }),
    );
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });
});

describe('evaluateConstitutionSeverity (REQ-LIB-032)', () => {
  const src = (rules: ConstitutionRuleSource['rules']): ConstitutionRuleSource => ({
    available: true,
    source_path: 'prospec/CONSTITUTION.md',
    rules,
  });

  it('skips (never PASS) when the source is unavailable, and emits no inventory', () => {
    const r = evaluateConstitutionSeverity({
      available: false,
      reason: 'source unavailable: prospec/CONSTITUTION.md declares no principles',
      source_path: 'prospec/CONSTITUTION.md',
      rules: [],
    });
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toContain('declares no principles');
    expect(r.constitution).toBeUndefined();
  });

  it('passes when every principle carries an RFC-2119 severity', () => {
    const r = evaluateConstitutionSeverity(
      src([
        { name: 'A', severity: 'MUST', has_verify_hint: true, line: 3 },
        { name: 'B', severity: 'SHOULD', has_verify_hint: false, line: 9 },
        { name: 'C', severity: 'MAY', has_verify_hint: true, line: 15 },
      ]),
    );
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('warns (never fails) once per untagged principle, anchored at its heading line', () => {
    const r = evaluateConstitutionSeverity(
      src([
        { name: 'Tagged', severity: 'MUST', has_verify_hint: true, line: 3 },
        { name: 'Untagged one', severity: null, has_verify_hint: false, line: 20 },
        { name: 'Untagged two', severity: null, has_verify_hint: true, line: 30 },
      ]),
    );
    expect(r.result.status).toBe('warn');
    expect(r.findings).toHaveLength(2);
    expect(r.findings[0]).toMatchObject({
      check: 'constitution-severity',
      severity: 'warn',
      source_path: 'prospec/CONSTITUTION.md',
      line: 20,
    });
    expect(r.findings[0]?.detail).toContain('Untagged one');
    expect(r.findings[0]?.detail).toContain('by weight');
  });

  it('always emits the full inventory, including untagged rules, for verify to audit 1:1', () => {
    const rules = [
      { name: 'A', severity: 'MUST' as const, has_verify_hint: true, line: 3 },
      { name: 'B', severity: null, has_verify_hint: false, line: 8 },
    ];
    const r = evaluateConstitutionSeverity(src(rules));
    expect(r.constitution?.rules).toEqual(rules);
  });

  it('warns when the Constitution declares only seeded example rules (issue #228)', () => {
    // Every name here is a seeded starter rule — no project-authored principle
    // remains, so verify and the gates have nothing real to grade.
    const r = evaluateConstitutionSeverity(
      src([
        { name: 'Language Policy', severity: 'MUST', has_verify_hint: true, line: 10 },
        { name: 'Tested public functions', severity: 'MUST', has_verify_hint: true, line: 20 },
        { name: 'No committed secrets', severity: 'MUST', has_verify_hint: true, line: 30 },
      ]),
    );
    expect(r.result.status).toBe('warn');
    const finding = r.findings.find((f) => f.detail.includes('no project-authored principles'));
    expect(finding).toMatchObject({
      check: 'constitution-severity',
      severity: 'warn',
      source_path: 'prospec/CONSTITUTION.md',
    });
    // whole-document finding — never anchored to one rule's line
    expect(finding?.line).toBeUndefined();
  });

  it('does not flag no-project-authored when at least one authored rule exists (issue #228)', () => {
    const r = evaluateConstitutionSeverity(
      src([
        { name: 'Language Policy', severity: 'MUST', has_verify_hint: true, line: 10 },
        { name: 'Atomic commit boundaries', severity: 'MUST', has_verify_hint: true, line: 20 },
      ]),
    );
    expect(r.findings.some((f) => f.detail.includes('no project-authored principles'))).toBe(false);
  });

  // Round-trip guard for the seed-name coupling: a freshly-seeded Constitution
  // (init renders the SAME rule arrays SEEDED_CONSTITUTION_RULE_NAMES is built
  // from) must, once parsed back, leave zero project-authored principles and
  // fire the finding. Goes red if a seeded rule's name stops round-tripping
  // through the parser into the seed set. Covers all three stack branches.
  it('fires on a freshly-seeded Constitution parsed back through the real init rules (issue #228)', () => {
    for (const language of ['typescript', 'python', 'go']) {
      const seeded = exampleRulesFor({ language } satisfies TechStackResult);
      const markdown =
        '## Principles\n\n' +
        '### [MUST] Language Policy\n\n' +
        seeded.map((r) => `### [${r.severity}] ${r.name}\n`).join('\n');
      const rules = parseConstitutionRules(markdown);
      const r = evaluateConstitutionSeverity({
        available: true,
        source_path: 'prospec/CONSTITUTION.md',
        rules,
      });
      expect(r.result.status, language).toBe('warn');
      expect(
        r.findings.some((f) => f.detail.includes('no project-authored principles')),
        language,
      ).toBe(true);
    }
  });
});

describe('evaluateLanguagePolicyDrift (REQ-LIB-074)', () => {
  const src = (over: Partial<LanguagePolicyDriftSource> = {}): LanguagePolicyDriftSource => ({
    available: true,
    source_path: 'prospec/CONSTITUTION.md',
    artifact_language: 'Traditional Chinese (Taiwan)',
    trust_zone_language: 'English',
    verdict: 'in-sync',
    ...over,
  });

  it('skips (never PASS) when the source is unavailable, carrying its reason', () => {
    const r = evaluateLanguagePolicyDrift(
      src({ available: false, reason: 'source unavailable: no **Description**: field', verdict: 'no-description' }),
    );
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toContain('Description');
    expect(r.findings).toHaveLength(0);
  });

  it('passes with no finding when the Description is in sync', () => {
    const r = evaluateLanguagePolicyDrift(src());
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('passes for the legacy English seed — nothing to migrate', () => {
    const r = evaluateLanguagePolicyDrift(src({ verdict: 'legacy-english-seed', artifact_language: 'English' }));
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('warns once, anchored at the Constitution, when the Description diverged', () => {
    const r = evaluateLanguagePolicyDrift(src({ verdict: 'diverged', trust_zone_language: 'Traditional Chinese (Taiwan)' }));
    expect(r.result.status).toBe('warn');
    expect(r.findings).toHaveLength(1);
    const f = r.findings[0]!;
    expect(f.check).toBe('language-policy-drift');
    expect(f.severity).toBe('warn');
    expect(f.source_path).toBe('prospec/CONSTITUTION.md');
    expect(f.detail).toContain('no longer matches');
    // names both resolved zone languages and both remedies
    expect(f.detail).toContain('change artifacts: Traditional Chinese (Taiwan)');
    expect(f.detail).toContain('trust zone: Traditional Chinese (Taiwan)');
    expect(f.detail).toContain('prospec upgrade');
    expect(f.detail).toContain('trust_zone_language');
  });

  it('warns once for an untouched old seed, naming that cause', () => {
    const r = evaluateLanguagePolicyDrift(src({ verdict: 'stale-seed' }));
    expect(r.result.status).toBe('warn');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.detail).toContain('seed wording');
  });
});

describe('evaluateArtifactLanguage (REQ-LIB-037)', () => {
  const src = (
    files: ArtifactLanguageSource['files'],
    over: Partial<ArtifactLanguageSource> = {},
  ): ArtifactLanguageSource => ({
    available: true,
    language: 'Traditional Chinese (Taiwan)',
    files,
    ...over,
  });

  it('skips (never PASS) when the artifact language has no detectable script', () => {
    // A vacuous pass here is worse than no check: it would report "language
    // verified" for every Latin-script project while looking at nothing.
    const r = evaluateArtifactLanguage({
      available: false,
      reason: 'artifact language "Spanish" is not in the script table — nothing to match on',
      language: 'Spanish',
      files: [],
    });
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toContain('Spanish');
    expect(r.findings).toHaveLength(0);
  });

  it('passes with an empty sample — the scan ran, there was nothing to scan', () => {
    // Distinct from skipped on purpose: "no change artifacts yet" is a real
    // pass, not an inability to check.
    const r = evaluateArtifactLanguage(src([]));
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('reports nothing for a file that carries the artifact language', () => {
    const r = evaluateArtifactLanguage(
      src([
        { path: '.prospec/changes/x/proposal.md', hasScript: true },
        { path: 'prospec/specs/_archived-history/2026-01-01-x.md', hasScript: true },
      ]),
    );
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('warns — never fails — so a legacy artifact cannot red a repo on adoption day', () => {
    // The fail tier for the committed record waits on a shrink-only legacy
    // exemption; until then every finding is advisory, and this pins it.
    const r = evaluateArtifactLanguage(
      src([
        { path: '.prospec/changes/x/review.md', hasScript: false },
        { path: 'prospec/specs/_archived-history/2026-01-01-x.md', hasScript: false },
      ]),
    );
    expect(r.result.status).toBe('warn');
    expect(r.findings.map((f: { severity: string }) => f.severity)).toEqual(['warn', 'warn']);
    expect(r.findings[0]).toEqual({
      check: 'artifact-language',
      severity: 'warn',
      source_path: '.prospec/changes/x/review.md',
      detail: expect.stringContaining('Traditional Chinese (Taiwan)'),
    });
  });

  it('reports one finding per offending file, and none for the clean ones beside them', () => {
    const r = evaluateArtifactLanguage(
      src([
        { path: '.prospec/changes/x/proposal.md', hasScript: true },
        { path: '.prospec/changes/x/plan.md', hasScript: false },
        { path: '.prospec/changes/x/tasks.md', hasScript: false },
      ]),
    );
    expect(r.findings.map((f: { source_path: string }) => f.source_path)).toEqual([
      '.prospec/changes/x/plan.md',
      '.prospec/changes/x/tasks.md',
    ]);
  });
});

describe('evaluateCanonicalDocDrift', () => {
  it('yields a WARN finding for a drifted doc', () => {
    const r = evaluateCanonicalDocDrift({
      available: true,
      docs: [{ source_path: 'prospec/README.md', matches: false }],
    });
    expect(r.result.status).toBe('warn');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({
      severity: 'warn',
      source_path: 'prospec/README.md',
      detail: expect.stringContaining('canonical'),
    });
  });

  it('yields no finding for a matching doc', () => {
    const r = evaluateCanonicalDocDrift({
      available: true,
      docs: [{ source_path: 'prospec/README.md', matches: true }],
    });
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('passes through unavailable status', () => {
    const r = evaluateCanonicalDocDrift({ available: false, reason: 'error', docs: [] });
    expect(r.result.status).toBe('skipped');
    expect(r.findings).toHaveLength(0);
  });
});

describe('evaluateDeltaSpecLandingFidelity (REQ-LIB-061)', () => {
  const landingEntry = (over: Partial<LandingFidelityEntry> = {}): LandingFidelityEntry => ({
    change: 'my-change',
    source_path: '.prospec/changes/my-change/delta-spec.md',
    reqId: 'REQ-LIB-001',
    feature: 'drift-checks',
    resolution: { kind: 'resolved' },
    landing: '',
    existingBody: null,
    declared: [],
    droppedBlockPresent: false,
    ...over,
  });
  const src = (entries: LandingFidelityEntry[], changes?: string[]): DeltaSpecLandingFidelitySource => ({
    available: true,
    changes: changes ?? [...new Set(entries.map((e) => e.change))],
    entries,
  });

  it('enumerates every change whose delta-spec was read as a subject, ADDED-only changes included (REQ-TYPES-027)', () => {
    const r = evaluateDeltaSpecLandingFidelity(src([], ['added-only', 'other']));
    expect(r.result.status).toBe('pass');
    expect(r.result.subjects).toEqual(['added-only', 'other']);
  });

  it('skips honestly when the source is unavailable', () => {
    const r = evaluateDeltaSpecLandingFidelity({ available: false, reason: 'no changes dir', changes: [], entries: [] });
    expect(r.result.status).toBe('skipped');
    expect(r.result.reason).toBe('no changes dir');
    expect(r.findings).toHaveLength(0);
  });

  it('fails an undeclared drop, naming the REQ and the bullet source text', () => {
    const r = evaluateDeltaSpecLandingFidelity(
      src([landingEntry({ existingBody: '- WHEN a, THEN x\n- WHEN b, THEN y', landing: '- WHEN a, THEN x' })]),
    );
    expect(r.result.status).toBe('fail');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.severity).toBe('fail');
    expect(r.findings[0]!.source_path).toBe('.prospec/changes/my-change/delta-spec.md');
    expect(r.findings[0]!.detail).toContain('REQ-LIB-001');
    expect(r.findings[0]!.detail).toContain('WHEN b, THEN y');
  });

  it('passes a drop that is declared under **Dropped:** (deliberate)', () => {
    const r = evaluateDeltaSpecLandingFidelity(
      src([
        landingEntry({
          existingBody: '- WHEN a, THEN x\n- WHEN b, THEN y',
          landing: '- WHEN a, THEN x',
          declared: whenThenBullets('- WHEN b, THEN y'),
          droppedBlockPresent: true,
        }),
      ]),
    );
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('passes when the landing block restates every trust-zone bullet', () => {
    const r = evaluateDeltaSpecLandingFidelity(
      src([
        landingEntry({
          existingBody: '- WHEN a, THEN x\n- WHEN b, THEN y',
          landing: '- WHEN a, THEN x\n- WHEN b, THEN y',
        }),
      ]),
    );
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('warns a stale declaration — a declared bullet that was not dropped', () => {
    const r = evaluateDeltaSpecLandingFidelity(
      src([
        landingEntry({
          existingBody: '- WHEN a, THEN x\n- WHEN b, THEN y',
          landing: '- WHEN a, THEN x\n- WHEN b, THEN y',
          declared: whenThenBullets('- WHEN c, THEN z'),
          droppedBlockPresent: true,
        }),
      ]),
    );
    expect(r.result.status).toBe('warn');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.severity).toBe('warn');
    expect(r.findings[0]!.detail).toContain('stale');
    expect(r.findings[0]!.detail).toContain('WHEN c, THEN z');
  });

  it('excludes an entry with no **Spec:** block and one with no resolvable body', () => {
    const r = evaluateDeltaSpecLandingFidelity(
      src([
        landingEntry({ landing: '', existingBody: '- WHEN a, THEN x' }),
        landingEntry({ reqId: 'REQ-LIB-002', landing: '- WHEN a, THEN x', existingBody: null }),
      ]),
    );
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('warns a **Dropped:** block that is present but declares no list item (M1)', () => {
    const r = evaluateDeltaSpecLandingFidelity(
      src([landingEntry({ droppedBlockPresent: true, declared: [] })]),
    );
    expect(r.result.status).toBe('warn');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.severity).toBe('warn');
    expect(r.findings[0]!.detail).toContain('REQ-LIB-001');
    expect(r.findings[0]!.detail).toContain('Dropped');
  });

  it('does not warn M1 when the **Dropped:** block declares a list item', () => {
    const r = evaluateDeltaSpecLandingFidelity(
      src([landingEntry({ droppedBlockPresent: true, declared: whenThenBullets('- WHEN b, THEN y') })]),
    );
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  it('reports the full set difference — one finding per undeclared bullet', () => {
    const r = evaluateDeltaSpecLandingFidelity(
      src([
        landingEntry({
          existingBody: '- WHEN a, THEN x\n- WHEN b, THEN y\n- WHEN c, THEN z',
          landing: '- WHEN a, THEN x',
        }),
      ]),
    );
    expect(r.result.status).toBe('fail');
    expect(r.findings).toHaveLength(2);
    expect(r.findings.map((f) => f.detail).join('\n')).toContain('WHEN b, THEN y');
    expect(r.findings.map((f) => f.detail).join('\n')).toContain('WHEN c, THEN z');
  });

  it('an equal-count-different-content replacement still reports the drop (set, not count)', () => {
    const r = evaluateDeltaSpecLandingFidelity(
      src([landingEntry({ existingBody: '- WHEN a, THEN x', landing: '- WHEN q, THEN r' })]),
    );
    expect(r.result.status).toBe('fail');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.detail).toContain('WHEN a, THEN x');
  });

  // issue #211 — a mis-pointing `**Feature:**` header fails loudly instead of
  // slipping into the excluded (pass-by-skip) set.
  it('fails a wrong-feature routing header, naming the REQ home', () => {
    const r = evaluateDeltaSpecLandingFidelity(
      src([landingEntry({ feature: 'drift-detection', resolution: { kind: 'wrong-feature', home: 'sdd-workflow' } })]),
    );
    expect(r.result.status).toBe('fail');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.severity).toBe('fail');
    expect(r.findings[0]!.detail).toContain('REQ-LIB-001');
    expect(r.findings[0]!.detail).toContain('sdd-workflow');
  });

  it('does NOT fail a not-found routing header — a create-and-deprecate shape, not a mis-route', () => {
    const r = evaluateDeltaSpecLandingFidelity(
      src([landingEntry({ resolution: { kind: 'not-found' } })]),
    );
    expect(r.result.status).toBe('pass');
    expect(r.findings).toHaveLength(0);
  });

  // The wrong-feature failure fires even with no Spec block (a REMOVED entry or a
  // Spec-less MODIFIED), so it cannot dodge the check via the drop-diff exclusion.
  it('fails a wrong-feature header even when the entry carries no landing block', () => {
    const r = evaluateDeltaSpecLandingFidelity(
      src([landingEntry({ landing: '', existingBody: null, resolution: { kind: 'wrong-feature', home: 'archive-service' } })]),
    );
    expect(r.result.status).toBe('fail');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.detail).toContain('archive-service');
  });
});
