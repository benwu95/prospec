import { describe, expect, it } from 'vitest';
import { exitCodeForSignal, testQueueBusyLines, testQueueWaitLine } from '../../../src/cli/formatters/test-queue-output.js';
import type { TestQueueBusy } from '../../../src/types/test-queue.js';

const holder = { label: 'record-tests other', worktree: '/work/other', host: 'host-a', granted_at_ms: Date.UTC(2026, 10, 23, 7, 0, 0), other_host: false, holder_gone: false };
const busy = (over: Partial<TestQueueBusy> = {}): TestQueueBusy => ({ seq: 4, ahead: 2, queue_dir: '/repo/.git/prospec/test-queue', lease_ms: 300_000, holder, ...over });
const text = (b: TestQueueBusy): string => testQueueBusyLines(b).join('\n');

describe('test queue output (REQ-CLI-065)', () => {
  it('states the ticket, what is ahead, the holder, that nothing ran, and how to keep the place', () => {
    const out = text(busy());
    expect(out).toContain('ticket #4');
    expect(out).toContain('2 ahead');
    expect(out).toContain('nothing was run');
    expect(out).toContain('record-tests other');
    expect(out).toContain('/work/other');
    expect(out).toContain('host-a');
    expect(out).toContain('2026-11-23T07:00:00.000Z');
    expect(out).toMatch(/[Rr]e-run the same command within 300 s/);
    expect(out).toMatch(/not .*directly/);
  });

  it('adds no holder line when no ticket holds the turn', () => {
    const out = text(busy({ holder: undefined }));
    expect(out).toContain('ticket #4');
    expect(out).not.toContain('holding the turn');
  });

  it('says so, with the queue path, when the holder was written by another host', () => {
    const out = text(busy({ holder: { ...holder, other_host: true } }));
    expect(out).toContain('another host');
    expect(out).toContain('/repo/.git/prospec/test-queue');
    expect(text(busy())).not.toContain('another host');
  });

  it('says so, with the queue path, when the holder process is gone', () => {
    const out = text(busy({ holder: { ...holder, holder_gone: true } }));
    expect(out).toContain('no longer running');
    expect(out).toContain('/repo/.git/prospec/test-queue');
    expect(text(busy())).not.toContain('no longer running');
  });

  it('strips terminal control bytes from repo-sourced strings', () => {
    const out = text(busy({ queue_dir: '/q\u001b[31m', holder: { ...holder, label: 'x\u001b[2Jy', worktree: '/w\u0007', host: 'h\u001b]0;t\u0007', other_host: true } }));
    const controls = (s: string): boolean => s.includes('\u0007') || s.includes('\u001b');
    expect(controls(out)).toBe(false);
    expect(controls(testQueueWaitLine({ seq: 1, ahead: 1, holder: { ...holder, label: 'x\u001b[2Jy' } }))).toBe(false);
  });

  it('names the ticket holding the turn when a wait begins', () => {
    const line = testQueueWaitLine({ seq: 4, ahead: 2, holder });
    expect(line).toContain('ticket #4');
    expect(line).toContain('record-tests other');
    expect(testQueueWaitLine({ seq: 4, ahead: 2 })).toContain('ticket #4');
  });

  it('maps an interrupting signal to 128 plus its number', () => {
    expect(exitCodeForSignal('SIGINT')).toBe(130);
    expect(exitCodeForSignal('SIGTERM')).toBe(143);
    expect(exitCodeForSignal('SIGHUP')).toBe(129);
    expect(exitCodeForSignal('NOT-A-SIGNAL')).toBe(1);
  });
});
