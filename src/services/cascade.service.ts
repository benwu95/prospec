import type {
  CascadeScale,
  CascadeStation,
  CircuitBreakerState,
  EscalationReport,
  TastemakerPresentation,
} from '../types/cascade.js';

export interface CascadeTransitionOptions {
  currentStation: CascadeStation;
  scale: CascadeScale;
  verifierResult: {
    status: 'PASS' | 'WARN' | 'FAIL' | 'FLAW';
    grade?: string;
    criticals?: number;
    warnings?: string[];
  };
  circuitBreakerState?: CircuitBreakerState;
}

export interface CascadeTransitionResult {
  canAdvance: boolean;
  nextStation: CascadeStation;
  haltReason?: string;
  escalation?: EscalationReport;
  requiresHumanSignoff?: boolean;
}

export interface TastemakerSummaryOptions {
  changeName: string;
  verifyGrade: 'S' | 'A';
  gitDiffSummary: string;
  deltaSpecSummary: string;
}

/**
 * Evaluate whether an autonomous cascade can transition to the next SDD station.
 */
export function evaluateCascadeTransition(
  options: CascadeTransitionOptions,
): CascadeTransitionResult {
  const { currentStation, scale, verifierResult, circuitBreakerState } = options;

  // 1. Check Circuit Breaker
  if (circuitBreakerState?.tripped) {
    return {
      canAdvance: false,
      nextStation: currentStation,
      haltReason: circuitBreakerState.reason ?? 'Circuit breaker tripped',
      escalation: circuitBreakerState.escalationReport,
    };
  }

  // 2. Check Verifier Gate
  if (verifierResult.status === 'FAIL' || verifierResult.status === 'FLAW') {
    const message = `Verifier gate FAILED at station ${currentStation}. Cannot advance autonomously.`;
    return {
      canAdvance: false,
      nextStation: currentStation,
      haltReason: message,
      escalation: {
        type: 'unrecoverable_critical',
        message,
        tradeoffOptions: [
          'Review error findings and resolve defects manually',
          'Provide Break-Glass manual override if verified as false positive',
        ],
      },
    };
  }

  // 3. Compute scale-driven next station
  switch (currentStation) {
    case 'story': {
      const next: CascadeStation = scale === 'quick' ? 'tasks' : 'plan';
      return { canAdvance: true, nextStation: next };
    }
    case 'plan': {
      return { canAdvance: true, nextStation: 'tasks' };
    }
    case 'tasks': {
      return { canAdvance: true, nextStation: 'implement' };
    }
    case 'implement': {
      return { canAdvance: true, nextStation: 'review' };
    }
    case 'review': {
      if ((verifierResult.criticals ?? 0) > 0) {
        return {
          canAdvance: false,
          nextStation: 'review',
          haltReason: `Review loop has ${verifierResult.criticals} unresolved critical finding(s).`,
        };
      }
      return { canAdvance: true, nextStation: 'verify' };
    }
    case 'verify': {
      if (verifierResult.grade === 'S' || verifierResult.grade === 'A') {
        return {
          canAdvance: true,
          nextStation: 'knowledge-update',
        };
      }
      return {
        canAdvance: false,
        nextStation: 'verify',
        haltReason: `Verify achieved Grade ${verifierResult.grade ?? 'B/C/D'} (S/A required for graduation).`,
      };
    }
    case 'knowledge-update': {
      return {
        canAdvance: true,
        nextStation: 'awaiting_signoff',
        requiresHumanSignoff: true,
      };
    }
    case 'awaiting_signoff': {
      return {
        canAdvance: true,
        nextStation: 'archive',
        requiresHumanSignoff: true,
      };
    }
    case 'archive': {
      return { canAdvance: false, nextStation: 'archive' };
    }
    default: {
      return { canAdvance: false, nextStation: currentStation };
    }
  }
}

/**
 * Generate Tastemaker presentation summary upon reaching Grade S/A.
 */
export function generateTastemakerSummary(
  options: TastemakerSummaryOptions,
): TastemakerPresentation {
  return {
    changeName: options.changeName,
    verifyGrade: options.verifyGrade,
    gitDiffSummary: options.gitDiffSummary,
    deltaSpecSummary: options.deltaSpecSummary,
    verifiedAt: new Date().toISOString(),
    nextStep: 'human_signoff',
  };
}

/**
 * Format Tastemaker presentation as clean Markdown report.
 */
export function formatTastemakerPresentation(
  presentation: TastemakerPresentation,
): string {
  return [
    `# Tastemaker Delivery Review: ${presentation.changeName}`,
    '',
    `> **Verify Quality Grade:** **${presentation.verifyGrade}** (Graduation Criteria Met)`,
    `> **Verified At:** ${presentation.verifiedAt}`,
    '',
    '## Delta-Spec Summary',
    presentation.deltaSpecSummary,
    '',
    '## Git Diff Summary',
    presentation.gitDiffSummary,
    '',
    '---',
    '### Tastemaker Action Required',
    'Autonomous cascading has halted successfully for human sign-off.',
    '- Please review the working tree changes and verify findings.',
    '- To accept and commit, proceed with standard atomic git commit.',
    '- To archive the change, run `prospec-archive`.',
  ].join('\n');
}
