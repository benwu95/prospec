import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { indexSpec, matchReqHeading, readSpecCounters } from '../../../src/lib/spec-headings.js';

/**
 * The ONE definition of a feature-spec REQ heading (REQ-LIB-041). It exists
 * because three copies disagreed: the drift collectors accepted any heading
 * level while archive — the only WRITER — accepted h4 alone, so a spec whose
 * REQs sit at h3 was counted as zero and its MODIFIED REQs were duplicated
 * instead of merged (issue #138).
 */
describe('matchReqHeading', () => {
  it('matches at every ATX level and reports that level', () => {
    expect(matchReqHeading('# REQ-LIB-001: one')).toEqual({ id: 'REQ-LIB-001', level: 1 });
    expect(matchReqHeading('## REQ-LIB-001: one')).toEqual({ id: 'REQ-LIB-001', level: 2 });
    expect(matchReqHeading('### REQ-LIB-001: one')).toEqual({ id: 'REQ-LIB-001', level: 3 });
    expect(matchReqHeading('#### REQ-LIB-001: one')).toEqual({ id: 'REQ-LIB-001', level: 4 });
    expect(matchReqHeading('##### REQ-LIB-001: one')).toEqual({ id: 'REQ-LIB-001', level: 5 });
    expect(matchReqHeading('###### REQ-LIB-001: one')).toEqual({ id: 'REQ-LIB-001', level: 6 });
  });

  it('parses the id whether a title, an anchor, both, or neither follows it', () => {
    expect(matchReqHeading('### REQ-QUIZ-001')).toEqual({ id: 'REQ-QUIZ-001', level: 3 });
    expect(matchReqHeading('### REQ-QUIZ-001 {#req-quiz-001}')).toEqual({
      id: 'REQ-QUIZ-001',
      level: 3,
    });
    expect(matchReqHeading('### REQ-QUIZ-001: Tag a question {#req-quiz-001}')).toEqual({
      id: 'REQ-QUIZ-001',
      level: 3,
    });
  });

  it('keeps multi-segment module prefixes whole', () => {
    expect(matchReqHeading('#### REQ-API-MIDDLEWARE-003: logging')).toEqual({
      id: 'REQ-API-MIDDLEWARE-003',
      level: 4,
    });
  });

  it('rejects a struck-through id unless includeStruck is set', () => {
    expect(matchReqHeading('#### ~~REQ-LIB-001~~: retired')).toBeNull();
    expect(matchReqHeading('#### ~~REQ-LIB-001~~: retired', { includeStruck: true })).toEqual({
      id: 'REQ-LIB-001',
      level: 4,
    });
    // includeStruck WIDENS, never narrows: a live heading still matches under it
    expect(matchReqHeading('#### REQ-LIB-001: live', { includeStruck: true })).toEqual({
      id: 'REQ-LIB-001',
      level: 4,
    });
  });

  it('rejects a malformed id', () => {
    expect(matchReqHeading('#### req-lib-001: lowercase')).toBeNull();
    expect(matchReqHeading('#### REQ-LIB: no number')).toBeNull();
    expect(matchReqHeading('#### REQ-1BAD-001: prefix must start with a letter')).toBeNull();
    expect(matchReqHeading('#### REQ-[MODULE]-001: unfilled template')).toBeNull();
  });

  it('rejects anything that is not an ATX heading at the start of the line', () => {
    expect(matchReqHeading('####REQ-LIB-001: no space')).toBeNull();
    expect(matchReqHeading('####### REQ-LIB-001: seven hashes')).toBeNull();
    expect(matchReqHeading('- #### REQ-LIB-001: inside a bullet')).toBeNull();
    expect(matchReqHeading('  #### REQ-LIB-001: indented')).toBeNull();
    expect(matchReqHeading('See REQ-LIB-001 for details')).toBeNull();
    expect(matchReqHeading('')).toBeNull();
  });
});

