import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { issueTicket, receiveTicket, markFailed, readTickets, admitSettlement, consumeSettlement } from '../../src/lib/delegation.js';
import { gitIn } from '../helpers/git-fixture.js';
import { usePrivateTmpdir } from '../helpers/private-tmpdir.js';
import { DelegationTicketSchema } from '../../src/types/delegation.js';
const faults = vi.hoisted(() => ({ write: false }));
vi.mock('../../src/lib/fs-utils.js', async (original) => {
  const actual = await original<typeof import('../../src/lib/fs-utils.js')>();
  return { ...actual, atomicWrite: async (...args: Parameters<typeof actual.atomicWrite>) => {
    if (faults.write) throw new Error('evidence write failed');
    return actual.atomicWrite(...args);
  } };
});
vi.setConfig({ testTimeout: 30_000 });
usePrivateTmpdir('delegation-worktrees');
let root: string, repo: string, sibling: string, changeDir: string;
const key = { station: 'review' as const, role: 'reviewer', round: 1 };
const issue = (role = 'reviewer') => issueTicket({ cwd: repo, changeDir, key: { ...key, role } });
const moveSibling = () => gitIn(sibling, 'commit', '--allow-empty', '-qm', 'sibling');
beforeEach(() => {
  faults.write = false;
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-receipt-')));
  repo = path.join(root, 'main'); sibling = path.join(root, 'other');
  fs.mkdirSync(repo); gitIn(repo, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, '.gitignore'), '.prospec/\n');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'base\n');
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'base');
  gitIn(repo, 'worktree', 'add', '-qb', 'other', sibling);
  changeDir = path.join(repo, '.prospec/changes/x'); fs.mkdirSync(changeDir, { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('V2 delegation lifecycle in shared repositories', () => {
  it('issues V2 and records allowed sibling evidence through receipt', async () => {
    const issued = await issue();
    expect(issued.ticket.version).toBe(2);
    moveSibling();
    fs.writeFileSync(issued.payloadPath, '[]');
    const received = await receiveTicket({ cwd: repo, changeDir, stem: issued.stem });
    expect(received.verdict.kind).toBe('received');
    expect(received.ticket).toMatchObject({ version: 2, assessments: { issue: {}, receive: { assessment: { allowed_refs: [{ name: 'refs/heads/other', reason: 'non-current-branch' }] } } } });
  });
  it('admits another issue and ordinary failure after sibling activity', async () => {
    const first = await issue(); moveSibling();
    const second = await issue('second');
    const warnings = vi.fn();
    await markFailed({ cwd: repo, changeDir, stem: first.stem, reason: 'spawn failed', beforeWrite: warnings });
    expect(warnings).toHaveBeenCalledOnce();
    expect(readTickets(changeDir, 'fail').find((entry) => entry.stem === first.stem)?.ticket).toMatchObject({ state: 'failed', assessments: { failure: { assessment: { allowed_refs: [{ name: 'refs/heads/other' }] } } } });
    await markFailed({ cwd: repo, changeDir, stem: second.stem, reason: 'done' });
  });
  it('persists pending and refused observations without ending or warning on ordinary failure refusal', async () => {
    const issued = await issue(); moveSibling();
    expect((await receiveTicket({ cwd: repo, changeDir, stem: issued.stem })).verdict).toMatchObject({ kind: 'pending', reason: 'missing' });
    expect(readTickets(changeDir, 'receive')[0]?.ticket).toHaveProperty('assessments.receive');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'lost\n');
    const warnings = vi.fn();
    await expect(markFailed({ cwd: repo, changeDir, stem: issued.stem, reason: 'failed', beforeWrite: warnings })).rejects.toThrow();
    expect(warnings).not.toHaveBeenCalled();
    expect(readTickets(changeDir, 'fail')[0]?.ticket).toMatchObject({ state: 'open', assessments: { failure: { assessment: { protected: ['content'], allowed_refs: [{ name: 'refs/heads/other' }] } } } });
    expect(fs.existsSync(issued.ticket.snapshot.path)).toBe(true);
    const refused = await receiveTicket({ cwd: repo, changeDir, stem: issued.stem });
    expect(refused.verdict).toMatchObject({ kind: 'refused', reason: 'mutated', changed: ['content'] });
  });
});

describe('versioned evidence persistence boundaries', () => {
  const ticketPath = (stem: string) => path.join(changeDir, '.delegated', `${stem}.ticket.json`);
  it('preserves V1 shape and strict behavior alongside V2 tickets', async () => {
    const issued = await issue();
    const legacy = JSON.parse(fs.readFileSync(ticketPath(issued.stem), 'utf8'));
    legacy.version = 1; delete legacy.assessments; delete legacy.pre_spawn.topology;
    fs.writeFileSync(ticketPath(issued.stem), JSON.stringify(legacy));
    await issue('v2'); moveSibling();
    await expect(issue('blocked')).rejects.toThrow();
    const result = await receiveTicket({ cwd: repo, changeDir, stem: issued.stem });
    expect(result.verdict).toMatchObject({ kind: 'refused', reason: 'mutated', changed: ['refs'] });
    expect(result.ticket).not.toHaveProperty('assessments');
    expect(result.ticket.refusal?.observed).not.toHaveProperty('topology');
    expect(readTickets(changeDir, 'receive')).toHaveLength(2);
  });
  it('fails the operation when pending/refused failure evidence cannot be written', async () => {
    const issued = await issue();
    const original = fs.readFileSync(ticketPath(issued.stem), 'utf8');
    faults.write = true;
    await expect(receiveTicket({ cwd: repo, changeDir, stem: issued.stem })).rejects.toThrow('evidence write failed');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'changed');
    const warning = vi.fn();
    await expect(markFailed({ cwd: repo, changeDir, stem: issued.stem, reason: 'failed', beforeWrite: warning })).rejects.toThrow('evidence write failed');
    expect(warning).not.toHaveBeenCalled();
    expect(fs.readFileSync(ticketPath(issued.stem), 'utf8')).toBe(original);
    expect(fs.existsSync(issued.ticket.snapshot.path)).toBe(true);
  });
  it('retains received evidence during settlement without comparing the tree again', async () => {
    const issued = await issue(); moveSibling(); fs.writeFileSync(issued.payloadPath, '[]');
    const received = await receiveTicket({ cwd: repo, changeDir, stem: issued.stem });
    const admitted = admitSettlement(changeDir, 'review');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'legitimate fix');
    await consumeSettlement(changeDir, admitted);
    const consumed = readTickets(changeDir, 'settle')[0]!.ticket;
    expect(consumed.state).toBe('consumed');
    if (consumed.version !== 2 || received.ticket.version !== 2) throw new Error('expected V2');
    expect(consumed.assessments).toEqual(received.ticket.assessments);
  });
  it('allows sibling stash prefix additions, but refuses removal of baseline stash', async () => {
    fs.writeFileSync(path.join(sibling, 'a.txt'), 'baseline stash'); gitIn(sibling, 'stash', 'push', '-qm', 'base');
    const issued = await issue();
    fs.writeFileSync(path.join(sibling, 'a.txt'), 'new stash'); gitIn(sibling, 'stash', 'push', '-qm', 'new');
    const pending = await receiveTicket({ cwd: repo, changeDir, stem: issued.stem });
    expect(pending.assessment.stash_added).toHaveLength(1);
    expect(pending.verdict).toMatchObject({ kind: 'pending', reason: 'missing' });
    gitIn(sibling, 'stash', 'drop', 'stash@{1}');
    expect((await receiveTicket({ cwd: repo, changeDir, stem: issued.stem })).verdict).toMatchObject({ kind: 'refused', changed: ['stash'] });
  });
});

