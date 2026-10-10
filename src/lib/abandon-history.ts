import * as fs from 'node:fs';
import * as path from 'node:path';
import { ABANDON_MANIFEST, ABANDON_GITLINKS, ABANDON_OPERATION_FILE, AbandonOperationSchema, PreservationManifestSchema, GitlinkPinsSchema, type AbandonHistory, type AbandonedAttempt } from '../types/abandon.js';
import { assertValidChangeMetadata, normalizeIssueRef } from './change-metadata.js';
import { isContainedPath, isSafeResourceName, resolveContainedTarget } from './knowledge-reader.js';
import { parseYamlDocument } from './yaml-utils.js';
import { abandonedEntryFor } from './abandon-paths.js';
import { sha256 } from './repo-state.js';
import { PrerequisiteError } from '../types/errors.js';
import { resolveHistoryPaths, historyOrigin } from './history-paths.js';
import { assertNoPendingHistory, diagnoseLocalHistory, readHistoryOperation, readHistoryOperations } from './terminal-transfer.js';

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
  const paths = resolveHistoryPaths(root);
  const dir = abandonedEntryFor(root, archive);
  readHistoryOperation(paths, 'abandoned', archive);
  return readAbandonedBundle(dir, paths.historyProjectRoot);
}

export function readAbandonedBundle(dir: string, root: string): AbandonedAttempt {
  const archive = path.basename(dir);
  const regularFile = (file: string): string => {
    const relative = path.relative(dir, file);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Unsafe preservation path: ${file}`);
    for (let parent = path.dirname(file); parent !== dir; parent = path.dirname(parent)) {
      const stat = fs.lstatSync(parent);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unsafe preservation directory: ${parent}`);
    }
    const target = resolveContainedTarget(file, root, { read: true });
    if (!target.ok || !fs.lstatSync(file).isFile()) throw new Error(`Unsafe preservation file: ${file}`);
    return target.path;
  };
  regularFile(path.join(dir, 'metadata.yaml'));
  const envelope = readEnvelope(dir, root);
  if (!envelope) throw new Error(`Missing abandoned metadata: ${archive}`);
  const metadata = assertValidChangeMetadata(envelope.value, archive);
  if (metadata.status !== 'abandoned' || !metadata.abandonment) throw new Error(`Incomplete abandonment: ${archive}`);
  regularFile(path.join(dir, ABANDON_MANIFEST));
  const manifestText = readRecordFile(path.join(dir, ABANDON_MANIFEST), root);
  if (manifestText === null) throw new Error(`Missing preservation manifest: ${archive}`);
  const manifest = PreservationManifestSchema.parse(JSON.parse(manifestText));
  const preservationRoot = path.join(dir, 'preservation');
  const verifyBytes = (relative: string, digest: string): void => {
    if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error(`Unsafe preservation blob path: ${relative}`);
    const file = path.join(preservationRoot, relative);
    if (sha256(fs.readFileSync(regularFile(file))) !== digest) throw new Error(`Preservation hash mismatch: ${file}`);
  };
  verifyBytes('staged.patch', manifest.patches.staged);
  verifyBytes('unstaged.patch', manifest.patches.unstaged);
  for (const entry of manifest.entries) {
    if (entry.kind === 'regular') verifyBytes(entry.blob, entry.sha256);
  }
  const gitlinks = readRecordFile(path.join(dir, ABANDON_GITLINKS), root);
  if (gitlinks !== null) {
    regularFile(path.join(dir, ABANDON_GITLINKS));
    GitlinkPinsSchema.parse(JSON.parse(gitlinks));
  }
  const issue = normalizeIssueRef(metadata.issue);
  return { archive, digest: sha256(envelope.text), name: metadata.name, ...(issue === undefined ? {} : { issue }),
    reason: metadata.abandonment.reason, at: metadata.abandonment.at, manifest: metadata.abandonment.manifest };
}

/** Dedicated abandoned history never becomes an active workflow route. */
export function readAbandonHistory(root: string): AbandonHistory {
  const result: AbandonHistory = { attempts: [], errors: [] };
  let base = root;
  let entries: fs.Dirent[];
  let paths: ReturnType<typeof resolveHistoryPaths>;
  let operations: ReturnType<typeof readHistoryOperations> = [];
  try {
    paths = resolveHistoryPaths(root);
    base = paths.abandonedRoot;
    result.errors.push(...diagnoseLocalHistory(paths).map(({ path: name, reason: error }) => ({ name, error })));
    operations = readHistoryOperations(paths);
    for (const operation of operations) {
      if (operation.phase === 'complete' || JSON.stringify(operation.origin) !== JSON.stringify(historyOrigin(paths, operation.origin.changeName))) continue;
      result.errors.push({ name: operation.identity, source: operation.origin.changeName,
        error: `Pending history operation ${operation.operationId}: source ${operation.sourceDir}, staging ${operation.stagingDir}, final ${operation.finalDir}; inspect and reconcile before retrying` });
    }
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result;
      throw error;
    }
  } catch (error) {
    result.errors.push({ name: base, error: String(error) });
    return result;
  }
  for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const dir = path.join(base, entry.name);
    let source: string | undefined;
    const transfer = operations.find((operation) => operation.kind === 'abandoned' && operation.identity === entry.name);
    const foreign = transfer !== undefined && JSON.stringify(transfer.origin) !== JSON.stringify(historyOrigin(paths, transfer.origin.changeName));
    if (transfer && !foreign) source = transfer.origin.changeName;
    try {
      const historyRoot = paths.historyProjectRoot;
      if (!isSafeResourceName(entry.name) || !isContainedPath(dir, historyRoot)) throw new Error('Unsafe abandoned directory');
      readHistoryOperation(paths, 'abandoned', entry.name);
      const envelope = readEnvelope(dir, historyRoot);
      if (envelope?.value.status === 'abandoned') {
        result.attempts.push(readAbandonedBundle(dir, historyRoot));
        continue;
      }
      const operationText = readRecordFile(path.join(dir, ABANDON_OPERATION_FILE), historyRoot);
      if (operationText === null) continue;
      const operation = AbandonOperationSchema.parse(JSON.parse(operationText));
      if (!isSafeResourceName(operation.source)) throw new Error('Unsafe abandonment source identity');
      source = paths.sourceProjectRoot === historyRoot ? operation.source : undefined;
      throw new Error(`Incomplete abandonment (${operation.phase}); inspect source .prospec/changes/${source} and abandoned entry ${dir} before retrying`);
    } catch (error) {
      result.errors.push({ name: entry.name, error: error instanceof Error ? error.message : String(error), ...(source === undefined ? {} : { source }), ...(foreign ? { foreign: true } : {}) });
    }
  }
  return result;
}

export function matchingAbandoned(history: AbandonHistory, issue: unknown): AbandonedAttempt[] {
  const registration = normalizeIssueRef(issue);
  return registration === undefined ? [] : history.attempts.filter((attempt) => attempt.issue === registration);
}

/** Every writer must refuse an incomplete source even when today's destination differs. */
export function assertNoIncompleteAbandon(root: string, name: string, ownedArchive?: string, ownedOperationId?: string): void {
  assertNoPendingHistory(resolveHistoryPaths(root), name, ownedOperationId);
  const failures = readAbandonHistory(root).errors.filter((entry) => !entry.foreign && entry.name !== ownedArchive &&
    (entry.source === undefined || entry.source === name));
  if (failures.length > 0) throw new PrerequisiteError(failures.map((entry) => entry.error).join('; '),
    'Inspect and reconcile the incomplete abandonment before retrying');
}
