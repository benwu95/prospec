import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitIn } from '../../helpers/git-fixture.js';
import { usePrivateTmpdir } from '../../helpers/private-tmpdir.js';

// The delegate of an earlier ticket moves the tree while this ticket is being
// issued: between the facet capture and the checkpoint's copies (content), or
// between the copies and the snapshot (index) (S-8 pin).
let race: 'content' | 'index' | 'sibling' | 'stable' | 'new' | 'rename' = 'index';
let sibling: string;
let protectDuringSnapshot = false;
vi.mock('../../../src/lib/delegation-checkpoint.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/lib/delegation-checkpoint.js')>();
  return {
    ...original,
    writeCheckpoint: async (...args: Parameters<typeof original.writeCheckpoint>) => {
      if (race === 'content') fs.writeFileSync(path.join(args[0], 'src/a.ts'), 'moved before the copies\n');
      return original.writeCheckpoint(...args);
    },
    createSnapshot: async (options: Parameters<typeof original.createSnapshot>[0]) => {
      if (race === 'index') gitIn(options.cwd, 'add', 'src/a.ts');
      if (race === 'new') gitIn(sibling, 'checkout', '-qb', 'created');
      if (race === 'rename') gitIn(sibling, 'branch', '-m', 'renamed');
      if (protectDuringSnapshot) gitIn(options.cwd, 'tag', 'protected');
      if (race === 'sibling') gitIn(sibling, 'commit', '--allow-empty', '-qm', 'parallel');
      return original.createSnapshot(options);
    },
  };
});

const { issueTicket, receiveTicket, readTickets, judgeIssue } = await import('../../../src/lib/delegation.js');
const { captureRepoState, assessDelegationState } = await import('../../../src/lib/repo-state.js');
const { checkpointDirOf } = await import('../../../src/lib/delegation-checkpoint.js');
const { SNAPSHOT_PREFIX, snapshotRoot } = await import('../../../src/lib/git-read.js');

vi.setConfig({ testTimeout: 30_000 });
usePrivateTmpdir('delegation-issue-race');

let repo: string;
let changeDir: string;
const git = (...args: string[]) => gitIn(repo, ...args);
const put = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), text);
};

describe('issueTicket while the tree moves (REQ-LIB-092)', () => {
  beforeEach(() => {
    protectDuringSnapshot = false;
    repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'delegation-race-')));
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
    if (sibling) fs.rmSync(sibling, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it.each([
    ['index', /changed while ticket review-lens-a-1-1 was being issued \(index: /],
    ['content', /changed while ticket review-lens-a-1-1 was being issued \(content\)/],
  ] as const)('refuses, naming the facet, a ticket whose copies were taken after the tree changed — %s (S-8 pin)', async (facet, message) => {
    race = facet;
    await expect(issueTicket({ cwd: repo, changeDir, key: { station: 'review', role: 'lens-a', round: 1 } })).rejects.toMatchObject({
      message,
      suggestion: 'Let the tree settle, then issue again',
    });
    expect(readTickets(changeDir, 'issue')).toEqual([]);
    expect(fs.existsSync(path.join(changeDir, '.delegated', 'review-lens-a-1-1.checkpoint'))).toBe(false);
    expect(fs.readdirSync(snapshotRoot()).filter((n) => n.startsWith(`${SNAPSHOT_PREFIX}review-lens-a-1-1-`))).toEqual([]);
  });

  it('records issue-time allowed movement without replacing the first baseline', async () => {
    sibling = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-sibling-'));
    git('worktree', 'add', '-qb', 'other', sibling);
    race = 'sibling';
    const result = await issueTicket({ cwd: repo, changeDir, key: { station: 'review', role: 'r', round: 1 } });
    expect(result.ticket.version).toBe(2);
    if (result.ticket.version !== 2) throw new Error('expected V2');
    expect(result.ticket.assessments.issue.assessment.allowed_refs).toMatchObject([{ name: 'refs/heads/other' }]);
    expect(result.ticket.pre_spawn.refs).not.toEqual(result.ticket.assessments.issue.observed.refs);
  });

  it.each([
    ['open', 'first'],
    ['open', 'second'],
    ['refused', 'first'],
    ['refused', 'second'],
  ] as const)('retains the %s prior ticket and checkpoint when issuing role %s', async (priorState, role) => {
    race = 'stable';
    const key = { station: 'review' as const, role: 'first', round: 1 };
    git('branch', 'backup');
    sibling = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-sibling-'));
    git('worktree', 'add', '-qb', 'other', sibling);
    const first = await issueTicket({ cwd: repo, changeDir, key });
    if (priorState === 'refused') {
      fs.writeFileSync(first.payloadPath, '{}');
      expect((await receiveTicket({ cwd: repo, changeDir, stem: first.stem })).verdict).toMatchObject({ kind: 'refused', reason: 'schema' });
    }
    gitIn(sibling, 'checkout', '-q', 'backup');
    const beforeCopies = captureRepoState(repo);
    expect(judgeIssue({ changeDir, tickets: readTickets(changeDir, 'issue'), key: { ...key, role }, current: beforeCopies, payloadExists: false }).kind).toBe('issue');
    race = 'sibling';
    let outcome: 'issued' | 'refused' = 'issued';
    try {
      await issueTicket({ cwd: repo, changeDir, key: { ...key, role } });
    } catch (error) {
      expect(error).toMatchObject({ operation: 'issue', ticket: first.stem });
      outcome = 'refused';
    }
    const settled = captureRepoState(repo);
    expect(assessDelegationState(beforeCopies, settled, 'worktree').protected).toEqual([]);
    expect(assessDelegationState(first.ticket.pre_spawn, settled, 'worktree')).toMatchObject({ protected: ['refs'], protected_refs: [{ name: 'refs/heads/backup' }] });
    expect.soft(outcome).toBe('refused');
    expect.soft(fs.existsSync(checkpointDirOf(changeDir, first.stem))).toBe(true);
    expect.soft(readTickets(changeDir, 'issue').map((stored) => stored.stem)).toEqual([first.stem]);
  });

  describe.each(['new', 'rename'] as const)('issue-time sibling %s branch', (movement) => {
    it.each([false, true])('rechecks the settled policy with protected tag=%s', async (protectedTag) => {
      sibling = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-branch-'));
      git('worktree', 'add', '-qb', 'other', sibling);
      race = movement;
      protectDuringSnapshot = protectedTag;
      const pending = issueTicket({ cwd: repo, changeDir, key: { station: 'review', role: 'branch', round: 1 } });
      if (protectedTag) {
        await expect(pending).rejects.toThrow(/changed while ticket/);
        expect(readTickets(changeDir, 'issue')).toEqual([]);
      } else {
        const issued = await pending;
        if (issued.ticket.version !== 2) throw new Error('expected V2');
        const refs = issued.ticket.assessments.issue.assessment.allowed_refs;
        expect(refs.map((ref) => ref.name)).toEqual(movement === 'new' ? ['refs/heads/created'] : ['refs/heads/other', 'refs/heads/renamed']);
        expect(issued.ticket.pre_spawn.refs).not.toEqual(issued.ticket.assessments.issue.observed.refs);
      }
    });
  });
});
