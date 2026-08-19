import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { vol } from 'memfs';
import { execute } from '../../../src/services/status.service.js';
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
