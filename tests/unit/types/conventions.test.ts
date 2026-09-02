import { describe, it, expect } from 'vitest';
import {
  CANONICAL_CONVENTION_DOCS,
  USER_MANAGED_CONVENTION_DOCS,
  INIT_DOC_REGISTRY,
  CANONICAL_INIT_DOCS,
  asKnowledgeInitDoc,
} from '../../../src/types/conventions.js';

describe('INIT_DOC_REGISTRY', () => {
  it('lists exactly the 8 curated docs init creates, each under its root', () => {
    expect(
      INIT_DOC_REGISTRY.map((d) => `${d.root}:${d.output}`).sort(),
    ).toEqual(
      [
        'base:README.md',
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

  it('registers the project README as a standalone base doc, not derived from a convention list', () => {
    const readme = INIT_DOC_REGISTRY.find((d) => d.output === 'README.md');
    expect(readme).toEqual({
      template: 'init/readme.md.hbs',
      root: 'base',
      output: 'README.md',
      canonical: true,
    });
    // it must NOT be a knowledge convention doc projected via asKnowledgeInitDoc
    expect(
      [...CANONICAL_CONVENTION_DOCS, ...USER_MANAGED_CONVENTION_DOCS].some(
        (d) => d.output === 'README.md',
      ),
    ).toBe(false);
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
      expect(INIT_DOC_REGISTRY).toContainEqual(asKnowledgeInitDoc(canonical, true));
    }
  });

  it('defines the canonical docs subset exactly as the README + canonical conventions (contract)', () => {
    expect(CANONICAL_INIT_DOCS.map((d) => d.output).sort()).toEqual(
      [
        'README.md',
        ...CANONICAL_CONVENTION_DOCS.map((d) => d.output),
      ].sort()
    );
    // Explicitly exclude these from being canonical
    const outputs = CANONICAL_INIT_DOCS.map((d) => d.output);
    expect(outputs).not.toContain('CONSTITUTION.md');
    expect(outputs).not.toContain('index.md');
    for (const userManaged of USER_MANAGED_CONVENTION_DOCS) {
      expect(outputs).not.toContain(userManaged.output);
    }
  });

  it('preserves user content only for the canonical Module README convention', () => {
    const preservingDocs = INIT_DOC_REGISTRY.filter((doc) => doc.preserveUserContent);

    expect(preservingDocs).toHaveLength(1);
    expect(preservingDocs[0]).toMatchObject({
      output: '_module-readme-conventions.md',
      canonical: true,
      preserveUserContent: true,
    });
  });

  it('keeps the preservation flag aligned with the complete eight-document registry', () => {
    expect(
      INIT_DOC_REGISTRY.map((doc) => [doc.root, doc.output, !!doc.preserveUserContent]),
    ).toEqual([
      ['base', 'README.md', false],
      ['base', 'CONSTITUTION.md', false],
      ['knowledge', '_conventions.md', false],
      ['knowledge', '_diagram-conventions.md', false],
      ['knowledge', '_glossary.md', false],
      ['base', 'index.md', false],
      ['knowledge', '_status-lifecycle.md', false],
      ['knowledge', '_module-readme-conventions.md', true],
    ]);
  });

  it('derives the user-managed convention docs instead of duplicating them', () => {
    // a doc added to USER_MANAGED_CONVENTION_DOCS but not the registry (or
    // vice versa) was exactly the drift class behind issue #48 — bind the lists
    // (the pinned 7-doc shape test independently guards the projection itself)
    for (const doc of USER_MANAGED_CONVENTION_DOCS) {
      expect(INIT_DOC_REGISTRY).toContainEqual(asKnowledgeInitDoc(doc, false));
    }
  });

  it('declares the index render context on exactly the index entry', () => {
    const withContext = INIT_DOC_REGISTRY.filter((d) => d.context === 'index');
    expect(withContext.map((d) => d.output)).toEqual(['index.md']);
  });
});
