import type {
  HoldingTicket,
  ProcessIdentity,
  ProcessStatus,
  ProcessTree,
  TestQueueHolderInfo,
  TestQueueState,
  TestQueueTicket,
  WaitingTicket,
} from '../types/test-queue.js';

/**
 * Test queue decision engine (REQ-LIB-112): the rules, as pure functions over a state,
 * a request and injected facts. It reads no file, process or clock.
 *
 * Two rules carry the safety of the queue. Time takes only a WAITING ticket's place —
 * a ticket holding the turn leaves through a release or through one of the two removal
 * conditions in `settleHolder`, and is kept in every other combination of statuses. And
 * a status of another host's ticket is never consulted: its pids mean nothing here.
 */

export interface QueueFacts {
  now: number;
  host: string;
  holderStatus(identity: ProcessIdentity): ProcessStatus;
  treeStatus(tree: ProcessTree): ProcessStatus;
}

export interface AcquireRequest {
  key: string;
  label: string;
  worktree: string;
  lease_ms: number;
  /** The requesting process, recorded as the holder if the turn is granted. */
  holder: ProcessIdentity;
  /** The token the ticket will carry if this request is granted. */
  new_token: string;
  prepare_limit_ms: number;
  /** The token found in the environment, if any: the turn this process already runs under. */
  token?: string;
}

export type AcquireDecision =
  | { kind: 'granted'; seq: number; token: string }
  | { kind: 'waiting'; seq: number; ahead: number; holder?: HoldingTicket }
  | { kind: 'reentrant'; token: string };

export interface AcquireOutcome {
  state: TestQueueState;
  decision: AcquireDecision;
  /** Trees of a ticket past its deadline whose status is `alive`: the caller kills them. */
  overdue: ProcessTree[];
}

export type HolderDecision = 'ok' | 'lost';
export interface HolderOutcome {
  state: TestQueueState;
  decision: HolderDecision;
  overdue: ProcessTree[];
}
export interface ReleaseOutcome {
  state: TestQueueState;
  decision: { kind: 'released'; trees: ProcessTree[] } | 'lost';
  overdue: ProcessTree[];
}

const isHolding = (ticket: TestQueueTicket): ticket is HoldingTicket => ticket.state === 'holding';
const isWaiting = (ticket: TestQueueTicket): ticket is WaitingTicket => ticket.state === 'waiting';
const bySeq = (a: TestQueueTicket, b: TestQueueTicket): number => a.seq - b.seq;
const sameTree = (a: ProcessTree, b: ProcessTree): boolean => a.kind === b.kind && a.pid === b.pid && a.started === b.started;

/** Whether a ticket holding the turn stays, and which of its trees are overdue. */
function settleHolder(ticket: HoldingTicket, facts: QueueFacts): { keep: boolean; overdue: ProcessTree[] } {
  if (ticket.host !== facts.host) return { keep: true, overdue: [] };
  const holder = facts.holderStatus(ticket.holder);
  if (holder === 'alive') return { keep: true, overdue: [] };
  const statuses = ticket.trees.map((tree) => facts.treeStatus(tree));
  // `spawning` has no tree on record yet: the command may already run, so the turn is
  // held until the deadline even though nothing is left to observe.
  if (holder === 'gone' && ticket.phase !== 'spawning' && statuses.every((status) => status === 'gone')) {
    return { keep: false, overdue: [] };
  }
  if (facts.now > ticket.deadline_ms) {
    const overdue = ticket.trees.filter((_tree, index) => statuses[index] === 'alive');
    return { keep: overdue.length > 0, overdue };
  }
  return { keep: true, overdue: [] };
}

/** Drop what the rules remove before any request is matched against the queue. */
function settle(state: TestQueueState, facts: QueueFacts): { tickets: TestQueueTicket[]; overdue: ProcessTree[] } {
  const tickets: TestQueueTicket[] = [];
  const overdue: ProcessTree[] = [];
  for (const ticket of [...state.tickets].sort(bySeq)) {
    if (isHolding(ticket)) {
      const verdict = settleHolder(ticket, facts);
      overdue.push(...verdict.overdue);
      if (verdict.keep) tickets.push(ticket);
    } else if (facts.now - ticket.heartbeat_ms <= ticket.lease_ms) {
      tickets.push(ticket);
    }
  }
  return { tickets, overdue };
}

