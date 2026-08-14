/**
 * Contract: `lib/spec-headings` holds the ONLY definition of a feature-spec REQ
 * heading (REQ-LIB-041).
 *
 * Three copies of that rule once coexisted — two level-agnostic readers in the
 * drift collectors and an h4-only one in `archive.service`, which was the only
 * WRITER. A spec whose REQs sat at h3 was therefore counted as zero REQs and its
 * MODIFIED REQs were appended as duplicates rather than merged (issue #138).
 * Nothing failed; the wrong numbers and the duplicate sections just landed.
 *
 * The detectors below are written against the SHAPES THAT WERE ACTUALLY REMOVED,
 * each with a positive control that feeds it those shapes as text: a first
 * version of this contract banned only an inline `includes(\`#### ${id}:\`)` and
 * therefore missed both real ones — the h4 regex, and the heading string held in
 * a variable and probed a line later. A negative assertion whose detector has
 * never fired is indistinguishable from no assertion at all (PB-001).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const SRC = path.join(REPO_ROOT, 'src');
const SINGLE_SOURCE = 'src/lib/spec-headings.ts';

/**
 * The REQ id shape spelled out as a character class inside a pattern —
 * `REQ_ID_SOURCE` is the only legal copy. Tolerates a wrapping group, so a
 * re-typed `REQ-([A-Z]…)` is caught as well as a byte-identical `REQ-(?:[A-Z]…)`.
 * `REQ-[MODULE]-001` (the unfilled template placeholder quoted in comments) is
 * deliberately NOT a match — the class must actually be a letter range.
 */
