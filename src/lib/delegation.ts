/**
 * Delegation tickets: issue → spawn → receive → (on a refusal, hand off to the
 * human) → settle (REQ-LIB-092).
 *
 * The mutation judgment runs at receipt — the moment a delegate returns — because
 * the review loop applies fixes to the working tree before it merges. A sink then
 * only asks whether every latest attempt has been settled. The judgment cores
 * (`judgeIssue`, `judgeReceipt`, `judgeFailure`, `judgeSettlement`) are pure; the
 * rest collects their facts and writes their verdicts back to the ticket files.
 *
 * This module writes only under `.prospec/changes/<name>/.delegated/`, the change's
 * `metadata.yaml` (through the failure hook its caller passes) and the snapshot
 * directory. A mutation is detected and its evidence preserved; recovering the
 * tree is the human's — nothing here writes the working tree, the index, HEAD or
 * refs. Transitions assume one orchestrator running them in sequence: each re-reads
 * its ticket just before writing and refuses when it changed since it was judged,
 * which narrows — not closes — the window of two concurrent transitions of a stem.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  CHECKPOINT_SUFFIX,
  DELEGATION_DIR,
  DelegationTicketSchema,
  GIT_STATE_FACETS,
  PAYLOAD_SUFFIX,
  TICKET_SUFFIX,
  formatDelegationStem,
  parseDelegationStem,
  type DelegationKey,
  type DelegationRefusalReason,
  type DelegationStation,
  type DelegationTicket,
  type GitStateFacet,
  type RepoState,
} from '../types/delegation.js';
import { DelegationRefusedError, type DelegationOperation } from '../types/errors.js';
import { JudgmentDimensionsInputSchema, ReviewFindingsInputSchema } from '../types/station.js';
import {
  checkpointDirOf,
  claimCheckpointDir,
  createSnapshot,
  delegationDirOf,
  ensureDelegationDir,
  releaseCheckpoint,
  releaseSnapshot,
  writeCheckpoint,
  type SnapshotRef,
} from './delegation-checkpoint.js';
import { gitProjectPrefix } from './drift-sources.js';
import { atomicWrite } from './fs-utils.js';
import { withFixedGitEnv } from './git-read.js';
import {
  captureRepoState,
  describeFacet,
  describeStateChanges,
  diffRepoState,
  isFullyReadable,
  isUnreadable,
  sameRepoState,
  type FacetChange,
} from './repo-state.js';

export interface StoredTicket {
  stem: string;
  ticket: DelegationTicket;
}

/** Causal receipt facts shared by sinks; consumption and wall-clock dates are output lifecycle. */
export function delegationAttemptInputs(tickets: readonly StoredTicket[], station: DelegationStation) {
  return tickets.filter(({ ticket }) => ticket.station === station)
    .map(({ stem, ticket }) => ({ stem, pre_spawn: ticket.pre_spawn, received: !!ticket.received, refusal: ticket.refusal,
      failure: ticket.failure && { reason: ticket.failure.reason, accepted: ticket.failure.accepted } }));
}

const stemOf = (ticket: DelegationTicket, attempt = ticket.attempt): string =>
  formatDelegationStem({ station: ticket.station, role: ticket.role, round: ticket.round, attempt });
const toSecond = (ms: number): number => Math.floor(ms / 1000);
const keyOf = (t: { station: string; role: string; round: number }): string => `${t.station}\0${t.role}\0${t.round}`;
const byStem = (a: StoredTicket, b: StoredTicket): number => (a.stem < b.stem ? -1 : a.stem > b.stem ? 1 : 0);
const changeNameOf = (changeDir: string): string => path.basename(changeDir);
const delegateCommand = (changeDir: string, args: string): string => `prospec change delegate --change ${changeNameOf(changeDir)} ${args}`;

/**
 * Each key's latest attempt, when it is not consumed. The latest is judged over
 * every ticket of the key, consumed ones included: a superseded attempt never comes
 * back to block a sink or an issue once the attempt that replaced it was consumed.
 */
function latestLive(tickets: readonly StoredTicket[]): StoredTicket[] {
  const latest = new Map<string, StoredTicket>();
  for (const t of tickets) {
    const current = latest.get(keyOf(t.ticket));
    if (current === undefined || t.ticket.attempt > current.ticket.attempt) latest.set(keyOf(t.ticket), t);
  }
  return [...latest.values()].filter((t) => t.ticket.state !== 'consumed').sort(byStem);
}

