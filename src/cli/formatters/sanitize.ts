/**
 * Strip C0/C1 control characters from a string before it reaches the terminal.
 *
 * Formatters interpolate free-form strings read from repo/config/report files
 * (link targets, task text, measurement-report fields, error messages). An
 * untrusted source could embed ANSI/OSC escape sequences (e.g. OSC 52 clipboard
 * writes); removing the control bytes neutralises them. Tabs (0x09) and newlines
 * (0x0a) are preserved — only the other C0 bytes plus C1/DEL (0x7f-0x9f) go.
 */
export function sanitizeTerminal(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    const isControl =
      code <= 0x08 ||
      (code >= 0x0b && code <= 0x1f) ||
      (code >= 0x7f && code <= 0x9f);
    if (!isControl) out += ch;
  }
  return out;
}