describe('readSpecCounters', () => {
  const spec = (body: string, fm = 'story_count: 1\nreq_count: 2'): string =>
    `---\nfeature: quiz\n${fm}\n---\n\n# Quiz\n${body}`;

  it('counts REQ headings at EVERY level, h2 included', () => {
    // h2 is the trap: `## REQ-X-001` also matches the story-section pattern, so a
    // reader that tests h2 first counts it as zero while `matchReqHeading`
    // recognises it — the level blindness this module exists to remove.
    const counters = readSpecCounters(
      spec('\n## REQ-QUIZ-001: a\n\n### REQ-QUIZ-002: b\n\n#### REQ-QUIZ-003: c\n', 'req_count: 3'),
    )!;
    expect(counters.actual.req_count).toBe(3);
  });

  it('still recognises the Deprecated section when its REQs sit at h2', () => {
    const counters = readSpecCounters(
      spec('\n### REQ-QUIZ-001: live\n\n## Deprecated Requirements\n\n#### REQ-QUIZ-009: dead\n'),
    )!;
    expect(counters.actual.req_count).toBe(1);
  });

  // Section membership follows heading LEVEL, not what the heading says: an h2
  // REQ closes `## Deprecated Requirements` exactly as any other h2 would.
  // Testing REQs before the h2 branch skipped that reset, and every REQ after
  // such a heading silently stopped counting.
  it('lets an h2 REQ heading close the Deprecated section for what follows', () => {
    const counters = readSpecCounters(
      spec(
        '\n#### REQ-QUIZ-001: live\n\n## Deprecated Requirements\n\n## REQ-QUIZ-002: h2 req, section over\n\n#### REQ-QUIZ-003: also live\n\n## Change History\n',
        'req_count: 3',
      ),
    )!;
    expect(counters.actual.req_count).toBe(3);
  });

  it('keeps counting inside Deprecated as excluded when only deeper headings follow', () => {
    const counters = readSpecCounters(
      spec(
        '\n#### REQ-QUIZ-001: live\n\n## Deprecated Requirements\n\n#### REQ-QUIZ-002: dead\n\n##### REQ-QUIZ-003: also dead\n',
        'req_count: 1',
      ),
    )!;
    expect(counters.actual.req_count).toBe(1);
  });

  it('reports the line ending the frontmatter uses', () => {
    expect(readSpecCounters(spec('\n#### REQ-QUIZ-001: a\n'))!.eol).toBe('\n');
    expect(readSpecCounters(spec('\n#### REQ-QUIZ-001: a\n').replace(/\n/g, '\r\n'))!.eol).toBe('\r\n');
  });

  it('counts stories at both h2 and h3, and never counts a REQ as a story', () => {
    const counters = readSpecCounters(
      spec('\n## US-1: h2 story\n\n### US-2: h3 story\n\n## REQ-QUIZ-001: not a story\n'),
    )!;
    expect(counters.actual).toEqual({ story_count: 2, req_count: 1 });
  });

  // Every CRLF assertion below uses the SAME body as its LF sibling, because the
  // first CRLF test picked `### US-` — the one story shape whose pattern has no
  // `$` anchor and therefore survives a trailing `\r`. It passed while `## US-`
  // and `## Deprecated Requirements` were both broken on CRLF: five of this
  // repo's ten real specs miscounted, non-zero, straight past the zeroing guard.
  const bothEndings = (body: string, fm?: string): Array<[string, string]> => [
    ['LF', spec(body, fm)],
    ['CRLF', spec(body, fm).replace(/\n/g, '\r\n')],
  ];

  it('parses a spec checked out with CRLF endings', () => {
    for (const [label, text] of bothEndings('\n### US-1: s\n\n#### REQ-QUIZ-001: a\n\n#### REQ-QUIZ-002: b\n')) {
      const counters = readSpecCounters(text)!;
      expect(counters, label).not.toBeNull();
      expect(counters.declared, label).toEqual({ story_count: 1, req_count: 2 });
      expect(counters.actual, label).toEqual({ story_count: 1, req_count: 2 });
    }
  });

  it('counts an h2 story under either line ending', () => {
    for (const [label, text] of bothEndings('\n## US-1: h2 story\n\n#### REQ-QUIZ-001: a\n\n#### REQ-QUIZ-002: b\n')) {
      expect(readSpecCounters(text)!.actual, label).toEqual({ story_count: 1, req_count: 2 });
    }
  });

  it('honours the Deprecated section under either line ending', () => {
    for (const [label, text] of bothEndings(
      '\n#### REQ-QUIZ-001: live\n\n## Deprecated Requirements\n\n#### REQ-QUIZ-009: dead\n',
      'req_count: 1',
    )) {
      expect(readSpecCounters(text)!.actual.req_count, label).toBe(1);
    }
  });

  it('agrees with itself on this repo\'s own specs under either line ending', () => {
    // The end-to-end guard: whatever the rules are, a checkout's line endings
    // must never change what a spec is counted as.
    const dir = path.resolve(import.meta.dirname, '../../../prospec/specs/features');
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const lf = fs.readFileSync(path.join(dir, file), 'utf-8');
      expect(readSpecCounters(lf.replace(/\n/g, '\r\n'))!.actual, file).toEqual(
        readSpecCounters(lf)!.actual,
      );
    }
  });

  it('counts the shapes the pre-shared-walk reader counted, identically', () => {
    // Literal baseline captured by RUNNING the implementation that predated the
    // shared walk (`git show main:src/lib/spec-headings.ts`) over these fixtures,
    // never re-derived from the code under test — a table computed by the subject
    // proves nothing.
    //
    // The fixtures are synthetic ON PURPOSE. A first version pinned this repo's own
    // specs, which made the assertion a hostage of the trust zone: the very next
    // archive graduated REQs into `sdd-workflow.md` and `mcp-server.md` and reddened
    // CI for a legitimate content change. What needs pinning is the counting RULES,
    // and those live in shapes, not in today's requirement totals.
    const fm = (story: string, req: string): string =>
      `---\nfeature: fx\nstory_count: ${story}\nreq_count: ${req}\n---\n`;
    const fixtures: [name: string, spec: string, story: number, req: number][] = [
      [
        'REQ at every ATX level',
        `${fm('0', '6')}\n# REQ-FX-001: h1\n\n## REQ-FX-002: h2\n\n### REQ-FX-003: h3\n\n#### REQ-FX-004: h4\n\n##### REQ-FX-005: h5\n\n###### REQ-FX-006: h6\n`,
        0,
        6,
      ],
      [
        'stories at h2 and h3, a REQ that is not a story',
        `${fm('2', '1')}\n## US-1: h2 story\n\n### US-2: h3 story\n\n## REQ-FX-010: not a story\n`,
        2,
        1,
      ],
      [
        'deprecated section closed by an h2 REQ',
        `${fm('0', '3')}\n#### REQ-FX-020: live\n\n## Deprecated Requirements\n\n#### REQ-FX-021: dead\n\n## REQ-FX-022: h2 reopens\n\n#### REQ-FX-023: live again\n`,
        0,
        3,
      ],
      [
        'deprecated section holds while only deeper headings follow',
        `${fm('0', '1')}\n#### REQ-FX-030: live\n\n## Deprecated Requirements\n\n#### REQ-FX-031: dead\n\n##### REQ-FX-032: also dead\n`,
        0,
        1,
      ],
      [
        'struck ids are not active',
        `${fm('1', '1')}\n## US-1: s\n\n#### REQ-FX-040: live\n\n#### ~~REQ-FX-041~~: retired\n`,
        1,
        1,
      ],
      [
        'anchors and bare ids',
        `${fm('0', '2')}\n#### REQ-FX-050 {#req-fx-050}\n\n#### REQ-FX-051: titled {#req-fx-051}\n`,
        0,
        2,
      ],
      [
        'non-heading mentions and indented shapes',
        `${fm('0', '1')}\nSee REQ-FX-060 inline.\n- #### REQ-FX-061: in a bullet\n  #### REQ-FX-062: indented\n####REQ-FX-063: no space\n\n#### REQ-FX-064: the only real one\n`,
        0,
        1,
      ],
      [
        'US- prefix that is not a numbered story',
        `${fm('2', '0')}\n## US-1: real\n\n## USA-1: not a story\n\n### US-ABC: still counted by prefix\n`,
        2,
        0,
      ],
      [
        'no trailing newline',
        `${fm('1', '1')}\n## US-1: s\n\n#### REQ-FX-070: last line has no newline`,
        1,
        1,
      ],
    ];

    for (const [name, spec, story_count, req_count] of fixtures) {
      expect(readSpecCounters(spec)!.actual, name).toEqual({ story_count, req_count });
      // Line endings must not change what a spec is counted as.
      expect(readSpecCounters(spec.replace(/\n/g, '\r\n'))!.actual, `${name} (CRLF)`).toEqual({
        story_count,
        req_count,
      });
    }
  });

  it('reports null for a counter the frontmatter never declares', () => {
    const counters = readSpecCounters(spec('\n#### REQ-QUIZ-001: a\n', 'status: active'))!;
    expect(counters.declared).toEqual({ story_count: null, req_count: null });
    expect(counters.actual).toEqual({ story_count: 0, req_count: 1 });
  });

  it('returns null when there is no frontmatter to reconcile against', () => {
    expect(readSpecCounters('# Quiz\n\n#### REQ-QUIZ-001: a\n')).toBeNull();
  });
});

