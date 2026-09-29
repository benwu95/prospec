import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  buildModulePathMap,
  checkKnowledgeSync,
  classifyDeltaSpec,
  findUnsyncedModules,
  hasKnowledgeSyncGap,
  knowledgeSyncReasons,
  loadDeltaModuleContext,
  MODULE_MAP_UNREADABLE_CAUSE,
  MODULE_MAP_UNREADABLE_REMEDY,
  readKnownModules,
  type KnowledgeSyncGaps,
} from '../../../src/lib/knowledge-sync.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

vi.mock('../../../src/lib/drift-sources.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/drift-sources.js')>();
  return { ...actual, collectGitTimestamps: vi.fn(() => ({ available: false, reason: 'test', modules: [] })) };
});

const CWD = '/project';
const KP = `${CWD}/prospec/ai-knowledge`;
const CHANGE = `${CWD}/.prospec/changes/c`;

const moduleEntry = (name: string, lastVerified = '2026-01-01T00:00:00Z') =>
  `  - name: ${name}\n    paths: [src/${name}]\n    keywords: [${name}]\n    last_verified: "${lastVerified}"\n`;

function knowledge(modules: string[], featureMap?: string): Record<string, string> {
  const files: Record<string, string> = {
    [`${KP}/module-map.yaml`]: `modules:\n${modules.map((m) => moduleEntry(m)).join('')}`,
  };
  for (const m of modules) files[`${KP}/modules/${m}/README.md`] = `# ${m}\n`;
  if (featureMap !== undefined) files[`${KP}/feature-map.yaml`] = featureMap;
  return files;
}

const FEATURE_MAP =
  'features:\n' +
  '  - feature: payments\n    modules: [lib, services]\n    req_prefixes: [PAY]\n    status: active\n' +
  '  - feature: user-profile\n    modules: [types, ghost]\n    req_prefixes: []\n    status: active\n';

function delta(sections: Record<string, string[]>): string {
  let out = '# Delta Spec\n';
  for (const [section, entries] of Object.entries(sections)) {
    out += `\n## ${section}\n`;
    for (const entry of entries) out += `\n${entry}\n`;
  }
  return out;
}

const req = (id: string, feature?: string) =>
  `### ${id}: title\n${feature === undefined ? '' : `\n**Feature:** ${feature}\n`}`;

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
});

