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
      const context = doc.context === 'index' ? indexContext : TEMPLATE_CONTEXT;
      const rendered = renderTemplate(doc.template, context);
      expect(rendered.length).toBeGreaterThan(0);
    },
  );

  it('the project README renders the What-is-Prospec summary and the repo link (issue #50)', () => {
    const readme = INIT_DOC_REGISTRY.find((d) => d.output === 'README.md');
    expect(readme).toBeDefined();
    const rendered = renderTemplate(readme!.template, TEMPLATE_CONTEXT);
    expect(rendered).toContain('What is Prospec?');
    expect(rendered).toContain('Skills');
    expect(rendered).toContain('AI Knowledge');
    expect(rendered).toContain('CLI');
    expect(rendered).toContain('https://github.com/benwu95/prospec');
    // the {{base_dir}} placeholder is populated from the standard init context
    expect(rendered).toContain('prospec/');
  });

  it('the index entry renders with its declared context — context-derived content present', () => {
    // Handlebars is non-strict: a wrong context renders empty holes and a bare
    // non-empty assertion stays green. Pin a context-derived marker instead.
    const indexDoc = INIT_DOC_REGISTRY.find((d) => d.context === 'index');
    expect(indexDoc).toBeDefined();
    const rendered = renderTemplate(indexDoc!.template, indexContext);
    expect(rendered).toContain('prospec/ai-knowledge');
  });
});

describe('init entry config carries the cli-first probe floor (review C4, issue #107)', () => {
  it('buildInitDocContexts.standard renders entry.md.hbs with a real minimum_cli_version', async () => {
    const { buildInitDocContexts } = await import('../../src/lib/init-docs.js');
    const { MINIMUM_CLI_VERSION } = await import('../../src/types/version.js');
    const config = {
      version: '0.0.0',
      project: { name: 'contract-test', language: 'English' },
      agents: ['claude'],
    } as never;
    const contexts = buildInitDocContexts(config, process.cwd());
    const rendered = renderTemplate('agent-configs/entry.md.hbs', {
      ...contexts.standard,
      skills: [],
      constitution_path: 'prospec/CONSTITUTION.md',
      knowledge_base_path: 'prospec/ai-knowledge',
    });
    // The exact regression: a missing key renders an empty hole `version ≥ )`.
    expect(rendered).toContain(`version ≥ ${MINIMUM_CLI_VERSION}`);
    expect(rendered).not.toContain('version ≥ )');
  });
});
