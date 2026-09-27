import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseYaml } from '../../../src/lib/yaml-utils.js';
import { delegationFailureWarning, execute } from '../../../src/services/change-delegate.service.js';
import { DELEGATION_PRODUCER } from '../../../src/types/station.js';
import { gitIn } from '../../helpers/git-fixture.js';
import { usePrivateTmpdir } from '../../helpers/private-tmpdir.js';

vi.setConfig({ testTimeout: 30_000 });

// Every snapshot this file builds lands under a root only this file uses (O-1 pin: none may remain).
usePrivateTmpdir('change-delegate');

let repo: string;
const git = (...args: string[]) => gitIn(repo, ...args);
const put = (file: string, text: string) => {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  writeFileSync(path.join(repo, file), text);
};
const FINDINGS = JSON.stringify([{ id: 'F-1', location: 'a.ts:1', severity: 'minor', lens: 'correctness', summary: 'x' }]);
const META = '.prospec/changes/x/metadata.yaml';
const CHECKPOINT = (stem: string) => path.join(repo, '.prospec/changes/x/.delegated', `${stem}.checkpoint`);
const metadata = () => parseYaml(readFileSync(path.join(repo, META), 'utf8')) as {
  quality_log?: Array<{ skill: string; result: string; warnings: string[] }>;
};
const run = (mode: Parameters<typeof execute>[0]['mode']) => execute({ cwd: repo, change: 'x', mode });
const issue = (role = 'reviewer') => run({ kind: 'issue', station: 'review', role, round: 1 });
const savedLocks = process.env.GIT_OPTIONAL_LOCKS;

beforeEach(() => {
  repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'change-delegate-')));
  git('init', '-q', '-b', 'main');
  put('.gitignore', '.prospec/\n');
  put('src/a.ts', 'committed\n');
  git('add', '.');
  git('commit', '-qm', 'base');
  put('src/a.ts', 'uncommitted\n');
  put(META, 'name: x\ncreated_at: "2026-09-25"\nstatus: implemented\nscale: full\n');
});
afterEach(() => {
  if (savedLocks === undefined) delete process.env.GIT_OPTIONAL_LOCKS;
  else process.env.GIT_OPTIONAL_LOCKS = savedLocks;
  try {
    chmodSync(path.join(repo, META), 0o644);
  } catch {
    // restored already
  }
  rmSync(repo, { recursive: true, force: true });
});

