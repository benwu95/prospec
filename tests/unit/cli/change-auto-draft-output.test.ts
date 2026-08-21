import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatChangeAutoDraftOutput } from '../../../src/cli/formatters/change-auto-draft-output.js';
import type { AutoDraftResult, DraftedChange } from '../../../src/types/auto-draft.js';

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

function change(overrides: Partial<DraftedChange> = {}): DraftedChange {
  return {
    name: 'fix-services-knowledge-size',
    changeDir: '.prospec/changes/fix-services-knowledge-size',
    target: 'services',
    checkId: 'knowledge-size',
    scale: 'quick',
    remedies: [],
    action: 'created',
    ...overrides,
  };
}

function result(overrides: Partial<AutoDraftResult> = {}): AutoDraftResult {
  const changes = overrides.changes ?? [change()];
  return {
    changes,
    createdCount: changes.filter((c) => c.action === 'created').length,
    skippedCount: changes.filter((c) => c.action === 'skipped').length,
    failedCount: changes.filter((c) => c.action === 'failed').length,
    dryRun: false,
    ...overrides,
  };
}

function capture(): { out: () => string; restore: () => void } {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  return { out: () => lines.join('\n'), restore: () => spy.mockRestore() };
}

afterEach(() => vi.restoreAllMocks());

describe('formatChangeAutoDraftOutput', () => {
  it('says nothing was drafted rather than printing an empty list', () => {
    const c = capture();
    formatChangeAutoDraftOutput(result({ changes: [], createdCount: 0, skippedCount: 0 }), 'normal');
    c.restore();
    expect(c.out()).toContain('No drift findings to auto-draft');
  });

  it('reports a dry run as what WOULD happen, and suggests no follow-up', () => {
    const c = capture();
    formatChangeAutoDraftOutput(result({ dryRun: true }), 'normal');
    c.restore();
    const out = c.out();
    expect(out).toContain('[dry-run]');
    expect(out).toContain('Would draft fix');
    expect(out).toContain('would be created');
    expect(out).not.toContain('Drafted fix:');
    // Nothing exists yet, so the follow-up nudge must not fire.
    expect(out).not.toContain('prospec status');
  });

  it('prints created names on the quiet stream, and nothing at all for a dry run', () => {
    const c1 = capture();
    formatChangeAutoDraftOutput(result(), 'quiet');
    c1.restore();
    expect(c1.out()).toBe('fix-services-knowledge-size');

    const c2 = capture();
    formatChangeAutoDraftOutput(result({ dryRun: true }), 'quiet');
    c2.restore();
    expect(c2.out()).toBe('');
  });

  it('points the follow-up at the router, never at a new-change skill', () => {
    const c = capture();
    formatChangeAutoDraftOutput(result(), 'normal');
    c.restore();
    // `/prospec-ff` starts a NEW change and refuses an existing directory, so
    // it can never be the next step for a change that was just drafted.
    expect(c.out()).toContain('prospec status');
    expect(c.out()).not.toContain('prospec-ff');
  });

  it('renders every distinct remedy, not just the first', () => {
    const c = capture();
    formatChangeAutoDraftOutput(
      result({ changes: [change({ remedies: ['extract a sub-module', 'split into slices'] })] }),
      'normal',
    );
    c.restore();
    expect(c.out()).toContain('extract a sub-module');
    expect(c.out()).toContain('split into slices');
  });

  it('distinguishes skipped from failed, and counts both', () => {
    const c = capture();
    formatChangeAutoDraftOutput(
      result({
        changes: [
          change({ name: 'fix-a-x', action: 'skipped', skipReason: 'Change already exists: fix-a-x' }),
          change({ name: 'fix-b-x', action: 'failed', skipReason: 'EACCES: permission denied' }),
        ],
      }),
      'normal',
    );
    c.restore();
    const out = c.out();
    expect(out).toContain('↷ Skipped: fix-a-x');
    expect(out).toContain('✗ Failed: fix-b-x');
    expect(out).toContain('EACCES: permission denied');
    expect(out).toContain('1 skipped, 1 failed');
  });

  it('sanitizes every free-form value it interpolates', () => {
    const c = capture();
    formatChangeAutoDraftOutput(
      result({
        // One change per branch: each renders a different field set, so
        // injecting only into `created` leaves the skip/failure reasons — which
        // quote a directory name and an OS error — entirely unpinned.
        changes: [
          change({
            name: `fix-${ESC}[31mred${ESC}[0m-x`,
            target: `ta${ESC}[2Krget`,
            checkId: `che${BEL}ck`,
            remedies: [`reme${ESC}[Ady`, `bell${BEL}here`],
          }),
          change({
            name: `fix-skip${ESC}[1m`,
            action: 'skipped',
            skipReason: `Change already exists: fix-${ESC}[2Kx`,
          }),
          change({
            name: `fix-fail${ESC}[1m`,
            action: 'failed',
            skipReason: `EACCES${BEL}: permission denied${ESC}]52;c;x${BEL}`,
          }),
        ],
      }),
      'normal',
    );
    c.restore();
    // A drift report is data; data never gets to move the cursor.
    expect(c.out()).not.toContain(ESC);
    expect(c.out()).not.toContain(BEL);
    // Every branch actually rendered — otherwise the assertions above hold
    // vacuously for the branches that never ran.
    expect(c.out()).toContain('Drafted fix:');
    expect(c.out()).toContain('↷ Skipped:');
    expect(c.out()).toContain('✗ Failed:');
    expect(c.out()).toContain('Change already exists');
    expect(c.out()).toContain('permission denied');
  });
});
