/**
 * Fenced-block blanking — shared by every markdown scanner in lib.
 *
 * Extracted so the drift collectors and the Constitution parser cannot drift
 * apart on CommonMark fence rules (PB-006): a leaf module both can import
 * without creating a lib→lib cycle.
 */

/**
 * Render arbitrary text as ONE inline code span it cannot escape.
 *
 * The producing side of the same CommonMark delimiter rules this module already
 * owns for the scanning side. Callers emit filesystem-derived text — directory
 * names, extensions — into generated markdown that an agent then reads as
 * evidence; a stray backtick in a path would otherwise close the span early and
 * turn the rest of the name into free prose the agent reads as instruction.
 *
 * Three rules do the work. The delimiter must be LONGER than the longest backtick
 * run in the content. Content whose first or last character is a backtick needs one
 * space of padding (the reader strips exactly one); empty content is padded for the
 * same reason, since CommonMark has no zero-width code span and a bare delimiter
 * pair would render as literal backticks.
 *
 * And line breaks are collapsed to a single space, because a code span's content
 * lives inside ONE paragraph: a blank line ends that paragraph, the closing
 * delimiter lands in the next one, and anything between the two renders as real
 * markdown — a forged heading included. Filesystem paths cannot reach this (the
 * scan glob never yields a newline-bearing path), but manifest-derived strings can:
 * a `package.json` `main` or a version specifier is arbitrary JSON text. Escaping
 * the delimiter without collapsing the newline would have left that hole open, so
 * the rule belongs here rather than in each caller.
 */
export function toInlineCodeSpan(raw: string): string {
  const content = raw.replace(/[\r\n]+/g, ' ');
  const longest = Math.max(
    0,
    ...[...content.matchAll(/`+/g)].map((m) => m[0].length),
  );
  const fence = '`'.repeat(longest + 1);
  const needsPad =
    content === '' || content.startsWith('`') || content.endsWith('`');
  const pad = needsPad ? ' ' : '';
  return `${fence}${pad}${content}${pad}${fence}`;
}

/**
 * Blank fenced code blocks while KEEPING line count, so a scanner's finding
 * line numbers stay correct. Fences carry illustrative examples — scanning them
 * produces false positives, and false positives are what kills trust in a checker.
 *
 * CommonMark close rules matter here: the closer must use the same character,
 * be at least as long as the opener, and carry no info string — otherwise a
 * 4-backtick fence wrapping a 3-backtick example leaks its content.
 */
export function withoutFencedBlocks(lines: string[]): string[] {
  return scanFences(lines).masked;
}

/**
 * Whether a fence is still open at end of input — the document is malformed, and
 * every line after that opener is masked. A caller that only reads masked lines
 * then sees a truncated document and can conclude a heading is absent when it is
 * plainly there; the honest answer is to stop trusting the mask, not to act on it.
 * Shares one scanner with `withoutFencedBlocks` so the two cannot disagree.
 */
export function hasUnclosedFence(lines: string[]): boolean {
  return scanFences(lines).unclosed;
}

function scanFences(lines: string[]): { masked: string[]; unclosed: boolean } {
  let fence: { char: string; len: number } | null = null;
  const masked = lines.map((line) => {
    // We allow arbitrary leading whitespace because a fenced block may be deeply
    // indented inside list items. We cannot differentiate root-level indented code
    // blocks from list-item fenced blocks without a full markdown parser, so we err
    // on the side of NOT blinding the scanner to valid fences (Issue #106).
    // Match against a `\r`-stripped view: `.` never matches `\r` and there is no
    // `m` flag, so a CRLF document's fence lines would not match at all and every
    // fence would read as absent. The ORIGINAL line is what we return.
    const m = /^[ \t]*(`{3,}|~{3,})[ \t]*(.*)$/.exec(line.endsWith('\r') ? line.slice(0, -1) : line);
    if (m !== null && m[1] !== undefined) {
      const marker = m[1];
      const rest = m[2] ?? '';
      const info = rest.trim();
      const char = marker[0] ?? '`';
      if (fence === null) {
        // A backtick fence's info string may not contain a backtick (a one-line
        // ```code``` span is inline code, not an opener); tilde info may.
        if (char === '`' && rest.includes('`')) return line;
        fence = { char, len: marker.length };
      } else if (char === fence.char && marker.length >= fence.len && info === '') {
        fence = null;
      }
      return '';
    }
    return fence === null ? line : '';
  });
  return { masked, unclosed: fence !== null };
}
