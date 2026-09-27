/**
 * Delegated judgment — the ticket a delegating station records before it spawns a
 * delegate, and the facts the CLI records about it afterwards (REQ-TYPES-108).
 *
 * The lifecycle is issue → spawn → receive → (on a refusal, hand off to the human)
 * → settle. The mutation judgment runs at receipt, not at the sink: the review loop
 * applies fixes to the working tree before it merges, so by merge time the tree has
 * legitimately changed. The CLI detects and preserves; it never restores. Every
 * guarantee here is host-neutral — the CLI and git, never a host permission mechanism.
 */
import { z } from 'zod';

/** Stations whose sinks settle tickets. Plan/tasks/ff delegate without a ticket. */
export const DELEGATION_STATIONS = ['review', 'verify'] as const;
export type DelegationStation = (typeof DELEGATION_STATIONS)[number];

export const DELEGATION_STATES = ['open', 'received', 'refused', 'failed', 'consumed'] as const;
export type DelegationState = (typeof DELEGATION_STATES)[number];

/** Refusals that end an attempt. A payload that has not arrived, or a facet that
 *  cannot be read while every readable one is unchanged, leaves the ticket open. */
export const DELEGATION_REFUSAL_REASONS = ['schema', 'stale', 'mutated'] as const;
export type DelegationRefusalReason = (typeof DELEGATION_REFUSAL_REASONS)[number];

/** Bounds on waiting for a delegate, rendered into the delegation-protocol reference. */
export const DELEGATION_AWAIT = { idleMinutes: 10, maxPolls: 6, maxRespawns: 1 } as const;

/** Suffix of the role a degraded path's fresh run is ticketed under. */
export const FRESH_ROLE_SUFFIX = '-fresh';

/** Directory, under a change, that holds tickets, payloads and checkpoints. */
export const DELEGATION_DIR = '.delegated';
export const TICKET_SUFFIX = '.ticket.json';
export const PAYLOAD_SUFFIX = '.json';
export const CHECKPOINT_SUFFIX = '.checkpoint';

/** The repository-state facets a receipt compares, defined once. */
export const GIT_STATE_FACETS = ['content', 'head', 'index', 'refs', 'stash'] as const;
export type GitStateFacet = (typeof GIT_STATE_FACETS)[number];

/** In-progress operation markers, part of the `head` facet. */
export const GIT_OPERATION_MARKERS = [
  'MERGE_HEAD',
  'CHERRY_PICK_HEAD',
  'REVERT_HEAD',
  'rebase-merge',
  'rebase-apply',
  'sequencer',
  'BISECT_LOG',
] as const;
export type GitOperationMarker = (typeof GIT_OPERATION_MARKERS)[number];

/** Index entries that make the content facet unreadable. */
export const INDEX_BLOCKERS = ['unmerged', 'skip-worktree', 'gitlink'] as const;
export type IndexBlocker = (typeof INDEX_BLOCKERS)[number];

export interface DelegationKey {
  station: DelegationStation;
  role: string;
  round: number;
}

export interface DelegationStemParts extends DelegationKey {
  attempt: number;
}

const ROLE = '[a-z0-9]+(?:-[a-z0-9]+)*';
const POSITIVE = '[1-9][0-9]*';
const STEM = new RegExp(`^(${DELEGATION_STATIONS.join('|')})-(${ROLE})-(${POSITIVE})-(${POSITIVE})$`);

/** `<station>-<role>-<round>-<attempt>`; the last two segments are always round and
 *  attempt, so a role ending in digits stays unambiguous. */
export function parseDelegationStem(stem: string): DelegationStemParts | null {
  const match = STEM.exec(stem);
  if (!match) return null;
  return {
    station: match[1] as DelegationStation,
    role: match[2]!,
    round: Number(match[3]),
    attempt: Number(match[4]),
  };
}

export function formatDelegationStem(parts: DelegationStemParts): string {
  const stem = `${parts.station}-${parts.role}-${parts.round}-${parts.attempt}`;
  const parsed = parseDelegationStem(stem);
  if (
    parsed === null ||
    parsed.role !== parts.role ||
    parsed.round !== parts.round ||
    parsed.attempt !== parts.attempt
  ) {
    throw new Error(`Not a valid delegation key: ${JSON.stringify(parts)}`);
  }
  return stem;
}

