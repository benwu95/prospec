import { z } from 'zod';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
/** Shape only; contained readers additionally apply the resource-name guard. */
export const RetryLinkSchema = z.object({
  /** Entry ID relative to .prospec/abandoned; key retained for JSON compatibility. */
  archive: z.string().regex(/^\d{4}-\d{2}-\d{2}-.+$/),
  digest,
}).strict();
export type RetryLink = z.infer<typeof RetryLinkSchema>;

export const PreservationEntrySchema = z.discriminatedUnion('kind', [
  z.object({ path: z.string(), kind: z.literal('regular'), mode: z.number().int(), sha256: digest, blob: z.string() }).strict(),
  z.object({ path: z.string(), kind: z.literal('symlink'), target: z.string() }).strict(),
  z.object({ path: z.string(), kind: z.literal('deleted') }).strict(),
]);
export const PreservationManifestSchema = z.object({
  version: z.literal(1),
  root: z.string(),
  git_prefix: z.string(),
  head: z.string(),
  patches: z.object({ staged: digest, unstaged: digest }).strict(),
  entries: z.array(PreservationEntrySchema),
}).strict();
export type PreservationManifest = z.infer<typeof PreservationManifestSchema>;
export type PreservationEntry = z.infer<typeof PreservationEntrySchema>;

export const ABANDON_OPERATION_FILE = 'abandon-operation.json';
export const ABANDON_MANIFEST = 'preservation/manifest.json';
export const AbandonOperationSchema = z.object({
  version: z.literal(1), source: z.string(), source_digest: digest,
  phase: z.enum(['preserving', 'moving', 'publishing']),
  moved: z.array(z.string()), pending: z.array(z.string()),
}).strict();
export type AbandonOperation = z.infer<typeof AbandonOperationSchema>;

export interface AbandonFailureDetails {
  phase: AbandonOperation['phase'];
  sourceDir: string;
  /** Actual abandoned destination; legacy JSON key retained. */
  archiveDir: string;
  preservationDir: string;
  moved: string[];
  pending: string[];
  sourceEntries: string[] | null;
  archiveEntries: string[] | null;
}

export interface ChangeAbandonResult {
  changeName: string;
  /** Actual abandoned destination; legacy JSON key retained. */
  archiveDir: string;
  preservationDir: string;
  projectRoot: string;
  gitPrefix: string;
  reason: string;
  issue?: string;
}

export interface AbandonedAttempt extends RetryLink {
  name: string;
  issue?: string;
  reason: string;
  at: string;
  manifest: string;
}
export interface AbandonHistory {
  attempts: AbandonedAttempt[];
  errors: Array<{ name: string; error: string; source?: string }>;
}
