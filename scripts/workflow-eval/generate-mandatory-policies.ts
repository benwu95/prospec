/**
 * Generate the workflow-eval mandatory policies from the station reference registry.
 *
 * The per-scenario ROUTE (which stations a scenario walks) and its recorded
 * CEILING are experiment definitions: they stay in the fixture and this script
 * never invents or moves them. What it does own is the dependency edges — which
 * references each routed station's Startup Loading marks `**MANDATORY**` — which
 * used to be hand-listed beside the registry that already knows them.
 *
 * Scope is deliberately the legacy startup-only metric: `startup-conditional`
 * reads are required by the instructions but were never inside the measurement
 * the recorded ceilings were taken with, and silently widening it here would move
 * every one of them (see `projectStartupMandatory`).
 *
 *   node --import tsx scripts/workflow-eval/generate-mandatory-policies.ts --check
 *   node --import tsx scripts/workflow-eval/generate-mandatory-policies.ts --write
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { atomicWrite } from '../../src/lib/fs-utils.js';
import { projectStartupMandatory } from '../../src/lib/skill-reference-map.js';
import { STATION_REFERENCES } from '../../src/types/skill.js';

export const MANDATORY_POLICIES_PATH = 'tests/fixtures/workflow-eval/mandatory-policies.json';

export interface MandatoryPolicy {
  audit: string;
  roots: { station: string; paths: string[] }[];
  dependencies: Record<string, string[]>;
}

export interface MandatoryPolicyFixture {
  version: 1;
  note: string;
  ceilings: Record<string, number>;
  policies: Record<string, MandatoryPolicy>;
}

/** `<skillPath>/<skill>/SKILL.md` split into its two halves. */
function parseStationRoot(root: string): { skillPath: string; skill: string } {
  const match = /^(.*)\/([^/]+)\/SKILL\.md$/.exec(root);
  if (match === null) {
    throw new Error(`mandatory policies: root '${root}' is not a <skills dir>/<skill>/SKILL.md path`);
  }
  const [, skillPath, skill] = match as unknown as [string, string, string];
  if (!Object.hasOwn(STATION_REFERENCES, skill)) {
    throw new Error(`mandatory policies: root '${root}' names '${skill}', which the registry does not ship`);
  }
  return { skillPath, skill };
}

/**
 * Rebuild every policy's dependency graph from the registry, keeping each
 * scenario's route, audit note and ceiling exactly as recorded.
 *
 * Every node carries an explicit edge list, empty leaves included: the ledger
 * refuses a source it was not told about, so an implicit leaf would be scored as
 * a missing input rather than as zero.
 */
export function generateMandatoryPolicies(
  fixture: MandatoryPolicyFixture,
  knowledgeBasePath: string,
): MandatoryPolicyFixture {
  const policies: Record<string, MandatoryPolicy> = {};
  for (const [scenario, policy] of Object.entries(fixture.policies)) {
    if (policy.roots.length === 0) {
      throw new Error(`mandatory policies: scenario '${scenario}' declares no routed station`);
    }
    const dependencies: Record<string, string[]> = {};
    for (const root of policy.roots) {
      for (const path of root.paths) {
        const { skillPath, skill } = parseStationRoot(path);
        const loads = projectStartupMandatory(skill, { skillPath, knowledgeBasePath });
        dependencies[path] = loads;
        for (const load of loads) dependencies[load] ??= [];
      }
    }
    policies[scenario] = {
      audit: policy.audit,
      roots: policy.roots,
      dependencies: Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    };
  }
  return { ...fixture, policies };
}

/**
 * Refuse a fixture that is missing the experiment definitions this script does
 * NOT own. Generating against a fixture with no ceiling or no audit note would
 * produce a policy nobody can hold to anything.
 */
export function validateFixture(raw: MandatoryPolicyFixture): MandatoryPolicyFixture {
  for (const field of ['ceilings', 'policies'] as const) {
    if (raw[field] === undefined) throw new Error(`mandatory policies: fixture has no '${field}'`);
  }
  for (const [scenario, policy] of Object.entries(raw.policies)) {
    if (!policy.audit) throw new Error(`mandatory policies: scenario '${scenario}' has no audit note`);
    if (raw.ceilings[scenario] === undefined) {
      throw new Error(`mandatory policies: scenario '${scenario}' has no recorded ceiling`);
    }
  }
  return raw;
}

export function readFixture(cwd: string): MandatoryPolicyFixture {
  return validateFixture(
    JSON.parse(readFileSync(resolve(cwd, MANDATORY_POLICIES_PATH), 'utf8')) as MandatoryPolicyFixture,
  );
}

const serialize = (fixture: MandatoryPolicyFixture): string => `${JSON.stringify(fixture, null, 2)}\n`;

async function main(): Promise<void> {
  const write = process.argv.includes('--write');
  const cwd = process.cwd();
  const current = readFixture(cwd);
  // The host project's own knowledge base — the implement station's mandatory
  // conventions file is a project file, and its location is config, not a literal.
  const { readConfig, resolveBasePaths } = await import('../../src/lib/config.js');
  const config = await readConfig(cwd);
  const knowledgeBasePath = resolveBasePaths(config, cwd).knowledgePath.slice(cwd.length + 1).replaceAll('\\', '/');
  const next = generateMandatoryPolicies(current, knowledgeBasePath);
  const nextText = serialize(next);
  if (write) {
    await atomicWrite(resolve(cwd, MANDATORY_POLICIES_PATH), nextText);
    console.log(`wrote ${MANDATORY_POLICIES_PATH}`);
    return;
  }
  if (nextText !== serialize(current)) {
    console.error(
      `${MANDATORY_POLICIES_PATH} disagrees with STATION_REFERENCES. ` +
        'Re-run with --write, and review the diff: a changed edge means a station\'s mandatory loads moved.',
    );
    process.exitCode = 1;
    return;
  }
  console.log(`${MANDATORY_POLICIES_PATH} matches the registry`);
}

if (process.argv[1]?.endsWith('generate-mandatory-policies.ts')) {
  void main();
}
