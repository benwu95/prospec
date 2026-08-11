import { hasUnclosedFence, withoutFencedBlocks } from './markdown-fences.js';
import { stripTrailingCr } from './text-lines.js';

/**
 * THE definition of a Feature-Spec REQ heading, and of everything derived
 * from one (REQ-LIB-041).
 *
 * It exists because three copies of the heading rule disagreed: the drift
 * collectors accepted a REQ heading at any level, while `archive.service` — the
 * only WRITER — recognised `#### {id}:` alone. A spec whose REQs sit at h3 was
 * therefore counted as zero REQs and its MODIFIED REQs were appended as
 * duplicates rather than merged in place (issue #138). The narrowest reader held
 * the only pen.
 *
 * `readSpecCounters` lives here for the same reason rather than in either
 * caller: the writer (`archive finalize`) and the reader (the `spec-counters`
 * drift check) must derive the counts identically, or the check would police a
 * rule the writer does not follow. `indexSpec` joins them for the same reason
 * again: a narrow REQ-scoped read needs each requirement's boundaries and its
 * owning story, and deriving those from a second walk would put the
 * Deprecated-section rule and the heading-level rule in two places.
 *
 * Its only import is the other leaf that owns CommonMark fences, so
 * `lib/drift-sources` and `services/archive` still depend on this module without
 * a lib→lib cycle.
 */

/** A matched REQ heading: its id and the ATX level it was written at. */
export interface ReqHeading {
  /** e.g. `REQ-LIB-041`, `REQ-API-MIDDLEWARE-003`. */
  id: string;
  /** ATX heading level, 1–6 — the level a rewrite must preserve. */
  level: number;
}

export interface MatchReqHeadingOptions {
  /**
   * Also match a struck-through id (`#### ~~REQ-X-001~~: retired`). Opt-in
   * because striking a REQ is how a spec marks it dead: only an inventory of
   * DEFINED ids wants those, never a count of active ones.
   */
  includeStruck?: boolean;
}

export type SpecContent = string | { main: string; slices: Record<string, string> };

/**
 * The id shape: `REQ-` plus one or more uppercase segments plus a number, so a
 * multi-segment module prefix (`REQ-API-MIDDLEWARE-003`) stays whole and an
 * unfilled template heading (`REQ-[MODULE]-001`) never matches.
 *
 * Exported as SOURCE, not as a regex instance: the mention scanner needs a
 * global-flagged pattern, and a shared `/g` instance carries `lastIndex` between
 * unrelated callers. One shape, one place; each caller compiles its own.
 */
export const REQ_ID_SOURCE = String.raw`REQ-(?:[A-Z][A-Z0-9]*-)+\d+`;

/**
 * `~{0,2}` is consumed here and gated by `includeStruck` below, so there is ONE
 * pattern rather than two that can drift apart.
 *
 * The separator stays `\s+`, exactly as the three readers this replaced had it.
 * Narrowing it to `[ \t]` would be more strictly CommonMark, but it would also
 * stop recognising a heading separated by an ideographic or non-breaking space —
 * silently dropping that REQ from `collectReqDefinitions`, which turns every
 * mention of it into a dangling reference under the FAIL-class `req-references`
 * check. A stricter rule is not worth reddening a downstream project on upgrade.
 */
const REQ_HEADING = new RegExp(String.raw`^(#{1,6})\s+(~{0,2})(${REQ_ID_SOURCE})`);

/**
 * Match one line as a REQ heading, or return null. The line must start with the
 * hashes (no indent, no bullet) — inside a bullet or paragraph a REQ id is a
 * reference, not a definition.
 */
export function matchReqHeading(
  line: string,
  options: MatchReqHeadingOptions = {},
): ReqHeading | null {
  const match = REQ_HEADING.exec(line);
  if (match === null) return null;
  if (match[2] !== '' && options.includeStruck !== true) return null;
  return { id: match[3]!, level: match[1]!.length };
}

