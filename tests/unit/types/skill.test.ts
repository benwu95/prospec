import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  AGENT_CONFIGS,
  GROUP_RENDER_FLAG_REDUCERS,
  HARNESS_CAPABILITY_KEYS,
  RENDER_FLAG_KEYS,
  SKILL_CONTENT_LIFECYCLES,
  intersectCapabilities,
  mergeGroupInvocationGuidance,
  mergeGroupRenderFlags,
  renderFlagContext,
  type AgentConfig,
  type AgentRenderFlags,
  type HarnessCapabilities,
  type SkillContentLifecycle,
} from '../../../src/types/skill.js';
import { VALID_AGENTS, type ValidAgent } from '../../../src/types/config.js';

const caps = (overrides: Partial<HarnessCapabilities> = {}): HarnessCapabilities => ({
  canSpawnSubagent: true,
  canWorktree: true,
  canBackground: true,
  ...overrides,
});

const renderFlags = (
  surfacesSkillFrontmatter: boolean,
  skillContentLifecycle: SkillContentLifecycle = 'unknown',
): AgentRenderFlags => ({ surfacesSkillFrontmatter, skillContentLifecycle });

const invocationMember = (agent: ValidAgent): Pick<AgentConfig, 'name' | 'invocation'> =>
  AGENT_CONFIGS[agent];

describe('AGENT_CONFIGS harness capabilities (REQ-TYPES-071)', () => {
  it('declares every capability flag for every valid agent', () => {
    for (const agent of VALID_AGENTS) {
      const declared = AGENT_CONFIGS[agent].capabilities;
      for (const key of HARNESS_CAPABILITY_KEYS) {
        expect(typeof declared[key], `${agent}.${key}`).toBe('boolean');
      }
    }
  });

  it('pins the surveyed values — claude is the only harness with worktree isolation', () => {
    // The registry is a dated capability survey (see the source notes), not folklore.
    // A silent flip of any value must go red here, because it changes what every
    // generated SKILL.md tells the agent it may do.
    const worktreeCapable = VALID_AGENTS.filter((a) => AGENT_CONFIGS[a].capabilities.canWorktree);
    expect(worktreeCapable).toEqual(['claude']);
    for (const agent of VALID_AGENTS) {
      expect(AGENT_CONFIGS[agent].capabilities.canSpawnSubagent, agent).toBe(true);
      expect(AGENT_CONFIGS[agent].capabilities.canBackground, agent).toBe(true);
    }
  });
});

describe('intersectCapabilities (REQ-TYPES-071)', () => {
  it('keeps a flag true only when every input declares it true', () => {
    // One flag at a time, so a reducer that ORs (or returns the last member)
    // cannot pass by coincidence on a uniformly-true fixture.
    for (const key of HARNESS_CAPABILITY_KEYS) {
      const result = intersectCapabilities([caps(), caps({ [key]: false })]);
      expect(result[key], `${key} must degrade to false`).toBe(false);
      for (const other of HARNESS_CAPABILITY_KEYS) {
        if (other !== key) expect(result[other], `${other} must survive`).toBe(true);
      }
    }
  });

  it('is order-independent — the last member never wins', () => {
    const a = caps({ canSpawnSubagent: false });
    const b = caps({ canWorktree: false });
    expect(intersectCapabilities([a, b])).toEqual(intersectCapabilities([b, a]));
    expect(intersectCapabilities([a, b])).toEqual({
      canSpawnSubagent: false,
      canWorktree: false,
      canBackground: true,
    });
  });

  it('returns a single member unchanged', () => {
    const only = caps({ canWorktree: false });
    expect(intersectCapabilities([only])).toEqual(only);
  });

  it('claims nothing for an empty input', () => {
    // The AND-identity would be all-true; that would let an empty group claim
    // every capability. A registry-backed claim needs at least one declarant.
    expect(intersectCapabilities([])).toEqual({
      canSpawnSubagent: false,
      canWorktree: false,
      canBackground: false,
    });
  });
});

