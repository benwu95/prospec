import { describe, it, expect } from 'vitest';
import {
  EVIDENCE_MARKER_PREFIX,
  findUnsafeBlockField,
  isUnsafeRawLine,
  EVIDENCE_SECTION_MARKER,
  EVIDENCE_SECTION_HEADING,
  EVIDENCE_BLOCK_END_MARKER,
  EVIDENCE_SECTION_END_MARKER,
  containsEvidenceMarker,
  renderEvidenceBlock,
  renderEvidenceSection,
  splitEvidenceSection,
  type EvidenceBlock,
} from '../../../src/lib/delegated-evidence.js';

describe('containsEvidenceMarker', () => {
  it.each([
    EVIDENCE_SECTION_MARKER,
    EVIDENCE_BLOCK_END_MARKER,
    `${EVIDENCE_MARKER_PREFIX} F-1 -->`,
  ])('detects %s — the collision that would make the document parse back differently', (marker) => {
    expect(containsEvidenceMarker(`prose before\n${marker}\nprose after`)).toBe(true);
  });

  it('accepts prose that merely mentions evidence or html comments', () => {
    expect(containsEvidenceMarker('the evidence is in <!-- a comment --> here')).toBe(false);
    expect(containsEvidenceMarker('## Evidence is a heading, not a marker')).toBe(false);
  });

  it('every marker constant carries the one prefix the guard checks', () => {
    for (const marker of [
      EVIDENCE_SECTION_MARKER,
      EVIDENCE_BLOCK_END_MARKER,
      `${EVIDENCE_MARKER_PREFIX} F-1 -->`,
    ]) {
      expect(marker.startsWith(EVIDENCE_MARKER_PREFIX)).toBe(true);
    }
  });
});

describe('renderEvidenceBlock', () => {
  it('anchors the block by key and defaults the heading to it', () => {
    const rendered = renderEvidenceBlock({ key: 'F-1', body: 'the loop bound is exclusive' });
    expect(rendered.split('\n')).toEqual([
      '<!-- prospec:evidence F-1 -->',
      '### F-1',
      '',
      'the loop bound is exclusive',
      '<!-- prospec:evidence-end -->',
    ]);
  });

  it('uses an explicit heading when one is supplied', () => {
    const rendered = renderEvidenceBlock({
      key: 'constitution',
      heading: 'constitution — PASS',
      body: '12/12 rules audited',
    });
    expect(rendered).toContain('### constitution — PASS');
    expect(rendered).toContain('<!-- prospec:evidence constitution -->');
  });
});

describe('renderEvidenceSection', () => {
  it('renders the empty string for no blocks — a round with no evidence adds nothing', () => {
    expect(renderEvidenceSection([])).toBe('');
  });

  it('emits the section marker before the heading so the split never keys on prose', () => {
    const section = renderEvidenceSection([{ key: 'F-1', body: 'a' }]);
    const lines = section.split('\n');
    expect(lines[0]).toBe(EVIDENCE_SECTION_MARKER);
    expect(lines[1]).toBe(EVIDENCE_SECTION_HEADING);
  });

  it('keeps block order as given', () => {
    const section = renderEvidenceSection([
      { key: 'F-2', body: 'second' },
      { key: 'F-1', body: 'first' },
    ]);
    expect(section.indexOf('F-2')).toBeLessThan(section.indexOf('F-1'));
  });
});

