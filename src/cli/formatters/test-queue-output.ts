import { constants } from 'node:os';
import pc from 'picocolors';
import type { TestQueueBusy, TestQueueHolderInfo, TestQueueWaitInfo } from '../../types/test-queue.js';
import { sanitizeTerminal } from './sanitize.js';

/**
 * Queue outcomes as both entries print them (REQ-CLI-065): `check --record-tests` and
 * `prospec exclusive` render a wait and a busy result through these lines, so the two
 * cannot drift apart. Every string that comes from the queue state — written by another
 * process, possibly another version — passes `sanitizeTerminal()`.
 */

const holderLine = (holder: TestQueueHolderInfo): string =>
  `${sanitizeTerminal(holder.label)} (worktree ${sanitizeTerminal(holder.worktree)}, host ${sanitizeTerminal(holder.host)}, ` +
  `since ${new Date(holder.granted_at_ms).toISOString()})`;

/** One line for the moment an entry starts to wait. */
export function testQueueWaitLine(info: TestQueueWaitInfo): string {
  const holder = info.holder === undefined ? '' : `; holding the turn: ${holderLine(info.holder)}`;
  return `${pc.dim('…')} waiting for the test queue: ticket #${info.seq}, ${info.ahead} ahead${holder}`;
}

/** The block for an entry that gave up waiting. Nothing was run. */
export function testQueueBusyLines(busy: TestQueueBusy): string[] {
  const queue = sanitizeTerminal(busy.queue_dir);
  const lines = [`${pc.yellow('●')} Test queue busy — nothing was run: ticket #${busy.seq}, ${busy.ahead} ahead`];
  if (busy.holder !== undefined) {
    lines.push(`  holding the turn: ${holderLine(busy.holder)}`);
    if (busy.holder.other_host) {
      lines.push(`  that ticket was written by another host, so its turn is never taken here — once no test run is in progress there, remove ${queue}`);
    } else if (busy.holder.holder_gone) {
      lines.push(`  its process is no longer running; the turn is held by what it left running until that ends or its deadline passes (queue: ${queue})`);
    }
  }
  lines.push(
    `  ${pc.cyan('→')} Re-run the same command within ${Math.floor(busy.lease_ms / 1000)} s to keep ticket #${busy.seq}; ` +
      'do not run the test command directly instead',
  );
  return lines;
}

/** Shell convention for a run ended by a signal: 128 plus the signal's number. */
export function exitCodeForSignal(signal: string): number {
  const number = (constants.signals as Record<string, number | undefined>)[signal];
  return number === undefined ? 1 : 128 + number;
}
