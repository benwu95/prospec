import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureIdentity,
  captureTree,
  defaultProcessProbe,
  holderStatus,
  killTree,
  killTreeIfAlive,
  runProcessTree,
  treeStatus,
  type ProcessProbe,
} from '../../../src/lib/process-tree.js';
import type { ProcessTree } from '../../../src/types/test-queue.js';

vi.setConfig({ testTimeout: 30_000 });

const START = 'Mon Nov 23 06:00:00 2026';

/** A probe over a scripted process table: `pids` maps a pid to its `ps` line (null = `ps` fails). */
function fakeProbe(platform: string, pids: Record<number, string | null>, groups: number[] = []): ProcessProbe & { killed: string[] } {
  const killed: string[] = [];
  return {
    platform,
    killed,
    exists: (pid) => (pid < 0 ? groups.includes(-pid) : Object.hasOwn(pids, pid)),
    ps: (pid) => pids[pid] ?? null,
    signal: (pid, signal) => { killed.push(`${signal}:${pid}`); },
    taskkill: (pid) => { killed.push(`taskkill:${pid}`); },
  };
}

describe('process status (REQ-LIB-114)', () => {
  it('reads a holder as gone when its pid does not exist', () => {
    expect(holderStatus({ pid: 7, started: START }, fakeProbe('linux', {}))).toBe('gone');
  });

  it('reads a zombie holder as gone even though its start reading still matches', () => {
    expect(holderStatus({ pid: 7, started: START }, fakeProbe('linux', { 7: `Z ${START}` }))).toBe('gone');
  });

  it('reads a holder as alive only when the fresh reading equals the recorded one', () => {
    const probe = fakeProbe('linux', { 7: `S ${START}` });
    expect(holderStatus({ pid: 7, started: START }, probe)).toBe('alive');
    expect(holderStatus({ pid: 7, started: 'Mon Nov 23 05:00:00 2026' }, probe)).toBe('unknown');
    expect(holderStatus({ pid: 7, started: null }, probe)).toBe('unknown');
  });

  it('never reads a failed ps as gone', () => {
    expect(holderStatus({ pid: 7, started: START }, fakeProbe('linux', { 7: null }))).toBe('unknown');
  });

  it('reads every existing pid as unknown on win32, where there is no start reading', () => {
    const probe = fakeProbe('win32', { 7: `S ${START}` });
    expect(holderStatus({ pid: 7, started: null }, probe)).toBe('unknown');
    expect(treeStatus({ kind: 'process', pid: 7, started: null }, probe)).toBe('unknown');
    expect(treeStatus({ kind: 'process', pid: 8, started: null }, probe)).toBe('gone');
  });

  it('takes no start reading on win32, whatever ps would answer', () => {
    const probe = fakeProbe('win32', { 7: `S ${START}` });
    const ps = vi.spyOn(probe, 'ps');
    expect(captureIdentity(7, probe)).toEqual({ pid: 7, started: null });
    expect(captureTree(7, probe)).toEqual({ kind: 'process', pid: 7, started: null });
    expect(ps).not.toHaveBeenCalled();
  });

  it('judges a plain-process tree by its own pid alone: no group is consulted, and a zombie is gone', () => {
    const probe = fakeProbe('linux', { 9: `Z ${START}` }, [8]);
    expect(treeStatus({ kind: 'process', pid: 8, started: START }, probe)).toBe('gone');
    expect(treeStatus({ kind: 'process', pid: 9, started: START }, probe)).toBe('gone');
  });

  const group = (pid: number): ProcessTree => ({ kind: 'process-group', pid, started: START });

  it('reads a group as gone only when neither its leader nor any member exists', () => {
    expect(treeStatus(group(9), fakeProbe('linux', {}, []))).toBe('gone');
    expect(treeStatus(group(9), fakeProbe('linux', {}, [9]))).toBe('unknown');
  });

  it('reads a group as alive when its leader is not a zombie and its reading matches', () => {
    expect(treeStatus(group(9), fakeProbe('linux', { 9: `Ss ${START}` }, [9]))).toBe('alive');
    expect(treeStatus(group(9), fakeProbe('linux', { 9: `Z ${START}` }, [9]))).toBe('unknown');
    expect(treeStatus(group(9), fakeProbe('linux', { 9: 'Ss Tue Nov 24 06:00:00 2026' }, [9]))).toBe('unknown');
    expect(treeStatus(group(9), fakeProbe('linux', { 9: null }, [9]))).toBe('unknown');
  });

  it('kills a group with one SIGKILL to the group, and a win32 process with taskkill then a kill', () => {
    const posix = fakeProbe('linux', { 9: `S ${START}` }, [9]);
    killTree(group(9), posix);
    expect(posix.killed).toEqual(['SIGKILL:-9']);
    const win = fakeProbe('win32', { 9: 'x' });
    killTree({ kind: 'process', pid: 9, started: null }, win);
    expect(win.killed).toEqual(['taskkill:9', 'SIGKILL:9']);
  });

  it('lets a non-parent kill only a tree whose status is alive at that moment', () => {
    const alive = fakeProbe('linux', { 9: `S ${START}` }, [9]);
    expect(killTreeIfAlive(group(9), alive)).toBe(true);
    expect(alive.killed).toEqual(['SIGKILL:-9']);
    const reused = fakeProbe('linux', { 9: 'S Tue Nov 24 06:00:00 2026' }, [9]);
    expect(killTreeIfAlive(group(9), reused)).toBe(false);
    const orphaned = fakeProbe('linux', {}, [9]);
    expect(killTreeIfAlive(group(9), orphaned)).toBe(false);
    expect([...reused.killed, ...orphaned.killed]).toEqual([]);
  });

  it('captures a tree by platform: a process group elsewhere, a plain process on win32', () => {
    expect(captureTree(9, fakeProbe('linux', { 9: `S ${START}` }))).toEqual({ kind: 'process-group', pid: 9, started: START });
    expect(captureTree(9, fakeProbe('win32', { 9: 'x' }))).toEqual({ kind: 'process', pid: 9, started: null });
    expect(captureIdentity(9, fakeProbe('linux', { 9: null }))).toEqual({ pid: 9, started: null });
  });
});

