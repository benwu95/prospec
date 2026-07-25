import { describe, it, expect } from 'vitest';
import { exampleRulesFor, languagePolicyRule } from '../../../src/lib/constitution-rules.js';
import type { LanguageScope } from '../../../src/types/constitution.js';

const SEVERITIES = ['MUST', 'SHOULD', 'MAY'];

describe('exampleRulesFor', () => {
  it('returns 3-5 python rules, each with a valid severity, and the python-specific rule set', () => {
    const rules = exampleRulesFor({ language: 'python' });
    expect(rules.length).toBeGreaterThanOrEqual(3);
    expect(rules.length).toBeLessThanOrEqual(5);
    for (const r of rules) {
      expect(SEVERITIES).toContain(r.severity);
    }
    expect(rules.map((r) => r.name)).toContain('Authenticated API endpoints');
  });

  it('includes an authentication-related rule for python', () => {
    const rules = exampleRulesFor({ language: 'python' });
    expect(
      rules.some((r) => /auth/i.test(`${r.name} ${r.description}`)),
    ).toBe(true);
  });

  it('returns 3-5 typescript rules including the typescript-unique rules', () => {
    const rules = exampleRulesFor({ language: 'typescript' });
    expect(rules.length).toBeGreaterThanOrEqual(3);
    expect(rules.length).toBeLessThanOrEqual(5);
    expect(rules.every((r) => SEVERITIES.includes(r.severity))).toBe(true);
    const names = rules.map((r) => r.name);
    expect(names).toContain('No any in public APIs');
    expect(names).toContain('One-way dependency direction');
    expect(names).not.toContain('Authenticated API endpoints');
    expect(names).not.toContain('No committed secrets');
  });

  it('falls back to language-neutral rules for an unknown language', () => {
    const rules = exampleRulesFor({ language: 'rust-lang-unknown' });
    expect(rules.length).toBeGreaterThanOrEqual(3);
    expect(rules.length).toBeLessThanOrEqual(5);
    expect(rules.every((r) => SEVERITIES.includes(r.severity))).toBe(true);
    const names = rules.map((r) => r.name);
    expect(names).toContain('No committed secrets');
    expect(names).not.toContain('Authenticated API endpoints');
    expect(names).not.toContain('No any in public APIs');
  });

  it('falls back to neutral rules when language is undefined or empty', () => {
    for (const techStack of [{}, { language: undefined }, { language: '' }]) {
      const rules = exampleRulesFor(techStack);
      expect(rules.length).toBeGreaterThanOrEqual(3);
      expect(rules.length).toBeLessThanOrEqual(5);
      const names = rules.map((r) => r.name);
      expect(names).toContain('No committed secrets');
      expect(names).not.toContain('Authenticated API endpoints');
      expect(names).not.toContain('No any in public APIs');
    }
  });

  it('includes at least one MUST rule in every rule set', () => {
    for (const lang of ['python', 'typescript', 'javascript', undefined]) {
      const rules = exampleRulesFor({ language: lang });
      expect(rules.some((r) => r.severity === 'MUST')).toBe(true);
    }
  });
});

describe('languagePolicyRule', () => {
  const scope = (over: Partial<LanguageScope> = {}): LanguageScope => ({
    language: 'Japanese',
    nativePaths: ['.prospec/changes/**', 'prospec/specs/_archived-history/**'],
    englishPaths: ['prospec/CONSTITUTION.md', 'prospec/ai-knowledge/**'],
    namedExceptions: ['the `description` column of `prospec/ai-knowledge/_lessons-ledger.md`'],
    ...over,
  });

  it('returns a MUST rule named Language Policy', () => {
    const rule = languagePolicyRule(scope({ language: 'English' }));
    expect(rule.severity).toBe('MUST');
    expect(rule.name).toBe('Language Policy');
  });

  it('renders the chosen language into description and check', () => {
    const rule = languagePolicyRule(scope({ language: 'Traditional Chinese (Taiwan)' }));
    expect(rule.description).toContain('Traditional Chinese (Taiwan)');
    expect(rule.check).toContain('Traditional Chinese (Taiwan)');
  });

  it('always keeps code and technical terms in English', () => {
    const rule = languagePolicyRule(scope());
    expect(rule.description).toContain('English');
  });

  it('always keeps git commit messages in English', () => {
    const rule = languagePolicyRule(scope());
    expect(rule.description).toContain('git commit messages');
    expect(rule.check).toContain('commit messages');
  });

  // The scope assertions below are the guard the pre-fix rule lacked: its tests
  // only checked severity/name/language interpolation, so nothing went red when
  // the rule's scope contradicted the entry config's.
  it('scopes the artifact language to the resolved native paths', () => {
    const rule = languagePolicyRule(scope());
    for (const p of ['.prospec/changes/**', 'prospec/specs/_archived-history/**']) {
      expect(rule.description).toContain(p);
      expect(rule.check).toContain(p);
    }
  });

  it('declares the resolved trust-zone paths English', () => {
    const rule = languagePolicyRule(scope());
    for (const p of ['prospec/CONSTITUTION.md', 'prospec/ai-knowledge/**']) {
      expect(rule.description).toContain(p);
      expect(rule.check).toContain(p);
    }
  });

  it('lists the named in-zone exceptions so an audit does not flag them', () => {
    const rule = languagePolicyRule(scope());
    expect(rule.description).toContain(
      'the `description` column of `prospec/ai-knowledge/_lessons-ledger.md`',
    );
    expect(rule.check).toMatch(/named exception/i);
  });

  it('renders no trust-zone exemption for an English project (both zones English)', () => {
    const rule = languagePolicyRule(scope({ language: 'English' }));
    expect(rule.description).not.toMatch(/exempt|trust zone/i);
    expect(rule.description).not.toContain('.prospec/changes/**');
    expect(rule.description).toContain('English');
  });
});