/** One line of a spec, as written and as the heading rules read it. */
interface ScannedLine {
  /** The line as written, without its terminator — what a slice is cut from. */
  raw: string;
  /** The same line with fenced-block content masked — what the rules below read. */
  probe: string;
  /** Offset of the line's first character. */
  start: number;
  /** An active (non-struck) REQ heading. */
  active: ReqHeading | null;
  /** Any REQ heading, struck included — what bounds ANOTHER requirement's body. */
  any: ReqHeading | null;
  /** ATX level of any heading on this line. */
  heading: number | null;
  /** A story heading (`## US-1: …` or `### US-1: …`). */
  story: { id: string; text: string; level: number } | null;
  /** Whether `## Deprecated Requirements` is in force ON this line. */
  deprecated: boolean;
}

/**
 * The section a spec retires requirements into. Exported because the renderer of
 * a narrow read groups deprecated requirements under this very heading, and a
 * second literal would be a second rule.
 */
export const DEPRECATED_SECTION = 'Deprecated Requirements';
const DEPRECATED_HEADING = new RegExp(`^${DEPRECATED_SECTION}`, 'i');

/**
 * NO `$` anchor, and nothing after the id — that combination is what made this
 * pattern cubic.
 *
 * A line can hold a bare `\r` (a lone CR is not a terminator to `walkLines`'
 * `\r?\n`), and `.` never matches one, so a `$` at the end was unreachable; the
 * engine then tried every split of the preceding whitespace runs against a match
 * that could not succeed. Measured on `## US-A` + N spaces + `B\rZ`: 4 KB took
 * 10.1 s and 8 KB took 82 s, and `prospec check` inherited it the moment the
 * definition inventory moved onto this walk. Stripping a TRAILING `\r` does not
 * cure it — the CR that matters can sit mid-line — and neither would excluding CR
 * from the separator class, so the fix is structural: match only as far as the id,
 * with no trailing capture and no anchor, which leaves nothing to backtrack over.
 * U+2028/U+2029 are unmatched by `.` for the same reason and are covered by the
 * same fix.
 *
 * The separator stays broad (`[^\S\r\n]` — space, tab, ideographic, NBSP) because
 * narrowing it would drop a REQ from the definition index; see `matchReqHeading`.
 * `H2_HEADING` loses its anchor for the same reason: its capture is only read for
 * the Deprecated-section test, and stopping at a mid-line CR is the better answer
 * anyway.
 */
