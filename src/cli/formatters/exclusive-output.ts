import pc from 'picocolors';
import type { ExclusiveResult } from '../../services/exclusive.service.js';
import { TEST_QUEUE_BUSY_EXIT_CODE } from '../../types/test-queue.js';
import { sanitizeTerminal } from './sanitize.js';
import { exitCodeForSignal, testQueueBusyLines } from './test-queue-output.js';

/**
 * Output of `prospec exclusive` (REQ-CLI-065). The wrapped command owns stdout: every
 * line this command prints itself goes to stderr, and a command that simply exited is
 * reported by its exit code alone.
 */
export function formatExclusiveOutput(result: ExclusiveResult): number {
  if (result.kind === 'busy') {
    for (const line of testQueueBusyLines(result.busy)) console.error(line);
    return TEST_QUEUE_BUSY_EXIT_CODE;
  }
  if (result.warning !== undefined) console.error(`${pc.yellow('⚠')} ${sanitizeTerminal(result.warning)}`);
  if (result.exitCode !== null) return result.exitCode;
  console.error(exclusiveFailureLine(result));
  return result.interruptedBy === undefined ? 1 : exitCodeForSignal(result.interruptedBy);
}

/** The line for a run that produced no exit code: the command, then why it ended. */
export function exclusiveFailureLine(result: Extract<ExclusiveResult, { kind: 'ran' }>): string {
  return `${pc.red('✗')} \`${sanitizeTerminal(result.command)}\` ${exclusiveRunCause(result)}`;
}

/** Why a run that produced no exit code ended, as a predicate after the command's name. */
export function exclusiveRunCause(result: Extract<ExclusiveResult, { kind: 'ran' }>): string {
  return result.timedOut ? `timed out after ${result.timeoutMs} ms (tech_stack.test_timeout_ms sets the cap)`
    : result.interruptedBy !== undefined ? `was interrupted by ${sanitizeTerminal(result.interruptedBy)}`
    : result.queueAbort === 'not-started' ? 'was not started: the test queue turn was lost — re-run'
    : result.queueAbort === 'lost' ? 'was killed: the test queue turn was lost while it ran — re-run'
    : result.signal !== undefined ? `was killed by ${sanitizeTerminal(result.signal)}`
    : `could not be run: ${sanitizeTerminal(result.error ?? 'unknown error')}`;
}