/** Other latest attempts whose delegate may still be running: open, with no recorded return. */
function runningSiblings(tickets: readonly StoredTicket[], stem: string): string[] {
  return latestLive(tickets)
    .filter((x) => x.stem !== stem && x.ticket.state === 'open' && x.ticket.returned_unreadable_at_ms === undefined)
    .map((x) => x.stem);
}

function changedFacets(pre: RepoState, now: RepoState): string {
  return describeStateChanges(pre, now)
    .map((c) => (isUnreadable(now[c.facet]) ? `${c.facet} ${c.after}` : `${c.facet} (pre-spawn ${c.before}, now ${c.after})`))
    .join('; ');
}

/** The hand-off every mutation refusal names: the checkpoint, and that the human decides. */
function handOff(changeDir: string, stem: string): string {
  return `Stop and hand it to the human: with their consent, bring the tree back to its pre-spawn state using git and the copies in ${checkpointDirOf(changeDir, stem)}, then issue a new attempt — or the human ends it with \`${delegateCommand(changeDir, `--spawn-failed ${stem} --reason "<why>" --accept-current-tree`)}\``;
}

// --- Pure judgments ---------------------------------------------------------

export interface IssueFacts {
  changeDir: string;
  /** Every ticket of the change. */
  tickets: StoredTicket[];
  key: DelegationKey;
  current: RepoState;
  payloadExists: boolean;
  /** Attempts of the key whose checkpoint outlived its ticket — never reused. */
  leftoverAttempts?: number[];
}

/** The highest attempt a key has among `tickets`, or 0. */
function latestAttemptOf(tickets: readonly StoredTicket[], key: DelegationKey): number {
  return tickets.filter((t) => keyOf(t.ticket) === keyOf(key)).reduce((max, t) => Math.max(max, t.ticket.attempt), 0);
}

/** The next attempt number of a key: past every ticket and every leftover checkpoint. */
export function nextAttempt(tickets: readonly StoredTicket[], key: DelegationKey, leftoverAttempts: readonly number[] = []): number {
  return Math.max(latestAttemptOf(tickets, key), ...leftoverAttempts) + 1;
}

