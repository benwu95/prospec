/**
 * Unit tests: lib/language-policy — the single source both the seeded
 * Constitution rule and the agent entry config render their language scope
 * from. Two hand-written copies of the scope is exactly how the Constitution
 * ("AI Knowledge in the artifact language") and CLAUDE.md ("Knowledge base
 * always English") drifted into a MUST-level contradiction, so these tests pin
 * the resolved path sets, the relocated-path resolution, and the stale-seed
 * detector that lets `prospec upgrade` offer a migration.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  resolveLanguageScope,
  entryLanguageContext,
  formatPathList,
  compareLanguagePolicy,
  isLanguagePolicyStale,
} from '../../../src/lib/language-policy.js';
import { languagePolicyRule } from '../../../src/lib/constitution-rules.js';
import type { ProspecConfig } from '../../../src/types/config.js';

const config = (over: Partial<ProspecConfig> = {}): ProspecConfig =>
  ({
    project: { name: 'demo' },
    paths: { base_dir: 'prospec' },
    knowledge: { base_path: 'prospec/ai-knowledge' },
    artifact_language: 'Traditional Chinese (Taiwan)',
    ...over,
  }) as ProspecConfig;

describe('resolveLanguageScope', () => {
  it('resolves the artifact language, treating blank as English', () => {
    expect(resolveLanguageScope(config(), '/p').language).toBe('Traditional Chinese (Taiwan)');
    expect(resolveLanguageScope(config({ artifact_language: '  ' }), '/p').language).toBe('English');
  });

  it('scopes change artifacts and their archived summaries to the artifact language', () => {
    const { nativePaths } = resolveLanguageScope(config(), '/p');

    expect(nativePaths).toContain('.prospec/changes/**');
    expect(nativePaths).toContain('.prospec/archive/**');
    expect(nativePaths).toContain('prospec/specs/_archived-history/**');
  });

  it('resolves the trust-zone language, treating absent or blank as English', () => {
    expect(resolveLanguageScope(config(), '/p').trustZoneLanguage).toBe('English');
    expect(resolveLanguageScope(config({ trust_zone_language: '  ' }), '/p').trustZoneLanguage).toBe('English');
    expect(resolveLanguageScope(config({ trust_zone_language: ' english ' }), '/p').trustZoneLanguage).toBe('English');
    expect(
      resolveLanguageScope(config({ trust_zone_language: 'Traditional Chinese (Taiwan)' }), '/p').trustZoneLanguage,
    ).toBe('Traditional Chinese (Taiwan)');
  });

  it('scopes the whole trust zone under one path set', () => {
    const { trustZonePaths } = resolveLanguageScope(config(), '/p');

    expect(trustZonePaths).toContain('prospec/CONSTITUTION.md');
    expect(trustZonePaths).toContain('prospec/README.md');
    expect(trustZonePaths).toContain('prospec/index.md');
    expect(trustZonePaths).toContain('prospec/specs/features/**');
    expect(trustZonePaths).toContain('prospec/ai-knowledge/**');
  });

  it('spells a shared language one way in both zones, whatever case the two fields used', () => {
    const scope = resolveLanguageScope(
      config({ artifact_language: 'traditional chinese (taiwan)', trust_zone_language: 'Traditional Chinese (Taiwan)' }),
      '/p',
    );
    expect(scope.trustZoneLanguage).toBe(scope.language);
    expect(entryLanguageContext(scope).trust_zone_language).toBe(scope.language);
    // ...and keeps a genuinely different trust-zone language as written
    expect(resolveLanguageScope(config({ trust_zone_language: 'Japanese' }), '/p').trustZoneLanguage).toBe('Japanese');
  });

  // R4-1 regression pin: unifying the spelling of a shared language must never
  // let a lowercase `english` artifact language leak into the trust zone — the
  // trust-zone default is canonical English, and every generator interpolating
  // `trust_zone_language` (the language-policy partial, the graduation references)
  // rendered the literal `English` before the axis existed.
  it('keeps the canonical English spelling for the trust zone when the artifact language is a lowercase english', () => {
    for (const trust of [undefined, ' english ', 'English']) {
      const scope = resolveLanguageScope(config({ artifact_language: 'english', trust_zone_language: trust }), '/p');
      expect(scope.trustZoneLanguage).toBe('English');
      expect(entryLanguageContext(scope).trust_zone_language).toBe('English');
      expect(entryLanguageContext(scope).language_single_zone).toBe(true);
    }
  });

  it('keeps the same path sets whatever the trust-zone language is', () => {
    const english = resolveLanguageScope(config(), '/p');
    const native = resolveLanguageScope(config({ trust_zone_language: 'Traditional Chinese (Taiwan)' }), '/p');

    expect(native.trustZonePaths).toEqual(english.trustZonePaths);
    expect(native.nativePaths).toEqual(english.nativePaths);
  });

  it('never puts a path in both zones', () => {
    const { nativePaths, trustZonePaths } = resolveLanguageScope(config(), '/p');

    expect(nativePaths.filter((p) => trustZonePaths.includes(p))).toEqual([]);
  });

  it('names the in-zone exceptions that may use the artifact language', () => {
    const { namedExceptions } = resolveLanguageScope(config(), '/p');
    const joined = namedExceptions.join('\n');

    expect(joined).toContain('prospec/ai-knowledge/module-map.yaml');
    expect(joined).toContain('prospec/index.md');
    expect(joined).toContain('prospec/ai-knowledge/_lessons-ledger.md');
    expect(joined).toContain('prospec/ai-knowledge/_playbook.md');
    expect(joined).toContain('prospec/ai-knowledge/_glossary.md');
  });

  it('states the ledger\'s other columns as identifiers when the trust zone is not English', () => {
    const english = resolveLanguageScope(config(), '/p').namedExceptions.join('\n');
    const native = resolveLanguageScope(config({ trust_zone_language: 'Japanese' }), '/p').namedExceptions.join('\n');

    expect(english).toContain('every other column stays English)');
    expect(native).toContain('every other column is an identifier or enum and stays English)');
    expect(native).not.toContain('every other column stays English)');
  });

  it('names the change-artifact spots that follow the trust zone (trust-zone-bound content)', () => {
    const { trustZoneExceptions } = resolveLanguageScope(config(), '/p');
    const joined = trustZoneExceptions.join('\n');

    expect(joined).toContain('`**Spec:**` block');
    expect(joined).toContain('.prospec/changes/**/delta-spec.md');
    // it must name the destination zone it inherits its language from
    expect(joined).toContain('prospec/specs/features/**');
  });

  it('resolves a relocated base_dir and knowledge.base_path, not the defaults', () => {
    const scope = resolveLanguageScope(
      config({ paths: { base_dir: 'docs/spec' }, knowledge: { base_path: 'docs/kb' } }),
      '/p',
    );

    expect(scope.nativePaths).toContain('docs/spec/specs/_archived-history/**');
    expect(scope.trustZonePaths).toContain('docs/spec/CONSTITUTION.md');
    expect(scope.trustZonePaths).toContain('docs/kb/**');
    expect(scope.trustZonePaths).not.toContain('prospec/ai-knowledge/**');
    expect(scope.namedExceptions.join('\n')).toContain('docs/kb/_lessons-ledger.md');
  });

  it('keeps paths repo-relative when base_dir resolves to the repo root', () => {
    // `path.relative` returns '' here, and `${base}/x` would emit the root-anchored
    // '/x' — a MUST rule naming paths no project file can match.
    const scope = resolveLanguageScope(config({ paths: { base_dir: '.' } }), '/p');

    expect(scope.trustZonePaths).toContain('CONSTITUTION.md');
    expect(scope.nativePaths).toContain('specs/_archived-history/**');
    expect(scope.trustZonePaths.some((p) => p.startsWith('/'))).toBe(false);
    expect(scope.nativePaths.some((p) => p.startsWith('/'))).toBe(false);
  });

  it('falls back to the canonical base dir when paths.base_dir is absent', () => {
    const scope = resolveLanguageScope(
      { project: { name: 'demo' } } as ProspecConfig,
      '/p',
    );

    expect(scope.trustZonePaths).toContain('prospec/CONSTITUTION.md');
    expect(scope.trustZonePaths).toContain('prospec/ai-knowledge/**');
  });
});

