import { describe, it, expect } from 'vitest';
import { formatEscapingNotice } from '../../../src/cli/formatters/escaping-notice.js';
import { ESCAPING_RULE_TEXT } from '../../../src/types/cli-help.js';

describe('formatEscapingNotice (REQ-CLI-055)', () => {
  it('returns nothing for zero escaped cells', () => {
    expect(formatEscapingNotice(0)).toBeUndefined();
  });

  it('returns one line naming the count and the single-source rule text', () => {
    const line = formatEscapingNotice(3)!;
    expect(line.split('\n')).toHaveLength(1);
    expect(line).toContain('3 cell(s)');
    expect(line).toContain(ESCAPING_RULE_TEXT);
  });

  it('the rule text is the one sentence the help prints (no second copy)', () => {
    expect(ESCAPING_RULE_TEXT).toContain('\\|');
    expect(ESCAPING_RULE_TEXT).toMatch(/newline|line break/i);
  });
});
