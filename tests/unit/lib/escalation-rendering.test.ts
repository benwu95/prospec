import { describe, expect, it } from 'vitest';
import { hasUnsafeEscalationEvidence, reduceEscalationHistory, upsertEscalationHistory } from '../../../src/lib/escalation.js';

const history = reduceEscalationHistory([
  { skill: 'prospec-escalation', result: 'WARN', escalation: { kind: 'trigger', station: 'prospec-review', event_id: 'e1', trigger: 'oscillation' } },
  { skill: 'prospec-escalation', result: 'WARN', escalation: { kind: 'override', station: 'prospec-review', event_id: 'e1', grant_id: 'g1', reason: 'inspected | scope\nwith developer' } },
  { skill: 'prospec-escalation', result: 'WARN', escalation: { kind: 'consume', station: 'prospec-review', event_id: 'e1', grant_id: 'g1', attempt_id: 'a1' } },
  { skill: 'prospec-escalation', result: 'WARN', escalation: { kind: 'resolve', station: 'prospec-review', event_id: 'e1' } },
], 3);
const start = '<!-- prospec:escalation-history -->';
const end = '<!-- prospec:escalation-history-end -->';

describe('owned durable escalation history block', () => {
  it.each([start, end, `  ${start}\r`, '```\nunclosed'])('rejects evidence that introduces owned or unclosed markup: %s', text => {
    expect(hasUnsafeEscalationEvidence(text)).toBe(true);
  });
  it.each(['```', '~~~~'])('accepts complete fenced history examples (%s)', fence => {
    expect(hasUnsafeEscalationEvidence(`${fence}\n${start}\nexample\n${end}\n${fence}`)).toBe(false);
  });
  it('accepts ordinary evidence', () => {
    expect(hasUnsafeEscalationEvidence('proof at src/file.ts:12')).toBe(false);
  });
  it.each(['```', '~~~~'])('preserves fenced examples and adjacent authored prose (%s)', fence => {
    const quoted = `${fence}\n${start}\nexample\n${end}\n${fence}\n`;
    const before = `# Summary\n${quoted}\n${start}\nstale\n${end}\nAdjacent prose without a heading.\n`;
    const result = upsertEscalationHistory(before, history);
    expect(result).toContain(quoted);
    expect(result).toContain('Adjacent prose without a heading.\n');
    expect(result).not.toContain('\nstale\n');
    expect(result).toContain('Overrides: 1');
    expect(result).toContain('consumed by a1');
    expect(result).toContain('inspected \\| scope');
    expect(upsertEscalationHistory(result, history)).toBe(result);
  });
  it('refuses duplicate, unclosed and reversed owned markers', () => {
    for (const text of [`${start}\n`, `${end}\n${start}`, `${start}\n${end}\n${start}\n${end}`, '```\n']) {
      expect(() => upsertEscalationHistory(text, history)).toThrow();
    }
  });
  it('does not change documents with no recorded history', () => {
    expect(upsertEscalationHistory('# Authored\n', reduceEscalationHistory([], 2))).toBe('# Authored\n');
  });
});
