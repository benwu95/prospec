import { describe, it, expect } from 'vitest';
import {
  validateSlug,
  validateBackfillDraft,
  validatePromoteScaffold,
  validateDesignSpec,
  collectNcMarkers,
  coverageGap,
  validateCandidates,
  computeCandidateMetrics,
  type PromoteScaffoldInputs,
  type CandidatesInputs,
} from '../../../src/lib/artifact-validators.js';
import { buildDependencyRules } from '../../../src/lib/drift-checker.js';
import { moduleAttributor } from '../../../src/lib/drift-sources.js';
import type { ModuleMap } from '../../../src/types/module-map.js';

describe('validateSlug', () => {
  it('accepts a kebab-case slug', () => {
    expect(validateSlug('user-profile').ok).toBe(true);
  });

  it('rejects separators and dot-dot traversal', () => {
    for (const bad of ['a/b', 'a\\b', '..', 'a..b', '']) {
      const verdict = validateSlug(bad);
      expect(verdict.ok).toBe(false);
      expect(verdict.findings[0]!.level).toBe('FAIL');
    }
  });
});

describe('validateBackfillDraft', () => {
  const draft = [
    '# Backfill Draft',
    '',
    '**Feature:** user-profile',
    '**Story:** US-1',
    '',
    'As a downstream consumer,',
    'I want profile reads,',
    'So that [NEEDS CLARIFICATION: value unknown].',
    '',
    '- AC: reads return the stored profile',
  ].join('\n');

  it('passes a route-compatible draft and reports NC facts without a ratio verdict', () => {
    const report = validateBackfillDraft(draft);
    expect(report.ok).toBe(true);
    expect(report.facts).toMatchObject({ featureHeaderCount: 1, storyHeaderCount: 1 });
    expect(report.facts.ncMarkers).toEqual([
      { line: 8, text: 'So that [NEEDS CLARIFICATION: value unknown].' },
    ]);
    // No ratio judgment in the findings — only the raw count as INFO.
    const messages = report.findings.map((f) => f.message).join(' ');
    expect(messages).not.toMatch(/50%|ratio exceeded|abort/);
  });

  it('fails a draft missing the route headers', () => {
    const report = validateBackfillDraft('# Draft\n\njust prose\n');
    expect(report.ok).toBe(false);
    expect(report.findings.filter((f) => f.level === 'FAIL')).toHaveLength(2);
  });
});

