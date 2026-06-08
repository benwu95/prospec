import { describe, it, expect } from 'vitest';
import { exampleRulesFor } from '../../../src/lib/constitution-rules.js';

const SEVERITIES = ['MUST', 'SHOULD', 'MAY'];

describe('exampleRulesFor', () => {
  it('returns 3-5 python rules, each with a severity, name, and rationale', () => {
    const rules = exampleRulesFor({ language: 'python' });
    expect(rules.length).toBeGreaterThanOrEqual(3);
    expect(rules.length).toBeLessThanOrEqual(5);
    for (const r of rules) {
      expect(SEVERITIES).toContain(r.severity);
      expect(r.name).toBeTruthy();
      expect(r.rationale).toBeTruthy();
    }
  });

  it('includes an authentication-related rule for python', () => {
    const rules = exampleRulesFor({ language: 'python' });
    expect(
      rules.some((r) => /auth/i.test(`${r.name} ${r.description}`)),
    ).toBe(true);
  });

  it('returns 3-5 typescript rules, each with a severity', () => {
    const rules = exampleRulesFor({ language: 'typescript' });
    expect(rules.length).toBeGreaterThanOrEqual(3);
    expect(rules.length).toBeLessThanOrEqual(5);
    expect(rules.every((r) => SEVERITIES.includes(r.severity))).toBe(true);
  });

  it('falls back to language-neutral rules for an unknown language', () => {
    const rules = exampleRulesFor({ language: 'rust-lang-unknown' });
    expect(rules.length).toBeGreaterThanOrEqual(3);
    expect(rules.length).toBeLessThanOrEqual(5);
    expect(rules.every((r) => SEVERITIES.includes(r.severity))).toBe(true);
  });

  it('falls back to neutral rules when language is undefined or empty', () => {
    expect(exampleRulesFor({}).length).toBeGreaterThanOrEqual(3);
    expect(exampleRulesFor({ language: undefined }).length).toBeGreaterThanOrEqual(3);
  });

  it('includes at least one MUST rule in every rule set', () => {
    for (const lang of ['python', 'typescript', 'javascript', undefined]) {
      const rules = exampleRulesFor({ language: lang });
      expect(rules.some((r) => r.severity === 'MUST')).toBe(true);
    }
  });
});
