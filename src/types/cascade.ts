import { z } from 'zod';
import type { ChangeScale } from './change.js';

/**
 * Scale driving the autonomous cascading path.
 */
export type CascadeScale = ChangeScale;

/**
 * SDD stations participating in autonomous cascading.
 */
export const CASCADE_STATIONS = [
  'story',
  'plan',
  'tasks',
  'implement',
  'review',
  'verify',
  'knowledge-update',
  'awaiting_signoff',
  'archive',
] as const;

export type CascadeStation = (typeof CASCADE_STATIONS)[number];

/**
 * A historical trial record for a specific defect or test signature.
 */
export const OscillationRecordSchema = z.object({
  signature: z.string(),
  trials: z.array(z.boolean()),
  consecutiveFlips: z.number().int().nonnegative(),
  lastUpdated: z.string(),
});

export type OscillationRecord = z.infer<typeof OscillationRecordSchema>;

/**
 * Configuration thresholds for circuit breakers and runaway cost protection.
 */
export const CircuitBreakerConfigSchema = z.object({
  /** Maximum review/fix rounds allowed before tripping (default 3, max 5). */
  maxReviewRounds: z.number().int().min(1).max(5).default(3),
  /** Maximum allowed alternating flips before tripping (default 2, e.g. fail -> pass -> fail). */
  maxOscillationFlips: z.number().int().min(1).default(2),
  /** Maximum allowed fix-induced ratio before tripping in rounds > 1 (default 0.5). */
  maxFixInducedRatio: z.number().min(0).max(1).default(0.5),
  /** Maximum allowed cumulative spend in tokens before tripping (optional). */
  maxSpend: z.number().int().nonnegative().optional(),
});

export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerConfigSchema>;

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  maxReviewRounds: 3,
  maxOscillationFlips: 2,
  maxFixInducedRatio: 0.5,
};

/**
 * Escalation report generated when a circuit breaker trips or unrecoverable defect is hit.
 */
export const EscalationReportSchema = z.object({
  type: z.enum([
    'oscillation',
    'max_rounds_exceeded',
    'unrecoverable_critical',
    'persistent_test_failure',
    'fix_induced_threshold_exceeded',
    'spend_budget_exceeded',
  ]),
  message: z.string(),
  diagnostics: z.record(z.string(), z.unknown()).optional(),
  tradeoffOptions: z.array(z.string()),
});

export type EscalationReport = z.infer<typeof EscalationReportSchema>;

/**
 * Runtime state of the cascading circuit breaker.
 */
export const CircuitBreakerStateSchema = z.object({
  tripped: z.boolean(),
  reason: z.string().optional(),
  reviewRounds: z.number().int().nonnegative(),
  oscillatingSignatures: z.array(z.string()),
  fixInducedRatio: z.number().optional(),
  cumulativeSpend: z.number().int().nonnegative().optional(),
  escalationReport: EscalationReportSchema.optional(),
});

export type CircuitBreakerState = z.infer<typeof CircuitBreakerStateSchema>;

/**
 * Presentation delivered to the Tastemaker (human developer) upon reaching Verify Grade S/A.
 */
export const TastemakerPresentationSchema = z.object({
  changeName: z.string(),
  verifyGrade: z.enum(['S', 'A']),
  gitDiffSummary: z.string(),
  deltaSpecSummary: z.string(),
  verifiedAt: z.string(),
  nextStep: z.literal('human_signoff'),
});

export type TastemakerPresentation = z.infer<typeof TastemakerPresentationSchema>;