it('allows branch rename and a baseline backup later checked out there', async () => {
  gitIn(repo, 'branch', 'backup');
  const issued = await issue();
  gitIn(sibling, 'branch', '-m', 'renamed');
  const pending = await receiveTicket({ cwd: repo, changeDir, stem: issued.stem });
  expect(pending.verdict.kind).toBe('pending');
  expect(pending.assessment.allowed_refs.map((ref) => ref.name)).toEqual(['refs/heads/other', 'refs/heads/renamed']);
  gitIn(sibling, 'checkout', '-q', 'backup'); moveSibling();
  fs.writeFileSync(issued.payloadPath, '[]');
  const received = await receiveTicket({ cwd: repo, changeDir, stem: issued.stem });
  expect(received.verdict.kind).toBe('received');
  expect(received.assessment.allowed_refs.map((ref) => ref.name)).toEqual(['refs/heads/backup', 'refs/heads/other', 'refs/heads/renamed']);
});

it('refuses stash store in a single worktree even when files and index remain unchanged', async () => {
  gitIn(repo, 'worktree', 'remove', sibling);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'saved');
  gitIn(repo, 'stash', 'push', '-qm', 'saved');
  const oid = gitIn(repo, 'rev-parse', 'refs/stash').trim();
  gitIn(repo, 'stash', 'clear');
  const issued = await issue();
  gitIn(repo, 'stash', 'store', oid);
  const refused = await receiveTicket({ cwd: repo, changeDir, stem: issued.stem });
  expect(refused.verdict).toMatchObject({ kind: 'refused', changed: ['stash'] });
});

