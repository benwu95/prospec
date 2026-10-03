import { describe, expect, it, vi } from 'vitest';
import * as childProcess from 'node:child_process';
import { promisify } from 'node:util';
import { withoutSpawns } from '../../helpers/no-child-process.js';

const SPAWNERS = ['execFileSync', 'execSync', 'spawnSync', 'execFile', 'exec', 'spawn', 'fork'] as const;

describe('withoutSpawns (test helper)', () => {
  const fake = withoutSpawns(childProcess);

  it('replaces every process-starting function, in the named exports and in default alike', () => {
    for (const name of SPAWNERS) {
      expect(fake[name], name).not.toBe(childProcess[name]);
      expect(fake.default[name], `default.${name}`).toBe(fake[name]);
    }
  });

  it('keeps every other export of the real module', () => {
    expect(fake.ChildProcess).toBe(childProcess.ChildProcess);
  });

  it('throws from the synchronous runners and from spawn/fork, naming the command', () => {
    expect(() => fake.execFileSync('git', ['rev-parse'])).toThrow(/git/);
    expect(() => fake.execSync('git status')).toThrow(/git status/);
    expect(() => fake.spawn('git', ['status'])).toThrow(/git/);
    expect(() => fake.fork('script.js')).toThrow(/script\.js/);
  });

  it('reports a spawnSync failure in its result, as Node does, instead of throwing', () => {
    const result = fake.spawnSync('git', ['status']);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.status).toBeNull();
    expect(result.pid).toBe(0);
  });

  it('fails execFile/exec through the callback, so a promisified call rejects', async () => {
    const callback = vi.fn();
    fake.execFile('git', ['ls-files'], callback);
    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce());
    expect(callback.mock.calls[0]![0]).toBeInstanceOf(Error);

    await expect(promisify(fake.execFile)('git', ['-C', '/project', 'ls-files', '-z'])).rejects.toThrow(/git/);
    await expect(promisify(fake.exec)('git status')).rejects.toThrow(/git status/);
  });

  it('throws from execFile/exec when there is no callback to fail through', () => {
    expect(() => fake.execFile('git', ['status'])).toThrow(/git/);
    expect(() => fake.exec('git status')).toThrow(/git status/);
  });
});
