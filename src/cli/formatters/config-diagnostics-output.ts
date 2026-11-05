import pc from 'picocolors';
import type { ConfigDiagnostic } from '../../types/config.js';
import { sanitizeTerminal } from './sanitize.js';

export function formatConfigDiagnostics(diagnostics: readonly ConfigDiagnostic[]): void {
  if (diagnostics.length === 0) return;
  for (const diagnostic of diagnostics) {
    const field = sanitizeTerminal(diagnostic.path.join('.'));
    const suggestion = diagnostic.suggestion === undefined ? ''
      : ` Did you mean ${sanitizeTerminal([...diagnostic.path.slice(0, -1), diagnostic.suggestion].join('.'))}?`;
    process.stderr.write(`⚠ Unknown config field ${field} (not declared in Prospec schema).${suggestion}\n`);
  }
  process.stderr.write(`  ${pc.dim('→')} Rename or remove these fields in .prospec.yaml; ${pc.cyan('prospec upgrade')} also removes unknown nested fields.\n`);
}
