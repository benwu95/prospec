import pc from 'picocolors';
import { DELEGATION_PRODUCER } from '../../types/station.js';
import type { ReviewMergeResult } from '../../services/review-merge.service.js';
import { sanitizeTerminal } from './sanitize.js';

type DelegationSettlement = ReviewMergeResult['delegation'];

/** The two causes a sink cannot tell apart when no settled ticket was received. */
export const NOT_COVERED_CAUSES = 'none was issued, or an earlier run of this command already settled them';

/**
 * The one line every sink prints about its delegations (REQ-SERVICES-121). It is
 * never omitted from normal output — a round no received delegation covered says
 * so — and every count rides the same line, so the sink's output grows by exactly
 * one line whatever the settlement holds.
 */
export function formatDelegationSettlement(settlement: DelegationSettlement): string[] {
  const stems = (list: string[]): string => list.map((stem) => sanitizeTerminal(stem)).join(', ');
  if (settlement.kind !== 'settled') {
    return [pc.yellow(`Delegation: not covered by delegate mutation detection — no unsettled delegation ticket (${NOT_COVERED_CAUSES})`)];
  }
  const extras: string[] = [];
  if (settlement.mutated > 0) extras.push(`${settlement.mutated} attempt(s) refused as mutated`);
  if (settlement.accepted > 0) {
    extras.push(`${settlement.accepted} attempt(s) ended by a human accepting the current repository state (see the ${DELEGATION_PRODUCER} WARN)`);
  }
  if (settlement.unconsumed.length > 0) extras.push(`could not mark as consumed: ${stems(settlement.unconsumed)}`);
  const tail = extras.length > 0 ? `; ${extras.join('; ')}` : '';
  if (settlement.received.length > 0) {
    const parts = [`${settlement.received.length} received (every repository facet matched at receipt)`];
    if (settlement.failed.length > 0) parts.push(`${settlement.failed.length} failed`);
    return [`Delegation: ${parts.join(', ')} — ${stems(settlement.received)}${tail}`];
  }
  return [pc.yellow(`Delegation: not covered by delegate mutation detection — every delegation failed (${stems(settlement.failed)})${tail}`)];
}
