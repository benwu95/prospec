import * as fs from 'node:fs';
import * as path from 'node:path';
import { ABANDON_MANIFEST, ABANDON_OPERATION_FILE, AbandonOperationSchema, PreservationManifestSchema, type AbandonHistory, type AbandonedAttempt } from '../types/abandon.js';
import { assertValidChangeMetadata, normalizeIssueRef } from './change-metadata.js';
import { isContainedPath, isSafeResourceName, resolveContainedTarget } from './knowledge-reader.js';
import { parseYamlDocument } from './yaml-utils.js';
import { abandonedRootFor, abandonedEntryFor } from './abandon-paths.js';
import { sha256 } from './repo-state.js';
import { PrerequisiteError } from '../types/errors.js';

/** Absence is distinct from unreadable/escaped input. Shared by history and yield. */
function readRecordFile(file: string, root: string): string | null {
  const target = resolveContainedTarget(file, root, { read: true });
  if (!target.ok) throw new Error(`${file}: ${target.reason}`);
  try { return fs.readFileSync(target.path, 'utf8'); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function readEnvelope(dir: string, root: string): { text: string; value: Record<string, unknown> } | null {
  const file = path.join(dir, 'metadata.yaml');
  const text = readRecordFile(file, root);
  if (text === null) return null;
  const value: unknown = parseYamlDocument(text, file).toJS();
  return { text, value: typeof value === 'object' && value !== null ? value as Record<string, unknown> : {} };
}

/** Legacy successful archives need no modern metadata envelope to remain corpus entries. */
export function excludesAbandonFromYield(dir: string, root: string): boolean {
  if (readRecordFile(path.join(dir, ABANDON_OPERATION_FILE), root) !== null) return true;
  return readEnvelope(dir, root)?.value.status === 'abandoned';
}

/** Strict linked-record reader; original metadata bytes provide the creation-time identity. */
export function readAbandonedAttempt(root: string, archive: string): AbandonedAttempt {
  const dir = abandonedEntryFor(root, archive);
  const envelope = readEnvelope(dir, root);
  if (!envelope) throw new Error(`Missing abandoned metadata: ${archive}`);
  const metadata = assertValidChangeMetadata(envelope.value, archive);
  if (metadata.status !== 'abandoned' || !metadata.abandonment) throw new Error(`Incomplete abandonment: ${archive}`);
  const manifestText = readRecordFile(path.join(dir, ABANDON_MANIFEST), root);
  if (manifestText === null) throw new Error(`Missing preservation manifest: ${archive}`);
  PreservationManifestSchema.parse(JSON.parse(manifestText));
  const issue = normalizeIssueRef(metadata.issue);
  return { archive, digest: sha256(envelope.text), name: metadata.name, ...(issue === undefined ? {} : { issue }),
    reason: metadata.abandonment.reason, at: metadata.abandonment.at, manifest: metadata.abandonment.manifest };
}

/** Dedicated abandoned history never becomes an active workflow route. */
export function readAbandonHistory(root: string): AbandonHistory {
  const result: AbandonHistory = { attempts: [], errors: [] };
  let base = root;
  let entries: fs.Dirent[];
  try { base = abandonedRootFor(root); entries = fs.readdirSync(base, { withFileTypes: true }); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result;
    return { attempts: [], errors: [{ name: base, error: String(error) }] };
  }
  for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const dir = path.join(base, entry.name);
    let source: string | undefined;
    try {
      if (!isSafeResourceName(entry.name) || !isContainedPath(dir, root)) throw new Error('Unsafe abandoned directory');
      const envelope = readEnvelope(dir, root);
      if (envelope?.value.status === 'abandoned') {
        result.attempts.push(readAbandonedAttempt(root, entry.name));
        continue;
      }
      const operationText = readRecordFile(path.join(dir, ABANDON_OPERATION_FILE), root);
      if (operationText === null) continue;
      const operation = AbandonOperationSchema.parse(JSON.parse(operationText));
      if (!isSafeResourceName(operation.source)) throw new Error('Unsafe abandonment source identity');
      source = operation.source;
      throw new Error(`Incomplete abandonment (${operation.phase}); inspect source .prospec/changes/${source} and abandoned entry ${dir} before retrying`);
    } catch (error) {
      result.errors.push({ name: entry.name, error: error instanceof Error ? error.message : String(error), ...(source === undefined ? {} : { source }) });
    }
  }
  return result;
}

export function matchingAbandoned(history: AbandonHistory, issue: unknown): AbandonedAttempt[] {
  const registration = normalizeIssueRef(issue);
  return registration === undefined ? [] : history.attempts.filter((attempt) => attempt.issue === registration);
}

/** Every writer must refuse an incomplete source even when today's destination differs. */
export function assertNoIncompleteAbandon(root: string, name: string, ownedArchive?: string): void {
  const failures = readAbandonHistory(root).errors.filter((entry) => entry.name !== ownedArchive &&
    (entry.source === undefined || entry.source === name));
  if (failures.length > 0) throw new PrerequisiteError(failures.map((entry) => entry.error).join('; '),
    'Inspect and reconcile the incomplete abandonment before retrying');
}
