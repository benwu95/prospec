import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ChangeMetadata } from '../types/change.js';
import { ABANDON_MANIFEST, ABANDON_OPERATION_FILE, type AbandonOperation, type ChangeAbandonResult } from '../types/abandon.js';
import { AbandonError, PrerequisiteError } from '../types/errors.js';
import { PremiseSchema } from '../types/premise.js';
import { abandonDirFor } from '../lib/abandon-paths.js';
import { assertNoIncompleteAbandon } from '../lib/abandon-history.js';
import { readConfig, resolveMaxStationRetries } from '../lib/config.js';
import { normalizeIssueRef, readChangeMetadata, writeChangeMetadataDoc } from '../lib/change-metadata.js';
import { isContainedPath, resolveContainedTarget } from '../lib/knowledge-reader.js';
import { judgeSettlement, readTickets } from '../lib/delegation.js';
import { reduceEscalationHistory } from '../lib/escalation.js';
import { parsePremise } from '../lib/premise.js';
import { captureFileInputs } from '../lib/fs-utils.js';
import { captureWork, persistWork, recheckWork } from '../lib/work-preservation.js';
import { resolveChange } from './change-resolver.js';
import { HISTORY_POINTER } from '../types/history.js';
import { HistoryError } from '../types/errors.js';
import { resolveHistoryPaths, historyOrigin } from '../lib/history-paths.js';
import { transferBundle, historyClaimPath, historyOperationPath } from '../lib/terminal-transfer.js';
import { atomicWrite } from '../lib/fs-utils.js';

export interface ChangeAbandonOptions {
  name: string;
  reason: string;
  overturned?: string[];
  cwd?: string;
}

function requireSettled(sourceDir: string): void {
  const settlement = judgeSettlement(readTickets(sourceDir, 'settle'));
  if (settlement.kind === 'unsettled') {
    throw new PrerequisiteError('Unsettled delegation tickets block abandonment', 'Receive or end the existing delegation attempts before abandoning; retain their checkpoints');
  }
}

/** Admission is separate so no destination is claimed before all source checks pass. */
export async function prepareAbandon(options: ChangeAbandonOptions) {
  const root = fs.realpathSync(options.cwd ?? process.cwd());
  if (!options.reason.trim()) throw new PrerequisiteError('Abandon reason must not be blank', 'Provide --reason describing why this attempt is ending');
  const config = await readConfig(root);
  const name = await resolveChange(root, options.name, true, 'Change to abandon');
  const sourceDir = path.join(root, '.prospec/changes', name);
  if (!isContainedPath(sourceDir, root) || fs.lstatSync(sourceDir).isSymbolicLink()) {
    throw new PrerequisiteError('Unsafe change directory', sourceDir);
  }
  const metadataPath = resolveContainedTarget(path.join(sourceDir, 'metadata.yaml'), root, { read: true });
  if (!metadataPath.ok) throw new PrerequisiteError('Unsafe metadata path', metadataPath.reason);
  if (fs.lstatSync(path.join(sourceDir, 'metadata.yaml')).isSymbolicLink()) {
    throw new PrerequisiteError('Abandonment metadata must not be a symlink', 'Retain a regular metadata file in the change before retrying');
  }
  const inputs = captureFileInputs({ metadata: path.join(sourceDir, 'metadata.yaml'), proposal: path.join(sourceDir, 'proposal.md') });
  const { doc, metadata } = readChangeMetadata(metadataPath.path, name);
  if (metadata.status === 'archived' || metadata.status === 'abandoned') throw new PrerequisiteError('Change is already terminal', 'Inspect its retained artifacts');
  const paths = resolveHistoryPaths(root);
  const destination = abandonDirFor(root, name);
  const target = resolveContainedTarget(path.join(destination, ABANDON_MANIFEST), paths.historyProjectRoot);
  if (!target.ok) throw new PrerequisiteError('Unsafe abandoned destination', target.reason);
  if (fs.existsSync(destination)) throw new PrerequisiteError(`Abandoned destination already exists: ${destination}`, 'Inspect the existing attempt; do not overwrite it');
  assertNoIncompleteAbandon(root, name);
  for (const reserved of ['preservation', ABANDON_OPERATION_FILE, HISTORY_POINTER]) {
    if (fs.readdirSync(sourceDir).includes(reserved)) throw new PrerequisiteError(`Reserved abandon artifact name: ${reserved}`, 'Rename this original artifact before abandoning');
  }
  requireSettled(sourceDir);
  const overturned: NonNullable<ChangeMetadata['abandonment']>['overturned'] = [];
  let premiseNote = 'No overturned fields declared';
  try {
    const proposal = resolveContainedTarget(path.join(sourceDir, 'proposal.md'), root, { read: true });
    if (!proposal.ok) throw new Error(`Premise input: ${proposal.reason}`);
    const premise = PremiseSchema.partial().parse(parsePremise(fs.readFileSync(proposal.path, 'utf8')));
    for (const field of new Set(options.overturned ?? [])) {
      let value: unknown = premise;
      for (const segment of field.split('.')) {
        value = value !== null && typeof value === 'object' && Object.hasOwn(value, segment)
          ? (value as Record<string, unknown>)[segment] : undefined;
      }
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) throw new Error(`Unknown or nonscalar Premise leaf field: ${field}`);
      overturned.push({ field, value: value as string | number | boolean | null });
    }
  } catch (error) {
    if (options.overturned?.length) throw new PrerequisiteError(`Cannot record overturned field: ${String(error)}`, 'Choose an existing scalar leaf in the structured Premise');
    premiseNote = `Premise could not be parsed; original proposal retained: ${String(error)}`;
  }
  const last = reduceEscalationHistory(metadata.quality_log, resolveMaxStationRetries(config)).events.at(-1);
  const record: NonNullable<ChangeMetadata['abandonment']> = {
    reason: options.reason.trim(), at: new Date().toISOString(), from_status: metadata.status,
    escalation: last ? { trigger: last.trigger, ordinal: last.ordinal } : null,
    overturned, premise_note: premiseNote, manifest: ABANDON_MANIFEST,
  };
  const recheck = (ownedOperationId?: string): void => {
    // This invocation exclusively claims destination later; never exempt older attempts.
    assertNoIncompleteAbandon(root, name, path.basename(destination), ownedOperationId);
    requireSettled(sourceDir);
    if (!inputs.recheck()) throw new PrerequisiteError('Abandonment source inputs changed', 'Re-run admission against the current metadata and proposal');
  };
  recheck();
  return { root, paths, name, sourceDir, destination, metadata, doc, record, recheck };
}