describe('classifyDeltaSpec', () => {
  const ctxFor = (related: string[] = [], backfill = false) =>
    loadDeltaModuleContext(KP, related, backfill);

  it('maps a known-module prefix to that module', () => {
    vol.fromJSON(knowledge(['lib', 'services']));
    const [entry] = classifyDeltaSpec(delta({ MODIFIED: [req('REQ-SERVICES-001')] }), ctxFor());
    expect(entry).toMatchObject({ kind: 'module', modules: ['services'], section: 'modified' });
  });

  it('prefers a known module over a feature that also declares its name in req_prefixes', () => {
    vol.fromJSON(knowledge(['lib', 'services', 'types'],
      'features:\n  - feature: binary\n    modules: [lib, services, types]\n    req_prefixes: [LIB]\n    status: active\n'));
    const [entry] = classifyDeltaSpec(delta({ MODIFIED: [req('REQ-LIB-001')] }), ctxFor(['types']));
    expect(entry).toMatchObject({ kind: 'module', modules: ['lib'] });
  });

  it('expands a feature prefix to (owning feature modules ∪ related) ∩ known', () => {
    vol.fromJSON(knowledge(['lib', 'services', 'types'], FEATURE_MAP));
    const [entry] = classifyDeltaSpec(delta({ MODIFIED: [req('REQ-PAY-001')] }), ctxFor(['types', 'nope']));
    expect(entry?.kind).toBe('feature');
    expect([...(entry?.modules ?? [])].sort()).toEqual(['lib', 'services', 'types']);
  });

  it('resolves a proven-backfill slug through its **Feature:** header, dropping unknown feature modules', () => {
    vol.fromJSON(knowledge(['lib', 'types'], FEATURE_MAP));
    const [entry] = classifyDeltaSpec(
      delta({ ADDED: [req('REQ-USER-PROFILE-001', 'user-profile')] }),
      ctxFor(['lib'], true),
    );
    expect(entry?.kind).toBe('feature-slug');
    // `ghost` is a feature-map module the module map does not know: it cannot be checked
    expect([...(entry?.modules ?? [])].sort()).toEqual(['lib', 'types']);
  });

  it('falls back to related ∩ known when a proven backfill has no **Feature:** header', () => {
    vol.fromJSON(knowledge(['lib', 'types'], FEATURE_MAP));
    const [entry] = classifyDeltaSpec(delta({ ADDED: [req('REQ-USER-PROFILE-001')] }), ctxFor(['lib'], true));
    expect(entry).toMatchObject({ kind: 'feature-slug', modules: ['lib'] });
  });

  it('treats the same slug as a new module when the backfill is not proven', () => {
    vol.fromJSON(knowledge(['lib', 'types'], FEATURE_MAP));
    const [entry] = classifyDeltaSpec(
      delta({ ADDED: [req('REQ-USER-PROFILE-001', 'user-profile')] }),
      ctxFor(['lib'], false),
    );
    expect(entry).toMatchObject({ kind: 'new', modules: ['user-profile'] });
  });

  it.each(['MODIFIED', 'REMOVED'])('ignores an unknown non-feature prefix under %s', (section) => {
    vol.fromJSON(knowledge(['lib'], FEATURE_MAP));
    const [entry] = classifyDeltaSpec(delta({ [section]: [req('REQ-SPEC-001')] }), ctxFor());
    expect(entry).toMatchObject({ kind: 'ignored', modules: [] });
  });

  it('keeps each entry\'s section, id, lowercased prefix and trimmed title', () => {
    vol.fromJSON(knowledge(['services']));
    const content = delta({
      ADDED: ['### REQ-AUTH-001: Add authentication module   ', '### REQ-API-MIDDLEWARE-001: Add rate limiting'],
      MODIFIED: ['### REQ-SERVICES-010: Update service layer'],
      REMOVED: ['### REQ-LEGACY-001: Remove deprecated API'],
    });
    const entries = classifyDeltaSpec(content, ctxFor())
      .map(({ section, id, prefix, description }) => ({ section, id, prefix, description }));
    expect(entries).toEqual([
      { section: 'added', id: 'REQ-AUTH-001', prefix: 'auth', description: 'Add authentication module' },
      { section: 'added', id: 'REQ-API-MIDDLEWARE-001', prefix: 'api-middleware', description: 'Add rate limiting' },
      { section: 'modified', id: 'REQ-SERVICES-010', prefix: 'services', description: 'Update service layer' },
      { section: 'removed', id: 'REQ-LEGACY-001', prefix: 'legacy', description: 'Remove deprecated API' },
    ]);
  });

  it.each(['REQ-TYPES-10', 'REQ-SERVICES-0001'])('marks the non-canonical REQ id %s as malformed', (id) => {
    vol.fromJSON(knowledge(['services', 'types']));
    const [entry] = classifyDeltaSpec(delta({ ADDED: [req(id)] }), ctxFor());
    expect(entry).toMatchObject({ kind: 'malformed', id, modules: [] });
  });

  it.each([
    ['empty content', ''],
    ['a REQ heading outside any ADDED/MODIFIED/REMOVED section', '# Delta Spec\n\n### REQ-AUTH-001: x\n'],
  ])('returns no entries for %s', (_label, content) => {
    vol.fromJSON(knowledge(['auth']));
    expect(classifyDeltaSpec(content, ctxFor())).toEqual([]);
  });

  it('does not treat a fenced example heading as an entry', () => {
    vol.fromJSON(knowledge(['lib']));
    const content = delta({ ADDED: [`${req('REQ-LIB-001')}\n\`\`\`markdown\n### REQ-AUTH-001: example\n\`\`\``] });
    const entries = classifyDeltaSpec(content, ctxFor());
    expect(entries.map((e) => e.id)).toEqual(['REQ-LIB-001']);
  });
});

describe('module-map loading', () => {
  it('distinguishes an absent module map (empty) from an unparseable one (null)', () => {
    vol.fromJSON({ [`${KP}/.keep`]: '' });
    expect(buildModulePathMap(`${KP}/module-map.yaml`)).toEqual(new Map());
    vol.fromJSON({ [`${KP}/module-map.yaml`]: 'modules: [\n  - : :\n' });
    expect(buildModulePathMap(`${KP}/module-map.yaml`)).toBeNull();
  });

  it('knows only the registered names when a module map exists, and the modules/ directories when it does not', () => {
    vol.fromJSON({ ...knowledge(['lib']), [`${KP}/modules/legacy/README.md`]: '> **DEPRECATED**\n' });
    expect([...loadDeltaModuleContext(KP, [], false).known]).toEqual(['lib']);
    vol.reset();
    vol.fromJSON({ [`${KP}/modules/legacy/README.md`]: '# legacy\n' });
    expect([...loadDeltaModuleContext(KP, [], false).known]).toEqual(['legacy']);
  });
});

