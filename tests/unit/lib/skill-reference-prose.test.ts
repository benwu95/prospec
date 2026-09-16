import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  carriesTextAt,
  citedReferences,
  citesReferenceAt,
  parseSkillReferenceProse,
} from '../../../src/lib/skill-reference-prose.js';

const doc = (...lines: string[]) => lines.join('\n');

describe('deployed prose parser (REQ-LIB-079)', () => {
  it('keys a citation by the heading path that carries it', () => {
    const prose = parseSkillReferenceProse(
      doc(
        '# Skill',
        '## Core Workflow',
        '### Phase 4: Design',
        'Read [`references/plan-format.md`](references/plan-format.md) here.',
        '### Phase 5: Spec',
        'Follow `references/delta-spec-format.md`.',
      ),
    );
    expect(prose.citations).toEqual([
      { site: 'Core Workflow > Phase 4: Design', reference: 'plan-format.md', line: 4 },
      { site: 'Core Workflow > Phase 5: Spec', reference: 'delta-spec-format.md', line: 6 },
    ]);
  });

  it('does not let a Startup Loading summary pay for a missing phase citation', () => {
    const prose = parseSkillReferenceProse(
      doc(
        '## Startup Loading',
        'Read [`references/plan-format.md`](references/plan-format.md) at Phase 4.',
        '## Core Workflow',
        '### Phase 4: Design',
        'Write the plan.',
      ),
    );
    expect(citesReferenceAt(prose, 'Startup Loading', 'plan-format.md')).toBe(true);
    expect(citesReferenceAt(prose, 'Core Workflow > Phase 4: Design', 'plan-format.md')).toBe(false);
  });

  it('records the same reference at each phase that cites it', () => {
    const prose = parseSkillReferenceProse(
      doc(
        '## Core Workflow',
        '### Phase 1',
        '`references/x.md`',
        '### Phase 2',
        '`references/x.md`',
      ),
    );
    expect(prose.citations.map((c) => c.site)).toEqual(['Core Workflow > Phase 1', 'Core Workflow > Phase 2']);
    expect(citedReferences(prose)).toEqual(['x.md']);
  });

  it('counts a link and its label once, not twice', () => {
    const prose = parseSkillReferenceProse(
      doc('## A', '[`references/x.md`](references/x.md) and [`references/x.md`](references/x.md)'),
    );
    expect(prose.citations).toHaveLength(1);
  });

  it.each(['.bak', '/child', 'x', '_old', '%20backup', '-old', '舊'])('R2-1: does not truncate a reference path ending in %s', (suffix) => {
    const prose = parseSkillReferenceProse(doc('## A', `Read \`references/x.md${suffix}\`.`));
    expect(citesReferenceAt(prose, 'A', 'x.md')).toBe(false);
    expect(citedReferences(prose)).toEqual([`x.md${suffix}`]);
  });

  it('keeps complete link, code and bare paths with sentence punctuation or fragments', () => {
    const prose = parseSkillReferenceProse(doc('## A',
      '[read](references/link.md#section) and `references/code.md`, references/bare.md.',
    ));
    expect(citedReferences(prose)).toEqual(['link.md', 'code.md', 'bare.md']);
  });

  it('does not treat a reference inventory glob or template as a concrete citation', () => {
    const prose = parseSkillReferenceProse(doc('## A', '`references/*.md` and `references/{name}.md`'));
    expect(citedReferences(prose)).toEqual([]);
  });

  it('ignores citations inside fenced examples', () => {
    const prose = parseSkillReferenceProse(
      doc('## A', '```md', 'Read `references/example.md`', '```', 'Read `references/real.md`'),
    );
    expect(citedReferences(prose)).toEqual(['real.md']);
  });

  it('R1-4: ignores inline, multiline and unclosed HTML comments without shifting lines', () => {
    const prose = parseSkillReferenceProse(doc(
      '## A',
      '<!-- references/hidden.md --> Read `references/visible.md`.',
      '<!--',
      '## Hidden heading',
      'references/hidden.md',
      '-->',
      'Read `references/after.md`.',
      '<!-- references/unfinished.md',
    ));
    expect(prose.citations).toEqual([
      { site: 'A', reference: 'visible.md', line: 2 },
      { site: 'A', reference: 'after.md', line: 7 },
    ]);
    expect(carriesTextAt(prose, 'A', 'references/hidden.md')).toBe(false);
  });

  it('reports an unclosed fence instead of answering from a truncated document', () => {
    const prose = parseSkillReferenceProse(doc('## A', '```md', 'Read `references/x.md`'));
    expect(prose.unclosedFence).toBe(true);
  });

  it('reports a repeated heading path as unlocatable rather than merging it', () => {
    const prose = parseSkillReferenceProse(
      doc('## A', '### Phase 1', '`references/x.md`', '## A', '### Phase 1', '`references/y.md`'),
    );
    // Both levels repeat, and both are reported: a citation under either one
    // cannot be attributed to a single place in the document.
    expect(prose.duplicateSites).toEqual(['A', 'A > Phase 1']);
  });

  it('answers text presence per site, so moved map prose does not pass', () => {
    const prose = parseSkillReferenceProse(
      doc('## Startup Loading', 'Read `references/x.md` at Phase 4.', '## Entry Gate', 'Nothing here.'),
    );
    expect(carriesTextAt(prose, 'Startup Loading', 'Read `references/x.md` at Phase 4.')).toBe(true);
    expect(carriesTextAt(prose, 'Entry Gate', 'Read `references/x.md` at Phase 4.')).toBe(false);
    expect(carriesTextAt(prose, 'No Such Site', 'anything')).toBe(false);
  });
});

/**
 * The parser is held to the SAME frozen pre-migration inventory the registry is,
 * from the other side: it reads the shipped instructions and must reproduce the
 * site map captured before any of this existed.
 */
describe('parser reproduces the frozen pre-migration site map (REQ-TESTS-119)', () => {
  const baseline = JSON.parse(
    readFileSync(new URL('../../fixtures/station-reference-baseline.json', import.meta.url), 'utf8'),
  ) as { prose_sites: Record<string, Record<string, string[]>> };

  it.each(Object.keys(baseline.prose_sites))('%s', (skill) => {
    const raw = readFileSync(`.claude/skills/${skill}/SKILL.md`, 'utf8');
    const prose = parseSkillReferenceProse(raw);
    const actual: Record<string, string[]> = {};
    for (const citation of prose.citations) {
      actual[citation.site] ??= [];
      if (!actual[citation.site]!.includes(citation.reference)) actual[citation.site]!.push(citation.reference);
    }
    expect(actual).toEqual(baseline.prose_sites[skill]);
    expect(prose.unclosedFence).toBe(false);
    expect(prose.duplicateSites).toEqual([]);
  });
});