const REQ_ID_IN_PATTERN = /REQ-\(?(?:\?:)?\[\^?-?A-Z/;

/**
 * A regex literal mixing ATX hashes with a REQ id — a second FEATURE-SPEC
 * matcher. Exactly-h3 is excluded because that is the DELTA-SPEC grammar, a
 * different document parsed by the two files registered below; every other
 * shape (a quantified `#{1,6}`, or a literal h2/h4/h5/h6) is banned.
 */
const HEADING_REGEX = /\/\^?(#\{[0-9,]+\}|#{2}(?!#)|#{4,6}(?!#))[^/\n]*REQ-/i;

/**
 * The delta-spec REQ parsers: `### REQ-X-001: title` is that format's own
 * contract, so these are not copies of the feature-spec rule. Registered by file
 * rather than ignored, because they DO re-type the id shape loosely
 * (`REQ-[\w-]+`) — a residue this change deliberately leaves alone rather than
 * converging a second grammar under a fix for the first.
 */
const DELTA_SPEC_PARSERS = [
  'src/services/archive.service.ts',
  'src/services/knowledge-update.service.ts',
];
const DELTA_SPEC_HEADING = /\/\^###\\s\+\(?~?~?\(?REQ-/;

/**
 * A heading string built with an interpolated/concatenated REQ id — the raw
 * material of a probe, whether it is compared inline or stored first. The archive
 * writer legitimately EMITS one such line (the ADDED title), so this is a budget
 * rather than a ban: the count is pinned per file, and a second one has to be
 * argued for here.
 */
const HEADING_WITH_ID_LITERAL = /(`#{2,6}\s*\$\{[^}]*[Rr]eq[^}]*\}|['"]#{2,6}\s*['"]\s*\+)/g;
const HEADING_LITERAL_BUDGET: Record<string, number> = {
  // two RENDERING sites: the ADDED title line, and a new spec's REQ heading.
  // A third would be the probe coming back.
  'src/services/archive.service.ts': 2,
};

function tsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(abs);
    return entry.isFile() && entry.name.endsWith('.ts') ? [abs] : [];
  });
}

function offenders(pattern: RegExp): string[] {
  return tsFiles(SRC)
    .filter((abs) => pattern.test(fs.readFileSync(abs, 'utf-8')))
    .map((abs) => path.relative(REPO_ROOT, abs).replace(/\\/g, '/'))
    .sort();
}

/**
 * Where a REQ's body ENDS is a second rule that can fork the same way the heading
 * rule did. ONE file decides it now — `spec-headings` — for the narrow read, the
 * counters and the archive writer's in-place merge alike: the writer takes each
 * REQ's boundary from `indexSpec` rather than recomputing it, so reader and writer
 * can no longer disagree about which lines a graduation edit replaces. A SECOND
 * implementation is what this registry catches; the probe is the `---` rule test
 * every version of the boundary needs.
 *
 * The probe only recognises the literal `x.trim() === '---'`, so a rewrite that
 * binds the trimmed line to a variable first slips past it — this registry bounds
 * where the rule may live, not whether a copy of it is spelled recognisably.
 */
const BOUNDARY_PROBE = /trim\(\)\s*===\s*'---'/;
const BOUNDARY_OWNERS = ['src/lib/spec-headings.ts'];

/** The two shapes this change deleted, as text — the detectors must see both. */
const REMOVED_SHAPES = {
  'h4-only recount regex': String.raw`if (!inDeprecated && /^####\s+REQ-/.test(line)) reqCount++;`,
  'heading probe via a variable': [
    'const reqHeader = `#### ${route.reqId}:`;',
    'if (route.status ===\'MODIFIED\' && content.includes(reqHeader)) {',
  ].join('\n'),
  'heading probe inline': 'if (content.includes(`#### ${route.reqId}:`)) {',
  're-typed id shape': String.raw`const RETYPED = /^#{1,6}\s+(REQ-([A-Z][A-Z0-9]*-)+\d+)/;`,
};

describe('feature-spec REQ heading single source', () => {
  // Positive controls FIRST: each detector is shown firing on the code that was
  // actually removed, so none of the bans below can pass by being blind.
  it('detects the h4-only matcher this change deleted', () => {
    expect(HEADING_REGEX.test(REMOVED_SHAPES['h4-only recount regex'])).toBe(true);
  });

  it('detects a re-typed id shape, not just a byte-identical copy', () => {
    expect(HEADING_REGEX.test(REMOVED_SHAPES['re-typed id shape'])).toBe(true);
    expect(REQ_ID_IN_PATTERN.test(REMOVED_SHAPES['re-typed id shape'])).toBe(true);
  });

  it('detects a heading probe whether it is inline or held in a variable', () => {
    for (const key of ['heading probe via a variable', 'heading probe inline'] as const) {
      const matches = REMOVED_SHAPES[key].match(HEADING_WITH_ID_LITERAL) ?? [];
      expect(matches, `${key} must be visible to the budget`).toHaveLength(1);
    }
  });

  it('detects the id shape where it legitimately lives, and the exports beside it', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, SINGLE_SOURCE), 'utf-8');
    expect(REQ_ID_IN_PATTERN.test(source)).toBe(true);
    expect(source).toMatch(/export function matchReqHeading/);
    expect(source).toMatch(/export function readSpecCounters/);
  });

  // The bans themselves.
  it('is the only file in src/ that spells out the REQ id pattern', () => {
    expect(offenders(REQ_ID_IN_PATTERN)).toEqual([SINGLE_SOURCE]);
  });

  it('leaves no second feature-spec REQ-heading regex anywhere in src/', () => {
    expect(offenders(HEADING_REGEX)).toEqual([]);
  });

  // Keeps the residue visible: the delta-spec grammar lives in exactly these two
  // files. A third file parsing `### REQ-…` — or one of these two losing it —
  // fails here, so the exception list cannot rot into a blanket exemption.
  it('confines the delta-spec REQ grammar to its registered parsers', () => {
    expect(offenders(DELTA_SPEC_HEADING)).toEqual(DELTA_SPEC_PARSERS);
  });

  it('detects a third REQ-body slicer, and confines the boundary rule to its two owners', () => {
    // Positive control first: the detector must see a hand-rolled slicer as text,
    // or the ban below is blind (PB-001).
    const thirdSlicer = [
      'for (const line of content.split(\'\\n\')) {',
      "  if (matchReqHeading(line) !== null || line.trim() === '---') break;",
      '  body.push(line);',
      '}',
    ].join('\n');
    expect(BOUNDARY_PROBE.test(thirdSlicer)).toBe(true);
    expect(offenders(BOUNDARY_PROBE)).toEqual(BOUNDARY_OWNERS);
  });

  it('keeps heading-string literals to their per-file budget', () => {
    const counts = Object.fromEntries(
      tsFiles(SRC)
        .map((abs) => {
          const rel = path.relative(REPO_ROOT, abs).replace(/\\/g, '/');
          const found = fs.readFileSync(abs, 'utf-8').match(HEADING_WITH_ID_LITERAL) ?? [];
          return [rel, found.length] as const;
        })
        .filter(([, n]) => n > 0),
    );
    expect(counts).toEqual(HEADING_LITERAL_BUDGET);
  });

  it('routes both archive write points and both drift collectors through the matcher', () => {
    const consumers: Record<string, RegExp[]> = {
      'src/services/archive.service.ts': [
        // the merge, the REMOVED probe (via existingReqLevel), and the recount
        /indexSpec\(content, \{ includeStruck: true \}\)/,
        /function existingReqLevel/,
        /readSpecCounters\((?:content|specContent)\)/,
      ],
      'src/lib/drift-sources.ts': [
        // The definition inventory and the counter read assemble main + slices
        // through `loadFeatureSpecContent`, then hand the SpecContent to the shared
        // index/counter — so what counts as a definition (or a count) cannot change
        // for the narrow read and stay the same here, slices included.
        /indexSpec\(loaded\.specContent, \{ includeStruck: true \}\)/,
        /matchReqHeading\(line\)\?\.id/,
        /readSpecCounters\(loaded\.specContent\)/,
      ],
      'src/lib/spec-slices.ts': [/type SpecIndex/, /DEPRECATED_SECTION/],
      // The narrow REQ-scoped read: the ONE shared entry both surfaces route
      // through is where the spec is parsed. The surfaces themselves no longer
      // parse it — pinned by the surface-routing test below.
      'src/lib/spec-read.ts': [/indexSpec\(content, \{ includeStruck: true \}\)/, /selectSpecSlices\(/],
    };
    for (const [rel, patterns] of Object.entries(consumers)) {
      const source = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
      expect(source, `${rel} must import the shared matcher`).toMatch(
        /from '(\.\.\/lib|\.)\/spec-headings\.js'/,
      );
      // An import alone proves nothing — pin the call sites that must use it.
      for (const pattern of patterns) {
        expect(source, `${rel} must call through ${String(pattern)}`).toMatch(pattern);
      }
    }
  });

  // The strengthening of REQ-TESTS-080: the two narrow-read surfaces answered one
  // question two ways — the parse and messaging drifted twice under PR #149's
  // review. Pinning that both route through the ONE shared `lib/spec-read` entry,
  // and that neither parses a spec itself, is what the previous registry (which
  // only pinned the two lib SELECTION calls, not the resolution layer) could not.
  it('routes both narrow-read surfaces through the shared spec-read entry, parsing no spec themselves', () => {
    // Positive control FIRST: a surface that parsed the spec itself would spell one
    // of these — the detector must see that shape as text, or the ban is blind (PB-001).
    const inlineParse =
      'const selection = selectSpecSlices(content, indexSpec(content, { includeStruck: true }), sel);';
    expect(/indexSpec\(|selectSpecSlices\(/.test(inlineParse)).toBe(true);

    const SURFACES = ['src/services/spec-show.service.ts', 'src/services/mcp.service.ts'];
    for (const rel of SURFACES) {
      const source = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
      expect(source, `${rel} must import the shared spec-read entry`).toMatch(
        /from '\.\.\/lib\/spec-read\.js'/,
      );
      expect(source, `${rel} must route through readSpecSlices`).toMatch(/readSpecSlices\(/);
      // The parse moved into spec-read: a surface calling it again would be a second
      // answer to the same question — exactly the drift PR #149's review caught twice.
      expect(source, `${rel} must not parse a spec itself`).not.toMatch(
        /indexSpec\(|selectSpecSlices\(/,
      );
    }
  });
});
