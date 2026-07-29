/**
 * Fenced-block blanking — shared by every markdown scanner in lib.
 *
 * Extracted so the drift collectors and the Constitution parser cannot drift
 * apart on CommonMark fence rules (PB-006): a leaf module both can import
 * without creating a lib→lib cycle.
 */

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
