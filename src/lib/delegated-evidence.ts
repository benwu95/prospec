/**
 * The evidence-block grammar shared by every artifact a delegated reviewer or
 * grader leaves evidence in (`review.md`, `verify.md`).
 *
 * A delegated agent writes its findings — evidence prose included — to a file
 * and returns only that file's path; the CLI then persists the prose here. One
 * module owns the markers, the rendering and the parse so the two artifacts
 * cannot grow two hand-copied grammars the way the pipe-table engine once did
 * (PB-006).
 *
 * The section is located by its MARKER, never by the `## Evidence` heading:
 * evidence prose routinely quotes documents, headings included, and a locator
 * that keys on prose would split a document at text a reviewer happened to
 * cite. For the same reason every marker shares one prefix, so a single guard
 * (`containsEvidenceMarker`) covers the whole grammar — a caller checks incoming
 * prose once and refuses before writing, rather than producing a document that
 * parses back differently than it was written.
 */

import { stripTrailingCr } from './text-lines.js';

/** The prefix every marker in this grammar shares — the collision guard's key. */
export const EVIDENCE_MARKER_PREFIX = '<!-- prospec:evidence';

/** Opens the evidence section; what `splitEvidenceSection` locates. */
export const EVIDENCE_SECTION_MARKER = '<!-- prospec:evidence-section -->';

/** The human-facing heading rendered directly under the section marker. */
export const EVIDENCE_SECTION_HEADING = '## Evidence';

/** Closes one block. Blocks never nest, so it carries no key. */
export const EVIDENCE_BLOCK_END_MARKER = '<!-- prospec:evidence-end -->';

/**
 * Closes the section. What follows it is the caller's own content and is never
 * parsed as structure again.
 *
 * The region is delimited EXPLICITLY because inferring where it ends from the
 * content cannot work: the material below the section is hand-written, so it can
 * carry this grammar's own markers, and two attempts to tell "a real block" from
 * "a quoted one" by position both failed — a marker in the tail was adopted as a
 * block and replaced the evidence the artifact had recorded. A closing marker is
 * decidable; a heuristic over content is not.
 */
export const EVIDENCE_SECTION_END_MARKER = '<!-- prospec:evidence-section-end -->';

/** One anchored block of evidence prose. */
export interface EvidenceBlock {
  /** Anchor — a review finding's `id`, or a verify dimension's name. */
  key: string;
  /** Heading text; defaults to `key`. */
  heading?: string;
  /** The prose, verbatim. Never empty — a block with no prose records nothing. */
  body: string;
}

const BLOCK_OPEN_RE = new RegExp(
  `^${EVIDENCE_MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\S.*?)\\s*-->$`,
);

function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && stripTrailingCr(lines[start]!).trim() === '') start++;
  while (end > start && stripTrailingCr(lines[end - 1]!).trim() === '') end--;
  return lines.slice(start, end);
}

/**
 * The first field of a block that cannot be emitted as a raw line, or undefined.
 *
 * `key` and `heading` are written as the marker line and the `###` line
 * verbatim, so a line break or a marker inside either forges block structure — a
 * second block under another finding's anchor, which last-wins parsing then
 * adopts in place of the genuine evidence. `body` is prose, so only a marker can
 * break it. The caller refuses before writing; the relayed-field schemas refuse
 * the same shapes earlier, and this is the backstop for every producer.
 */
export function findUnsafeBlockField(
  block: EvidenceBlock,
): 'key' | 'heading' | 'body' | undefined {
  if (isUnsafeRawLine(block.key)) return 'key';
  if (block.heading !== undefined && isUnsafeRawLine(block.heading)) return 'heading';
  if (containsEvidenceMarker(block.body)) return 'body';
  return undefined;
}

/**
 * Whether text cannot be emitted as ONE raw line of this grammar — it spans lines,
 * or it carries a marker.
 *
 * Exported because the SECTION heading is a raw line too, and it is a parameter:
 * the caller that supplies one checks it here and raises its own refusal. This
 * module reports, it never decides — the same split the block guard has, and the
 * reason the first version's bare `throw` was wrong (a lib engine minting an
 * error with no code and no suggestion, which the CLI could only render as an
 * unexpected crash).
 */
export function isUnsafeRawLine(text: string): boolean {
  return /[\r\n]/.test(text) || containsEvidenceMarker(text);
}

/**
 * Whether text carries any marker of this grammar. A caller refuses such text
 * BEFORE writing: prose containing a marker would re-parse as structure.
 */
export function containsEvidenceMarker(text: string): boolean {
  return text.includes(EVIDENCE_MARKER_PREFIX);
}

/** Render one anchored block. */
export function renderEvidenceBlock(block: EvidenceBlock): string {
  return [
    `${EVIDENCE_MARKER_PREFIX} ${block.key} -->`,
    `### ${block.heading ?? block.key}`,
    '',
    block.body,
    EVIDENCE_BLOCK_END_MARKER,
  ].join('\n');
}

