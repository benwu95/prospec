import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  admitSettlement,
  consumeSettlement,
  createTicketExclusive,
  issueTicket,
  judgeFailure,
  judgeIssue,
  judgeReceipt,
  judgeSettlement,
  keepsCheckpoint,
  markFailed,
  readTickets,
  receiveTicket,
  transitionTicket,
  type StoredTicket,
} from '../../../src/lib/delegation.js';
import { checkpointBlobPath, checkpointDirOf, ensureDelegationDir } from '../../../src/lib/delegation-checkpoint.js';
import { SNAPSHOT_PREFIX, snapshotRoot } from '../../../src/lib/git-read.js';
import type { DelegationTicket, RepoState } from '../../../src/types/delegation.js';
import { gitIn } from '../../helpers/git-fixture.js';
import { usePrivateTmpdir } from '../../helpers/private-tmpdir.js';

vi.setConfig({ testTimeout: 30_000 });

// Every snapshot this file builds lands under a root only this file uses (O-1 pin: none may remain).
usePrivateTmpdir('delegation');

const D = (c: string) => c.repeat(64);
const OID = 'b'.repeat(40);
const CHANGE_DIR = '/repo/.prospec/changes/x';
const pre: RepoState = {
  content: { digest: D('1') },
  head: { ref: 'refs/heads/main', commit: OID, operations: [] },
  index: { digest: D('2'), blockers: [] },
  refs: { entries: [{ name: 'refs/heads/main', oid: OID }] },
  stash: { entries: [] },
};
const changed: RepoState = { ...pre, content: { digest: D('9') } };
const unreadableContent: RepoState = { ...pre, content: { unreadable: 'nested repository' } };
const nothingReadable: RepoState = {
  content: { unreadable: 'x' },
  head: { unreadable: 'x' },
  index: { unreadable: 'x' },
  refs: { unreadable: 'x' },
  stash: { unreadable: 'x' },
};

function ticket(role: string, attempt: number, overrides: Partial<DelegationTicket> = {}): StoredTicket {
  const t: DelegationTicket = {
    version: 1,
    station: 'review',
    role,
    round: 1,
    attempt,
    state: 'open',
    issued_at_ms: 10_000,
    pre_spawn: pre,
    payload_path: `.prospec/changes/x/.delegated/review-${role}-1-${attempt}.json`,
    snapshot: { path: '/tmp/s', nonce: 'c'.repeat(32) },
    checkpoint: { entries: [], index_sha256: D('3') },
    ...overrides,
  };
  return { stem: `review-${role}-1-${attempt}`, ticket: t };
}
const key = { station: 'review' as const, role: 'lens-a', round: 1 };
const issueFacts = (overrides: Partial<Parameters<typeof judgeIssue>[0]> = {}) => ({
  changeDir: CHANGE_DIR,
  tickets: [] as StoredTicket[],
  key,
  current: pre,
  payloadExists: false,
  ...overrides,
});

describe('judgeIssue (REQ-LIB-092)', () => {
  it("numbers the attempt one past the key's highest", () => {
    const tickets = [ticket('lens-a', 1, { state: 'received' }), ticket('lens-a', 2, { state: 'failed' })];
    expect(judgeIssue(issueFacts({ tickets }))).toEqual({ kind: 'issue', attempt: 3 });
  });

  it('numbers past a leftover checkpoint whose ticket is gone', () => {
    const tickets = [ticket('lens-a', 1, { state: 'failed' })];
    expect(judgeIssue(issueFacts({ tickets, leftoverAttempts: [4] }))).toEqual({ kind: 'issue', attempt: 5 });
  });

  it('refuses when the assigned payload already exists', () => {
    expect(judgeIssue(issueFacts({ payloadExists: true }))).toMatchObject({ kind: 'refused', message: expect.stringMatching(/already exists/) });
  });

  it('refuses while the repository state cannot be read', () => {
    expect(judgeIssue(issueFacts({ current: unreadableContent }))).toMatchObject({ kind: 'refused', message: expect.stringMatching(/cannot be read/) });
  });

  it("refuses across keys: another key's open attempt started from a different tree — naming it, its facets and its checkpoint", () => {
    const verdict = judgeIssue(issueFacts({ tickets: [ticket('lens-b', 1)], current: changed }));
    expect(verdict).toMatchObject({ kind: 'refused', ticket: 'review-lens-b-1-1' });
    const { message, suggestion } = verdict as { message: string; suggestion: string };
    expect(message).toContain(`content (pre-spawn ${D('1')}, now ${D('9')})`);
    expect(message).toContain(checkpointDirOf(CHANGE_DIR, 'review-lens-b-1-1'));
    expect(message).toMatch(/back at its pre-spawn state/);
    expect(suggestion).toContain('--receive review-lens-b-1-1');
  });

  it('points a refused blocking attempt at the human, never at a CLI restore', () => {
    const verdict = judgeIssue(issueFacts({ tickets: [ticket('lens-b', 1, { state: 'refused' })], current: changed }));
    const { suggestion } = verdict as { suggestion: string };
    expect(suggestion).toMatch(/hand it to the human/);
    expect(suggestion).toContain(checkpointDirOf(CHANGE_DIR, 'review-lens-b-1-1'));
    expect(suggestion).not.toMatch(/--restore/);
  });

  it("does not consult a superseded attempt — only each key's latest live one", () => {
    const tickets = [ticket('lens-b', 1, { state: 'refused', pre_spawn: changed }), ticket('lens-b', 2, { state: 'received' })];
    expect(judgeIssue(issueFacts({ tickets }))).toEqual({ kind: 'issue', attempt: 1 });
  });

  it('does not consult a received, failed or consumed latest attempt', () => {
    const tickets = [
      ticket('lens-b', 1, { state: 'received', pre_spawn: changed }),
      ticket('lens-c', 1, { state: 'failed', pre_spawn: changed }),
      ticket('lens-d', 1, { state: 'consumed', pre_spawn: changed }),
    ];
    expect(judgeIssue(issueFacts({ tickets }))).toEqual({ kind: 'issue', attempt: 1 });
  });

  it('admits a new attempt once the tree is back at the refused attempt\'s pre-spawn state', () => {
    const tickets = [ticket('lens-a', 1, { state: 'refused', refusal: { reason: 'mutated', detail: 'x', observed: changed, changed: ['content'] } })];
    expect(judgeIssue(issueFacts({ tickets, current: pre }))).toEqual({ kind: 'issue', attempt: 2 });
  });
});

