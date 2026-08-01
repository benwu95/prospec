import { describe, it, expect } from 'vitest';
import { withoutFencedBlocks, toInlineCodeSpan } from '../../../src/lib/markdown-fences.js';

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

  // CommonMark: four or more spaces of indentation makes an indented code
  // block — its literal ``` must not flip fence state and blind everything
  // after it (issue #103; the old `^\s*` opener accepted any indentation).
  it('does not treat a 4-space-indented ``` literal as a fence', () => {
    const out = run(['    ```', 'REQ-LIB-036 stays visible', '    ```'].join('\n'));
    expect(out[1]).toBe('REQ-LIB-036 stays visible');
  });

  it('still opens a fence indented up to three spaces', () => {
    const out = run(['   ```', 'hidden', '   ```', 'visible'].join('\n'));
    expect(out).toEqual(['', '', '', 'visible']);
  });

  it('does not treat a tab-indented ``` literal as a fence (tab = indented code)', () => {
    const out = run(['\t```', 'stays visible'].join('\n'));
    expect(out[1]).toBe('stays visible');
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