describe('AGENT_CONFIGS render flags (REQ-TYPES-059)', () => {
  it('surfacesSkillFrontmatter is declared for every agent — only claude surfaces it', () => {
    // Survives the AgentRenderFlags extraction: the flag is still present on
    // every AGENT_CONFIGS entry, and only claude renders the slim registry.
    expect(AGENT_CONFIGS.claude.surfacesSkillFrontmatter).toBe(true);
    for (const agent of VALID_AGENTS.filter((a) => a !== 'claude')) {
      expect(AGENT_CONFIGS[agent].surfacesSkillFrontmatter, agent).toBe(false);
    }
  });
});

describe('mergeGroupRenderFlags (REQ-TYPES-085)', () => {
  it('renders slim only when every member surfaces frontmatter — one false degrades to full', () => {
    // Degrade the MIDDLE member: first-member-wins (`configs[0]`) and
    // last-member-wins (`configs.at(-1)`) both read `true` here, so only a real
    // group merge returns false (issue #95's middle-member lesson, issue #134).
    expect(
      mergeGroupRenderFlags([renderFlags(true), renderFlags(false), renderFlags(true)]),
    ).toEqual({ surfacesSkillFrontmatter: false, skillContentLifecycle: 'unknown' });
  });

  it('keeps slim only when all members surface frontmatter', () => {
    expect(mergeGroupRenderFlags([renderFlags(true), renderFlags(true)])).toEqual({
      surfacesSkillFrontmatter: true,
      skillContentLifecycle: 'unknown',
    });
  });

  it('is order-independent — the last member never wins', () => {
    const a = [renderFlags(false), renderFlags(true)];
    const b = [renderFlags(true), renderFlags(false)];
    expect(mergeGroupRenderFlags(a)).toEqual(mergeGroupRenderFlags(b));
    expect(mergeGroupRenderFlags(a)).toEqual({
      surfacesSkillFrontmatter: false,
      skillContentLifecycle: 'unknown',
    });
  });

  it('returns a single member unchanged', () => {
    expect(mergeGroupRenderFlags([renderFlags(true, 'tool-output')])).toEqual({
      surfacesSkillFrontmatter: true,
      skillContentLifecycle: 'tool-output',
    });
    expect(mergeGroupRenderFlags([renderFlags(false, 'persistent-reattach')])).toEqual({
      surfacesSkillFrontmatter: false,
      skillContentLifecycle: 'persistent-reattach',
    });
  });

  it('renders the full table for an empty input', () => {
    // `[].every()` is true; that would slim a group with no declarant and hide
    // the skill table. The conservative default is the full table (false).
    expect(mergeGroupRenderFlags([])).toEqual({
      surfacesSkillFrontmatter: false,
      skillContentLifecycle: 'unknown',
    });
  });
});

describe('AGENT_CONFIGS invocation profiles (REQ-TYPES-086)', () => {
  it('declares one closed invocation mode for every valid agent', () => {
    expect(VALID_AGENTS.map((agent) => AGENT_CONFIGS[agent].invocation.mode)).toEqual([
      'sigil',
      'sigil',
      'sigil',
      'name-or-browser',
    ]);
  });
});

describe('mergeGroupInvocationGuidance (REQ-TYPES-086)', () => {
  it('returns no assumed host guidance for an empty group', () => {
    expect(mergeGroupInvocationGuidance([])).toEqual([]);
  });

  it('deduplicates members and returns every guidance mode in canonical host order', () => {
    expect(
      mergeGroupInvocationGuidance([
        invocationMember('antigravity'),
        invocationMember('copilot'),
        invocationMember('codex'),
        invocationMember('claude'),
        invocationMember('codex'),
      ]),
    ).toEqual([
      { agent: 'claude', label: 'Claude Code', invocationPrefix: '/' },
      { agent: 'codex', label: 'Codex', invocationPrefix: '$' },
      { agent: 'copilot', label: 'GitHub Copilot', invocationPrefix: '/' },
      {
        agent: 'antigravity',
        label: 'Antigravity',
        invocationInstruction: 'Mention the bare Skill name or select it from the Skills browser.',
      },
    ]);
  });

  it('is input-order independent and does not omit the middle shared-output member', () => {
    const forward = mergeGroupInvocationGuidance([
      invocationMember('codex'),
      invocationMember('copilot'),
      invocationMember('antigravity'),
    ]);
    const reverse = mergeGroupInvocationGuidance([
      invocationMember('antigravity'),
      invocationMember('copilot'),
      invocationMember('codex'),
    ]);

    expect(forward).toEqual(reverse);
    expect(forward.map((guidance) => guidance.agent)).toEqual([
      'codex',
      'copilot',
      'antigravity',
    ]);
  });
});

