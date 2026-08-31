import type { ConfigExampleResult } from '../../services/config-example.service.js';
import { sanitizeTerminal } from './sanitize.js';

/**
 * Format the ConfigExampleResult for terminal output.
 * Writes the annotated .prospec.yaml reference directly to stdout.
 */
export function formatConfigExampleOutput(result: ConfigExampleResult): void {
  process.stdout.write(sanitizeTerminal(result.content));
}

