import type {
  CircuitBreakerConfig,
  CircuitBreakerState,
  EscalationReport,
  OscillationRecord,
} from '../types/cascade.js';
import { DEFAULT_CIRCUIT_BREAKER_CONFIG } from '../types/cascade.js';

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
export class OscillationBreaker {
  private readonly config: CircuitBreakerConfig;
  private readonly records = new Map<string, OscillationRecord>();
  private currentReviewRounds = 0;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      maxReviewRounds: config?.maxReviewRounds ?? DEFAULT_CIRCUIT_BREAKER_CONFIG.maxReviewRounds,
      maxOscillationFlips: config?.maxOscillationFlips ?? DEFAULT_CIRCUIT_BREAKER_CONFIG.maxOscillationFlips,
    };
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
   * Evaluate the circuit breaker state across all signatures and review rounds.
   */
  checkCircuitBreaker(): CircuitBreakerState {
    const oscillating = this.getOscillatingSignatures();

    // 1. Check oscillation breaker
    if (oscillating.length > 0) {
      const details = oscillating.map((sig) => {
        const r = this.records.get(sig);
        return { signature: sig, trials: r?.trials ?? [] };
      });

      const escalationReport: EscalationReport = {
        type: 'oscillation',
        message: `Oscillation detected across ${oscillating.length} signature(s): ${oscillating.join(', ')}`,
        diagnostics: { oscillating: details },
        tradeoffOptions: [
          'Halt automated cascading and escalate to human developer for manual resolution',
          'Roll back latest fix attempt and re-evaluate implementation strategy',
          'Mark unresolved findings as advisory tech-debt if non-critical',
        ],
      };

      return {
        tripped: true,
        reason: escalationReport.message,
        reviewRounds: this.currentReviewRounds,
        oscillatingSignatures: oscillating,
        escalationReport,
      };
    }

    // 2. Check maximum iteration rounds
    if (this.currentReviewRounds >= this.config.maxReviewRounds) {
      const escalationReport: EscalationReport = {
        type: 'max_rounds_exceeded',
        message: `Review/Fix loop reached hard cap of ${this.config.maxReviewRounds} rounds without convergence.`,
        diagnostics: {
          currentRounds: this.currentReviewRounds,
          maxAllowed: this.config.maxReviewRounds,
        },
        tradeoffOptions: [
          'Escalate remaining critical findings to human developer for decision',
          'Review diff manually and determine if automated loop should be bypassed',
        ],
      };

      return {
        tripped: true,
        reason: escalationReport.message,
        reviewRounds: this.currentReviewRounds,
        oscillatingSignatures: [],
        escalationReport,
      };
    }

    return {
      tripped: false,
      reviewRounds: this.currentReviewRounds,
      oscillatingSignatures: [],
    };
  }

  /**
   * Reset the tracker state.
   */
  reset(): void {
    this.records.clear();
    this.currentReviewRounds = 0;
  }
}
