import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node:fs with memfs. To keep the existing real-template render tests
// working, the factory copies the real src/templates tree into the memfs volume
// up front. Custom templates for the render-error branches are injected per test.
vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  const real = (await vi.importActual<typeof import('node:fs')>('node:fs'));
  const path = await import('node:path');

  const templatesRoot = path.resolve(__dirname, '../../../src/templates');
  const seed: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of real.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else seed[abs] = real.readFileSync(abs, 'utf-8');
    }
  };
  walk(templatesRoot);
  memfs.vol.fromJSON(seed, '/');

  return { ...memfs.fs, default: memfs.fs };
});

import { vol } from 'memfs';
import * as path from 'node:path';
import Handlebars from 'handlebars';
import {
  renderTemplate,
  registerPartial,
  registerHelper,
  registerPartialFromFile,
  resolveTemplatesDir,
} from '../../../src/lib/template.js';
import { TemplateError } from '../../../src/types/errors.js';

const TEMPLATES_ROOT = path.resolve(__dirname, '../../../src/templates');

/**
 * Render a raw Handlebars template body through the singleton Handlebars
 * instance the source module registers helpers onto. Triggering any exported
 * render first guarantees ensureInitialized() has registered the helpers.
 */
function renderInline(body: string, ctx: Record<string, unknown> = {}): string {
  return Handlebars.compile(body, { noEscape: true })(ctx);
}

