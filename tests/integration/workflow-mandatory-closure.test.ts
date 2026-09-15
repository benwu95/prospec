import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCorpus } from '../../scripts/evaluate-workflow.js';
import { mandatoryLedger } from '../../scripts/workflow-eval/context.js';
import { SCENARIO_IDS } from '../../scripts/workflow-eval/protocol.js';
import { mandatoryCitations, startupLoadingSection } from '../helpers/mandatory-loads.js';

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
 */
const CEILING_ANCHORS: Record<string, number> = {
  quick: 16_347, 'standard-ui': 15_244, 'proven-backfill': 23_279, 'equivalent-commit': 12_651,
  'reverify-c': 15_439, 'missing-receipt': 5_613, 'stale-delta': 12_792, 'multi-change': 12_651,
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