describe('findUnsyncedModules', () => {
  const meta = (related?: string[], scale?: string) => ({
    ...(related === undefined ? {} : { related_modules: related }),
    ...(scale === undefined ? {} : { scale }),
  }) as Parameters<typeof findUnsyncedModules>[1];

  it('checks delta-spec modules even when related_modules is non-empty (AC-1)', async () => {
    const files = knowledge(['lib', 'services']);
    files[`${KP}/module-map.yaml`] = `modules:\n${moduleEntry('lib')}  - name: services\n    paths: [src/services]\n    keywords: [services]\n`;
    vol.fromJSON({ ...files, [`${CHANGE}/delta-spec.md`]: delta({ ADDED: [req('REQ-SERVICES-001')] }) });
    const gaps = await findUnsyncedModules(CHANGE, meta(['lib']), CWD, null);
    expect(gaps.stale).toEqual(['services']);
    expect(await checkKnowledgeSync(CHANGE, meta(['lib']), CWD, null)).toBe(false);
  });

  it('is synced when every affected module is current and an unknown MODIFIED prefix is ignored (AC-2)', async () => {
    for (const related of [[], ['lib']]) {
      vol.reset();
      vol.fromJSON({
        ...knowledge(['lib'], FEATURE_MAP),
        [`${CHANGE}/delta-spec.md`]: delta({ MODIFIED: [req('REQ-SPEC-001')] }),
      });
      expect(await checkKnowledgeSync(CHANGE, meta(related), CWD, null)).toBe(true);
    }
  });

  it('lists an ADDED new-module prefix as unregistered', async () => {
    vol.fromJSON({ ...knowledge(['lib']), [`${CHANGE}/delta-spec.md`]: delta({ ADDED: [req('REQ-AUTH-001')] }) });
    const gaps = await findUnsyncedModules(CHANGE, meta(['lib']), CWD, null);
    expect(gaps).toMatchObject({ stale: [], unregistered: ['auth'] });
    expect(await checkKnowledgeSync(CHANGE, meta(['lib']), CWD, null)).toBe(false);
  });

  it('ignores a MODIFIED or REMOVED REQ of a modules/ directory the module map does not register', async () => {
    for (const section of ['MODIFIED', 'REMOVED']) {
      vol.reset();
      vol.fromJSON({
        ...knowledge(['lib']),
        [`${KP}/modules/legacy/README.md`]: '> **DEPRECATED**: This module was removed.\n',
        [`${CHANGE}/delta-spec.md`]: delta({ [section]: [req('REQ-LEGACY-002')] }),
      });
      expect(await findUnsyncedModules(CHANGE, meta(['lib']), CWD, null)).toEqual({
        stale: [], unregistered: [], malformedIds: [], moduleMapUnreadable: false,
      });
    }
  });

  it('keeps a related_modules name absent from the module map unsynced', async () => {
    vol.fromJSON(knowledge(['lib']));
    const gaps = await findUnsyncedModules(CHANGE, meta(['lib', 'ghost']), CWD, null);
    expect(gaps.unregistered).toEqual(['ghost']);
  });

  it('reports a non-canonical REQ id', async () => {
    vol.fromJSON({ ...knowledge(['services']), [`${CHANGE}/delta-spec.md`]: delta({ ADDED: [req('REQ-SERVICES-0001')] }) });
    const gaps = await findUnsyncedModules(CHANGE, meta([]), CWD, null);
    expect(gaps.malformedIds).toEqual(['REQ-SERVICES-0001']);
    expect(await checkKnowledgeSync(CHANGE, meta([]), CWD, null)).toBe(false);
  });

  it('fails closed when the module map exists but cannot be parsed', async () => {
    vol.fromJSON({
      [`${KP}/module-map.yaml`]: 'modules: [\n  - : :\n',
      [`${CHANGE}/delta-spec.md`]: delta({ MODIFIED: [req('REQ-LIB-001')] }),
    });
    const gaps = await findUnsyncedModules(CHANGE, meta([]), CWD, null);
    expect(gaps.moduleMapUnreadable).toBe(true);
    expect(await checkKnowledgeSync(CHANGE, meta([]), CWD, null)).toBe(false);
  });

  it('fails closed when the module map fails its schema', async () => {
    vol.fromJSON({ [`${KP}/module-map.yaml`]: 'modules:\n  - paths: [src/lib]\n' });
    expect((await findUnsyncedModules(CHANGE, meta(['lib']), CWD, null)).moduleMapUnreadable).toBe(true);
  });

  it('yields no gap without a module map', async () => {
    vol.fromJSON({ [`${CHANGE}/delta-spec.md`]: delta({ ADDED: [req('REQ-LIB-001')] }) });
    expect(await checkKnowledgeSync(CHANGE, meta(['lib']), CWD, null)).toBe(true);
  });

  it('raises on a malformed feature map when a delta-spec exists', async () => {
    vol.fromJSON({
      ...knowledge(['lib'], 'features: nope\n'),
      [`${CHANGE}/delta-spec.md`]: delta({ MODIFIED: [req('REQ-LIB-001')] }),
    });
    await expect(findUnsyncedModules(CHANGE, meta([]), CWD, null)).rejects.toThrow(/feature-map/);
  });

  it('judges a change without a delta-spec on related_modules alone and never reads the feature map (AC quick)', async () => {
    vol.fromJSON(knowledge(['lib'], 'features: nope\n'));
    expect(await checkKnowledgeSync(CHANGE, meta(['lib'], 'quick'), CWD, null)).toBe(true);
    expect(await checkKnowledgeSync(CHANGE, meta(['ghost'], 'quick'), CWD, null)).toBe(false);
  });

  it('applies the feature-slug rule only for a proven backfill', async () => {
    const files = {
      ...knowledge(['lib', 'types'], FEATURE_MAP),
      [`${CHANGE}/delta-spec.md`]: delta({ ADDED: [req('REQ-USER-PROFILE-001', 'user-profile')] }),
    };
    vol.fromJSON(files);
    expect((await findUnsyncedModules(CHANGE, meta(['lib'], 'backfill'), CWD, null)).unregistered).toEqual(['user-profile']);
    vol.fromJSON({ [`${CHANGE}/backfill-draft.md`]: '# draft\n' });
    expect(await checkKnowledgeSync(CHANGE, meta(['lib'], 'backfill'), CWD, null)).toBe(true);
  });
});

