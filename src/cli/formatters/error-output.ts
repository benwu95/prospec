import type { EscalationDecision, EscalationFailureDetails } from '../../types/cascade.js';
import type { EscalationHistory } from '../../types/change.js';
import pc from 'picocolors';
import { AbandonError, EscalationError, ProspecError, TestGateError } from '../../types/errors.js';
import { sanitizeTerminal } from './sanitize.js';

/** Project the service's decision without deriving exits or retry eligibility. */
export function formatEscalationDecision(decision: EscalationDecision): string[] {
  return [
    `ESCALATE_TO_HUMAN — ${sanitizeTerminal(decision.trigger)} · lifetime=${decision.ordinal} · event=${sanitizeTerminal(decision.event_id ?? 'unpersisted')} · station=${sanitizeTerminal(decision.station)}`,
    ...decision.exits.map(exit => `  • ${sanitizeTerminal(exit.id)}${exit.id === decision.recommended ? ' (recommended)' : ''}: ${sanitizeTerminal(exit.description)}`),
  ];
}

export function formatEscalationHistoryLines(history?: EscalationHistory): string[] {
  if (!history || (history.events.length === 0 && history.grants.length === 0)) return [];
  return [
    `Escalation history: ${history.events.length} event(s), ${history.grants.length} override(s), ${history.completeness}`,
    ...history.grants.map(grant => `  override: ${sanitizeTerminal(grant.reason)} · event=${sanitizeTerminal(grant.event_id ?? 'legacy-unbound')} · station=${sanitizeTerminal(grant.station)} · ${grant.legacy ? 'legacy, not authorization' : grant.consumed_by ? `consumed by ${sanitizeTerminal(grant.consumed_by)}` : grant.expired ? 'expired unused' : 'available for one attempt'}`),
  ];
}

function escalationOf(error: unknown): EscalationFailureDetails | undefined {
  return error instanceof EscalationError ? error.details : error instanceof TestGateError ? error.escalation : undefined;
}

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
  if (error instanceof AbandonError) {
    for (const [key, value] of Object.entries(error.details)) {
      process.stderr.write(`  ${sanitizeTerminal(key)}: ${sanitizeTerminal(JSON.stringify(value))}\n`);
    }
  }
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
    for (const opt of report.decision ? [] : report.tradeoffOptions) lines.push(`     • ${sanitizeTerminal(opt)}`);
    process.stderr.write(lines.join('\n') + '\n');
  }
  const details = escalationOf(error);
  const decision = details?.decision ?? report?.decision;
  const lines = [
    ...(decision ? formatEscalationDecision(decision) : []),
    ...formatEscalationHistoryLines(details?.history),
    ...(details ? [`Persistence: ${Object.entries(details.persistence).map(([key, value]) => `${key}=${value}`).join(' · ')}`] : []),
    ...(details?.observed_escalation ? [`Observed escalation: ${details.observed_escalation.trigger} · persisted=false · event=null · ordinal=null`] : []),
  ];
  if (lines.length > 0) process.stderr.write(lines.join('\n') + '\n');
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
export function handleError(error: unknown, verbose = false, json = false): void {
  if (json) {
    process.exitCode = 1;
    process.stderr.write(JSON.stringify({ error: {
      code: error instanceof ProspecError ? error.code : 'UNEXPECTED_ERROR',
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof ProspecError ? { suggestion: error.suggestion } : {}),
      ...(error instanceof AbandonError ? { details: error.details } : {}),
      ...(escalationOf(error) ? { escalation: escalationOf(error) } : {}),
      ...(error instanceof TestGateError ? { circuitBreaker: error.circuitBreaker, warningRecorded: error.warningRecorded } : {}),
      ...(error instanceof Error && error.cause !== undefined ? { cause: error.cause instanceof Error ? error.cause.message : String(error.cause) } : {}),
    } }) + '\n');
    return;
  }
  if (error instanceof ProspecError) {
    formatProspecError(error);
  } else {
    formatGenericError(error, verbose);
  }
}
