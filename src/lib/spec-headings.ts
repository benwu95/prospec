/**
 * THE definition of a Feature-Spec REQ heading, and of the counters derived
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
 * rule the writer does not follow. Leaf module with no internal imports, so both
 * `lib/drift-sources` and `services/archive` can depend on it without a lib→lib
 * cycle.
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
export function readSpecCounters(content: string): SpecCounterReading | null {
  // `\r?\n` throughout: a spec checked out with CRLF endings is still a spec, and
  // failing to parse one used to make the whole collector report zero specs and
  // pass — a vacuous green on every Windows checkout.
  const fmMatch = /^---(\r?\n)([\s\S]*?)\r?\n---/.exec(content);
  if (fmMatch === null) return null;
  const eol = fmMatch[1] === '\r\n' ? '\r\n' : '\n';

  let storyCount = 0;
  let reqCount = 0;
  let inDeprecated = false;
  // Split on `\r?\n`, not `\n`: a trailing `\r` is a line TERMINATOR to JS regex,
  // so `.` will not match it and a `$`-anchored pattern like the h2 test below
  // fails on every line of a CRLF checkout. Tolerating CRLF in the frontmatter
  // while leaving it in the body made five of this repo's ten specs miscount
  // their stories — and, being non-zero, the wrong values sailed past the
  // zeroing refusal straight into the trust zone.
  for (const line of content.slice(fmMatch[0].length).split(/\r?\n/)) {
    // REQ headings are tested FIRST: an `## REQ-X-001` is a REQ at h2, not a
    // story section, and the h2 branch below ends in `continue` — testing it
    // first would count that REQ as zero while `matchReqHeading` happily
    // recognises it, exactly the level blindness this module exists to remove.
    // A REQ heading at h1/h2 still CLOSES the Deprecated section, though: section
    // membership is decided by heading level, not by what the heading says, and
    // skipping that reset silently un-counted every REQ that followed one.
    const reqHeading = matchReqHeading(line);
    if (reqHeading !== null) {
      if (reqHeading.level <= 2) inDeprecated = false;
      if (!inDeprecated) reqCount++;
      continue;
    }
    const h2 = /^##\s+(.+)$/.exec(line);
    if (h2) {
      const title = h2[1]!.trim();
      inDeprecated = /^deprecated requirements/i.test(title);
      if (/^US-/.test(title)) storyCount++;
      continue;
    }
    if (/^###\s+US-/.test(line)) storyCount++;
  }

  const declaredStory = /^story_count:[ \t]*(\d+)[ \t]*\r?$/m.exec(fmMatch[2]!);
  const declaredReq = /^req_count:[ \t]*(\d+)[ \t]*\r?$/m.exec(fmMatch[2]!);
  return {
    declared: {
      story_count: declaredStory ? Number.parseInt(declaredStory[1]!, 10) : null,
      req_count: declaredReq ? Number.parseInt(declaredReq[1]!, 10) : null,
    },
    actual: { story_count: storyCount, req_count: reqCount },
    frontmatter: fmMatch[2]!,
    frontmatterLength: fmMatch[0].length,
    eol,
  };
}
