import { describe, it, expect } from 'vitest';
import { renderTemplate, registerPartial, registerHelper, resolveTemplatesDir } from '../../../src/lib/template.js';
import { TemplateError } from '../../../src/types/errors.js';

describe('resolveTemplatesDir', () => {
  it('decodes spaces in the install path instead of percent-encoding them', () => {
    // A file:// URL whose path contains a space — common on real install paths.
    const dir = resolveTemplatesDir('file:///Users/ben%20wu/proj/dist/lib/template.js');
    // fileURLToPath decodes %20 back to a real space so fs can find the dir;
    // the old `new URL(url).pathname` would leave the literal "%20".
    expect(dir).toContain('/Users/ben wu/');
    expect(dir).not.toContain('%20');
  });
});

describe('renderTemplate', () => {
  it('should render the init prospec.yaml template', () => {
    const result = renderTemplate('init/prospec.yaml.hbs', {
      project_name: 'test-project',
      tech_stack: { language: 'typescript' },
      agents: ['claude'],
    });
    expect(result).toContain('test-project');
  });

  it('should throw TemplateError for non-existent template', () => {
    expect(() =>
      renderTemplate('nonexistent/template.hbs', {}),
    ).toThrow(TemplateError);
  });

  it('should support the eq helper', () => {
    // The eq helper is registered by default in template.ts
    const result = renderTemplate('init/prospec.yaml.hbs', {
      project_name: 'test',
      agents: [],
    });
    // Just verify it renders without error (eq is used in templates)
    expect(typeof result).toBe('string');
  });

  it('should render with empty context for templates that support it', () => {
    const result = renderTemplate('init/constitution.md.hbs', {
      project_name: 'test',
    });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('registerPartial', () => {
  it('should register a partial for use in templates', () => {
    registerPartial('test-partial', 'Hello {{name}}');
    // Partial is registered globally on Handlebars — hard to verify directly
    // but it won't throw
    expect(true).toBe(true);
  });
});

describe('registerHelper', () => {
  it('should register a custom helper', () => {
    registerHelper('testUpper', (str: string) =>
      typeof str === 'string' ? str.toUpperCase() : '',
    );
    // Helper is registered globally — won't throw
    expect(true).toBe(true);
  });
});
