import { describe, expect, it } from 'vitest';
import { DelegationTicketSchema, type RepoState } from '../../../src/types/delegation.js';
import { assessDelegationState, diffRepoState, sameRepoState } from '../../../src/lib/repo-state.js';

import { judgeReceipt } from '../../../src/lib/delegation.js';

const a = 'a'.repeat(40), b = 'b'.repeat(40);
const state = (): RepoState => ({
  content: { digest: 'a'.repeat(64) }, head: { ref: 'refs/heads/main', commit: a, operations: [] },
  index: { digest: 'a'.repeat(64), blockers: [] },
  refs: { entries: [{ name: 'refs/heads/main', oid: a }, { name: 'refs/heads/other', oid: a }, { name: 'refs/heads/backup', oid: a }] },
  stash: { entries: [a] },
  topology: { current: { root: '/main', identity: '1:1', branch: 'refs/heads/main' }, siblings: [{ root: '/other', identity: '1:2', branch: 'refs/heads/other' }] },
});
function changed(name: string, oid: string | null = b) {
  const before = state(), after = state();
  if ('entries' in after.refs) after.refs.entries = after.refs.entries.filter((entry) => entry.name !== name).concat(oid ? [{ name, oid }] : []);
  return { before, after };
}
const judge = (before: RepoState, after: RepoState) => assessDelegationState(before, after, 'worktree');

describe('directional delegation policy', () => {
  it('allows baseline sibling moves/deletions while raw equality remains strict', () => {
    for (const oid of [b, null]) {
      const { before, after } = changed('refs/heads/other', oid);
      expect(judge(before, after)).toMatchObject({ protected: [], allowed_refs: [{ name: 'refs/heads/other', before: a, after: oid, reason: 'non-current-branch' }] });
      expect(sameRepoState(before, after)).toBe(false);
      expect(diffRepoState(before, after).changed).toEqual(['refs']);
      expect(assessDelegationState(before, after, 'legacy').protected).toEqual(['refs']);
    }
  });
  it.each(['refs/heads/new', 'refs/heads/backup', 'refs/heads/other'])('allows %s regardless of sibling presence or checkout history', (name) => {
    for (const oid of [b, null]) {
      const { before, after } = changed(name, oid);
      for (const observation of [before, after]) if (observation.topology && 'siblings' in observation.topology) observation.topology.siblings = [];
      expect(judge(before, after).protected).toEqual([]);
      expect(judge(before, after).allowed_refs).toEqual(name.endsWith('/new') && oid === null ? [] : [{ name, before: name.endsWith('/new') ? null : a, after: oid, reason: 'non-current-branch' }]);
    }
  });
  it.each(['refs/heads/main', 'refs/tags/v1', 'refs/custom/x'])('protects %s', (name) => {
    const { before, after } = changed(name);
    expect(judge(before, after).protected_refs).toEqual([{ name, before: name.startsWith('refs/heads/') ? a : null, after: b }]);
  });
  it('protects the union of current HEAD and topology branches at both endpoints', () => {
    for (const endpoint of ['before', 'after'] as const) {
      for (const owner of ['head', 'topology'] as const) {
        const pair = changed('refs/heads/backup');
        if (owner === 'head') pair[endpoint].head = { ref: 'refs/heads/backup', commit: a, operations: [] };
        else pair[endpoint].topology = { current: { root: '/main', identity: '1:1', branch: 'refs/heads/backup' }, siblings: [] };
        expect(judge(pair.before, pair.after).protected_refs).toEqual([{ name: 'refs/heads/backup', before: a, after: b }]);
      }
    }
  });
  it('does not infer branch ownership from detached HEAD commit OIDs', () => {
    const { before, after } = changed('refs/heads/backup');
    for (const observation of [before, after]) {
      observation.head = { ref: null, commit: a, operations: [] };
      observation.topology = { current: { root: '/main', identity: '1:1', branch: null }, siblings: [] };
    }
    expect(judge(before, after)).toMatchObject({ protected: [], allowed_refs: [{ name: 'refs/heads/backup', reason: 'non-current-branch' }] });
    after.head = { ref: null, commit: b, operations: [] };
    after.index = { digest: 'b'.repeat(64), blockers: [] };
    expect(judge(before, after).protected).toEqual(['head', 'index']);
  });
  it('protects current HEAD even if topology also attributes that branch to a sibling', () => {
    const { before, after } = changed('refs/heads/other');
    after.head = { ref: 'refs/heads/other', commit: a, operations: [] };
    expect(judge(before, after).protected).toEqual(['head', 'refs']);
  });
  it('requires topology even without raw differences; legacy ignores it', () => {
    const before = state(), after = state();
    delete after.topology;
    expect(judge(before, after).unreadable).toEqual([{ facet: 'topology', reason: 'after topology missing' }]);
    expect(assessDelegationState(before, after, 'legacy').unreadable).toEqual([]);
  });
  it('keeps provable protected changes despite unknown topology', () => {
    const { before, after } = changed('refs/tags/v1');
    after.topology = { unreadable: 'unavailable' };
    after.stash = { entries: [] };
    expect(judge(before, after)).toMatchObject({ protected: ['refs', 'stash'], unreadable: [{ facet: 'topology' }] });
    const branch = changed('refs/heads/backup');
    branch.after.topology = { unreadable: 'unknown' };
    expect(judge(branch.before, branch.after).protected).toEqual([]);
    expect(judge(branch.before, branch.after).allowed_refs).toEqual([]);
    expect(judge(branch.before, branch.after).unreadable.length).toBeGreaterThan(0);
  });
  it('allows only prefix additions with sibling evidence, preserving duplicates and empty baseline', () => {
    for (const baseline of [[], [a], [a, a]]) {
      const before = state(), after = state();
      before.stash = { entries: baseline }; after.stash = { entries: [b, ...baseline] };
      expect(judge(before, after)).toMatchObject({ protected: [], stash_added: [b] });
      for (const observation of [before, after]) if (observation.topology && 'siblings' in observation.topology) observation.topology.siblings = [];
      expect(judge(before, after).protected).toEqual(['stash']);
    }
  });
  it.each([[], [b], [a, b]])('refuses loss/reorder/replacement %j', (...entries) => {
    const before = state(), after = state(); after.stash = { entries };
    expect(judge(before, after).protected).toEqual(['stash']);
  });
  it('separates allowed refs from protected content and stash', () => {
    const { before, after } = changed('refs/heads/other');
    after.content = { digest: 'b'.repeat(64) }; after.stash = { entries: [] };
    expect(judge(before, after)).toMatchObject({ protected: ['content', 'stash'], allowed_refs: [{ name: 'refs/heads/other' }] });
  });
});