beforeEach(() => {
  // The fs mock factory already seeded the real templates into memfs once.
  // Trigger helper registration via a real render before each test so inline
  // renders below exercise the source-registered helpers.
  renderTemplate('init/prospec.yaml.hbs', { project_name: 'init', agents: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveTemplatesDir', () => {
  it('decodes spaces in the install path instead of percent-encoding them', () => {
    const dir = resolveTemplatesDir('file:///Users/ben%20wu/proj/dist/lib/template.js');
    expect(dir).toContain('/Users/ben wu/');
    expect(dir).not.toContain('%20');
  });

  it('returns the sibling templates dir when it exists on disk', () => {
    // src/templates is seeded in memfs, so the first existsSync branch wins.
    const dir = resolveTemplatesDir(`file://${path.join(TEMPLATES_ROOT, '..', 'lib', 'template.js')}`);
    expect(dir).toBe(TEMPLATES_ROOT);
  });

  it('falls back to ../../src/templates when the sibling dir is absent', () => {
    // A module URL whose sibling templates dir does not exist in memfs forces
    // the fallback branch (resolveTemplatesDir L24).
    const moduleUrl = 'file:///ghost/dist/lib/template.js';
    const dir = resolveTemplatesDir(moduleUrl);
    expect(dir).toBe(path.resolve('/ghost/dist/lib', '..', '..', 'src', 'templates'));
    expect(dir).toBe('/ghost/src/templates');
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
    expect(() => renderTemplate('nonexistent/template.hbs', {})).toThrow(TemplateError);
  });

  it('interpolates context through conditional and iteration blocks of the template', () => {
    const result = renderTemplate('init/prospec.yaml.hbs', {
      project_name: 'test-proj',
      tech_stack: { language: 'typescript', package_manager: 'pnpm' },
      agents: ['claude', 'cursor'],
    });
    // {{#if tech_stack}} + nested {{#if}} render the language/package_manager lines.
    expect(result).toContain('language: typescript');
    expect(result).toContain('package_manager: pnpm');
    // {{#each agents}} emits one list item per agent.
    expect(result).toContain('- claude');
    expect(result).toContain('- cursor');
  });

  it('omits the tech_stack and agents blocks when those keys are absent (falsey {{#if}})', () => {
    const result = renderTemplate('init/prospec.yaml.hbs', {
      project_name: 'bare',
    });
    expect(result).toContain('name: bare');
    // The conditional blocks must not emit their headers when the keys are absent.
    expect(result).not.toContain('tech_stack:');
    expect(result).not.toMatch(/^agents:/m);
  });

  it('interpolates project_name into the constitution title and blockquote', () => {
    const result = renderTemplate('init/constitution.md.hbs', {
      project_name: 'acme-svc',
    });
    expect(result).toContain('# Project Constitution: acme-svc');
    expect(result).toContain('constraints for the **acme-svc** project');
  });

  it('carries the TEMPLATE_ERROR code on the thrown error for a missing template', () => {
    try {
      renderTemplate('does/not/exist.hbs', {});
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateError);
      expect((err as TemplateError).code).toBe('TEMPLATE_ERROR');
    }
  });

  it('registers builtin partials when rendering a skills/ template (language-policy partial resolves)', () => {
    // skills/ path triggers ensureBuiltinPartials(); seed a skills template that
    // includes the language-policy partial and assert the partial body appears.
    vol.fromJSON(
      { [path.join(TEMPLATES_ROOT, 'skills', '__uses_partial.hbs')]: 'HEAD\n{{> language-policy}}\nTAIL' },
      '/',
    );
    const out = renderTemplate('skills/__uses_partial.hbs', {});
    expect(out).toContain('HEAD');
    expect(out).toContain('TAIL');
    expect(out).toContain('Language Policy');
  });

  it('reuses the cached builtin partial registration instead of re-reading the source file (L89 early return)', () => {
    const policyPath = path.join(TEMPLATES_ROOT, 'skills', '_language-policy.hbs');
    const policyBody = vol.readFileSync(policyPath, 'utf-8') as string;

    vol.fromJSON(
      {
        [path.join(TEMPLATES_ROOT, 'skills', '__first.hbs')]: 'A{{> language-policy}}',
        [path.join(TEMPLATES_ROOT, 'skills', '__second.hbs')]: 'B{{> language-policy}}',
      },
      '/',
    );
    // Delete the source partial file so any RE-read by ensureBuiltinPartials
    // would throw a TemplateError. The L89 guard must short-circuit to the
    // already-registered partial; if the guard regressed, the renders below
    // would re-read the now-missing file and fail.
    vol.unlinkSync(policyPath);
    expect(vol.existsSync(policyPath)).toBe(false);

    try {
      // Both skills renders trigger ensureBuiltinPartials(); with the source
      // file gone they only succeed because the cached registration is reused.
      const first = renderTemplate('skills/__first.hbs', {});
      const second = renderTemplate('skills/__second.hbs', {});
      expect(first).toBe('A## Language Policy\n\nWrite generated documents in the language defined by the Constitution\'s Language Policy rule. Keep code, identifiers, technical terms, and git commit messages in English.');
      expect(second.startsWith('B')).toBe(true);
      expect(second).toContain('Language Policy');
    } finally {
      // Restore the source partial for subsequent tests in this file.
      vol.fromJSON({ [policyPath]: policyBody }, '/');
    }
  });

  it('wraps a runtime render error in TemplateError using err.message (Error branch of L131)', () => {
    registerHelper('boomTplError', () => {
      throw new Error('render-boom-error');
    });
    vol.fromJSON(
      { [path.join(TEMPLATES_ROOT, '__boom_error.hbs')]: 'X{{boomTplError}}Y' },
      '/',
    );
    try {
      renderTemplate('__boom_error.hbs', {});
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateError);
      // err.message is used because the thrown value is an Error instance.
      expect((err as TemplateError).message).toContain('render-boom-error');
    }
  });

  it('wraps a non-Error render throw using String(err) (else branch of L131)', () => {
    registerHelper('boomTplString', () => {
      throw 'render-boom-string';
    });
    vol.fromJSON(
      { [path.join(TEMPLATES_ROOT, '__boom_string.hbs')]: 'X{{boomTplString}}Y' },
      '/',
    );
    try {
      renderTemplate('__boom_string.hbs', {});
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateError);
      // String(err) of the thrown string is embedded in the message.
      expect((err as TemplateError).message).toContain('render-boom-string');
    }
  });
});

