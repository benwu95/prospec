import { describe, it, expect } from 'vitest';
import { indexSpec } from '../../../src/lib/spec-headings.js';
import { renderSpecSlices, selectSpecSlices } from '../../../src/lib/spec-slices.js';

/**
 * The narrow read's selection half (REQ-LIB-046): pure, so the CLI command and
 * the MCP tool cannot drift into two answers for one question.
 */
const SPEC = [
  '---',
  'feature: quiz',
  'story_count: 2',
  'req_count: 3',
  '---',
  '',
  '# Quiz',
  '',
  '## US-1: First story [P0]',
  '',
  'As a developer,',
  '',
  '#### REQ-QUIZ-001: first',
  'One sentence.',
  '- WHEN a, THEN b',
  '',
  '#### REQ-QUIZ-002: second',
  'Body two.',
  '',
  '### US-2: Second story [P1]',
  '',
  '#### REQ-QUIZ-003: third',
  'Body three.',
  '',
  '## Deprecated Requirements',
  '',
  '#### ~~REQ-QUIZ-004~~: retired',
  'Gone.',
  '',
].join('\n');

const select = (selectors: { req?: string[]; story?: string[] }) =>
  selectSpecSlices(SPEC, indexSpec(SPEC, { includeStruck: true }), selectors);

