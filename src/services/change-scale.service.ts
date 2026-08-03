import * as fs from 'node:fs';
import * as path from 'node:path';
import { forbiddenArtifacts, type ChangeScale } from '../types/change.js';
import { PrerequisiteError } from '../types/errors.js';
import { readChangeMetadata, writeChangeMetadataDoc } from '../lib/change-metadata.js';
import { resolveChange } from './change-resolver.js';

export interface ChangeScaleOptions {
  /** Explicit change name; resolved interactively when omitted. */
  change?: string;
  cwd?: string;
  quiet?: boolean;
  /** The user-confirmed scale (confirmation is the SKILL's judgment step). */
  scale: ChangeScale;
}

export interface ChangeScaleResult {
  changeName: string;
  from?: ChangeScale;
  scale: ChangeScale;
  changed: boolean;
}

/**
 * `prospec change scale <scale>` — write the user-confirmed scale. The
 * complexity assessment and the user's confirmation stay in the skill; this
 * only owns the serialization (comment-preserving in-place edit). Idempotent
 * when the scale is already the target value.
 */
export async function execute(options: ChangeScaleOptions): Promise<ChangeScaleResult> {
  const cwd = options.cwd ?? process.cwd();
  const changeName = await resolveChange(
    cwd,
    options.change,
    options.quiet,
    'Which change should the scale be written to?',
  );

  const changeDir = path.join(cwd, '.prospec', 'changes', changeName);
  const metadataPath = path.join(changeDir, 'metadata.yaml');
  const { doc, metadata } = readChangeMetadata(metadataPath, changeName);
  const from = metadata.scale;

  if (from === options.scale) {
    return { changeName, from, scale: options.scale, changed: false };
  }

  // Writing a scale whose contract forbids artifacts already on disk would mint a
  // change that is invalid the moment it is written: `validate promote-scaffold`
  // would FAIL and `prospec status` would route it at a station that must refuse
  // it. Refuse before writing (the file stays byte-identical) and name the files.
  const conflicting = forbiddenArtifacts(options.scale).filter((artifact) =>
    fs.existsSync(path.join(changeDir, artifact)),
  );
  if (conflicting.length > 0) {
    throw new PrerequisiteError(
      `\`scale: ${options.scale}\` forbids ${conflicting.join(' and ')}, which already exist in .prospec/changes/${changeName}/`,
      `Remove ${conflicting.join(' and ')} first if the scale is right, or keep the current scale — the artifacts and the scale must agree`,
    );
  }
  doc.set('scale', options.scale);
  await writeChangeMetadataDoc(metadataPath, doc, changeName);
  return { changeName, ...(from !== undefined ? { from } : {}), scale: options.scale, changed: true };
}
