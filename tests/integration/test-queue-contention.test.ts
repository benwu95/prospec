import { execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveTestQueueRoot, TEST_QUEUE_GUARD, TEST_QUEUE_STATE_FILE } from '../../src/lib/test-queue.js';

// Real git, real worktrees, many real processes and random SIGKILLs (PB-010).
vi.setConfig({ testTimeout: 240_000, hookTimeout: 60_000 });

const posix = describe.skipIf(process.platform === 'win32');

/**
 * One contender: takes the queue turn of the repository `cwd` belongs to and runs the
 * marker command under it — the same acquire → run → release path both CLI entries use.
 * Exit 0: ran. Exit 75: busy. Exit 70: the queue refused (typed error).
 */
const WORKER = `
  import { withTestQueue } from ${JSON.stringify(path.resolve('src/lib/test-queue.ts'))};
  import { runTestCommand } from ${JSON.stringify(path.resolve('src/lib/test-runner.ts'))};
  const [cwd, key, marker, log, stateFile, runMs] = process.argv.slice(-6);
  const RUN_TIMEOUT_MS = 20000;
  try {
    const out = await withTestQueue(
      { cwd, key, label: key, worktree: cwd, waitMs: 120000, leaseMs: 4000, limits: { pollMs: 40, deadlineGraceMs: 400, prepareLimitMs: 3000, mutexWaitMs: 3000 } },
      // A generous cap: under this many process starts a marker has taken seconds to reach its first line.
      (session) => session.run(RUN_TIMEOUT_MS, (hooks) => runTestCommand(cwd, [process.execPath, marker, log, key, stateFile, runMs].join(' '), RUN_TIMEOUT_MS, undefined, hooks)),
    );
    if (out.kind === 'ran' && out.value.exit_code !== 0) console.error(JSON.stringify(out));
    process.exit(out.kind === 'busy' ? 75 : out.value.exit_code === 0 ? 0 : 1);
  } catch (error) {
    console.error(String(error));
    process.exit(70);
  }
`;

/** The command under the turn: records when it started, under which ticket, and when it ended. */
const MARKER = `
  const fs = require('node:fs');
  const [log, key, stateFile, runMs] = process.argv.slice(2);
  const line = (o) => fs.appendFileSync(log, JSON.stringify({ t: Date.now(), pid: process.pid, key, ...o }) + '\\n');
  const holding = JSON.parse(fs.readFileSync(stateFile, 'utf8')).tickets.find((t) => t.state === 'holding');
  line({ ev: 'start', seq: holding ? holding.seq : -1, holderKey: holding ? holding.key : null });
  setTimeout(() => { line({ ev: 'end' }); }, Number(runMs));
`;

posix('repository test queue under contention (REQ-TESTS-149)', () => {
  let root: string;
  let repo: string;
  let linked: string;
  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prospec-contention-')));
    repo = path.join(root, 'repo');
    linked = path.join(root, 'linked');
    const git = (cwd: string, ...args: string[]): void => { execFileSync('git', args, { cwd, stdio: 'pipe' }); };
    fs.mkdirSync(repo);
    git(repo, 'init', '-q');
    git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
    git(repo, 'worktree', 'add', '-q', linked, '-b', 'side');
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('never overlaps two runs and never grants out of sequence, across two worktrees with random SIGKILLs', async () => {
    const CONTENDERS = 8;
    const marker = path.join(root, 'marker.cjs');
    const log = path.join(root, 'log.jsonl');
    fs.writeFileSync(marker, MARKER);
    fs.writeFileSync(log, '');
    const stateFile = path.join(resolveTestQueueRoot(repo), TEST_QUEUE_STATE_FILE);
    expect(resolveTestQueueRoot(linked)).toBe(resolveTestQueueRoot(repo));

    const exits: Array<{ key: string; code: number | null; killed: boolean; stderr?: string }> = [];
    let live = 0;
    let pending = 0;
    let done!: () => void;
    const finished = new Promise<void>((resolve) => { done = resolve; });
    const settleIfIdle = (): void => { if (live === 0 && pending === 0) done(); };
    const launch = (key: string, cwd: string, attempt: number): void => {
      live++;
      const runMs = 120 + Math.floor(Math.random() * 180);
      const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', WORKER, cwd, key, marker, log, stateFile, String(runMs)], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr!.on('data', (chunk: Buffer) => { stderr += String(chunk); });
      let killed = false;
      // Kill some contenders at a random moment: while starting, waiting, preparing or running.
      const killer = attempt < 3 && Math.random() < 0.4
        ? setTimeout(() => { killed = true; child.kill('SIGKILL'); }, 200 + Math.floor(Math.random() * 1800))
        : undefined;
      child.once('exit', (code) => {
        if (killer !== undefined) clearTimeout(killer);
        live--;
        exits.push({ key, code, killed, ...(stderr === '' ? {} : { stderr: stderr.slice(0, 600) }) });
        // A killed or busy contender re-runs the same command, as an agent would.
        if (killed || code === 75) {
          pending++;
          setTimeout(() => { pending--; launch(key, cwd, attempt + 1); }, Math.floor(Math.random() * 300));
        }
        settleIfIdle();
      });
    };
    for (let i = 0; i < CONTENDERS; i++) setTimeout(() => launch(`contender-${i}`, i % 2 === 0 ? repo : linked, 0), i * 60);
    await new Promise((resolve) => setTimeout(resolve, CONTENDERS * 60 + 50));
    await finished;
    // Commands left running by a killed contender still write their end line.
    await new Promise((resolve) => setTimeout(resolve, 600));

    const events = fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as { t: number; pid: number; key: string; ev: string; seq?: number; holderKey?: string | null });
    const starts = events.filter((e) => e.ev === 'start').sort((a, b) => a.t - b.t);
    const endOf = new Map(events.filter((e) => e.ev === 'end').map((e) => [e.pid, e.t]));
    const refused = exits.filter((e) => e.code === 70).length;
    // The one documented way the queue refuses here: a contender was killed inside the
    // mutex and another inside the guard that removes that stale mutex. The guard is never
    // reclaimed automatically, so every later call is refused until it is removed by hand.
    const wedged = fs.existsSync(path.join(path.dirname(stateFile), TEST_QUEUE_GUARD));
    console.info(`test queue contention: ${starts.length} runs, ${exits.filter((e) => e.killed).length} contenders killed, ${exits.filter((e) => e.code === 75).length} busy, ${refused} refused`);

    // A refusal is only ever that documented state; otherwise every contender got its run.
    if (refused > 0) expect(wedged, 'the queue refused without a leftover guard').toBe(true);
    else expect(new Set(starts.map((s) => s.key)).size).toBe(CONTENDERS);
    for (const start of starts) expect(start.holderKey, `run of ${start.key}`).toBe(start.key);
    // Every command that started also ended: none was killed by a later contender.
    const trail = (key: string): string => JSON.stringify({ events: events.filter((e) => e.key === key), exits: exits.filter((e) => e.key === key) });
    for (const start of starts) expect(endOf.has(start.pid), `run of ${start.key} (pid ${start.pid}) never ended: ${trail(start.key)}`).toBe(true);
    // No overlap: each run starts after the previous one ended.
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]!.t, `${starts[i]!.key} started before ${starts[i - 1]!.key} ended`).toBeGreaterThanOrEqual(endOf.get(starts[i - 1]!.pid)!);
    }
    // No grant out of sequence: tickets run in the order they were numbered.
    for (let i = 1; i < starts.length; i++) expect(starts[i]!.seq!).toBeGreaterThan(starts[i - 1]!.seq!);
  });
});
