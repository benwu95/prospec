import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEST_QUEUE_LEASE_MS,
  DEFAULT_TEST_QUEUE_WAIT_MS,
  EMPTY_TEST_QUEUE_STATE,
  MIN_TEST_QUEUE_LEASE_MS,
  TEST_QUEUE_BUSY_EXIT_CODE,
  TEST_QUEUE_DEADLINE_GRACE_MS,
  TEST_QUEUE_MUTEX_WAIT_MS,
  TEST_QUEUE_POLL_MS,
  TEST_QUEUE_PREPARE_LIMIT_MS,
  TEST_QUEUE_TOKEN_ENV,
  TestQueueStateSchema,
} from '../../../src/types/test-queue.js';

const waiting = {
  seq: 2, key: '/repo::record-tests:a', label: 'record-tests a', worktree: '/repo', host: 'h',
  lease_ms: 300_000, heartbeat_ms: 10, state: 'waiting' as const,
};
const holding = {
  ...waiting, seq: 1, state: 'holding' as const, token: 't', holder: { pid: 10, started: 'Mon Nov 23 06:00:00 2026' },
  granted_at_ms: 5, phase: 'running' as const, deadline_ms: 99,
  trees: [{ kind: 'process-group' as const, pid: 11, started: null }],
};

describe('test queue contracts (REQ-TYPES-119)', () => {
  it('pins the shared constants', () => {
    expect(TEST_QUEUE_BUSY_EXIT_CODE).toBe(75);
    expect(TEST_QUEUE_TOKEN_ENV).toBe('PROSPEC_TEST_QUEUE_TOKEN');
    expect([TEST_QUEUE_PREPARE_LIMIT_MS, TEST_QUEUE_DEADLINE_GRACE_MS, TEST_QUEUE_MUTEX_WAIT_MS, TEST_QUEUE_POLL_MS])
      .toEqual([600_000, 60_000, 10_000, 1_000]);
    expect([DEFAULT_TEST_QUEUE_WAIT_MS, DEFAULT_TEST_QUEUE_LEASE_MS]).toEqual([60_000, 300_000]);
    // A waiter that is still polling must never lose its place to its own lease.
    expect(MIN_TEST_QUEUE_LEASE_MS).toBeGreaterThan(TEST_QUEUE_POLL_MS + TEST_QUEUE_MUTEX_WAIT_MS);
  });

  it('accepts a waiting ticket and a holding ticket with its extra fields', () => {
    const state = { version: 1, next: 3, tickets: [holding, waiting] };
    expect(TestQueueStateSchema.parse(state)).toEqual(state);
    expect(TestQueueStateSchema.parse(EMPTY_TEST_QUEUE_STATE).tickets).toEqual([]);
  });

  it('rejects an unknown version', () => {
    expect(TestQueueStateSchema.safeParse({ version: 2, next: 1, tickets: [] }).success).toBe(false);
  });

  it.each([
    ['an undeclared top-level field', { version: 1, next: 1, tickets: [], extra: true }],
    ['an undeclared ticket field', { version: 1, next: 2, tickets: [{ ...waiting, pid: 3 }] }],
    ['a holding field on a waiting ticket', { version: 1, next: 2, tickets: [{ ...waiting, token: 't' }] }],
    ['a holding ticket without its holder', { version: 1, next: 2, tickets: [{ ...holding, holder: undefined }] }],
    ['an undeclared holder field', { version: 1, next: 2, tickets: [{ ...holding, holder: { ...holding.holder, uid: 0 } }] }],
    ['an undeclared tree field', { version: 1, next: 2, tickets: [{ ...holding, trees: [{ ...holding.trees[0], uid: 0 }] }] }],
    ['an unknown phase', { version: 1, next: 2, tickets: [{ ...holding, phase: 'done' }] }],
    ['an unknown tree kind', { version: 1, next: 2, tickets: [{ ...holding, trees: [{ kind: 'job', pid: 1, started: null }] }] }],
  ])('rejects %s', (_label, state) => {
    expect(TestQueueStateSchema.safeParse(state).success).toBe(false);
  });
});
