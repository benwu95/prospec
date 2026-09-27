import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitIn } from '../../helpers/git-fixture.js';
import { usePrivateTmpdir } from '../../helpers/private-tmpdir.js';

// The delegate of an earlier ticket moves the tree while this ticket is being
// issued: between the facet capture and the checkpoint's copies (content), or
// between the copies and the snapshot (index) (S-8 pin).
let race: 'content' | 'index' = 'index';
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
      return original.createSnapshot(options);
    },
  };
});

const { issueTicket, readTickets } = await import('../../../src/lib/delegation.js');
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
});
