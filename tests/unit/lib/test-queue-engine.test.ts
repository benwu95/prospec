import { describe, expect, it } from 'vitest';
import {
  decideAcquire,
  decideRegister,
  decideRelease,
  decideSpawn,
  decideUnregister,
  describeHolder,
  type AcquireRequest,
  type QueueFacts,
} from '../../../src/lib/test-queue-engine.js';
import {
  TestQueueStateSchema,
  type HoldingTicket,
  type ProcessStatus,
  type ProcessTree,
  type TestQueueState,
  type TestQueueTicket,
  type WaitingTicket,
} from '../../../src/types/test-queue.js';

const HOST = 'this-host';
const LEASE = 300_000;

/** Facts over a scripted status table keyed by pid; an unlisted pid is `gone`. */
function facts(now: number, statuses: Record<number, ProcessStatus> = {}, host = HOST): QueueFacts & { asked: number[] } {
  const asked: number[] = [];
  const of = (pid: number): ProcessStatus => { asked.push(pid); return statuses[pid] ?? 'gone'; };
  return { now, host, asked, holderStatus: (identity) => of(identity.pid), treeStatus: (tree) => of(tree.pid) };
}

const waiting = (seq: number, key: string, over: Partial<WaitingTicket> = {}): WaitingTicket => ({
  seq, key, label: `label ${key}`, worktree: '/repo', host: HOST, lease_ms: LEASE, heartbeat_ms: 1_000, state: 'waiting', ...over,
});
const tree = (pid: number): ProcessTree => ({ kind: 'process-group', pid, started: 'S' });
const holding = (seq: number, key: string, over: Partial<HoldingTicket> = {}): HoldingTicket => ({
  seq, key, label: `label ${key}`, worktree: '/repo', host: HOST, lease_ms: LEASE, heartbeat_ms: 1_000, state: 'holding',
  token: `token-${seq}`, holder: { pid: 100 + seq, started: 'S' }, granted_at_ms: 1_000, phase: 'running', deadline_ms: 50_000, trees: [], ...over,
});
const state = (next: number, ...tickets: TestQueueTicket[]): TestQueueState => ({ version: 1, next, tickets });
const request = (key: string, over: Partial<AcquireRequest> = {}): AcquireRequest => ({
  key, label: `label ${key}`, worktree: '/repo', lease_ms: LEASE, holder: { pid: 900, started: 'S' }, new_token: 'fresh-token', prepare_limit_ms: 600_000, ...over,
});
const keys = (s: TestQueueState): string[] => s.tickets.map((t) => `${t.seq}:${t.key}:${t.state}`);