describe('formatPathList', () => {
  it('renders a backtick-quoted, comma-separated list', () => {
    expect(formatPathList(['a/**', 'b.md'])).toBe('`a/**`, `b.md`');
  });

  it('renders a single path without a separator', () => {
    expect(formatPathList(['a/**'])).toBe('`a/**`');
  });
});

describe('entryLanguageContext', () => {
  it('returns the six keys both render sites spread, derived from the scope', () => {
    const ctx = entryLanguageContext(resolveLanguageScope(config(), '/p'));

    expect(Object.keys(ctx).sort()).toEqual(
      [
        'language_is_english',
        'trust_zone_is_english',
        'language_single_zone',
        'trust_zone_language',
        'language_native_paths',
        'language_trust_zone_paths',
      ].sort(),
    );
    expect(ctx.language_is_english).toBe(false);
    expect(ctx.trust_zone_is_english).toBe(true);
    expect(ctx.language_single_zone).toBe(false);
    expect(ctx.trust_zone_language).toBe('English');
    expect(ctx.language_trust_zone_paths).toContain('`prospec/ai-knowledge/**`');
  });

  it('flags a single zone when both languages agree, case-insensitively', () => {
    const same = entryLanguageContext(
      resolveLanguageScope(config({ trust_zone_language: 'traditional chinese (taiwan)' }), '/p'),
    );
    expect(same.language_single_zone).toBe(true);
    expect(same.trust_zone_is_english).toBe(false);

    const english = entryLanguageContext(resolveLanguageScope(config({ artifact_language: 'English' }), '/p'));
    expect(english.language_single_zone).toBe(true);
    expect(english.language_is_english).toBe(true);
  });
});

