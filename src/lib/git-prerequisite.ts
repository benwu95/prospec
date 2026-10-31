/**
 * The CLI entry's git work-tree probe (REQ-SETUP-025). It inherits the caller's
 * environment, as the drift reads that later fail outside a work tree do, and keeps
 * the three refusal causes apart because each has a different remedy.
 */
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import type { GitWorkTreeProbe } from '../types/git-prerequisite.js';
import { GIT_READ_TIMEOUT_MS, failureLine } from './git-read.js';

interface SpawnFailure {
  code?: string;
  message: string;
}

function runGit(cwd: string, args: string[], timeoutMs: number): string {
  return execFileSync('git', args, { cwd, stdio: 'pipe', timeout: timeoutMs }).toString('utf8');
}

function isDirectory(dir: string): boolean {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

export function probeGitWorkTree(cwd: string, timeoutMs: number = GIT_READ_TIMEOUT_MS): GitWorkTreeProbe {
  // A missing cwd makes the spawn itself fail with ENOENT, indistinguishable from a missing git.
  if (!isDirectory(cwd)) return { state: 'not-work-tree', detail: `${cwd} is not an existing directory` };
  let answer: string;
  try {
    answer = runGit(cwd, ['rev-parse', '--is-inside-work-tree'], timeoutMs);
  } catch (err) {
    const failure = err as SpawnFailure;
    if (failure.code === 'ENOENT') return { state: 'git-missing' };
    if (failure.code === 'ETIMEDOUT') return { state: 'git-failed', detail: failureLine(failure.message) };
    try {
      runGit(cwd, ['--version'], timeoutMs);
    } catch (versionErr) {
      const version = versionErr as SpawnFailure;
      const reported = version.code === 'ETIMEDOUT' ? failure : version;
      return { state: 'git-failed', detail: failureLine(reported.message) };
    }
    return { state: 'not-work-tree', detail: failureLine(failure.message) };
  }
  // Inside `.git` or a bare repository git answers `false` with a clean exit.
  return answer.trim() === 'true' ? { state: 'work-tree' } : { state: 'not-work-tree', detail: null };
}