describe('decideAcquire — numbering and granting (REQ-LIB-112)', () => {
  it('grants an empty queue at once, in phase preparing with the preparation deadline', () => {
    const r = decideAcquire(state(1), request('a'), facts(2_000));
    expect(r.decision).toEqual({ kind: 'granted', seq: 1, token: 'fresh-token' });
    expect(r.state.next).toBe(2);
    expect(r.state.tickets).toEqual([holding(1, 'a', {
      token: 'fresh-token', holder: { pid: 900, started: 'S' }, granted_at_ms: 2_000, heartbeat_ms: 2_000, phase: 'preparing', deadline_ms: 602_000,
    })]);
    expect(TestQueueStateSchema.safeParse(r.state).success).toBe(true);
  });

  it('appends a ticket with the next number behind a holder and reports what is ahead', () => {
    const before = state(2, holding(1, 'a'));
    const r = decideAcquire(before, request('b'), facts(2_000, { 101: 'alive' }));
    expect(r.decision).toMatchObject({ kind: 'waiting', seq: 2, ahead: 1 });
    expect(r.decision.kind === 'waiting' && r.decision.holder?.key).toBe('a');
    expect(keys(r.state)).toEqual(['1:a:holding', '2:b:waiting']);
    expect(r.state.next).toBe(3);
  });

  it('keeps an existing waiting ticket and refreshes its heartbeat', () => {
    const before = state(4, holding(1, 'a'), waiting(2, 'b'), waiting(3, 'c'));
    const r = decideAcquire(before, request('c'), facts(9_000, { 101: 'alive' }));
    expect(r.decision).toMatchObject({ kind: 'waiting', seq: 3, ahead: 2 });
    expect(r.state.next).toBe(4);
    expect(r.state.tickets.find((t) => t.key === 'c')?.heartbeat_ms).toBe(9_000);
    expect(r.state.tickets.find((t) => t.key === 'b')?.heartbeat_ms).toBe(1_000);
  });

  it('grants only the lowest waiting number, so a later number never overtakes an earlier one', () => {
    const before = state(4, waiting(2, 'b'), waiting(3, 'c'));
    const later = decideAcquire(before, request('c'), facts(2_000));
    expect(later.decision).toMatchObject({ kind: 'waiting', seq: 3, ahead: 1 });
    expect(later.decision.kind === 'waiting' && later.decision.holder).toBeUndefined();
    const earlier = decideAcquire(later.state, request('b'), facts(2_500));
    expect(earlier.decision).toEqual({ kind: 'granted', seq: 2, token: 'fresh-token' });
    expect(keys(earlier.state)).toEqual(['2:b:holding', '3:c:waiting']);
  });

  it('removes a waiting ticket whose heartbeat is older than its own lease', () => {
    const before = state(4, waiting(2, 'b', { heartbeat_ms: 0, lease_ms: 1_000 }), waiting(3, 'c', { heartbeat_ms: 0, lease_ms: 60_000 }));
    const r = decideAcquire(before, request('c'), facts(1_001));
    expect(keys(r.state)).toEqual(['3:c:holding']);
    expect(r.decision).toMatchObject({ kind: 'granted', seq: 3 });
  });

  it('keeps a waiting ticket exactly at its lease', () => {
    const before = state(4, waiting(2, 'b', { heartbeat_ms: 0, lease_ms: 1_000 }), waiting(3, 'c'));
    expect(keys(decideAcquire(before, request('c'), facts(1_000)).state)).toEqual(['2:b:waiting', '3:c:waiting']);
  });

  it('gives a request whose own ticket expired a new number at the tail', () => {
    const before = state(4, waiting(2, 'b', { heartbeat_ms: 0, lease_ms: 1_000 }), waiting(3, 'c', { heartbeat_ms: 4_000 }));
    const r = decideAcquire(before, request('b'), facts(5_000));
    expect(keys(r.state)).toEqual(['3:c:waiting', '4:b:waiting']);
    expect(r.decision).toMatchObject({ kind: 'waiting', seq: 4, ahead: 1 });
    expect(r.state.next).toBe(5);
  });

  it('removes a waiting ticket of another host by its lease alone', () => {
    const other = waiting(2, 'b', { host: 'other-host', heartbeat_ms: 0, lease_ms: 1_000 });
    const f = facts(1_001);
    expect(keys(decideAcquire(state(3, other), request('c'), f).state)).toEqual(['3:c:holding']);
    expect(f.asked).toEqual([]);
  });

  it('gives a request whose key holds the turn a ticket of its own, kept across re-runs and granted in its order', () => {
    const live = { 101: 'alive' } as const;
    const first = decideAcquire(state(2, holding(1, 'a')), request('a'), facts(2_000, live));
    expect(first.decision).toMatchObject({ kind: 'waiting', seq: 2, ahead: 1, holder: { seq: 1 } });
    expect(keys(first.state)).toEqual(['1:a:holding', '2:a:waiting']);

    const later = decideAcquire(first.state, request('b'), facts(3_000, live));
    expect(later.decision).toMatchObject({ kind: 'waiting', seq: 3, ahead: 2 });
    const again = decideAcquire(later.state, request('a'), facts(4_000, live));
    expect(again.decision).toMatchObject({ kind: 'waiting', seq: 2, ahead: 1 });
    expect(keys(again.state)).toEqual(['1:a:holding', '2:a:waiting', '3:b:waiting']);

    const passed = decideAcquire(again.state, request('b'), facts(5_000));
    expect(passed.decision).toMatchObject({ kind: 'waiting', seq: 3, ahead: 1 });
    expect(decideAcquire(passed.state, request('a'), facts(5_000)).decision).toMatchObject({ kind: 'granted', seq: 2 });
  });

  it('is reentrant for the token of the ticket holding the turn, and adds no ticket', () => {
    const before = state(2, holding(1, 'a'));
    const r = decideAcquire(before, request('zzz', { token: 'token-1' }), facts(2_000, { 101: 'alive' }));
    expect(r.decision).toEqual({ kind: 'reentrant', token: 'token-1' });
    expect(r.state).toEqual(before);
  });

  it('ignores a token no holder carries, and one carried by a holder of another host', () => {
    const stale = decideAcquire(state(2, holding(1, 'a')), request('b', { token: 'nope' }), facts(2_000, { 101: 'alive' }));
    expect(stale.decision).toMatchObject({ kind: 'waiting', seq: 2 });
    const foreign = decideAcquire(state(2, holding(1, 'a', { host: 'other-host' })), request('b', { token: 'token-1' }), facts(2_000));
    expect(foreign.decision).toMatchObject({ kind: 'waiting', seq: 2 });
  });
});

