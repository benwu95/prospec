import {
  CircuitBreakerConfigSchema,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  type CircuitBreakerConfig,
  type CircuitBreakerState,
  type EscalationReport,
  type OscillationRecord,
} from '../types/cascade.js';
import {
  REVIEW_DISMISSED_STATUSES,
  REVIEW_RESOLVED_STATUSES,
  hasReviewStatus,
} from '../types/station.js';

/**
 * Count the number of state flips (transitions between true and false) in a trial history.
 */
export function countFlips(trials: readonly boolean[]): number {
  if (trials.length < 2) return 0;
  let flips = 0;
  for (let i = 1; i < trials.length; i++) {
    if (trials[i] !== trials[i - 1]) {
      flips++;
    }
  }
  return flips;
}

/**
 * Determine if a trial history exhibits an alternating oscillation pattern.
 * Default threshold is 2 flips (e.g. FAIL -> PASS -> FAIL).
 */
export function isOscillating(
  trials: readonly boolean[],
  maxFlips: number = DEFAULT_CIRCUIT_BREAKER_CONFIG.maxOscillationFlips,
): boolean {
  return countFlips(trials) >= maxFlips;
}

/**
 * In-memory circuit breaker and oscillation tracker to guard against runaway loops.
 */
export function calculateFixInducedRatio(
  findings: readonly { origin_round?: number; status?: string }[],
  roundNumber: number = 1,
  baseRound: number = 1,
): number {
  if (roundNumber <= 1 || findings.length === 0) return 0;
  const active = findings.filter(
    (f) => !hasReviewStatus(REVIEW_DISMISSED_STATUSES, f.status),
  );
  if (active.length === 0) return 0;
  const fixInduced = active.filter(
    (f) => (f.origin_round ?? baseRound) > baseRound,
  ).length;
  return fixInduced / active.length;
}

