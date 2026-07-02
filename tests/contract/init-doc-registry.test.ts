/**
 * Contract: every INIT_DOC_REGISTRY entry names a template that actually
 * renders (issue #48). A registry entry whose template path drifts from the
 * real `.hbs` inventory would make `prospec init` (create) and the
 * /prospec-upgrade skill (diff/create from the reported template) fail — a
 * typo must surface here, not in a user's project.
 *
 * Uses the real renderTemplate() — no mocks (contract-layer rule).
 */
import { describe, it, expect } from 'vitest';
import { INIT_DOC_REGISTRY } from '../../src/types/conventions.js';
import { renderTemplate } from '../../src/lib/template.js';
import { buildIndexTemplateContext } from '../../src/lib/index-template.js';
import { filterConventions } from '../../src/lib/scanner.js';
import { ALL_INITIAL_CONVENTION_DOCS } from '../../src/types/conventions.js';

const TEMPLATE_CONTEXT = {
  project_name: 'contract-test',
  tech_stack: { language: 'typescript' },
  agents: ['claude'],
  base_dir: 'prospec',
  artifact_language: 'English',
  example_rules: [],
};

describe('INIT_DOC_REGISTRY templates render (issue #48)', () => {
  const { core, demand } = filterConventions(ALL_INITIAL_CONVENTION_DOCS);
  const indexContext = buildIndexTemplateContext({
    projectName: 'contract-test',
    baseDir: 'prospec',
    knowledgeBasePath: 'prospec/ai-knowledge',
    coreConventions: core,
    demandConventions: demand,
  });

  it.each(INIT_DOC_REGISTRY.map((doc) => [doc.template, doc]))(
    '%s renders to non-empty output',
    (_name, doc) => {
      const context =
        doc.template === 'knowledge/index.md.hbs' ? indexContext : TEMPLATE_CONTEXT;
      const rendered = renderTemplate(doc.template, context);
      expect(rendered.length).toBeGreaterThan(0);
    },
  );
});