describe('relatedUnregistered (REQ-LIB-097)', () => {
  const meta = (related: string[]) => ({ related_modules: related }) as Parameters<typeof findUnsyncedModules>[1];

  it('lists a related_modules name the map does not register, and no classified entry produces, in both lists', async () => {
    vol.fromJSON({ ...knowledge(['lib']), [`${CHANGE}/delta-spec.md`]: delta({ MODIFIED: [req('REQ-LIB-001')] }) });
    const gaps = await findUnsyncedModules(CHANGE, meta(['lib', 'ghost']), CWD, null);
    expect(gaps.unregistered).toEqual(['ghost']);
    expect(gaps.relatedUnregistered).toEqual(['ghost']);
  });

  it('counts a name an ADDED REQ also produces as delta-spec-sourced', async () => {
    vol.fromJSON({ ...knowledge(['lib']), [`${CHANGE}/delta-spec.md`]: delta({ ADDED: [req('REQ-AUTH-001')] }) });
    const gaps = await findUnsyncedModules(CHANGE, meta(['lib', 'auth']), CWD, null);
    expect(gaps.unregistered).toEqual(['auth']);
    expect('relatedUnregistered' in gaps).toBe(false);
  });

  it('carries no relatedUnregistered key when every unregistered name comes from the delta-spec', async () => {
    vol.fromJSON({ ...knowledge(['lib']), [`${CHANGE}/delta-spec.md`]: delta({ ADDED: [req('REQ-AUTH-001')] }) });
    expect(await findUnsyncedModules(CHANGE, meta(['lib']), CWD, null)).toEqual({
      stale: [], unregistered: ['auth'], malformedIds: [], moduleMapUnreadable: false,
    });
  });

  it('judges a change without a delta-spec on related_modules alone, typos included', async () => {
    vol.fromJSON(knowledge(['lib']));
    expect((await findUnsyncedModules(CHANGE, meta(['ghost']), CWD, null)).relatedUnregistered).toEqual(['ghost']);
  });
});

