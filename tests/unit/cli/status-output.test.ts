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
      code: 'REVIEW_PENDING',
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
    expect(text).toContain('prospec-review');
    expect(text).not.toContain('/prospec-review');
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
            code: 'TERMINAL',
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
        code: 'LIFECYCLE_NEXT',
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
    expect(stale).toContain('differs from current content or workflow facts');
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
    expect(unprovable).toContain('cannot prove current evidence (legacy fingerprint or unreadable inputs)');
    // Never the stale wording: nobody measured this report's freshness.
    expect(unprovable).not.toContain('differs from current content or workflow facts');
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

/**
 * The next-station reference map (REQ-CLI-023). The formatter prints what the
 * service decided and decides nothing itself — no filtering, no applicability,
 * no path building — and everything repo-derived goes through the sanitizer.
 */
describe('status-output — next-station reference map', () => {
  const withMap = (rows: NonNullable<StatusReport['changes'][number]['nextReferenceMap']>): StatusReport => ({
    ...ROUTED,
    changes: [{
      ...ROUTED.changes[0]!,
      nextSkill: 'prospec-review',
      nextSkillPath: '.claude/skills/prospec-review/SKILL.md',
      nextReferenceMap: rows,
    }],
  });

  it('prints each row after the action line, with its phase, path and purpose', () => {
    formatStatusOutput(
      withMap([
        {
          phase: 'Startup Loading',
          referencePath: '.claude/skills/prospec-review/references/review-format.md',
          purpose: 'the severity contract',
          loading: 'startup-mandatory',
        },
      ]),
      'normal',
    );
    const text = output();
    const lines = text.split('\n');
    expect(lines.findIndex((line) => line.includes('action:'))).toBeLessThan(
      lines.findIndex((line) => line.includes('read:')),
    );
    expect(text).toContain('Startup Loading');
    expect(text).toContain('.claude/skills/prospec-review/references/review-format.md');
    expect(text).toContain('the severity contract');
  });

  it('prints an undecided condition as guidance rather than dropping the row', () => {
    formatStatusOutput(
      withMap([
        {
          phase: 'Review Lenses',
          referencePath: '.claude/skills/prospec-review/references/review-lenses-content.md',
          purpose: 'the lens criteria',
          loading: 'in-phase',
          conditionHint: 'a conditional lens applies to this diff',
        },
      ]),
      'normal',
    );
    expect(output()).toContain('a conditional lens applies to this diff');
  });

  it('sanitizes every repo-derived value in a row', () => {
    const esc = String.fromCharCode(27);
    formatStatusOutput(
      withMap([
        {
          phase: `Phase 1${esc}[2J`,
          referencePath: `.claude/skills/x${esc}[2J.md`,
          purpose: `purpose${esc}[2J`,
          loading: 'in-phase',
          conditionHint: `when${esc}[2J`,
        },
      ]),
      'normal',
    );
    expect(output()).not.toContain(esc);
  });

  it('prints no map line for an empty map or an absent one', () => {
    formatStatusOutput(withMap([]), 'normal');
    expect(output()).not.toContain('read:');
    logSpy.mockClear();
    formatStatusOutput(ROUTED, 'normal');
    expect(output()).not.toContain('read:');
  });

  it('stays silent in quiet mode', () => {
    formatStatusOutput(
      withMap([
        {
          phase: 'Startup Loading',
          referencePath: '.claude/skills/prospec-review/references/review-format.md',
          purpose: 'the severity contract',
          loading: 'startup-mandatory',
        },
      ]),
      'quiet',
    );
    expect(logSpy).not.toHaveBeenCalled();
  });
});


/**
 * The actionable target (REQ-CLI-039). The canonical skill identity is the
 * PRIMARY action — every host can act on it, through its own skill mechanism or
 * by reading the file — and the resolved path is a separate fallback field. The
 * formatter infers no host and promises no lifecycle: it projects and sanitizes.
 */
describe('status-output — identity-first action and fallback', () => {
  const routed = (overrides: Partial<StatusReport['changes'][number]> = {}): StatusReport => ({
    ...ROUTED,
    changes: [{ ...ROUTED.changes[0]!, ...overrides }],
  });

  it('names the skill identity as the action, below next', () => {
    formatStatusOutput(routed({ nextSkill: 'prospec-review' }), 'normal');
    const lines = output().split('\n');
    const next = lines.findIndex((line) => line.includes('next:'));
    const action = lines.findIndex((line) => line.includes('action:'));
    expect(next).toBeGreaterThanOrEqual(0);
    expect(action).toBeGreaterThan(next);
    expect(lines[action]).toContain('prospec-review');
    // The identity is invoked, not read: the action must not present a file.
    expect(lines[action]).not.toContain('SKILL.md');
  });

  it('prints the resolved path as a separate fallback, never as the action', () => {
    formatStatusOutput(
      routed({ nextSkill: 'prospec-review', nextSkillPath: '.claude/skills/prospec-review/SKILL.md' }),
      'normal',
    );
    const lines = output().split('\n');
    const action = lines.findIndex((line) => line.includes('action:'));
    const fallback = lines.findIndex((line) => line.includes('fallback:'));
    expect(fallback).toBeGreaterThan(action);
    expect(lines[fallback]).toContain('.claude/skills/prospec-review/SKILL.md');
    expect(lines[action]).toContain('prospec-review');
  });

  it('keeps the action without inventing a fallback when no agent is configured', () => {
    formatStatusOutput(routed({ nextSkill: 'prospec-review' }), 'normal');
    const text = output();
    expect(text).toContain('prospec-review');
    expect(text).not.toContain('fallback:');
    expect(text).not.toContain('.claude/skills');
    expect(text).not.toContain('.agents/skills');
  });

  it('prints neither action nor fallback at a terminal route', () => {
    formatStatusOutput(
      routed({ current: 'archive', next: null, code: 'TERMINAL', blockingGates: [], reasons: ['terminal'] }),
      'normal',
    );
    const text = output();
    expect(text).toContain('terminal');
    expect(text).not.toContain('action:');
    expect(text).not.toContain('fallback:');
  });

  it('promises no host capability — the action points at the host policy, not a mechanism', () => {
    formatStatusOutput(
      routed({ nextSkill: 'prospec-review', nextSkillPath: '.claude/skills/prospec-review/SKILL.md' }),
      'normal',
    );
    const text = output();
    for (const vendor of ['Claude', 'Codex', 'Copilot', 'Antigravity']) {
      expect(text, `vendor name leaked: ${vendor}`).not.toContain(vendor);
    }
  });

  it('sanitizes the fallback path', () => {
    const esc = String.fromCharCode(27);
    formatStatusOutput(
      routed({ nextSkill: 'prospec-review', nextSkillPath: `.claude/skills/x${esc}[2J/SKILL.md` }),
      'normal',
    );
    expect(output()).not.toContain(esc);
  });

  it('keeps every other line it printed before', () => {
    formatStatusOutput(
      routed({
        nextSkill: 'prospec-review',
        nextSkillPath: '.claude/skills/prospec-review/SKILL.md',
        issue: 'https://example.test/1',
        unresolvedWarnings: [{ skill: 'prospec-plan', warning: 'budget', date: '2026-09-17' }],
      }),
      'normal',
    );
    const text = output();
    for (const label of ['status:', 'issue:', 'next:', 'gate:', 'reason:', 'warn:']) {
      expect(text, label).toContain(label);
    }
    expect(text).toContain('[REVIEW_PENDING]');
  });
});