describe.each(['new', 'rename', 'late-existing'] as const)('sibling %s branch across lifecycle gates', (movement) => {
  it.each(['receive', 'issue', 'failure'] as const)('allows movement at %s and refuses a neighboring protected tag change', async (gate) => {
    if (movement === 'late-existing') {
      gitIn(repo, 'worktree', 'remove', sibling);
      gitIn(repo, 'branch', 'backup');
    }
    const target = await issue('allowed');
    const control = await issue('protected');
    if (movement === 'new') gitIn(sibling, 'checkout', '-qb', 'created');
    else if (movement === 'rename') gitIn(sibling, 'branch', '-m', 'renamed');
    else gitIn(repo, 'worktree', 'add', '-q', sibling, 'backup');
    moveSibling();
    if (movement === 'late-existing') gitIn(repo, 'worktree', 'remove', sibling);
    if (gate === 'receive') {
      fs.writeFileSync(target.payloadPath, '[]');
      expect((await receiveTicket({ cwd: repo, changeDir, stem: target.stem })).verdict.kind).toBe('received');
    } else if (gate === 'issue') {
      expect((await issue('next')).ticket.state).toBe('open');
    } else {
      expect((await markFailed({ cwd: repo, changeDir, stem: target.stem, reason: 'spawn failed' })).ended[0]?.ticket.state).toBe('failed');
    }
    gitIn(repo, 'tag', 'protected');
    if (gate === 'receive') {
      fs.writeFileSync(control.payloadPath, '[]');
      expect((await receiveTicket({ cwd: repo, changeDir, stem: control.stem })).verdict).toMatchObject({ kind: 'refused', changed: ['refs'] });
    } else if (gate === 'issue') {
      await expect(issue('blocked')).rejects.toThrow();
    } else {
      const warning = vi.fn();
      await expect(markFailed({ cwd: repo, changeDir, stem: control.stem, reason: 'failed', beforeWrite: warning })).rejects.toThrow();
      expect(warning).not.toHaveBeenCalled();
    }
    expect(fs.existsSync(control.ticket.snapshot.path)).toBe(true);
  });
});

it.each(['pop', 'clear'] as const)('refuses successful stash %s removing a baseline entry', async (operation) => {
  fs.writeFileSync(path.join(sibling, 'a.txt'), 'baseline stash');
  gitIn(sibling, 'stash', 'push', '-qm', 'baseline');
  const issued = await issue();
  gitIn(sibling, 'stash', operation);
  if (operation === 'pop') expect(fs.readFileSync(path.join(sibling, 'a.txt'), 'utf8')).toBe('baseline stash');
  expect(gitIn(repo, 'stash', 'list')).toBe('');
  const receipt = await receiveTicket({ cwd: repo, changeDir, stem: issued.stem });
  expect(receipt.verdict).toMatchObject({ kind: 'refused', reason: 'mutated', changed: ['stash'] });
});