/**
 * Normalize free text (a finding id such as `C-1`) into a role: lowercase, every run
 * of characters outside `[a-z0-9]` becomes one `-`, leading and trailing dashes go.
 * Two findings normalizing alike are told apart by the orchestrator's `-2`, `-3`.
 */
export function formatDelegationRole(text: string): string {
  const role = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (role === '') throw new Error(`Cannot derive a delegation role from ${JSON.stringify(text)}`);
  return role;
}

/** A normalized relative POSIX path: no empty, `.`, `..` or `.git` segment, not absolute. */
export function isNormalizedRelativePath(p: string): boolean {
  if (p === '' || p.startsWith('/') || p.includes('\\') || p.includes('\0')) return false;
  return p.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..' && segment !== '.git');
}

const Digest = z.string().regex(/^[0-9a-f]{64}$/);
const ObjectId = z.string().regex(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/);
const Millis = z.number().int().nonnegative();
const RelativePath = z.string().refine(isNormalizedRelativePath, 'not a normalized relative POSIX path');

/** A facet that could not be read carries its reason — never a stand-in value. */
const Unreadable = z.strictObject({ unreadable: z.string().min(1) });

export const RepoStateSchema = z.strictObject({
  content: z.union([z.strictObject({ digest: Digest }), Unreadable]),
  head: z.union([
    z.strictObject({
      ref: z.string().min(1).nullable(),
      commit: ObjectId.nullable(),
      operations: z.array(z.enum(GIT_OPERATION_MARKERS)),
    }),
    Unreadable,
  ]),
  index: z.union([
    z.strictObject({ digest: Digest, blockers: z.array(z.enum(INDEX_BLOCKERS)) }),
    Unreadable,
  ]),
  refs: z.union([
    z.strictObject({ entries: z.array(z.strictObject({ name: z.string().min(1), oid: ObjectId })) }),
    Unreadable,
  ]),
  stash: z.union([z.strictObject({ entries: z.array(ObjectId) }), Unreadable]),
});
export type RepoState = z.infer<typeof RepoStateSchema>;

/** One uncommitted path in a checkpoint. A symlink keeps its target here — never a link on disk. */
export const CheckpointEntrySchema = z.strictObject({
  path: RelativePath,
  kind: z.enum(['regular', 'symlink', 'deleted']),
  mode: z.number().int().nonnegative().optional(),
  sha256: Digest.optional(),
  target: z.string().min(1).optional(),
});
export type CheckpointEntry = z.infer<typeof CheckpointEntrySchema>;

/** What the checkpoint directory holds, with the sha256 a human verifies a copy against. */
export const CheckpointSchema = z.strictObject({
  entries: z.array(CheckpointEntrySchema),
  index_sha256: Digest,
});
export type Checkpoint = z.infer<typeof CheckpointSchema>;

export const DelegationTicketSchema = z.strictObject({
  version: z.literal(1),
  station: z.enum(DELEGATION_STATIONS),
  role: z.string().regex(new RegExp(`^${ROLE}$`)),
  round: z.number().int().positive(),
  attempt: z.number().int().positive(),
  state: z.enum(DELEGATION_STATES),
  issued_at_ms: Millis,
  pre_spawn: RepoStateSchema,
  /** Project-relative path the delegate must write. */
  payload_path: z.string().min(1),
  /** The snapshot's path comes from mkdtemp, so only the ticket knows it; release still checks three conditions. */
  snapshot: z.strictObject({ path: z.string().min(1), nonce: z.string().regex(/^[0-9a-f]{32}$/) }),
  checkpoint: CheckpointSchema,
  /** Set when a receipt found every readable facet unchanged but one facet unreadable: the delegate returned. */
  returned_unreadable_at_ms: Millis.optional(),
  received: z.strictObject({ at_ms: Millis }).optional(),
  refusal: z
    .strictObject({
      reason: z.enum(DELEGATION_REFUSAL_REASONS),
      detail: z.string().min(1),
      observed: RepoStateSchema.optional(),
      changed: z.array(z.enum(GIT_STATE_FACETS)).optional(),
    })
    .optional(),
  failure: z
    .strictObject({
      at_ms: Millis,
      reason: z.string().min(1),
      /** Set when a human accepted the current tree; facets that could not be read stay unreadable. */
      accepted: z.strictObject({ state: RepoStateSchema }).optional(),
    })
    .optional(),
  consumed_at_ms: Millis.optional(),
});
export type DelegationTicket = z.infer<typeof DelegationTicketSchema>;
