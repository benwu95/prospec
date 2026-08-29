import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CHANGE_STATUSES,
  forbiddenArtifacts,
  GATE_OWNED_STATUSES,
  isStatusBefore,
  type ChangeStatus,
} from '../types/change.js';
import { InvalidTransitionError, PrerequisiteError } from '../types/errors.js';
import { readChangeMetadata, writeChangeMetadataDoc } from '../lib/change-metadata.js';
import { resolveChange } from './change-resolver.js';
import { execute as reportChangeProgress } from './change-progress.service.js';

// Re-exported from their canonical home in `types/change` so a command's
// registration can import the accepted `<to>` values without loading this
// service (and its transitive deps); consumers/tests keep their import path.
export { GATE_OWNED_STATUSES, STATION_SETTABLE_STATUSES } from '../types/change.js';

export interface ChangeStatusOptions {
  /** Explicit change name; resolved interactively when omitted. */
  change?: string;
  cwd?: string;
  quiet?: boolean;
  /** The target lifecycle status. */
  to: ChangeStatus;
}

export interface ChangeStatusResult {
  changeName: string;
  from: ChangeStatus;
  to: ChangeStatus;
  /** false when the change was already at the target (idempotent no-op). */
  changed: boolean;
}

/**
 * `prospec change status <to>` — forward-only lifecycle transition.
 *
 * Re-running is idempotent (already at target → no-op); a backward or invalid
 * jump throws `InvalidTransitionError` listing the legal forward targets, and
 * the file is left untouched. The lifecycle order is the executable copy in
 * `types/change.ts` (`CHANGE_STATUSES` + `isStatusBefore`).
 */
export async function execute(options: ChangeStatusOptions): Promise<ChangeStatusResult> {
  const cwd = options.cwd ?? process.cwd();
  const changeName = await resolveChange(
    cwd,
    options.change,
    options.quiet,
    'Which change should transition status?',
  );

  if (GATE_OWNED_STATUSES.includes(options.to)) {
    throw new PrerequisiteError(
      `'${options.to}' is gate-owned and cannot be set via \`change status\``,
      options.to === 'verified'
        ? '`status: verified` is minted only by `prospec verify record` at grade S/A'
        : '`status: archived` is minted only by `prospec archive`',
    );
  }

  const metadataPath = path.join(cwd, '.prospec', 'changes', changeName, 'metadata.yaml');
  const { doc, metadata } = readChangeMetadata(metadataPath, changeName);
  const from = metadata.status;

  if (from === options.to) {
    return { changeName, from, to: options.to, changed: false };
  }
  if (!isStatusBefore(from, options.to)) {
    const currentIndex = CHANGE_STATUSES.indexOf(from);
    throw new InvalidTransitionError(
      changeName,
      from,
      options.to,
      CHANGE_STATUSES.slice(currentIndex + 1).filter(
        (s) => !GATE_OWNED_STATUSES.includes(s),
      ),
    );
  }

  // Gate C — `implemented` requires every code task checked, so the status
  // cannot be advanced past an unfinished implementation. Reuses change-progress
  // (report-only) rather than re-parsing tasks.md. A scale whose contract has no
  // tasks.md (backfill) is exempt, as is a non-backfill change with no tasks.md
  // yet (the tasks station gates that upstream).
  if (
    options.to === 'implemented' &&
    !forbiddenArtifacts(metadata.scale).includes('tasks.md') &&
    fs.existsSync(path.join(cwd, '.prospec', 'changes', changeName, 'tasks.md'))
  ) {
    const progress = await reportChangeProgress({ change: changeName, cwd, quiet: true });
    // Refuse only when there ARE code tasks left unchecked. A tasks.md with zero
    // code tasks (only [M]/[V]) is vacuously complete — `allCodeDone` is false in
    // that case (it requires codeTasks.length > 0), so gate on the count directly.
    if (progress.progress.total > 0 && progress.progress.checked < progress.progress.total) {
      throw new PrerequisiteError(
        `implementation is not complete — ${progress.progress.checked}/${progress.progress.total} code tasks checked`,
        progress.nextTask
          ? `Finish the code tasks (next: ${progress.nextTask}), marking each with \`prospec change progress --complete\`, before setting status: implemented`
          : 'Complete the code tasks before setting status: implemented',
      );
    }
  }

  doc.set('status', options.to);
  await writeChangeMetadataDoc(metadataPath, doc, changeName);
  return { changeName, from, to: options.to, changed: true };
}