describe.each(['open', 'refused'] as const)('physical V1 %s ticket compatibility', (state) => {
  it.each([false, true])('retains strict legacy shape when human acceptance is %s', async (acceptCurrentTree) => {
    const issued = await issue();
    const file = path.join(changeDir, '.delegated', `${issued.stem}.ticket.json`);
    const legacy = JSON.parse(fs.readFileSync(file, 'utf8'));
    legacy.version = 1; delete legacy.assessments; delete legacy.pre_spawn.topology;
    fs.writeFileSync(file, JSON.stringify(DelegationTicketSchema.parse(legacy)));
    if (state === 'refused') {
      fs.writeFileSync(issued.payloadPath, '{}');
      expect((await receiveTicket({ cwd: repo, changeDir, stem: issued.stem })).verdict).toMatchObject({ kind: 'refused', reason: 'schema' });
    }
    if (acceptCurrentTree) {
      moveSibling();
      if (state === 'open') expect((await receiveTicket({ cwd: repo, changeDir, stem: issued.stem })).verdict).toMatchObject({ kind: 'refused', reason: 'mutated' });
    }
    await markFailed({ cwd: repo, changeDir, stem: issued.stem, reason: 'human ended attempt', acceptCurrentTree });
    const serialized = JSON.parse(fs.readFileSync(file, 'utf8'));
    const validated = DelegationTicketSchema.parse(serialized);
    expect(validated).toEqual(serialized);
    expect(validated).toMatchObject({ version: 1, state: 'failed' });
    expect(validated).not.toHaveProperty('assessments');
    expect(JSON.stringify(validated)).not.toContain('topology');
    expect(validated.failure?.accepted !== undefined).toBe(acceptCurrentTree);
  });
});


describe.each(['keep', 'switch', 'remove'] as const)('late existing branch worktree %s', (ending) => {
  it.each(['commit', 'rebase'] as const)('admits %s without retaining worktree history', async (operation) => {
    gitIn(repo, 'worktree', 'remove', sibling);
    gitIn(repo, 'branch', 'backup');
    const base = gitIn(repo, 'rev-parse', 'HEAD').trim();
    const issued = await issue();
    gitIn(repo, 'worktree', 'add', '-q', sibling, 'backup');
    gitIn(sibling, 'commit', '--allow-empty', '-qm', 'one');
    const first = gitIn(sibling, 'rev-parse', 'HEAD').trim();
    gitIn(sibling, 'commit', '--allow-empty', '-qm', 'two');
    if (operation === 'rebase') gitIn(sibling, 'rebase', '--onto', base, first, 'backup');
    const tip = gitIn(sibling, 'rev-parse', 'HEAD').trim();
    expect(tip).not.toBe(base);
    if (ending === 'switch') gitIn(sibling, 'checkout', '-q', 'other');
    if (ending === 'remove') gitIn(repo, 'worktree', 'remove', sibling);
    fs.writeFileSync(issued.payloadPath, '[]');
    const result = await receiveTicket({ cwd: repo, changeDir, stem: issued.stem });
    expect(result.verdict.kind).toBe('received');
    expect(result.assessment.allowed_refs).toEqual([{ name: 'refs/heads/backup', before: base, after: tip, reason: 'non-current-branch' }]);
  });
});

it('admits unattached branch create/move/rename/delete with no sibling', async () => {
  gitIn(repo, 'worktree', 'remove', sibling);
  gitIn(repo, 'branch', 'deleted');
  gitIn(repo, 'branch', 'renamed');
  gitIn(repo, 'branch', 'moved');
  const issued = await issue();
  const tree = gitIn(repo, 'rev-parse', 'HEAD^{tree}').trim();
  const tip = gitIn(repo, 'commit-tree', tree, '-p', 'HEAD', '-m', 'outside scope').trim();
  gitIn(repo, 'branch', 'created', tip);
  gitIn(repo, 'branch', '-f', 'moved', tip);
  gitIn(repo, 'branch', '-m', 'renamed', 'new-name');
  gitIn(repo, 'branch', '-D', 'deleted');
  fs.writeFileSync(issued.payloadPath, '[]');
  const result = await receiveTicket({ cwd: repo, changeDir, stem: issued.stem });
  expect(result.verdict.kind).toBe('received');
  expect(result.assessment.allowed_refs.map((ref) => ref.name)).toEqual(['refs/heads/created', 'refs/heads/deleted', 'refs/heads/moved', 'refs/heads/new-name', 'refs/heads/renamed']);
});