/** One line naming every schema issue, for a refusal. */
function formatSchemaIssues(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string {
  return issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export type IssueVerdict = { kind: 'issue'; attempt: number } | { kind: 'refused'; message: string; suggestion: string; ticket?: string };

/** Whether a new attempt may be issued for a key (REQ-LIB-092). */
export function judgeIssue(facts: IssueFacts): IssueVerdict {
  const { changeDir, tickets, key, current } = facts;
  const attempt = nextAttempt(tickets, key, facts.leftoverAttempts);
  if (!isFullyReadable(current)) {
    const unreadable = GIT_STATE_FACETS.filter((facet) => isUnreadable(current[facet]));
    return {
      kind: 'refused',
      message: `The repository state cannot be read (${unreadable.map((f) => `${f} ${describeFacet(current, f)}`).join('; ')})`,
      suggestion: "Take the station's Harness Degradation path (in-session) and disclose the round as not covered",
    };
  }
  for (const t of latestLive(tickets)) {
    if ((t.ticket.state === 'open' || t.ticket.state === 'refused') && !sameRepoState(t.ticket.pre_spawn, current)) {
      return {
        kind: 'refused',
        message: `Attempt ${t.stem} is ${t.ticket.state}, and the tree is not what it started from (${changedFacets(t.ticket.pre_spawn, current)}; its checkpoint: ${checkpointDirOf(changeDir, t.stem)}) — a new ticket is issued only once the tree is back at its pre-spawn state`,
        suggestion: t.ticket.state === 'open'
          ? `Receive ${t.stem} first (\`${delegateCommand(changeDir, `--receive ${t.stem}`)}\`)`
          : handOff(changeDir, t.stem),
        ticket: t.stem,
      };
    }
  }
  if (facts.payloadExists) {
    const stem = formatDelegationStem({ ...key, attempt });
    return {
      kind: 'refused',
      message: `Payload for ${stem} already exists — it cannot be admitted as the output of a new attempt`,
      suggestion: `Remove the payload file of ${stem}, then issue the ticket again`,
      ticket: stem,
    };
  }
  return { kind: 'issue', attempt };
}

export type PayloadFacts =
  | { kind: 'missing' }
  | { kind: 'not-regular' }
  | { kind: 'regular'; size: number; mtimeMs: number; schemaError: string | null; incomplete?: string };

export interface ReceiptFacts {
  changeDir: string;
  ticket: DelegationTicket;
  /** Highest attempt any ticket of the same key carries. */
  latestAttempt: number;
  payload: PayloadFacts;
  current: RepoState;
}

export type ReceiptVerdict =
  | { kind: 'not-receivable'; reason: 'not-open' | 'superseded'; detail: string }
  | { kind: 'pending'; reason: 'unreadable' | 'missing' | 'not-regular' | 'empty' | 'incomplete'; detail: string }
  | { kind: 'refused'; reason: 'mutated'; detail: string; changed: GitStateFacet[]; facets: FacetChange[]; checkpoint: string }
  | { kind: 'refused'; reason: Exclude<DelegationRefusalReason, 'mutated'>; detail: string }
  | { kind: 'received' };

/** Judge a returned payload against its ticket: readable facets first, then the payload. */
export function judgeReceipt(facts: ReceiptFacts): ReceiptVerdict {
  const { ticket, payload, current } = facts;
  const stem = stemOf(ticket);
  if (ticket.state !== 'open') return { kind: 'not-receivable', reason: 'not-open', detail: `ticket ${stem} is ${ticket.state}, not open` };
  if (facts.latestAttempt > ticket.attempt) {
    return { kind: 'not-receivable', reason: 'superseded', detail: `ticket ${stem} was superseded by ${stemOf(ticket, facts.latestAttempt)}` };
  }
  const diff = diffRepoState(ticket.pre_spawn, current);
  if (diff.changed.length > 0) {
    const checkpoint = checkpointDirOf(facts.changeDir, stem);
    return {
      kind: 'refused',
      reason: 'mutated',
      detail: `delegate mutated the tree: ${changedFacets(ticket.pre_spawn, current)}; the issue-time copies are in ${checkpoint} — the flow stops here, recovery is the human's`,
      changed: diff.changed,
      facets: describeStateChanges(ticket.pre_spawn, current),
      checkpoint,
    };
  }
  if (diff.unreadable.length > 0) {
    return {
      kind: 'pending',
      reason: 'unreadable',
      detail: `${diff.unreadable.map((f) => `${f} ${describeFacet(current, f)}`).join('; ')} — every readable facet is unchanged; remove the cause and receive again, or hand it to the human`,
    };
  }
  if (payload.kind === 'missing') return { kind: 'pending', reason: 'missing', detail: `payload ${ticket.payload_path} has not been written yet` };
  if (payload.kind === 'not-regular') return { kind: 'pending', reason: 'not-regular', detail: `payload ${ticket.payload_path} is not a regular file` };
  if (payload.size === 0) return { kind: 'pending', reason: 'empty', detail: `payload ${ticket.payload_path} is empty` };
  if (payload.incomplete !== undefined) {
    return {
      kind: 'pending',
      reason: 'incomplete',
      detail: `payload ${ticket.payload_path} is not complete JSON yet (${payload.incomplete}) — it may still be being written; past the bounded wait, end it with --spawn-failed`,
    };
  }
  if (payload.schemaError !== null) {
    return { kind: 'refused', reason: 'schema', detail: `payload ${ticket.payload_path} does not match the ${ticket.station} schema: ${payload.schemaError}` };
  }
  if (toSecond(payload.mtimeMs) < toSecond(ticket.issued_at_ms)) {
    return { kind: 'refused', reason: 'stale', detail: `payload ${ticket.payload_path} was last modified before ticket ${stem} was issued` };
  }
  return { kind: 'received' };
}

export interface FailureFacts {
  changeDir: string;
  target: StoredTicket;
  /** Every ticket of the change. */
  tickets: StoredTicket[];
  current: RepoState;
  accept: boolean;
}

export type FailureVerdict = { kind: 'end'; stems: string[] } | { kind: 'refused'; message: string; suggestion: string };

/** Whether an attempt may be ended as failed, and which attempts end with it (REQ-LIB-092). */
export function judgeFailure(facts: FailureFacts): FailureVerdict {
  const { changeDir, target, tickets, current } = facts;
  const t = target.ticket;
  const latestAttempt = latestAttemptOf(tickets, t);
  if (latestAttempt > t.attempt) {
    return { kind: 'refused', message: `Ticket ${target.stem} was superseded by ${stemOf(t, latestAttempt)}`, suggestion: `End ${stemOf(t, latestAttempt)} instead` };
  }
  if (t.state !== 'open' && t.state !== 'refused') {
    return { kind: 'refused', message: `Ticket ${target.stem} is ${t.state}; only an open or refused ticket can be ended`, suggestion: 'Nothing to end' };
  }
  if (!facts.accept) {
    if (!sameRepoState(t.pre_spawn, current)) {
      return {
        kind: 'refused',
        message: `The repository is not what it was when ${target.stem} was issued (${changedFacets(t.pre_spawn, current)}; its checkpoint: ${checkpointDirOf(changeDir, target.stem)}) — ending the attempt now would hide what changed it`,
        suggestion: t.state === 'refused'
          ? `${handOff(changeDir, target.stem)}; add --accept-current-tree only on the human's instruction`
          : `Receive it (\`${delegateCommand(changeDir, `--receive ${target.stem}`)}\`) so the change is recorded, then stop and hand it to the human — only on the human's instruction add --accept-current-tree`,
      };
    }
    return { kind: 'end', stems: [target.stem] };
  }
  if (GIT_STATE_FACETS.every((facet) => isUnreadable(current[facet]))) {
    return {
      kind: 'refused',
      message: 'The repository state cannot be read at all, so there is no current tree to record as accepted',
      suggestion: 'Make the repository readable (run the command inside it), then accept again',
    };
  }
  const running = runningSiblings(tickets, target.stem);
  if (running.length > 0) {
    return {
      kind: 'refused',
      message: `A human acceptance would end attempts while ${running.join(', ')} may still be running — its snapshot would go and its later damage would go unseen`,
      suggestion: `Receive or end ${running.join(', ')} first`,
    };
  }
  const siblings = latestLive(tickets).filter(
    (x) => x.stem !== target.stem && (x.ticket.state === 'refused' || (x.ticket.state === 'open' && x.ticket.returned_unreadable_at_ms !== undefined)),
  );
  return { kind: 'end', stems: [target.stem, ...siblings.map((x) => x.stem)] };
}

export type SettlementVerdict =
  | { kind: 'not-ticketed' }
  | { kind: 'unsettled'; blocking: StoredTicket[] }
  | {
      kind: 'settled';
      received: string[];
      failed: string[];
      accepted: number;
      /** Over every live attempt of the station, superseded ones included. */
      mutated: number;
      /** Every live attempt, as judged — consumption re-checks each against the disk. */
      live: StoredTicket[];
    };

/** Judge whether a sink may proceed over one station's tickets. */
export function judgeSettlement(tickets: readonly StoredTicket[]): SettlementVerdict {
  const live = tickets.filter((t) => t.ticket.state !== 'consumed').sort(byStem);
  if (live.length === 0) return { kind: 'not-ticketed' };
  const latests = latestLive(tickets);
  const blocking = latests.filter((t) => t.ticket.state === 'open' || t.ticket.state === 'refused');
  if (blocking.length > 0) return { kind: 'unsettled', blocking };
  return {
    kind: 'settled',
    received: latests.filter((t) => t.ticket.state === 'received').map((t) => t.stem),
    failed: latests.filter((t) => t.ticket.state === 'failed').map((t) => t.stem),
    accepted: live.filter((t) => t.ticket.failure?.accepted !== undefined).length,
    mutated: live.filter((t) => t.ticket.refusal?.reason === 'mutated').length,
    live,
  };
}

/** Whether a ticket's checkpoint must outlive it: a human accepted the tree, so it may hold the only copy of what was lost. */
export function keepsCheckpoint(ticket: DelegationTicket): boolean {
  return ticket.failure?.accepted !== undefined;
}

// --- Ticket files -----------------------------------------------------------

function ticketPath(changeDir: string, stem: string): string {
  return path.join(delegationDirOf(changeDir), `${stem}${TICKET_SUFFIX}`);
}

function refused(operation: DelegationOperation, message: string, suggestion: string, ticket?: string): DelegationRefusedError {
  return new DelegationRefusedError({ operation, message, suggestion, ticket });
}

/** One ticket file, read strictly: its name, schema, fields and payload path must all agree. */
function readTicketFile(changeDir: string, stem: string, operation: DelegationOperation): DelegationTicket {
  const file = ticketPath(changeDir, stem);
  const unreadable = (why: string): DelegationRefusedError =>
    refused(operation, `Delegation ticket ${file} is unreadable: ${why}`, `Delete ${file} and issue a new ticket with \`prospec change delegate\``, stem);
  const parts = parseDelegationStem(stem);
  if (parts === null) throw unreadable('the file name is not a delegation stem');
  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw unreadable(error instanceof Error ? error.message : String(error));
  }
  const parsed = DelegationTicketSchema.safeParse(json);
  if (!parsed.success) throw unreadable(formatSchemaIssues(parsed.error.issues));
  const t = parsed.data;
  if (t.station !== parts.station || t.role !== parts.role || t.round !== parts.round || t.attempt !== parts.attempt) {
    throw unreadable('its fields do not match its file name');
  }
  const expected = ['.prospec', 'changes', changeNameOf(changeDir), DELEGATION_DIR, `${stem}${PAYLOAD_SUFFIX}`].join('/');
  if (t.payload_path !== expected) throw unreadable('its payload path is not the one its stem assigns');
  return t;
}

/** Every ticket of a change. An unreadable ticket fails closed — never skipped. */
export function readTickets(changeDir: string, operation: DelegationOperation): StoredTicket[] {
  const dir = delegationDirOf(changeDir);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw refused(operation, `Delegation directory is unreadable: ${dir}`, 'Check the directory permissions, then retry');
  }
  return names
    .filter((name) => name.endsWith(TICKET_SUFFIX))
    .map((name) => {
      const stem = name.slice(0, -TICKET_SUFFIX.length);
      return { stem, ticket: readTicketFile(changeDir, stem, operation) };
    })
    .sort(byStem);
}

