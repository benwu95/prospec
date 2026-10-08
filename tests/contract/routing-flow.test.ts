import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ROUTING_FLOW_DOC, readRoutingRegion, renderRoutingFlow } from '../../scripts/routing-flow.js';
import { ROUTING_TABLE } from '../../src/lib/status-router.js';

/**
 * The routing diagram in the lib knowledge is drawn from the router's rule table:
 * a rule added, removed, reordered or relabelled without `pnpm routing-flow`
 * leaves the committed region stale, and this fails.
 */
describe(`${ROUTING_FLOW_DOC} — generated routing diagram`, () => {
  const doc = fs.readFileSync(path.join(process.cwd(), ROUTING_FLOW_DOC), 'utf-8');

  it('the marker region equals a fresh render of ROUTING_TABLE (run `pnpm routing-flow` to redraw)', () => {
    const region = readRoutingRegion(doc);
    expect(region, 'routing-flow markers missing, duplicated or reversed').not.toBeNull();
    expect(region).toBe(renderRoutingFlow(ROUTING_TABLE));
  });
});
