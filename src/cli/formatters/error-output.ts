import pc from 'picocolors';
import { ProspecError, TestGateError } from '../../types/errors.js';
import { sanitizeTerminal } from './sanitize.js';

/**
 * Highlight backtick-wrapped commands in suggestion text with cyan color.
 */
function highlightCommands(text: string): string {
  return text.replace(/`([^`]+)`/g, (_, cmd: string) => pc.cyan(`\`${cmd}\``));
}

/**
 * Format and output a ProspecError to stderr.
 * Sets process.exitCode = 1.
 *
 * Output format:
 *   ✗ [error message]
 *     → [suggestion with highlighted commands]
 */
export function formatProspecError(error: ProspecError): void {
  process.exitCode = 1;
  // message/suggestion may embed file-derived content (parse errors, report
  // details) — strip control chars before they reach the terminal.
  const msg = `${pc.red('✗')} ${sanitizeTerminal(error.message)}`;
  const suggestion = `  ${pc.dim('→')} ${highlightCommands(sanitizeTerminal(error.suggestion))}`;
  process.stderr.write(msg + '\n' + suggestion + '\n');
  // A tripped test breaker is a refusal that must also stop automated retries:
  // name the trigger and the observed count so the loop escalates, never re-runs.
  const report = error instanceof TestGateError ? error.circuitBreaker?.escalationReport : undefined;
  if (error instanceof TestGateError && error.circuitBreaker?.tripped && report) {
    const diagnostics = report.diagnostics ?? {};
    const count = typeof diagnostics.count === 'number' ? diagnostics.count : undefined;
    const threshold = typeof diagnostics.threshold === 'number' ? diagnostics.threshold : undefined;
    const lines = [
      `${pc.red('🚨 ESCALATE_TO_HUMAN')} — ${pc.yellow(sanitizeTerminal(report.type))}: ${sanitizeTerminal(report.message)}`,
    ];
    if (count !== undefined && threshold !== undefined) {
      lines.push(`   consecutive failed test attempts: ${count} / ${threshold}`);
    }
    for (const opt of report.tradeoffOptions) lines.push(`     • ${sanitizeTerminal(opt)}`);
    process.stderr.write(lines.join('\n') + '\n');
  }
}

/**
 * Format and output a generic (non-Prospec) error to stderr.
 * Sets process.exitCode = 1.
 */
export function formatGenericError(
  error: unknown,
  verbose = false,
): void {
  process.exitCode = 1;
  process.stderr.write(`${pc.red('✗')} An unexpected error occurred\n`);

  if (error instanceof Error) {
    process.stderr.write(
      `\n  ${pc.yellow(error.name)}: ${pc.dim(sanitizeTerminal(error.message))}\n`,
    );
    if (verbose && error.stack) {
      const stackLines = error.stack
        .split('\n')
        .slice(1)
        .map((line) => `  ${pc.dim(line.trim())}`)
        .join('\n');
      process.stderr.write(`\n${stackLines}\n`);
    }
  } else {
    process.stderr.write(`\n  ${pc.dim(sanitizeTerminal(String(error)))}\n`);
  }
}


/**
 * Unified error handler — dispatches to the appropriate formatter.
 */
export function handleError(error: unknown, verbose = false): void {
  if (error instanceof ProspecError) {
    formatProspecError(error);
  } else {
    formatGenericError(error, verbose);
  }
}