/**
 * Write one ticket transition: re-read the ticket immediately before the write and
 * refuse when it no longer equals the ticket the verdict was judged against.
 */
export async function transitionTicket(
  changeDir: string,
  stem: string,
  judged: DelegationTicket,
  next: DelegationTicket,
  operation: DelegationOperation,
): Promise<void> {
  const onDisk = readTicketFile(changeDir, stem, operation);
  if (!isDeepStrictEqual(onDisk, judged)) {
    throw refused(
      operation,
      `Ticket ${stem} changed after it was judged — another transition of it ran concurrently`,
      'Run the command again; one orchestrator runs a change\'s delegation commands one at a time',
      stem,
    );
  }
  await atomicWrite(ticketPath(changeDir, stem), `${JSON.stringify(next, null, 2)}\n`);
}

/**
 * Create a ticket file whole and without clobbering: `atomicWrite` renames over an
 * existing file, so the new ticket is written to a temporary file and hard-linked
 * into place, which fails if the name already exists.
 */
export function createTicketExclusive(changeDir: string, stem: string, ticket: DelegationTicket): void {
  const final = ticketPath(changeDir, stem);
  const body = `${JSON.stringify(ticket, null, 2)}\n`;
  const tmp = path.join(delegationDirOf(changeDir), `.${stem}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, body);
  try {
    fs.linkSync(tmp, final);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw error;
    // A filesystem without hard links: exclusive create keeps the no-clobber half.
    fs.writeFileSync(final, body, { flag: 'wx' });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/**
 * Release a ticket's snapshot (three conditions) and — unless a human accepted it —
 * its checkpoint (derived path), never throwing: what could not be removed is returned.
 */
function releaseAttempt(changeDir: string, stored: StoredTicket): string[] {
  const left: string[] = [];
  if (!keepsCheckpoint(stored.ticket) && !releaseCheckpoint(changeDir, stored.stem)) {
    left.push(checkpointDirOf(changeDir, stored.stem));
  }
  try {
    if (!releaseSnapshot(stored.ticket.snapshot, stored.stem)) left.push(stored.ticket.snapshot.path);
  } catch {
    left.push(stored.ticket.snapshot.path);
  }
  return left;
}

/** Attempt numbers of a key whose checkpoint directory still exists. */
function leftoverAttemptsOf(changeDir: string, key: DelegationKey): number[] {
  let names: string[];
  try {
    names = fs.readdirSync(delegationDirOf(changeDir));
  } catch {
    return [];
  }
  const out: number[] = [];
  for (const name of names) {
    if (!name.endsWith(CHECKPOINT_SUFFIX)) continue;
    const parts = parseDelegationStem(name.slice(0, -CHECKPOINT_SUFFIX.length));
    // A name a ticket could never carry (an attempt past the safe integers) is not an attempt.
    if (parts === null || keyOf(parts) !== keyOf(key) || !Number.isSafeInteger(parts.attempt + 1)) continue;
    if (fs.lstatSync(path.join(delegationDirOf(changeDir), name)).isDirectory()) out.push(parts.attempt);
  }
  return out;
}

function findTicket(changeDir: string, stem: string, operation: DelegationOperation): { found: StoredTicket; tickets: StoredTicket[]; latestAttempt: number } {
  const tickets = readTickets(changeDir, operation);
  const found = tickets.find((t) => t.stem === stem);
  if (found === undefined) {
    throw refused(operation, `No delegation ticket ${stem}`, 'Pass the stem `prospec change delegate` printed when it issued the ticket', stem);
  }
  return { found, tickets, latestAttempt: latestAttemptOf(tickets, found.ticket) };
}

// --- Lifecycle operations ---------------------------------------------------

export interface IssuedTicket {
  stem: string;
  ticket: DelegationTicket;
  /** Absolute path the delegate must write. */
  payloadPath: string;
  /** Absolute path of the project inside the snapshot. */
  snapshotProjectPath: string;
  /** What superseded attempts held that could not be removed. */
  unreleased: string[];
}

export async function issueTicket(options: { cwd: string; changeDir: string; key: DelegationKey; now?: () => number }): Promise<IssuedTicket> {
  const { cwd, changeDir, key } = options;
  const issuedAt = (options.now ?? Date.now)();
  const tickets = readTickets(changeDir, 'issue');
  try {
    formatDelegationStem({ ...key, attempt: 1 });
  } catch {
    throw refused('issue', `Not a valid delegation key: station ${key.station}, role ${key.role}, round ${key.round}`, 'Use a role of letters, digits and hyphens, and a positive round');
  }
  const leftoverAttempts = leftoverAttemptsOf(changeDir, key);
  const provisionalStem = formatDelegationStem({ ...key, attempt: nextAttempt(tickets, key, leftoverAttempts) });
  const payloadPath = path.join(delegationDirOf(changeDir), `${provisionalStem}${PAYLOAD_SUFFIX}`);
  const current = captureRepoState(cwd);
  const verdict = judgeIssue({ changeDir, tickets, key, current, payloadExists: fs.existsSync(payloadPath), leftoverAttempts });
  if (verdict.kind === 'refused') throw refused('issue', verdict.message, verdict.suggestion, verdict.ticket);
  const stem = formatDelegationStem({ ...key, attempt: verdict.attempt });

  await ensureDelegationDir(changeDir);
  claimCheckpointDir(changeDir, stem);
  let snapshot: SnapshotRef | undefined;
  let ticket: DelegationTicket;
  try {
    const checkpoint = await writeCheckpoint(cwd, changeDir, stem);
    const head = current.head as { commit: string | null };
    const content = current.content as { digest: string };
    snapshot = await createSnapshot({ cwd, changeDir, stem, headCommit: head.commit, checkpoint, preSpawnContentDigest: content.digest });
    // The checkpoint and the snapshot were read after `current`: a tree that moved
    // in between would leave the ticket describing one state and the copies another.
    const settled = captureRepoState(cwd);
    if (!sameRepoState(current, settled)) {
      throw refused('issue', `The repository changed while ticket ${stem} was being issued (${changedFacets(current, settled)})`, 'Let the tree settle, then issue again', stem);
    }
    ticket = {
      version: 1,
      station: key.station,
      role: key.role,
      round: key.round,
      attempt: verdict.attempt,
      state: 'open',
      issued_at_ms: issuedAt,
      pre_spawn: current,
      payload_path: path.relative(cwd, payloadPath).split(path.sep).join('/'),
      snapshot,
      checkpoint,
    };
    const valid = DelegationTicketSchema.safeParse(ticket);
    if (!valid.success) {
      throw refused('issue', `Ticket ${stem} would not be readable: ${formatSchemaIssues(valid.error.issues)}`, 'Use a smaller round, or remove what made its key unusual under .delegated/, then issue again', stem);
    }
    createTicketExclusive(changeDir, stem, ticket);
  } catch (error) {
    // Nothing of a failed issue stays: no ticket was linked, and the checkpoint
    // directory and the snapshot are this call's own.
    releaseCheckpoint(changeDir, stem);
    try {
      if (snapshot !== undefined) releaseSnapshot(snapshot, stem);
    } catch {
      // the snapshot lies under the temporary directory, removed by the system in time
    }
    if (error instanceof DelegationRefusedError) throw error;
    const exists = (error as NodeJS.ErrnoException).code === 'EEXIST';
    throw refused('issue', exists ? `Ticket ${stem} was issued concurrently` : `Ticket ${stem} could not be issued: ${String(error)}`, 'Issue the ticket again', stem);
  }
  const unreleased = tickets.filter((t) => keyOf(t.ticket) === keyOf(key)).flatMap((previous) => releaseAttempt(changeDir, previous));
  const prefix = withFixedGitEnv(() => gitProjectPrefix(cwd));
  return { stem, ticket, payloadPath, snapshotProjectPath: path.join(snapshot.path, prefix), unreleased };
}

function payloadFacts(cwd: string, ticket: DelegationTicket): PayloadFacts {
  const file = path.resolve(cwd, ticket.payload_path);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(file);
  } catch {
    return { kind: 'missing' };
  }
  if (!stat.isFile()) return { kind: 'not-regular' };
  if (stat.size === 0) return { kind: 'regular', size: 0, mtimeMs: stat.mtimeMs, schemaError: null };
  const schema = ticket.station === 'review' ? ReviewFindingsInputSchema : JudgmentDimensionsInputSchema;
  let schemaError: string | null = null;
  try {
    const parsed = schema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (!parsed.success) schemaError = formatSchemaIssues(parsed.error.issues);
  } catch (error) {
    // Unparseable JSON is what a payload looks like while it is still being written,
    // so it leaves the ticket open instead of spending the attempt.
    return { kind: 'regular', size: stat.size, mtimeMs: stat.mtimeMs, schemaError: null, incomplete: error instanceof Error ? error.message : String(error) };
  }
  return { kind: 'regular', size: stat.size, mtimeMs: stat.mtimeMs, schemaError };
}

export interface ReceiptOutcome {
  stem: string;
  ticket: DelegationTicket;
  verdict: ReceiptVerdict;
  /** What a received ticket held that could not be removed. */
  unreleased?: string[];
}

export async function receiveTicket(options: { cwd: string; changeDir: string; stem: string; now?: () => number }): Promise<ReceiptOutcome> {
  const { cwd, changeDir, stem } = options;
  const { found, latestAttempt } = findTicket(changeDir, stem, 'receive');
  const ticket = found.ticket;
  const now = (options.now ?? Date.now)();
  const current = captureRepoState(cwd);
  const verdict = judgeReceipt({ changeDir, ticket, latestAttempt, payload: payloadFacts(cwd, ticket), current });
  if (verdict.kind === 'refused') {
    // A refused ticket keeps its snapshot and checkpoint: they are the evidence the human recovers from.
    const observed = verdict.reason === 'mutated' ? { observed: current, changed: verdict.changed } : {};
    const next: DelegationTicket = { ...ticket, state: 'refused', refusal: { reason: verdict.reason, detail: verdict.detail, ...observed } };
    await transitionTicket(changeDir, stem, ticket, next, 'receive');
    return { stem, ticket: next, verdict };
  }
  if (verdict.kind === 'received') {
    const next: DelegationTicket = { ...ticket, state: 'received', received: { at_ms: now } };
    await transitionTicket(changeDir, stem, ticket, next, 'receive');
    const unreleased = releaseAttempt(changeDir, { stem, ticket: next });
    return { stem, ticket: next, verdict, ...(unreleased.length > 0 ? { unreleased } : {}) };
  }
  if (verdict.kind === 'pending' && verdict.reason === 'unreadable' && ticket.returned_unreadable_at_ms === undefined) {
    const next: DelegationTicket = { ...ticket, returned_unreadable_at_ms: now };
    await transitionTicket(changeDir, stem, ticket, next, 'receive');
    return { stem, ticket: next, verdict };
  }
  return { stem, ticket, verdict };
}

export interface EndedTicket {
  stem: string;
  before: DelegationTicket;
  ticket: DelegationTicket;
  unreleased?: string[];
  /** The checkpoint kept because a human accepted the current tree. */
  keptCheckpoint?: string;
}

/**
 * End an open or refused latest attempt as failed. Without a human acceptance the
 * repository must equal the pre-spawn state again; with one, the acceptance is
 * recorded and every refused sibling (and every open one whose delegate returned
 * with an unreadable facet) ends in the same operation, each keeping its checkpoint.
 */
export async function markFailed(options: {
  cwd: string;
  changeDir: string;
  stem: string;
  reason: string;
  acceptCurrentTree?: boolean;
  /** Runs after every check, once per ending ticket, before that ticket is written — where the caller records the WARN. */
  beforeWrite?: (facts: { stem: string; before: DelegationTicket; accepted: boolean }) => Promise<void>;
  now?: () => number;
}): Promise<{ ended: EndedTicket[]; accepted: boolean; current: RepoState }> {
  const { cwd, changeDir, stem } = options;
  const { found, tickets } = findTicket(changeDir, stem, 'fail');
  const current = captureRepoState(cwd);
  const accepted = options.acceptCurrentTree === true;
  const verdict = judgeFailure({ changeDir, target: found, tickets, current, accept: accepted });
  if (verdict.kind === 'refused') throw refused('fail', verdict.message, verdict.suggestion, stem);
  const ended: EndedTicket[] = [];
  for (const endStem of verdict.stems) {
    const stored = tickets.find((t) => t.stem === endStem)!;
    await options.beforeWrite?.({ stem: endStem, before: stored.ticket, accepted });
    const next: DelegationTicket = {
      ...stored.ticket,
      state: 'failed',
      failure: {
        at_ms: (options.now ?? Date.now)(),
        reason: endStem === stem ? options.reason : `${options.reason} (ended with ${stem})`,
        ...(accepted ? { accepted: { state: current } } : {}),
      },
    };
    await transitionTicket(changeDir, endStem, stored.ticket, next, 'fail');
    const unreleased = releaseAttempt(changeDir, { stem: endStem, ticket: next });
    ended.push({
      stem: endStem,
      before: stored.ticket,
      ticket: next,
      ...(unreleased.length > 0 ? { unreleased } : {}),
      ...(keepsCheckpoint(next) ? { keptCheckpoint: checkpointDirOf(changeDir, endStem) } : {}),
    });
  }
  return { ended, accepted, current };
}

/** Judge one station's tickets for its sink. */
export function settleDelegations(changeDir: string, station: DelegationStation): SettlementVerdict {
  return judgeSettlement(readTickets(changeDir, 'settle').filter((t) => t.ticket.station === station));
}

/** What a sink reports about its station's delegations (REQ-SERVICES-121). */
export type DelegationSettlement =
  | { kind: 'not-ticketed' }
  | { kind: 'settled'; received: string[]; failed: string[]; accepted: number; mutated: number; unconsumed: string[] };

export type AdmittedSettlement = Exclude<SettlementVerdict, { kind: 'unsettled' }>;

/**
 * The sinks' shared gate: refuse — before any byte is written — while a latest
 * attempt is still open or refused. Called by `review merge` and `verify record`
 * right after the change is resolved, whatever form their input takes.
 */
export function admitSettlement(changeDir: string, station: DelegationStation): AdmittedSettlement {
  const verdict = settleDelegations(changeDir, station);
  if (verdict.kind !== 'unsettled') return verdict;
  const lines = verdict.blocking.map(({ stem, ticket }) =>
    ticket.state === 'open'
      ? `${stem} has not been received`
      : `${stem} was refused (${ticket.refusal?.reason ?? 'unknown'}): ${ticket.refusal?.detail ?? 'no detail recorded'}`,
  );
  const open = verdict.blocking.filter((b) => b.ticket.state === 'open').map((b) => b.stem);
  const refusedMutated = verdict.blocking.filter((b) => b.ticket.refusal?.reason === 'mutated').map((b) => b.stem);
  const remedies = [
    ...open.map((s) => `\`${delegateCommand(changeDir, `--receive ${s}`)}\` (or \`--spawn-failed ${s} --reason "<why>"\`)`),
    ...refusedMutated.map((s) => `for ${s}: ${handOff(changeDir, s)}`),
    ...(open.length + refusedMutated.length < verdict.blocking.length
      ? ['for a schema or stale refusal, issue a new attempt with `prospec change delegate`, or end it with `--spawn-failed`']
      : []),
  ];
  throw new DelegationRefusedError({
    operation: 'settle',
    message: `Unsettled ${station} delegation — nothing was written: ${lines.join('; ')}`,
    suggestion: `Settle it first: ${remedies.join('; ')}`,
    ticket: verdict.blocking[0]!.stem,
  });
}

/**
 * After the sink's writes: mark every live attempt of the station consumed,
 * superseded ones included, and release what they still hold. A failure to mark is
 * reported, never a refusal — the sink's own write already happened.
 */
export async function consumeSettlement(changeDir: string, admitted: AdmittedSettlement, now: () => number = Date.now): Promise<DelegationSettlement> {
  if (admitted.kind === 'not-ticketed') return admitted;
  const unconsumed: string[] = [];
  for (const { stem, ticket } of admitted.live) {
    try {
      const next: DelegationTicket = { ...ticket, state: 'consumed', consumed_at_ms: now() };
      await transitionTicket(changeDir, stem, ticket, next, 'settle');
      releaseAttempt(changeDir, { stem, ticket: next });
    } catch {
      unconsumed.push(stem);
    }
  }
  return {
    kind: 'settled',
    received: admitted.received,
    failed: admitted.failed,
    accepted: admitted.accepted,
    mutated: admitted.mutated,
    unconsumed,
  };
}
