import * as path from 'node:path';
import { formatDelegationRole, type DelegationStation, type DelegationTicket } from '../types/delegation.js';
import { PrerequisiteError } from '../types/errors.js';
import { DELEGATION_PRODUCER } from '../types/station.js';
import { appendQualityLogEntry, readChangeMetadata, writeChangeMetadataDoc } from '../lib/change-metadata.js';
import { todayIso } from '../lib/date-utils.js';
import { issueTicket, markFailed, receiveTicket, type ReceiptVerdict } from '../lib/delegation.js';
import { resolveChange } from './change-resolver.js';

export type ChangeDelegateMode =
  | { kind: 'issue'; station: DelegationStation; role: string; round: number }
  | { kind: 'receive'; stem: string }
  | { kind: 'spawn-failed'; stem: string; reason: string; acceptCurrentTree?: boolean };

export interface ChangeDelegateOptions {
  change?: string;
  cwd?: string;
  quiet?: boolean;
  mode: ChangeDelegateMode;
}

export type ChangeDelegateResult =
  | {
      kind: 'issued';
      changeName: string;
      stem: string;
      /** Absolute: a delegate working inside the snapshot would resolve a relative path there. */
      payloadPath: string;
      snapshotPath: string;
      unreleased: string[];
    }
  | { kind: 'received'; changeName: string; stem: string; unreleased: string[] }
  | { kind: 'receipt-failed'; changeName: string; stem: string; verdict: Exclude<ReceiptVerdict, { kind: 'received' }> }
  | { kind: 'failed'; changeName: string; stems: string[]; warnings: string[]; accepted: boolean; unreleased: string[]; kept: string[] };

/** The WARN a failed delegation records — a refusal the CLI holds is copied in,
 *  so the orchestrator's reason can add to it but never replace it. */
export function delegationFailureWarning(stem: string, before: DelegationTicket, reason: string, accepted: boolean): string {
  let warning = `${before.station}/${before.role} round ${before.round} attempt ${before.attempt} (${stem}): delegate failed — ${reason}`;
  if (before.refusal) {
    const facets = before.refusal.changed && before.refusal.changed.length > 0 ? ` [${before.refusal.changed.join(', ')}]` : '';
    warning += `; receipt refused (${before.refusal.reason}${facets}): ${before.refusal.detail}`;
  }
  if (accepted) warning += '; the human accepted the current repository state';
  return warning;
}

/**
 * Run `fn` with `GIT_OPTIONAL_LOCKS=0`, so the `git status` the content facet reads
 * never refreshes the index's stat cache; the previous value is restored after.
 */
async function withoutOptionalLocks<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.GIT_OPTIONAL_LOCKS;
  process.env.GIT_OPTIONAL_LOCKS = '0';
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.GIT_OPTIONAL_LOCKS;
    else process.env.GIT_OPTIONAL_LOCKS = previous;
  }
}

/**
 * `prospec change delegate` (REQ-SERVICES-120): issue a ticket before a spawn,
 * receive the payload when the delegate returns, or end a delegation that produced
 * no admissible payload. The CLI records every fact itself, the same way on every
 * host, and never writes the human's tree, the index, HEAD or refs.
 */
export async function execute(options: ChangeDelegateOptions): Promise<ChangeDelegateResult> {
  return withoutOptionalLocks(() => run(options));
}

async function run(options: ChangeDelegateOptions): Promise<ChangeDelegateResult> {
  const cwd = options.cwd ?? process.cwd();
  const changeName = await resolveChange(cwd, options.change, options.quiet, 'Which change does this delegation belong to?');
  const changeDir = path.join(cwd, '.prospec', 'changes', changeName);
  const mode = options.mode;

  if (mode.kind === 'issue') {
    let role: string;
    try {
      role = formatDelegationRole(mode.role);
    } catch {
      throw new PrerequisiteError(`--role ${JSON.stringify(mode.role)} has no letters or digits`, 'Pass a role such as `lens-security`, `verifier-C-1` or `grader`');
    }
    const issued = await issueTicket({ cwd, changeDir, key: { station: mode.station, role, round: mode.round } });
    return {
      kind: 'issued',
      changeName,
      stem: issued.stem,
      payloadPath: issued.payloadPath,
      snapshotPath: issued.snapshotProjectPath,
      unreleased: issued.unreleased,
    };
  }

  if (mode.kind === 'receive') {
    const outcome = await receiveTicket({ cwd, changeDir, stem: mode.stem });
    if (outcome.verdict.kind === 'received') {
      return { kind: 'received', changeName, stem: outcome.stem, unreleased: outcome.unreleased ?? [] };
    }
    return { kind: 'receipt-failed', changeName, stem: outcome.stem, verdict: outcome.verdict };
  }

  if (mode.reason.trim() === '') {
    throw new PrerequisiteError('--reason must not be empty', 'Say why the delegation ended, e.g. `--reason "spawn refused: rate limit"`');
  }
  const metadataPath = path.join(changeDir, 'metadata.yaml');
  const warnings: string[] = [];
  const result = await markFailed({
    cwd,
    changeDir,
    stem: mode.stem,
    reason: mode.reason,
    acceptCurrentTree: mode.acceptCurrentTree === true,
    // Each WARN lands before its ticket turns failed: if it cannot be written, that
    // ticket stays unsettled and the sink keeps refusing — never a silent failure.
    beforeWrite: async ({ stem, before, accepted }) => {
      const warning = delegationFailureWarning(stem, before, stem === mode.stem ? mode.reason : `${mode.reason} (ended with ${mode.stem})`, accepted);
      const { doc } = readChangeMetadata(metadataPath, changeName);
      appendQualityLogEntry(doc, { skill: DELEGATION_PRODUCER, date: todayIso(), result: 'WARN', warnings: [warning] });
      await writeChangeMetadataDoc(metadataPath, doc, changeName);
      warnings.push(warning);
    },
  });
  return {
    kind: 'failed',
    changeName,
    stems: result.ended.map((e) => e.stem),
    warnings,
    accepted: result.accepted,
    unreleased: result.ended.flatMap((e) => e.unreleased ?? []),
    kept: result.ended.flatMap((e) => (e.keptCheckpoint ? [e.keptCheckpoint] : [])),
  };
}
