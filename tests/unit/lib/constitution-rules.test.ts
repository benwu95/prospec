import { describe, it, expect } from 'vitest';
import { exampleRulesFor, languagePolicyRule } from '../../../src/lib/constitution-rules.js';
import type { LanguageScope } from '../../../src/types/constitution.js';
import type { ProspecConfig } from '../../../src/types/config.js';
import { resolveLanguageScope } from '../../../src/lib/language-policy.js';

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
    trustZoneLanguage: 'English',
    nativePaths: ['.prospec/changes/**', 'prospec/specs/_archived-history/**'],
    trustZonePaths: ['prospec/CONSTITUTION.md', 'prospec/ai-knowledge/**'],
    namedExceptions: ['the `description` column of `prospec/ai-knowledge/_lessons-ledger.md`'],
    trustZoneExceptions: ['the `**Spec:**` block of `.prospec/changes/**/delta-spec.md`'],
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

  // The reverse direction: trust-zone-bound text inside a change artifact. Without
  // it, the MUST rule reads its own required English content as a violation.
  it('lists the reverse exceptions — change-artifact spots that stay English', () => {
    const rule = languagePolicyRule(scope());
    expect(rule.description).toContain('stay **English**');
    expect(rule.description).toContain('the `**Spec:**` block of `.prospec/changes/**/delta-spec.md`');
    expect(rule.check).toContain('in either direction');
  });

  it('omits the reverse-exception clause entirely when there are none', () => {
    const rule = languagePolicyRule(scope({ trustZoneExceptions: [] }));
    expect(rule.description).not.toContain('stay **English**');
  });

  it('renders no trust-zone exemption for an English project (both zones English)', () => {
    const rule = languagePolicyRule(scope({ language: 'English' }));
    expect(rule.description).not.toMatch(/exempt|trust zone/i);
    expect(rule.description).not.toContain('.prospec/changes/**');
    expect(rule.description).toContain('English');
  });

  // The trust-zone axis: no form may assert the trust zone is English by literal.
  describe('native trust zone', () => {
    const NO_ENGLISH_TRUST_ZONE = /always remains in English|stays English so it reads|trust zone \(.*\) always/;

    it('names the trust-zone language in the two-zone form and keeps code English', () => {
      const rule = languagePolicyRule(scope({ trustZoneLanguage: 'Traditional Chinese (Taiwan)' }));
      const all = `${rule.description}\n${rule.rationale}\n${rule.check}`;

      expect(all).not.toMatch(NO_ENGLISH_TRUST_ZONE);
      expect(rule.description).toContain(
        'The trust zone — `prospec/CONSTITUTION.md`, `prospec/ai-knowledge/**` — is written in Traditional Chinese (Taiwan)',
      );
      expect(rule.description).toContain('code, identifiers, technical terms, and git commit messages stay English');
      expect(rule.description).toContain('which stay **Traditional Chinese (Taiwan)** because their content is copied');
      expect(rule.check).toContain('`prospec/CONSTITUTION.md`, `prospec/ai-knowledge/**` are written in Traditional Chinese (Taiwan)');
      expect(rule.check).toContain('code, technical terms, and commit messages are in English');
      expect(rule.check).toContain('does NOT flag the Traditional Chinese (Taiwan) trust zone');
      // still two zones: the artifact language keeps its own clause and exceptions
      expect(rule.description).toContain('are written in Japanese');
      expect(rule.description).toContain('which MAY use Japanese');
    });

    it('renders one language over both path sets when the zones share a non-English language', () => {
      const rule = languagePolicyRule(
        scope({ language: 'Traditional Chinese (Taiwan)', trustZoneLanguage: 'traditional chinese (taiwan)' }),
      );

      expect(rule.description).toBe(
        'All generated documents — change artifacts and their archived summaries (`.prospec/changes/**`, `prospec/specs/_archived-history/**`) and the trust zone (`prospec/CONSTITUTION.md`, `prospec/ai-knowledge/**`) — are written in Traditional Chinese (Taiwan); code, identifiers, technical terms, and git commit messages stay English.',
      );
      expect(rule.description).not.toMatch(/exception|MAY use/);
      expect(rule.check).toContain('are written in Traditional Chinese (Taiwan); code, technical terms, and commit messages are in English');
      expect(`${rule.description}\n${rule.rationale}\n${rule.check}`).not.toMatch(NO_ENGLISH_TRUST_ZONE);
    });

    it('handles the reverse combination — native trust zone, English artifacts — as two zones', () => {
      const rule = languagePolicyRule(scope({ language: 'English', trustZoneLanguage: 'Japanese' }));

      expect(rule.description).toContain('are written in English. The trust zone');
      expect(rule.description).toContain('is written in Japanese');
      expect(rule.description).toContain('which MAY use English');
      expect(rule.description).not.toMatch(NO_ENGLISH_TRUST_ZONE);
    });
  });
});

