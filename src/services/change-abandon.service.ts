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
import { atomicWrite, captureFileInputs } from '../lib/fs-utils.js';
import { captureWork, persistWork, recheckWork } from '../lib/work-preservation.js';
import { resolveChange } from './change-resolver.js';

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
  const destination = abandonDirFor(root, name);
  const target = resolveContainedTarget(path.join(destination, ABANDON_MANIFEST), root);
  if (!target.ok) throw new PrerequisiteError('Unsafe abandoned destination', target.reason);
  if (fs.existsSync(destination)) throw new PrerequisiteError(`Abandoned destination already exists: ${destination}`, 'Inspect the existing attempt; do not overwrite it');
  assertNoIncompleteAbandon(root, name);
  for (const reserved of ['preservation', ABANDON_OPERATION_FILE]) {
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
  const recheck = (): void => {
    // This invocation exclusively claims destination later; never exempt older attempts.
    assertNoIncompleteAbandon(root, name, path.basename(destination));
    requireSettled(sourceDir);
    if (!inputs.recheck()) throw new PrerequisiteError('Abandonment source inputs changed', 'Re-run admission against the current metadata and proposal');
  };
  recheck();
  return { root, name, sourceDir, destination, metadata, doc, record, recheck };
}

type Prepared = Awaited<ReturnType<typeof prepareAbandon>>;
function partialFailure(prepared: Prepared, operation: AbandonOperation, cause: unknown): AbandonError {
  const listing = (dir: string): string[] | null => {
    try { return fs.readdirSync(dir).sort(); } catch { return null; }
  };
  return new AbandonError({ phase: operation.phase, sourceDir: prepared.sourceDir,
    archiveDir: prepared.destination, preservationDir: path.join(prepared.destination, 'preservation'),
    moved: [...operation.moved], pending: [...operation.pending],
    sourceEntries: listing(prepared.sourceDir), archiveEntries: listing(prepared.destination),
  }, cause);
}

async function writeOperation(prepared: Prepared, operation: AbandonOperation): Promise<void> {
  const target = resolveContainedTarget(path.join(prepared.destination, ABANDON_OPERATION_FILE), prepared.root);
  if (!target.ok) throw new Error(`Unsafe operation marker: ${target.reason}`);
  await atomicWrite(target.path, JSON.stringify(operation, null, 2) + '\n', { mode: 0o600 });
}

/** Claim and preserve before any original artifact moves. */
export async function preserveAbandon(prepared: Prepared) {
  const input = captureWork(prepared.root, prepared.destination, prepared.sourceDir);
  prepared.recheck();
  const operation: AbandonOperation = { version: 1, source: prepared.name, source_digest: input.sourceDigest,
    phase: 'preserving', moved: [], pending: fs.readdirSync(prepared.sourceDir).sort()
      .filter((name) => name !== 'metadata.yaml').concat('metadata.yaml') };
  fs.mkdirSync(path.dirname(prepared.destination), { recursive: true });
  // Non-recursive mkdir is the exclusive claim; a competing destination is never reused.
  fs.mkdirSync(prepared.destination);
  try {
    await writeOperation(prepared, operation);
    await persistWork(input);
    recheckWork(input);
    prepared.recheck();
    return { ...prepared, operation, input };
  } catch (error) { throw partialFailure(prepared, operation, error); }
}

export async function execute(options: ChangeAbandonOptions): Promise<ChangeAbandonResult> {
  const saved = await preserveAbandon(await prepareAbandon(options));
  const { operation, sourceDir, destination, root, doc } = saved;
  try {
    operation.phase = 'moving';
    await writeOperation(saved, operation);
    recheckWork(saved.input);
    saved.recheck();
    while (operation.pending.length > 0) {
      const name = operation.pending[0]!;
      const target = path.join(destination, name);
      const parent = resolveContainedTarget(path.join(destination, '.prospec-path-probe'), root);
      if (!parent.ok || fs.readdirSync(destination).includes(name)) throw new Error(`Unsafe or occupied artifact destination: ${target}`);
      await fs.promises.rename(path.join(sourceDir, name), target);
      operation.moved.push(name);
      operation.pending.shift();
      await writeOperation(saved, operation);
    }
    await fs.promises.rmdir(sourceDir);
    operation.phase = 'publishing';
    await writeOperation(saved, operation);
    doc.set('status', 'abandoned');
    doc.set('abandonment', saved.record);
    const metadata = resolveContainedTarget(path.join(destination, 'metadata.yaml'), root, { read: true });
    if (!metadata.ok) throw new Error(`Unsafe publication metadata: ${metadata.reason}`);
    // This atomic metadata replacement is the sole success marker.
    await writeChangeMetadataDoc(metadata.path, doc, saved.name);
    const issue = normalizeIssueRef(saved.metadata.issue);
    return { changeName: saved.name, archiveDir: destination, preservationDir: path.join(destination, 'preservation'),
      projectRoot: root, gitPrefix: saved.input.manifest.git_prefix, reason: saved.record.reason,
      ...(issue === undefined ? {} : { issue }) };
  } catch (error) { throw partialFailure(saved, operation, error); }
}
