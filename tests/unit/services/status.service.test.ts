import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { vol } from 'memfs';
import { execute } from '../../../src/services/status.service.js';
import { collectGitTimestamps } from '../../../src/lib/drift-sources.js';
import type { ChangeRouteFacts } from '../../../src/types/status.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

/**
 * The facts this service hands the router, captured per call.
 *
 * Asserting on the returned `ChangeRoute` cannot see what the service produced:
 * `routeChange` spreads `issue` conditionally itself, so it absorbs a service
 * that writes the key unconditionally (with `issue: undefined`) and the route
 * comes out identical either way. Delegating to the real router keeps every
 * other test in this file black-box.
 */
const { routedFacts } = vi.hoisted(() => ({ routedFacts: [] as ChangeRouteFacts[] }));

vi.mock('../../../src/lib/status-router.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/status-router.js')>();
  return {
    ...actual,
    routeChange: (facts: ChangeRouteFacts) => {
      routedFacts.push(facts);
      return actual.routeChange(facts);
    },
  };
});

vi.mock('../../../src/lib/drift-sources.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/drift-sources.js')>();
  return {
    ...actual,
    collectGitTimestamps: vi.fn((...args: Parameters<typeof actual.collectGitTimestamps>) =>
      actual.collectGitTimestamps(...args),
    ),
  };
});

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  routedFacts.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const CWD = '/project';

function metadataYaml(fields: { name: string; status: string; scale?: string; extra?: string }): string {
  return (
    `name: ${fields.name}\n` +
    `created_at: 2026-01-01T00:00:00.000Z\n` +
    `status: ${fields.status}\n` +
    (fields.scale === undefined ? '' : `scale: ${fields.scale}\n`) +
    (fields.extra ?? '')
  );
}

