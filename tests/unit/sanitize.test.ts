import { describe, it, expect } from 'vitest';
import { sanitizeTerminal } from '../../src/cli/formatters/sanitize.js';

describe('sanitizeTerminal', () => {
  it('preserves normal printable ASCII characters', () => {
    const input = 'Hello, World! 12345 #$%^&*()';
    expect(sanitizeTerminal(input)).toBe(input);
  });

  it('preserves multi-byte Unicode characters, Chinese, and emojis', () => {
    const input = '測試繁體中文 🚀 Unicode: äöü 日本語';
    expect(sanitizeTerminal(input)).toBe(input);
  });

  it('preserves tabs and newlines', () => {
    const input = 'Line 1\nLine 2\tTabbed\n';
    expect(sanitizeTerminal(input)).toBe(input);
  });

  it('strips C0 control characters (except tab and newline)', () => {
    // 0x00 (NUL), 0x07 (BEL), 0x08 (BS), 0x0b (VT), 0x0c (FF), 0x0d (CR), 0x1b (ESC)
    const input = 'Hello\u0000\u0007\u0008, \u000b\u000c\rWorld\u001b!';
    expect(sanitizeTerminal(input)).toBe('Hello, World!');
  });

  it('strips DEL (0x7f) and C1 control characters (0x80-0x9f)', () => {
    const input = 'Safe\u007fText\u0080\u0085\u009fHere';
    expect(sanitizeTerminal(input)).toBe('SafeTextHere');
  });

  it('neutralizes ANSI and OSC escape sequences', () => {
    // ANSI color escape: \u001b[31mRed\u001b[0m
    const ansiInput = '\u001b[31mRed\u001b[0m';
    expect(sanitizeTerminal(ansiInput)).toBe('[31mRed[0m');

    // OSC 52 clipboard injection: \u001b]52;c;ZXhwbG9pdA==\u0007
    const oscInput = '\u001b]52;c;ZXhwbG9pdA==\u0007';
    expect(sanitizeTerminal(oscInput)).toBe(']52;c;ZXhwbG9pdA==');
  });

  it('handles empty strings gracefully', () => {
    expect(sanitizeTerminal('')).toBe('');
  });
});
