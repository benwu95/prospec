import { describe, it, expect } from 'vitest';
import {
  evaluateCascadeTransition,
  generateTastemakerSummary,
  formatTastemakerPresentation,
} from '../../../src/services/cascade.service.js';
import type { CircuitBreakerState } from '../../../src/types/cascade.js';

describe('evaluateCascadeTransition', () => {
  it('advances scale: quick directly from story to tasks', () => {
    const res = evaluateCascadeTransition({
      currentStation: 'story',
      scale: 'quick',
      verifierResult: { status: 'PASS' },
    });
    expect(res.canAdvance).toBe(true);
    expect(res.nextStation).toBe('tasks');
  });

  it('advances scale: standard through the full linear lifecycle', () => {
    expect(
      evaluateCascadeTransition({
        currentStation: 'story',
        scale: 'standard',
        verifierResult: { status: 'PASS' },
      }).nextStation,
    ).toBe('plan');

    expect(
      evaluateCascadeTransition({
        currentStation: 'plan',
        scale: 'standard',
        verifierResult: { status: 'PASS' },
      }).nextStation,
    ).toBe('tasks');

    expect(
      evaluateCascadeTransition({
        currentStation: 'tasks',
        scale: 'standard',
        verifierResult: { status: 'PASS' },
      }).nextStation,
    ).toBe('implement');

    expect(
      evaluateCascadeTransition({
        currentStation: 'implement',
        scale: 'standard',
        verifierResult: { status: 'PASS' },
      }).nextStation,
    ).toBe('review');

    expect(
      evaluateCascadeTransition({
        currentStation: 'review',
        scale: 'standard',
        verifierResult: { status: 'PASS', criticals: 0 },
      }).nextStation,
    ).toBe('verify');
  });

  it('halts when circuit breaker is tripped', () => {
    const circuitBreakerState: CircuitBreakerState = {
      tripped: true,
      reason: 'Oscillation detected on test-user-login',
      reviewRounds: 2,
      oscillatingSignatures: ['test-user-login'],
      escalationReport: {
        type: 'oscillation',
        message: 'Oscillation detected',
        tradeoffOptions: ['Manual resolution'],
      },
    };

    const res = evaluateCascadeTransition({
      currentStation: 'review',
      scale: 'standard',
      verifierResult: { status: 'PASS' },
      circuitBreakerState,
    });

    expect(res.canAdvance).toBe(false);
    expect(res.nextStation).toBe('review');
    expect(res.haltReason).toContain('Oscillation detected');
    expect(res.escalation?.type).toBe('oscillation');
  });

  it('halts when verifier gate returns FLAW / FAIL', () => {
    const res = evaluateCascadeTransition({
      currentStation: 'plan',
      scale: 'standard',
      verifierResult: { status: 'FLAW' },
    });

    expect(res.canAdvance).toBe(false);
    expect(res.nextStation).toBe('plan');
    expect(res.escalation?.type).toBe('unrecoverable_critical');
  });

  it('halts at review when unresolved criticals remain', () => {
    const res = evaluateCascadeTransition({
      currentStation: 'review',
      scale: 'standard',
      verifierResult: { status: 'WARN', criticals: 2 },
    });

    expect(res.canAdvance).toBe(false);
    expect(res.nextStation).toBe('review');
    expect(res.haltReason).toContain('2 unresolved critical');
  });

  it('advances to knowledge-update when Verify reaches Grade S or A', () => {
    const resS = evaluateCascadeTransition({
      currentStation: 'verify',
      scale: 'standard',
      verifierResult: { status: 'PASS', grade: 'S' },
    });
    expect(resS.canAdvance).toBe(true);
    expect(resS.nextStation).toBe('knowledge-update');

    const resA = evaluateCascadeTransition({
      currentStation: 'verify',
      scale: 'standard',
      verifierResult: { status: 'PASS', grade: 'A' },
    });
    expect(resA.canAdvance).toBe(true);
    expect(resA.nextStation).toBe('knowledge-update');
  });

  it('advances from knowledge-update to awaiting_signoff requiring human sign-off', () => {
    const res = evaluateCascadeTransition({
      currentStation: 'knowledge-update',
      scale: 'standard',
      verifierResult: { status: 'PASS' },
    });
    expect(res.canAdvance).toBe(true);
    expect(res.nextStation).toBe('awaiting_signoff');
    expect(res.requiresHumanSignoff).toBe(true);
  });

  it('does not advance when Verify achieves Grade B or below', () => {
    const res = evaluateCascadeTransition({
      currentStation: 'verify',
      scale: 'standard',
      verifierResult: { status: 'WARN', grade: 'B' },
    });
    expect(res.canAdvance).toBe(false);
    expect(res.nextStation).toBe('verify');
    expect(res.haltReason).toContain('Grade B');
  });

  it('handles awaiting_signoff and archive terminal station transitions', () => {
    const resSignoff = evaluateCascadeTransition({
      currentStation: 'awaiting_signoff',
      scale: 'standard',
      verifierResult: { status: 'PASS' },
    });
    expect(resSignoff.canAdvance).toBe(true);
    expect(resSignoff.nextStation).toBe('archive');
    expect(resSignoff.requiresHumanSignoff).toBe(true);

    const resArchive = evaluateCascadeTransition({
      currentStation: 'archive',
      scale: 'standard',
      verifierResult: { status: 'PASS' },
    });
    expect(resArchive.canAdvance).toBe(false);
    expect(resArchive.nextStation).toBe('archive');
  });
});

describe('generateTastemakerSummary & formatTastemakerPresentation', () => {
  it('formats Tastemaker delivery presentation report correctly', () => {
    const summary = generateTastemakerSummary({
      changeName: 'my-feature',
      verifyGrade: 'S',
      gitDiffSummary: '+ 150 lines in 3 files',
      deltaSpecSummary: 'ADDED REQ-AUTH-001',
    });

    expect(summary.changeName).toBe('my-feature');
    expect(summary.verifyGrade).toBe('S');
    expect(summary.nextStep).toBe('human_signoff');

    const formatted = formatTastemakerPresentation(summary);
    expect(formatted).toContain('# Tastemaker Delivery Review: my-feature');
    expect(formatted).toContain('Grade:** **S**');
    expect(formatted).toContain('ADDED REQ-AUTH-001');
    expect(formatted).toContain('+ 150 lines in 3 files');
    expect(formatted).toContain('prospec-archive');
  });
});