describe('AGENT_CONFIGS skill content lifecycle (REQ-TYPES-100)', () => {
  it('declares one closed lifecycle value per host, at the issue #271 survey baseline', () => {
    // A capability claim is a registry FACT, never an inference: only the two hosts
    // whose mechanism is documented/auditable declare one, and every unevidenced
    // host stays `unknown` — the value the conservative render branch keys on.
    expect(AGENT_CONFIGS.claude.skillContentLifecycle).toBe('persistent-reattach');
    expect(AGENT_CONFIGS.codex.skillContentLifecycle).toBe('tool-output');
    expect(AGENT_CONFIGS.antigravity.skillContentLifecycle).toBe('unknown');
    expect(AGENT_CONFIGS.copilot.skillContentLifecycle).toBe('unknown');
    for (const agent of VALID_AGENTS) {
      expect(SKILL_CONTENT_LIFECYCLES, agent).toContain(AGENT_CONFIGS[agent].skillContentLifecycle);
    }
  });

  it('keeps every declared (non-unknown) value traceable to a dated source in the registry comments', () => {
    // The provenance lives beside the value it backs, so a re-surveyor can re-check
    // the same place instead of trusting folklore (the `capabilities` precedent).
    // `unknown` needs no source — it is the absence of evidence.
    const source = readFileSync(
      new URL('../../../src/types/skill.ts', import.meta.url),
      'utf8',
    );
    for (const agent of VALID_AGENTS) {
      if (AGENT_CONFIGS[agent].skillContentLifecycle === 'unknown') continue;
      const declaration = source.indexOf(`skillContentLifecycle: '${AGENT_CONFIGS[agent].skillContentLifecycle}'`);
      expect(declaration, `${agent} lifecycle declaration not found in source`).toBeGreaterThan(-1);
      // The comment block immediately above the declaration carries the evidence.
      const preceding = source.slice(Math.max(0, declaration - 700), declaration);
      const comment = preceding.slice(preceding.lastIndexOf('\n\n') + 1);
      expect(comment, `${agent} lifecycle has no dated provenance comment`).toMatch(/20\d\d-\d\d-\d\d/);
      expect(comment, `${agent} lifecycle names no locatable source`).toMatch(/https?:\/\/|source|issue/i);
    }
  });
});

