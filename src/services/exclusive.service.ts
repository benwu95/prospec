import { realpathSync } from 'node:fs';
import { readConfig, resolveTestQueueLeaseMs, resolveTestQueueWaitMs, resolveTestTimeoutMs } from '../lib/config.js';
import { withTestQueue, type TestQueueWaitInfo } from '../lib/test-queue.js';
import { runArgv } from '../lib/test-runner.js';
import { ExclusiveCommandMissing } from '../types/errors.js';
import type { TestQueueBusy } from '../types/test-queue.js';

/**
 * Run one command under the repository's test queue turn (REQ-SERVICES-132): the entry
 * for a full-suite run that does not go through `check --record-tests`. It records
 * nothing — it only takes the turn, runs the argv without a shell and reports how it ended.
 */

export interface ExclusiveOptions {
  cwd?: string;
  /** The command and its arguments, exactly as given after `--`. */
  argv: readonly string[];
  /** Called once when the run has to wait for the queue. */
  onQueueWait?: (info: TestQueueWaitInfo) => void;
}

export type ExclusiveResult =
  | {
      kind: 'ran';
      command: string;
      /** Null when the command produced none: timeout, signal, interruption, spawn failure or a lost turn. */
      exitCode: number | null;
      timedOut: boolean;
      timeoutMs: number;
      signal?: string;
      interruptedBy?: string;
      error?: string;
      queueAbort?: 'not-started' | 'lost';
      warning?: string;
    }
  | { kind: 'busy'; command: string; busy: TestQueueBusy };

export async function execute(options: ExclusiveOptions): Promise<ExclusiveResult> {
  const cwd = options.cwd ?? process.cwd();
  const argv = [...options.argv];
  if (argv.length === 0) throw new ExclusiveCommandMissing();
  const config = await readConfig(cwd);
  const timeoutMs = resolveTestTimeoutMs(config);
  const projectRoot = realpathSync(cwd);
  const command = argv.join(' ');

  const outcome = await withTestQueue(
    {
      cwd,
      key: [projectRoot, 'exclusive', ...argv].join('\u0000'),
      label: `exclusive ${command}`,
      worktree: projectRoot,
      waitMs: resolveTestQueueWaitMs(config),
      leaseMs: resolveTestQueueLeaseMs(config),
      ...(options.onQueueWait === undefined ? {} : { onWait: options.onQueueWait }),
    },
    (session) => session.run(timeoutMs, (hooks) => runArgv(cwd, argv, timeoutMs, undefined, hooks)),
  );
  if (outcome.kind === 'busy') return { kind: 'busy', command, busy: outcome.busy };
  const run = outcome.value;
  return {
    kind: 'ran',
    command,
    exitCode: run.exit_code,
    timedOut: run.timed_out,
    timeoutMs: run.timeout_ms,
    ...(run.signal === undefined ? {} : { signal: run.signal }),
    ...(run.interrupted_by === undefined ? {} : { interruptedBy: run.interrupted_by }),
    ...(run.error === undefined ? {} : { error: run.error }),
    ...(run.queue_abort === undefined ? {} : { queueAbort: run.queue_abort }),
    ...(outcome.warning === undefined ? {} : { warning: outcome.warning }),
  };
}
