/**
 * Contracts of the repository test queue (REQ-TYPES-119): the persisted state every
 * worktree of one repository shares, and the busy outcome both entries report.
 */
import { z } from 'zod';

export const TEST_QUEUE_STATE_VERSION = 1;

/** Exit code of an entry that gave up waiting: EX_TEMPFAIL — nothing ran, retry later. */
export const TEST_QUEUE_BUSY_EXIT_CODE = 75;

/** Carries the holder's token to its command, so a nested entry of the same queue runs. */
export const TEST_QUEUE_TOKEN_ENV = 'PROSPEC_TEST_QUEUE_TOKEN';

/** How long a granted turn may stay in `preparing` before it can be taken from a holder
 *  whose liveness cannot be confirmed. */
export const TEST_QUEUE_PREPARE_LIMIT_MS = 600_000;
/** Added to a run's own timeout to form its deadline: the holder kills its command at the
 *  timeout, so only an abandoned turn is still held when the grace has passed. */
export const TEST_QUEUE_DEADLINE_GRACE_MS = 60_000;
export const TEST_QUEUE_MUTEX_WAIT_MS = 10_000;
export const TEST_QUEUE_POLL_MS = 1_000;

export const DEFAULT_TEST_QUEUE_WAIT_MS = 60_000;
export const DEFAULT_TEST_QUEUE_LEASE_MS = 300_000;
export const MIN_TEST_QUEUE_WAIT_MS = 0;
/** Above one poll plus one full mutex wait, so a waiter that is still polling keeps its place. */
export const MIN_TEST_QUEUE_LEASE_MS = 30_000;
export const MAX_TEST_QUEUE_MS = 2_147_483_647;

/** A process as the queue remembers it: its pid and the start reading taken when it was
 *  recorded — null where the platform offers none. */
export const ProcessIdentitySchema = z.object({
  pid: z.number().int().positive(),
  started: z.string().nullable(),
}).strict();
export type ProcessIdentity = z.infer<typeof ProcessIdentitySchema>;

export const PROCESS_TREE_KINDS = ['process-group', 'process'] as const;
export type ProcessTreeKind = (typeof PROCESS_TREE_KINDS)[number];

export const ProcessTreeSchema = ProcessIdentitySchema.extend({
  kind: z.enum(PROCESS_TREE_KINDS),
}).strict();
export type ProcessTree = z.infer<typeof ProcessTreeSchema>;

export const PROCESS_STATUSES = ['gone', 'alive', 'unknown'] as const;
export type ProcessStatus = (typeof PROCESS_STATUSES)[number];

export const TEST_QUEUE_PHASES = ['preparing', 'spawning', 'running'] as const;
export type TestQueuePhase = (typeof TEST_QUEUE_PHASES)[number];

const ticketBase = {
  seq: z.number().int().positive(),
  key: z.string().min(1),
  label: z.string(),
  worktree: z.string(),
  host: z.string(),
  lease_ms: z.number().int().positive(),
  heartbeat_ms: z.number().int().nonnegative(),
};

export const WaitingTicketSchema = z.object({ ...ticketBase, state: z.literal('waiting') }).strict();
export type WaitingTicket = z.infer<typeof WaitingTicketSchema>;

export const HoldingTicketSchema = z.object({
  ...ticketBase,
  state: z.literal('holding'),
  token: z.string().min(1),
  holder: ProcessIdentitySchema,
  granted_at_ms: z.number().int().nonnegative(),
  phase: z.enum(TEST_QUEUE_PHASES),
  deadline_ms: z.number().int().nonnegative(),
  trees: z.array(ProcessTreeSchema),
}).strict();
export type HoldingTicket = z.infer<typeof HoldingTicketSchema>;

export const TestQueueTicketSchema = z.discriminatedUnion('state', [WaitingTicketSchema, HoldingTicketSchema]);
export type TestQueueTicket = z.infer<typeof TestQueueTicketSchema>;

export const TestQueueStateSchema = z.object({
  version: z.literal(TEST_QUEUE_STATE_VERSION),
  next: z.number().int().positive(),
  tickets: z.array(TestQueueTicketSchema),
}).strict();
export type TestQueueState = z.infer<typeof TestQueueStateSchema>;

export const EMPTY_TEST_QUEUE_STATE: TestQueueState = { version: TEST_QUEUE_STATE_VERSION, next: 1, tickets: [] };

/** The ticket holding the turn, as a waiter is told about it. */
export interface TestQueueHolderInfo {
  label: string;
  worktree: string;
  host: string;
  granted_at_ms: number;
  /** Written by another host: no status is consulted and the turn is never taken from it. */
  other_host: boolean;
  /** The holder process no longer exists; the turn is held by what it left running. */
  holder_gone: boolean;
}

/** What a request is told when it first has to wait. */
export interface TestQueueWaitInfo {
  seq: number;
  ahead: number;
  holder?: TestQueueHolderInfo;
}

/** An entry that waited to its cap without the turn. Nothing was run. */
export interface TestQueueBusy {
  seq: number;
  ahead: number;
  queue_dir: string;
  lease_ms: number;
  holder?: TestQueueHolderInfo;
}
