import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { vol } from 'memfs';
import { execute } from '../../../src/services/constitution-show.service.js';
import { estimateTokens } from '../../../src/lib/token-accounting.js';
import { PrerequisiteError } from '../../../src/types/errors.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs.promises, default: memfs.fs.promises };
});

/** REQ-SERVICES-122 — contained read → slice engine → token measurement, nothing else. */
const cwd = '/repo';
const CONFIG = 'version: 1.0.0\nproject:\n  name: demo\npaths:\n  base_dir: prospec\n';

const CONSTITUTION = `# Constitution

## Principles

### [MUST] Everywhere

**Verify**: stations: all; check: language-policy-drift

---
### [MUST] Plan only

**Verify**: stations: plan

---
### [SHOULD] Verify only

**Verify**: stations: verify

## Constraints

- one
`;

beforeEach(() => {
  vol.reset();
  vol.fromJSON({
    '/repo/.prospec.yaml': CONFIG,
    '/repo/prospec/CONSTITUTION.md': CONSTITUTION,
  });
});

afterEach(() => {
  vol.reset();
});

describe('constitution show service', () => {
  it('slices by a normalized station name and measures both texts', async () => {
    const r = await execute({ cwd, station: 'prospec-plan' });
    expect(r.selector).toBe('station');
    if (r.selector !== 'station') return;
    expect(r.station).toBe('plan');
    expect(r.path).toBe('prospec/CONSTITUTION.md');
    expect(r.result.kind).toBe('sliced');
    expect(r.result.text).not.toContain('Verify only');
    expect(r.tokens).toEqual({ slice: estimateTokens(r.result.text), full: estimateTokens(CONSTITUTION) });
    expect(r.tokens.slice).toBeLessThan(r.tokens.full);
  });

  it('returns a fail-open result unchanged, with the full bytes and its reason', async () => {
    vol.writeFileSync('/repo/prospec/CONSTITUTION.md', '# C\n\n## Constraints\n');
    const r = await execute({ cwd, station: 'review' });
    if (r.selector !== 'station') throw new Error('expected a station result');
    expect(r.result).toEqual({ kind: 'full', reason: 'no-principles', text: '# C\n\n## Constraints\n' });
    expect(r.tokens.slice).toBe(r.tokens.full);
  });

  it('prints one rule by name', async () => {
    const r = await execute({ cwd, rule: 'Plan only' });
    expect(r.selector).toBe('rule');
    if (r.selector !== 'rule') return;
    expect(r.text.startsWith('### [MUST] Plan only')).toBe(true);
    expect(r.rules).toEqual([{ name: 'Plan only', check_id: null, coverage: null }]);
  });

  it('refuses an unreadable Constitution — there is no full text to fall back to', async () => {
    vol.unlinkSync('/repo/prospec/CONSTITUTION.md');
    await expect(execute({ cwd, station: 'plan' })).rejects.toThrow(PrerequisiteError);
    await expect(execute({ cwd, station: 'plan' })).rejects.toThrow(/prospec\/CONSTITUTION\.md/);
  });

  it('refuses a Constitution resolved outside the repository', async () => {
    vol.writeFileSync('/repo/.prospec.yaml', 'version: 1.0.0\nproject:\n  name: demo\npaths:\n  base_dir: ../outside\n');
    vol.mkdirSync('/outside', { recursive: true });
    vol.writeFileSync('/outside/CONSTITUTION.md', CONSTITUTION);
    await expect(execute({ cwd, station: 'plan' })).rejects.toThrow(PrerequisiteError);
  });

  it('refuses an unknown station, listing the valid ones', async () => {
    const err = await execute({ cwd, station: 'learn' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PrerequisiteError);
    expect((err as PrerequisiteError).message).toContain('"learn"');
    expect((err as PrerequisiteError).suggestion).toContain('story, plan');
  });

  it('refuses a rule miss, listing the available rule names', async () => {
    const err = await execute({ cwd, rule: 'Nope' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PrerequisiteError);
    expect((err as PrerequisiteError).suggestion).toContain('Everywhere, Plan only, Verify only');
  });

  it('refuses when neither or both selectors are given, naming the two flags', async () => {
    for (const options of [{ cwd }, { cwd, station: 'plan', rule: 'Everywhere' }]) {
      const err = await execute(options).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PrerequisiteError);
      expect((err as PrerequisiteError).message).toContain('--station');
      expect((err as PrerequisiteError).message).toContain('--rule');
    }
  });
});