describe('built-in helpers', () => {
  it('eq returns true only for strictly equal operands', () => {
    expect(renderInline('{{#if (eq a b)}}YES{{else}}NO{{/if}}', { a: 1, b: 1 })).toBe('YES');
    expect(renderInline('{{#if (eq a b)}}YES{{else}}NO{{/if}}', { a: 1, b: 2 })).toBe('NO');
  });

  it('contains reports membership for arrays and false for non-arrays', () => {
    expect(renderInline('{{#if (contains arr v)}}IN{{else}}OUT{{/if}}', { arr: ['a', 'b'], v: 'a' })).toBe('IN');
    expect(renderInline('{{#if (contains arr v)}}IN{{else}}OUT{{/if}}', { arr: ['a', 'b'], v: 'z' })).toBe('OUT');
    // Non-array (undefined) → Array.isArray short-circuits to false (L42 both sides).
    expect(renderInline('{{#if (contains arr v)}}IN{{else}}OUT{{/if}}', { arr: undefined, v: 'z' })).toBe('OUT');
  });

  it('join uses the given string separator', () => {
    expect(renderInline('{{join arr "-"}}', { arr: ['a', 'b', 'c'] })).toBe('a-b-c');
  });

  it('join falls back to ", " when the separator is not a string (L49 cond-expr)', () => {
    expect(renderInline('{{join arr 5}}', { arr: ['x', 'y'] })).toBe('x, y');
  });

  it('join returns empty string for a non-array first argument (L49 else)', () => {
    expect(renderInline('{{join arr "-"}}', { arr: 'notarray' })).toBe('');
  });

  it('indent prefixes each line with the requested number of spaces', () => {
    expect(renderInline('{{indent text 4}}', { text: 'a\nb' })).toBe('    a\n    b');
  });

  it('indent defaults to 2 spaces when the count is not a number (L60 cond-expr)', () => {
    expect(renderInline('{{indent text "x"}}', { text: 'a\nb' })).toBe('  a\n  b');
  });

  it('indent returns empty string for non-string text (L59 if/then)', () => {
    expect(renderInline('{{indent text 4}}', { text: 123 })).toBe('');
  });
});

describe('registerPartial', () => {
  it('makes the partial body available to subsequent renders', () => {
    registerPartial('greetPartial', 'Hello {{name}}!');
    expect(renderInline('{{> greetPartial}}', { name: 'World' })).toBe('Hello World!');
  });
});

describe('registerHelper', () => {
  it('registers a custom helper that produces observable output', () => {
    registerHelper('shout', (str: unknown) => (typeof str === 'string' ? str.toUpperCase() : ''));
    expect(renderInline('{{shout v}}', { v: 'hi' })).toBe('HI');
    expect(renderInline('{{shout v}}', { v: 42 })).toBe('');
  });
});

describe('registerPartialFromFile', () => {
  it('registers a partial loaded from a real template file (L152 happy path)', () => {
    registerPartialFromFile('langPolicyFromFile', 'skills/_language-policy.hbs');
    const out = renderInline('{{> langPolicyFromFile}}', {});
    expect(out).toContain('Language Policy');
  });

  it('throws TemplateError when the source template file is missing', () => {
    expect(() => registerPartialFromFile('missingFile', 'no/such/file.hbs')).toThrow(TemplateError);
  });
});

describe('bundled templates integration', () => {
  it('reads template from BUNDLED_TEMPLATES memory map first', () => {
    import('../../../src/lib/bundled-templates.js').then((module) => {
      const dummyKey = 'test/dummy-bundled-template.hbs';
      module.BUNDLED_TEMPLATES[dummyKey] = 'BUNDLED CONTENT: {{name}}';

      const result = renderTemplate(dummyKey, { name: 'Prospec' });
      expect(result).toBe('BUNDLED CONTENT: Prospec');

      // Clean up
      delete module.BUNDLED_TEMPLATES[dummyKey];
    });
  });
});