function receipt(before: RepoState, after: RepoState) {
  const ticket = DelegationTicketSchema.parse({
    version: 2, station: 'review', role: 'priority', round: 1, attempt: 1, state: 'open',
    issued_at_ms: 10000, pre_spawn: before,
    payload_path: '.prospec/changes/x/.delegated/review-priority-1-1.json',
    snapshot: { path: '/tmp/snapshot', nonce: 'c'.repeat(32) },
    checkpoint: { entries: [], index_sha256: 'a'.repeat(64) },
    assessments: { issue: { at_ms: 10000, observed: before, assessment: judge(before, before) } },
  });
  return judgeReceipt({ changeDir: '/repo/.prospec/changes/x', ticket, latestAttempt: 1, payload: { kind: 'missing' }, current: after });
}

describe('protected evidence priority and stash sequence', () => {
  it.each(['head', 'topology'] as const)('keeps non-current scope unproved when either %s endpoint is unreadable', (facet) => {
    for (const endpoint of ['before', 'after'] as const) {
      const { before, after } = changed('refs/heads/backup');
      const observation = endpoint === 'before' ? before : after;
      observation[facet] = { unreadable: 'permission denied' };
      expect(judge(before, after)).toMatchObject({ protected: [], allowed_refs: [], unreadable: [{ facet }] });
      if (endpoint === 'after') expect(receipt(before, after)).toMatchObject({ kind: 'pending', reason: 'unreadable' });
      if ('entries' in after.refs) after.refs.entries.push({ name: 'refs/tags/protected', oid: b });
      if (endpoint === 'after') expect(receipt(before, after)).toMatchObject({ kind: 'refused', reason: 'mutated', changed: ['refs'] });
    }
  });
  it('rejects suffix reordering and changed duplicate multiplicities with or without additions', () => {
    for (const [baseline, suffix] of [[[a, b], [b, a]], [[a, a, b], [a, b, b]], [[a, b, b], [a, a, b]]]) {
      for (const prefix of [[], ['c'.repeat(40)]]) {
        const before = state(), after = state();
        before.stash = { entries: baseline! }; after.stash = { entries: [...prefix, ...suffix!] };
        expect(judge(before, after)).toMatchObject({ protected: ['stash'], stash_added: [] });
      }
    }
  });
});
