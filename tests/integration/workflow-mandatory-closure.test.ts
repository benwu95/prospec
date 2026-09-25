import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCorpus } from '../../scripts/evaluate-workflow.js';
import { mandatoryLedger } from '../../scripts/workflow-eval/context.js';
import { SCENARIO_IDS } from '../../scripts/workflow-eval/protocol.js';
import { mandatoryCitations, startupLoadingSection } from '../helpers/mandatory-loads.js';
import {
  generateMandatoryPolicies,
  type MandatoryPolicyFixture,
} from '../../scripts/workflow-eval/generate-mandatory-policies.js';
import STATION_BASELINE from '../fixtures/station-reference-baseline.json' with { type: 'json' };

/**
 * Scenario-level mandatory context: what the SHIPPED instructions require a station
 * to load before any phase work, per route. The inventory is version-controlled and
 * audited; the ceiling is the pre-change cost. Both together make REQ-TEMPLATES-081
 * checkable — an instruction edit that quietly adds a mandatory load turns this red,
 * and a "slimmer" skill that displaced prose into a mandatory reference gains nothing
 * because the reference is inside the closure.
 */
const fixture = JSON.parse(
  readFileSync(resolve('tests/fixtures/workflow-eval/mandatory-policies.json'), 'utf8'),
) as { version: 1; ceilings: Record<string, number>; policies: Record<string, Parameters<typeof mandatoryLedger>[1]> };

// The deployed host copy agent sync keeps current — the bytes an agent actually loads.
function shippedInstructions(): Record<string, string> {
  const root = resolve('.agents/skills');
  const files: Record<string, string> = {};
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const absolute = join(entry.parentPath, entry.name);
    files[`.agents/skills/${absolute.slice(root.length + 1).replaceAll('\\', '/')}`] = readFileSync(absolute, 'utf8');
  }
  return files;
}

/**
 * The MANDATORY set a deployed skill actually declares, read from its own Startup
 * Loading block through the SHARED parser the per-skill ledger uses. The fixture
 * inventory is compared against this, so an instruction edit that quietly adds a
 * mandatory load cannot hide by being absent from a hand-written list.
 */
function declaredMandatory(skillPath: string, instructions: Record<string, string>): string[] {
  const raw = instructions[skillPath];
  expect(raw, `${skillPath} must be deployed`).toBeDefined();
  const section = startupLoadingSection(raw!, (message) => { expect.fail(`${skillPath}: ${message}`); });
  return [...mandatoryCitations(section, skillPath.slice(0, skillPath.lastIndexOf('/')))].sort();
}

/**
 * Shrink-only anchors, deliberately OUTSIDE the fixture they bound: the fixture's own
 * rows are what a ceiling is compared against, so a ceiling checked only against the
 * fixture can never fail (round-2 T2-2). Unlike the per-skill ledger, this closure
 * measures what a RUN must load, project conventions included — hence `quick`, the one
 * scenario routed through implement, carries its mandatory `_conventions.md`.
 *
 * `proven-backfill` 23_318 → 23_372 and `stale-delta` 12_818 → 12_872 (both route through
 * review): the review skill's Loop step 3 and NEVER list
 * gained the CLI test-refusal / `ESCALATE_TO_HUMAN` handling and `review-format` its
 * test-failure metrics paragraph (fresh-test gates) — the duplicated test-policy prose
 * they replace was shorter than the new behavior they must name; `quick` absorbed the
 * implement skill's one-sentence change without moving.
 *
 * Every scenario raised by the opt-in plan sign-off pause (add-plan-signoff-pause):
 * `quick` 16_382 → 16_505, `standard-ui` 15_282 → 15_380, `proven-backfill` 23_372 → 23_556,
 * `equivalent-commit` / `multi-change` 12_676 → 12_794, `reverify-c` 15_463 → 15_678,
 * `missing-receipt` 5_627 → 5_891, `stale-delta` 12_872 → 12_939 — ff's plan phase gained
 * the sign-off selection row and gate, the cascade Step 5 its sign-off HALT, archive the
 * Plan Decision carry-over, metadata-format the `signoff_option` stamp, and ff / cascade-protocol
 * the NEVER rule on the `PROSPEC_PAUSE_AT` override.
 */
const CEILING_ANCHORS: Record<string, number> = {
  quick: 16_505, 'standard-ui': 15_380, 'proven-backfill': 23_556, 'equivalent-commit': 12_794,
  'reverify-c': 15_678, 'missing-receipt': 5_891, 'stale-delta': 12_939, 'multi-change': 12_794,
};

