import { readTemplateSource } from '../lib/template.js';

export interface PrintTemplateOptions {
  templatePath: string;
}

export interface PrintTemplateResult {
  content: string;
}

/**
 * Execute the print-template service.
 * Retrieves the raw template content by path from the bundled templates or disk fallback.
 */
export async function execute(
  options: PrintTemplateOptions,
): Promise<PrintTemplateResult> {
  const content = readTemplateSource(options.templatePath);
  return { content };
}
