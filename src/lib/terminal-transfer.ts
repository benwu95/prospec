import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { HistoryError, ProspecError } from '../types/errors.js';
import { HISTORY_POINTER, HistoryOperationSchema, HistoryPointerSchema } from '../types/history.js';
import type { HistoryDiagnostic, HistoryKind, HistoryOperation, HistoryPaths, InventoryEntry } from '../types/history.js';
import { atomicWrite } from './fs-utils.js';
import { sha256 } from './repo-state.js';
import { historyOrigin, recheckHistoryPaths } from './history-paths.js';
function refuse(message: string): never {
  throw new ProspecError(message, 'HISTORY_REFUSED', 'Retain all copies; inspect history paths and operations before reconciling manually.');
}

function exists(file: string): boolean {
  try {
    fs.lstatSync(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return false;
    throw error;
  }
}

function contained(root: string, target: string, leafDirectory = true): void {
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    refuse(`History path escapes its root: ${target}`);
  let current = root;
  const parts = relative ? relative.split(path.sep) : [];
  for (let i = -1; i < parts.length; i++) {
    if (i >= 0)
      current = path.join(current, parts[i]!);
    if (!exists(current))
      continue;
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || ((i < parts.length - 1 || leafDirectory) && !stat.isDirectory()))
      refuse(`Unsafe history path: ${current}`);
  }
}

function rootsSafe(paths: HistoryPaths): void {
  for (const root of [paths.archiveRoot, paths.abandonedRoot, paths.operationsRoot])
    contained(paths.historyProjectRoot, root);
}

function same(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }

function rootFor(paths: HistoryPaths, kind: HistoryKind): string { return kind === 'archive' ? paths.archiveRoot : paths.abandonedRoot; }

export function historyClaimPath(paths: HistoryPaths): string { return path.join(paths.operationsRoot, 'writer'); }

export function historyOperationPath(paths: HistoryPaths, operationId: string): string {
  HistoryPointerSchema.shape.operationId.parse(operationId);
  return path.join(paths.operationsRoot, `${operationId}.json`);
}

function losslessText(bytes: Buffer): string {
  const value = bytes.toString('utf8');
  if (!Buffer.from(value).equals(bytes))
    refuse('History filename or symlink target is not lossless UTF-8');
  return value;
}

function inventoryEntry(directory: string, relative: string): InventoryEntry {
  const absolute = path.join(directory, relative), stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink())
    return { path: relative, kind: 'symlink', target: losslessText(fs.readlinkSync(absolute, { encoding: 'buffer' })) };
  if (stat.isDirectory())
    return { path: relative, kind: 'directory', mode: stat.mode & 0o7777 };
  if (stat.isFile())
    return { path: relative, kind: 'regular', mode: stat.mode & 0o7777, sha256: sha256(fs.readFileSync(absolute)) };
  return refuse(`Unsupported history node: ${absolute}`);
}

export function inventoryTree(directory: string): InventoryEntry[] {
  const result: InventoryEntry[] = [];
  function visit(relative: string): void {
    const entry = inventoryEntry(directory, relative);
    result.push(entry);
    if (entry.kind === 'directory') {
      for (const name of fs.readdirSync(path.join(directory, relative), { encoding: 'buffer' }).map(losslessText).sort())
        visit(relative ? `${relative}/${name}` : name);
    }
  }
  if (!fs.lstatSync(directory).isDirectory())
    refuse(`Bundle root must be a real directory: ${directory}`);
  visit('');
  return result;
}

function assertInventory(directory: string, expected: InventoryEntry[]): void {
  if (!same(inventoryTree(directory), expected))
    refuse(`History inventory changed: ${directory}`);
}