describe('validatePromoteScaffold', () => {
  const good: PromoteScaffoldInputs = {
    slug: 'user-profile',
    hasBackfillDraft: true,
    hasProposal: true,
    hasDeltaSpec: true,
    hasPlan: false,
    hasTasks: false,
    metadata: { scale: 'backfill', status: 'implemented', relatedModules: ['services'] },
    trustZoneProbe: { dirty: [] },
  };

  it('passes a correct scaffold with no findings', () => {
    const verdict = validatePromoteScaffold(good);
    expect(verdict.ok).toBe(true);
    expect(verdict.findings).toEqual([]);
  });

  // REQ-LIB-040: delta-spec.md is what promotion exists to produce — the
  // "complete machine verdict" must cover it, not only the forbidden artifacts.
  it('fails when delta-spec.md is missing and names the file', () => {
    const verdict = validatePromoteScaffold({ ...good, hasDeltaSpec: false });
    expect(verdict.ok).toBe(false);
    expect(verdict.findings.filter((f) => f.level === 'FAIL')).toHaveLength(1);
    expect(verdict.findings[0]?.message).toContain('delta-spec.md');
  });

  it('fails when plan/tasks exist — backfill has no hollow planning artifacts', () => {
    const verdict = validatePromoteScaffold({ ...good, hasPlan: true, hasTasks: true });
    expect(verdict.ok).toBe(false);
    expect(verdict.findings.map((f) => f.message).join(' ')).toMatch(/plan\.md.*tasks\.md|plan\.md/);
    expect(verdict.findings).toHaveLength(2);
  });

  it('fails on wrong metadata shape and on missing metadata', () => {
    // scale + status + the now-empty related_modules = 3 findings
    expect(
      validatePromoteScaffold({ ...good, metadata: { scale: 'quick', status: 'story' } }).findings,
    ).toHaveLength(3);
    expect(validatePromoteScaffold({ ...good, metadata: undefined }).ok).toBe(false);
  });

  it('fails on empty related_modules — the traced modules must be recorded', () => {
    const verdict = validatePromoteScaffold({
      ...good,
      metadata: { scale: 'backfill', status: 'implemented', relatedModules: [] },
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.findings.map((f) => f.message).join(' ')).toContain('related_modules is empty');
  });

  it('fails when the trust zone has uncommitted changes', () => {
    const verdict = validatePromoteScaffold({
      ...good,
      trustZoneProbe: { dirty: ['prospec/specs/features/user-profile.md'] },
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.findings[0]!.message).toContain('trust-zone');
  });

  it('discloses an unrunnable trust-zone probe — never a PASS with no findings', () => {
    const verdict = validatePromoteScaffold({
      ...good,
      trustZoneProbe: { unavailable: 'git status failed: index.lock held' },
    });
    expect(verdict.findings).toHaveLength(1);
    expect(verdict.findings[0]!.level).toBe('INFO');
    expect(verdict.findings[0]!.message).toContain('could not be verified');
    expect(verdict.findings[0]!.message).toContain('index.lock held');
  });
});

describe('validateDesignSpec', () => {
  const spec = [
    '# Design Spec',
    '',
    '## Visual Identity',
    'palette…',
    '## Components',
    'button…',
    '## Responsive Strategy',
    'breakpoints…',
  ].join('\n');

  it('passes when required sections exist and no NC markers remain', () => {
    const report = validateDesignSpec(spec);
    expect(report.ok).toBe(true);
    expect(report.facts.missingSections).toEqual([]);
  });

  it('fails on a missing required section, naming it', () => {
    const report = validateDesignSpec(spec.replace('## Responsive Strategy', '## Layout'));
    expect(report.ok).toBe(false);
    expect(report.facts.missingSections).toEqual(['Responsive Strategy']);
  });

  it('fails while any NC marker remains, reporting its location', () => {
    const report = validateDesignSpec(`${spec}\n[NEEDS CLARIFICATION: hover state]`);
    expect(report.ok).toBe(false);
    expect(report.facts.ncMarkers).toHaveLength(1);
  });
});

describe('collectNcMarkers / coverageGap', () => {
  it('reports 1-indexed lines', () => {
    expect(collectNcMarkers('a\n[NEEDS CLARIFICATION: x]\n')).toEqual([
      { line: 2, text: '[NEEDS CLARIFICATION: x]' },
    ]);
  });

  it('computes the set difference in allFeatures order', () => {
    expect(coverageGap(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c']);
    expect(coverageGap([], ['b'])).toEqual([]);
  });
});

describe('validateCandidates — candidate metrics (REQ-LIB-089)', () => {
  // cli → services → lib → types, with a domain module declared by glob.
  const moduleMap: ModuleMap = {
    modules: [
      { name: 'types', paths: ['src/types'], keywords: [], relationships: { depends_on: [] } },
      { name: 'lib', paths: ['src/lib'], keywords: [], relationships: { depends_on: ['types'] } },
      { name: 'services', paths: ['src/services'], keywords: [], relationships: { depends_on: ['types', 'lib'] } },
      { name: 'cli', paths: ['src/cli'], keywords: [], relationships: { depends_on: ['services'] } },
    ],
  };
  const rules = buildDependencyRules(moduleMap);
  const attribute = moduleAttributor(moduleMap);
  const candidate = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    title: `Candidate ${id}`,
    overview: 'overview',
    trade_offs: { pros: [], cons: [], blast_radius: 'small' },
    ...extra,
  });
  const file = (id: string, extra: Record<string, unknown> = {}) => ({
    file: `${id}.json`,
    content: JSON.stringify(candidate(id, extra)),
  });
  const inputs = (overrides: Partial<CandidatesInputs> = {}): CandidatesInputs => ({
    candidates: [file('option-a'), file('option-b')],
    decision: null,
    rules,
    attribute,
    ...overrides,
  });

  it('counts a callee outside the caller\'s direct depends_on as one violating edge', () => {
    const row = computeCandidateMetrics(
      candidate('option-a', {
        call_chain: [
          'prospec x → src/cli/commands/x.ts → src/services/x.service.ts → src/lib/x.ts',
          'prospec y → src/cli/commands/y.ts → src/lib/y.ts',
        ],
      }) as never,
      rules,
      attribute,
    );
    // cli → lib skips services: cli declares only services, so that edge violates
    expect(row.direction_violations).toBe(1);
    expect(row.violating_edges).toEqual([{ from: 'cli', to: 'lib' }]);
    expect(row.touched_modules).toEqual(['cli', 'lib', 'services']);
  });

  it('counts a repeated violating edge once', () => {
    const row = computeCandidateMetrics(
      candidate('option-a', {
        call_chain: ['src/lib/a.ts → src/services/a.service.ts', 'src/lib/b.ts → src/services/b.service.ts'],
      }) as never,
      rules,
      attribute,
    );
    expect(row.direction_violations).toBe(1);
    expect(row.violating_edges).toEqual([{ from: 'lib', to: 'services' }]);
  });

  it('ignores entry labels, lists unattributed paths, and lets an unresolved hop break the edge', () => {
    const row = computeCandidateMetrics(
      candidate('option-a', {
        call_chain: ['prospec status → src/cli/a.ts → vendor/x.js → src/lib/a.ts'],
      }) as never,
      rules,
      attribute,
    );
    expect(row.unknown_references).toEqual(['vendor/x.js']);
    // cli → (unknown) → lib is not a cli → lib edge
    expect(row.direction_violations).toBe(0);
    expect(row.touched_modules).toEqual(['cli', 'lib']);
  });

  it('attributes a path token as prose quotes it, resolving .. and refusing an escape', () => {
    const row = computeCandidateMetrics(
      candidate('option-a', {
        call_chain: [
          'src/lib/../cli/a.ts -> src/services/b.ts',
          '`./src/cli/a.ts` → src/types/x.ts.',
          'src/cli/a.ts → ../outside/src/lib/x.ts',
        ],
      }) as never,
      rules,
      attribute,
    );
    // cli → services is allowed; read literally, the first chain would be lib → services
    expect(row.violating_edges).toEqual([{ from: 'cli', to: 'types' }]);
    expect(row.unknown_references).toEqual(['../outside/src/lib/x.ts']);
  });

  it('attributes a Windows-separated path and treats a leading route as an entry label', () => {
    const row = computeCandidateMetrics(
      candidate('option-a', { call_chain: ['src\\lib\\a.ts → src\\cli\\b.ts', 'POST /api/users → src/cli/b.ts'] }) as never,
      rules,
      attribute,
    );
    expect(row.violating_edges).toEqual([{ from: 'lib', to: 'cli' }]);
    expect(row.unknown_references).toEqual([]);
  });

  it('resolves a hop without a path only by an exact module name, and accepts "->"', () => {
    const row = computeCandidateMetrics(
      candidate('option-a', { call_chain: ['cli -> lib'] }) as never,
      rules,
      attribute,
    );
    expect(row.violating_edges).toEqual([{ from: 'cli', to: 'lib' }]);
  });

  it('unions declared touched_modules known to the map, disclosing unknown names', () => {
    const row = computeCandidateMetrics(
      candidate('option-a', { touched_modules: ['types', 'ghost'], call_chain: ['src/lib/a.ts'], estimated_lines: 120 }) as never,
      rules,
      attribute,
    );
    expect(row.touched_modules_count).toBe(2);
    expect(row.unknown_references).toEqual(['ghost']);
    expect(row.estimated_lines).toBe(120);
    expect(computeCandidateMetrics(candidate('option-b') as never, rules, attribute).estimated_lines).toBeNull();
  });

  it('passes two valid candidates with metrics facts and INFO-only violations', () => {
    const report = validateCandidates(
      inputs({ candidates: [file('option-a', { call_chain: ['src/cli/a.ts → src/lib/a.ts'] }), file('option-b')] }),
    );
    expect(report.ok).toBe(true);
    expect(report.facts.metrics.map((m) => m.id)).toEqual(['option-a', 'option-b']);
    expect(report.facts.degraded).toBe(false);
    expect(report.facts.rule_source).toBe('module-map');
    expect(report.findings.every((f) => f.level === 'INFO')).toBe(true);
    expect(report.facts.decision).toEqual({ state: 'absent' });
  });

  it('discloses a single valid candidate as degraded without failing', () => {
    const report = validateCandidates(inputs({ candidates: [file('option-a')] }));
    expect(report.ok).toBe(true);
    expect(report.facts.degraded).toBe(true);
    expect(report.findings.some((f) => f.level === 'INFO' && /degraded/.test(f.message))).toBe(true);
  });

  it('fails on an unreadable, invalid or misnamed candidate, and on no valid candidate', () => {
    // Each bad file sits next to a valid one, so the per-file FAIL — not the
    // "no valid candidate" FAIL — is what the assertion pins.
    const failsOn = (bad: { file: string; content: string | null }, message: RegExp) => {
      const report = validateCandidates(inputs({ candidates: [bad, file('option-c')] }));
      expect(report.ok).toBe(false);
      expect(report.findings).toContainEqual({ level: 'FAIL', message: expect.stringMatching(message) });
      expect(report.facts.metrics.map((m) => m.id)).toEqual(['option-c']);
    };
    failsOn({ file: 'option-a.json', content: null }, /^option-a\.json: unreadable$/);
    failsOn({ file: 'option-a.json', content: '{not json' }, /^option-a\.json: not a valid candidate payload/);
    failsOn({ file: 'option-b.json', content: JSON.stringify(candidate('option-a')) }, /^option-b\.json: file name does not match its id 'option-a'$/);
    const extra = validateCandidates(inputs({ candidates: [file('option-a', { judge: true }), file('option-b')] }));
    expect(extra.ok).toBe(false);
    expect(extra.facts.metrics.map((m) => m.id)).toEqual(['option-b']);
    expect(validateCandidates(inputs({ candidates: [] })).ok).toBe(false);
  });

  it('reads a valid decision and fails a legacy one without graded_by', () => {
    const decision = {
      recommended_option: 'option-a',
      evaluation_matrix: [
        { dimension: 'blast_radius_complexity', winner: 'option-a', score_rationale: 'x' },
        { dimension: 'constitution_layering', winner: 'tie', score_rationale: 'x' },
        { dimension: 'extensibility_simplicity', winner: 'option-a', score_rationale: 'x' },
      ],
      rationale: 'x',
      graded_by: 'in-session',
    };
    const valid = validateCandidates(inputs({ decision: { file: 'decision.json', content: JSON.stringify(decision) } }));
    expect(valid.ok).toBe(true);
    expect(valid.facts.decision).toEqual({ state: 'valid', recommended_option: 'option-a', graded_by: 'in-session' });

    const legacy: Record<string, unknown> = { ...decision };
    delete legacy.graded_by;
    const invalid = validateCandidates(inputs({ decision: { file: 'decision.json', content: JSON.stringify(legacy) } }));
    expect(invalid.ok).toBe(false);
    expect(invalid.facts.decision).toEqual({ state: 'invalid' });
  });

  it('fails a decision naming a candidate the set does not validly hold', () => {
    const decision = (overrides: Record<string, unknown>) => ({
      file: 'decision.json',
      content: JSON.stringify({
        recommended_option: 'option-a',
        evaluation_matrix: [
          { dimension: 'blast_radius_complexity', winner: 'option-a', score_rationale: 'x' },
          { dimension: 'constitution_layering', winner: 'tie', score_rationale: 'x' },
          { dimension: 'extensibility_simplicity', winner: 'option-b', score_rationale: 'x' },
        ],
        rationale: 'x',
        graded_by: 'in-session',
        ...overrides,
      }),
    });
    const failures = (report: ReturnType<typeof validateCandidates>) =>
      report.findings.filter((f) => f.level === 'FAIL').map((f) => f.message);

    expect(failures(validateCandidates(inputs({ decision: decision({ recommended_option: 'option-c' }) })))).toEqual([
      "decision.json: recommended_option 'option-c' is not a valid candidate",
    ]);
    expect(failures(validateCandidates(inputs({ candidates: [file('option-a')], decision: decision({}) })))).toEqual([
      "decision.json: extensibility_simplicity winner 'option-b' is not a valid candidate",
    ]);
    expect(
      failures(
        validateCandidates(
          inputs({
            candidates: [file('option-a')],
            decision: decision({
              recommended_option: 'hybrid',
              evaluation_matrix: [
                { dimension: 'blast_radius_complexity', winner: 'tie', score_rationale: 'x' },
                { dimension: 'constitution_layering', winner: 'tie', score_rationale: 'x' },
                { dimension: 'extensibility_simplicity', winner: 'tie', score_rationale: 'x' },
              ],
            }),
          }),
        ),
      ),
    ).toEqual([
      'decision.json: recommended_option hybrid needs a hybrid_recommendation',
      'decision.json: recommended_option hybrid needs at least two valid candidates',
    ]);
    const hybrid = validateCandidates(inputs({ decision: decision({ recommended_option: 'hybrid', hybrid_recommendation: 'a + b' }) }));
    expect(hybrid.ok).toBe(true);
  });
});

