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
