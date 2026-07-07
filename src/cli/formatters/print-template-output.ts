import type { PrintTemplateResult } from '../../services/print-template.service.js';

/**
 * Format the PrintTemplateResult for terminal output.
 * Writes the raw template content directly to stdout.
 *
 * @param result - The print-template service result
 */
export function formatPrintTemplateOutput(result: PrintTemplateResult): void {
  process.stdout.write(result.content);
}