function copyTree(source: string, destination: string, entries: InventoryEntry[], skipPointer = false): void {
  for (const entry of entries) {
    if (!entry.path || (skipPointer && entry.path === HISTORY_POINTER))
      continue;
    const from = path.join(source, entry.path), to = path.join(destination, entry.path);
    if (entry.kind === 'directory')
      fs.mkdirSync(to);
    else if (entry.kind === 'symlink')
      fs.symlinkSync(entry.target, to);
    else {
      fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(to, entry.mode);
    }
  }
  for (const entry of [...entries].reverse())
    if (entry.kind === 'directory')
      fs.chmodSync(path.join(destination, entry.path), entry.mode);
}
async function withWritableDirectories(directory: string, entries: InventoryEntry[], action: () => Promise<void>): Promise<void> {
  const changed: Array<{ file: string; mode: number; temporary: number; dev: number; ino: number }> = [];
  let failure: { cause: unknown } | undefined;
  try {
    for (const entry of entries) {
      if (entry.kind !== 'directory') continue;
      const file = path.join(directory, entry.path);
      contained(directory, file);
      const stat = fs.lstatSync(file), temporary = entry.mode | 0o700;
      if (temporary === entry.mode) continue;
      changed.push({ file, mode: entry.mode, temporary, dev: stat.dev, ino: stat.ino });
      fs.chmodSync(file, temporary);
    }
    await action();
  } catch (cause) { failure = { cause }; }
  const errors: unknown[] = failure ? [failure.cause] : [];
  for (const entry of changed.reverse()) {
    try {
      if (!exists(entry.file)) continue;
      contained(directory, entry.file);
      const stat = fs.lstatSync(entry.file);
      if (stat.dev === entry.dev && stat.ino === entry.ino && (stat.mode & 0o7777) === entry.temporary) fs.chmodSync(entry.file, entry.mode);
    } catch (cause) { errors.push(cause); }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, errors.map(String).join('; '));
}