describe('selectSpecSlices', () => {
  it('returns the requested requirements in document order, whatever order they were asked in', () => {
    const picked = select({ req: ['REQ-QUIZ-003', 'REQ-QUIZ-001'] });
    expect(picked.slices.map((s) => s.id)).toEqual(['REQ-QUIZ-001', 'REQ-QUIZ-003']);
    expect(picked.misses).toEqual([]);
    expect(picked.slices[0]!.text).toBe(
      '#### REQ-QUIZ-001: first\nOne sentence.\n- WHEN a, THEN b\n',
    );
  });

  it('carries the owning story heading and level on each requirement slice', () => {
    const [first, third] = select({ req: ['REQ-QUIZ-001', 'REQ-QUIZ-003'] }).slices;
    expect(first).toMatchObject({ story: 'US-1: First story [P0]', storyLevel: 2 });
    expect(third).toMatchObject({ story: 'US-2: Second story [P1]', storyLevel: 3 });
  });

  it('selects a whole story section, requirements included', () => {
    const picked = select({ story: ['US-2'] });
    expect(picked.slices.map((s) => s.kind)).toEqual(['story']);
    expect(picked.slices[0]!.text).toContain('#### REQ-QUIZ-003: third');
    expect(picked.slices[0]!.text).not.toContain('Deprecated');
  });

  it('emits a requirement once when both it and its story are selected', () => {
    const picked = select({ req: ['REQ-QUIZ-003'], story: ['US-2'] });
    expect(picked.slices.map((s) => [s.kind, s.id])).toEqual([['story', 'US-2']]);
    expect(picked.misses).toEqual([]);
  });

  it('keeps a requirement whose story was NOT selected beside the selected story', () => {
    const picked = select({ req: ['REQ-QUIZ-001'], story: ['US-2'] });
    expect(picked.slices.map((s) => s.id)).toEqual(['REQ-QUIZ-001', 'US-2']);
  });

  it('interleaves stories and requirements by position, not by selector kind', () => {
    // The case that actually pins the ordering: US-1 opens BEFORE REQ-QUIZ-003,
    // so grouping requirements ahead of stories would put them the wrong way
    // round while every same-kind assertion stayed green.
    const picked = select({ req: ['REQ-QUIZ-003'], story: ['US-1'] });
    expect(picked.slices.map((s) => s.id)).toEqual(['US-1', 'REQ-QUIZ-003']);
  });

  it('reports unmatched selectors instead of an empty success', () => {
    const picked = select({ req: ['REQ-QUIZ-001', 'REQ-QUIZ-404'], story: ['US-9'] });
    expect(picked.slices.map((s) => s.id)).toEqual(['REQ-QUIZ-001']);
    expect(picked.misses).toEqual(['REQ-QUIZ-404', 'US-9']);
  });

  it('normalizes case and surrounding whitespace in a selector', () => {
    expect(select({ req: [' req-quiz-001 '] }).slices.map((s) => s.id)).toEqual(['REQ-QUIZ-001']);
    expect(select({ story: ['us-2'] }).slices.map((s) => s.id)).toEqual(['US-2']);
  });

  it('keeps a duplicate id\'s other occurrence when only one is inside a selected story', () => {
    // Deduping by id dropped this one from BOTH the output and `misses`. A spec
    // holding two sections with one id is a state the archive writer preserves and
    // reports, so the read must not silently pick one.
    const dup = [
      '## US-1: first [P0]',
      '',
      '#### REQ-DUP-001: inside the story',
      'Body A.',
      '',
      '## Edge Cases',
      '',
      '#### REQ-DUP-001: outside, a duplicate id',
      'Body B.',
      '',
    ].join('\n');
    const picked = selectSpecSlices(dup, indexSpec(dup, { includeStruck: true }), {
      req: ['REQ-DUP-001'],
      story: ['US-1'],
    });
    expect(picked.misses).toEqual([]);
    expect(picked.slices.map((s) => s.kind)).toEqual(['story', 'requirement']);
    expect(picked.slices[1]!.text).toContain('Body B.');
    expect(picked.slices[0]!.text).toContain('Body A.');
  });

  it('marks a struck requirement written OUTSIDE the deprecated section', () => {
    // Retired inline: `deprecated` is false because no `## Deprecated Requirements`
    // section is in force, so without `struck` a structured consumer reads it as an
    // active requirement complete with its owning story.
    const inline = [
      '## US-1: first [P0]',
      '',
      '#### ~~REQ-INL-001~~: retired in place',
      'Gone.',
      '',
    ].join('\n');
    const picked = selectSpecSlices(inline, indexSpec(inline, { includeStruck: true }), {
      req: ['REQ-INL-001'],
    });
    expect(picked.slices[0]).toMatchObject({ struck: true, deprecated: false });
  });

  it('renders with the line ending the slices carry', () => {
    const crlf = SPEC.replace(/\n/g, '\r\n');
    const rendered = renderSpecSlices(
      selectSpecSlices(crlf, indexSpec(crlf), { req: ['REQ-QUIZ-001', 'REQ-QUIZ-002'] }),
    );
    expect(rendered).toContain('\r\n');
    expect(rendered.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('serves a deprecated requirement with its status marked rather than hiding it', () => {
    const picked = select({ req: ['REQ-QUIZ-004'] });
    expect(picked.misses).toEqual([]);
    expect(picked.slices[0]).toMatchObject({ id: 'REQ-QUIZ-004', deprecated: true, story: null });
  });

  it('selects nothing and misses nothing when no selector is given', () => {
    expect(select({})).toEqual({ slices: [], misses: [] });
  });

  it('keeps a fenced code block whole', () => {
    const fenced = [
      '## US-1: fences [P0]',
      '',
      '#### REQ-QUIZ-010: fenced',
      'Body.',
      '```md',
      '#### REQ-QUIZ-999: an example, not a definition',
      '---',
      '```',
      'After.',
      '',
      '#### REQ-QUIZ-011: next',
      'Body.',
      '',
    ].join('\n');
    const picked = selectSpecSlices(fenced, indexSpec(fenced), { req: ['REQ-QUIZ-010'] });
    expect(picked.slices[0]!.text).toContain('After.');
    expect(picked.slices[0]!.text).not.toContain('REQ-QUIZ-011');
    expect((picked.slices[0]!.text.match(/```/g) ?? []).length).toBe(2);
  });

  it('selects requirements and stories from multiple slices', () => {
    const main = [
      '## Slices',
      '- [A](./quiz/a.md)',
      '- [B](./quiz/b.md)',
      '',
      '## US-0: Main',
      '#### REQ-QUIZ-000: m',
      'Main body.',
    ].join('\n');
    const slices = {
      'a': '## US-1: a\n\n#### REQ-QUIZ-001: a\n',
      'b': '## US-2: b\n\n#### REQ-QUIZ-002: b\n',
    };
    const content = { main, slices };
    const index = indexSpec(content);

    const picked = selectSpecSlices(content, index, { req: ['REQ-QUIZ-001', 'REQ-QUIZ-000', 'REQ-QUIZ-002'] });
    expect(picked.misses).toEqual([]);
    expect(picked.slices).toHaveLength(3);
    
    // Sort order should be: Main (no slice), then Slice A, then Slice B
    expect(picked.slices[0]!.id).toBe('REQ-QUIZ-000');
    expect(picked.slices[1]!.id).toBe('REQ-QUIZ-001');
    expect(picked.slices[2]!.id).toBe('REQ-QUIZ-002');

    expect(picked.slices[1]!.text).toBe('#### REQ-QUIZ-001: a\n');
  });
});

describe('renderSpecSlices', () => {
  it('renders selected requirements as spec source, under their story heading', () => {
    const rendered = renderSpecSlices(select({ req: ['REQ-QUIZ-001', 'REQ-QUIZ-002'] }));
    expect(rendered).toBe(
      [
        '## US-1: First story [P0]',
        '',
        '#### REQ-QUIZ-001: first',
        'One sentence.',
        '- WHEN a, THEN b',
        '',
        '#### REQ-QUIZ-002: second',
        'Body two.',
        '',
      ].join('\n'),
    );
  });

  it('emits each story heading once, at the level the spec wrote it', () => {
    const rendered = renderSpecSlices(select({ req: ['REQ-QUIZ-001', 'REQ-QUIZ-003'] }));
    expect(rendered.match(/^## US-1: First story \[P0\]$/gm)).toHaveLength(1);
    expect(rendered).toContain('### US-2: Second story [P1]');
  });

  it('renders a deprecated requirement under the Deprecated heading the spec uses', () => {
    const rendered = renderSpecSlices(select({ req: ['REQ-QUIZ-004'] }));
    expect(rendered).toBe(
      ['## Deprecated Requirements', '', '#### ~~REQ-QUIZ-004~~: retired', 'Gone.', ''].join('\n'),
    );
  });

  it('renders a story slice without repeating its heading', () => {
    const rendered = renderSpecSlices(select({ story: ['US-2'] }));
    expect(rendered.match(/US-2: Second story/g)).toHaveLength(1);
    expect(rendered).toContain('#### REQ-QUIZ-003: third');
  });

  it('renders an empty selection as an empty string', () => {
    expect(renderSpecSlices({ slices: [], misses: [] })).toBe('');
  });
});