describe('status.service — clean states', () => {
  it('reports clean when .prospec/changes/ does not exist', async () => {
    vol.fromJSON({ [`${CWD}/.prospec.yaml`]: 'project:\n  name: test\n' });
    const report = await execute({ cwd: CWD });
    expect(report.clean).toBe(true);
    expect(report.changes).toEqual([]);
    expect(report.errors).toEqual([]);
  });

  it('reports clean when the changes directory is empty', async () => {
    vol.fromJSON({ [`${CWD}/.prospec/changes/.gitkeep`]: '' });
    const report = await execute({ cwd: CWD });
    expect(report.clean).toBe(true);
  });

  it('excludes archived changes — archived-only is clean', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/old-change/metadata.yaml`]: metadataYaml({
        name: 'old-change',
        status: 'archived',
      }),
    });
    const report = await execute({ cwd: CWD });
    expect(report.clean).toBe(true);
    expect(report.changes).toEqual([]);
  });
});

describe('status.service — routing in-flight changes', () => {
  it('routes a standard change at plan to tasks', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({
        name: 'add-auth',
        status: 'plan',
      }),
    });
    const report = await execute({ cwd: CWD });
    expect(report.clean).toBe(false);
    expect(report.changes).toHaveLength(1);
    expect(report.changes[0]).toMatchObject({
      name: 'add-auth',
      status: 'plan',
      scale: 'standard', // absent scale resolves to standard
      current: 'plan',
      next: 'tasks',
    });
  });

  it('routes multiple in-flight changes, sorted by name', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/b-change/metadata.yaml`]: metadataYaml({
        name: 'b-change',
        status: 'story',
        scale: 'quick',
      }),
      [`${CWD}/.prospec/changes/a-change/metadata.yaml`]: metadataYaml({
        name: 'a-change',
        status: 'verified',
      }),
    });
    const report = await execute({ cwd: CWD });
    expect(report.changes.map((c) => c.name)).toEqual(['a-change', 'b-change']);
    expect(report.changes[0]?.next).toBe('archive');
    expect(report.changes[1]?.next).toBe('tasks'); // quick legal skip
  });

  it('counts only code tasks for the implement gate ([M]/[V] excluded)', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({
        name: 'add-auth',
        status: 'tasks',
      }),
      [`${CWD}/.prospec/changes/add-auth/tasks.md`]: [
        '- [x] T1 code task done',
        '- [ ] T2 code task pending',
        '- [ ] T3 [M] manual task never counted',
        '- [x] T4 [V] verification task never counted',
        'not a task line',
      ].join('\n'),
    });
    const report = await execute({ cwd: CWD });
    expect(report.changes[0]?.blockingGates.join(' ')).toContain('1/2');
  });

  // The router's gate is only as good as the task grammar it is fed: under CRLF
  // every checkbox line used to miss, so a half-done task list routed as if it
  // held no code tasks at all.
  it('counts the same code tasks whether tasks.md is LF or CRLF', async () => {
    const TASKS = [
      '- [x] T1 code task done',
      '- [ ] T2 code task pending',
      '- [ ] T3 [M] manual task never counted',
      '- [x] T4 [V] verification task never counted',
    ].join('\n');

    const factsFor = async (tasks: string): Promise<ChangeRouteFacts> => {
      vol.reset();
      routedFacts.length = 0;
      vol.fromJSON({
        [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({
          name: 'add-auth',
          status: 'tasks',
        }),
        [`${CWD}/.prospec/changes/add-auth/tasks.md`]: tasks,
      });
      await execute({ cwd: CWD });
      return routedFacts[0]!;
    };

    const lf = await factsFor(TASKS);
    const crlf = await factsFor(TASKS.replace(/\n/g, '\r\n'));
    expect(crlf).toEqual(lf);
    // Anti-vacuity: an empty count would make the two sides agree on nothing.
    expect(lf).toMatchObject({ codeTasksTotal: 2, codeTasksDone: 1 });
  });

  it('inserts the design station when proposal.md declares ui_scope full at plan', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/add-ui/metadata.yaml`]: metadataYaml({
        name: 'add-ui',
        status: 'plan',
      }),
      [`${CWD}/.prospec/changes/add-ui/proposal.md`]:
        '# Proposal\n\n## UI Scope\n\n**Scope:** full\n',
    });
    const report = await execute({ cwd: CWD });
    expect(report.changes[0]?.next).toBe('design');
  });

  it('treats the unfilled proposal-format placeholder as no declared ui_scope', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/add-y/metadata.yaml`]: metadataYaml({
        name: 'add-y',
        status: 'plan',
      }),
      // The literal placeholder snippet from the proposal-format reference —
      // no value was chosen, so design must NOT engage.
      [`${CWD}/.prospec/changes/add-y/proposal.md`]:
        '# Proposal\n\n## UI Scope\n\n**Scope:** full | partial | none\n',
    });
    const report = await execute({ cwd: CWD });
    expect(report.changes[0]?.next).toBe('tasks');
  });

  it('does not read a Scope line outside the UI Scope section', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/add-x/metadata.yaml`]: metadataYaml({
        name: 'add-x',
        status: 'plan',
      }),
      [`${CWD}/.prospec/changes/add-x/proposal.md`]:
        '# Proposal\n\n## UI Scope\n\nnothing declared here\n\n## Notes\n\n**Scope:** full\n',
    });
    const report = await execute({ cwd: CWD });
    expect(report.changes[0]?.next).toBe('tasks');
  });

  it('routes implemented → verify when review_provenance exists, with the last verify grade', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({
        name: 'add-auth',
        status: 'implemented',
        extra:
          'review_provenance:\n  digest: abc123\n  date: 2026-01-02\n' +
          'quality_log:\n' +
          '  - skill: prospec-verify\n    date: 2026-01-02\n    result: WARN\n    warnings: []\n    grade: B\n',
      }),
    });
    const report = await execute({ cwd: CWD });
    expect(report.changes[0]?.next).toBe('verify');
    expect(report.changes[0]?.reasons.join(' ')).toContain('grade B did not advance');
  });

  it('routes a backfill change at implemented as a legal entry', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/doc-legacy/metadata.yaml`]: metadataYaml({
        name: 'doc-legacy',
        status: 'implemented',
        scale: 'backfill',
      }),
    });
    const report = await execute({ cwd: CWD });
    expect(report.changes[0]?.next).toBe('review');
    expect(report.changes[0]?.reasons.join(' ')).toContain('legal lifecycle entry');
  });
});

describe('status.service — unresolved warnings (issue #228)', () => {
  it('surfaces each warning of a skill whose latest quality_log entry is WARN', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({
        name: 'add-auth',
        status: 'tasks',
        extra:
          'quality_log:\n' +
          '  - skill: prospec-plan\n    date: 2026-01-02\n    result: WARN\n' +
          '    warnings:\n      - sizing note\n      - dep risk\n',
      }),
    });
    const report = await execute({ cwd: CWD });
    expect(routedFacts[0]?.unresolvedWarnings).toEqual([
      { skill: 'prospec-plan', warning: 'sizing note', date: '2026-01-02' },
      { skill: 'prospec-plan', warning: 'dep risk', date: '2026-01-02' },
    ]);
    expect(report.changes[0]?.unresolvedWarnings).toHaveLength(2);
  });

  it('drops a WARN once the same skill later records a non-WARN result', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({
        name: 'add-auth',
        status: 'tasks',
        extra:
          'quality_log:\n' +
          '  - skill: prospec-plan\n    date: 2026-01-02\n    result: WARN\n' +
          '    warnings:\n      - sizing note\n' +
          '  - skill: prospec-plan\n    date: 2026-01-03\n    result: PASS\n    warnings: []\n',
      }),
    });
    const report = await execute({ cwd: CWD });
    expect(routedFacts[0]?.unresolvedWarnings).toEqual([]);
    // empty is stripped by the router (like `issue`), so the route omits the key
    expect(report.changes[0]?.unresolvedWarnings).toBeUndefined();
  });

  it('surfaces WARNs per skill independently', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({
        name: 'add-auth',
        status: 'implemented',
        extra:
          'review_provenance:\n  digest: abc\n  date: 2026-01-02\n' +
          'quality_log:\n' +
          '  - skill: prospec-tasks\n    date: 2026-01-02\n    result: PASS\n    warnings: []\n' +
          '  - skill: prospec-review\n    date: 2026-01-03\n    result: WARN\n' +
          '    warnings:\n      - major left\n',
      }),
    });
    await execute({ cwd: CWD });
    expect(routedFacts[0]?.unresolvedWarnings).toEqual([
      { skill: 'prospec-review', warning: 'major left', date: '2026-01-03' },
    ]);
  });

  it('is empty when there is no quality_log', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({
        name: 'add-auth',
        status: 'tasks',
      }),
    });
    await execute({ cwd: CWD });
    expect(routedFacts[0]?.unresolvedWarnings).toEqual([]);
  });
});