describe('change delegate service (REQ-SERVICES-120)', () => {
  it('issues with absolute payload and snapshot paths, normalizing an upper-case finding id in the role', async () => {
    const issued = await issue('verifier-C-1');
    expect(issued).toMatchObject({
      kind: 'issued',
      stem: 'review-verifier-c-1-1-1',
      payloadPath: path.join(repo, '.prospec/changes/x/.delegated/review-verifier-c-1-1-1.json'),
    });
    if (issued.kind !== 'issued') throw new Error('unreachable');
    expect(path.isAbsolute(issued.snapshotPath)).toBe(true);
    expect(readFileSync(path.join(issued.snapshotPath, 'src/a.ts'), 'utf8')).toBe('uncommitted\n');
  });

  it('refuses a role with no letters or digits', async () => {
    await expect(issue('---')).rejects.toThrow(/no letters or digits/);
  });

  it('receives an untouched tree, and reports a pending receipt without throwing', async () => {
    await issue();
    expect(await run({ kind: 'receive', stem: 'review-reviewer-1-1' })).toMatchObject({ kind: 'receipt-failed', verdict: { kind: 'pending', reason: 'missing' } });
    put('.prospec/changes/x/.delegated/review-reviewer-1-1.json', FINDINGS);
    expect(await run({ kind: 'receive', stem: 'review-reviewer-1-1' })).toMatchObject({ kind: 'received' });
  });

  it('refuses a mutated tree with each facet before and after and the absolute checkpoint path — and writes nothing to the tree', async () => {
    await issue();
    git('checkout', '--', 'src/a.ts');
    const result = await run({ kind: 'receive', stem: 'review-reviewer-1-1' });
    expect(result).toMatchObject({
      kind: 'receipt-failed',
      verdict: { kind: 'refused', reason: 'mutated', changed: ['content'], checkpoint: CHECKPOINT('review-reviewer-1-1') },
    });
    if (result.kind !== 'receipt-failed' || result.verdict.kind !== 'refused' || result.verdict.reason !== 'mutated') throw new Error('unreachable');
    expect(result.verdict.facets).toEqual([{ facet: 'content', before: expect.stringMatching(/^[0-9a-f]{64}$/), after: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
    expect(readFileSync(path.join(repo, 'src/a.ts'), 'utf8')).toBe('committed\n');
    expect(existsSync(CHECKPOINT('review-reviewer-1-1'))).toBe(true);
  });

  it('ends a spawn failure with a producer-labelled WARN — never a review entry', async () => {
    await issue();
    const result = await run({ kind: 'spawn-failed', stem: 'review-reviewer-1-1', reason: 'spawn refused: rate limit' });
    expect(result).toMatchObject({ kind: 'failed', stems: ['review-reviewer-1-1'], accepted: false, kept: [] });
    const log = metadata().quality_log ?? [];
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ skill: DELEGATION_PRODUCER, result: 'WARN' });
    expect(log[0]!.warnings[0]).toMatch(/review\/reviewer round 1 attempt 1 \(review-reviewer-1-1\): delegate failed — spawn refused: rate limit/);
  });

  it('refuses to end a delegation over a changed tree unless the human accepts it, then keeps the checkpoint and says so in the WARN', async () => {
    await issue();
    put('src/a.ts', 'damaged\n');
    await expect(run({ kind: 'spawn-failed', stem: 'review-reviewer-1-1', reason: 'crashed' })).rejects.toMatchObject({ code: 'DELEGATION_FAIL_REFUSED' });
    expect(metadata().quality_log ?? []).toHaveLength(0);
    const accepted = await run({ kind: 'spawn-failed', stem: 'review-reviewer-1-1', reason: 'lost work accepted', acceptCurrentTree: true });
    expect(accepted).toMatchObject({ kind: 'failed', accepted: true, kept: [CHECKPOINT('review-reviewer-1-1')] });
    expect(existsSync(CHECKPOINT('review-reviewer-1-1'))).toBe(true);
    expect(metadata().quality_log![0]!.warnings[0]).toMatch(/the human accepted the current repository state/);
  });

  it('copies a refused ticket\'s reason and changed facets into the WARN it writes', async () => {
    await issue();
    git('checkout', '--', 'src/a.ts');
    await run({ kind: 'receive', stem: 'review-reviewer-1-1' });
    await run({ kind: 'spawn-failed', stem: 'review-reviewer-1-1', reason: 'will not re-spawn', acceptCurrentTree: true });
    expect(metadata().quality_log![0]!.warnings[0]).toMatch(/receipt refused \(mutated \[content\]\): delegate mutated the tree/);
  });

  it('writes the WARN before the ticket turns failed: when the WARN cannot be written, the ticket stays open', async () => {
    await issue();
    chmodSync(path.join(repo, META), 0o444);
    chmodSync(path.dirname(path.join(repo, META)), 0o555);
    try {
      await expect(run({ kind: 'spawn-failed', stem: 'review-reviewer-1-1', reason: 'x' })).rejects.toThrow();
    } finally {
      chmodSync(path.dirname(path.join(repo, META)), 0o755);
    }
    const ticket = JSON.parse(readFileSync(path.join(repo, '.prospec/changes/x/.delegated/review-reviewer-1-1.ticket.json'), 'utf8'));
    expect(ticket.state).toBe('open');
  });

  it('refuses an empty reason', async () => {
    await issue();
    await expect(run({ kind: 'spawn-failed', stem: 'review-reviewer-1-1', reason: '  ' })).rejects.toThrow(/must not be empty/);
  });

  it('formats the WARN from the recorded refusal', () => {
    const before = {
      station: 'review', role: 'r', round: 1, attempt: 2,
      refusal: { reason: 'mutated', detail: 'delegate mutated the tree: content (…)', changed: ['content', 'head'] },
    } as unknown as Parameters<typeof delegationFailureWarning>[1];
    expect(delegationFailureWarning('review-r-1-2', before, 'will not re-spawn', false)).toBe(
      'review/r round 1 attempt 2 (review-r-1-2): delegate failed — will not re-spawn; receipt refused (mutated [content, head]): delegate mutated the tree: content (…)',
    );
  });
});

describe('change delegate runs its git reads without optional locks (REQ-SERVICES-120)', () => {
  it('leaves the index untouched even where a stat refresh is due, and restores the environment', async () => {
    const future = new Date(Date.now() + 120_000);
    utimesSync(path.join(repo, '.gitignore'), future, future);
    const index = path.join(repo, '.git', 'index');
    const before = readFileSync(index);
    process.env.GIT_OPTIONAL_LOCKS = '1';
    await issue();
    expect(process.env.GIT_OPTIONAL_LOCKS).toBe('1');
    delete process.env.GIT_OPTIONAL_LOCKS;
    await run({ kind: 'receive', stem: 'review-reviewer-1-1' });
    expect(process.env.GIT_OPTIONAL_LOCKS).toBeUndefined();
    expect(readFileSync(index)).toEqual(before);
  });
});
