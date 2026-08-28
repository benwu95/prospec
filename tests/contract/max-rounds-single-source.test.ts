import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import {
  CircuitBreakerConfigSchema,
  REVIEW_ROUNDS_MIN,
  REVIEW_ROUNDS_MAX,
} from '../../src/types/cascade.js';
import { registerReviewCommand } from '../../src/cli/commands/review-merge.js';
import { BUNDLED_TEMPLATES } from '../../src/lib/bundled-templates.js';

/**
 * The `1..5` review-rounds ceiling must have exactly ONE source of truth
 * (REVIEW_ROUNDS_MIN/MAX in types/cascade). This couples the schema, the CLI
 * parser + help text, and the shipped circuit-breaker skill template to that
 * constant so none can drift apart silently.
 */
describe('max-rounds ceiling single source (REQ-CLI-043, REQ-LIB-063)', () => {
  it('CircuitBreakerConfigSchema enforces exactly [REVIEW_ROUNDS_MIN, REVIEW_ROUNDS_MAX]', () => {
    expect(() =>
      CircuitBreakerConfigSchema.parse({ maxReviewRounds: REVIEW_ROUNDS_MIN - 1 }),
    ).toThrow();
    expect(() =>
      CircuitBreakerConfigSchema.parse({ maxReviewRounds: REVIEW_ROUNDS_MAX + 1 }),
    ).toThrow();
    expect(
      CircuitBreakerConfigSchema.parse({ maxReviewRounds: REVIEW_ROUNDS_MAX }).maxReviewRounds,
    ).toBe(REVIEW_ROUNDS_MAX);
    expect(
      CircuitBreakerConfigSchema.parse({ maxReviewRounds: REVIEW_ROUNDS_MIN }).maxReviewRounds,
    ).toBe(REVIEW_ROUNDS_MIN);
  });

  it('CLI --max-rounds help text states the bound from the constant', () => {
    const program = new Command();
    registerReviewCommand(program);
    const review = program.commands.find((c) => c.name() === 'review');
    const merge = review?.commands.find((c) => c.name() === 'merge');
    const opt = merge?.options.find((o) => o.long === '--max-rounds');
    expect(opt, '--max-rounds option must be registered').toBeDefined();
    expect(opt!.description).toContain(`(${REVIEW_ROUNDS_MIN}-${REVIEW_ROUNDS_MAX})`);
  });

  it('bundled circuit-breaker skill template states the same maximum as the constant', () => {
    const tpl = BUNDLED_TEMPLATES['skills/references/circuit-breaker.hbs'];
    expect(tpl, 'circuit-breaker.hbs must be bundled').toBeTruthy();
    // The template cannot import the TS constant, so this test is the coupling:
    // it must state the ceiling that REVIEW_ROUNDS_MAX defines.
    expect(tpl).toContain(`maximum **${REVIEW_ROUNDS_MAX} rounds**`);
  });

  it('bundled prospec-review skill template states the same hard-cap maximum as the constant', () => {
    const tpl = BUNDLED_TEMPLATES['skills/prospec-review.hbs'];
    expect(tpl, 'prospec-review.hbs must be bundled').toBeTruthy();
    // Second template site of the same ceiling ("Hard cap: 3 rounds (maximum 5)")
    // — also coupled here so it cannot drift from REVIEW_ROUNDS_MAX silently.
    expect(tpl).toContain(`(maximum ${REVIEW_ROUNDS_MAX})`);
  });
});