describe('splitEvidenceSection', () => {
  const table = ['# Review Findings: x', '', '| ID | Location |', '|---|---|', '| F-1 | a.ts:1 |'];

  it('returns the whole document when no section marker is present', () => {
    const content = `${table.join('\n')}\n`;
    const { before, blocks } = splitEvidenceSection(content);
    expect(before).toBe(content);
    expect(blocks.size).toBe(0);
  });

  it('splits the section off and keys each block by its anchor', () => {
    const content = [
      ...table,
      '',
      renderEvidenceSection([
        { key: 'F-1', body: 'first body' },
        { key: 'F-2', body: 'second body' },
      ]),
    ].join('\n');
    const { before, blocks } = splitEvidenceSection(content);
    expect(before.trimEnd()).toBe(table.join('\n'));
    expect(before).not.toContain('first body');
    expect([...blocks.keys()]).toEqual(['F-1', 'F-2']);
    expect(blocks.get('F-1')?.body).toBe('first body');
    expect(blocks.get('F-2')?.heading).toBe('F-2');
  });

  it('keeps a table that lives INSIDE evidence prose out of `before`', () => {
    const evidenceTable = '| ID | Location | Severity |\n|---|---|---|\n| X | y.ts:9 | critical |';
    const content = [
      ...table,
      '',
      renderEvidenceSection([{ key: 'F-1', body: `quoted from the report:\n${evidenceTable}` }]),
    ].join('\n');
    const { before, blocks } = splitEvidenceSection(content);
    expect(before).not.toContain('y.ts:9');
    expect(blocks.get('F-1')?.body).toContain(evidenceTable);
  });

  it('round-trips multi-line prose verbatim, blank lines included', () => {
    const body = 'first paragraph\n\nsecond paragraph\n- a bullet';
    const rendered = renderEvidenceSection([{ key: 'F-1', body }]);
    const { blocks } = splitEvidenceSection(`prose\n\n${rendered}`);
    expect(blocks.get('F-1')?.body).toBe(body);
  });

  it('render → split → render is byte-identical', () => {
    const blocks: EvidenceBlock[] = [
      { key: 'F-1', body: 'one' },
      { key: 'F-2', heading: 'F-2 — src/a.ts:3', body: 'two\n\nmore' },
    ];
    const first = renderEvidenceSection(blocks);
    const parsed = splitEvidenceSection(`head\n\n${first}`);
    expect(renderEvidenceSection([...parsed.blocks.values()])).toBe(first);
  });

  it('tolerates CRLF line endings — the marker check is not anchored on a bare \\n', () => {
    const content = `head\r\n\r\n${renderEvidenceSection([{ key: 'F-1', body: 'body' }]).replace(/\n/g, '\r\n')}`;
    const { before, blocks } = splitEvidenceSection(content);
    expect(before.trimEnd()).toBe('head');
    expect(blocks.get('F-1')?.body).toBe('body');
  });

  it('treats end-of-input as an implicit block end so a truncated file keeps its prose', () => {
    const content = [
      'head',
      '',
      EVIDENCE_SECTION_MARKER,
      EVIDENCE_SECTION_HEADING,
      '',
      `${EVIDENCE_MARKER_PREFIX} F-1 -->`,
      '### F-1',
      '',
      'body that was never closed',
    ].join('\n');
    const { blocks } = splitEvidenceSection(content);
    expect(blocks.get('F-1')?.body).toBe('body that was never closed');
  });
});

describe('the section is located by its MARKER, not by the `## Evidence` heading', () => {
  // A heading-keyed locator is byte-EQUIVALENT on well-formed input (back up one
  // line from the heading and you land on the marker), so nothing else in the
  // suite can tell the two apart — this is the input that can. Evidence prose and
  // hand-written review notes both quote headings; keying on prose splits the
  // document at whichever `## Evidence` appears first, which need not be ours.
  it('ignores an earlier `## Evidence` heading that no marker introduces', () => {
    const content = [
      '# Review Findings: x',
      '',
      '## Evidence',
      '',
      'a hand-written note that happens to use that heading',
      '',
      renderEvidenceSection([{ key: 'F-1', body: 'the real block' }]),
    ].join('\n');
    const { before, blocks } = splitEvidenceSection(content);
    expect(blocks.get('F-1')?.body).toBe('the real block');
    // the decoy heading and its note stay in `before` — a heading-keyed locator
    // would have cut the document there and found no blocks at all
    expect(before).toContain('a hand-written note');
    expect(before).toContain('## Evidence');
  });
});

