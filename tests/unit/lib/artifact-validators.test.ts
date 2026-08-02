import { describe, it, expect } from 'vitest';
import {
  validateSlug,
  validateBackfillDraft,
  validatePromoteScaffold,
  validateDesignSpec,
  collectNcMarkers,
  coverageGap,
  type PromoteScaffoldInputs,
} from '../../../src/lib/artifact-validators.js';

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