export class ReviewCircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private readonly records = new Map<string, OscillationRecord>();
  private currentReviewRounds = 0;
  private cumulativeSpend = 0;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = CircuitBreakerConfigSchema.parse(config ?? {});
  }

  /**
   * Record a trial outcome (passed = true, failed = false) for a test or defect signature.
   */
  recordTrial(signature: string, passed: boolean): OscillationRecord {
    const existing = this.records.get(signature);
    const trials = existing ? [...existing.trials, passed] : [passed];
    const consecutiveFlips = countFlips(trials);
    const record: OscillationRecord = {
      signature,
      trials,
      consecutiveFlips,
      lastUpdated: new Date().toISOString(),
    };
    this.records.set(signature, record);
    return record;
  }

  /**
   * Get the trial history record for a signature.
   */
  getRecord(signature: string): OscillationRecord | undefined {
    return this.records.get(signature);
  }

  /**
   * Check if a specific signature is currently oscillating.
   */
  detectOscillation(signature: string): boolean {
    const record = this.records.get(signature);
    if (!record) return false;
    return record.consecutiveFlips >= this.config.maxOscillationFlips;
  }

  /**
   * Record the completion of one review/fix round.
   */
  incrementReviewRound(): number {
    this.currentReviewRounds++;
    return this.currentReviewRounds;
  }

  /**
   * Set or get the current review round number.
   */
  setReviewRound(round: number): void {
    this.currentReviewRounds = round;
  }

  getReviewRound(): number {
    return this.currentReviewRounds;
  }

  /**
   * Record token spend for a round and return new cumulative spend.
   */
  recordSpend(tokens: number): number {
    if (tokens > 0) {
      this.cumulativeSpend += tokens;
    }
    return this.cumulativeSpend;
  }

  getCumulativeSpend(): number {
    return this.cumulativeSpend;
  }

  /**
   * Get all signatures currently flagged as oscillating.
   */
  getOscillatingSignatures(): string[] {
    const result: string[] = [];
    for (const [signature, record] of this.records.entries()) {
      if (record.consecutiveFlips >= this.config.maxOscillationFlips) {
        result.push(signature);
      }
    }
    return result;
  }

  /**
   * Evaluate the circuit breaker state across all signatures, review rounds,
   * fix-induced ratios, and cumulative token spend.
   */
  checkCircuitBreaker(options?: {
    round?: number;
    findings?: readonly { origin_round?: number; severity?: string; status?: string }[];
    baseRound?: number;
  }): CircuitBreakerState {
    const roundNumber = options?.round ?? this.currentReviewRounds;
    // Pure query: the ratio is derived from the findings passed in, and spend is
    // read from state the caller recorded — neither is written back here, so a
    // repeated call (or one that never happens) cannot double-count.
    const fixInducedRatio = options?.findings
      ? calculateFixInducedRatio(options.findings, roundNumber, options.baseRound ?? 1)
      : 0;

    const unresolvedCriticals = (options?.findings ?? []).filter(
      (f) =>
        f.severity === 'critical' &&
        !hasReviewStatus(REVIEW_RESOLVED_STATUSES, f.status),
    ).length;

    const oscillating = this.getOscillatingSignatures();
    let escalationReport: EscalationReport | undefined;

    // 1. Check oscillation breaker
    if (oscillating.length > 0) {
      escalationReport = {
        type: 'oscillation',
        message: `Oscillation detected across ${oscillating.length} signature(s): ${oscillating.join(', ')}`,
        diagnostics: {
          oscillating: oscillating.map((sig) => ({
            signature: sig,
            trials: this.records.get(sig)?.trials ?? [],
          })),
        },
        tradeoffOptions: [
          'Halt automated cascading and escalate to human developer for manual resolution',
          'Roll back latest fix attempt and re-evaluate implementation strategy (revert-and-redesign)',
          'Mark unresolved findings as advisory tech-debt if non-critical',
        ],
      };
    }
    // 2. Check fix-induced ratio (dual-axis #1) in round > 1
    else if (roundNumber > 1 && fixInducedRatio > this.config.maxFixInducedRatio) {
      escalationReport = {
        type: 'fix_induced_threshold_exceeded',
        message: `Fix-induced defect ratio (${(fixInducedRatio * 100).toFixed(1)}%) exceeded threshold (${(this.config.maxFixInducedRatio * 100).toFixed(1)}%) in round ${roundNumber}.`,
        diagnostics: {
          round: roundNumber,
          fixInducedRatio,
          threshold: this.config.maxFixInducedRatio,
        },
        tradeoffOptions: [
          'Revert recent fixes and redesign implementation strategy (revert-and-redesign)',
          'Escalate remaining critical findings to human developer for manual intervention',
        ],
      };
    }
    // 3. Check cumulative spend budget (dual-axis #2)
    else if (this.config.maxSpend !== undefined && this.cumulativeSpend > this.config.maxSpend) {
      escalationReport = {
        type: 'spend_budget_exceeded',
        message: `Cumulative review spend (${this.cumulativeSpend} tokens) exceeded declared budget limit (${this.config.maxSpend} tokens).`,
        diagnostics: {
          cumulativeSpend: this.cumulativeSpend,
          maxSpend: this.config.maxSpend,
        },
        tradeoffOptions: [
          'Halt automated review and escalate to human developer for sign-off or budget adjustment',
          'Revert-and-redesign to avoid runaway token expenditure',
        ],
      };
    }
    // 4. Check maximum iteration rounds — only when unresolved criticals remain
    else if (roundNumber >= this.config.maxReviewRounds && unresolvedCriticals > 0) {
      escalationReport = {
        type: 'max_rounds_exceeded',
        message: `Review/Fix loop reached hard cap of ${this.config.maxReviewRounds} rounds without convergence.`,
        diagnostics: {
          currentRounds: roundNumber,
          maxAllowed: this.config.maxReviewRounds,
          unresolvedCriticals,
        },
        tradeoffOptions: [
          'Escalate remaining critical findings to human developer for decision',
          'Review diff manually and determine if automated loop should be bypassed',
        ],
      };
    }

    return {
      tripped: !!escalationReport,
      reason: escalationReport?.message,
      reviewRounds: roundNumber,
      oscillatingSignatures: escalationReport?.type === 'oscillation' ? oscillating : [],
      fixInducedRatio,
      cumulativeSpend: this.cumulativeSpend,
      escalationReport,
    };
  }

  /**
   * Reset the tracker state.
   */
  reset(): void {
    this.records.clear();
    this.currentReviewRounds = 0;
    this.cumulativeSpend = 0;
  }
}
