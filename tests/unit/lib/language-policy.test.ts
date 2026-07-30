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
import {
  resolveLanguageScope,
  formatPathList,
  isSeededLanguagePolicyStale,
} from '../../../src/lib/language-policy.js';
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

  it('scopes the whole trust zone to English', () => {
    const { englishPaths } = resolveLanguageScope(config(), '/p');

    expect(englishPaths).toContain('prospec/CONSTITUTION.md');
    expect(englishPaths).toContain('prospec/README.md');
    expect(englishPaths).toContain('prospec/index.md');
    expect(englishPaths).toContain('prospec/specs/features/**');
    expect(englishPaths).toContain('prospec/ai-knowledge/**');
  });

  it('never puts a path in both zones', () => {
    const { nativePaths, englishPaths } = resolveLanguageScope(config(), '/p');

    expect(nativePaths.filter((p) => englishPaths.includes(p))).toEqual([]);
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

  it('names the change-artifact spots that stay English (trust-zone-bound content)', () => {
    const { englishExceptions } = resolveLanguageScope(config(), '/p');
    const joined = englishExceptions.join('\n');

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
    expect(scope.englishPaths).toContain('docs/spec/CONSTITUTION.md');
    expect(scope.englishPaths).toContain('docs/kb/**');
    expect(scope.englishPaths).not.toContain('prospec/ai-knowledge/**');
    expect(scope.namedExceptions.join('\n')).toContain('docs/kb/_lessons-ledger.md');
  });

  it('keeps paths repo-relative when base_dir resolves to the repo root', () => {
    // `path.relative` returns '' here, and `${base}/x` would emit the root-anchored
    // '/x' — a MUST rule naming paths no project file can match.
    const scope = resolveLanguageScope(config({ paths: { base_dir: '.' } }), '/p');

    expect(scope.englishPaths).toContain('CONSTITUTION.md');
    expect(scope.nativePaths).toContain('specs/_archived-history/**');
    expect(scope.englishPaths.some((p) => p.startsWith('/'))).toBe(false);
    expect(scope.nativePaths.some((p) => p.startsWith('/'))).toBe(false);
  });

  it('falls back to the canonical base dir when paths.base_dir is absent', () => {
    const scope = resolveLanguageScope(
      { project: { name: 'demo' } } as ProspecConfig,
      '/p',
    );

    expect(scope.englishPaths).toContain('prospec/CONSTITUTION.md');
    expect(scope.englishPaths).toContain('prospec/ai-knowledge/**');
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

describe('isSeededLanguagePolicyStale', () => {
  const stale = [
    '# Project Constitution: demo',
    '',
    '## Principles',
    '',
    '### [MUST] Language Policy',
    '',
    '**Description**: All AI-generated documents (change artifacts and AI Knowledge) are written in Japanese. Code, identifiers, technical terms, and git commit messages always remain in English.',
    '',
    '---',
    '### [MUST] Tested public functions',
    '',
    '**Description**: Every public function ships with unit tests.',
    '',
  ].join('\n');

  it('flags an untouched old seed', () => {
    expect(isSeededLanguagePolicyStale(stale)).toBe(true);
  });

  it('skips an English project only when the seed itself said English', () => {
    const englishSeed = stale.replace('are written in Japanese.', 'are written in English.');

    expect(isSeededLanguagePolicyStale(englishSeed, 'English')).toBe(false);
    // Seeded under another language, switched to English afterwards: the rule still
    // demands that language for everything while the entry config says English.
    expect(isSeededLanguagePolicyStale(stale, 'English')).toBe(true);
    expect(isSeededLanguagePolicyStale(englishSeed, 'Japanese')).toBe(true);
  });

  it('does not flag a Constitution the user already rewrote', () => {
    const rewritten = stale.replace(
      'All AI-generated documents (change artifacts and AI Knowledge) are written in Japanese.',
      'Change artifacts under `.prospec/changes/**` are written in Japanese; the trust zone stays English.',
    );

    expect(isSeededLanguagePolicyStale(rewritten)).toBe(false);
  });

  it('does not flag a Constitution with no Language Policy rule at all', () => {
    expect(isSeededLanguagePolicyStale('# Project Constitution: demo\n\n## Principles\n')).toBe(false);
  });

  it('ignores the old phrase outside the Language Policy section', () => {
    const quotedElsewhere = [
      '### [MUST] Language Policy',
      '',
      '**Description**: Change artifacts are written in Japanese; the trust zone stays English.',
      '',
      '---',
      '### [MAY] Historical note',
      '',
      '**Description**: We used to say All AI-generated documents (change artifacts and AI Knowledge) are written in Japanese.',
      '',
    ].join('\n');

    expect(isSeededLanguagePolicyStale(quotedElsewhere)).toBe(false);
  });

  it('does not flag an empty or missing file body', () => {
    expect(isSeededLanguagePolicyStale('')).toBe(false);
  });

  // The heading match is the whole basis of the section scoping, and a detector's
  // false negative is the least visible failure mode — pin the boundaries.
  it('matches the heading across CRLF and heading depths it must support', () => {
    expect(isSeededLanguagePolicyStale(stale.replace(/\n/g, '\r\n'))).toBe(true);
    expect(isSeededLanguagePolicyStale(stale.replace('### [MUST] Language Policy', '## Language Policy'))).toBe(true);
    expect(isSeededLanguagePolicyStale(stale.replace('### [MUST] Language Policy', '#### Language Policy'))).toBe(true);
  });

  it('deliberately ignores a heading depth or suffix outside the generated shape', () => {
    expect(isSeededLanguagePolicyStale(stale.replace('###', '#####'))).toBe(false);
    expect(
      isSeededLanguagePolicyStale(stale.replace('### [MUST] Language Policy', '### [MUST] Language Policy (v1)')),
    ).toBe(false);
  });
});
