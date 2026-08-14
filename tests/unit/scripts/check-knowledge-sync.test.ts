import { describe, it, expect } from 'vitest';
import { partitionMissingSync } from '../../../scripts/check-knowledge-sync.js';
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
