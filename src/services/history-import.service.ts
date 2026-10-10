import * as fs from 'node:fs';
import * as path from 'node:path';
import { HistoryError, PrerequisiteError } from '../types/errors.js';
import { HISTORY_POINTER, HistoryPointerSchema } from '../types/history.js';
import type { HistoryImportEntry, HistoryImportResult, HistoryKind, HistoryPathsResult } from '../types/history.js';
import { excludesAbandonFromYield, readAbandonedBundle } from '../lib/abandon-history.js';
import { resolveHistoryPaths, recheckHistoryPaths } from '../lib/history-paths.js';
import { assertNoPendingHistory, diagnoseLocalHistory, historyClaimPath, inventoryTree, readHistoryOperation, readHistoryOperations, historyOperationPath, transferBundle } from '../lib/terminal-transfer.js';

function refuse(reason: string): never {
  throw new PrerequisiteError(reason, 'Retain both copies and inspect prospec history paths before reconciling history.');
}
function exists(file: string): boolean {
  try { fs.lstatSync(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
function validateBundle(dir: string, root: string, kind: HistoryKind): void {
  const stat = fs.lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) refuse(`Unsafe history bundle: ${dir}`);
  if (kind === 'abandoned') readAbandonedBundle(dir, root);
  else if (excludesAbandonFromYield(dir, root)) refuse(`Abandoned or incomplete bundle in archive storage: ${dir}`);
}

export async function executePaths(options: { cwd?: string } = {}): Promise<HistoryPathsResult> {
  const paths = resolveHistoryPaths(options.cwd ?? process.cwd());
  const diagnostics = diagnoseLocalHistory(paths);
  const claim = historyClaimPath(paths);
  if (exists(claim)) diagnostics.push({ path: claim, reason: 'History writer claim exists; inspect its owner and retained operations before retrying. Never reclaim a claim by age.' });
  for (const operation of readHistoryOperations(paths)) {
    if (operation.phase === 'complete') continue;
    diagnostics.push({ path: historyOperationPath(paths, operation.operationId), reason: `Pending history operation (${operation.phase}); source ${operation.sourceDir}, staging ${operation.stagingDir}, final ${operation.finalDir}` });
  }
  return { paths, diagnostics };
}

export async function execute(options: { cwd?: string; from: string; dryRun?: boolean }): Promise<HistoryImportResult> {
  const paths = resolveHistoryPaths(options.cwd ?? process.cwd());
  const sourcePaths = resolveHistoryPaths(path.resolve(options.cwd ?? process.cwd(), options.from));
  if (paths.commonDir !== sourcePaths.commonDir || paths.projectPrefix !== sourcePaths.projectPrefix || paths.historyProjectRoot !== sourcePaths.historyProjectRoot ||
    (paths.commonDir === null && paths.sourceProjectRoot !== sourcePaths.sourceProjectRoot)) refuse('Import source must be the same registered repository and project scope.');
  const entries: HistoryImportEntry[] = [];
  for (const kind of ['archive', 'abandoned'] as const) {
    const localRoot = path.join(sourcePaths.sourceProjectRoot, '.prospec', kind);
    if (!exists(localRoot)) continue;
    for (const identity of fs.readdirSync(localRoot).sort()) {
      const source = path.join(localRoot, identity);
      const destination = path.join(kind === 'archive' ? paths.archiveRoot : paths.abandonedRoot, identity);
      const entry: HistoryImportEntry = { kind, identity, source, destination, outcome: 'failed' };
      entries.push(entry);
      try {
        HistoryPointerSchema.shape.identity.parse(identity);
        validateBundle(source, localRoot, kind);
        const original = inventoryTree(source);
        const pointerFile = path.join(source, HISTORY_POINTER);
        const marked = exists(pointerFile);
        if (marked) {
          if (!fs.lstatSync(pointerFile).isFile() || fs.lstatSync(pointerFile).isSymbolicLink()) refuse(`Unsafe history pointer: ${pointerFile}`);
          const pointer = HistoryPointerSchema.parse(JSON.parse(fs.readFileSync(pointerFile, 'utf8')));
          if (pointer.kind !== kind || pointer.identity !== identity) refuse(`History pointer identity mismatch: ${source}`);
          if (!exists(destination)) refuse(`Noncanonical modern relocation is unsupported: ${source}`);
        }
        if (exists(destination)) {
          validateBundle(destination, path.dirname(destination), kind);
          const operation = readHistoryOperation(paths, kind, identity);
          if (operation && operation.phase !== 'complete') refuse(`History operation is incomplete: ${destination}`);
          if (marked && !operation) refuse(`Marked source has no canonical operation lineage: ${source}`);
          entry.outcome = JSON.stringify(original) === JSON.stringify(inventoryTree(destination)) ? 'identical' : 'conflicting';
          if (entry.outcome === 'conflicting') entry.reason = `Different content at existing identity: ${destination}`;
          continue;
        }
        const changeName = identity.replace(/^\d{4}-\d{2}-\d{2}-/, '');
        recheckHistoryPaths(sourcePaths);
        assertNoPendingHistory(sourcePaths, changeName);
        if (exists(historyClaimPath(sourcePaths))) refuse(`History writer claim unavailable: ${historyClaimPath(sourcePaths)}`);
        if (options.dryRun) { entry.outcome = 'planned'; continue; }
        await transferBundle({ paths: sourcePaths, kind, identity, changeName, sourceDir: source, cleanup: false, legacy: true });
        entry.outcome = 'imported';
      } catch (error) {
        entry.outcome = 'failed';
        entry.reason = error instanceof HistoryError ? `${error.message}. ${error.suggestion}` : error instanceof Error ? error.message : String(error);
        if (error instanceof HistoryError) entry.details = error.details;
      }
    }
  }
  return { paths, entries, dryRun: options.dryRun ?? false };
}
