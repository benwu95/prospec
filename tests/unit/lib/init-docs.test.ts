/**
 * Unit tests: lib/init-docs — the single source `init.service` and
 * `upgrade.service` both render curated docs from, so greenfield init and
 * upgrade back-fill cannot drift apart. Covers context construction (baseline
 * index, language-policy-first rules, agent/language defaults) and location
 * resolution (base vs knowledge root, relocated knowledge.base_path).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  buildInitDocContexts,
  renderInitDoc,
  resolveInitDocLocation,
} from '../../../src/lib/init-docs.js';
import type { ProspecConfig } from '../../../src/types/config.js';
import type { InitDoc } from '../../../src/types/conventions.js';

vi.mock('../../../src/lib/template.js', () => ({
  renderTemplate: vi.fn().mockReturnValue('# rendered\n'),
  registerPartial: vi.fn(),
  registerPartialFromFile: vi.fn(),
  registerHelper: vi.fn(),
}));
import { renderTemplate } from '../../../src/lib/template.js';

const baseConfig = (over: Partial<ProspecConfig> = {}): ProspecConfig =>
  ({
    project: { name: 'demo' },
    paths: { base_dir: 'prospec' },
    knowledge: { base_path: 'prospec/ai-knowledge' },
    artifact_language: 'Traditional Chinese (Taiwan)',
    ...over,
  }) as ProspecConfig;

describe('buildInitDocContexts', () => {
  it('builds the standard context from config with the Language Policy rule first', () => {
    const { standard } = buildInitDocContexts(
      baseConfig({ tech_stack: { language: 'python' } }),
      '/p',
    );
    expect(standard.project_name).toBe('demo');
    expect(standard.base_dir).toBe('prospec');
    expect(standard.artifact_language).toBe('Traditional Chinese (Taiwan)');
    const rules = standard.example_rules as Array<{ name: string }>;
    expect(rules[0]?.name).toBe('Language Policy');
    expect(rules.length).toBeGreaterThan(1); // + stack-appropriate rules
  });

  it('defaults agents to [] and resolves a blank artifact_language to English', () => {
    const { standard } = buildInitDocContexts(
      baseConfig({ agents: undefined, artifact_language: '' }),
      '/p',
    );
    expect(standard.agents).toEqual([]);
    expect(standard.artifact_language).toBe('English');
  });

  it('builds a baseline index context — relative knowledge path, no module table', () => {
    const { index } = buildInitDocContexts(baseConfig(), '/p');
    expect(index.base_dir).toBe('prospec');
    expect(index.knowledge_base_path).toBe('prospec/ai-knowledge');
    expect(index.modules_table).toBeUndefined(); // baseline — the skill enriches it
    expect(index.core_conventions).toBeDefined();
  });
});

describe('resolveInitDocLocation', () => {
  const baseDoc: InitDoc = { template: 'init/readme.md.hbs', root: 'base', output: 'README.md' };
  const kbDoc: InitDoc = { template: 'init/glossary.md.hbs', root: 'knowledge', output: '_glossary.md' };

  it('resolves a base doc under paths.base_dir', () => {
    const loc = resolveInitDocLocation(baseDoc, baseConfig(), '/p');
    expect(loc.absPath).toBe('/p/prospec/README.md');
    expect(loc.label).toBe('prospec/README.md');
  });

  it('resolves a knowledge doc under the default knowledge base', () => {
    const loc = resolveInitDocLocation(kbDoc, baseConfig(), '/p');
    expect(loc.absPath).toBe('/p/prospec/ai-knowledge/_glossary.md');
    expect(loc.label).toBe('prospec/ai-knowledge/_glossary.md');
  });

  it('honors a relocated knowledge.base_path (checked/created at the ACTUAL location)', () => {
    const loc = resolveInitDocLocation(
      kbDoc,
      baseConfig({ knowledge: { base_path: 'docs/kb' } }),
      '/p',
    );
    expect(loc.absPath).toBe('/p/docs/kb/_glossary.md');
    expect(loc.label).toBe('docs/kb/_glossary.md');
  });
});

describe('renderInitDoc', () => {
  it('renders a standard doc with the standard context', () => {
    const contexts = buildInitDocContexts(baseConfig(), '/p');
    renderInitDoc({ template: 'init/readme.md.hbs', root: 'base', output: 'README.md' }, contexts);
    expect(renderTemplate).toHaveBeenCalledWith('init/readme.md.hbs', contexts.standard);
  });

  it('renders the index doc with the index context (keyed on doc.context)', () => {
    const contexts = buildInitDocContexts(baseConfig(), '/p');
    renderInitDoc(
      { template: 'knowledge/index.md.hbs', root: 'base', output: 'index.md', context: 'index' },
      contexts,
    );
    expect(renderTemplate).toHaveBeenCalledWith('knowledge/index.md.hbs', contexts.index);
  });
});
