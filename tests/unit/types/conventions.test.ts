import { describe, it, expect } from 'vitest';
import {
  CANONICAL_CONVENTION_DOCS,
  INIT_DOC_REGISTRY,
} from '../../../src/types/conventions.js';

describe('INIT_DOC_REGISTRY', () => {
  it('lists exactly the 7 curated docs init creates, each under its root', () => {
    expect(
      INIT_DOC_REGISTRY.map((d) => `${d.root}:${d.output}`).sort(),
    ).toEqual(
      [
        'base:CONSTITUTION.md',
        'base:index.md',
        'knowledge:_conventions.md',
        'knowledge:_diagram-conventions.md',
        'knowledge:_glossary.md',
        'knowledge:_module-readme-conventions.md',
        'knowledge:_status-lifecycle.md',
      ].sort(),
    );
  });

  it('pairs every doc with a non-empty .hbs template path', () => {
    for (const doc of INIT_DOC_REGISTRY) {
      expect(doc.template).toMatch(/\.hbs$/);
      expect(doc.output.length).toBeGreaterThan(0);
    }
  });

  it('keeps outputs unique and strictly relative (no traversal, no leading slash)', () => {
    const keys = INIT_DOC_REGISTRY.map((d) => `${d.root}:${d.output}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const { output } of INIT_DOC_REGISTRY) {
      expect(output.startsWith('/')).toBe(false);
      expect(output.includes('..')).toBe(false);
    }
  });

  it('derives the canonical convention docs instead of duplicating them', () => {
    for (const canonical of CANONICAL_CONVENTION_DOCS) {
      expect(INIT_DOC_REGISTRY).toContainEqual({
        template: canonical.template,
        root: 'knowledge',
        output: canonical.output,
      });
    }
  });
});
