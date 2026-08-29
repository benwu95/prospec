import * as path from 'node:path';
import {
  CHANGE_STATUSES,
  GATE_OWNED_STATUSES,
  isStatusBefore,
  type ChangeStatus,
} from '../types/change.js';
import { InvalidTransitionError, PrerequisiteError } from '../types/errors.js';
import { readChangeMetadata, writeChangeMetadataDoc } from '../lib/change-metadata.js';
import { resolveChange } from './change-resolver.js';

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

  doc.set('status', options.to);
  await writeChangeMetadataDoc(metadataPath, doc, changeName);
  return { changeName, from, to: options.to, changed: true };
}