describe('status.service — malformed records are reported, never fatal', () => {
  it('names a change whose metadata fails the schema and still routes the rest', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/bad-change/metadata.yaml`]: metadataYaml({
        name: 'bad-change',
        status: 'not-a-status',
      }),
      [`${CWD}/.prospec/changes/good-change/metadata.yaml`]: metadataYaml({
        name: 'good-change',
        status: 'story',
      }),
    });
    const report = await execute({ cwd: CWD });
    expect(report.clean).toBe(false);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]?.name).toBe('bad-change');
    expect(report.errors[0]?.error).toContain('status');
    expect(report.changes.map((c) => c.name)).toEqual(['good-change']);
  });

  it('reports a change directory without metadata.yaml', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/no-metadata/proposal.md`]: '# Proposal\n',
    });
    const report = await execute({ cwd: CWD });
    expect(report.errors).toEqual([
      { name: 'no-metadata', error: 'metadata.yaml missing' },
    ]);
  });

  it('reports unparseable YAML as an error entry', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/bad-yaml/metadata.yaml`]: 'name: [unclosed\n  status:::\n',
    });
    const report = await execute({ cwd: CWD });
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]?.name).toBe('bad-yaml');
  });
});

describe('status.service — read-only purity', () => {
  it('leaves the filesystem byte-identical', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({
        name: 'add-auth',
        status: 'tasks',
      }),
      [`${CWD}/.prospec/changes/add-auth/tasks.md`]: '- [ ] T1 pending\n',
    });
    const before = vol.toJSON();
    await execute({ cwd: CWD });
    expect(vol.toJSON()).toEqual(before);
  });
});

describe('status.service — issue registration (issue #131)', () => {
  const changeWith = (extra?: string) => ({
    [`${CWD}/.prospec/changes/add-widget/metadata.yaml`]: metadataYaml({
      name: 'add-widget',
      status: 'plan',
      ...(extra === undefined ? {} : { extra }),
    }),
  });

  it('carries a registered issue reference into the facts and out to the route', async () => {
    vol.fromJSON(changeWith('issue: "#131"\n'));
    const report = await execute({ cwd: CWD });
    expect(routedFacts).toHaveLength(1);
    expect(routedFacts[0]?.issue).toBe('#131');
    expect(report.changes[0]?.issue).toBe('#131');
  });

  // Asserted on the FACTS, not the route: the router drops an `issue:
  // undefined` of its own accord, so a route-level assertion passes even when
  // this service writes the key unconditionally (mutation-verified — replacing
  // the conditional spread in collectFacts with `issue: metadata.issue` turns
  // this test red, and left the route-level version green).
  it('omits the key from the facts for a change that registered none', async () => {
    vol.fromJSON(changeWith());
    const report = await execute({ cwd: CWD });
    expect(routedFacts).toHaveLength(1);
    expect(Object.hasOwn(routedFacts[0] as object, 'issue')).toBe(false);
    expect(Object.hasOwn(report.changes[0] as object, 'issue')).toBe(false);
  });

  // A blank registration is not a registration: the schema is `z.string()`
  // with no floor, so `issue: ""` parses, and every reader must agree it means
  // unregistered (the archive summary already does).
  it.each(['issue: ""\n', "issue: '   '\n"])(
    'treats a blank registration (%j) as absent',
    async (extra) => {
      vol.fromJSON(changeWith(extra));
      await execute({ cwd: CWD });
      expect(routedFacts).toHaveLength(1);
      expect(Object.hasOwn(routedFacts[0] as object, 'issue')).toBe(false);
    },
  );
});