const posix = describe.skipIf(process.platform === 'win32');

posix('process status against real processes (REQ-TESTS-149)', () => {
  const probe = defaultProcessProbe();

  it('takes the same start reading twice for one process', () => {
    const first = captureIdentity(process.pid, probe);
    expect(first.started).not.toBeNull();
    expect(captureIdentity(process.pid, probe)).toEqual(first);
    expect(holderStatus(first, probe)).toBe('alive');
  });

  it('reads a pid it is not allowed to signal as existing', () => {
    // pid 1 answers signal 0 with EPERM for an ordinary user, and with success for root.
    expect(probe.exists(1)).toBe(true);
  });

  it('asks ps under a fixed locale and zone, and takes no reading from a ps that failed', () => {
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'prospec-fake-ps-'));
    fs.writeFileSync(path.join(bin, 'ps'), '#!/bin/sh\necho "S $LC_ALL $TZ"\nexit "${FAKE_PS_STATUS:-0}"\n', { mode: 0o755 });
    vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env.PATH ?? ''}`);
    vi.stubEnv('LC_ALL', 'fr_FR.UTF-8');
    vi.stubEnv('TZ', 'Asia/Taipei');
    try {
      expect(defaultProcessProbe().ps(process.pid)).toBe('S C UTC');
      vi.stubEnv('FAKE_PS_STATUS', '1');
      expect(defaultProcessProbe().ps(process.pid)).toBeNull();
    } finally {
      vi.unstubAllEnvs();
      fs.rmSync(bin, { recursive: true, force: true });
    }
  });

  it('reads a real unreaped child as gone for a holder and unknown as a tree leader', async () => {
    // `set -m` gives the background job its own process group; `exec sleep` replaces the
    // shell with a parent that never reaps it, so the job stays a zombie group leader.
    const parent = spawn('/bin/sh', ['-c', 'set -m; /bin/sh -c "exit 0" & echo $!; exec sleep 20'], { stdio: ['ignore', 'pipe', 'ignore'] });
    try {
      const zombie = await new Promise<number>((resolve) => parent.stdout.once('data', (chunk: Buffer) => resolve(Number(String(chunk).trim()))));
      let line = '';
      for (let i = 0; i < 50 && !line.startsWith('Z'); i++) {
        await new Promise((r) => setTimeout(r, 40));
        line = probe.ps(zombie) ?? '';
      }
      expect(line.startsWith('Z')).toBe(true);
      const started = line.split(/\s+/).slice(1).join(' ');
      expect(holderStatus({ pid: zombie, started }, probe)).toBe('gone');
      expect(treeStatus({ kind: 'process-group', pid: zombie, started }, probe)).toBe('unknown');
    } finally {
      parent.kill('SIGKILL');
    }
  });
});

posix('runProcessTree with real processes (REQ-LIB-114, REQ-TESTS-149)', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prospec-tree-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  const probe = defaultProcessProbe();
  const alive = (pid: number): boolean => probe.exists(pid);
  /** A command that leaves a descendant running and records its pid. */
  const forking = (): string[] => {
    const script = path.join(dir, 'fork.sh');
    fs.writeFileSync(script, `sleep 60 &\necho $! > "${dir}/descendant.pid"\nsleep 60\n`);
    return ['/bin/sh', script];
  };
  const descendant = async (): Promise<number> => {
    for (let i = 0; i < 100; i++) {
      try { const pid = Number(fs.readFileSync(path.join(dir, 'descendant.pid'), 'utf8')); if (pid > 0) return pid; } catch { /* not written yet */ }
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('descendant pid was never written');
  };
  const settle = (ms = 150): Promise<void> => new Promise((r) => setTimeout(r, ms));

  it('reports the exit code of a command that ends on its own', async () => {
    const res = await runProcessTree([process.execPath, '-e', 'process.exit(3)'], { cwd: dir, timeoutMs: 20_000 });
    expect(res).toEqual({ exit_code: 3, timed_out: false });
  });

  it('reports the terminating signal of a command another process killed', async () => {
    const res = await runProcessTree([process.execPath, '-e', 'process.kill(process.pid, "SIGTERM"); setTimeout(() => {}, 5000)'], { cwd: dir, timeoutMs: 20_000 });
    expect(res).toEqual({ exit_code: null, signal: 'SIGTERM', timed_out: false });
  });

  it('reports a spawn error without handing a tree to the caller', async () => {
    const onSpawn = vi.fn();
    const res = await runProcessTree([path.join(dir, 'no-such-binary')], { cwd: dir, timeoutMs: 20_000, onSpawn });
    expect(res.exit_code).toBeNull();
    expect(res.timed_out).toBe(false);
    expect(res.error).toMatch(/ENOENT/);
    expect(onSpawn).not.toHaveBeenCalled();
  });

  it('hands the spawned tree, with its start reading, to onSpawn before the exit', async () => {
    const seen: ProcessTree[] = [];
    const res = await runProcessTree([process.execPath, '-e', 'setTimeout(() => {}, 300)'], {
      cwd: dir, timeoutMs: 20_000, onSpawn: (tree) => { seen.push(tree); expect(treeStatus(tree, probe)).toBe('alive'); },
    });
    expect(res.exit_code).toBe(0);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind: 'process-group' });
    expect(seen[0]!.started).not.toBeNull();
  });

  it('runs the command in a process group of its own, and in the runner\'s group through a win32 probe', async () => {
    const pgid = (pid: number): number => Number(spawnSync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim());
    const seen: Array<{ pid: number; pgid: number }> = [];
    for (const platform of [process.platform, 'win32']) {
      await runProcessTree([process.execPath, '-e', 'setTimeout(() => {}, 300)'], {
        cwd: dir, timeoutMs: 20_000, probe: { ...probe, platform }, onSpawn: (tree) => { seen.push({ pid: tree.pid, pgid: pgid(tree.pid) }); },
      });
    }
    expect(seen[0]!.pgid).toBe(seen[0]!.pid);
    expect(seen[1]!.pgid).toBe(pgid(process.pid));
  });

  // The run's own timeout is far beyond the test's: only the kill for the rejection can end it in time.
  it('kills the tree and reports the failure when onSpawn rejects', async () => {
    const res = await runProcessTree(forking(), { cwd: dir, timeoutMs: 600_000, onSpawn: async () => { await descendant(); throw new Error('registration refused'); } });
    const pid = await descendant();
    await settle();
    expect(res).toMatchObject({ exit_code: null, timed_out: false, hook_error: 'registration refused' });
    expect(alive(pid)).toBe(false);
  });

  it('kills every member of the group on its own timeout, whatever the command reports', async () => {
    let tree: ProcessTree | undefined;
    const pending = runProcessTree(forking(), { cwd: dir, timeoutMs: 600, onSpawn: (t) => { tree = t; } });
    const pid = await descendant();
    const res = await pending;
    await settle();
    expect(res).toEqual({ exit_code: null, signal: 'SIGKILL', timed_out: true });
    expect(alive(pid)).toBe(false);
    expect(treeStatus(tree!, probe)).toBe('gone');
  });

  it('removes its signal handlers once the run settles', async () => {
    const before = (['SIGINT', 'SIGTERM', 'SIGHUP'] as const).map((s) => process.listenerCount(s));
    await runProcessTree([process.execPath, '-e', ''], { cwd: dir, timeoutMs: 20_000 });
    expect((['SIGINT', 'SIGTERM', 'SIGHUP'] as const).map((s) => process.listenerCount(s))).toEqual(before);
  });

  /** A separate runner process, so a signal can be sent to the runner itself. */
  const runnerScript = `
    import fs from 'node:fs';
    import { runProcessTree } from ${JSON.stringify(path.resolve('src/lib/process-tree.ts'))};
    const [dir, script] = process.argv.slice(-2);
    const res = await runProcessTree(['/bin/sh', script], {
      cwd: dir, timeoutMs: 60000,
      onSpawn: (tree) => fs.writeFileSync(dir + '/tree.json', JSON.stringify(tree)),
    });
    fs.writeFileSync(dir + '/result.json', JSON.stringify(res));
  `;
  const startRunner = async (): Promise<{ runner: ReturnType<typeof spawn>; tree: ProcessTree; pid: number }> => {
    const [, script] = forking();
    const runner = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', runnerScript, dir, script!], { stdio: 'ignore' });
    const pid = await descendant();
    let tree: ProcessTree | undefined;
    for (let i = 0; i < 100 && tree === undefined; i++) {
      try { tree = JSON.parse(fs.readFileSync(path.join(dir, 'tree.json'), 'utf8')) as ProcessTree; } catch { await new Promise((r) => setTimeout(r, 20)); }
    }
    return { runner, tree: tree!, pid };
  };
  const exited = (child: ReturnType<typeof spawn>): Promise<void> => new Promise((resolve) => child.once('exit', () => resolve()));

  it.each(['SIGINT', 'SIGTERM', 'SIGHUP'] as const)('kills the group and reports the interruption when the runner receives %s', async (name) => {
    const { runner, tree, pid } = await startRunner();
    runner.kill(name);
    await exited(runner);
    await settle();
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8'))).toEqual({ exit_code: null, timed_out: false, interrupted_by: name });
    expect(alive(pid)).toBe(false);
    expect(treeStatus(tree, probe)).toBe('gone');
  });

  it('leaves the tree alive after the runner is SIGKILLed, unknown once only its leader is gone, and killable by another process', async () => {
    const { runner, tree, pid } = await startRunner();
    runner.kill('SIGKILL');
    await exited(runner);
    await settle();
    expect(treeStatus(tree, probe)).toBe('alive');
    expect(alive(pid)).toBe(true);

    process.kill(tree.pid, 'SIGKILL');
    await settle();
    expect(alive(pid)).toBe(true);
    expect(treeStatus(tree, probe)).toBe('unknown');
    expect(killTreeIfAlive(tree, probe)).toBe(false);
    expect(alive(pid)).toBe(true);

    killTree(tree, probe);
    await settle();
    expect(alive(pid)).toBe(false);
    expect(treeStatus(tree, probe)).toBe('gone');
  });

  it('does not kill the members a command leaves behind when it ends on its own', async () => {
    const script = path.join(dir, 'leave.sh');
    fs.writeFileSync(script, `sleep 30 &\necho $! > "${dir}/descendant.pid"\nexit 0\n`);
    const res = await runProcessTree(['/bin/sh', script], { cwd: dir, timeoutMs: 20_000 });
    const pid = await descendant();
    expect(res).toEqual({ exit_code: 0, timed_out: false });
    expect(alive(pid)).toBe(true);
    spawnSync('kill', ['-9', String(pid)]);
  });
});
