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
});