describe('status.service — knowledge-aware routing at verified', () => {
  it('routes verified to archive when change has no affected modules', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/a-change/metadata.yaml`]: metadataYaml({
        name: 'a-change',
        status: 'verified',
      }),
    });
    const report = await execute({ cwd: CWD });
    expect(report.changes[0]?.next).toBe('archive');
    expect(routedFacts[0]?.hasKnowledgeSync).toBe(true);
  });

  it('routes verified to knowledge-update when affected module is missing in module-map.yaml', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/a-change/metadata.yaml`]: metadataYaml({
        name: 'a-change',
        status: 'verified',
        extra: 'related_modules:\n  - missing-module\n',
      }),
      [`${CWD}/prospec/ai-knowledge/module-map.yaml`]:
        'modules:\n  - name: types\n    paths: [src/types]\n    keywords: [types]\n',
    });
    const report = await execute({ cwd: CWD });
    expect(report.changes[0]?.next).toBe('knowledge-update');
    expect(routedFacts[0]?.hasKnowledgeSync).toBe(false);
  });

  it('routes verified to knowledge-update when affected module lacks last_verified', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/a-change/metadata.yaml`]: metadataYaml({
        name: 'a-change',
        status: 'verified',
        extra: 'related_modules:\n  - types\n',
      }),
      [`${CWD}/prospec/ai-knowledge/module-map.yaml`]:
        'modules:\n  - name: types\n    paths: [src/types]\n    keywords: [types]\n',
      [`${CWD}/prospec/ai-knowledge/modules/types/README.md`]: '# Types\n',
    });
    const report = await execute({ cwd: CWD });
    expect(report.changes[0]?.next).toBe('knowledge-update');
    expect(routedFacts[0]?.hasKnowledgeSync).toBe(false);
  });

  it('routes verified to knowledge-update when affected module README is missing', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/a-change/metadata.yaml`]: metadataYaml({
        name: 'a-change',
        status: 'verified',
        extra: 'related_modules:\n  - types\n',
      }),
      [`${CWD}/prospec/ai-knowledge/module-map.yaml`]:
        'modules:\n  - name: types\n    paths: [src/types]\n    keywords: [types]\n    last_verified: "2026-01-01T00:00:00Z"\n',
    });
    const report = await execute({ cwd: CWD });
    expect(report.changes[0]?.next).toBe('knowledge-update');
    expect(routedFacts[0]?.hasKnowledgeSync).toBe(false);
  });

  it('gathers git timestamps for only the affected modules, not the whole map (REQ-LIB-070)', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/a-change/metadata.yaml`]: metadataYaml({
        name: 'a-change',
        status: 'verified',
        extra: 'related_modules:\n  - types\n',
      }),
      [`${CWD}/prospec/ai-knowledge/module-map.yaml`]:
        'modules:\n' +
        '  - name: types\n    paths: [src/types]\n    keywords: [types]\n    last_verified: "2026-01-01T00:00:00Z"\n' +
        '  - name: lib\n    paths: [src/lib]\n    keywords: [lib]\n    last_verified: "2026-01-01T00:00:00Z"\n',
      [`${CWD}/prospec/ai-knowledge/modules/types/README.md`]: '# Types\n',
      [`${CWD}/prospec/ai-knowledge/modules/lib/README.md`]: '# Lib\n',
    });
    await execute({ cwd: CWD });
    const mock = vi.mocked(collectGitTimestamps);
    expect(mock).toHaveBeenCalled();
    // The map handed to the collector carries the affected module ONLY — the sibling
    // `lib` in the map must not be walked for a change that never touched it.
    expect(mock.mock.calls[0]?.[1].modules.map((m) => m.name)).toEqual(['types']);
  });

  it('routes verified to archive when all affected modules are verified with README', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/a-change/metadata.yaml`]: metadataYaml({
        name: 'a-change',
        status: 'verified',
        extra: 'related_modules:\n  - types\n',
      }),
      [`${CWD}/prospec/ai-knowledge/module-map.yaml`]:
        'modules:\n  - name: types\n    paths: [src/types]\n    keywords: [types]\n    last_verified: "2026-01-01T00:00:00Z"\n',
      [`${CWD}/prospec/ai-knowledge/modules/types/README.md`]: '# Types\n',
    });
    const report = await execute({ cwd: CWD });
    expect(report.changes[0]?.next).toBe('archive');
    expect(routedFacts[0]?.hasKnowledgeSync).toBe(true);
  });

  it('derives affected modules from delta-spec.md when related_modules is omitted', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/a-change/metadata.yaml`]: metadataYaml({
        name: 'a-change',
        status: 'verified',
      }),
      [`${CWD}/.prospec/changes/a-change/delta-spec.md`]: [
        '# Delta Spec',
        '## ADDED',
        '### REQ-TYPES-099: New Type Requirement',
        '**Feature:** types',
        '**Story:** US-1',
        '**Spec:** New type contract.',
      ].join('\n'),
      [`${CWD}/prospec/ai-knowledge/module-map.yaml`]:
        'modules:\n  - name: types\n    paths: [src/types]\n    keywords: [types]\n    last_verified: "2026-01-01T00:00:00Z"\n',
      [`${CWD}/prospec/ai-knowledge/modules/types/README.md`]: '# Types\n',
    });
    const report = await execute({ cwd: CWD });
    expect(report.changes[0]?.next).toBe('archive');
    expect(routedFacts[0]?.hasKnowledgeSync).toBe(true);
  });

  it('routes verified to knowledge-update when git timestamp indicates stale module knowledge', async () => {
    const { collectGitTimestamps } = await import('../../../src/lib/drift-sources.js');
    vi.mocked(collectGitTimestamps).mockReturnValueOnce({
      available: true,
      modules: [
        {
          name: 'types',
          readme_path: 'prospec/ai-knowledge/modules/types/README.md',
          readme_exists: true,
          last_src_commit: '2026-01-05T00:00:00Z',
          last_readme_commit: '2026-01-01T00:00:00Z',
          last_sub_module_commit: null,
          last_verified: '2026-01-01T00:00:00Z',
        },
      ],
    });

    vol.fromJSON({
      [`${CWD}/.prospec/changes/a-change/metadata.yaml`]: metadataYaml({
        name: 'a-change',
        status: 'verified',
        extra: 'related_modules:\n  - types\n',
      }),
      [`${CWD}/prospec/ai-knowledge/module-map.yaml`]:
        'modules:\n  - name: types\n    paths: [src/types]\n    keywords: [types]\n    last_verified: "2026-01-01T00:00:00Z"\n',
      [`${CWD}/prospec/ai-knowledge/modules/types/README.md`]: '# Types\n',
    });

    const report = await execute({ cwd: CWD });
    expect(report.changes[0]?.next).toBe('knowledge-update');
    expect(routedFacts[0]?.hasKnowledgeSync).toBe(false);
  });

  it('routes verified to archive when git timestamps confirm module knowledge is fresh', async () => {
    const { collectGitTimestamps } = await import('../../../src/lib/drift-sources.js');
    vi.mocked(collectGitTimestamps).mockReturnValueOnce({
      available: true,
      modules: [
        {
          name: 'types',
          readme_path: 'prospec/ai-knowledge/modules/types/README.md',
          readme_exists: true,
          last_src_commit: '2026-01-01T00:00:00Z',
          last_readme_commit: '2026-01-01T00:00:00Z',
          last_sub_module_commit: null,
          last_verified: '2026-01-01T00:00:00Z',
        },
      ],
    });

    vol.fromJSON({
      [`${CWD}/.prospec/changes/a-change/metadata.yaml`]: metadataYaml({
        name: 'a-change',
        status: 'verified',
        extra: 'related_modules:\n  - types\n',
      }),
      [`${CWD}/prospec/ai-knowledge/module-map.yaml`]:
        'modules:\n  - name: types\n    paths: [src/types]\n    keywords: [types]\n    last_verified: "2026-01-01T00:00:00Z"\n',
      [`${CWD}/prospec/ai-knowledge/modules/types/README.md`]: '# Types\n',
    });

    const report = await execute({ cwd: CWD });
    expect(report.changes[0]?.next).toBe('archive');
    expect(routedFacts[0]?.hasKnowledgeSync).toBe(true);
  });

  it('routes verified to knowledge-update when last_verified is an unparseable date', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/a-change/metadata.yaml`]: metadataYaml({
        name: 'a-change',
        status: 'verified',
        extra: 'related_modules:\n  - types\n',
      }),
      [`${CWD}/prospec/ai-knowledge/module-map.yaml`]:
        'modules:\n  - name: types\n    paths: [src/types]\n    keywords: [types]\n    last_verified: "not-a-date"\n',
      [`${CWD}/prospec/ai-knowledge/modules/types/README.md`]: '# Types\n',
    });

    const report = await execute({ cwd: CWD });
    expect(report.changes[0]?.next).toBe('knowledge-update');
    expect(routedFacts[0]?.hasKnowledgeSync).toBe(false);
  });
});

