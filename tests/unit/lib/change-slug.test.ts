import { describe, it, expect } from 'vitest';
import { sanitizeChangeSlug, deriveFixChangeName } from '../../../src/lib/change-metadata.js';

/**
 * These two helpers decide where auto-draft writes. Their guarantee is not
 * "produces a tidy name" but "produces a name that stays inside
 * `.prospec/changes/`", which is what makes a report's `source_path` — free-form
 * text from a file the tool did not author — safe to build a path from.
 */

describe('sanitizeChangeSlug', () => {
  it('collapses path separators and dots, so no input can traverse upward', () => {
    for (const evil of [
      '../../etc/passwd',
      '..\\..\\windows\\system32',
      './../x',
      'a/b/c',
      '.hidden',
      '/absolute/path',
    ]) {
      const slug = sanitizeChangeSlug(evil);
      expect(slug).not.toContain('/');
      expect(slug).not.toContain('\\');
      expect(slug).not.toContain('.');
      expect(slug).not.toMatch(/^-|-$/);
    }
  });

  it('keeps only kebab-safe characters and never leaves separator runs', () => {
    expect(sanitizeChangeSlug('Hello World')).toBe('hello-world');
    expect(sanitizeChangeSlug('a---b')).toBe('a-b');
    expect(sanitizeChangeSlug('--lead-and-trail--')).toBe('lead-and-trail');
    expect(sanitizeChangeSlug('keep_under_scores')).toBe('keep_under_scores');
  });

  it('returns empty for input with nothing slug-safe in it', () => {
    expect(sanitizeChangeSlug('使用者')).toBe('');
    expect(sanitizeChangeSlug('модуль')).toBe('');
    expect(sanitizeChangeSlug('...')).toBe('');
    expect(sanitizeChangeSlug('')).toBe('');
  });
});

describe('deriveFixChangeName', () => {
  it('produces `fix-<target>-<check>` for names that are already slug-safe', () => {
    expect(deriveFixChangeName('services', 'knowledge-size')).toBe('fix-services-knowledge-size');
  });

  it('stands in `general` / `drift` when a side sanitises away to nothing', () => {
    expect(deriveFixChangeName('使用者', 'knowledge-size')).toBe('fix-general-knowledge-size');
    expect(deriveFixChangeName('services', '  ')).toBe('fix-services-drift');
  });

  it('yields a name that cannot escape the changes directory', () => {
    for (const target of ['../../..', 'a/b', './x', '\\\\server\\share']) {
      const name = deriveFixChangeName(target, '../../etc');
      expect(name).toMatch(/^fix-[a-z0-9_-]*$/);
      expect(name).not.toContain('..');
    }
  });

  it('is deterministic for the same input', () => {
    expect(deriveFixChangeName('a/b', 'x')).toBe(deriveFixChangeName('a/b', 'x'));
  });
});
