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
  let fence: { char: string; len: number } | null = null;
  return lines.map((line) => {
    // Up to three spaces of indentation only: four or more (or a tab) makes an
    // indented code block, whose literal ``` must not flip fence state — the old
    // `^\s*` opener let one blind the scanner to the whole rest of the file.
    const m = /^ {0,3}(`{3,}|~{3,})[ \t]*(.*)$/.exec(line);
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
}