describe('judgeReceipt (REQ-LIB-092)', () => {
  const payload = { kind: 'regular' as const, size: 10, mtimeMs: 20_000, schemaError: null };
  const facts = (overrides: Partial<Parameters<typeof judgeReceipt>[0]> = {}) => ({
    changeDir: CHANGE_DIR,
    ticket: ticket('r', 1).ticket,
    latestAttempt: 1,
    payload,
    current: pre,
    ...overrides,
  });

  it('receives a fresh, valid payload over an unchanged tree', () => {
    expect(judgeReceipt(facts())).toEqual({ kind: 'received' });
  });

  it.each([
    ['a ticket that is not open', { ticket: ticket('r', 1, { state: 'received' }).ticket }, 'not-open'],
    ['a superseded attempt', { latestAttempt: 2 }, 'superseded'],
  ])('does not receive %s', (_l, overrides, reason) => {
    expect(judgeReceipt(facts(overrides))).toMatchObject({ kind: 'not-receivable', reason });
  });

  it('refuses a changed tree as mutated — even with no payload — naming the facet, both values and the checkpoint', () => {
    const verdict = judgeReceipt(facts({ current: changed, payload: { kind: 'missing' } }));
    expect(verdict).toMatchObject({
      kind: 'refused',
      reason: 'mutated',
      changed: ['content'],
      facets: [{ facet: 'content', before: D('1'), after: D('9') }],
      checkpoint: checkpointDirOf(CHANGE_DIR, 'review-r-1-1'),
    });
    expect((verdict as { detail: string }).detail).toMatch(/recovery is the human's/);
  });

  it('judges a changed tree as mutated before a schema failure of its payload', () => {
    expect(judgeReceipt(facts({ current: changed, payload: { ...payload, schemaError: 'bad' } }))).toMatchObject({ kind: 'refused', reason: 'mutated' });
  });

  it('judges a readable change before an unreadable facet, recording the unreadable one too', () => {
    const both: RepoState = { ...changed, stash: { unreadable: 'x' } };
    const verdict = judgeReceipt(facts({ current: both }));
    expect(verdict).toMatchObject({ kind: 'refused', reason: 'mutated', changed: ['content'] });
    expect((verdict as { facets: { facet: string }[] }).facets.map((f) => f.facet)).toEqual(['content', 'stash']);
  });

  it('refuses a mutation while the content facet is unreadable (an unmerged index)', () => {
    const merging: RepoState = { ...pre, content: { unreadable: 'unmerged' }, index: { digest: D('7'), blockers: ['unmerged'] } };
    expect(judgeReceipt(facts({ current: merging }))).toMatchObject({ kind: 'refused', reason: 'mutated', changed: ['index'] });
  });

  it('refuses an in-progress merge the delegate left, on the head facet', () => {
    const merging: RepoState = { ...pre, head: { ref: 'refs/heads/main', commit: OID, operations: ['MERGE_HEAD'] } };
    expect(judgeReceipt(facts({ current: merging }))).toMatchObject({ kind: 'refused', reason: 'mutated', changed: ['head'] });
  });

  it('stays pending when only an unreadable facet differs', () => {
    expect(judgeReceipt(facts({ current: unreadableContent }))).toMatchObject({ kind: 'pending', reason: 'unreadable' });
  });

  it.each([
    [{ kind: 'missing' as const }, 'missing'],
    [{ kind: 'not-regular' as const }, 'not-regular'],
    [{ ...payload, size: 0 }, 'empty'],
    [{ ...payload, incomplete: 'Unexpected end of JSON input' }, 'incomplete'],
  ])('stays pending for payload %j', (p, reason) => {
    expect(judgeReceipt(facts({ payload: p }))).toMatchObject({ kind: 'pending', reason });
  });

  it('names the parse error of a payload that is not complete JSON yet', () => {
    const verdict = judgeReceipt(facts({ payload: { ...payload, incomplete: 'Unexpected end of JSON input' } }));
    expect((verdict as { detail: string }).detail).toContain('Unexpected end of JSON input');
  });

  it('refuses a schema failure and a stale payload; the same second is not stale', () => {
    expect(judgeReceipt(facts({ payload: { ...payload, schemaError: 'bad' } }))).toMatchObject({ kind: 'refused', reason: 'schema' });
    expect(judgeReceipt(facts({ payload: { ...payload, mtimeMs: 8_999 } }))).toMatchObject({ kind: 'refused', reason: 'stale' });
    expect(judgeReceipt(facts({ payload: { ...payload, mtimeMs: 10_999 } }))).toEqual({ kind: 'received' });
  });

  it('compares the payload and the issue in whole seconds, off a second boundary too', () => {
    const issued = ticket('r', 1, { issued_at_ms: 10_700 }).ticket;
    expect(judgeReceipt(facts({ ticket: issued, payload: { ...payload, mtimeMs: 10_200 } }))).toEqual({ kind: 'received' });
    expect(judgeReceipt(facts({ ticket: issued, payload: { ...payload, mtimeMs: 9_999 } }))).toMatchObject({ kind: 'refused', reason: 'stale' });
  });
});

describe('judgeFailure (REQ-LIB-092)', () => {
  const facts = (target: StoredTicket, tickets: StoredTicket[], current: RepoState, accept: boolean) => ({ changeDir: CHANGE_DIR, target, tickets, current, accept });

  it('ends an attempt over an unchanged tree, unrestricted by open siblings', () => {
    const target = ticket('lens-a', 1);
    expect(judgeFailure(facts(target, [target, ticket('lens-b', 1)], pre, false))).toEqual({ kind: 'end', stems: ['review-lens-a-1-1'] });
  });

  it('refuses without acceptance when any facet differs, naming the facets and the checkpoint', () => {
    const target = ticket('lens-a', 1, { state: 'refused' });
    const verdict = judgeFailure(facts(target, [target], changed, false));
    expect(verdict).toMatchObject({ kind: 'refused' });
    const { message, suggestion } = verdict as { message: string; suggestion: string };
    expect(message).toContain('content (pre-spawn');
    expect(message).toContain(checkpointDirOf(CHANGE_DIR, target.stem));
    expect(suggestion).toMatch(/--accept-current-tree/);
    expect(suggestion).not.toMatch(/--restore/);
  });

  it('points an open target at --receive when ending it over a changed tree', () => {
    const target = ticket('lens-a', 1);
    expect(judgeFailure(facts(target, [target], changed, false))).toMatchObject({ suggestion: expect.stringMatching(/^Receive it/) });
  });

  it('refuses an acceptance while a sibling may still be running', () => {
    const target = ticket('lens-a', 1, { state: 'refused' });
    const running = ticket('lens-b', 1);
    expect(judgeFailure(facts(target, [target, running], changed, true))).toMatchObject({ kind: 'refused', message: expect.stringMatching(/still be running/) });
  });

  it('ends every refused sibling and every one that returned with an unreadable facet in one acceptance', () => {
    const target = ticket('lens-a', 1, { state: 'refused' });
    const refusedSibling = ticket('lens-c', 1, { state: 'refused' });
    const returned = ticket('lens-b', 1, { returned_unreadable_at_ms: 5 });
    const received = ticket('lens-d', 1, { state: 'received' });
    expect(judgeFailure(facts(target, [target, refusedSibling, returned, received], unreadableContent, true))).toEqual({
      kind: 'end',
      stems: ['review-lens-a-1-1', 'review-lens-b-1-1', 'review-lens-c-1-1'],
    });
  });

  it('ends parallel tickets that all returned with an unreadable facet in one acceptance', () => {
    const a = ticket('lens-a', 1, { returned_unreadable_at_ms: 5 });
    const b = ticket('lens-b', 1, { returned_unreadable_at_ms: 6 });
    expect(judgeFailure(facts(a, [a, b], unreadableContent, true))).toEqual({ kind: 'end', stems: ['review-lens-a-1-1', 'review-lens-b-1-1'] });
  });

  it('refuses an acceptance whose state cannot be captured at all', () => {
    const target = ticket('lens-a', 1, { state: 'refused' });
    expect(judgeFailure(facts(target, [target], nothingReadable, true))).toMatchObject({ kind: 'refused', message: expect.stringMatching(/cannot be read at all/) });
  });

  it('refuses a superseded attempt and a ticket that is not open or refused', () => {
    const tickets = [ticket('lens-a', 1), ticket('lens-a', 2)];
    expect(judgeFailure(facts(tickets[0]!, tickets, pre, false))).toMatchObject({ kind: 'refused', message: expect.stringMatching(/superseded/) });
    const done = ticket('lens-a', 1, { state: 'received' });
    expect(judgeFailure(facts(done, [done], pre, false))).toMatchObject({ kind: 'refused' });
  });
});

describe('judgeSettlement / keepsCheckpoint (REQ-LIB-092)', () => {
  it('reports not-ticketed with no live tickets', () => {
    expect(judgeSettlement([ticket('a', 1, { state: 'consumed' })])).toEqual({ kind: 'not-ticketed' });
  });

  it('refuses an open latest attempt and a refused latest attempt, each on its own', () => {
    expect(judgeSettlement([ticket('a', 1)])).toMatchObject({ kind: 'unsettled' });
    expect(judgeSettlement([ticket('a', 1, { state: 'refused' })])).toMatchObject({ kind: 'unsettled' });
  });

  it('only looks at each key\'s latest attempt, but counts mutations over every attempt', () => {
    const verdict = judgeSettlement([
      ticket('a', 1, { state: 'refused', refusal: { reason: 'mutated', detail: 'x' } }),
      ticket('a', 2, { state: 'received' }),
      ticket('b', 1, { state: 'failed', failure: { at_ms: 1, reason: 'r', accepted: { state: changed } } }),
      ticket('c', 1, { state: 'failed', refusal: { reason: 'mutated', detail: 'y' }, failure: { at_ms: 1, reason: 'r', accepted: { state: changed } } }),
    ]);
    expect(verdict).toMatchObject({ kind: 'settled', received: ['review-a-1-2'], failed: ['review-b-1-1', 'review-c-1-1'], accepted: 2, mutated: 2 });
    expect(verdict).not.toHaveProperty('restored');
  });

  it('lets a human acceptance proceed although a superseded attempt is still open — only latest attempts may be running (T-8 pin)', () => {
    const superseded = ticket('a', 1);
    const tickets = [superseded, ticket('a', 2, { state: 'consumed' }), ticket('b', 1, { state: 'refused', refusal: { reason: 'mutated', detail: 'x' } })];
    const verdict = judgeFailure({ changeDir: '/c/x', target: tickets[2]!, tickets, current: changed, accept: true });
    expect(verdict).toEqual({ kind: 'end', stems: ['review-b-1-1'] });
  });

  it('does not let a refused attempt that a consumed one superseded block the sink or a new issue (C-3 pin)', () => {
    const stale = ticket('a', 1, { state: 'refused', refusal: { reason: 'mutated', detail: 'x', observed: changed, changed: ['content'] } });
    const tickets = [stale, ticket('a', 2, { state: 'consumed' })];
    const verdict = judgeSettlement(tickets);
    expect(verdict).toMatchObject({ kind: 'settled', received: [], failed: [], mutated: 1 });
    expect((verdict as { live: StoredTicket[] }).live.map((t) => t.stem)).toEqual(['review-a-1-1']);
    expect(judgeIssue({ changeDir: '/c/x', tickets, key: { station: 'review', role: 'b', round: 1 }, current: changed, payloadExists: false })).toEqual({ kind: 'issue', attempt: 1 });
  });

  it('keeps the checkpoint of exactly the attempts a human accepted', () => {
    expect(keepsCheckpoint(ticket('a', 1, { state: 'failed', failure: { at_ms: 1, reason: 'r', accepted: { state: pre } } }).ticket)).toBe(true);
    expect(keepsCheckpoint(ticket('a', 1, { state: 'failed', failure: { at_ms: 1, reason: 'r' } }).ticket)).toBe(false);
    expect(keepsCheckpoint(ticket('a', 1, { state: 'received' }).ticket)).toBe(false);
  });
});

// --- Lifecycle over a real repository ----------------------------------------

let repo: string;
let changeDir: string;
const git = (...args: string[]) => gitIn(repo, ...args);
const put = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), text);
};
const FINDINGS = JSON.stringify([{ id: 'F-1', location: 'a.ts:1', severity: 'minor', lens: 'correctness', summary: 'nit' }]);
const writePayload = (p: string, body = FINDINGS) => {
  fs.mkdirSync(path.dirname(path.join(repo, p)), { recursive: true });
  fs.writeFileSync(path.join(repo, p), body);
};
const ticketFile = (stem: string) => path.join(changeDir, '.delegated', `${stem}.ticket.json`);
const snapshotsOf = (stem: string) => fs.readdirSync(snapshotRoot()).filter((n) => n.startsWith(`${SNAPSHOT_PREFIX}${stem}-`));