describe('mergeGroupRenderFlags skillContentLifecycle (REQ-TYPES-085, REQ-TYPES-100)', () => {
  const lifecycles = (...values: SkillContentLifecycle[]): AgentRenderFlags[] =>
    values.map((skillContentLifecycle) => ({ surfacesSkillFrontmatter: false, skillContentLifecycle }));
  const merged = (...values: SkillContentLifecycle[]): SkillContentLifecycle =>
    mergeGroupRenderFlags(lifecycles(...values)).skillContentLifecycle;

  it('resolves a non-empty all-persistent-reattach group to persistent-reattach', () => {
    expect(merged('persistent-reattach', 'persistent-reattach')).toBe('persistent-reattach');
    expect(merged('persistent-reattach')).toBe('persistent-reattach');
  });

  it('resolves a non-empty all-tool-output group to tool-output', () => {
    expect(merged('tool-output', 'tool-output')).toBe('tool-output');
    expect(merged('tool-output')).toBe('tool-output');
  });

  it('degrades every mixed group to unknown — a shared file never claims a capability one member lacks', () => {
    // Degrade the MIDDLE member: first-member-wins and last-member-wins both read
    // `persistent-reattach` here, so only a real group merge returns `unknown`.
    expect(merged('persistent-reattach', 'tool-output', 'persistent-reattach')).toBe('unknown');
    expect(merged('persistent-reattach', 'unknown')).toBe('unknown');
    expect(merged('tool-output', 'unknown')).toBe('unknown');
  });

  it('claims nothing for an empty group', () => {
    expect(mergeGroupRenderFlags([]).skillContentLifecycle).toBe('unknown');
  });

  it('is order- and duplicate-independent', () => {
    expect(merged('tool-output', 'persistent-reattach')).toBe(merged('persistent-reattach', 'tool-output'));
    expect(merged('persistent-reattach', 'persistent-reattach', 'persistent-reattach')).toBe(
      merged('persistent-reattach'),
    );
    expect(merged('unknown', 'tool-output')).toBe(merged('tool-output', 'unknown'));
  });

  it('merges the registry group that actually shares AGENTS.md down to unknown', () => {
    // codex (tool-output) + copilot/antigravity (unknown) read the same bytes.
    const shared = (['codex', 'copilot', 'antigravity'] as const).map((agent) => AGENT_CONFIGS[agent]);
    expect(mergeGroupRenderFlags(shared).skillContentLifecycle).toBe('unknown');
    expect(mergeGroupRenderFlags([AGENT_CONFIGS.claude]).skillContentLifecycle).toBe('persistent-reattach');
  });
});

describe('render-flag reducer obligation is compile-time (REQ-TYPES-085)', () => {
  it('lists every render flag in RENDER_FLAG_KEYS and gives each one a reducer', () => {
    expect([...RENDER_FLAG_KEYS].sort()).toEqual(
      Object.keys(GROUP_RENDER_FLAG_REDUCERS).sort(),
    );
    expect(RENDER_FLAG_KEYS).toContain('skillContentLifecycle');
  });

  it('rejects a registry that omits a flag, and a reducer typed for the wrong field (compile-time guard)', () => {
    // @ts-expect-error — a reducer registry missing `skillContentLifecycle` must not typecheck.
    const incomplete: typeof GROUP_RENDER_FLAG_REDUCERS = {
      surfacesSkillFrontmatter: (values) => values.length > 0 && values.every(Boolean),
    };
    const complete: typeof GROUP_RENDER_FLAG_REDUCERS = {
      surfacesSkillFrontmatter: (values) => values.length > 0 && values.every(Boolean),
      // @ts-expect-error — the lifecycle reducer is typed per key: booleans are not its domain.
      skillContentLifecycle: (values) => values.length > 0 && values.every(Boolean),
    };
    expect(typeof incomplete.surfacesSkillFrontmatter).toBe('function');
    expect(typeof complete.skillContentLifecycle).toBe('function');
  });
});

describe('renderFlagContext (REQ-TYPES-085, REQ-TEMPLATES-233)', () => {
  it('renders the merged lifecycle under its context name with an explicit branch boolean', () => {
    expect(
      renderFlagContext({ surfacesSkillFrontmatter: true, skillContentLifecycle: 'persistent-reattach' }),
    ).toEqual({
      surfaces_skill_frontmatter: true,
      skill_lifecycle: 'persistent-reattach',
      skill_lifecycle_persistent: true,
    });
  });

  it('never lets a non-persistent lifecycle reach the template as a truthy branch', () => {
    // Handlebars reads any non-empty string as true, so `{{#if skill_lifecycle}}`
    // would take the persistent branch for `unknown` — the branch must be a boolean.
    for (const lifecycle of ['tool-output', 'unknown'] as const) {
      const context = renderFlagContext({
        surfacesSkillFrontmatter: false,
        skillContentLifecycle: lifecycle,
      });
      expect(context.skill_lifecycle, lifecycle).toBe(lifecycle);
      expect(context.skill_lifecycle_persistent, lifecycle).toBe(false);
    }
  });
});
