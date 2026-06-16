import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { RawScanResult } from '../../services/raw-scan.service.js';

/**
 * Format the raw-scan refresh result for terminal output.
 */
export function formatKnowledgeRefreshOutput(
  result: RawScanResult,
  logLevel: LogLevel = 'normal',
): void {
  if (logLevel === 'quiet') return;

  const lines: string[] = [];

  lines.push(
    `Scanned ${pc.yellow(result.totalFiles.toString())} files (depth: ${result.scanDepth})`,
  );

  if (result.dryRun) {
    lines.push('');
    lines.push(`${pc.yellow('⚠')} Dry-run mode: no files were modified`);
  } else if (result.outputFile) {
    lines.push('');
    lines.push(`${pc.green('✓')} Refreshed ${result.outputFile}`);
    lines.push(
      `${pc.dim('·')} Curated files (module-map.yaml, _index.md, _conventions.md) left untouched`,
    );
  }

  lines.push('');
  lines.push(
    `${pc.dim('→')} Run ${pc.cyan('`/prospec-knowledge-generate`')} to (re)generate module knowledge from the fresh scan`,
  );

  process.stdout.write(lines.join('\n') + '\n');
}
