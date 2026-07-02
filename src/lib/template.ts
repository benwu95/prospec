import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import { TemplateError } from '../types/errors.js';

// Singleton Handlebars instance with helpers and partials registered
let initialized = false;

/**
 * Resolve the templates directory relative to a module URL.
 *
 * Uses `fileURLToPath` rather than `new URL(url).pathname`: the latter returns
 * a percent-encoded path (a space becomes `%20`) and, on Windows, a leading
 * `/C:/` drive prefix — both make `fs.existsSync` miss and break every render
 * when the install path contains a space. Exported for unit testing.
 */
export function resolveTemplatesDir(moduleUrl: string): string {
  const currentDir = path.dirname(fileURLToPath(moduleUrl));
  // From dist/lib/ or src/lib/ → src/templates/
  const srcTemplates = path.resolve(currentDir, '..', 'templates');
  if (fs.existsSync(srcTemplates)) return srcTemplates;
  // Fallback: from dist/lib/ → ../../src/templates/
  return path.resolve(currentDir, '..', '..', 'src', 'templates');
}

function getTemplatesDir(): string {
  return resolveTemplatesDir(import.meta.url);
}

/**
 * Register built-in helpers for Prospec templates.
 */
function registerHelpers(): void {
  // {{eq a b}} — equality check
  Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);

  // {{contains array value}} — check if array contains value
  Handlebars.registerHelper(
    'contains',
    (arr: unknown[] | undefined, value: unknown) =>
      Array.isArray(arr) && arr.includes(value),
  );

  // {{join array separator}} — join array with separator
  Handlebars.registerHelper(
    'join',
    (arr: unknown[] | undefined, sep: string) =>
      Array.isArray(arr) ? arr.join(typeof sep === 'string' ? sep : ', ') : '',
  );

  // {{isoDate}} — current ISO 8601 date string
  Handlebars.registerHelper('isoDate', () => new Date().toISOString());

  // {{indent text spaces}} — indent each line
  Handlebars.registerHelper(
    'indent',
    (text: string, spaces: number) => {
      if (typeof text !== 'string') return '';
      const pad = ' '.repeat(typeof spaces === 'number' ? spaces : 2);
      return text
        .split('\n')
        .map((line) => pad + line)
        .join('\n');
    },
  );
}

/**
 * Read a template source file or throw a TemplateError.
 */
function readTemplateSource(templatePath: string): string {
  const fullPath = path.join(getTemplatesDir(), templatePath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    throw new TemplateError(templatePath, 'Template file not found');
  }
}

let builtinPartialsRegistered = false;

/**
 * Register prospec-owned partials shared across skill and knowledge templates.
 * Lazy — registered on first render, so commands that never render templates
 * stay decoupled from these files.
 */
function ensureBuiltinPartials(): void {
  if (builtinPartialsRegistered) return;
  Handlebars.registerPartial(
    'language-policy',
    readTemplateSource('skills/_language-policy.hbs'),
  );
  Handlebars.registerPartial(
    'knowledge-loading-rules',
    readTemplateSource('skills/_knowledge-loading-rules.hbs'),
  );
  Handlebars.registerPartial(
    'index-auto-block',
    readTemplateSource('knowledge/_index-auto-block.hbs'),
  );
  builtinPartialsRegistered = true;
}

/**
 * Ensure helpers are registered (idempotent).
 */
function ensureInitialized(): void {
  if (initialized) return;
  registerHelpers();
  initialized = true;
}

/**
 * Render a template by name with the given context.
 *
 * @param templatePath - Relative path from templates dir (e.g., 'init/prospec.yaml.hbs')
 * @param context - Data to pass to the template
 * @returns Rendered string
 * @throws TemplateError if template not found or rendering fails
 */
export function renderTemplate(
  templatePath: string,
  context: Record<string, unknown>,
): string {
  ensureInitialized();
  ensureBuiltinPartials();

  const source = readTemplateSource(templatePath);

  try {
    const compiled = Handlebars.compile(source, { noEscape: true });
    return compiled(context);
  } catch (err) {
    throw new TemplateError(
      templatePath,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Register a partial template by name.
 * Partials are available in all templates as {{> partialName}}.
 */
export function registerPartial(name: string, content: string): void {
  ensureInitialized();
  Handlebars.registerPartial(name, content);
}

/**
 * Register a partial from a template file.
 */
export function registerPartialFromFile(
  name: string,
  templatePath: string,
): void {
  registerPartial(name, readTemplateSource(templatePath));
}

/**
 * Register a custom Handlebars helper.
 */
export function registerHelper(
  name: string,
  fn: Handlebars.HelperDelegate,
): void {
  ensureInitialized();
  Handlebars.registerHelper(name, fn);
}