/**
 * `indexSpec` is the same walk seen from the other side: the counters need
 * totals, a narrow read needs each requirement's boundaries and the story that
 * owns it (REQ-LIB-041). Both come from one scanner so the Deprecated rule and
 * the heading-level rule cannot reach one reader and miss the other.
 */
describe('indexSpec', () => {
  const body = [
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
    '---',
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
    '## Edge Cases',
    '',
    '- nothing',
    '',
  ].join('\n');

  it('records every active requirement with its level, story and boundaries', () => {
    const index = indexSpec(body);
    expect(index.requirements.map((r) => r.id)).toEqual([
      'REQ-QUIZ-001',
      'REQ-QUIZ-002',
      'REQ-QUIZ-003',
    ]);
    expect(index.requirements.map((r) => r.level)).toEqual([4, 4, 4]);
    expect(index.requirements.map((r) => r.story)).toEqual([
      'US-1: First story [P0]',
      'US-1: First story [P0]',
      'US-2: Second story [P1]',
    ]);
    for (const req of index.requirements) {
      expect(body.slice(req.start, req.end), req.id).toContain(req.id);
    }
  });

  it('slices a requirement from its heading to the next section boundary', () => {
    const index = indexSpec(body);
    const first = index.requirements[0]!;
    expect(body.slice(first.start, first.end)).toBe(
      '#### REQ-QUIZ-001: first\nOne sentence.\n- WHEN a, THEN b\n',
    );
    // The `---` rule bounds a body, exactly as the archive writer's merge does.
    const second = index.requirements[1]!;
    expect(body.slice(second.start, second.end)).toBe('#### REQ-QUIZ-002: second\nBody two.\n');
    // An h2 section heading bounds it even though the REQ sits deeper.
    const third = index.requirements[2]!;
    expect(body.slice(third.start, third.end)).toBe('#### REQ-QUIZ-003: third\nBody three.\n');
  });

  it('marks a requirement inside the Deprecated section instead of dropping it', () => {
    const index = indexSpec(body, { includeStruck: true });
    const retired = index.requirements.find((r) => r.id === 'REQ-QUIZ-004')!;
    expect(retired.deprecated).toBe(true);
    expect(retired.struck).toBe(true);
    expect(index.requirements.filter((r) => !r.deprecated)).toHaveLength(3);
  });

  it('omits a struck requirement unless includeStruck is set', () => {
    expect(indexSpec(body).requirements.map((r) => r.id)).not.toContain('REQ-QUIZ-004');
  });

  it('records stories at both h2 and h3 with the requirements they own', () => {
    const index = indexSpec(body);
    expect(index.stories.map((s) => s.id)).toEqual(['US-1', 'US-2']);
    expect(index.stories.map((s) => s.level)).toEqual([2, 3]);
    expect(index.stories[0]!.requirements).toEqual(['REQ-QUIZ-001', 'REQ-QUIZ-002']);
    expect(index.stories[1]!.requirements).toEqual(['REQ-QUIZ-003']);
    expect(body.slice(index.stories[0]!.start, index.stories[0]!.end)).toContain('As a developer,');
    // A story's slice stops at the next story, never spilling into it.
    expect(body.slice(index.stories[0]!.start, index.stories[0]!.end)).not.toContain('US-2');
  });

  it('keeps both sections when a story number repeats', () => {
    const twice = ['## US-1: first [P0]', '', '## US-1: again [P1]', ''].join('\n');
    expect(indexSpec(twice).stories.map((s) => s.heading)).toEqual([
      'US-1: first [P0]',
      'US-1: again [P1]',
    ]);
    expect(indexSpec(twice).stories).toHaveLength(2);
  });

  it('keeps the heading AS WRITTEN, whatever whitespace separates it', () => {
    // `[ \t]+` once stripped the hashes here and left them in the text, so a
    // re-render emitted the hashes twice. The separator class the matcher uses
    // and the class the stripper uses must be the same one.
    const wide = ['##\u3000US-1: Wide [P0]', '', '#### REQ-QUIZ-020: x', 'Body.', ''].join('\n');
    const index = indexSpec(wide);
    expect(index.stories[0]).toMatchObject({ id: 'US-1', heading: 'US-1: Wide [P0]', level: 2 });
    expect(index.requirements[0]).toMatchObject({ story: 'US-1: Wide [P0]', storyLevel: 2 });
  });

  it('stays linear on a heading with a long whitespace run and a mid-line CR', () => {
    // The shape that made these patterns cubic: `.` never matches a bare `\r` (and
    // `walkLines` only treats `\r\n` as a terminator), so a `$` anchor was
    // unreachable and every split of the whitespace run was tried against a match
    // that could not succeed — 4 KB took 10.1 s and 8 KB took 82 s, on a path
    // `prospec check` runs. U+2028 is unmatched by `.` for the same reason.
    // The budget is 2 s against a pre-fix 82 s: five orders of margin, not a race.
    for (const terminator of ['\r', ' ']) {
      const spec = [
        '---',
        'feature: slow',
        '---',
        '',
        `## US-A${' '.repeat(16000)}B${terminator}Z`,
        '',
        '#### REQ-SLOW-001: x',
        'Body.',
        '',
      ].join('\n');
      const started = performance.now();
      const index = indexSpec(spec, { includeStruck: true });
      readSpecCounters(spec);
      const elapsed = performance.now() - started;
      expect(elapsed, `${JSON.stringify(terminator)} took ${elapsed.toFixed(0)}ms`).toBeLessThan(2000);
      expect(index.requirements.map((r) => r.id)).toEqual(['REQ-SLOW-001']);
      expect(index.stories.map((s) => s.id)).toEqual(['US-A']);
    }
  });

  it('bounds a requirement at h1/h2 whatever its own level', () => {
    // REQ-LIB-041: h1/h2 always bound, or an h1-level REQ swallows `## Edge Cases`
    // and the whole Change History table. Every other fixture writes REQs at h4,
    // where `Math.max(level, 2)` is a no-op — removing it stayed green.
    const shallow = [
      '# REQ-QUIZ-030: h1 requirement',
      'Body of the h1 REQ.',
      '',
      '## Edge Cases',
      '',
      '- an edge case that must NOT be swallowed',
      '',
    ].join('\n');
    const req = indexSpec(shallow).requirements[0]!;
    const body = shallow.slice(req.start, req.end);
    expect(body).toBe('# REQ-QUIZ-030: h1 requirement\nBody of the h1 REQ.\n');
    expect(body).not.toContain('Edge Cases');
    expect(body).not.toContain('must NOT be swallowed');
  });

  it('preserves the file\'s own line endings inside a slice', () => {
    const crlf = body.replace(/\n/g, '\r\n');
    const req = indexSpec(crlf).requirements[0]!;
    expect(crlf.slice(req.start, req.end)).toBe(
      '#### REQ-QUIZ-001: first\r\nOne sentence.\r\n- WHEN a, THEN b\r\n',
    );
  });

  it('reports the same requirement set under either line ending', () => {
    const crlf = body.replace(/\n/g, '\r\n');
    expect(indexSpec(crlf).requirements.map((r) => [r.id, r.level, r.story, r.deprecated])).toEqual(
      indexSpec(body).requirements.map((r) => [r.id, r.level, r.story, r.deprecated]),
    );
  });

  it('keeps a fenced code block whole inside a requirement slice', () => {
    const fenced = [
      '## US-1: fences [P0]',
      '',
      '#### REQ-QUIZ-010: fenced',
      'Body.',
      '```md',
      '#### REQ-QUIZ-999: not a heading, it is inside a fence',
      '---',
      '```',
      'After the fence.',
      '',
      '#### REQ-QUIZ-011: next',
      'Body.',
      '',
    ].join('\n');
    const index = indexSpec(fenced);
    expect(index.requirements.map((r) => r.id)).toEqual(['REQ-QUIZ-010', 'REQ-QUIZ-011']);
    const slice = fenced.slice(index.requirements[0]!.start, index.requirements[0]!.end);
    expect(slice).toContain('After the fence.');
    expect((slice.match(/```/g) ?? []).length % 2).toBe(0);
  });

  it('agrees with readSpecCounters on this repo\'s own specs', () => {
    // The two readers share one walk; this is the guard that they stay agreed on
    // real specs, not only on fixtures.
    const dir = path.resolve(import.meta.dirname, '../../../prospec/specs/features');
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      const counters = readSpecCounters(content)!;
      const index = indexSpec(content);
      expect(index.requirements.filter((r) => !r.deprecated), file).toHaveLength(
        counters.actual.req_count,
      );
      expect(index.stories, file).toHaveLength(counters.actual.story_count);
    }
  });
});
