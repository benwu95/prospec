import { describe, it, expect } from 'vitest';
import {
  AGENT_CONFIGS,
  HARNESS_CAPABILITY_KEYS,
  intersectCapabilities,
  mergeGroupRenderFlags,
  type AgentRenderFlags,
  type HarnessCapabilities,
} from '../../../src/types/skill.js';
import { VALID_AGENTS } from '../../../src/types/config.js';

const caps = (overrides: Partial<HarnessCapabilities> = {}): HarnessCapabilities => ({
  canSpawnSubagent: true,
  canWorktree: true,
  canBackground: true,
  ...overrides,
});

const renderFlags = (surfacesSkillFrontmatter: boolean): AgentRenderFlags => ({
  surfacesSkillFrontmatter,
});

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
    ).toEqual({ surfacesSkillFrontmatter: false });
  });

  it('keeps slim only when all members surface frontmatter', () => {
    expect(mergeGroupRenderFlags([renderFlags(true), renderFlags(true)])).toEqual({
      surfacesSkillFrontmatter: true,
    });
  });

  it('is order-independent — the last member never wins', () => {
    const a = [renderFlags(false), renderFlags(true)];
    const b = [renderFlags(true), renderFlags(false)];
    expect(mergeGroupRenderFlags(a)).toEqual(mergeGroupRenderFlags(b));
    expect(mergeGroupRenderFlags(a)).toEqual({ surfacesSkillFrontmatter: false });
  });

  it('returns a single member unchanged', () => {
    expect(mergeGroupRenderFlags([renderFlags(true)])).toEqual({
      surfacesSkillFrontmatter: true,
    });
    expect(mergeGroupRenderFlags([renderFlags(false)])).toEqual({
      surfacesSkillFrontmatter: false,
    });
  });

  it('renders the full table for an empty input', () => {
    // `[].every()` is true; that would slim a group with no declarant and hide
    // the skill table. The conservative default is the full table (false).
    expect(mergeGroupRenderFlags([])).toEqual({ surfacesSkillFrontmatter: false });
  });
});
