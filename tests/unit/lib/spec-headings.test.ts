import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { matchReqHeading, readSpecCounters } from '../../../src/lib/spec-headings.js';

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

  it('reports null for a counter the frontmatter never declares', () => {
    const counters = readSpecCounters(spec('\n#### REQ-QUIZ-001: a\n', 'status: active'))!;
    expect(counters.declared).toEqual({ story_count: null, req_count: null });
    expect(counters.actual).toEqual({ story_count: 0, req_count: 1 });
  });

  it('returns null when there is no frontmatter to reconcile against', () => {
    expect(readSpecCounters('# Quiz\n\n#### REQ-QUIZ-001: a\n')).toBeNull();
  });
});
