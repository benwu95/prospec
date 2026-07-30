import * as path from 'node:path';
import type { NewQualityLogEntry } from '../types/change.js';
import { readChangeMetadata, writeChangeMetadataDoc, appendQualityLogEntry } from '../lib/change-metadata.js';
import { todayIso } from '../lib/date-utils.js';
import { resolveChange } from './change-resolver.js';

export interface ChangeLogOptions {
  /** Explicit change name; resolved interactively when omitted. */
  change?: string;
  cwd?: string;
  quiet?: boolean;
  /** The entry to append; `date` defaults to today (bare ISO 8601 date). */
  entry: Omit<NewQualityLogEntry, 'date'> & { date?: string };
}

export interface ChangeLogResult {
  changeName: string;
  metadataPath: string;
  entry: NewQualityLogEntry;
}

/**
 * `prospec change log` — append one structured quality_log entry.
 *
 * The judgment (result, warnings text, grade, counts) is the caller's; this
 * service owns the serialization: canonical key order, YAML escaping as data,
 * comment-preserving write-back. Skills stop hand-writing quality_log YAML.
 */
export async function execute(options: ChangeLogOptions): Promise<ChangeLogResult> {
  const cwd = options.cwd ?? process.cwd();
  const changeName = await resolveChange(
    cwd,
    options.change,
    options.quiet,
    'Which change should this quality_log entry be appended to?',
  );

  const metadataPath = path.join(cwd, '.prospec', 'changes', changeName, 'metadata.yaml');
  const { doc } = readChangeMetadata(metadataPath, changeName);

  const entry: NewQualityLogEntry = {
    ...options.entry,
    date: options.entry.date ?? todayIso(),
  };
  appendQualityLogEntry(doc, entry);
  await writeChangeMetadataDoc(metadataPath, doc, changeName);

  return {
    changeName,
    metadataPath: path.join('.prospec', 'changes', changeName, 'metadata.yaml'),
    entry,
  };
}