describe('status.service — actionable skill path (REQ-SERVICES-092)', () => {
  it('sets nextSkillPath from the first configured agent', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec.yaml`]: 'project:\n  name: test\nagents:\n  - claude\n',
      [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({
        name: 'add-auth',
        status: 'plan',
      }),
    });
    const report = await execute({ cwd: CWD });
    expect(report.changes[0]?.next).toBe('tasks');
    expect(report.changes[0]?.nextSkillPath).toBe('.claude/skills/prospec-tasks/SKILL.md');
  });

  it('leaves nextSkillPath absent when no agent is configured (never a hardcoded dir)', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec.yaml`]: 'project:\n  name: test\n',
      [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({
        name: 'add-auth',
        status: 'plan',
      }),
    });
    const report = await execute({ cwd: CWD });
    expect(report.changes[0]?.nextSkillPath).toBeUndefined();
  });

  it('sets the canonical skill identity beside the path (REQ-SERVICES-092)', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec.yaml`]: 'project:\n  name: test\nagents:\n  - claude\n',
      [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({
        name: 'add-auth',
        status: 'plan',
      }),
    });
    const report = await execute({ cwd: CWD });
    expect(report.changes[0]?.nextSkill).toBe('prospec-tasks');
    expect(report.changes[0]?.nextSkillPath).toBe('.claude/skills/prospec-tasks/SKILL.md');
  });

  it('keeps the identity when no agent is configured — only the fallback path is lost', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec.yaml`]: 'project:\n  name: test\n',
      [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({
        name: 'add-auth',
        status: 'plan',
      }),
    });
    const report = await execute({ cwd: CWD });
    expect(report.changes[0]?.nextSkill).toBe('prospec-tasks');
    expect(report.changes[0]?.nextSkillPath).toBeUndefined();
  });

  it('keeps the identity when the config cannot be read at all', async () => {
    // A malformed .prospec.yaml costs the deployment root, not the station: the
    // identity comes from the route, which is computed from the change itself.
    vol.fromJSON({
      [`${CWD}/.prospec.yaml`]: 'project: [unclosed\n',
      [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({
        name: 'add-auth',
        status: 'plan',
      }),
    });
    const report = await execute({ cwd: CWD });
    expect(report.changes[0]?.next).toBe('tasks');
    expect(report.changes[0]?.nextSkill).toBe('prospec-tasks');
    expect(report.changes[0]?.nextSkillPath).toBeUndefined();
  });

  it('names the identity of every station it routes to, and none at a terminal route', async () => {
    // Walk the statuses the router places differently, so an identity wired to one
    // station (or to the path resolver's station) cannot pass by coincidence.
    for (const [status, skill] of [
      ['story', 'prospec-plan'],
      ['plan', 'prospec-tasks'],
      ['tasks', 'prospec-implement'],
      ['implemented', 'prospec-review'],
    ] as const) {
      vol.reset();
      vol.fromJSON({
        [`${CWD}/.prospec.yaml`]: 'project:\n  name: test\nagents:\n  - claude\n',
        [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({ name: 'add-auth', status }),
      });
      const report = await execute({ cwd: CWD });
      expect(report.changes[0]?.nextSkill, status).toBe(skill);
    }
    // An archived change is not reported at all — there is no station to name.
    vol.reset();
    vol.fromJSON({
      [`${CWD}/.prospec.yaml`]: 'project:\n  name: test\nagents:\n  - claude\n',
      [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({ name: 'add-auth', status: 'archived' }),
    });
    const archived = await execute({ cwd: CWD });
    expect(archived.changes).toHaveLength(0);
  });

  it('adds the identity without changing any routing verdict or touching the tree', async () => {
    const files = {
      [`${CWD}/.prospec.yaml`]: 'project:\n  name: test\nagents:\n  - claude\n',
      [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({
        name: 'add-auth',
        status: 'tasks',
      }),
    };
    vol.fromJSON(files);
    const before = vol.toJSON();
    const report = await execute({ cwd: CWD });
    const route = report.changes[0]!;
    // Identity is additive: strip it and the route is exactly what it was.
    const { nextSkill, ...rest } = route;
    expect(nextSkill).toBe('prospec-implement');
    expect(rest.current).toBe('tasks');
    expect(rest.next).toBe('implement');
    expect(rest.code).toBe('LIFECYCLE_NEXT');
    expect(rest.blockingGates.length).toBeGreaterThan(0);
    expect(vol.toJSON()).toEqual(before);
  });
});

/**
 * The next station's reference map (REQ-SERVICES-111). Additive: every routing
 * field keeps its meaning, and the map is absent — never invented — when there is
 * no station to route to or no agent to resolve a path against.
 */
describe('status.service — next-station reference map (REQ-SERVICES-111)', () => {
  const project = (options: { agents?: string; status: string; scale?: string; uiScope?: string }) => {
    const files: Record<string, string> = {
      [`${CWD}/.prospec.yaml`]: `project:\n  name: test\n${options.agents ?? ''}`,
      [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({
        name: 'add-auth',
        status: options.status,
        scale: options.scale,
      }),
    };
    if (options.uiScope !== undefined) {
      files[`${CWD}/.prospec/changes/add-auth/proposal.md`] = `# p\n\n## UI Scope\n\n**Scope:** ${options.uiScope}\n`;
    }
    vol.fromJSON(files);
  };

  it('lists the next station load points under the resolved host root', async () => {
    project({ agents: 'agents:\n  - claude\n', status: 'plan' });
    const report = await execute({ cwd: CWD });
    const route = report.changes[0]!;
    expect(route.next).toBe('tasks');
    expect(route.nextReferenceMap).toEqual([
      {
        phase: 'Startup Loading',
        referencePath: '.claude/skills/prospec-tasks/references/tasks-format.md',
        purpose: 'the tasks.md format and its task kind markers',
        loading: 'startup-mandatory',
      },
      {
        phase: 'Phase 3: Decompose by Architecture Layer',
        referencePath: '.claude/skills/prospec-tasks/references/tasks-format.md',
        purpose: 'the layer-order adaptation note the decomposition follows',
        loading: 'in-phase',
      },
      {
        phase: 'Phase 6: Task Contract & Verifier Audit',
        referencePath: '.claude/skills/prospec-tasks/references/tasks-verifier-rubric.md',
        purpose: 'the four audit dimensions and the receipt protocol',
        loading: 'in-phase',
      },
    ]);
  });

  it('uses the host root the action line resolved, not a hardcoded one', async () => {
    project({ agents: 'agents:\n  - codex\n', status: 'plan' });
    const report = await execute({ cwd: CWD });
    const route = report.changes[0]!;
    expect(route.nextSkillPath).toBe('.agents/skills/prospec-tasks/SKILL.md');
    for (const row of route.nextReferenceMap ?? []) {
      expect(row.referencePath.startsWith('.agents/skills/')).toBe(true);
    }
  });

  it('fabricates no path when the project configures no agent', async () => {
    project({ status: 'plan' });
    const route = (await execute({ cwd: CWD })).changes[0]!;
    expect(route.next).toBe('tasks');
    expect(route.nextSkillPath).toBeUndefined();
    expect(route.nextReferenceMap).toBeUndefined();
  });

  it('gives a reference-free next station an empty map, not a missing one', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec.yaml`]: 'project:\n  name: test\nagents:\n  - claude\n',
      [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({
        name: 'add-auth',
        status: 'verified',
        extra: 'related_modules:\n  - missing-module\n',
      }),
      [`${CWD}/prospec/ai-knowledge/module-map.yaml`]:
        'modules:\n  - name: types\n    paths: [src/types]\n    keywords: [types]\n',
    });
    const route = (await execute({ cwd: CWD })).changes[0]!;
    // prospec-knowledge-update ships no reference: an empty map, never an absent
    // one, so a reader can tell "nothing to read" from "nowhere to read it from".
    expect(route.next).toBe('knowledge-update');
    expect(route.nextReferenceMap).toEqual([]);
  });

  it.each([
    ['quick', 'tasks'],
    ['standard', 'tasks'],
    ['full', 'tasks'],
  ] as const)('routes %s to a map of the station it actually reaches', async (scale, next) => {
    project({ agents: 'agents:\n  - claude\n', status: 'plan', scale });
    const route = (await execute({ cwd: CWD })).changes[0]!;
    expect(route.next).toBe(next);
    expect((route.nextReferenceMap ?? []).length).toBeGreaterThan(0);
  });

  it('keeps a backfill station map to what backfill actually reads', async () => {
    const reviewed =
      'review_provenance:\n  digest: abc123\n  date: 2026-01-02\n';
    const at = (scale: string) =>
      vol.fromJSON({
        [`${CWD}/.prospec.yaml`]: 'project:\n  name: test\nagents:\n  - claude\n',
        [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({
          name: 'add-auth',
          status: 'implemented',
          scale,
          extra: reviewed,
        }),
      });

    at('backfill');
    const backfill = (await execute({ cwd: CWD })).changes[0]!;
    expect(backfill.next).toBe('verify');
    const backfillPhases = (backfill.nextReferenceMap ?? []).map((row) => row.phase);
    expect(backfillPhases).toContain('Entry Gate');

    vol.reset();
    at('standard');
    const standard = (await execute({ cwd: CWD })).changes[0]!;
    expect(standard.next).toBe('verify');
    const standardPhases = (standard.nextReferenceMap ?? []).map((row) => row.phase);
    expect(standardPhases).not.toContain('Entry Gate');
    // The backfill-only load points are the whole difference, and they are dropped
    // on a KNOWN scale rather than shown with a condition nobody can decide.
    expect(standardPhases.length).toBeLessThan(backfillPhases.length);
  });

  it.each(['full', 'partial', 'none'] as const)('keeps routing semantics for UI scope %s', async (uiScope) => {
    project({ agents: 'agents:\n  - claude\n', status: 'plan', uiScope });
    const route = (await execute({ cwd: CWD })).changes[0]!;
    expect(route.next).toBe(uiScope === 'none' ? 'tasks' : 'design');
    expect(Array.isArray(route.nextReferenceMap)).toBe(true);
  });
});

describe('status.service — the map costs the status path no renderer', () => {
  it('imports neither the template renderer nor the sync service', async () => {
    const { readFileSync } = await vi.importActual<typeof import('node:fs')>('node:fs');
    const source = readFileSync(
      new URL('../../../src/services/status.service.ts', import.meta.url),
      'utf8',
    );
    const specifiers = [...source.matchAll(/^import[^']*'([^']+)'/gm)].map((match) => match[1]!);
    expect(specifiers).not.toContain('../lib/template.js');
    expect(specifiers).not.toContain('./agent-sync.service.js');
    // The map comes from the pure projection, which owns no renderer either.
    expect(specifiers).toContain('../lib/skill-reference-map.js');
  });
});

describe('status.service — latest planning verifier result (REQ-SERVICES-070 / issue #266)', () => {
  const log = (entries: string) =>
    vol.fromJSON({
      [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({ name: 'add-auth', status: 'plan', extra: `quality_log:\n${entries}` }),
    });
  const entry = (skill: string, result: string, warnings: string[] = []) =>
    `  - skill: ${skill}\n    date: 2026-01-02\n    result: ${result}\n    warnings:${warnings.length === 0 ? ' []' : ''}\n` +
    warnings.map((w) => `      - "${w}"\n`).join('');
  // What `change log --verifier-report` writes: the gate result PLUS the verifier's
  // own verdict as the provenance stamp the reader keys on.
  const sinkEntry = (skill: string, verdict: 'PASS' | 'WARN' | 'FLAWS', warnings: string[] = []) =>
    entry(skill, verdict === 'FLAWS' ? 'FAIL' : verdict, warnings).replace(/\n {4}warnings:/, `\n    verifier_verdict: ${verdict}\n    warnings:`);

  it('reads a recorded FAIL and routes back to plan', async () => {
    log(sinkEntry('prospec-plan', 'FLAWS', ['reuse: owner bypassed']));
    const report = await execute({ cwd: CWD });
    expect(routedFacts[0]?.lastPlanVerifierResult).toBe('FAIL');
    expect(routedFacts[0]?.lastTasksVerifierResult).toBeNull();
    expect(report.changes[0]?.next).toBe('plan');
    expect(report.changes[0]?.code).toBe('PLAN_VERIFIER_FAILED');
  });

  it("an Exit Gate WARN appended after the verifier FAIL does not hide it", async () => {
    log(sinkEntry('prospec-plan', 'FLAWS', ['reuse: owner bypassed']) + entry('prospec-plan', 'WARN', ['dependency-direction: minor note']));
    await execute({ cwd: CWD });
    expect(routedFacts[0]?.lastPlanVerifierResult).toBe('FAIL');
  });

  // Review pin (C-1): a WARN verdict the sink recorded IS the latest verifier result —
  // it must supersede the earlier FAIL, unlike a station's own Exit Gate WARN. The
  // two entries differ only by the sink's provenance stamp, so the reader keys on it.
  it('a verifier WARN recorded by the sink supersedes an earlier FAIL, while an Exit Gate WARN of the same shape does not', async () => {
    log(sinkEntry('prospec-plan', 'FLAWS', ['reuse: owner bypassed']) + sinkEntry('prospec-plan', 'WARN', ['blast_radius: wide']));
    const report = await execute({ cwd: CWD });
    expect(routedFacts[0]?.lastPlanVerifierResult).toBe('WARN');
    expect(report.changes[0]?.next).toBe('tasks');
  });

  // Review pin (C-2 / S-1): a station's Exit Gate FAIL (Constitution advisory, no
  // verifier stamp) is not a verifier result and never routes the change back.
  it('an Exit Gate FAIL without the verifier stamp is not read as a verifier FAIL', async () => {
    log(entry('prospec-plan', 'FAIL', ['layering: MUST rule concern']));
    const report = await execute({ cwd: CWD });
    expect(routedFacts[0]?.lastPlanVerifierResult).toBeNull();
    expect(report.changes[0]?.next).toBe('tasks');
  });

  it('a Break-Glass WARN (Manual override:) supersedes the FAIL, as does a later PASS', async () => {
    log(sinkEntry('prospec-plan', 'FLAWS') + entry('prospec-plan', 'WARN', ['Manual override: false positive on reuse']));
    await execute({ cwd: CWD });
    expect(routedFacts[0]?.lastPlanVerifierResult).toBe('WARN');
    log(sinkEntry('prospec-plan', 'FLAWS') + sinkEntry('prospec-plan', 'PASS'));
    routedFacts.length = 0;
    const report = await execute({ cwd: CWD });
    expect(routedFacts[0]?.lastPlanVerifierResult).toBe('PASS');
    expect(report.changes[0]?.next).toBe('tasks');
  });

  it('reads the tasks station independently and stays null without any entry', async () => {
    log(sinkEntry('prospec-tasks', 'FLAWS') + sinkEntry('prospec-plan', 'PASS'));
    await execute({ cwd: CWD });
    expect(routedFacts[0]?.lastTasksVerifierResult).toBe('FAIL');
    expect(routedFacts[0]?.lastPlanVerifierResult).toBe('PASS');
    vol.fromJSON({ [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({ name: 'add-auth', status: 'plan' }) });
    routedFacts.length = 0;
    await execute({ cwd: CWD });
    expect(routedFacts[0]?.lastPlanVerifierResult).toBeNull();
  });

  it('routes a verified change whose latest grade is C back to verify (REQ-LIB-035)', async () => {
    vol.fromJSON({
      [`${CWD}/.prospec/changes/add-auth/metadata.yaml`]: metadataYaml({
        name: 'add-auth',
        status: 'verified',
        extra:
          'quality_log:\n' +
          '  - skill: prospec-verify\n    date: 2026-01-02\n    result: PASS\n    warnings: []\n    grade: A\n' +
          '  - skill: prospec-verify\n    date: 2026-01-03\n    result: FAIL\n    warnings: []\n    grade: C\n',
      }),
    });
    const report = await execute({ cwd: CWD });
    expect(report.changes[0]?.status).toBe('verified');
    expect(report.changes[0]?.next).toBe('verify');
    expect(report.changes[0]?.code).toBe('VERIFY_GRADE_BELOW_BAR');
  });
});
