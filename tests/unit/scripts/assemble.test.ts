import { describe, it, expect } from 'vitest';
import {
  assembleProspec,
  assembleAll,
  type CorpusTask,
} from '../../../scripts/measure/assemble.js';

const KB = 'prospec/ai-knowledge';

const task: CorpusTask = {
  id: 'sample-task',
  title: 'Sample task',
  modules: ['lib'],
  description: 'do something with lib',
};

const contents = new Map<string, string>([
  [`${KB}/_conventions.md`, 'conventions body'],
  [`${KB}/_index.md`, 'index body'],
  [`${KB}/_glossary.md`, 'glossary body'],
  [`${KB}/modules/lib/README.md`, 'lib readme body'],
]);

describe('assembleProspec glossary variant (REQ-MEASURE-009)', () => {
  it('excludes _glossary.md by default — existing behavior unchanged', () => {
    const context = assembleProspec(contents, task);
    expect(context).not.toContain('_glossary.md');
    expect(context).toContain('_conventions.md');
    expect(context).toContain('_index.md');
  });

  it('includes _glossary.md at the stable-segment tail when enabled', () => {
    const context = assembleProspec(contents, task, { includeGlossary: true });
    const glossaryAt = context.indexOf('_glossary.md');
    expect(glossaryAt).toBeGreaterThan(context.indexOf('_conventions.md'));
    expect(glossaryAt).toBeLessThan(context.indexOf('_index.md'));
    expect(context).toContain('glossary body');
  });

  it('differs from the default assembly ONLY by the glossary section', () => {
    const without = assembleProspec(contents, task);
    const withGlossary = assembleProspec(contents, task, { includeGlossary: true });
    expect(withGlossary).not.toBe(without);
    expect(withGlossary.replace(`=== ${KB}/_glossary.md ===\nglossary body\n\n`, '')).toBe(without);
  });

  it('assembleAll forwards the option to the prospec strategy only', () => {
    const withOption = assembleAll(contents, task, 'FULLDUMP', { includeGlossary: true });
    const withoutOption = assembleAll(contents, task, 'FULLDUMP');
    expect(withOption.prospec).toContain('_glossary.md');
    expect(withoutOption.prospec).not.toContain('_glossary.md');
    // the two baselines are byte-identical regardless of the option
    expect(withOption['full-dump']).toBe(withoutOption['full-dump']);
    expect(withOption['naive-rag']).toBe(withoutOption['naive-rag']);
  });

  it('throws when glossary is requested but missing from the snapshot', () => {
    const withoutGlossaryFile = new Map(contents);
    withoutGlossaryFile.delete(`${KB}/_glossary.md`);
    expect(() => assembleProspec(withoutGlossaryFile, task, { includeGlossary: true })).toThrow(
      /_glossary\.md/,
    );
  });
});
