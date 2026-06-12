import { describe, it, expect } from 'vitest';
import { sanitizeTerminal } from '../../../src/cli/formatters/check-output.js';

const ESC = '\u001b';
const BEL = '\u0007';

describe('sanitizeTerminal', () => {
  it('strips ANSI color and OSC sequences from untrusted strings', () => {
    expect(sanitizeTerminal(`safe ${ESC}]52;c;ZXZpbA==${BEL} text`)).toBe('safe ]52;c;ZXZpbA== text');
    expect(sanitizeTerminal(`${ESC}[31mred${ESC}[0m`)).toBe('[31mred[0m');
    expect(sanitizeTerminal('\u0000\u0008\u009f')).toBe('');
  });

  it('keeps printable text, newlines and tabs untouched', () => {
    expect(sanitizeTerminal('broken link: ./x.md \u2192 docs/x.md')).toBe(
      'broken link: ./x.md \u2192 docs/x.md',
    );
    expect(sanitizeTerminal('a\tb\nc')).toBe('a\tb\nc');
  });
});
