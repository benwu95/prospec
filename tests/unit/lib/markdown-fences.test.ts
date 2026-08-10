import { describe, it, expect } from 'vitest';
import {
  withoutFencedBlocks,
  hasUnclosedFence,
  toInlineCodeSpan,
  trimTrailingNewlines,
} from '../../../src/lib/markdown-fences.js';

/**
 * REQ-LIB-036 — CommonMark fence boundaries for the shared blanking helper.
 *
 * Every markdown scanner in lib (Constitution parser, drift collectors) runs
 * through this; a wrong fence flip blinds a scanner to the whole rest of the
 * file, so each boundary rule gets its own pin.
 */

const run = (text: string): string[] => withoutFencedBlocks(text.split('\n'));

describe('withoutFencedBlocks', () => {
  it('blanks fenced content, keeps surrounding lines, and preserves line count', () => {
    const lines = ['before', '```js', 'const x = 1;', '```', 'after'];
    const out = run(lines.join('\n'));
    expect(out).toEqual(['before', '', '', '', 'after']);
    expect(out).toHaveLength(lines.length);
  });

  it('keeps a longer closer rule: a 4-backtick fence wraps a 3-backtick example', () => {
    const out = run(['````', '```', 'inner example', '```', '````', 'visible'].join('\n'));
    expect(out).toEqual(['', '', '', '', '', 'visible']);
  });

  it('still opens a fence indented up to three spaces', () => {
    const out = run(['   ```', 'hidden', '   ```', 'visible'].join('\n'));
    expect(out).toEqual(['', '', '', 'visible']);
  });

  it('opens a fence indented 4+ spaces (e.g. inside a list item context)', () => {
    const out = run(['    ```', 'hidden', '    ```', 'visible'].join('\n'));
    expect(out).toEqual(['', '', '', 'visible']);
  });

  // CommonMark: a backtick fence's info string may not contain a backtick — a
  // one-line ```code``` span is inline code, not an opener that swallows the file.
  it('does not open a fence for a one-line ```code``` inline span', () => {
    const out = run(['```not-a-fence```', 'stays visible'].join('\n'));
    expect(out[0]).toBe('```not-a-fence```');
    expect(out[1]).toBe('stays visible');
  });

  it('a tilde fence MAY carry backticks in its info string (tilde rule differs)', () => {
    const out = run(['~~~`weird`', 'hidden', '~~~', 'visible'].join('\n'));
    expect(out).toEqual(['', '', '', 'visible']);
  });

  it('blanks ~~~ fences and closes them only with ~~~ (mixed-marker close rule)', () => {
    const out = run(['~~~', '```', 'still inside — a backtick line cannot close a tilde fence', '~~~', 'visible'].join('\n'));
    expect(out).toEqual(['', '', '', '', 'visible']);
  });

  it('a ``` fence is not closed by ~~~', () => {
    const out = run(['```', '~~~', 'still inside', '```', 'visible'].join('\n'));
    expect(out).toEqual(['', '', '', '', 'visible']);
  });

  it('an unclosed fence blanks to the end of the document (fail toward blindness inside the fence only)', () => {
    const out = run(['```', 'hidden 1', 'hidden 2'].join('\n'));
    expect(out).toEqual(['', '', '']);
  });

  it('a closer with an info string does not close (it is content or a nested opener)', () => {
    const out = run(['```', '``` still-inside', 'hidden', '```', 'visible'].join('\n'));
    expect(out).toEqual(['', '', '', '', 'visible']);
  });
});

describe('toInlineCodeSpan', () => {
  it('wraps ordinary content in a single backtick pair', () => {
    expect(toInlineCodeSpan('docs/')).toBe('`docs/`');
  });

  it('widens the delimiter past the longest backtick run inside the content', () => {
    // CommonMark: a code span's delimiter must be LONGER than any run it holds,
    // and content starting or ending with a backtick needs one space of padding.
    expect(toInlineCodeSpan('a`b')).toBe('``a`b``');
    expect(toInlineCodeSpan('a``b')).toBe('```a``b```');
    expect(toInlineCodeSpan('`lead')).toBe('`` `lead ``');
    expect(toInlineCodeSpan('trail`')).toBe('`` trail` ``');
  });

  it('collapses line breaks — a code span cannot legally span a blank line', () => {
    // The delimiter rule alone is not enough for manifest-derived values. A code
    // span's content lives in one paragraph: a blank line ends that paragraph and
    // the closing delimiter lands in the next one, so a forged heading in between
    // renders as a real heading. Filesystem paths cannot carry a newline (the scan
    // glob drops them); a `package.json` "main" or version string can.
    expect(toInlineCodeSpan('1.0.0\n\n## Forged Heading')).toBe('`1.0.0 ## Forged Heading`');
    expect(toInlineCodeSpan('a\r\nb')).toBe('`a b`');
    expect(toInlineCodeSpan('a\n\n\n\nb')).toBe('`a b`');
    // Collapsing must not defeat the delimiter rule: a backtick still widens.
    expect(toInlineCodeSpan('a`b\nc')).toBe('``a`b c``');
    // The emitted span is always a single line.
    for (const c of ['x\ny', '\n', 'a\r\n\r\nb']) {
      expect(toInlineCodeSpan(c)).not.toContain('\n');
      expect(toInlineCodeSpan(c)).not.toContain('\r');
    }
  });

  it('never lets content escape its span — the rendered text round-trips', () => {
    // The property that matters: whatever the content, the emitted string is one
    // code span whose inner text is exactly the content.
    for (const content of ['x', 'a`b', '``', '`a`', 'a```b', '|pipe|', '<!-- marker -->', '']) {
      const span = toInlineCodeSpan(content);
      const fence = /^(`+)/.exec(span)?.[1] ?? '';
      expect(span.endsWith(fence)).toBe(true);
      const inner = span.slice(fence.length, span.length - fence.length);
      expect(inner.trim() === content.trim() || inner === ` ${content} `).toBe(true);
      // A well-formed span always has content between its delimiters —
      // CommonMark has no zero-width code span.
      expect(inner.length).toBeGreaterThan(0);
      // No run inside the content is as long as the delimiter.
      const longest = Math.max(0, ...[...content.matchAll(/`+/g)].map((m) => m[0].length));
      expect(fence.length).toBeGreaterThan(longest);
    }
  });
});