describe('a ticket holding the turn (REQ-LIB-112)', () => {
  /** [label, holder status, tree statuses, phase, now relative to deadline, expected kept, expected overdue pids] */
  const D = 50_000;
  const table: Array<[string, ProcessStatus, ProcessStatus[], HoldingTicket['phase'], number, boolean, number[]]> = [
    ['an alive holder is kept before its deadline', 'alive', ['alive'], 'running', D - 1, true, []],
    ['an alive holder is kept past its deadline', 'alive', ['alive'], 'running', D + 1, true, []],
    ['an alive holder is kept past its deadline with its trees gone', 'alive', ['gone'], 'running', D + 1, true, []],
    ['a gone holder with every tree gone is removed', 'gone', ['gone', 'gone'], 'running', D - 1, false, []],
    ['a gone holder in preparing, with no tree, is removed', 'gone', [], 'preparing', D - 1, false, []],
    ['a gone holder in spawning is kept until its deadline', 'gone', [], 'spawning', D - 1, true, []],
    ['a gone holder in spawning is removed past its deadline', 'gone', [], 'spawning', D + 1, false, []],
    ['a gone holder with a tree alive is kept before the deadline', 'gone', ['alive'], 'running', D - 1, true, []],
    ['a gone holder with a tree unknown is kept before the deadline', 'gone', ['gone', 'unknown'], 'running', D - 1, true, []],
    ['an unknown holder is kept before the deadline', 'unknown', ['gone'], 'running', D - 1, true, []],
    ['an unknown holder in preparing is kept before the deadline', 'unknown', [], 'preparing', D - 1, true, []],
    ['past the deadline an alive tree is listed overdue and the ticket kept', 'gone', ['alive', 'gone'], 'running', D + 1, true, [0]],
    ['past the deadline an unknown holder still has its alive trees listed', 'unknown', ['alive', 'alive'], 'running', D + 1, true, [0, 1]],
    ['past the deadline a tree that is only unknown does not keep the ticket', 'gone', ['unknown'], 'running', D + 1, false, []],
    ['past the deadline an unknown holder with no alive tree is removed', 'unknown', ['gone', 'unknown'], 'running', D + 1, false, []],
    ['exactly at the deadline nothing is overdue yet', 'unknown', ['alive'], 'running', D, true, []],
  ];

  it.each(table)('%s', (_label, holderStatus, treeStatuses, phase, now, kept, overdueIndexes) => {
    const trees = treeStatuses.map((_s, i) => tree(500 + i));
    const statuses: Record<number, ProcessStatus> = { 101: holderStatus };
    treeStatuses.forEach((s, i) => { statuses[500 + i] = s; });
    const before = state(2, holding(1, 'a', { phase, trees, deadline_ms: D }));
    const r = decideAcquire(before, request('b'), facts(now, statuses));
    expect(r.state.tickets.some((t) => t.key === 'a')).toBe(kept);
    expect(r.overdue).toEqual(overdueIndexes.map((i) => tree(500 + i)));
    // The requester takes the turn in the same decision once the holder's ticket is gone.
    expect(r.decision.kind).toBe(kept ? 'waiting' : 'granted');
  });

  it('consults no status for a ticket of another host and keeps it past its deadline', () => {
    const f = facts(10_000_000);
    const before = state(2, holding(1, 'a', { host: 'other-host', trees: [tree(500)] }));
    const r = decideAcquire(before, request('b'), f);
    expect(keys(r.state)).toEqual(['1:a:holding', '2:b:waiting']);
    expect(r.overdue).toEqual([]);
    expect(f.asked).toEqual([]);
  });

  it('describes the holder for a waiter: another host, or a holder that is gone', () => {
    const here = holding(1, 'a', { trees: [tree(500)] });
    expect(describeHolder(here, facts(2_000, { 101: 'gone', 500: 'alive' }))).toEqual({
      label: 'label a', worktree: '/repo', host: HOST, granted_at_ms: 1_000, other_host: false, holder_gone: true,
    });
    expect(describeHolder(here, facts(2_000, { 101: 'unknown' })).holder_gone).toBe(false);
    const f = facts(2_000);
    expect(describeHolder({ ...here, host: 'other-host' }, f)).toMatchObject({ other_host: true, holder_gone: false });
    expect(f.asked).toEqual([]);
  });
});

