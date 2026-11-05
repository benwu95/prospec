import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { collectConfigDiagnostics } from '../../../src/lib/config-diagnostics.js';
import { validateConfig } from '../../../src/lib/config.js';
import { ProspecConfigSchema, type ConfigDiagnostic } from '../../../src/types/config.js';

describe('collectConfigDiagnostics', () => {
  it('reports raw unknown keys in traversal order without inspecting extension subtrees', () => {
    const parsed = {
      custom_extension: { project: { naem: 'private-value' } },
      project: { name: 'sample', naem: 'private-value' },
      artfact_language: 'private-value',
    };
    const original = structuredClone(parsed);
    const diagnostics: ConfigDiagnostic[] = collectConfigDiagnostics(parsed);

    expect(diagnostics).toEqual([
      { path: ['custom_extension'] },
      { path: ['project', 'naem'], suggestion: 'name' },
      { path: ['artfact_language'], suggestion: 'artifact_language' },
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain('private-value');
    expect(parsed).toEqual(original);
  });

  it('walks all eight finite object levels from the public schema', () => {
    const marker = 'unrecognized_setting';
    const parsed = {
      [marker]: true,
      project: { name: 'sample', [marker]: true },
      tech_stack: { [marker]: true },
      paths: { [marker]: true },
      test_evidence: { [marker]: true },
      knowledge: { [marker]: true, token_budget: { [marker]: true } },
      workflow: { [marker]: true },
    };

    expect(collectConfigDiagnostics(parsed)).toEqual([
      { path: [marker] },
      { path: ['project', marker] },
      { path: ['tech_stack', marker] },
      { path: ['paths', marker] },
      { path: ['test_evidence', marker] },
      { path: ['knowledge', marker] },
      { path: ['knowledge', 'token_budget', marker] },
      { path: ['workflow', marker] },
    ]);
  });

  it('reaches every object level of the schema through any wrapper', () => {
    const marker = 'unrecognized_setting';
    const levels: string[][] = [];
    const collect = (schema: z.core.$ZodType, path: string[]): void => {
      const def = schema._zod.def as { innerType?: z.core.$ZodType };
      if (def.innerType !== undefined) return collect(def.innerType, path);
      if (!(schema instanceof z.ZodObject)) return;
      levels.push(path);
      for (const [key, child] of Object.entries(schema.shape)) collect(child, [...path, key]);
    };
    collect(ProspecConfigSchema, []);

    const parsed: Record<string, unknown> = {};
    for (const level of levels) {
      let node = parsed;
      for (const key of level) node = (node[key] ??= {}) as Record<string, unknown>;
      node[marker] = true;
    }

    expect(levels.length).toBeGreaterThanOrEqual(8);
    expect(collectConfigDiagnostics(parsed).map((diagnostic) => diagnostic.path))
      .toEqual(expect.arrayContaining(levels.map((level) => [...level, marker])));
  });

  it('unwraps nullable and default object schemas', () => {
    const schema = z.object({ section: z.object({ known: z.string() }).nullable().default(null) });
    expect(collectConfigDiagnostics({ section: { knwn: 'x' } }, schema)).toEqual([
      { path: ['section', 'knwn'], suggestion: 'known' },
    ]);
  });

  it('accepts every declared finite-object key while leaving record and unknown values opaque', () => {
    expect(collectConfigDiagnostics({
      version: '2.10.0',
      project: { name: 'sample' },
      tech_stack: {
        language: 'typescript', framework: 'node', package_manager: 'pnpm',
        test_command: 'pnpm test', test_timeout_ms: { unrecognized: true },
      },
      paths: { base_dir: 'prospec' },
      exclude: ['secret'],
      agents: ['codex'],
      test_evidence: { exclude_knowledge: true },
      knowledge: {
        base_path: 'prospec/ai-knowledge', additional_core_conventions: [], strategy: 'auto',
        generated_artifacts: [],
        token_budget: {
          l1_per_file: 1800, l2_per_module: 1000, readme_max_lines: 100,
          spec_per_file: 5000, demand_knowledge_per_file: 10000, headroom: 0.85,
        },
      },
      workflow: {
        max_station_retries: 3,
        pause_at: { made_up_key: 'unvalidated' },
        always_escalate: { made_up_key: 'unvalidated' },
      },
      artifact_language: 'English', trust_zone_language: 'English',
      skill_triggers: { arbitrary_skill: { made_up_key: 'unvalidated' } },
      skill_exclusions: { arbitrary_skill: { made_up_key: 'unvalidated' } },
    })).toEqual([]);
  });

  it.each([null, undefined, false, 1, 'text', [], [{ naem: 'x' }]].map((parsed) => ({ parsed })))(
    'does not diagnose non-object config $parsed', ({ parsed }) => {
      expect(collectConfigDiagnostics(parsed)).toEqual([]);
    },
  );

  it('leaves invalid finite-object values to the validator', () => {
    expect(collectConfigDiagnostics({
      project: [{ naem: 'sample' }],
      tech_stack: null,
      paths: 'prospec',
      test_evidence: false,
      knowledge: { token_budget: [{ headdroom: 1 }] },
      workflow: 4,
    })).toEqual([]);
  });

  it.each([
    ['nam', 'name'],
    ['naame', 'name'],
    ['naxe', 'name'],
    ['naem', 'name'],
    ['Name', 'name'],
    ['nxyz', undefined],
    ['NAME', undefined],
    ['completely_unrelated_name', undefined],
  ])('uses bounded case-sensitive distance for project.%s', (key, suggestion) => {
    expect(collectConfigDiagnostics({ project: { [key]: true } })).toEqual([
      { path: ['project', key], ...(suggestion === undefined ? {} : { suggestion }) },
    ]);
  });

  it('omits suggestions for equal nearest matches and never guesses across object levels', () => {
    expect(collectConfigDiagnostics({
      knowledge: { token_budget: { sp_per_file: true } },
      project: { language: 'typescript' },
    })).toEqual([
      { path: ['knowledge', 'token_budget', 'sp_per_file'] },
      { path: ['project', 'language'] },
    ]);
  });

  it('reports own keys that collide with Object prototype names', () => {
    const parsed: unknown = JSON.parse('{"toString":1,"constructor":2,"__proto__":{"project":{"naem":"x"}}}');
    expect(collectConfigDiagnostics(parsed)).toEqual([
      { path: ['toString'] }, { path: ['constructor'] }, { path: ['__proto__'] },
    ]);
  });

  it('does not change schema retention or programmatic validation silence', () => {
    const raw = 'project:\n  name: sample\n  naem: private-value\ncustom_extension:\n  retained: true\n';
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const before = validateConfig(raw);
      expect(collectConfigDiagnostics({
        project: { name: 'sample', naem: 'private-value' },
        custom_extension: { retained: true },
      })).toHaveLength(2);
      const after = validateConfig(raw);
      expect(after).toEqual(before);
      expect(after).toEqual({ project: { name: 'sample' }, custom_extension: { retained: true } });
      expect(ProspecConfigSchema.parse(after)).toEqual(after);
      expect(stderr).not.toHaveBeenCalled();
      expect(stdout).not.toHaveBeenCalled();
      expect(warning).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