describe('delegation lifecycle (REQ-LIB-092)', () => {
  beforeEach(() => {
    repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'delegation-')));
    git('init', '-q', '-b', 'main');
    put('.gitignore', '.prospec/\n');
    put('src/a.ts', 'committed\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    put('src/a.ts', 'uncommitted\n');
    changeDir = path.join(repo, '.prospec', 'changes', 'x');
    fs.mkdirSync(changeDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('issues, receives, settles and consumes over an untouched tree', async () => {
    const issued = await issueTicket({ cwd: repo, changeDir, key });
    expect(issued.payloadPath).toBe(path.join(changeDir, '.delegated', 'review-lens-a-1-1.json'));
    expect(fs.readFileSync(path.join(issued.snapshotProjectPath, 'src/a.ts'), 'utf8')).toBe('uncommitted\n');
    writePayload(issued.ticket.payload_path);
    const receipt = await receiveTicket({ cwd: repo, changeDir, stem: issued.stem });
    expect(receipt.verdict).toEqual({ kind: 'received' });
    expect(fs.existsSync(issued.ticket.snapshot.path)).toBe(false);
    expect(fs.existsSync(checkpointDirOf(changeDir, issued.stem))).toBe(false);
    const settled = await consumeSettlement(changeDir, admitSettlement(changeDir, 'review'));
    expect(settled).toEqual({ kind: 'settled', received: [issued.stem], failed: [], accepted: 0, mutated: 0, unconsumed: [] });
    expect(readTickets(changeDir, 'settle')[0]!.ticket.state).toBe('consumed');
  });

  it('refuses a mutation at receipt, keeps the snapshot and checkpoint, refuses the sink and any new attempt, and admits one after a manual recovery', async () => {
    const issued = await issueTicket({ cwd: repo, changeDir, key });
    git('checkout', '--', 'src/a.ts');
    const receipt = await receiveTicket({ cwd: repo, changeDir, stem: issued.stem });
    expect(receipt.verdict).toMatchObject({ kind: 'refused', reason: 'mutated', changed: ['content'], checkpoint: checkpointDirOf(changeDir, issued.stem) });
    expect(fs.existsSync(issued.ticket.snapshot.path)).toBe(true);
    expect(fs.existsSync(checkpointDirOf(changeDir, issued.stem))).toBe(true);
    expect(() => admitSettlement(changeDir, 'review')).toThrow(/Unsettled review delegation/);
    await expect(issueTicket({ cwd: repo, changeDir, key })).rejects.toThrow(/review-lens-a-1-1/);
    await expect(issueTicket({ cwd: repo, changeDir, key: { ...key, role: 'lens-b' } })).rejects.toThrow(/review-lens-a-1-1/);
    // The human recovers by hand, from the checkpoint's copy.
    const entry = issued.ticket.checkpoint.entries.find((e) => e.path === 'src/a.ts')!;
    fs.copyFileSync(checkpointBlobPath(changeDir, issued.stem, entry.sha256!), path.join(repo, 'src/a.ts'));
    const next = await issueTicket({ cwd: repo, changeDir, key });
    expect(next.stem).toBe('review-lens-a-1-2');
    // The superseded attempt's snapshot and checkpoint go.
    expect(fs.existsSync(checkpointDirOf(changeDir, issued.stem))).toBe(false);
    expect(fs.existsSync(issued.ticket.snapshot.path)).toBe(false);
  });

  it("refuses an issue across keys while another open ticket's tree has changed", async () => {
    await issueTicket({ cwd: repo, changeDir, key });
    put('src/a.ts', 'damaged by lens-a\n');
    await expect(issueTicket({ cwd: repo, changeDir, key: { ...key, role: 'lens-b' } })).rejects.toThrow(/review-lens-a-1-1/);
  });

  it('does not consult tickets of another change in the same repository', async () => {
    const otherDir = path.join(repo, '.prospec', 'changes', 'y');
    fs.mkdirSync(otherDir, { recursive: true });
    await issueTicket({ cwd: repo, changeDir: otherDir, key });
    put('src/a.ts', 'changed while y delegates\n');
    expect((await issueTicket({ cwd: repo, changeDir, key })).stem).toBe('review-lens-a-1-1');
  });

  it('ends a failed spawn with the hook called before the write, and refuses it over a changed tree', async () => {
    const issued = await issueTicket({ cwd: repo, changeDir, key });
    put('src/a.ts', 'damaged\n');
    await expect(markFailed({ cwd: repo, changeDir, stem: issued.stem, reason: 'crashed' })).rejects.toThrow(/not what it was/);
    put('src/a.ts', 'uncommitted\n');
    const seen: string[] = [];
    const result = await markFailed({
      cwd: repo,
      changeDir,
      stem: issued.stem,
      reason: 'rate limit',
      beforeWrite: async ({ stem }) => {
        seen.push(`${stem}:${readTickets(changeDir, 'fail').find((t) => t.stem === stem)!.ticket.state}`);
      },
    });
    expect(seen).toEqual([`${issued.stem}:open`]);
    expect(result.ended[0]!.ticket.state).toBe('failed');
    expect(fs.existsSync(checkpointDirOf(changeDir, issued.stem))).toBe(false);
  });

  it('refuses a transition when the ticket on disk changed after it was judged', async () => {
    const issued = await issueTicket({ cwd: repo, changeDir, key });
    await expect(
      markFailed({
        cwd: repo,
        changeDir,
        stem: issued.stem,
        reason: 'rate limit',
        beforeWrite: async () => {
          const json = JSON.parse(fs.readFileSync(ticketFile(issued.stem), 'utf8'));
          fs.writeFileSync(ticketFile(issued.stem), JSON.stringify({ ...json, returned_unreadable_at_ms: 1 }));
        },
      }),
    ).rejects.toThrow(/changed after it was judged/);
    expect(readTickets(changeDir, 'settle')[0]!.ticket.state).toBe('open');
    const [stored] = readTickets(changeDir, 'receive');
    const stale = { ...stored!.ticket, returned_unreadable_at_ms: undefined };
    await expect(transitionTicket(changeDir, issued.stem, stale, { ...stored!.ticket, state: 'received' }, 'receive')).rejects.toThrow(/changed after it was judged/);
    await expect(transitionTicket(changeDir, issued.stem, stored!.ticket, { ...stored!.ticket, state: 'received', received: { at_ms: 1 } }, 'receive')).resolves.toBeUndefined();
  });

  it('records that the delegate returned when only a facet is unreadable (an untracked nested repository)', async () => {
    const issued = await issueTicket({ cwd: repo, changeDir, key });
    fs.mkdirSync(path.join(repo, 'nested'));
    execFileSync('git', ['init', '-q'], { cwd: path.join(repo, 'nested') });
    fs.writeFileSync(path.join(repo, 'nested', 'f'), 'x');
    const receipt = await receiveTicket({ cwd: repo, changeDir, stem: issued.stem });
    expect(receipt.verdict).toMatchObject({ kind: 'pending', reason: 'unreadable' });
    expect(receipt.ticket.state).toBe('open');
    expect(receipt.ticket.returned_unreadable_at_ms).toEqual(expect.any(Number));
  });

  it('keeps the checkpoint of every attempt ended by a human acceptance, through the sink', async () => {
    const issued = await issueTicket({ cwd: repo, changeDir, key });
    git('checkout', '--', 'src/a.ts');
    await receiveTicket({ cwd: repo, changeDir, stem: issued.stem });
    const result = await markFailed({ cwd: repo, changeDir, stem: issued.stem, reason: 'recovery declined', acceptCurrentTree: true });
    const kept = checkpointDirOf(changeDir, issued.stem);
    expect(result.ended[0]!.keptCheckpoint).toBe(kept);
    expect(result.ended[0]!.ticket.failure?.accepted?.state).toEqual(result.current);
    const settled = await consumeSettlement(changeDir, admitSettlement(changeDir, 'review'));
    expect(settled).toMatchObject({ kind: 'settled', accepted: 1, mutated: 1 });
    expect(fs.readdirSync(path.join(kept, 'blobs')).length).toBe(1);
    expect(fs.existsSync(issued.ticket.snapshot.path)).toBe(false);
  });

  it('ends parallel tickets that returned with an unreadable facet in one acceptance, keeping each checkpoint', async () => {
    const a = await issueTicket({ cwd: repo, changeDir, key });
    const b = await issueTicket({ cwd: repo, changeDir, key: { ...key, role: 'lens-b' } });
    fs.mkdirSync(path.join(repo, 'nested'));
    execFileSync('git', ['init', '-q'], { cwd: path.join(repo, 'nested') });
    fs.writeFileSync(path.join(repo, 'nested', 'f'), 'x');
    await receiveTicket({ cwd: repo, changeDir, stem: a.stem });
    await receiveTicket({ cwd: repo, changeDir, stem: b.stem });
    const warned: string[] = [];
    const result = await markFailed({
      cwd: repo,
      changeDir,
      stem: a.stem,
      reason: 'nested repository kept',
      acceptCurrentTree: true,
      beforeWrite: async ({ stem }) => { warned.push(stem); },
    });
    expect(result.ended.map((e) => e.stem)).toEqual([a.stem, b.stem]);
    expect(warned).toEqual([a.stem, b.stem]);
    for (const e of result.ended) expect(fs.existsSync(checkpointDirOf(changeDir, e.stem))).toBe(true);
  });

  it.each([['station', 'verify'], ['role', 'lens-z'], ['round', 9], ['attempt', 7]])('fails closed on a ticket whose %s disagrees with its file name', async (field, value) => {
    const issued = await issueTicket({ cwd: repo, changeDir, key });
    const json = JSON.parse(fs.readFileSync(ticketFile(issued.stem), 'utf8'));
    fs.writeFileSync(ticketFile(issued.stem), JSON.stringify({ ...json, [field]: value }));
    expect(() => readTickets(changeDir, 'settle')).toThrow(/do not match its file name/);
  });

  it('fails closed on a ticket whose payload path is not the one its stem assigns', async () => {
    const issued = await issueTicket({ cwd: repo, changeDir, key });
    const json = JSON.parse(fs.readFileSync(ticketFile(issued.stem), 'utf8'));
    fs.writeFileSync(ticketFile(issued.stem), JSON.stringify({ ...json, payload_path: '.prospec/changes/other/.delegated/x.json' }));
    expect(() => readTickets(changeDir, 'settle')).toThrow(/payload path/);
  });

  it('fails closed on a ticket file that is not a stem, not JSON, or not a ticket', async () => {
    await ensureDelegationDir(changeDir);
    fs.writeFileSync(path.join(changeDir, '.delegated', 'Not-A-Stem.ticket.json'), '{}');
    expect(() => readTickets(changeDir, 'settle')).toThrow(/not a delegation stem/);
    fs.rmSync(path.join(changeDir, '.delegated', 'Not-A-Stem.ticket.json'));
    fs.writeFileSync(ticketFile('review-lens-a-1-1'), 'not json');
    expect(() => readTickets(changeDir, 'settle')).toThrow(/unreadable/);
    fs.writeFileSync(ticketFile('review-lens-a-1-1'), '{"version":1}');
    expect(() => readTickets(changeDir, 'settle')).toThrow(/unreadable/);
  });

  it('releases only the paths the change directory and stem derive, whatever the ticket says', async () => {
    const issued = await issueTicket({ cwd: repo, changeDir, key });
    const decoy = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'delegation-decoy-')));
    fs.writeFileSync(path.join(decoy, 'keep'), 'x');
    const json = JSON.parse(fs.readFileSync(ticketFile(issued.stem), 'utf8'));
    fs.writeFileSync(ticketFile(issued.stem), JSON.stringify({ ...json, snapshot: { path: decoy, nonce: json.snapshot.nonce } }));
    writePayload(issued.ticket.payload_path);
    const receipt = await receiveTicket({ cwd: repo, changeDir, stem: issued.stem });
    expect(receipt.unreleased).toEqual([decoy]);
    expect(fs.existsSync(path.join(decoy, 'keep'))).toBe(true);
    expect(fs.existsSync(checkpointDirOf(changeDir, issued.stem))).toBe(false);
    fs.rmSync(json.snapshot.path, { recursive: true, force: true });
    fs.rmSync(decoy, { recursive: true, force: true });
  });

  it("keeps another key's snapshot and checkpoint when it issues", async () => {
    const a = await issueTicket({ cwd: repo, changeDir, key });
    await issueTicket({ cwd: repo, changeDir, key: { ...key, role: 'lens-b' } });
    expect(fs.existsSync(a.ticket.snapshot.path)).toBe(true);
    expect(fs.existsSync(checkpointDirOf(changeDir, a.stem))).toBe(true);
  });

  it('claims its checkpoint directory exclusively — a stem already holding one is refused and left alone', async () => {
    const taken = path.join(changeDir, '.delegated', 'review-lens-a-1-1.checkpoint');
    fs.mkdirSync(path.dirname(taken), { recursive: true });
    fs.writeFileSync(taken, 'not a directory, so no leftover attempt either');
    await expect(issueTicket({ cwd: repo, changeDir, key })).rejects.toThrow(/being issued concurrently, or its checkpoint outlived it/);
    expect(fs.readFileSync(taken, 'utf8')).toBe('not a directory, so no leftover attempt either');
    expect(readTickets(changeDir, 'issue')).toEqual([]);
  });

  it("lets one of two concurrent issues of the same attempt win, and never removes the winner's checkpoint", async () => {
    await ensureDelegationDir(changeDir);
    const results = await Promise.allSettled([issueTicket({ cwd: repo, changeDir, key }), issueTicket({ cwd: repo, changeDir, key })]);
    const won = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof issueTicket>>> => r.status === 'fulfilled');
    expect(won).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { message: expect.stringMatching(/concurrently/) } });
    expect(fs.existsSync(path.join(checkpointDirOf(changeDir, won[0]!.value.stem), 'index'))).toBe(true);
  });

  it('leaves no ticket, no checkpoint and no snapshot behind when the snapshot cannot reproduce the tree', async () => {
    put('.gitattributes', '*.txt text eol=crlf\n');
    put('doc.txt', 'line one\nline two\n');
    git('add', '.gitattributes', 'doc.txt');
    git('commit', '-qm', 'attrs');
    const before = snapshotsOf('review-lens-a-1-1');
    await expect(issueTicket({ cwd: repo, changeDir, key })).rejects.toThrow(/does not reproduce the working tree/);
    expect(fs.existsSync(checkpointDirOf(changeDir, 'review-lens-a-1-1'))).toBe(false);
    expect(fs.existsSync(ticketFile('review-lens-a-1-1'))).toBe(false);
    expect(snapshotsOf('review-lens-a-1-1')).toEqual(before);
  });

  it('refuses a ticket its schema would not read back, leaving no ticket, checkpoint or snapshot', async () => {
    const huge = { ...key, round: 2 ** 53 };
    const stem = `review-lens-a-${2 ** 53}-1`;
    const before = snapshotsOf(stem).length;
    await expect(issueTicket({ cwd: repo, changeDir, key: huge })).rejects.toThrow(/would not be readable/);
    expect(fs.existsSync(checkpointDirOf(changeDir, stem))).toBe(false);
    expect(fs.existsSync(ticketFile(stem))).toBe(false);
    expect(snapshotsOf(stem).length).toBe(before);
  });

  it("numbers past a leftover checkpoint of its own key, and not past another key's", async () => {
    fs.mkdirSync(checkpointDirOf(changeDir, 'review-lens-a-1-1'), { recursive: true });
    fs.mkdirSync(checkpointDirOf(changeDir, 'review-lens-b-1-3'), { recursive: true });
    expect((await issueTicket({ cwd: repo, changeDir, key })).stem).toBe('review-lens-a-1-2');
    expect((await issueTicket({ cwd: repo, changeDir, key: { ...key, role: 'lens-c' } })).stem).toBe('review-lens-c-1-1');
  });

  it('counts a leftover only when its attempt stays a safe integer', async () => {
    fs.mkdirSync(checkpointDirOf(changeDir, `review-lens-a-1-${Number.MAX_SAFE_INTEGER}`), { recursive: true });
    fs.mkdirSync(checkpointDirOf(changeDir, 'review-lens-a-1-99999999999999999999'), { recursive: true });
    expect((await issueTicket({ cwd: repo, changeDir, key })).stem).toBe('review-lens-a-1-1');
  });

  it('creates a ticket without clobbering one that already exists', async () => {
    const issued = await issueTicket({ cwd: repo, changeDir, key });
    const before = fs.readFileSync(ticketFile(issued.stem), 'utf8');
    expect(() => createTicketExclusive(changeDir, issued.stem, { ...issued.ticket, state: 'received' })).toThrow(/EEXIST/);
    expect(fs.readFileSync(ticketFile(issued.stem), 'utf8')).toBe(before);
    expect(fs.readdirSync(path.join(changeDir, '.delegated')).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  it('refuses a new attempt when its payload file already exists', async () => {
    writePayload('.prospec/changes/x/.delegated/review-lens-a-1-1.json');
    await expect(issueTicket({ cwd: repo, changeDir, key })).rejects.toThrow(/already exists/);
  });

  it('receives through the real payload reader: a symlink stays pending, a half-written file stays pending, a verify grader is received', async () => {
    const issued = await issueTicket({ cwd: repo, changeDir, key });
    const target = path.join(changeDir, 'elsewhere.json');
    fs.writeFileSync(target, FINDINGS);
    fs.symlinkSync(target, path.join(repo, issued.ticket.payload_path));
    expect((await receiveTicket({ cwd: repo, changeDir, stem: issued.stem })).verdict).toMatchObject({ kind: 'pending', reason: 'not-regular' });
    fs.rmSync(path.join(repo, issued.ticket.payload_path));
    fs.rmSync(target);
    writePayload(issued.ticket.payload_path, FINDINGS.slice(0, 20));
    expect((await receiveTicket({ cwd: repo, changeDir, stem: issued.stem })).verdict).toMatchObject({ kind: 'pending', reason: 'incomplete' });
    writePayload(issued.ticket.payload_path);
    expect((await receiveTicket({ cwd: repo, changeDir, stem: issued.stem })).verdict).toEqual({ kind: 'received' });
    const grader = await issueTicket({ cwd: repo, changeDir, key: { station: 'verify', role: 'grader', round: 1 } });
    writePayload(grader.ticket.payload_path, JSON.stringify([{ name: 'delta-spec-compliance', result: 'PASS', graded_by: 'fresh-subagent' }]));
    expect((await receiveTicket({ cwd: repo, changeDir, stem: grader.stem })).verdict).toEqual({ kind: 'received' });
  });

  it('refuses a schema-invalid payload and keeps its snapshot and checkpoint', async () => {
    const issued = await issueTicket({ cwd: repo, changeDir, key });
    writePayload(issued.ticket.payload_path, '[{"nope":1}]');
    expect((await receiveTicket({ cwd: repo, changeDir, stem: issued.stem })).verdict).toMatchObject({ kind: 'refused', reason: 'schema' });
    expect(fs.existsSync(issued.ticket.snapshot.path)).toBe(true);
    expect(fs.existsSync(checkpointDirOf(changeDir, issued.stem))).toBe(true);
  });

  it('names receive, --spawn-failed and the human recovery in the sink refusal, never a CLI restore', async () => {
    const a = await issueTicket({ cwd: repo, changeDir, key });
    const b = await issueTicket({ cwd: repo, changeDir, key: { ...key, role: 'lens-b' } });
    git('checkout', '--', 'src/a.ts');
    await receiveTicket({ cwd: repo, changeDir, stem: a.stem });
    let refusal: { message: string; suggestion: string } | undefined;
    try {
      admitSettlement(changeDir, 'review');
    } catch (error) {
      refusal = error as { message: string; suggestion: string };
    }
    expect(refusal?.message).toContain(`${b.stem} has not been received`);
    expect(refusal?.suggestion).toContain(`prospec change delegate --change x --receive ${b.stem}`);
    expect(refusal?.suggestion).toContain(checkpointDirOf(changeDir, a.stem));
    expect(refusal?.suggestion).not.toMatch(/--restore/);
  });

  it('reports every stem unconsumed when the tickets cannot be read after admission, and a stem that vanished', async () => {
    const a = await issueTicket({ cwd: repo, changeDir, key });
    const b = await issueTicket({ cwd: repo, changeDir, key: { ...key, role: 'lens-b' } });
    for (const t of [a, b]) {
      writePayload(t.ticket.payload_path);
      await receiveTicket({ cwd: repo, changeDir, stem: t.stem });
    }
    const admitted = admitSettlement(changeDir, 'review');
    fs.rmSync(ticketFile(b.stem));
    await expect(consumeSettlement(changeDir, admitted)).resolves.toMatchObject({ unconsumed: [b.stem] });
    fs.writeFileSync(ticketFile(a.stem), 'not json');
    await expect(consumeSettlement(changeDir, admitted)).resolves.toMatchObject({ unconsumed: [a.stem, b.stem] });
  });

  it('reports an attempt it cannot mark consumed, and still settles', async () => {
    const issued = await issueTicket({ cwd: repo, changeDir, key });
    writePayload(issued.ticket.payload_path);
    await receiveTicket({ cwd: repo, changeDir, stem: issued.stem });
    const admitted = admitSettlement(changeDir, 'review');
    const dir = path.join(changeDir, '.delegated');
    fs.chmodSync(dir, 0o555);
    try {
      await expect(consumeSettlement(changeDir, admitted)).resolves.toMatchObject({ kind: 'settled', unconsumed: [issued.stem] });
    } finally {
      fs.chmodSync(dir, 0o755);
    }
  });

  it('consumes superseded attempts too, and a re-run of the sink finds nothing to settle', async () => {
    const first = await issueTicket({ cwd: repo, changeDir, key });
    writePayload(first.ticket.payload_path, '[{"nope":1}]');
    await receiveTicket({ cwd: repo, changeDir, stem: first.stem });
    const second = await issueTicket({ cwd: repo, changeDir, key });
    writePayload(second.ticket.payload_path);
    await receiveTicket({ cwd: repo, changeDir, stem: second.stem });
    await consumeSettlement(changeDir, admitSettlement(changeDir, 'review'));
    expect(readTickets(changeDir, 'settle').map((t) => t.ticket.state)).toEqual(['consumed', 'consumed']);
    expect(admitSettlement(changeDir, 'review')).toEqual({ kind: 'not-ticketed' });
  });
});
