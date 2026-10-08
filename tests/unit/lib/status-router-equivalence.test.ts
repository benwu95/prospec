import { describe, it, expect } from 'vitest';
import { routeChange } from '../../../src/lib/status-router.js';
import { CHANGE_SCALES, CHANGE_STATUSES } from '../../../src/types/change.js';
import type { ChangeRouteFacts } from '../../../src/types/status.js';
import { legacyRouteChange } from '../../fixtures/legacy-status-router.js';
import { randomRoutingFacts, routingFactsGrid } from '../../helpers/routing-facts-grid.js';

/**
 * Characterization: the rule-table router returns, for every facts set below, the
 * byte-identical JSON the if-chain router returned — codes, next, gates, reasons, key
 * order and which keys are present. Delete this file and its fixture in the change that alters routing on purpose.
 */

const RANDOM_SAMPLES = 200_000;

// JSON.stringify drops an `undefined`-valued key, but consumers read a route field's
// absence (not its falsiness) — so a present-but-undefined key must still differ.
const serialize = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) => (v === undefined ? '[undefined]' : v));

function mismatches(facts: Iterable<ChangeRouteFacts>): { count: number; total: number; first?: string } {
  let count = 0;
  let total = 0;
  let first: string | undefined;
  for (const f of facts) {
    total++;
    const actual = serialize(routeChange(f));
    const expected = serialize(legacyRouteChange(f));
    if (actual !== expected) {
      count++;
      first ??= `facts: ${JSON.stringify(f)}\n  rule table: ${actual}\n  legacy:     ${expected}`;
    }
  }
  return { count, total, first };
}

describe('rule-table router ≡ legacy if-chain router', { timeout: 60_000 }, () => {
  it.each(CHANGE_STATUSES)('status %s: every grid point routes identically', (status) => {
    const result = mismatches(routingFactsGrid(status));
    expect(result.total).toBeGreaterThan(0);
    expect(result.count, result.first).toBe(0);
  });

  it('the seeded random facts do not collapse onto a few values', () => {
    const distinct = new Set<string>();
    const scales = new Set<string>();
    let withWarnings = 0;
    for (const f of randomRoutingFacts(RANDOM_SAMPLES, 7, CHANGE_STATUSES)) {
      distinct.add(JSON.stringify(f));
      scales.add(f.scale);
      if ((f.unresolvedWarnings?.length ?? 0) > 0) withWarnings++;
    }
    expect(distinct.size).toBeGreaterThan(RANDOM_SAMPLES * 0.95);
    expect([...scales].sort()).toEqual([...CHANGE_SCALES].sort());
    expect(withWarnings).toBeGreaterThan(0);
  });

  it(`${RANDOM_SAMPLES} seeded random facts route identically`, () => {
    const result = mismatches(randomRoutingFacts(RANDOM_SAMPLES, 7, CHANGE_STATUSES));
    expect(result.total).toBe(RANDOM_SAMPLES);
    expect(result.count, result.first).toBe(0);
  });
});
