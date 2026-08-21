import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatStatusOutput } from '../../../src/cli/formatters/status-output.js';
import type { StatusReport } from '../../../src/types/status.js';

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function output(): string {
  return logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
}

const ROUTED: StatusReport = {
  clean: false,
  changes: [
    {
      name: 'add-auth',
      status: 'implemented',
      scale: 'standard',
      current: 'implement',
      next: 'review',
      blockingGates: ['adversarial review completed'],
      reasons: ['review owns no status transition'],
    },
  ],
  errors: [],
};

describe('status-output', () => {
  it('prints nothing in quiet mode', () => {
    formatStatusOutput(ROUTED, 'quiet');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('prints the clean state when nothing is in flight', () => {
    formatStatusOutput({ clean: true, changes: [], errors: [] }, 'normal');
    expect(output()).toContain('No in-progress changes');
  });

  it('prints name, status, next skill, gates and reasons per change', () => {
    formatStatusOutput(ROUTED, 'normal');
    const text = output();
    expect(text).toContain('add-auth');
    expect(text).toContain('[standard]');
    expect(text).toContain('implemented');
    expect(text).toContain('/prospec-review');
    expect(text).toContain('adversarial review completed');
    expect(text).toContain('review owns no status transition');
  });

  it('prints a terminal marker instead of a skill when next is null', () => {
    formatStatusOutput(
      {
        clean: false,
        changes: [
          {
            name: 'done-change',
            status: 'archived',
            scale: 'standard',
            current: 'archive',
            next: null,
            blockingGates: [],
            reasons: ['terminal'],
          },
        ],
        errors: [],
      },
      'normal',
    );
    expect(output()).toContain('terminal');
  });

  it('lists unroutable records with their error', () => {
    formatStatusOutput(
      {
        clean: false,
        changes: [],
        errors: [{ name: 'bad-change', error: 'metadata.yaml missing' }],
      },
      'normal',
    );
    const text = output();
    expect(text).toContain('Unroutable change records');
    expect(text).toContain('bad-change');
    expect(text).toContain('metadata.yaml missing');
  });

  it('sanitizes control characters out of repo-derived strings', () => {
    formatStatusOutput(
      {
        clean: false,
        changes: [],
        errors: [{ name: 'evil\u001b[2Jchange', error: 'bad\u0007value' }],
      },
      'normal',
    );
    const text = output();
    expect(text).not.toContain('\u001b');
    expect(text).not.toContain('\u0007');
    expect(text).toContain('evil');
    expect(text).toContain('badvalue');
  });
});

describe('status-output — issue registration (issue #131)', () => {
  const withIssue = (issue?: string): StatusReport => ({
    clean: false,
    changes: [
      {
        name: 'add-widget',
        status: 'plan',
        scale: 'standard',
        current: 'plan',
        next: 'tasks',
        blockingGates: ['tasks.md created'],
        reasons: ['status `plan` — next station per lifecycle order'],
        ...(issue === undefined ? {} : { issue }),
      },
    ],
    errors: [],
  });

  it('prints the registered issue reference', () => {
    formatStatusOutput(withIssue('#131'), 'normal');
    expect(output()).toMatch(/issue:\s+#131/);
  });

  it('prints no issue line for a change that registered none', () => {
    formatStatusOutput(withIssue(), 'normal');
    expect(output()).not.toContain('issue:');
  });

  // The reference is free-form flag text that reaches the terminal, so it goes
  // through the shared sanitizer like every other repo-derived string.
  it('sanitizes control characters out of the reference', () => {
    const esc = String.fromCharCode(27);
    formatStatusOutput(withIssue(`#131${esc}[2J`), 'normal');
    const text = output();
    expect(text).not.toContain(esc);
    expect(text).toContain('#131');
  });
});

describe('status-output drift signal', () => {
  const CLEAN: StatusReport = { clean: true, changes: [], errors: [] };

  it('names the draftable count and the drafting command', () => {
    formatStatusOutput(
      { ...CLEAN, drift: { state: 'findings', count: 3, recommendation: 'prospec check --auto-draft' } },
      'normal',
    );
    const out = output();
    expect(out).toContain('3 drift finding(s)');
    expect(out).toContain('prospec check --auto-draft');
  });

  it('says WHY an unusable report cannot be trusted, and how to regenerate it', () => {
    formatStatusOutput(
      { ...CLEAN, drift: { state: 'unusable', reason: 'stale', recommendation: 'prospec check --json' } },
      'normal',
    );
    const stale = output();
    expect(stale).toContain('generated against different code');
    expect(stale).toContain('prospec check --json');

    logSpy.mockClear();
    formatStatusOutput(
      { ...CLEAN, drift: { state: 'unusable', reason: 'unreadable', recommendation: 'prospec check --json' } },
      'normal',
    );
    expect(output()).toContain('could not be read');

    logSpy.mockClear();
    formatStatusOutput(
      { ...CLEAN, drift: { state: 'unusable', reason: 'unprovable', recommendation: 'prospec check --json' } },
      'normal',
    );
    const unprovable = output();
    expect(unprovable).toContain('records no code fingerprint');
    // Never the stale wording: nobody measured this report's freshness.
    expect(unprovable).not.toContain('generated against different code');
  });

  it('prints only the clean line when there is no drift signal', () => {
    formatStatusOutput(CLEAN, 'normal');
    const out = output();
    expect(out).toContain('No in-progress changes');
    expect(out).not.toContain('drift finding');
    expect(out).not.toContain('prospec check');
  });

  it('stays silent under --quiet even with a drift signal', () => {
    formatStatusOutput(
      { ...CLEAN, drift: { state: 'findings', count: 3, recommendation: 'prospec check --auto-draft' } },
      'quiet',
    );
    expect(output()).toBe('');
  });
});
