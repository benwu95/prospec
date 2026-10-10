import { describe, expect, it } from 'vitest';
import { HistoryOperationSchema, HistoryOriginSchema, HistoryPointerSchema, InventoryEntrySchema } from '../../../src/types/history.js';
import { AbandonOperationSchema } from '../../../src/types/abandon.js';
import { HistoryError } from '../../../src/types/errors.js';

const origin = { commonDir: '/repo/.git', worktree: '/repo', projectPrefix: '', changeName: 'x' };
const pointer = { version: 1, operationId: 'abc', kind: 'archive', identity: '2026-10-10-x' };
const operation = { ...pointer, origin, sourceDir: '/repo/.prospec/changes/x', stagingDir: '/repo/.prospec/history-operations/abc/staging', finalDir: '/repo/.prospec/archive/2026-10-10-x', phase: 'copying', original: [], prepared: [], cleanup: true };

describe('history control contracts', () => {
  it('retains origin identity independently of the current branch name', () => {
    expect(HistoryOriginSchema.parse(origin)).toEqual(origin);
    expect(HistoryOriginSchema.parse({ ...origin, commonDir: null })).toEqual({ ...origin, commonDir: null });
  });
  it('validates the versioned native pointer and external operation', () => {
    expect(HistoryPointerSchema.parse(pointer)).toEqual(pointer);
    expect(HistoryOperationSchema.parse(operation)).toEqual(operation);
  });
  it.each([{ version: 2 }, { operationId: '../outside' }, { identity: '../outside' }, { kind: 'changes' }, { unexpected: true }])('refuses malformed pointer %#', (patch) => {
    expect(HistoryPointerSchema.safeParse({ ...pointer, ...patch }).success).toBe(false);
  });
  it.each([{ phase: 'done' }, { sourceDir: 1 }, { original: [{ path: '../file', kind: 'regular', mode: 420, sha256: 'x' }] }, { origin: null }])('refuses malformed operation %#', (patch) => {
    expect(HistoryOperationSchema.safeParse({ ...operation, ...patch }).success).toBe(false);
  });
  it('records regular bytes, directory modes and literal link targets', () => {
    expect(InventoryEntrySchema.parse({ path: 'file', kind: 'regular', mode: 493, sha256: 'a'.repeat(64) })).toMatchObject({ mode: 493 });
    expect(InventoryEntrySchema.parse({ path: '', kind: 'directory', mode: 448 }).kind).toBe('directory');
    expect(InventoryEntrySchema.parse({ path: 'link', kind: 'symlink', target: '../outside' }).kind).toBe('symlink');
    expect(InventoryEntrySchema.safeParse({ path: '../outside', kind: 'directory', mode: 448 }).success).toBe(false);
  });
  it('adds optional origin without rewriting legacy abandon records', () => {
    const old = { version: 1, source: 'x', source_digest: 'a'.repeat(64), phase: 'moving', moved: [], pending: [] };
    expect(AbandonOperationSchema.parse(old)).toEqual(old);
    expect(AbandonOperationSchema.parse({ ...old, origin }).origin).toEqual(origin);
  });
  it('exposes inspectable partial paths and never claims rollback', () => {
    const details = { sourceDir: operation.sourceDir, stagingDir: operation.stagingDir, finalDir: operation.finalDir, operationPath: '/repo/op.json', phase: 'copying' as const };
    const error = new HistoryError('copy failed', details);
    expect(error.code).toBe('HISTORY_INCOMPLETE');
    expect(error.details).toEqual(details);
    expect(error.suggestion).toContain(details.sourceDir);
    expect(error.suggestion).toContain(details.operationPath);
  });
});
