import { DEPRECATED_SECTION, type SpecIndex } from './spec-headings.js';

/**
 * The selection half of a REQ-scoped feature-spec read (REQ-LIB-046): given a
 * spec's text and its index, return exactly the source a station asked for.
 *
 * Pure on purpose. Both surfaces that answer this question — `prospec spec show`
 * and the MCP `get_spec_requirements` tool — select through `selectSpecSlices`, so
 * they cannot drift into two answers about WHAT was asked for; the CLI additionally
 * renders with `renderSpecSlices` (the tool returns the slices structured). The I/O
 * and the feature-name resolution stay in the service above.
 */

/** One contiguous piece of a spec, quoted as written. */
export interface SpecSlice {
  /** A requirement id, or a story id for a story-level slice. */
  id: string;
  kind: 'requirement' | 'story';
  /** Owning story's heading text — null for a story slice or a retired requirement. */
  story: string | null;
  /** The level that story heading was written at, for a faithful re-render. */
  storyLevel: number | null;
  /** The requirement sits in the spec's deprecated section. */
  deprecated: boolean;
  /** Its id is struck through (`~~REQ-X-001~~`) — a retired requirement written
   *  OUTSIDE the deprecated section would otherwise be served as active. */
  struck: boolean;
  /** Source text, byte-for-byte as the spec holds it. */
  text: string;
}

export interface SpecSelection {
  /** Matched slices in DOCUMENT order, whatever order the selectors arrived in. */
  slices: SpecSlice[];
  /** Selectors that matched nothing — never silently dropped. */
  misses: string[];
}

export interface SpecSelectors {
  req?: string[];
  story?: string[];
}

/** Ids are uppercase by convention; a hand-typed selector should still hit. */
function normalize(selector: string): string {
  return selector.trim().toUpperCase();
}

export function selectSpecSlices(
  content: string,
  index: SpecIndex,
  selectors: SpecSelectors,
): SpecSelection {
  const wantedReqs = [...new Set((selectors.req ?? []).map(normalize))].filter((s) => s !== '');
  const wantedStories = [...new Set((selectors.story ?? []).map(normalize))].filter((s) => s !== '');

  const stories = index.stories.filter((story) => wantedStories.includes(normalize(story.id)));
  // Deduped by POSITION, not by id: a spec can legitimately hold two sections with
  // the same REQ id (the archive writer preserves that state and reports it), and
  // keying on the id dropped the occurrence OUTSIDE the selected story — absent
  // from the output and from `misses` alike.
  const covered = stories.map((story) => [story.start, story.end] as const);
  const inSelectedStory = (start: number): boolean =>
    covered.some(([from, to]) => start >= from && start < to);
  const requirements = index.requirements.filter(
    (req) => wantedReqs.includes(normalize(req.id)) && !inSelectedStory(req.start),
  );

  // Sorted by START offset, not grouped by selector kind: a selected story can
  // open before a selected requirement that lives in a different story, and the
  // caller asked for a slice of the document, not two lists.
  const positioned: { start: number; slice: SpecSlice }[] = [
    ...requirements.map((req) => ({
      start: req.start,
      slice: {
        id: req.id,
        kind: 'requirement' as const,
        story: req.deprecated ? null : req.story,
        storyLevel: req.deprecated ? null : req.storyLevel,
        deprecated: req.deprecated,
        struck: req.struck,
        text: content.slice(req.start, req.end),
      },
    })),
    ...stories.map((story) => ({
      start: story.start,
      slice: {
        id: story.id,
        kind: 'story' as const,
        story: null,
        storyLevel: story.level,
        deprecated: false,
        struck: false,
        text: content.slice(story.start, story.end),
      },
    })),
  ].sort((a, b) => a.start - b.start);
  const slices = positioned.map((entry) => entry.slice);

  const matchedReqs = new Set([
    ...requirements.map((req) => normalize(req.id)),
    ...index.requirements.filter((req) => inSelectedStory(req.start)).map((req) => normalize(req.id)),
  ]);
  const matchedStories = new Set(stories.map((story) => normalize(story.id)));
  const misses = [
    ...wantedReqs.filter((id) => !matchedReqs.has(id)),
    ...wantedStories.filter((id) => !matchedStories.has(id)),
  ];

  return { slices, misses };
}

/**
 * Render a selection as spec source: each requirement under the heading that owns
 * it, emitted once per run of requirements sharing that owner. The output is a
 * valid slice of the document it came from — a reader sees which story a
 * requirement belongs to without a second convention to learn, and a station can
 * diff it against the spec it will edit.
 */
export function renderSpecSlices(selection: SpecSelection): string {
  const blocks: string[] = [];
  let heading: string | null = null;
  for (const slice of selection.slices) {
    const own = headingFor(slice);
    if (own !== null && own !== heading) blocks.push(own);
    heading = own;
    blocks.push(slice.text.replace(/(\r?\n)+$/, ''));
  }
  if (blocks.length === 0) return '';
  // Joined with the line ending the SLICES carry, not a hardcoded `\n`: a CRLF spec
  // was rendered with mixed endings, so every line of the output differed from the
  // file a station would diff it against.
  const eol = selection.slices.some((slice) => slice.text.includes('\r\n')) ? '\r\n' : '\n';
  return `${blocks.join(`${eol}${eol}`)}${eol}`;
}

function headingFor(slice: SpecSlice): string | null {
  if (slice.kind === 'story') return null;
  if (slice.deprecated) return `## ${DEPRECATED_SECTION}`;
  if (slice.story === null || slice.storyLevel === null) return null;
  return `${'#'.repeat(slice.storyLevel)} ${slice.story}`;
}