const STORY_HEADING = /^(#{2,3})[^\S\r\n]+(US-[^\s:]*)/;
const STORY_HASHES = /^#{2,3}[^\S\r\n]+/;
const H2_HEADING = /^##\s+(.+)/;
const ATX_HEADING = /^(#{1,6})\s/;

/**
 * Split into lines while keeping each line's offset, so a caller can slice the
 * ORIGINAL text (line endings and all) from what the rules matched.
 *
 * `\r?\n`, not `\n`: a trailing `\r` is a line TERMINATOR to JS regex, so `.`
 * will not match it and a `$`-anchored pattern fails on every line of a CRLF
 * checkout — which once made five of this repo's ten specs miscount.
 */
function walkLines(content: string, from: number): { raw: string; probe: string; start: number }[] {
  const raws: string[] = [];
  const starts: number[] = [];
  let start = from;
  const eol = /\r?\n/g;
  eol.lastIndex = from;
  let match: RegExpExecArray | null;
  while ((match = eol.exec(content)) !== null) {
    raws.push(content.slice(start, match.index));
    starts.push(start);
    start = match.index + match[0].length;
  }
  raws.push(content.slice(start));
  starts.push(start);
  // An unclosed fence masks everything after its opener, so a scanner that trusts
  // the mask reads a truncated document and calls a plainly-present heading
  // absent. Degrade to the raw lines — which is what these readers did before
  // fences were considered at all, so a malformed spec is counted exactly as it
  // was. On this repo's ten specs no fence contains a heading or a `---` at all,
  // so masking changes no current count; it only stops a fenced EXAMPLE of a REQ
  // heading from being read as a definition.
  const probes = hasUnclosedFence(raws) ? raws : withoutFencedBlocks(raws);
  // The probe is `\r`-stripped, exactly as `markdown-fences`' own scanner does it.
  // Belt-and-braces here rather than load-bearing: `walkLines` above already splits
  // on `/\r?\n/`, so only a final line ending in a bare CR can carry one, and no
  // probe consumer is `$`-anchored (STORY_HEADING and friends deliberately are not —
  // see the cubic-backtracking note). `raw` keeps every byte, so a slice still
  // carries the file's own line endings.
  return raws.map((raw, i) => ({
    raw,
    probe: stripTrailingCr(probes[i] ?? raw),
    start: starts[i]!,
  }));
}

/**
 * THE walk. Both public readers below consume it, so the Deprecated-section rule
 * and the heading-level rule exist once rather than once per reader.
 *
 * Branch ORDER is load-bearing and preserved from the counter reader this
 * replaced: an active REQ heading is decided FIRST, because `## REQ-X-001` is a
 * REQ at h2 and not a story section; only a non-REQ line reaches the section
 * branches, and a struck REQ heading deliberately keeps falling through to them.
 * A REQ heading at h1/h2 still CLOSES the Deprecated section — membership is
 * decided by heading level, not by what the heading says.
 */
function scanSpec(content: string, from: number): ScannedLine[] {
  let deprecated = false;
  const scanned: ScannedLine[] = [];
  for (const line of walkLines(content, from)) {
    const active = matchReqHeading(line.probe);
    const any = active ?? matchReqHeading(line.probe, { includeStruck: true });
    const atx = ATX_HEADING.exec(line.probe);
    const heading = atx === null ? null : atx[1]!.length;
    if (active !== null) {
      if (active.level <= 2) deprecated = false;
      scanned.push({ ...line, active, any, heading, story: null, deprecated });
      continue;
    }
    const h2 = H2_HEADING.exec(line.probe);
    if (h2 !== null) deprecated = DEPRECATED_HEADING.test(h2[1]!.trim());
    const storyMatch = STORY_HEADING.exec(line.probe);
    const story =
      storyMatch === null
        ? null
        : {
            id: storyMatch[2]!,
            // Stripped with the SAME separator class the match used: `[ \t]+` left
            // an ideographic space in place, so the heading text kept its own
            // hashes and a re-render emitted them twice.
            text: stripTrailingCr(line.raw).replace(STORY_HASHES, '').trim(),
            level: storyMatch[1]!.length,
          };
    scanned.push({ ...line, active, any, heading, story, deprecated });
  }
  return scanned;
}

/**
 * Offset one past the section opened at `headingIndex`, bounded by the first
 * following line the caller calls a boundary. Trailing blank lines belong to the
 * gap between sections, not to the section, so they are excluded — a slice ends
 * with its last content line's terminator.
 */
function boundedEnd(
  lines: ScannedLine[],
  headingIndex: number,
  content: string,
  isBoundary: (line: ScannedLine) => boolean,
): number {
  let end = lines.length;
  for (let i = headingIndex + 1; i < lines.length; i++) {
    if (isBoundary(lines[i]!)) {
      end = i;
      break;
    }
  }
  while (end - 1 > headingIndex && lines[end - 1]!.raw.trim() === '') end--;
  return end < lines.length ? lines[end]!.start : content.length;
}

/** One requirement as the document places it. */
export interface SpecRequirementRecord {
  id: string;
  /** ATX heading level, 1–6 — the level a rewrite must preserve. */
  level: number;
  /** Owning story's heading text (`US-1: Create Change Request [P0]`), or null. */
  story: string | null;
  /** Owning story's id (`US-1`), or null outside every story. */
  storyId: string | null;
  /** The level that story heading was written at — carried here so a renderer
   *  never re-derives it by searching the story list, nor falls back to a guess. */
  storyLevel: number | null;
  /** Sits under `## Deprecated Requirements`. */
  deprecated: boolean;
  /** Written with a struck id (`#### ~~REQ-X-001~~: retired`). */
  struck: boolean;
  /** Offset of the heading line's first character. */
  start: number;
  /** Offset one past the requirement's last character. */
  end: number;
  /** The slice file this requirement lives in, if any. */
  slice?: string;
}

/** One User Story section and the requirements it owns. */
export interface SpecStoryRecord {
  /** `US-1`. */
  id: string;
  /** The heading AS WRITTEN, hashes stripped — never reassembled from id + title,
   *  which would invent a `:` for a heading that never had one. */
  heading: string;
  /** ATX level — real specs write stories at both h2 and h3. */
  level: number;
  start: number;
  end: number;
  /** Ids of the requirements defined inside this story, in document order. */
  requirements: string[];
  /** The slice file this story lives in, if any. */
  slice?: string;
}

export interface SpecIndex {
  requirements: SpecRequirementRecord[];
  stories: SpecStoryRecord[];
}

/**
 * The document's requirements and stories with their boundaries — what a
 * REQ-scoped read needs in order to quote a requirement without loading the
 * whole capability record (REQ-LIB-046).
 *
 * A requirement's body ends at the same place the archive writer's merge ends
 * it: any other REQ heading, any heading at or above its own level (h1/h2 always,
 * whatever the requirement's level, or an h1-level REQ would swallow
 * `## Edge Cases` and the Change History table), or a `---` rule. One rule, so a
 * quoted requirement is exactly the text a graduation edit would replace.
 */
export function indexSpec(content: SpecContent, options: MatchReqHeadingOptions = {}): SpecIndex {
  const isMulti = typeof content !== 'string';
  const mainContent = isMulti ? content.main : content;

  const mainIndex = indexSpecInternal(mainContent, options);

  if (isMulti) {
    const multiContent = content as { main: string; slices: Record<string, string> };
    const slicesList = parseSpecSlices(mainContent);
    for (const sliceName of slicesList) {
      const sliceContent = multiContent.slices[sliceName];
      if (sliceContent !== undefined) {
        const sliceIndex = indexSpecInternal(sliceContent, options, sliceName);
        mainIndex.requirements.push(...sliceIndex.requirements);
        mainIndex.stories.push(...sliceIndex.stories);
      }
    }
  }
  return mainIndex;
}

function indexSpecInternal(content: string, options: MatchReqHeadingOptions, sliceName?: string): SpecIndex {
  const lines = scanSpec(content, 0);
  const requirements: SpecRequirementRecord[] = [];
  const stories: SpecStoryRecord[] = [];
  let current: SpecStoryRecord | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Ownership ends where the story's own slice ends, rather than at a second
    // rule about which headings close a story: `## Deprecated Requirements` and
    // `## Edge Cases` both end it, and a retired requirement belongs to no story.
    if (current !== null && line.start >= current.end) {
      current = null;
    }
    if (line.story !== null) {
      current = {
        id: line.story.id,
        heading: line.story.text,
        level: line.story.level,
        start: line.start,
        end: boundedEnd(
          lines,
          i,
          content,
          (l) => l.story !== null || (l.heading !== null && l.heading <= 2),
        ),
        requirements: [],
      };
      if (sliceName) current.slice = sliceName;
      stories.push(current);
      continue;
    }
    const heading = line.any;
    if (heading === null) continue;
    const struck = line.active === null;
    if (struck && options.includeStruck !== true) continue;
    const bound = Math.max(heading.level, 2);
    requirements.push({
      id: heading.id,
      level: heading.level,
      story: current?.heading ?? null,
      storyId: current?.id ?? null,
      storyLevel: current?.level ?? null,
      deprecated: line.deprecated,
      struck,
      start: line.start,
      end: boundedEnd(
        lines,
        i,
        content,
        // An ACTIVE REQ heading bounds at any level — a live REQ is never part of
        // another REQ's body. A STRUCK one only bounds through the generic rule
        // below, so a retired REQ heading quoted DEEPER than this REQ stays body
        // text: matching it here cut the body short at the quote and left the
        // remainder stranded after the replacement, with nothing reported,
        // because the shortened slice never saw the bullets it lost.
        (l) =>
          l.active !== null ||
          (l.heading !== null && l.heading <= bound) ||
          l.probe.trim() === '---',
      ),
      slice: sliceName,
    });
    current?.requirements.push(heading.id);
  }
  return { requirements, stories };
}

/** What a feature spec's frontmatter declares, and what its body actually holds. */
export interface SpecCounterReading {
  /** `null` for a counter the frontmatter does not declare at all. */
  declared: { story_count: number | null; req_count: number | null };
  actual: { story_count: number; req_count: number };
  /** Raw frontmatter body (between the `---` fences) — for callers that rewrite it. */
  frontmatter: string;
  /** Length of the whole `---…---` block, so a caller can splice the remainder. */
  frontmatterLength: number;
  /** The line ending the frontmatter actually uses — a rewrite must not mix them. */
  eol: '\n' | '\r\n';
}

/**
 * Derive both sides of a feature spec's counters. Returns null when the file has
 * no frontmatter — there is then nothing to declare and nothing to reconcile.
 *
 * Counting rules, in one place because two callers depend on them agreeing:
 * REQ headings at any level (struck ones excluded — a deprecated REQ is not
 * active) outside `## Deprecated Requirements`; stories at BOTH `## US-` and
 * `### US-`, because real specs use both (sdd-workflow is all h2, mcp-server all
 * h3, drift-detection mixed) and every current counter equals that union.
 */
export function readSpecCounters(content: SpecContent): SpecCounterReading | null {
  const isMulti = typeof content !== 'string';
  const mainContent = isMulti ? content.main : content;

  // `\r?\n` throughout: a spec checked out with CRLF endings is still a spec, and
  // failing to parse one used to make the whole collector report zero specs and
  // pass — a vacuous green on every Windows checkout.
  const fmMatch = /^---(\r?\n)([\s\S]*?)\r?\n---/.exec(mainContent);
  if (fmMatch === null) return null;
  const eol = fmMatch[1] === '\r\n' ? '\r\n' : '\n';

  const actual = countActuals(mainContent, fmMatch[0].length);

  if (isMulti) {
    const multiContent = content as { main: string; slices: Record<string, string> };
    const slicesList = parseSpecSlices(mainContent);
    for (const sliceName of slicesList) {
      const sliceContent = multiContent.slices[sliceName];
      if (sliceContent !== undefined) {
        const sliceActual = countActuals(sliceContent, 0);
        actual.story_count += sliceActual.story_count;
        actual.req_count += sliceActual.req_count;
      }
    }
  }

  const declaredStory = /^story_count:[ \t]*(\d+)[ \t]*\r?$/m.exec(fmMatch[2]!);
  const declaredReq = /^req_count:[ \t]*(\d+)[ \t]*\r?$/m.exec(fmMatch[2]!);
  return {
    declared: {
      story_count: declaredStory ? Number.parseInt(declaredStory[1]!, 10) : null,
      req_count: declaredReq ? Number.parseInt(declaredReq[1]!, 10) : null,
    },
    actual,
    frontmatter: fmMatch[2]!,
    frontmatterLength: fmMatch[0].length,
    eol,
  };
}

function countActuals(content: string, startFrom: number): { story_count: number; req_count: number } {
  let storyCount = 0;
  let reqCount = 0;
  // The walk starts AFTER the frontmatter, exactly where this reader always
  // started: a `# comment` inside frontmatter parses as an h1 heading, and letting
  // it into the scan would change what the section rules see.
  for (const line of scanSpec(content, startFrom)) {
    if (line.active !== null) {
      if (!line.deprecated) reqCount++;
      continue;
    }
    if (line.story !== null) storyCount++;
  }
  return { story_count: storyCount, req_count: reqCount };
}

export function parseSpecSlices(content: string): string[] {
  const slices: string[] = [];
  let inSlices = false;
  for (const line of walkLines(content, 0)) {
    if (/^##\s+Slices/i.test(line.probe)) {
      inSlices = true;
      continue;
    }
    if (inSlices && /^##\s/.test(line.probe)) {
      break;
    }
    if (inSlices) {
      const match = /\[.+?\]\(\.\/[^/]+\/([^.]+)\.md\)/.exec(line.probe);
      if (match) slices.push(match[1]!);
    }
  }
  return slices;
}
