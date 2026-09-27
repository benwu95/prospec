import { describe, expect, it, vi } from 'vitest';
import { formatChangeDelegateOutput, MUTATION_HAND_OFF } from '../../../src/cli/formatters/change-delegate-output.js';
import type { ChangeDelegateResult } from '../../../src/services/change-delegate.service.js';
import { COMMAND_HELP_SPECS, renderCommandHelp } from '../../../src/types/cli-help.js';
import { GIT_STATE_FACETS } from '../../../src/types/delegation.js';
import { DELEGATION_PRODUCER } from '../../../src/types/station.js';

function captureStdout(fn: () => void): string {
  const writes: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    writes.push(String(chunk));
    return true;
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  // eslint-disable-next-line no-control-regex
  return writes.join('').replace(/\u001b\[[0-9;]*m/g, '');
}

const mutated = (overrides: Partial<Extract<ChangeDelegateResult, { kind: 'receipt-failed' }>['verdict']> = {}): ChangeDelegateResult => ({
  kind: 'receipt-failed',
  changeName: 'x',
  stem: 'review-r-1-1',
  verdict: {
    kind: 'refused',
    reason: 'mutated',
    detail: 'delegate mutated the tree: …',
    changed: ['content', 'refs'],
    facets: [
      { facet: 'content', before: 'a'.repeat(64), after: 'b'.repeat(64) },
      { facet: 'refs', before: '1 ref(s)', after: '2 ref(s) (refs/tags/v1 added)' },
    ],
    checkpoint: '/repo/.prospec/changes/x/.delegated/review-r-1-1.checkpoint',
    ...overrides,
  } as Extract<ChangeDelegateResult, { kind: 'receipt-failed' }>['verdict'],
});

describe('change-delegate-output (REQ-CLI-057)', () => {
  it('prints the stem and both absolute paths on issue', () => {
    const out = captureStdout(() =>
      formatChangeDelegateOutput({ kind: 'issued', changeName: 'x', stem: 'review-r-1-1', payloadPath: '/repo/p.json', snapshotPath: '/tmp/s/app', unreleased: [] }),
    );
    expect(out).toContain('Issued delegation ticket review-r-1-1');
    expect(out).toContain('payload:  /repo/p.json');
    expect(out).toContain('snapshot: /tmp/s/app');
  });

  it('prints each changed facet before and after, the checkpoint path and the hand-off — even under --quiet', () => {
    const out = captureStdout(() => formatChangeDelegateOutput(mutated(), 'quiet'));
    const lines = out.split('\n');
    expect(lines).toContain(`  content: pre-spawn ${'a'.repeat(64)} → now ${'b'.repeat(64)}`);
    expect(lines).toContain('  refs: pre-spawn 1 ref(s) → now 2 ref(s) (refs/tags/v1 added)');
    expect(lines).toContain('  checkpoint: /repo/.prospec/changes/x/.delegated/review-r-1-1.checkpoint');
    expect(lines).toContain(`  ${MUTATION_HAND_OFF}`);
    expect(MUTATION_HAND_OFF).toMatch(/the CLI never writes the working tree, index, HEAD or refs/);
    expect(out).not.toMatch(/--restore/);
  });

  it('sanitizes every agent-supplied value it prints', () => {
    const out = captureStdout(() =>
      formatChangeDelegateOutput(
        mutated({
          facets: [{ facet: 'refs', before: '1 ref(s)', after: '2 ref(s) (refs/heads/\u001b[31mevil added)' }],
          checkpoint: '/repo/\u001b]0;x\u0007.checkpoint',
        } as never),
      ),
    );
    expect(out).not.toContain('\u001b');
    expect(out).not.toContain('\u0007');
  });

  it('keeps a pending receipt open and names the bounded wait', () => {
    const out = captureStdout(() =>
      formatChangeDelegateOutput({
        kind: 'receipt-failed',
        changeName: 'x',
        stem: 'review-r-1-1',
        verdict: { kind: 'pending', reason: 'missing', detail: 'payload p has not been written yet' },
      }),
    );
    expect(out).toContain('… not received review-r-1-1 (missing): payload p has not been written yet');
    expect(out).toMatch(/stays open/);
  });

  it('names the kept checkpoint when a human accepted the tree', () => {
    const out = captureStdout(() =>
      formatChangeDelegateOutput({
        kind: 'failed',
        changeName: 'x',
        stems: ['review-r-1-1'],
        warnings: ['review/r round 1 attempt 1 (review-r-1-1): delegate failed — x; the human accepted the current repository state'],
        accepted: true,
        unreleased: [],
        kept: ['/repo/.prospec/changes/x/.delegated/review-r-1-1.checkpoint'],
      }),
    );
    expect(out).toContain('kept the checkpoint');
    expect(out).toContain('/repo/.prospec/changes/x/.delegated/review-r-1-1.checkpoint');
  });
});

describe('change delegate help (REQ-CLI-054, REQ-CLI-057)', () => {
  const help = renderCommandHelp(COMMAND_HELP_SPECS['change delegate']);

  it('shows issue, --receive and --spawn-failed examples and no restore mode', () => {
    expect(help).toContain('$ prospec change delegate --station review --role lens-security --round 1');
    expect(help).toContain('$ prospec change delegate --receive review-lens-security-1-1');
    expect(help).toMatch(/\$ prospec change delegate --spawn-failed review-lens-security-1-1 --reason/);
    expect(help).not.toMatch(/--restore/);
  });

  it('claims detection and preservation only, from the facet and producer constants', () => {
    expect(help).toContain('It detects and preserves; it prevents nothing and restores nothing');
    expect(help).toContain(GIT_STATE_FACETS.join(', '));
    expect(help).toContain(DELEGATION_PRODUCER);
  });
});
