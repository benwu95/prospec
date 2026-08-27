import { describe, it, expect } from 'vitest';
import {
  partitionMissingSync,
  evaluateSyncGate,
  renderOutcome,
} from '../../../scripts/check-knowledge-sync.js';
import type { ModuleMap } from '../../../src/types/module-map.js';

const map = (
  mods: Array<{ name: string; paths: string[]; last_verified?: string }>,
): ModuleMap => ({
  modules: mods.map((m) => ({
    name: m.name,
    paths: m.paths,
    keywords: [],
    last_verified: m.last_verified,
  })),
});

const BASE = map([
  { name: 'lib', paths: ['src/lib'], last_verified: '2026-01-01T00:00:00Z' },
  { name: 'cli', paths: ['src/cli'], last_verified: '2026-01-01T00:00:00Z' },
]);

describe('partitionMissingSync (REQ-TESTS-088)', () => {
  it('flags a module whose src changed but last_verified did not bump', () => {
    const r = partitionMissingSync(['src/lib/foo.ts'], BASE, BASE);
    expect(r.srcModules).toEqual(['lib']);
    expect(r.missing).toEqual(['lib']);
  });

  it('passes a module whose src changed and last_verified bumped', () => {
    const head = map([
      { name: 'lib', paths: ['src/lib'], last_verified: '2026-08-14T00:00:00Z' },
      { name: 'cli', paths: ['src/cli'], last_verified: '2026-01-01T00:00:00Z' },
    ]);
    const r = partitionMissingSync(['src/lib/foo.ts'], BASE, head);
    expect(r.bumped).toEqual(['lib']);
    expect(r.missing).toEqual([]);
  });

  it('flags only the unbumped module when several sources changed', () => {
    const head = map([
      { name: 'lib', paths: ['src/lib'], last_verified: '2026-08-14T00:00:00Z' },
      { name: 'cli', paths: ['src/cli'], last_verified: '2026-01-01T00:00:00Z' },
    ]);
    const r = partitionMissingSync(['src/lib/a.ts', 'src/cli/b.ts'], BASE, head);
    expect(r.missing).toEqual(['cli']);
  });

  it('ignores non-module paths (scripts, docs, knowledge)', () => {
    const r = partitionMissingSync(
      ['scripts/x.ts', 'README.md', 'prospec/ai-knowledge/modules/lib/README.md'],
      BASE,
      BASE,
    );
    expect(r.srcModules).toEqual([]);
    expect(r.missing).toEqual([]);
  });

  it('does not count a cleared stamp as a bump (still flags the module)', () => {
    const head = map([
      { name: 'lib', paths: ['src/lib'] }, // last_verified cleared vs BASE
      { name: 'cli', paths: ['src/cli'], last_verified: '2026-01-01T00:00:00Z' },
    ]);
    expect(partitionMissingSync(['src/lib/foo.ts'], BASE, head).missing).toEqual(['lib']);
  });

  it('does not count a backdated or unparseable stamp as a bump', () => {
    const backdated = map([
      { name: 'lib', paths: ['src/lib'], last_verified: '2025-06-01T00:00:00Z' }, // earlier than BASE
      { name: 'cli', paths: ['src/cli'], last_verified: '2026-01-01T00:00:00Z' },
    ]);
    expect(partitionMissingSync(['src/lib/foo.ts'], BASE, backdated).missing).toEqual(['lib']);

    const garbage = map([
      { name: 'lib', paths: ['src/lib'], last_verified: 'not-a-date' },
      { name: 'cli', paths: ['src/cli'], last_verified: '2026-01-01T00:00:00Z' },
    ]);
    expect(partitionMissingSync(['src/lib/foo.ts'], BASE, garbage).missing).toEqual(['lib']);
  });

  it('flags a newly-added module only when it is left unstamped', () => {
    const withNew = (last_verified?: string): ModuleMap =>
      map([
        { name: 'lib', paths: ['src/lib'], last_verified: '2026-01-01T00:00:00Z' },
        { name: 'cli', paths: ['src/cli'], last_verified: '2026-01-01T00:00:00Z' },
        { name: 'newmod', paths: ['src/newmod'], last_verified },
      ]);

    expect(
      partitionMissingSync(['src/newmod/x.ts'], BASE, withNew('2026-08-14T00:00:00Z')).missing,
    ).toEqual([]);
    expect(partitionMissingSync(['src/newmod/x.ts'], BASE, withNew(undefined)).missing).toEqual([
      'newmod',
    ]);
  });
});

describe('evaluateSyncGate (REQ-TESTS-098)', () => {
  it('reports an empty commit range as a distinct skip, not a confirmed pass', () => {
    // HEAD == merge-base (nothing committed yet): the pre-feature-commit state that
    // used to print "0 source-touched module(s) all confirmed" — a false green.
    expect(evaluateSyncGate([], BASE, BASE)).toEqual({ kind: 'empty-range' });
  });

  it('reports confirmed when a non-empty range has every source-touched module stamped', () => {
    const head = map([
      { name: 'lib', paths: ['src/lib'], last_verified: '2026-08-14T00:00:00Z' },
      { name: 'cli', paths: ['src/cli'], last_verified: '2026-01-01T00:00:00Z' },
    ]);
    expect(evaluateSyncGate(['src/lib/foo.ts'], BASE, head)).toEqual({
      kind: 'confirmed',
      srcModules: ['lib'],
    });
  });

  it('reports a violation naming the unbumped module', () => {
    expect(evaluateSyncGate(['src/lib/foo.ts'], BASE, BASE)).toEqual({
      kind: 'violation',
      missing: ['lib'],
    });
  });

  it('a non-empty range touching only unclaimed paths is confirmed with zero src modules — NOT empty-range', () => {
    const outcome = evaluateSyncGate(['scripts/x.ts', 'README.md'], BASE, BASE);
    expect(outcome).toEqual({ kind: 'confirmed', srcModules: [] });
  });
});

describe('renderOutcome (REQ-TESTS-098)', () => {
  const BASE_SHA = 'abcdef0123456789';

  it('empty-range renders a distinct skip on stdout, exit 0, NOT the all-confirmed line', () => {
    const r = renderOutcome({ kind: 'empty-range' }, BASE_SHA);
    expect(r.stream).toBe('stdout');
    expect(r.exitCode).toBe(0);
    expect(r.message).toContain('skipped');
    expect(r.message).toContain('Commit the change first');
    expect(r.message).not.toContain('all confirmed');
  });

  it('confirmed renders the all-confirmed line on stdout, exit 0', () => {
    const r = renderOutcome({ kind: 'confirmed', srcModules: ['lib'] }, BASE_SHA);
    expect(r.stream).toBe('stdout');
    expect(r.exitCode).toBe(0);
    expect(r.message).toContain('all confirmed');
    expect(r.message).toContain('1 source-touched');
  });

  it('violation renders on stderr, exit 1, naming each unbumped module', () => {
    const r = renderOutcome({ kind: 'violation', missing: ['lib', 'cli'] }, BASE_SHA);
    expect(r.stream).toBe('stderr');
    expect(r.exitCode).toBe(1);
    expect(r.message).toContain('lib — run `prospec knowledge verify lib`');
    expect(r.message).toContain('cli — run `prospec knowledge verify cli`');
  });
});
