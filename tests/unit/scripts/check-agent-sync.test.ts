import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AGENT_DIRS,
  GENERATED_FILES,
  REGENERATE_STEPS,
  checkGeneratedArtifacts,
  diffFingerprints,
  fingerprint,
} from '../../../scripts/check-agent-sync.js';

/**
 * The gate that catches "template edited, artifacts never regenerated".
 *
 * Its first draft ran only `agent sync`, which renders from `BUNDLED_TEMPLATES`
 * and never reads `src/templates/` — so a template edit without `pnpm bundle`
 * passed it green, which is the exact failure the gate was written for. Nothing
 * would have gone red on that: the guard had no guard. Hence the baseline test
 * below on the step list, and behavioural tests on the comparison itself.
 */
describe('check-agent-sync — the regeneration pipeline is pinned', () => {
  // An item-set against a version-controlled literal, not a property derived from
  // the constant. Dropping the bundle step re-blinds the gate silently, and this
  // is the only thing that would notice.
  it('runs BOTH hops, bundle before sync', () => {
    expect(REGENERATE_STEPS.map((s) => [...s])).toEqual([
      ['npx', 'tsx', 'scripts/bundle.ts'],
      ['npx', 'tsx', 'src/cli/index.ts', 'agent', 'sync'],
    ]);
  });

  it('covers the deployed trees AND the bundle output', () => {
    expect([...AGENT_DIRS]).toEqual(['.claude', '.agents']);
    expect([...GENERATED_FILES]).toEqual(['src/lib/bundled-templates.ts']);
  });
});

describe('check-agent-sync — the staleness comparison', () => {
  let tmp: string;
  const targets = { dirs: ['deployed'], files: ['bundle.ts'] };

  const write = (rel: string, body: string): void => {
    const abs = path.join(tmp, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  };

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'agent-sync-check-'));
    write('deployed/skills/a/SKILL.md', 'a\n');
    write('deployed/skills/b/SKILL.md', 'b\n');
    write('bundle.ts', 'export const X = 1;\n');
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('reports nothing when regeneration is a no-op', () => {
    const r = checkGeneratedArtifacts(targets, () => undefined, tmp);
    expect(r.changed).toEqual([]);
    expect(r.total).toBe(3);
  });

  it('reports a file whose content the regeneration rewrote', () => {
    const r = checkGeneratedArtifacts(
      targets,
      () => write('deployed/skills/a/SKILL.md', 'a REGENERATED\n'),
      tmp,
    );
    expect(r.changed).toEqual(['changed deployed/skills/a/SKILL.md']);
  });

  // The hop that used to be missing: the bundle output is a first-class target,
  // so a regeneration that only touches it is still a failure.
  it('reports the bundle output on its own', () => {
    const r = checkGeneratedArtifacts(targets, () => write('bundle.ts', 'export const X = 2;\n'), tmp);
    expect(r.changed).toEqual(['changed bundle.ts']);
  });

  it('reports a file the regeneration added', () => {
    const r = checkGeneratedArtifacts(targets, () => write('deployed/skills/c/SKILL.md', 'c\n'), tmp);
    expect(r.changed).toEqual(['added   deployed/skills/c/SKILL.md']);
  });

  it('reports a file the regeneration removed', () => {
    const r = checkGeneratedArtifacts(
      targets,
      () => rmSync(path.join(tmp, 'deployed/skills/b'), { recursive: true }),
      tmp,
    );
    expect(r.changed).toEqual(['removed deployed/skills/b/SKILL.md']);
  });

  it('reports every difference in one verdict, sorted', () => {
    const r = checkGeneratedArtifacts(
      targets,
      () => {
        write('deployed/skills/a/SKILL.md', 'changed\n');
        write('deployed/skills/c/SKILL.md', 'new\n');
        rmSync(path.join(tmp, 'deployed/skills/b'), { recursive: true });
      },
      tmp,
    );
    expect(r.changed).toEqual([
      'added   deployed/skills/c/SKILL.md',
      'changed deployed/skills/a/SKILL.md',
      'removed deployed/skills/b/SKILL.md',
    ]);
  });

  it('walks nested directories rather than only the top level', () => {
    write('deployed/skills/a/references/r.md', 'r\n');
    const r = checkGeneratedArtifacts(
      targets,
      () => write('deployed/skills/a/references/r.md', 'r2\n'),
      tmp,
    );
    expect(r.changed).toEqual(['changed deployed/skills/a/references/r.md']);
  });

  it('treats an absent target as empty rather than throwing', () => {
    const r = checkGeneratedArtifacts({ dirs: ['nope'], files: ['gone.ts'] }, () => undefined, tmp);
    expect(r).toEqual({ changed: [], total: 0 });
  });

  // An unreadable file must not abort the verdict for every other file — the same
  // rule the drift collectors follow.
  it.skipIf(process.getuid?.() === 0)('records an unreadable file instead of throwing', () => {
    const abs = path.join(tmp, 'deployed/skills/a/SKILL.md');
    chmodSync(abs, 0o000);
    const fp = fingerprint(targets, tmp);
    chmodSync(abs, 0o644);
    expect(fp.get('deployed/skills/a/SKILL.md')).toBe('UNREADABLE');
    expect(fp.size).toBe(3);
  });

  it('sorts a mixed diff deterministically regardless of map order', () => {
    const before = new Map([['z', '1'], ['a', '1']]);
    const after = new Map([['a', '2']]);
    expect(diffFingerprints(before, after)).toEqual(['changed a', 'removed z']);
  });
});