/**
 * REQ-LIB-043 — whether the mask can be trusted at all.
 *
 * An open fence at EOF blanks every line after it, so a scanner reading only the
 * masked view sees a truncated document and concludes a heading is absent when it
 * is plainly there. Both answers come from one scanner, so they cannot disagree.
 */
describe('hasUnclosedFence', () => {
  const unclosed = (text: string): boolean => hasUnclosedFence(text.split('\n'));

  it('is false when there is no fence, or every fence closes', () => {
    expect(unclosed('# Title\n\nplain prose\n')).toBe(false);
    expect(unclosed('a\n```ts\ncode\n```\nb\n')).toBe(false);
    expect(unclosed('a\n~~~\ncode\n~~~\nb\n')).toBe(false);
    // a closer longer than its opener still closes
    expect(unclosed('```\ncode\n`````\n')).toBe(false);
    // a one-line ```code``` span is inline code, never an opener
    expect(unclosed('text ```inline``` more\n')).toBe(false);
  });

  it('is true when a fence is still open at end of input', () => {
    expect(unclosed('a\n```markdown\nnever closed\n')).toBe(true);
    expect(unclosed('a\n~~~\nnever closed\n')).toBe(true);
    // a closer of a DIFFERENT character does not close
    expect(unclosed('```\ncode\n~~~\n')).toBe(true);
    // a shorter run does not close a longer opener
    expect(unclosed('````\ncode\n```\n')).toBe(true);
    // a closer carrying an info string is not a closer
    expect(unclosed('```\ncode\n``` trailing\n')).toBe(true);
  });

  it('sees fences in a CRLF document — `.` does not match `\\r`', () => {
    // Every caller splits on `\n`, so a CRLF document's fence lines arrive with a
    // trailing `\r`. Matching the raw line made every fence read as absent.
    expect(unclosed('a\r\n```md\r\nforgot to close\r\n')).toBe(true);
    expect(unclosed('a\r\n```md\r\ncode\r\n```\r\nb\r\n')).toBe(false);
    // masking still returns the ORIGINAL lines, `\r` included
    expect(withoutFencedBlocks('a\r\n```\r\ncode\r\n```\r\nb\r'.split('\n'))).toEqual([
      'a\r',
      '',
      '',
      '',
      'b\r',
    ]);
  });

  it('agrees with withoutFencedBlocks — an open fence masks the whole tail', () => {
    const lines = 'a\n```\nopen\n## Heading\n'.split('\n');
    expect(hasUnclosedFence(lines)).toBe(true);
    // the heading the caller would look for is masked away, which is exactly why
    // the caller must ask this question before trusting the mask
    expect(withoutFencedBlocks(lines)).toEqual(['a', '', '', '', '']);
  });
});

describe('trimTrailingNewlines', () => {
  it.each([
    ['no trailing newline', 'a\nb', 'a\nb'],
    ['one', 'a\n', 'a'],
    ['several', 'a\n\n\n', 'a'],
    ['CRLF', 'a\r\n\r\n', 'a'],
    ['all newlines', '\n\n', ''],
    ['empty', '', ''],
  ])('trims %s', (_label, input, expected) => {
    expect(trimTrailingNewlines(input)).toBe(expected);
  });

  it('is linear in the length of an interior newline run', () => {
    // `replace(/\n+$/, '')` backtracks quadratically here: `evidence` is
    // deliberately uncapped, so one payload with a long blank stretch made every
    // later append take tens of seconds. Doubling the run must not quadruple the
    // time — assert against a wall-clock ceiling a quadratic scan cannot meet.
    const run = (n: number): number => {
      const s = `x\n${'\n'.repeat(n)}b\n`;
      const started = performance.now();
      expect(trimTrailingNewlines(s)).toBe(`x\n${'\n'.repeat(n)}b`);
      return performance.now() - started;
    };
    run(50_000);
    expect(run(200_000)).toBeLessThan(1_000);
  });
});