/**
 * Render the whole section, or the empty string when there is nothing to
 * record — a round with no evidence must leave the artifact it would have
 * decorated unchanged, not add a bare heading.
 *
 * `heading` is a parameter because `verify.md` heads each run's section with its
 * date and grade. It is the marker above it that delimits a section either way;
 * letting the caller pass a heading is what keeps this the ONE implementation of
 * the grammar instead of a second hand-assembled copy. A caller supplying one
 * checks it with `isUnsafeRawLine` first and raises its OWN refusal — this module
 * reports, it does not decide.
 */
export function renderEvidenceSection(
  blocks: readonly EvidenceBlock[],
  heading: string = EVIDENCE_SECTION_HEADING,
): string {
  if (blocks.length === 0) return '';
  return [
    EVIDENCE_SECTION_MARKER,
    heading,
    '',
    blocks.map(renderEvidenceBlock).join('\n\n'),
    EVIDENCE_SECTION_END_MARKER,
  ].join('\n');
}

/**
 * Split a document at the evidence section: `before` is everything preceding
 * the section marker (verbatim, so a table search never reaches a table that a
 * reviewer quoted inside evidence), `blocks` are the blocks between the section's
 * opening and closing markers, and `after` is everything below the closing
 * marker — returned verbatim and never parsed as structure.
 *
 * `after` exists because the section is rebuilt from the blocks on every write:
 * without it, everything below the section is deleted by the next merge — and
 * the review skill MANDATES appending an artifact-language sentence there after
 * a clean round, so the content destroyed was content the contract required.
 *
 * The boundary is the closing MARKER, not a property of the content. Two earlier
 * attempts to infer it — "the tail starts at the first line that is not a block"
 * — left the forgery they were written to stop reachable, because a hand-written
 * tail can open with a marker just as a real block does. Explicit delimiters are
 * decidable; heuristics over attacker-writable text are not.
 *
 * Everything BETWEEN the two markers is a CLI-owned region: the renderer writes a
 * heading and blocks there and nothing else, so anything hand-written inside it
 * is not preserved — exactly as for the findings table the same document carries.
 * Content of your own belongs below the closing marker, which is what `after`
 * hands back.
 *
 * A section with no closing marker (written before this format had one) parses its
 * blocks to end of input and recovers the tail from after the last CLOSED block —
 * the boundary is guessed there because nothing marks it, but guessing beats the
 * alternative that branch first shipped with, which was to report no tail and let
 * the next write delete everything below the last block.
 */
export function splitEvidenceSection(content: string): {
  before: string;
  blocks: Map<string, EvidenceBlock>;
  after: string;
} {
  const lines = content.split('\n');
  const sectionAt = lines.findIndex((l) => stripTrailingCr(l).trim() === EVIDENCE_SECTION_MARKER);
  if (sectionAt === -1) return { before: content, blocks: new Map(), after: '' };

  const blocks = new Map<string, EvidenceBlock>();
  let key: string | null = null;
  let heading: string | undefined;
  let body: string[] = [];

  const close = (): void => {
    if (key !== null) {
      const prose = trimBlankEdges(body).join('\n');
      if (prose !== '') blocks.set(key, { key, heading, body: prose });
    }
    key = null;
    heading = undefined;
    body = [];
  };

  const sectionLines = lines.slice(sectionAt + 1);
  const endAt = sectionLines.findIndex(
    (l) => stripTrailingCr(l).trim() === EVIDENCE_SECTION_END_MARKER,
  );
  const blockLines = endAt === -1 ? sectionLines : sectionLines.slice(0, endAt);

  // Where the tail starts when there is no closing marker (a section written
  // before the format had one): after the last block that closed. The branch must
  // still recover it — reporting no tail there DESTROYED everything below the last
  // block on the next write, which is the very loss `after` exists to prevent.
  let legacyAfterFrom: number | undefined;
  for (const [index, raw] of blockLines.entries()) {
    const line = stripTrailingCr(raw);
    const open = BLOCK_OPEN_RE.exec(line.trim());
    if (open?.[1] !== undefined) {
      close();
      key = open[1];
      continue;
    }
    if (key === null) continue;
    if (line.trim() === EVIDENCE_BLOCK_END_MARKER) {
      close();
      legacyAfterFrom = index + 1;
      continue;
    }
    if (heading === undefined && body.length === 0 && line.startsWith('### ')) {
      heading = line.slice(4).trim();
      continue;
    }
    // CR-stripped, not verbatim: the renderer joins with `\n`, so keeping the CR
    // would emit mixed line endings the moment a CRLF artifact is re-rendered —
    // and `render → split → render` would stop being byte-identical.
    body.push(line);
  }
  close();

  return {
    before: lines.slice(0, sectionAt).join('\n'),
    blocks,
    after: trimBlankEdges(
      sectionLines.slice(endAt === -1 ? (legacyAfterFrom ?? sectionLines.length) : endAt + 1),
    ).join('\n'),
  };
}
