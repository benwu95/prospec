/**
 * Line-ending tolerance for per-line MATCHING — the ONE implementation of that strip.
 *
 * `\r` is a line terminator to a JS regex: `.` never matches it, and a `$` without
 * the `m` flag anchors the end of the STRING. So any `$`-anchored per-line pattern
 * fed by `split('\n')` misses every line of a CRLF document — the working tree a
 * Windows checkout produces (the Git for Windows installer sets `core.autocrlf=true`;
 * git's own default is `false`), and this repo ships no `.gitattributes` to force LF
 * back. Six copies of the strip were hand-written across four files before this
 * became one function.
 *
 * A call site is load-bearing in one of two ways: a `$`-anchored (or otherwise
 * CR-intolerant) match, or a caller that STORES the returned view as its data.
 * Everything else is belt-and-braces — a following `.trim()` absorbs the CR anyway,
 * or the line source already split on `/\r?\n/`. Six of the current call sites are
 * in that second group, kept because the alternative was leaving them hand-copied.
 *
 * Shapes that are NOT this rule, because none of them needs an implementation of
 * its own: a pattern already tolerant through its own optional `\r?` or character
 * class (an upstream `.trim()` has the same effect — note that `.trim()` DOES remove
 * the CR, it just needs no code here), a pattern that CAPTURES the carriage return
 * to write it back (a spliced document must keep mixed endings), an `m`-flagged
 * multi-line pattern where `$` already matches before a `\r`, and a whole-document
 * `\r\n`→`\n` normalisation of a comparison-only copy (`archive.service`'s
 * frontmatter probe) that never reaches a write.
 *
 * What this function returns is a VIEW: it never alters the line the caller holds,
 * so a split→edit→join path can leave every untouched line's ending byte-identical,
 * and flipping one checkbox in a CRLF task list rewrites no other line. Storing the
 * view instead of the raw line is a caller's choice, and one caller makes it
 * deliberately: `delegated-evidence` keeps evidence-block bodies CR-normalised so
 * that `render → split → render` stays byte-identical.
 */

/** The line as a matcher should see it: without its single trailing carriage return. */
export function stripTrailingCr(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

/** Whitespace runs (line breaks included) to one space, ends trimmed — the ONE prose normalizer for comparisons. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
