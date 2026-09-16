import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MANDATORY_POLICIES_PATH,
  generateMandatoryPolicies,
  readFixture,
  validateFixture,
  type MandatoryPolicyFixture,
} from '../../../scripts/workflow-eval/generate-mandatory-policies.js';

const KNOWLEDGE_BASE = 'prospec/ai-knowledge';
const fixture = readFixture(process.cwd());
const generated = generateMandatoryPolicies(fixture, KNOWLEDGE_BASE);

const clone = (): MandatoryPolicyFixture => JSON.parse(JSON.stringify(fixture)) as MandatoryPolicyFixture;

describe('mandatory policy generation (REQ-TESTS-116)', () => {
  it('reproduces the version-controlled fixture with no value diff', () => {
    // The frozen fixture was hand-maintained beside the registry; regenerating it
    // from the registry must change nothing, or the two disagreed about what a
    // station loads before any phase work.
    expect(`${JSON.stringify(generated, null, 2)}\n`).toBe(
      readFileSync(MANDATORY_POLICIES_PATH, 'utf8'),
    );
  });

  it('leaves each scenario route, audit note and ceiling exactly as recorded', () => {
    expect(generated.ceilings).toEqual(fixture.ceilings);
    for (const [scenario, policy] of Object.entries(generated.policies)) {
      expect(policy.roots, scenario).toEqual(fixture.policies[scenario]!.roots);
      expect(policy.audit, scenario).toBe(fixture.policies[scenario]!.audit);
    }
  });

  it('declares an explicit edge list for every node, empty leaves included', () => {
    for (const [scenario, policy] of Object.entries(generated.policies)) {
      for (const sources of Object.values(policy.dependencies)) {
        for (const source of sources) {
          expect(Object.hasOwn(policy.dependencies, source), `${scenario}: ${source}`).toBe(true);
        }
      }
    }
  });

  it('carries the implement station project file as a declared edge, not as an absence', () => {
    const quick = generated.policies['quick']!;
    expect(quick.dependencies['.agents/skills/prospec-implement/SKILL.md']).toContain(
      `${KNOWLEDGE_BASE}/_conventions.md`,
    );
    expect(quick.dependencies[`${KNOWLEDGE_BASE}/_conventions.md`]).toEqual([]);
  });

  it('keeps the conditional backfill routing outside the legacy startup metric', () => {
    for (const policy of Object.values(generated.policies)) {
      for (const [node, sources] of Object.entries(policy.dependencies)) {
        if (!node.endsWith('prospec-verify/SKILL.md')) continue;
        // Required under `scale: backfill`, but declared by a routing blockquote
        // rather than the `**MANDATORY**` marker the recorded ceilings were
        // measured with — widening the metric here would move all eight.
        expect(sources).toEqual([]);
      }
    }
  });

  it('resolves the deployment root from the route, never from a hardcoded host', () => {
    const reroot = clone();
    reroot.policies = {
      quick: {
        ...reroot.policies['quick']!,
        roots: [{ station: 'tasks', paths: ['.claude/skills/prospec-tasks/SKILL.md'] }],
      },
    };
    reroot.ceilings = { quick: reroot.ceilings['quick']! };
    const result = generateMandatoryPolicies(reroot, KNOWLEDGE_BASE);
    expect(Object.keys(result.policies['quick']!.dependencies)).toEqual([
      '.claude/skills/prospec-tasks/SKILL.md',
      '.claude/skills/prospec-tasks/references/tasks-format.md',
    ]);
  });

  it('refuses a route entry that is not a station SKILL.md', () => {
    const broken = clone();
    broken.policies['quick']!.roots = [{ station: 'tasks', paths: ['.agents/skills/prospec-tasks/references/x.md'] }];
    expect(() => generateMandatoryPolicies(broken, KNOWLEDGE_BASE)).toThrow(/is not a/);
  });

  it('refuses a route entry naming a skill the registry does not ship', () => {
    const broken = clone();
    broken.policies['quick']!.roots = [{ station: 'tasks', paths: ['.agents/skills/my-house-style/SKILL.md'] }];
    expect(() => generateMandatoryPolicies(broken, KNOWLEDGE_BASE)).toThrow(/does not ship/);
  });

  it('refuses a scenario with no routed station rather than emitting an empty graph', () => {
    const broken = clone();
    broken.policies['quick']!.roots = [];
    expect(() => generateMandatoryPolicies(broken, KNOWLEDGE_BASE)).toThrow(/declares no routed station/);
  });
});

describe('mandatory policy fixture reading', () => {
  it('refuses a scenario with no recorded ceiling', () => {
    const broken = clone();
    delete broken.ceilings['quick'];
    expect(() => validateFixture(broken)).toThrow(/no recorded ceiling/);
  });

  it('refuses a scenario with no audit note', () => {
    const broken = clone();
    broken.policies['quick']!.audit = '';
    expect(() => validateFixture(broken)).toThrow(/no audit note/);
  });
});