describe('splitEvidenceSection preserves what follows the last block', () => {
  it('returns trailing content as `after` so a rebuild can put it back', () => {
    const content = [
      'head',
      '',
      renderEvidenceSection([{ key: 'F-1', body: 'prose' }]),
      '',
      '本輪未發現問題。',
    ].join('\n');
    const { blocks, after } = splitEvidenceSection(content);
    expect(blocks.size).toBe(1);
    expect(after).toBe('本輪未發現問題。');
  });

  it('reports no trailing content when the section is the document tail', () => {
    const { after } = splitEvidenceSection(`head\n\n${renderEvidenceSection([{ key: 'F-1', body: 'p' }])}\n`);
    expect(after).toBe('');
  });

  it('reports none when a block is unterminated — EOF closed it, nothing followed', () => {
    const content = [
      EVIDENCE_SECTION_MARKER,
      EVIDENCE_SECTION_HEADING,
      '',
      `${EVIDENCE_MARKER_PREFIX} F-1 -->`,
      '### F-1',
      '',
      'never closed',
    ].join('\n');
    expect(splitEvidenceSection(content).after).toBe('');
  });
});

describe('findUnsafeBlockField', () => {
  const safe = { key: 'F-1', body: 'prose' };

  it('accepts a block whose fields are single-line and marker-free', () => {
    expect(findUnsafeBlockField(safe)).toBeUndefined();
    expect(findUnsafeBlockField({ ...safe, heading: 'F-1 — src/a.ts:3' })).toBeUndefined();
  });

  it.each([
    ['key', { ...safe, key: 'F-1\nX' }, 'key'],
    ['key', { ...safe, key: `X ${EVIDENCE_BLOCK_END_MARKER}` }, 'key'],
    ['heading', { ...safe, heading: 'a\nb' }, 'heading'],
    ['heading', { ...safe, heading: EVIDENCE_SECTION_MARKER }, 'heading'],
    ['body', { ...safe, body: `quoted:\n${EVIDENCE_BLOCK_END_MARKER}` }, 'body'],
  ])('names %s as the unsafe field', (_label, block, expected) => {
    expect(findUnsafeBlockField(block)).toBe(expected);
  });

  it('permits a line break in the body — prose is multi-line by nature', () => {
    expect(findUnsafeBlockField({ ...safe, body: 'first\n\nsecond' })).toBeUndefined();
  });
});

