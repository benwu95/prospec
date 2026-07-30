import * as path from 'node:path';
import type { ChangeScale } from '../types/change.js';
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

  const metadataPath = path.join(cwd, '.prospec', 'changes', changeName, 'metadata.yaml');
  const { doc, metadata } = readChangeMetadata(metadataPath, changeName);
  const from = metadata.scale;

  if (from === options.scale) {
    return { changeName, from, scale: options.scale, changed: false };
  }
  doc.set('scale', options.scale);
  await writeChangeMetadataDoc(metadataPath, doc, changeName);
  return { changeName, ...(from !== undefined ? { from } : {}), scale: options.scale, changed: true };
}
