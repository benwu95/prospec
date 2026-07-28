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
    const m = /^\s*(`{3,}|~{3,})\s*(.*)$/.exec(line);
    if (m !== null && m[1] !== undefined) {
      const marker = m[1];
      const info = (m[2] ?? '').trim();
      if (fence === null) {
        fence = { char: marker[0] ?? '`', len: marker.length };
      } else if (marker[0] === fence.char && marker.length >= fence.len && info === '') {
        fence = null;
      }
      return '';
    }
    return fence === null ? line : '';
  });
}