async function saveOperation(paths: HistoryPaths, operation: HistoryOperation): Promise<void> {
  rootsSafe(paths);
  const file = historyOperationPath(paths, operation.operationId);
  contained(paths.operationsRoot, file, false);
  await atomicWrite(file, JSON.stringify(HistoryOperationSchema.parse(operation), null, 2), { mode: 0o600 });
  const fd = fs.openSync(file, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export async function withHistoryClaim<T>(paths: HistoryPaths, action: () => Promise<T>): Promise<T> {
  recheckHistoryPaths(paths);
  rootsSafe(paths);
  fs.mkdirSync(paths.operationsRoot, { recursive: true });
  const claim = historyClaimPath(paths), token = randomUUID();
  try {
    fs.mkdirSync(claim);
  } catch (error) {
    refuse(`History writer claim unavailable at ${claim}: ${String(error)}. Never reclaim a claim by age.`);
  }
  const stat = fs.lstatSync(claim);
  const owner = path.join(claim, 'owner');
  let outcome: { value: T } | { cause: unknown };
  try {
    fs.writeFileSync(owner, token, { flag: 'wx', mode: 0o600 });
    outcome = { value: await action() };
  } catch (cause) {
    outcome = { cause };
  }
  try {
    if (exists(claim)) {
      const current = fs.lstatSync(claim);
      if (current.isDirectory() && current.dev === stat.dev && current.ino === stat.ino && exists(owner) && !fs.lstatSync(owner).isSymbolicLink() && fs.readFileSync(owner, 'utf8') === token) {
        fs.unlinkSync(owner);
        fs.rmdirSync(claim);
      }
    }
  } catch (release) {
    const message = `History writer claim release failed at ${claim}; source project ${paths.sourceProjectRoot}, history project ${paths.historyProjectRoot}: ${String(release)}`;
    if ('cause' in outcome) throw new AggregateError([outcome.cause, release], `${String(outcome.cause)}; ${message}`);
    throw new ProspecError(message, 'HISTORY_REFUSED', 'Retain all copies and inspect the claim and operation records before reconciling manually.', { cause: release });
  }
  if ('cause' in outcome) throw outcome.cause;
  return outcome.value;
}

export function readHistoryOperations(paths: HistoryPaths): HistoryOperation[] {
  rootsSafe(paths);
  if (!exists(paths.operationsRoot))
    return [];
  return fs.readdirSync(paths.operationsRoot).filter(name => name.endsWith('.json')).map(name => {
    const file = path.join(paths.operationsRoot, name);
    contained(paths.operationsRoot, file, false);
    const operation = HistoryOperationSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (name !== `${operation.operationId}.json`)
      refuse(`History operation identity mismatch: ${file}`);
    return operation;
  });
}

export function assertNoPendingHistory(paths: HistoryPaths, changeName: string, ownedOperationId?: string): void {
  const origin = historyOrigin(paths, changeName);
  for (const operation of readHistoryOperations(paths)) {
    if (operation.phase !== 'complete' && operation.operationId !== ownedOperationId && same(operation.origin, origin))
      refuse(`Pending history operation ${operation.operationId} at ${historyOperationPath(paths, operation.operationId)}; source ${operation.sourceDir}, staging ${operation.stagingDir}, final ${operation.finalDir}`);
  }
}

export function readHistoryOperation(paths: HistoryPaths, kind: HistoryKind, identity: string): HistoryOperation | null {
  HistoryPointerSchema.shape.identity.parse(identity);
  rootsSafe(paths);
  const directory = path.join(rootFor(paths, kind), identity), pointerFile = path.join(directory, HISTORY_POINTER);
  contained(rootFor(paths, kind), directory);
  if (!exists(directory))
    refuse(`History bundle is missing: ${directory}`);
  if (!exists(pointerFile)) {
    for (const operation of readHistoryOperations(paths).filter(item => item.finalDir === directory)) {
      if (operation.phase !== 'complete')
        refuse(`History publication is incomplete: ${directory}`);
      if (operation.cleanup)
        refuse(`Native history pointer is missing: ${directory}`);
    }
    return null;
  }
  contained(directory, pointerFile, false);
  const pointer = HistoryPointerSchema.parse(JSON.parse(fs.readFileSync(pointerFile, 'utf8')));
  if (pointer.kind !== kind || pointer.identity !== identity)
    refuse(`History pointer identity mismatch: ${directory}`);
  const operationFile = historyOperationPath(paths, pointer.operationId);
  contained(paths.operationsRoot, operationFile, false);
  const operation = HistoryOperationSchema.parse(JSON.parse(fs.readFileSync(operationFile, 'utf8')));
  if (operation.operationId !== pointer.operationId || operation.kind !== kind || operation.identity !== identity || operation.finalDir !== directory || operation.stagingDir !== path.join(paths.operationsRoot, `.staging-${pointer.operationId}`) || operation.origin.commonDir !== paths.commonDir || operation.origin.projectPrefix !== paths.projectPrefix)
    refuse(`History operation lineage mismatch: ${directory}`);
  if (operation.phase !== 'published' && operation.phase !== 'complete')
    refuse(`History publication is incomplete: ${directory}; source ${operation.sourceDir}, staging ${operation.stagingDir}`);
  if (operation.phase === 'published') assertInventory(directory, operation.prepared);
  return operation;
}

export function assertHistoryFinalizable(paths: HistoryPaths, kind: HistoryKind, identity: string): HistoryOperation | null {
  const operation = readHistoryOperation(paths, kind, identity);
  if (operation && operation.phase !== 'complete')
    refuse(`History cleanup is pending: ${operation.sourceDir}; inspect ${historyOperationPath(paths, operation.operationId)}`);
  return operation;
}

export interface TransferBundleOptions {
  paths: HistoryPaths;
  kind: HistoryKind;
  identity: string;
  changeName: string;
  sourceDir: string;
  cleanup: boolean;
  legacy?: boolean;
  prepare?: (stagingDir: string, operation: HistoryOperation) => Promise<void>;
}

export function preflightTransferSource(paths: HistoryPaths, sourceDir: string): InventoryEntry[] {
  contained(paths.sourceProjectRoot, sourceDir);
  if (exists(path.join(sourceDir, HISTORY_POINTER)))
    refuse(`Reserved history pointer already exists in source: ${sourceDir}`);
  return inventoryTree(sourceDir);
}

export async function transferBundle(options: TransferBundleOptions): Promise<HistoryOperation> {
  const { paths, kind, identity, sourceDir, cleanup, legacy = false } = options;
  HistoryPointerSchema.shape.identity.parse(identity);
  const original = preflightTransferSource(paths, sourceDir);
  let context: HistoryOperation | undefined;
  try {
    return await withHistoryClaim(paths, async () => {
      assertNoPendingHistory(paths, options.changeName);
      const operationId = randomUUID();
      const finalDir = path.join(rootFor(paths, kind), identity), stagingDir = path.join(paths.operationsRoot, `.staging-${operationId}`);
      if (exists(finalDir))
        refuse(`History destination already exists: ${finalDir}`);
      assertInventory(sourceDir, original);
      const operation: HistoryOperation = { version: 1, operationId, kind, identity, origin: historyOrigin(paths, options.changeName), sourceDir, stagingDir, finalDir, phase: 'copying', original, prepared: [], cleanup };
      context = operation;
      await saveOperation(paths, operation);
      fs.mkdirSync(stagingDir);
      copyTree(sourceDir, stagingDir, original);
      assertInventory(sourceDir, original);
      assertInventory(stagingDir, original);
      await withWritableDirectories(stagingDir, original, async () => { await options.prepare?.(stagingDir, operation); });
      contained(paths.operationsRoot, stagingDir);
      if (exists(path.join(stagingDir, HISTORY_POINTER)))
        refuse(`Reserved history pointer introduced during preparation: ${stagingDir}`);
      const pointer = JSON.stringify({ version: 1, operationId, kind, identity });
      await withWritableDirectories(stagingDir, [inventoryEntry(stagingDir, '')], async () => {
        fs.writeFileSync(path.join(stagingDir, HISTORY_POINTER), pointer, { flag: 'wx', mode: 0o600 });
      });
      operation.prepared = inventoryTree(stagingDir);
      operation.phase = 'prepared';
      await saveOperation(paths, operation);
      recheckHistoryPaths(paths);
      rootsSafe(paths);
      fs.mkdirSync(rootFor(paths, kind), { recursive: true });
      fs.mkdirSync(finalDir);
      fs.writeFileSync(path.join(finalDir, HISTORY_POINTER), pointer, { flag: 'wx', mode: 0o600 });
      copyTree(stagingDir, finalDir, operation.prepared, true);
      assertInventory(stagingDir, operation.prepared);
      assertInventory(finalDir, operation.prepared);
      await saveOperation(paths, { ...operation, phase: 'published' });
      operation.phase = 'published';
      if (cleanup) {
        contained(paths.sourceProjectRoot, sourceDir);
        assertInventory(sourceDir, original);
        for (const entry of [...original].reverse()) {
          const target = path.join(sourceDir, entry.path);
          if (entry.path)
            contained(sourceDir, path.dirname(target));
          if (!same(inventoryEntry(sourceDir, entry.path), entry))
            refuse(`History inventory changed during cleanup: ${target}`);
          if (entry.kind === 'directory')
            fs.rmdirSync(target);
          else
            fs.unlinkSync(target);
        }
      }
      await saveOperation(paths, { ...operation, phase: 'complete' });
      operation.phase = 'complete';
      if (legacy) await withWritableDirectories(finalDir, [inventoryEntry(finalDir, '')], async () => {
        fs.unlinkSync(path.join(finalDir, HISTORY_POINTER));
      });
      await withWritableDirectories(stagingDir, inventoryTree(stagingDir), async () => {
        fs.rmSync(stagingDir, { recursive: true });
      });
      return operation;
    });
  } catch (cause) {
    if (!context) throw cause;
    throw new HistoryError(cause instanceof Error ? cause.message : String(cause), { phase: context.phase, sourceDir, stagingDir: context.stagingDir, finalDir: context.finalDir, operationPath: historyOperationPath(paths, context.operationId) }, cause);
  }
}

export function diagnoseLocalHistory(paths: HistoryPaths): HistoryDiagnostic[] {
  rootsSafe(paths);
  if (paths.sourceProjectRoot === paths.historyProjectRoot)
    return [];
  const diagnostics: HistoryDiagnostic[] = [];
  for (const kind of ['archive', 'abandoned'] as const) {
    const local = path.join(paths.sourceProjectRoot, '.prospec', kind);
    contained(paths.sourceProjectRoot, local);
    if (!exists(local))
      continue;
    for (const identity of fs.readdirSync(local).sort()) {
      const source = path.join(local, identity), target = path.join(rootFor(paths, kind), identity);
      try {
        contained(local, source);
        contained(rootFor(paths, kind), target);
        if (exists(target) && same(inventoryTree(source), inventoryTree(target))) {
          readHistoryOperation(paths, kind, identity);
          continue;
        }
        diagnostics.push({ path: source, reason: `${exists(target) ? 'Conflicting' : 'Local-only'} history; inspect and run prospec history import --from ${paths.sourceProjectRoot}` });
      }
      catch (error) {
        diagnostics.push({ path: source, reason: String(error) });
      }
    }
  }
  return diagnostics;
}