describe('compareLanguagePolicy / isLanguagePolicyStale', () => {
  const scopeFor = (over: Partial<ProspecConfig> = {}) => resolveLanguageScope(config(over), '/p');
  const expectedFor = (over: Partial<ProspecConfig> = {}) => languagePolicyRule(scopeFor(over)).description;

  const constitutionWith = (policyBody: string): string =>
    [
      '# Project Constitution: demo',
      '',
      '## Principles',
      '',
      '### [MUST] Language Policy',
      '',
      policyBody,
      '',
      '**Rationale**: Owner-authored, never compared.',
      '',
      '**Verify**: Owner-authored, never compared.',
      '',
      '---',
      '### [MUST] Tested public functions',
      '',
      '**Description**: Every public function ships with unit tests.',
      '',
    ].join('\n');

  const stale = constitutionWith(
    '**Description**: All AI-generated documents (change artifacts and AI Knowledge) are written in Japanese. Code, identifiers, technical terms, and git commit messages always remain in English.',
  );

  it('is in sync when the Description matches the rendered one exactly', () => {
    const doc = constitutionWith(`**Description**: ${expectedFor()}`);
    expect(compareLanguagePolicy(doc, expectedFor(), scopeFor())).toBe('in-sync');
    expect(isLanguagePolicyStale(doc, expectedFor(), scopeFor())).toBe(false);
  });

  it('ignores list indentation, blank lines and CRLF — formatting is not scope', () => {
    const reflowed = expectedFor().replace(/\n {2}- /g, '\n\n- ').replace(/\n/g, '\r\n');
    const doc = constitutionWith(`**Description**: ${reflowed}`).replace(/\n/g, '\r\n');
    expect(compareLanguagePolicy(doc, expectedFor(), scopeFor())).toBe('in-sync');
  });

  it('treats this repository\'s own Constitution as in sync with its resolved scope', () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const constitution = fs.readFileSync(path.join(repoRoot, 'prospec/CONSTITUTION.md'), 'utf-8');
    const scope = resolveLanguageScope(
      {
        project: { name: 'prospec' },
        paths: { base_dir: 'prospec' },
        knowledge: { base_path: 'prospec/ai-knowledge' },
        artifact_language: 'Traditional Chinese (Taiwan)',
      } as ProspecConfig,
      repoRoot,
    );
    expect(compareLanguagePolicy(constitution, languagePolicyRule(scope).description, scope)).toBe('in-sync');
  });

  it('diverges when the owner reworded the Description, and is then stale', () => {
    const doc = constitutionWith(
      '**Description**: Change artifacts under `.prospec/changes/**` are written in Traditional Chinese (Taiwan); the trust zone stays English.',
    );
    expect(compareLanguagePolicy(doc, expectedFor(), scopeFor())).toBe('diverged');
    expect(isLanguagePolicyStale(doc, expectedFor(), scopeFor())).toBe(true);
  });

  it('diverges when the config language changed under an otherwise-correct Description', () => {
    const doc = constitutionWith(`**Description**: ${expectedFor()}`);
    const native = { trust_zone_language: 'Traditional Chinese (Taiwan)' } as Partial<ProspecConfig>;
    expect(compareLanguagePolicy(doc, expectedFor(native), scopeFor(native))).toBe('diverged');
  });

  it('flags an untouched old seed as stale-seed', () => {
    expect(compareLanguagePolicy(stale, expectedFor(), scopeFor())).toBe('stale-seed');
    expect(isLanguagePolicyStale(stale, expectedFor(), scopeFor())).toBe(true);
  });

  it('treats the old English seed in an English-only project as legacy, not stale', () => {
    const englishSeed = stale.replace('are written in Japanese.', 'are written in English.');
    const english = { artifact_language: 'English' } as Partial<ProspecConfig>;

    expect(compareLanguagePolicy(englishSeed, expectedFor(english), scopeFor(english))).toBe('legacy-english-seed');
    expect(isLanguagePolicyStale(englishSeed, expectedFor(english), scopeFor(english))).toBe(false);
    // Seeded under another language, switched to English afterwards: the rule still
    // demands that language for everything while the entry config says English.
    expect(compareLanguagePolicy(stale, expectedFor(english), scopeFor(english))).toBe('stale-seed');
    // An English seed in a project that is no longer English-only has to migrate too.
    expect(compareLanguagePolicy(englishSeed, expectedFor(), scopeFor())).toBe('stale-seed');
    const nativeTrust = { artifact_language: 'English', trust_zone_language: 'Japanese' } as Partial<ProspecConfig>;
    expect(compareLanguagePolicy(englishSeed, expectedFor(nativeTrust), scopeFor(nativeTrust))).toBe('stale-seed');
  });

  it('reports a Constitution with no Language Policy principle as missing-section, never stale', () => {
    const doc = '# Project Constitution: demo\n\n## Principles\n';
    expect(compareLanguagePolicy(doc, expectedFor(), scopeFor())).toBe('missing-section');
    expect(compareLanguagePolicy('', expectedFor(), scopeFor())).toBe('missing-section');
    expect(isLanguagePolicyStale(doc, expectedFor(), scopeFor())).toBe(false);
  });

  it('reports a free-text principle with no Description field as no-description, never stale', () => {
    const doc = constitutionWith('Everything is written in Japanese except code.');
    expect(compareLanguagePolicy(doc, expectedFor(), scopeFor())).toBe('no-description');
    expect(isLanguagePolicyStale(doc, expectedFor(), scopeFor())).toBe(false);
  });

  it('ignores the old phrase outside the Language Policy section', () => {
    const quotedElsewhere = [
      '### [MUST] Language Policy',
      '',
      `**Description**: ${expectedFor()}`,
      '',
      '---',
      '### [MAY] Historical note',
      '',
      '**Description**: We used to say All AI-generated documents (change artifacts and AI Knowledge) are written in Japanese.',
      '',
    ].join('\n');

    expect(compareLanguagePolicy(quotedElsewhere, expectedFor(), scopeFor())).toBe('in-sync');
  });

  it('ends the Description at the next Rationale field — never at a list item', () => {
    // Rationale text that happens to restate the scope must not leak into the compared body.
    const doc = constitutionWith(
      `**Description**: ${expectedFor()}\n\n**Rationale**: ${expectedFor()} plus an extra sentence.`,
    );
    expect(compareLanguagePolicy(doc, expectedFor(), scopeFor())).toBe('in-sync');
  });

  // Each terminator pinned on its own: every fixture above reaches Rationale first,
  // so deleting any other branch of DESCRIPTION_END stayed green until these ran.
  const bare = (body: string): string =>
    ['## Principles', '', '### [MUST] Language Policy', '', body, ''].join('\n');

  it('ends the Description at a Verify field when no Rationale precedes it', () => {
    const doc = bare(`**Description**: ${expectedFor()}\n**Verify**: ${expectedFor()} plus more.\n---`);
    expect(compareLanguagePolicy(doc, expectedFor(), scopeFor())).toBe('in-sync');
  });

  it('ends the Description at the principle separator', () => {
    const doc = bare(`**Description**: ${expectedFor()}\n---\n${expectedFor()} plus more.`);
    expect(compareLanguagePolicy(doc, expectedFor(), scopeFor())).toBe('in-sync');
  });

  it('ends the Description at a heading the section slicer does not close on (h5)', () => {
    const doc = bare(`**Description**: ${expectedFor()}\n##### Note\n${expectedFor()} plus more.`);
    expect(compareLanguagePolicy(doc, expectedFor(), scopeFor())).toBe('in-sync');
  });

  it('keeps reading past a list item — a Description list is body, not a boundary', () => {
    const truncated = expectedFor().split('\n')[0]!;
    const doc = bare(`**Description**: ${expectedFor()}\n**Rationale**: r.`);
    expect(compareLanguagePolicy(doc, truncated, scopeFor())).toBe('diverged');
  });

  // The heading match is the whole basis of the section scoping, and a detector's
  // false negative is the least visible failure mode — pin the boundaries.
  it('matches the heading across CRLF and heading depths it must support', () => {
    expect(compareLanguagePolicy(stale.replace(/\n/g, '\r\n'), expectedFor(), scopeFor())).toBe('stale-seed');
    expect(
      compareLanguagePolicy(stale.replace('### [MUST] Language Policy', '## Language Policy'), expectedFor(), scopeFor()),
    ).toBe('stale-seed');
    expect(
      compareLanguagePolicy(stale.replace('### [MUST] Language Policy', '#### Language Policy'), expectedFor(), scopeFor()),
    ).toBe('stale-seed');
  });

  it('deliberately ignores a heading depth or suffix outside the generated shape', () => {
    expect(compareLanguagePolicy(stale.replace('###', '#####'), expectedFor(), scopeFor())).toBe('missing-section');
    expect(
      compareLanguagePolicy(
        stale.replace('### [MUST] Language Policy', '### [MUST] Language Policy (v1)'),
        expectedFor(),
        scopeFor(),
      ),
    ).toBe('missing-section');
  });
});
