import { describe, it, expect } from 'vitest';
import {
  AGENT_CONFIGS,
  HARNESS_CAPABILITY_KEYS,
  intersectCapabilities,
  type HarnessCapabilities,
} from '../../../src/types/skill.js';
import { VALID_AGENTS } from '../../../src/types/config.js';

const caps = (overrides: Partial<HarnessCapabilities> = {}): HarnessCapabilities => ({
  canSpawnSubagent: true,
  canWorktree: true,
  canBackground: true,
  ...overrides,
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
