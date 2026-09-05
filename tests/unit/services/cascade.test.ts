import { describe, it, expect } from 'vitest';
import {
  generateTastemakerSummary,
  formatTastemakerPresentation,
} from '../../../src/services/cascade.service.js';

/**
 * The cascade service is Tastemaker presentation only: station transitions are
 * `prospec status`'s (lib/status-router). A transition evaluator here would be a
 * second state machine with no formal consumer — issue #266 removed it, and the
 * contract suite pins its absence from `src/`.
 */

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