describe('knowledgeSyncReasons (REQ-LIB-097, REQ-LIB-071)', () => {
  const NONE: KnowledgeSyncGaps = { stale: [], unregistered: [], malformedIds: [], moduleMapUnreadable: false };
  const gaps = (over: Partial<KnowledgeSyncGaps>): KnowledgeSyncGaps => ({ ...NONE, ...over });

  it('returns no reason when there is no gap', () => {
    expect(knowledgeSyncReasons(NONE, 'c')).toEqual([]);
  });

  it('maps stale modules to a KNOWLEDGE_UNSYNCED reason that stamps them', () => {
    const [reason, ...rest] = knowledgeSyncReasons(gaps({ stale: ['services'] }), 'c');
    expect(rest).toEqual([]);
    expect(reason?.code).toBe('KNOWLEDGE_UNSYNCED');
    expect(reason?.message).toContain('stale: services');
    expect(reason?.remediation).toContain('prospec-knowledge-update');
    expect(reason?.remediation).toContain('prospec knowledge verify services');
  });

  it('maps a delta-spec-sourced unregistered name to KNOWLEDGE_UNSYNCED without suggesting knowledge verify for it', () => {
    const [reason] = knowledgeSyncReasons(gaps({ unregistered: ['auth'] }), 'c');
    expect(reason?.code).toBe('KNOWLEDGE_UNSYNCED');
    expect(reason?.message).toContain('not registered in module-map: auth');
    expect(reason?.remediation).toContain('req_prefixes');
    expect(reason?.remediation).not.toContain('knowledge verify');
  });

  it('maps each input no station repairs to one KNOWLEDGE_INPUT_INVALID reason', () => {
    const malformed = knowledgeSyncReasons(gaps({ malformedIds: ['REQ-LIB-01'] }), 'c');
    expect(malformed.map((r) => r.code)).toEqual(['KNOWLEDGE_INPUT_INVALID']);
    expect(malformed[0]?.message).toContain('REQ-LIB-01');
    expect(malformed[0]?.remediation).toContain('REQ-{MODULE}-NNN');

    const unreadable = knowledgeSyncReasons(gaps({ moduleMapUnreadable: true }), 'c');
    expect(unreadable.map((r) => r.code)).toEqual(['KNOWLEDGE_INPUT_INVALID']);
    expect(unreadable[0]?.message).toContain(MODULE_MAP_UNREADABLE_CAUSE);
    expect(unreadable[0]?.remediation).toContain(MODULE_MAP_UNREADABLE_REMEDY);
  });

  it('points a related-only unregistered name at registering it first, then at the correction command', () => {
    const reasons = knowledgeSyncReasons(gaps({ unregistered: ['ghost'], relatedUnregistered: ['ghost'] }), 'my-change');
    expect(reasons.map((r) => r.code)).toEqual(['KNOWLEDGE_INPUT_INVALID']);
    const remedy = reasons[0]!.remediation;
    expect(reasons[0]!.message).toContain('ghost');
    expect(remedy.indexOf('module-map.yaml')).toBeGreaterThanOrEqual(0);
    expect(remedy.indexOf('module-map.yaml')).toBeLessThan(remedy.indexOf('prospec change related-modules'));
    expect(remedy).toContain('--change my-change');
    expect(remedy).toMatch(/registered module/);
  });

  it('lists the input-invalid reason first and keeps each cause under its own code', () => {
    const reasons = knowledgeSyncReasons(
      gaps({ stale: ['lib'], unregistered: ['auth', 'ghost'], relatedUnregistered: ['ghost'], malformedIds: ['REQ-X'] }),
      'c',
    );
    expect(reasons.map((r) => r.code)).toEqual(['KNOWLEDGE_INPUT_INVALID', 'KNOWLEDGE_UNSYNCED']);
    expect(reasons[0]!.message).toContain('ghost');
    expect(reasons[0]!.message).not.toContain('auth');
    expect(reasons[1]!.message).toContain('stale: lib');
    expect(reasons[1]!.message).toContain('auth');
    expect(reasons[1]!.message).not.toContain('ghost');
  });

  it('returns a reason exactly when there is a gap', () => {
    const samples: KnowledgeSyncGaps[] = [
      NONE,
      gaps({ stale: ['a'] }),
      gaps({ unregistered: ['a'] }),
      gaps({ unregistered: ['a'], relatedUnregistered: ['a'] }),
      gaps({ malformedIds: ['REQ-A'] }),
      gaps({ moduleMapUnreadable: true }),
      // a hand-built subset naming no unregistered name must not invent a gap
      gaps({ relatedUnregistered: ['a'] }),
    ];
    for (const sample of samples) {
      expect(knowledgeSyncReasons(sample, 'c').length > 0, JSON.stringify(sample)).toBe(hasKnowledgeSyncGap(sample));
    }
  });
});