describe('the section is delimited by its CLOSING marker', () => {
  // Two earlier attempts inferred the boundary from content ("the tail starts at
  // the first line that is not a block"), and BOTH left the forgery reachable —
  // a hand-written tail can open with a marker exactly as a real block does. The
  // tests written for those attempts each put prose before the quoted marker, so
  // the failing ordering could not arise and 3733 tests stayed green. These
  // fixtures use the orderings that broke.
  const quotedBlock = [
    `${EVIDENCE_MARKER_PREFIX} F-1 -->`,
    '### F-1',
    '',
    'FORGED',
    EVIDENCE_BLOCK_END_MARKER,
  ].join('\n');

  it('renders the closing marker last', () => {
    const section = renderEvidenceSection([{ key: 'F-1', body: 'p' }]);
    expect(section.split('\n').at(-1)).toBe(EVIDENCE_SECTION_END_MARKER);
  });

  it('does not adopt a quoted block that OPENS the tail — the ordering that broke twice', () => {
    const content = [renderEvidenceSection([{ key: 'F-1', body: 'GENUINE' }]), quotedBlock].join('\n');
    const { blocks, after } = splitEvidenceSection(content);
    expect(blocks.get('F-1')?.body).toBe('GENUINE');
    expect(after).toContain('FORGED');
  });

  it('keeps a terminated block associated when an unterminated one follows it', () => {
    const content = [
      EVIDENCE_SECTION_MARKER,
      EVIDENCE_SECTION_HEADING,
      '',
      `${EVIDENCE_MARKER_PREFIX} A -->`,
      '### A',
      'bodyA',
      EVIDENCE_BLOCK_END_MARKER,
      '',
      `${EVIDENCE_MARKER_PREFIX} B -->`,
      '### B',
      'bodyB',
      EVIDENCE_SECTION_END_MARKER,
      'tail',
    ].join('\n');
    const { blocks, after } = splitEvidenceSection(content);
    expect([...blocks.keys()]).toEqual(['A', 'B']);
    // and the unterminated block is NOT also returned as tail content
    expect(after).toBe('tail');
    expect(after).not.toContain('bodyB');
  });

  it('keeps every block associated when a stray line sits between two of them', () => {
    const content = [
      renderEvidenceSection([{ key: 'A', body: 'bodyA' }]).replace(
        EVIDENCE_SECTION_END_MARKER,
        [
          'stray hand-written line',
          '',
          `${EVIDENCE_MARKER_PREFIX} B -->`,
          '### B',
          '',
          'bodyB',
          EVIDENCE_BLOCK_END_MARKER,
          EVIDENCE_SECTION_END_MARKER,
        ].join('\n'),
      ),
      'tail',
    ].join('\n');
    const { blocks, after } = splitEvidenceSection(content);
    expect([...blocks.keys()]).toEqual(['A', 'B']);
    expect(after).toBe('tail');
  });

  it('returns the tail below the closing marker, and no tail when there is none', () => {
    const withTail = `${renderEvidenceSection([{ key: 'F-1', body: 'p' }])}\n\n本輪未發現問題。\n`;
    expect(splitEvidenceSection(withTail).after).toBe('本輪未發現問題。');
    expect(splitEvidenceSection(`${renderEvidenceSection([{ key: 'F-1', body: 'p' }])}\n`).after).toBe('');
  });

  it('parses a section written before the format had a closing marker, tail included', () => {
    // The branch first shipped reporting NO tail here, which meant the next write
    // deleted everything below the last block — the exact loss `after` exists to
    // prevent, reintroduced by the compatibility branch itself.
    const legacy = [
      EVIDENCE_SECTION_MARKER,
      EVIDENCE_SECTION_HEADING,
      '',
      `${EVIDENCE_MARKER_PREFIX} F-1 -->`,
      '### F-1',
      '',
      'p',
      EVIDENCE_BLOCK_END_MARKER,
      '',
      '本輪未發現問題。',
    ].join('\n');
    const { blocks, after } = splitEvidenceSection(legacy);
    expect(blocks.get('F-1')?.body).toBe('p');
    expect(after).toBe('本輪未發現問題。');
  });

  it('reports no tail for a closing-marker-less section that has none', () => {
    const legacy = [
      EVIDENCE_SECTION_MARKER,
      EVIDENCE_SECTION_HEADING,
      '',
      `${EVIDENCE_MARKER_PREFIX} F-1 -->`,
      '### F-1',
      '',
      'p',
      EVIDENCE_BLOCK_END_MARKER,
    ].join('\n');
    expect(splitEvidenceSection(legacy).after).toBe('');
  });

  it('skips the section heading by SHAPE, so a dated verify.md heading still parses', () => {
    const section = renderEvidenceSection(
      [{ key: 'constitution', heading: 'constitution — PASS', body: '12/12 rules' }],
      '## 2026-08-10 — grade S',
    );
    const { blocks } = splitEvidenceSection(section);
    expect(blocks.get('constitution')?.body).toBe('12/12 rules');
    expect(section.split('\n')[1]).toBe('## 2026-08-10 — grade S');
  });

  it.each([
    ['a line break', '## a\n## b'],
    ['an evidence marker', `## ${EVIDENCE_BLOCK_END_MARKER}`],
  ])('reports a section heading carrying %s as an unsafe raw line', (_l, heading) => {
    // The module REPORTS; the caller supplying the heading raises its own refusal
    // (a lib engine throwing a bare Error gives the CLI nothing to render but a
    // crash — no code, no suggestion).
    expect(isUnsafeRawLine(heading)).toBe(true);
  });

  it('accepts the headings the two artifacts actually use', () => {
    expect(isUnsafeRawLine(EVIDENCE_SECTION_HEADING)).toBe(false);
    expect(isUnsafeRawLine('## 2026-08-10 — grade S')).toBe(false);
  });
});