// Byte-identity pins for the pre-trust-zone-axis rendering. A project that never
// sets `trust_zone_language` (or sets it to English) must keep receiving exactly
// this text: the `language-policy-drift` check compares a Constitution's
// Description against it, so any drift here would WARN every existing project on
// upgrade — a forced migration the axis explicitly promises not to cause.
describe('languagePolicyRule — default trust zone is byte-identical to the pre-axis wording', () => {
  const config = (over: Record<string, unknown>): ProspecConfig =>
    ({
      project: { name: 'demo' },
      paths: { base_dir: 'prospec' },
      knowledge: { base_path: 'prospec/ai-knowledge' },
      ...over,
    }) as ProspecConfig;

  const PINNED_TWO_ZONE = {
    severity: 'MUST',
    name: 'Language Policy',
    description:
      'Change artifacts and their archived summaries — `.prospec/changes/**`, `.prospec/archive/**`, `prospec/specs/_archived-history/**` — are written in Traditional Chinese (Taiwan). The trust zone — `prospec/CONSTITUTION.md`, `prospec/README.md`, `prospec/index.md`, `prospec/specs/product.md`, `prospec/specs/features/**`, `prospec/ai-knowledge/**` — always remains in English, as do code, identifiers, technical terms, and git commit messages: it is technical reference read next to the code and cited in English, and is **explicitly NOT** subject to the Traditional Chinese (Taiwan) requirement. Named exceptions inside the trust zone, which MAY use Traditional Chinese (Taiwan):\n' +
      '  - keyword data — the `aliases` in `prospec/ai-knowledge/module-map.yaml` and the Aliases column of `prospec/index.md` (native-language terms widen L1 keyword matching)\n' +
      '  - the `description` column of `prospec/ai-knowledge/_lessons-ledger.md` (each lesson — and its promotion provenance suffix — is quoted in the language of the original correction; every other column stays English)\n' +
      '  - correction evidence recorded in the original language in `prospec/ai-knowledge/_playbook.md` (its `Re-evidence` bullets)\n' +
      '  - `prospec/ai-knowledge/_glossary.md` as a whole (user-managed — the project owner picks its language)\n' +
      '\n' +
      'Named exceptions inside the change-artifact zone, which stay **English** because their content is copied into the trust zone verbatim:\n' +
      "  - the `**Spec:**` block of `.prospec/changes/**/delta-spec.md` — it lands verbatim as the REQ body in `prospec/specs/features/**`, so it is authored in THAT zone's language; the surrounding Before/After/Reason narrative stays in Traditional Chinese (Taiwan)",
    rationale:
      'The project owner reviews their own change narrative in Traditional Chinese (Taiwan), while the trust zone stays English so it reads like the code it documents and travels beyond this project. Both this rule and the agent entry config are generated from one resolved path set, so the two cannot drift into contradicting each other.',
    check:
      'Files under `.prospec/changes/**`, `.prospec/archive/**`, `prospec/specs/_archived-history/**` are written in Traditional Chinese (Taiwan); `prospec/CONSTITUTION.md`, `prospec/README.md`, `prospec/index.md`, `prospec/specs/product.md`, `prospec/specs/features/**`, `prospec/ai-knowledge/**`, code, technical terms, and commit messages are in English. The named exceptions above are NOT violations — in either direction — and an audit does NOT flag the English trust zone as a Language-Policy violation.',
  };

  const PINNED_ENGLISH = {
    severity: 'MUST',
    name: 'Language Policy',
    description:
      'All generated documents, code, identifiers, technical terms, and git commit messages are written in English.',
    rationale:
      'One declared document language keeps generated artifacts consistent and reviewable; English code, terminology, and commit history follow industry convention.',
    check: 'Generated documents, code, technical terms, and commit messages are in English.',
  };

  it('renders the two-zone rule verbatim when trust_zone_language is unset', () => {
    const rule = languagePolicyRule(
      resolveLanguageScope(config({ artifact_language: 'Traditional Chinese (Taiwan)' }), '/p'),
    );
    expect(rule).toEqual(PINNED_TWO_ZONE);
  });

  it('renders the two-zone rule verbatim when trust_zone_language is an explicit English', () => {
    const rule = languagePolicyRule(
      resolveLanguageScope(
        config({ artifact_language: 'Traditional Chinese (Taiwan)', trust_zone_language: ' english ' }),
        '/p',
      ),
    );
    expect(rule).toEqual(PINNED_TWO_ZONE);
  });

  it('renders the condensed English rule verbatim for an all-English project', () => {
    expect(languagePolicyRule(resolveLanguageScope(config({}), '/p'))).toEqual(PINNED_ENGLISH);
    expect(
      languagePolicyRule(
        resolveLanguageScope(config({ artifact_language: 'English', trust_zone_language: 'English' }), '/p'),
      ),
    ).toEqual(PINNED_ENGLISH);
  });
});
