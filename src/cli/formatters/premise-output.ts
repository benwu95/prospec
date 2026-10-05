import type { PremiseAssessment } from '../../types/premise.js';
import { sanitizeTerminal } from './sanitize.js';

/** Readiness is structural; every human-facing admission discloses that boundary. */
export function formatPremiseNotice(premise?: PremiseAssessment): string[] {
  if (!premise) return [];
  return [
    `Premise: ${premise.state} — ${premise.limitation}`,
    ...premise.findings,
  ].map((line) => sanitizeTerminal(line));
}