export async function execute(options: ChangeAbandonOptions): Promise<ChangeAbandonResult> {
  const saved = await prepareAbandon(options);
  const { root, paths, sourceDir, destination, doc } = saved;
  let captured: ReturnType<typeof captureWork> | undefined;
  const operation: AbandonOperation = { version: 1, source: saved.name, source_digest: '',
    origin: historyOrigin(paths, saved.name), phase: 'preserving', moved: [], pending: fs.readdirSync(sourceDir).sort() };
  try {
    await transferBundle({ paths, kind: 'abandoned', identity: path.basename(destination), changeName: saved.name,
      sourceDir, cleanup: true, prepare: async (stagingDir, transfer) => {
        captured = captureWork(root, stagingDir, sourceDir, { storageRoot: paths.historyProjectRoot,
          excludedPaths: [destination, historyOperationPath(paths, transfer.operationId), historyClaimPath(paths)] });
        saved.recheck(transfer.operationId);
        operation.source_digest = captured.sourceDigest;
        const marker = path.join(stagingDir, ABANDON_OPERATION_FILE);
        await atomicWrite(marker, JSON.stringify(operation, null, 2) + '\n', { mode: 0o600 });
        await persistWork(captured);
        recheckWork(captured);
        saved.recheck(transfer.operationId);
        operation.phase = 'publishing';
        await atomicWrite(marker, JSON.stringify(operation, null, 2) + '\n', { mode: 0o600 });
        doc.set('status', 'abandoned');
        doc.set('abandonment', saved.record);
        await writeChangeMetadataDoc(path.join(stagingDir, 'metadata.yaml'), doc, saved.name);
        recheckWork(captured);
        saved.recheck(transfer.operationId);
      } });
  } catch (cause) {
    if (!(cause instanceof HistoryError)) throw cause;
    const listing = (dir: string): string[] | null => { try { return fs.readdirSync(dir).sort(); } catch { return null; } };
    const sourceEntries = listing(sourceDir);
    throw new AbandonError({ phase: operation.phase, sourceDir, archiveDir: destination,
      preservationDir: path.join(cause.details.phase === 'published' || cause.details.phase === 'complete' ? destination : cause.details.stagingDir, 'preservation'),
      moved: operation.pending.filter((entry) => !sourceEntries?.includes(entry)), pending: sourceEntries ?? [],
      sourceEntries, archiveEntries: listing(destination),
      stagingDir: cause.details.stagingDir, operationPath: cause.details.operationPath, transferPhase: cause.details.phase,
    }, cause);
  }
  if (!captured) throw new Error('Preservation capture missing after completed transfer');
  const issue = normalizeIssueRef(saved.metadata.issue);
  return { changeName: saved.name, archiveDir: destination, preservationDir: path.join(destination, 'preservation'),
    projectRoot: root, gitPrefix: captured.manifest.git_prefix, reason: saved.record.reason,
    preservedFileCount: captured.manifest.entries.length, ...(issue === undefined ? {} : { issue }) };
}