it.each(['baseline-sibling', 'new-sibling'] as const)('retains historical %s evidence through read and settlement', async (reason) => {
  const issued = await issue(); moveSibling(); fs.writeFileSync(issued.payloadPath, '[]');
  const result = await receiveTicket({ cwd: repo, changeDir, stem: issued.stem });
  if (result.ticket.version !== 2) throw new Error('expected V2');
  const historical = structuredClone(result.ticket);
  historical.assessments.receive!.assessment.allowed_refs[0]!.reason = reason;
  const file = path.join(changeDir, '.delegated', `${issued.stem}.ticket.json`);
  fs.writeFileSync(file, JSON.stringify(historical));
  expect(readTickets(changeDir, 'settle')[0]!.ticket).toEqual(historical);
  const admitted = admitSettlement(changeDir, 'review');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'later fix');
  await consumeSettlement(changeDir, admitted);
  const stored = readTickets(changeDir, 'settle')[0]!.ticket;
  expect(stored).toMatchObject({ state: 'consumed', assessments: historical.assessments });
});

// #400: a directory symlink is checkpointed as a link; a deletion beneath a replaced directory is refused before any claim.
describe.skipIf(process.platform === 'win32')('directory symlinks', () => {
  const put = (file: string, text: string) => { fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); fs.writeFileSync(path.join(repo, file), text); };
  const link = (target: string, file: string) => fs.symlinkSync(target, path.join(repo, file));
  const commitAll = (message: string) => { gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', message); };
  const checkpoints = () => (fs.existsSync(path.join(changeDir, '.delegated')) ? fs.readdirSync(path.join(changeDir, '.delegated')) : []).filter((name) => name.endsWith('.checkpoint'));

  it.each([['committed', true], ['untracked', false]] as const)('issues and receives over a %s .claude/skills link', async (_, commit) => {
    put('.agents/skills/demo/SKILL.md', 'skill'); fs.mkdirSync(path.join(repo, '.claude')); link('../.agents/skills', '.claude/skills');
    if (commit) commitAll('share skills');
    const issued = await issue();
    if (!commit) expect(issued.ticket.checkpoint.entries).toContainEqual(expect.objectContaining({ path: '.claude/skills', kind: 'symlink', target: '../.agents/skills' }));
    expect(fs.lstatSync(path.join(issued.snapshotProjectPath, '.claude/skills')).isSymbolicLink()).toBe(true);
    fs.writeFileSync(issued.payloadPath, '[]');
    expect((await receiveTicket({ cwd: repo, changeDir, stem: issued.stem })).verdict.kind).toBe('received');
  });

  const replaceP = (by: 'link' | 'file') => {
    fs.rmSync(path.join(repo, 'p'), { recursive: true });
    if (by === 'link') link('real', 'p'); else put('p', 'file');
  };
  it.each([
    ['an unstaged directory-to-symlink replacement', () => replaceP('link')],
    ['a staged directory-to-symlink replacement', () => { replaceP('link'); gitIn(repo, 'add', '-A'); }],
    ['a staged directory-to-file replacement', () => { replaceP('file'); gitIn(repo, 'add', '-A'); }],
    ['a staged replacement whose working-tree path was then deleted', () => { replaceP('file'); gitIn(repo, 'add', '-A'); fs.rmSync(path.join(repo, 'p')); }],
    ['a replacement by an ignored symlink, which the status does not list', () => {
      fs.appendFileSync(path.join(repo, '.gitignore'), '/p\n'); commitAll('ignore p'); replaceP('link');
    }],
    ['a staged file-to-directory replacement then removed', () => {
      fs.rmSync(path.join(repo, 'q')); put('q/a', 'a'); gitIn(repo, 'add', '-A'); fs.rmSync(path.join(repo, 'q'), { recursive: true });
    }],
  ])('refuses %s before claiming a checkpoint', async (_, arrange) => {
    put('p/a', 'a'); put('real/a', 'a'); put('q', 'file'); commitAll('dirs');
    arrange();
    await expect(issue()).rejects.toMatchObject({ message: expect.stringMatching(/^Cannot checkpoint the deletion of [pq]\/a: its directory [pq] was replaced$/), suggestion: expect.stringContaining('Commit or revert') });
    expect(checkpoints()).toEqual([]);
  });

  it('issues over a plainly removed directory', async () => {
    put('p/a', 'a'); commitAll('dir');
    fs.rmSync(path.join(repo, 'p'), { recursive: true });
    const issued = await issue();
    expect(issued.ticket.checkpoint.entries).toContainEqual({ path: 'p/a', kind: 'deleted' });
  });
});