describe('scenario mandatory context closure (REQ-TEMPLATES-081, REQ-TESTS-116)', () => {
  it('matches every declared MANDATORY load in the deployed skills it routes through', () => {
    const instructions = shippedInstructions();
    for (const [id, policy] of Object.entries(fixture.policies)) {
      for (const root of policy.roots) {
        for (const skill of root.paths) {
          // Set equality, both directions: a load added to the instructions and a
          // stale edge left in the fixture are each a failure here.
          expect([...(policy.dependencies[skill] ?? [])].sort(), `${id}: ${skill}`)
            .toEqual(declaredMandatory(skill, instructions));
        }
      }
    }
  });

  it('covers every scenario with an audited inventory and its recorded ceiling', () => {
    expect(Object.keys(fixture.policies).sort()).toEqual([...SCENARIO_IDS].sort());
    expect(Object.keys(fixture.ceilings).sort()).toEqual([...SCENARIO_IDS].sort());
    for (const [id, policy] of Object.entries(fixture.policies)) {
      expect(fixture.ceilings[id], `${id} ceiling may only shrink`).toBeLessThanOrEqual(CEILING_ANCHORS[id]!);
      expect(policy.audit, id).toMatch(/Startup Loading/);
      expect(policy.roots.length, id).toBeGreaterThan(0);
      // Every leaf declares an explicit (possibly empty) edge list — the ledger
      // refuses an unknown source rather than silently skipping it.
      for (const root of policy.roots) for (const path of root.paths) expect(Object.hasOwn(policy.dependencies, path), `${id}: ${path}`).toBe(true);
    }
  });

  it('resolves each inventory against the shipped instructions and stays at or under its ceiling', async () => {
    const corpus = await loadCorpus(resolve('tests/fixtures/workflow-eval'));
    const instructions = shippedInstructions();
    // A mandatory PROJECT file (the conventions the implement station must load) is
    // not part of the shipped skills and not in the disposable scenario fixture; its
    // real cost is this repository's own copy, so that is what the ledger measures.
    const projectFiles: Record<string, string> = {};
    for (const policy of Object.values(fixture.policies)) {
      for (const sources of Object.values(policy.dependencies)) {
        for (const path of sources) {
          if (path.startsWith('.agents/skills/') || Object.hasOwn(projectFiles, path)) continue;
          projectFiles[path] = readFileSync(resolve(path), 'utf8');
        }
      }
    }
    for (const scenario of corpus.scenarios) {
      const ledger = mandatoryLedger({ ...scenario.files, ...instructions, ...projectFiles }, fixture.policies[scenario.id]!);
      // Unprovable is not "small": a missing mandatory source fails, never passes as zero.
      expect(ledger.errors, scenario.id).toEqual([]);
      expect(ledger.available, scenario.id).toBe(true);
      expect(ledger.estimated_tokens, `${scenario.id} mandatory context`).toBeLessThanOrEqual(fixture.ceilings[scenario.id]!);
      expect(ledger.loads.length, scenario.id).toBeGreaterThan(0);
    }
  });
});

/**
 * The third leg. Two already meet here: the fixture inventory and the deployed
 * instructions read through the shared parser. This adds the registry the
 * instructions are now generated from, plus the PRE-MIGRATION copy of the whole
 * policy file — so "the single source agrees" is proved against a value captured
 * before the single source existed, not against the fixture it now writes.
 */
describe('mandatory inventory agrees with the registry and the pre-migration record', () => {
  const frozen = (STATION_BASELINE as unknown as {
    mandatory_policies: { ceilings: Record<string, number>; policies: MandatoryPolicyFixture['policies'] };
  }).mandatory_policies;

  it('regenerates every scenario from STATION_REFERENCES with no value diff', () => {
    const generated = generateMandatoryPolicies(fixture as MandatoryPolicyFixture, 'prospec/ai-knowledge');
    expect(generated.policies).toEqual(fixture.policies);
    expect(generated.ceilings).toEqual(fixture.ceilings);
  });

  it('keeps every ceiling, route, audit note and edge at its pre-migration value', () => {
    expect(fixture.ceilings).toEqual(frozen.ceilings);
    expect(fixture.policies).toEqual(frozen.policies);
    // The anchors bound the fixture from outside it, and this change moved none.
    expect(CEILING_ANCHORS).toEqual(frozen.ceilings);
  });
});