export function decideAcquire(state: TestQueueState, request: AcquireRequest, facts: QueueFacts): AcquireOutcome {
  const { tickets, overdue } = settle(state, facts);
  const holder = tickets.find(isHolding);
  const settled = (next: number, list: TestQueueTicket[]): TestQueueState => ({ version: state.version, next, tickets: list });

  if (holder !== undefined && holder.host === facts.host && request.token !== undefined && request.token === holder.token) {
    return { state: settled(state.next, tickets), decision: { kind: 'reentrant', token: holder.token }, overdue };
  }

  let next = state.next;
  const existing = tickets.filter(isWaiting).find((ticket) => ticket.key === request.key);
  const mine: WaitingTicket = existing === undefined
    ? { seq: next++, key: request.key, label: request.label, worktree: request.worktree, host: facts.host, lease_ms: request.lease_ms, heartbeat_ms: facts.now, state: 'waiting' }
    : { ...existing, label: request.label, worktree: request.worktree, host: facts.host, lease_ms: request.lease_ms, heartbeat_ms: facts.now };
  const others = tickets.filter((ticket) => ticket !== existing);
  const ahead = others.filter((ticket) => ticket.seq < mine.seq).length;

  if (holder === undefined && ahead === 0) {
    const granted: HoldingTicket = {
      ...mine,
      state: 'holding',
      token: request.new_token,
      holder: request.holder,
      granted_at_ms: facts.now,
      phase: 'preparing',
      deadline_ms: facts.now + request.prepare_limit_ms,
      trees: [],
    };
    return {
      state: settled(next, [...others, granted].sort(bySeq)),
      decision: { kind: 'granted', seq: granted.seq, token: granted.token },
      overdue,
    };
  }
  return {
    state: settled(next, [...others, mine].sort(bySeq)),
    decision: { kind: 'waiting', seq: mine.seq, ahead, ...(holder === undefined ? {} : { holder }) },
    overdue,
  };
}

/** Apply a holder's own request to the ticket its token names, or answer `lost`. */
function onHeldTicket(
  state: TestQueueState,
  token: string,
  facts: QueueFacts,
  change: (ticket: HoldingTicket) => HoldingTicket | null,
): { state: TestQueueState; found: HoldingTicket | undefined; overdue: ProcessTree[] } {
  const { tickets, overdue } = settle(state, facts);
  const found = tickets.filter(isHolding).find((ticket) => ticket.token === token && ticket.host === facts.host);
  if (found === undefined) return { state: { version: state.version, next: state.next, tickets }, found, overdue };
  const changed = change(found);
  const list = tickets.flatMap((ticket) => (ticket === found ? (changed === null ? [] : [changed]) : [ticket]));
  return { state: { version: state.version, next: state.next, tickets: list }, found, overdue };
}

export function decideSpawn(state: TestQueueState, request: { token: string; deadline_ms: number }, facts: QueueFacts): HolderOutcome {
  const r = onHeldTicket(state, request.token, facts, (ticket) => (
    ticket.phase === 'preparing' ? { ...ticket, phase: 'spawning', deadline_ms: request.deadline_ms } : ticket
  ));
  return { state: r.state, decision: r.found === undefined ? 'lost' : 'ok', overdue: r.overdue };
}

export function decideRegister(
  state: TestQueueState,
  request: { token: string; tree: ProcessTree; reentrant: boolean },
  facts: QueueFacts,
): HolderOutcome {
  const r = onHeldTicket(state, request.token, facts, (ticket) => ({
    ...ticket,
    phase: !request.reentrant && ticket.phase === 'spawning' ? 'running' : ticket.phase,
    trees: [...ticket.trees, request.tree],
  }));
  return { state: r.state, decision: r.found === undefined ? 'lost' : 'ok', overdue: r.overdue };
}

export function decideUnregister(state: TestQueueState, request: { token: string; tree: ProcessTree }, facts: QueueFacts): HolderOutcome {
  const r = onHeldTicket(state, request.token, facts, (ticket) => ({
    ...ticket,
    trees: ticket.trees.filter((tree) => !sameTree(tree, request.tree)),
  }));
  return { state: r.state, decision: r.found === undefined ? 'lost' : 'ok', overdue: r.overdue };
}

export function decideRelease(state: TestQueueState, request: { token: string }, facts: QueueFacts): ReleaseOutcome {
  const r = onHeldTicket(state, request.token, facts, () => null);
  return {
    state: r.state,
    decision: r.found === undefined ? 'lost' : { kind: 'released', trees: r.found.trees },
    overdue: r.overdue,
  };
}

/** The ticket holding the turn, as a waiter is told about it. */
export function describeHolder(ticket: HoldingTicket, facts: QueueFacts): TestQueueHolderInfo {
  const otherHost = ticket.host !== facts.host;
  return {
    label: ticket.label,
    worktree: ticket.worktree,
    host: ticket.host,
    granted_at_ms: ticket.granted_at_ms,
    other_host: otherHost,
    holder_gone: !otherHost && facts.holderStatus(ticket.holder) === 'gone',
  };
}