describe('holder requests (REQ-LIB-112)', () => {
  const alive = { 101: 'alive' as const };

  it('enters spawning from preparing with the requested deadline', () => {
    const before = state(2, holding(1, 'a', { phase: 'preparing' }));
    const r = decideSpawn(before, { token: 'token-1', deadline_ms: 77_000 }, facts(2_000, alive));
    expect(r.decision).toBe('ok');
    expect(r.state.tickets[0]).toMatchObject({ phase: 'spawning', deadline_ms: 77_000 });
  });

  it('becomes running when the granted caller registers the tree it spawned', () => {
    const before = state(2, holding(1, 'a', { phase: 'spawning' }));
    const r = decideRegister(before, { token: 'token-1', tree: tree(500), reentrant: false }, facts(2_000, alive));
    expect(r.decision).toBe('ok');
    expect(r.state.tickets[0]).toMatchObject({ phase: 'running', trees: [tree(500)] });
  });

  it('leaves phase and deadline unchanged for a re-entrant registration', () => {
    const before = state(2, holding(1, 'a', { phase: 'spawning', deadline_ms: 77_000 }));
    const r = decideRegister(before, { token: 'token-1', tree: tree(600), reentrant: true }, facts(2_000, alive));
    expect(r.state.tickets[0]).toMatchObject({ phase: 'spawning', deadline_ms: 77_000, trees: [tree(600)] });
  });

  it('unregisters exactly the named tree', () => {
    const before = state(2, holding(1, 'a', { trees: [tree(500), tree(600)] }));
    const r = decideUnregister(before, { token: 'token-1', tree: tree(600) }, facts(2_000, { ...alive, 500: 'alive', 600: 'alive' }));
    expect(r.decision).toBe('ok');
    expect((r.state.tickets[0] as HoldingTicket).trees).toEqual([tree(500)]);
  });

  it('releases the turn, listing the trees still registered', () => {
    const before = state(3, holding(1, 'a', { trees: [tree(500)] }), waiting(2, 'b'));
    const r = decideRelease(before, { token: 'token-1' }, facts(2_000, { ...alive, 500: 'alive' }));
    expect(r.decision).toEqual({ kind: 'released', trees: [tree(500)] });
    expect(keys(r.state)).toEqual(['2:b:waiting']);
  });

  it.each([
    ['enter spawning', (s: TestQueueState, f: QueueFacts) => decideSpawn(s, { token: 'other', deadline_ms: 1 }, f).decision],
    ['register', (s: TestQueueState, f: QueueFacts) => decideRegister(s, { token: 'other', tree: tree(1), reentrant: false }, f).decision],
    ['unregister', (s: TestQueueState, f: QueueFacts) => decideUnregister(s, { token: 'other', tree: tree(1) }, f).decision],
    ['release', (s: TestQueueState, f: QueueFacts) => decideRelease(s, { token: 'other' }, f).decision],
  ])('answers lost to a request to %s whose token no holder carries', (_label, act) => {
    const before = state(2, holding(1, 'a'));
    expect(act(before, facts(2_000, alive))).toBe('lost');
    expect(act(state(1), facts(2_000))).toBe('lost');
  });

  it('answers lost to the holder whose ticket the removal rules already took', () => {
    // An unknown holder past its preparation deadline loses the turn; its next request learns it.
    const before = state(2, holding(1, 'a', { phase: 'preparing', deadline_ms: 5_000 }));
    const r = decideSpawn(before, { token: 'token-1', deadline_ms: 99_000 }, facts(5_001, { 101: 'unknown' }));
    expect(r.decision).toBe('lost');
    expect(r.state.tickets).toEqual([]);
  });

  it('never mutates the state it was given', () => {
    const before = state(2, holding(1, 'a', { phase: 'spawning' }));
    const snapshot = JSON.stringify(before);
    decideRegister(before, { token: 'token-1', tree: tree(500), reentrant: false }, facts(2_000, alive));
    decideAcquire(before, request('b'), facts(2_000, alive));
    decideRelease(before, { token: 'token-1' }, facts(2_000, alive));
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
