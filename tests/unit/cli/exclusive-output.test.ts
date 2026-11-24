import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatExclusiveOutput } from '../../../src/cli/formatters/exclusive-output.js';
import type { ExclusiveResult } from '../../../src/services/exclusive.service.js';

type Ran = Extract<ExclusiveResult, { kind: 'ran' }>;
const ran = (over: Partial<Ran> = {}): Ran => ({ kind: 'ran', command: 'pnpm test', exitCode: null, timedOut: false, timeoutMs: 900_000, ...over });

let stderr: string[];
let stdout: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  stderr = [];
  vi.spyOn(console, 'error').mockImplementation((line: unknown) => { stderr.push(String(line)); });
  stdout = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe('formatExclusiveOutput (REQ-CLI-065)', () => {
  it('returns the wrapped command\'s exit code and prints nothing of its own', () => {
    expect(formatExclusiveOutput(ran({ exitCode: 0 }))).toBe(0);
    expect(formatExclusiveOutput(ran({ exitCode: 4 }))).toBe(4);
    expect(stderr).toEqual([]);
    expect(stdout).not.toHaveBeenCalled();
  });

  it('returns 128 plus the signal\'s number for a run prospec was interrupted in, and names the signal', () => {
    expect(formatExclusiveOutput(ran({ interruptedBy: 'SIGTERM' }))).toBe(143);
    expect(formatExclusiveOutput(ran({ interruptedBy: 'SIGINT' }))).toBe(130);
    expect(stderr.join('\n')).toContain('was interrupted by SIGTERM');
  });

  it.each([
    ['a timeout', ran({ timedOut: true, timeoutMs: 1_500, signal: 'SIGKILL' }), 'timed out after 1500 ms'],
    ['a turn lost before the start', ran({ queueAbort: 'not-started' }), 'was not started'],
    ['a turn lost during the run', ran({ queueAbort: 'lost' }), 'turn was lost while it ran'],
    ['a signal that ended the command itself', ran({ signal: 'SIGKILL' }), 'was killed by SIGKILL'],
    ['a spawn failure', ran({ error: 'spawn nope ENOENT' }), 'could not be run: spawn nope ENOENT'],
  ])('returns 1 and names the cause for %s', (_label, result, cause) => {
    expect(formatExclusiveOutput(result)).toBe(1);
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toContain('`pnpm test`');
    expect(stderr[0]).toContain(cause);
  });

  it('prints a release warning beside the command\'s own exit code', () => {
    expect(formatExclusiveOutput(ran({ exitCode: 0, warning: 'test queue turn not released: boom' }))).toBe(0);
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toContain('test queue turn not released: boom');
  });

  it('returns 75 for a busy queue and prints the block on stderr', () => {
    const code = formatExclusiveOutput({ kind: 'busy', command: 'pnpm test', busy: { seq: 3, ahead: 2, queue_dir: '/q', lease_ms: 300_000 } });
    expect(code).toBe(75);
    expect(stderr.join('\n')).toContain('ticket #3, 2 ahead');
    expect(stdout).not.toHaveBeenCalled();
  });

  it('strips terminal control sequences from the command and the reported strings', () => {
    formatExclusiveOutput(ran({ command: 'evil\u001b[2Jcmd', error: 'bad\u001b]0;title\u0007' }));
    formatExclusiveOutput(ran({ exitCode: 0, warning: 'not released: \u001b]0;owned\u0007{broken' }));
    const out = stderr.join('\n');
    expect(out).toContain('not released: ');
    for (const control of ['\u001b[2J', '\u001b]', '\u0007']) expect(out).not.toContain(control);
  });
});