describe('readKnownModules (REQ-LIB-097)', () => {
  const SCHEMA_INVALID = 'modules:\n  - name: lib\n    paths: [src/lib]\n';

  it('returns the module map names in their own spelling', () => {
    vol.fromJSON({ [`${KP}/module-map.yaml`]: `modules:\n${moduleEntry('API')}${moduleEntry('lib')}` });
    const { known, unreadable } = readKnownModules(KP, CWD);
    expect(unreadable).toBeUndefined();
    expect([...known]).toEqual([['api', 'API'], ['lib', 'lib']]);
  });

  it('falls back to the modules/ directories, spelling kept, when there is no module map', () => {
    vol.fromJSON({ [`${KP}/modules/Legacy/README.md`]: '# Legacy\n' });
    expect([...readKnownModules(KP, CWD).known]).toEqual([['legacy', 'Legacy']]);
  });

  it('is unreadable when the map cannot be parsed, fails its schema, or is a directory', () => {
    const cases: Record<string, string>[] = [
      { [`${KP}/module-map.yaml`]: 'modules: [\n  - : :\n' },
      { [`${KP}/module-map.yaml`]: SCHEMA_INVALID },
      { [`${KP}/module-map.yaml/nested`]: 'x' },
    ];
    for (const files of cases) {
      vol.reset();
      vol.fromJSON(files);
      expect(readKnownModules(KP, CWD), JSON.stringify(files)).toEqual({
        known: new Map(),
        unreadable: { cause: MODULE_MAP_UNREADABLE_CAUSE, remedy: MODULE_MAP_UNREADABLE_REMEDY },
      });
    }
  });

  it('is unreadable when the map resolves outside the knowledge root', () => {
    vol.fromJSON({ '/outside/module-map.yaml': `modules:\n${moduleEntry('lib')}`, [`${KP}/.keep`]: '' });
    vol.symlinkSync('/outside/module-map.yaml', `${KP}/module-map.yaml`);
    // the file parses and validates: the cause is where it lives, never "cannot be read"
    const { unreadable } = readKnownModules(KP, CWD);
    expect(unreadable?.cause).toContain('outside the knowledge root');
    expect(unreadable?.cause).not.toBe(MODULE_MAP_UNREADABLE_CAUSE);
    expect(unreadable?.remedy).not.toBe(MODULE_MAP_UNREADABLE_REMEDY);
  });

  it('matches the gate on these maps for a change with an affected module', async () => {
    const meta = { related_modules: ['lib'] } as Parameters<typeof findUnsyncedModules>[1];
    for (const map of ['modules: [\n  - : :\n', SCHEMA_INVALID, `modules:\n${moduleEntry('lib')}`]) {
      vol.reset();
      vol.fromJSON({ [`${KP}/module-map.yaml`]: map, [`${KP}/modules/lib/README.md`]: '# lib\n' });
      const gate = await findUnsyncedModules(CHANGE, meta, CWD, null);
      expect(readKnownModules(KP, CWD).unreadable !== undefined, map).toBe(gate.moduleMapUnreadable);
    }
  });

  it('refuses a schema-invalid map even where the gate, with no affected module, passes the change', async () => {
    vol.fromJSON({ [`${KP}/module-map.yaml`]: SCHEMA_INVALID });
    const meta = { related_modules: [] } as Parameters<typeof findUnsyncedModules>[1];
    expect(hasKnowledgeSyncGap(await findUnsyncedModules(CHANGE, meta, CWD, null))).toBe(false);
    expect(readKnownModules(KP, CWD).unreadable).toBeDefined();
  });
});
