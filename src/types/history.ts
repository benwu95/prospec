import { z } from 'zod';
import * as path from 'node:path';

const identity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).refine((s) => !s.includes('..'));
const relativeEntry = z.string().refine((s) => !path.isAbsolute(s) && !s.split(path.sep).join('/').split('/').includes('..'));
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const HISTORY_POINTER = '.prospec-transfer.json';
export const HistoryKindSchema = z.enum(['archive', 'abandoned']);
export type HistoryKind = z.infer<typeof HistoryKindSchema>;
export const HistoryOriginSchema = z.object({
  commonDir: z.string().nullable(), worktree: z.string(), projectPrefix: z.string(), changeName: identity,
}).strict();
export type HistoryOrigin = z.infer<typeof HistoryOriginSchema>;

export interface HistoryPaths {
  sourceProjectRoot: string;
  historyProjectRoot: string;
  archiveRoot: string;
  abandonedRoot: string;
  operationsRoot: string;
  commonDir: string | null;
  worktree: string;
  projectPrefix: string;
}

export const InventoryEntrySchema = z.discriminatedUnion('kind', [
  z.object({ path: relativeEntry, kind: z.literal('regular'), mode: z.number().int(), sha256: digest }).strict(),
  z.object({ path: relativeEntry, kind: z.literal('directory'), mode: z.number().int() }).strict(),
  z.object({ path: relativeEntry, kind: z.literal('symlink'), target: z.string() }).strict(),
]);
export type InventoryEntry = z.infer<typeof InventoryEntrySchema>;
export const HistoryPointerSchema = z.object({
  version: z.literal(1), operationId: identity, kind: HistoryKindSchema, identity,
}).strict();
export type HistoryPointer = z.infer<typeof HistoryPointerSchema>;
export const HistoryOperationSchema = HistoryPointerSchema.extend({
  origin: HistoryOriginSchema,
  sourceDir: z.string(), stagingDir: z.string(), finalDir: z.string(),
  phase: z.enum(['copying', 'prepared', 'published', 'complete']),
  original: z.array(InventoryEntrySchema), prepared: z.array(InventoryEntrySchema), cleanup: z.boolean(),
}).strict();
export type HistoryOperation = z.infer<typeof HistoryOperationSchema>;
export interface HistoryFailureDetails {
  phase: HistoryOperation['phase'];
  sourceDir: string;
  stagingDir: string;
  finalDir: string;
  operationPath: string;
}
export interface HistoryDiagnostic { path: string; reason: string }
export interface HistoryPathsResult { paths: HistoryPaths; diagnostics: HistoryDiagnostic[] }
export interface HistoryImportEntry {
  kind: HistoryKind;
  identity: string;
  source: string;
  destination: string;
  outcome: 'imported' | 'identical' | 'conflicting' | 'failed' | 'planned';
  reason?: string;
  details?: HistoryFailureDetails;
}
export interface HistoryImportResult { paths: HistoryPaths; entries: HistoryImportEntry[]; dryRun: boolean }
