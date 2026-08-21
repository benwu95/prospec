import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { vol } from 'memfs';
import { execute } from '../../../src/services/auto-draft.service.js';
import { PrerequisiteError } from '../../../src/types/errors.js';
import type { DriftFinding } from '../../../src/types/drift-report.js';

vi.mock('node:fs', async () => {
  const memfs = await vi.importActual<typeof import('memfs')>('memfs');
  return {
    ...memfs.fs,
    default: memfs.fs,
  };
});

// Fails exactly one change by name, so a group's failure can be observed
// ALONGSIDE its siblings succeeding — the guarantee `break` would silently break.
const failCreateNamed = vi.hoisted(() => ({ name: null as string | null }));
vi.mock('../../../src/services/change-story.service.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../src/services/change-story.service.js')>();
  return {
    ...actual,
    execute: async (options: Parameters<typeof actual.execute>[0]) => {
      if (failCreateNamed.name !== null && options.name === failCreateNamed.name) {
        throw new Error('EACCES: permission denied');
      }
      return actual.execute(options);
    },
  };
});

const CONFIG = [
  'version: "1.0"',
  'project:',
  '  name: test-project',
  'paths:',
  '  base_dir: prospec',
  'knowledge:',
  '  base_path: prospec/ai-knowledge',
  'tech_stack:',
  '  language: typescript',
  '',
].join('\n');

const MODULE_MAP = [
  'modules:',
  '  - name: services',
  '    paths:',
  '      - src/services/**',
  '    keywords:',
  '      - services',
  '  - name: lib',
  '    paths:',
  '      - src/lib/**',
  '    keywords:',
  '      - lib',
  '',
].join('\n');

const PROJECT: Record<string, string> = {
  '.prospec.yaml': CONFIG,
  'prospec/CONSTITUTION.md': '# Constitution\n',
  // A REAL module table: with an empty index.md the keyword fallback matches
  // nothing, and every "no phantom modules" assertion below passes vacuously.
  'prospec/index.md': [
    '# Index',
    '',
    '| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |',
    '|--------|----------|---------|--------|-------------|-----------|------------|',
    '| **services** | services, general, fix, drift, canonical | - | Active | Business logic | - | - |',
    '| **lib** | lib, general, size, knowledge | - | Active | Helpers | - | - |',
    '',
  ].join('\n'),
  'prospec/ai-knowledge/module-map.yaml': MODULE_MAP,
};

describe('auto-draft.service', () => {
  const cwd = '/test-project';
  const changeDir = (name: string): string => `${cwd}/.prospec/changes/${name}`;

  beforeEach(() => {
    vol.reset();
    vol.fromJSON(PROJECT, cwd);
    failCreateNamed.name = null;
  });

  afterEach(() => {
    vol.reset();
  });

  it('scaffolds a fix change directory from a knowledge-size drift finding', async () => {
    const findings: DriftFinding[] = [
      {
        check: 'knowledge-size',
        severity: 'warn',
        source_path: 'prospec/ai-knowledge/modules/services/README.md',
        detail: 'Module README exceeds 1000 tokens (actual: 1250)',
        knowledge_size: {
          surface: 'module README',
          budget_key: 'readme_max_tokens',
          budget: 1000,
          actual: 1250,
          unit: 'tokens',
          tier: 'over',
          remedy: 'Extract sub-modules to reduce README size',
        },
      },
    ];

    const result = await execute({ cwd, findings });

    expect(result.createdCount).toBe(1);
    expect(result.skippedCount).toBe(0);

    const change = result.changes[0]!;
    expect(change.name).toBe('fix-services-knowledge-size');
    expect(change.target).toBe('services');
    expect(change.scale).toBe('quick');
    expect(change.action).toBe('created');
    expect(result.failedCount).toBe(0);

    const proposal = vol.readFileSync(
      `${changeDir('fix-services-knowledge-size')}/proposal.md`,
      'utf-8',
    ) as string;
    expect(proposal).toContain('Fix services drift (knowledge-size)');
    expect(proposal).toContain('Extract sub-modules to reduce README size');
    expect(proposal).toContain('Module README exceeds 1000 tokens');

    const metadata = vol.readFileSync(
      `${changeDir('fix-services-knowledge-size')}/metadata.yaml`,
      'utf-8',
    ) as string;
    expect(metadata).toContain('scale: quick');
    expect(metadata).toContain('status: story');
    expect(metadata).toMatch(/related_modules:\n\s+- services/);
  });

  it('attributes a source path through module-map, not a hardcoded src/ shape', async () => {
    const findings: DriftFinding[] = [
      {
        check: 'import-direction',
        severity: 'fail',
        source_path: 'src/lib/helper.ts',
        line: 12,
        detail: 'Illegal upward import: lib -> services',
      },
    ];

    const result = await execute({ cwd, findings });

    expect(result.changes[0]!.name).toBe('fix-lib-import-direction');
    expect(result.changes[0]!.scale).toBe('standard');
  });

  it('honours a relocated knowledge root instead of a literal prospec/ai-knowledge path', async () => {
    vol.reset();
    vol.fromJSON(
      {
        ...PROJECT,
        '.prospec.yaml': CONFIG.replace(
          '  base_path: prospec/ai-knowledge',
          '  base_path: docs/kb',
        ),
        'docs/kb/module-map.yaml': MODULE_MAP,
      },
      cwd,
    );

    const result = await execute({
      cwd,
      findings: [
        {
          check: 'knowledge-size',
          severity: 'warn',
          source_path: 'docs/kb/modules/services/README.md',
          detail: 'Over budget',
        },
      ],
    });

    expect(result.changes[0]!.name).toBe('fix-services-knowledge-size');
  });

  it('groups a feature-spec finding under its feature, not under `general`', async () => {
    const result = await execute({
      cwd,
      findings: [
        {
          check: 'file-paths',
          severity: 'warn',
          source_path: 'prospec/specs/features/sdd-workflow/us-1.md',
          detail: 'Broken link',
        },
      ],
    });

    expect(result.changes[0]!.target).toBe('sdd-workflow');
    const metadata = vol.readFileSync(
      `${changeDir('fix-sdd-workflow-file-paths')}/metadata.yaml`,
      'utf-8',
    ) as string;
    // A feature is a subject, never a module.
    expect(metadata).not.toContain('related_modules');
  });

  it('never names a phantom module: an unattributable path groups under `general`', async () => {
    const result = await execute({
      cwd,
      findings: [
        {
          check: 'canonical-doc-drift',
          severity: 'warn',
          source_path: 'some/unmapped/place/SKILL.md',
          detail: 'Diverged from its template',
        },
      ],
    });

    expect(result.changes[0]!.name).toBe('fix-general-canonical-doc-drift');
    const metadata = vol.readFileSync(
      `${changeDir('fix-general-canonical-doc-drift')}/metadata.yaml`,
      'utf-8',
    ) as string;
    // `general` is not in module-map, so it must not be written as a module —
    // and the index.md keyword fallback (which WOULD match `services`/`lib` off
    // this change name) must not be reached either.
    expect(metadata).not.toContain('related_modules');
    expect(metadata).not.toContain('services');
    expect(metadata).not.toContain('lib');
  });

  it('groups multiple findings for the same target and check into a single change', async () => {
    const findings: DriftFinding[] = [
      {
        check: 'import-direction',
        severity: 'fail',
        source_path: 'src/lib/helper1.ts',
        detail: 'Illegal upward import from helper1',
      },
      {
        check: 'import-direction',
        severity: 'fail',
        source_path: 'src/lib/helper2.ts',
        detail: 'Illegal upward import from helper2',
      },
    ];

    const result = await execute({ cwd, findings });

    expect(result.createdCount).toBe(1);
    const proposal = vol.readFileSync(
      `${changeDir('fix-lib-import-direction')}/proposal.md`,
      'utf-8',
    ) as string;
    expect(proposal).toContain('Illegal upward import from helper1');
    expect(proposal).toContain('Illegal upward import from helper2');
  });

  it('drops headroom-tier pressure signals — they are not violations to draft', async () => {
    const result = await execute({
      cwd,
      findings: [
        {
          check: 'knowledge-size',
          severity: 'warn',
          source_path: 'prospec/ai-knowledge/modules/services/README.md',
          detail: 'Within budget but past the headroom band',
          knowledge_size: {
            surface: 'module README',
            budget_key: 'readme_max_tokens',
            budget: 1000,
            actual: 900,
            unit: 'tokens',
            tier: 'headroom',
          },
        },
      ],
    });

    expect(result.changes).toHaveLength(0);
    expect(result.createdCount).toBe(0);
  });

  it('skips an existing change instead of overwriting its proposal', async () => {
    const findings: DriftFinding[] = [
      {
        check: 'knowledge-size',
        severity: 'warn',
        source_path: 'prospec/ai-knowledge/modules/services/README.md',
        detail: 'Over budget',
      },
    ];

    const first = await execute({ cwd, findings });
    expect(first.createdCount).toBe(1);

    const proposalPath = `${changeDir('fix-services-knowledge-size')}/proposal.md`;
    vol.writeFileSync(proposalPath, 'HAND-WRITTEN');

    const second = await execute({ cwd, findings });
    expect(second.createdCount).toBe(0);
    expect(second.skippedCount).toBe(1);
    expect(second.changes[0]!.action).toBe('skipped');
    expect(vol.readFileSync(proposalPath, 'utf-8')).toBe('HAND-WRITTEN');
  });

  it('skips a directory that exists without metadata rather than writing into it', async () => {
    vol.mkdirSync(changeDir('fix-services-knowledge-size'), { recursive: true });
    vol.writeFileSync(`${changeDir('fix-services-knowledge-size')}/proposal.md`, 'HAND-WRITTEN');

    const result = await execute({
      cwd,
      findings: [
        {
          check: 'knowledge-size',
          severity: 'warn',
          source_path: 'prospec/ai-knowledge/modules/services/README.md',
          detail: 'Over budget',
        },
      ],
    });

    expect(result.skippedCount).toBe(1);
    expect(
      vol.readFileSync(`${changeDir('fix-services-knowledge-size')}/proposal.md`, 'utf-8'),
    ).toBe('HAND-WRITTEN');
  });

  it('writes no directory at all in dry-run mode', async () => {
    const result = await execute({
      cwd,
      findings: [
        {
          check: 'file-paths',
          severity: 'warn',
          source_path: 'prospec/specs/features/auth.md',
          detail: 'Broken link to missing file',
        },
      ],
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.createdCount).toBe(1);
    expect(result.changes[0]!.name).toBe('fix-auth-file-paths');
    // A metadata-only leftover would suppress every later draft for this finding.
    expect(vol.existsSync(changeDir('fix-auth-file-paths'))).toBe(false);
  });

  it('still refuses a collision under dry run — a preview that hides it is not a preview', async () => {
    const findings: DriftFinding[] = [
      {
        check: 'knowledge-size',
        severity: 'warn',
        source_path: 'prospec/ai-knowledge/modules/services/README.md',
        detail: 'Over budget',
      },
    ];
    await execute({ cwd, findings });

    const preview = await execute({ cwd, findings, dryRun: true });

    expect(preview.createdCount).toBe(0);
    expect(preview.skippedCount).toBe(1);
    expect(preview.changes[0]!.action).toBe('skipped');
  });

  it('keeps an explicit --target verbatim instead of re-deriving it from a path', async () => {
    const result = await execute({
      cwd,
      target: 'custom-module',
      reason: 'Manual cleanup of circular references',
      checkId: 'import-direction',
      // `import-direction` defaults to `standard`, so overriding to that would
      // pass even if the option were ignored.
      scale: 'full',
      issue: '#185',
    });

    expect(result.changes[0]!.name).toBe('fix-custom-module-import-direction');
    expect(result.changes[0]!.scale).toBe('full');
    const metadata = vol.readFileSync(
      `${changeDir('fix-custom-module-import-direction')}/metadata.yaml`,
      'utf-8',
    ) as string;
    expect(metadata).toMatch(/issue:\s*"?#185"?/);
    expect(metadata).toContain('scale: full');
    // Not a module-map name, so it is not claimed as one.
    expect(metadata).not.toContain('related_modules');
  });

  it('keeps two targets that slug to the same name in two distinct changes', async () => {
    // Neither survives `sanitizeChangeSlug`, so both would become `fix-general-*`
    // and the second would be refused as "already exists" — reported in the exact
    // words real idempotency uses, with its findings silently gone.
    const result = await execute({
      cwd,
      findings: [
        {
          check: 'knowledge-size',
          severity: 'warn',
          source_path: 'prospec/ai-knowledge/modules/使用者/README.md',
          detail: 'first subject',
        },
        {
          check: 'knowledge-size',
          severity: 'warn',
          source_path: 'prospec/ai-knowledge/modules/модуль/README.md',
          detail: 'second subject',
        },
      ],
    });

    expect(result.createdCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    const names = result.changes.map((c) => c.name);
    expect(new Set(names).size).toBe(2);
    // Each change carries only its own finding.
    for (const change of result.changes) {
      const proposal = vol.readFileSync(`${changeDir(change.name)}/proposal.md`, 'utf-8') as string;
      const detail = change.target === '使用者' ? 'first subject' : 'second subject';
      const other = detail === 'first subject' ? 'second subject' : 'first subject';
      expect(proposal).toContain(detail);
      expect(proposal).not.toContain(other);
    }
  });

  it('is stable across runs when a name had to be disambiguated', async () => {
    const findings: DriftFinding[] = [
      {
        check: 'knowledge-size',
        severity: 'warn',
        source_path: 'prospec/ai-knowledge/modules/使用者/README.md',
        detail: 'first subject',
      },
      {
        check: 'knowledge-size',
        severity: 'warn',
        source_path: 'prospec/ai-knowledge/modules/модуль/README.md',
        detail: 'second subject',
      },
    ];

    const first = await execute({ cwd, findings });
    const second = await execute({ cwd, findings });

    // Re-drafting the same drift must skip, not mint a second set of changes.
    expect(second.createdCount).toBe(0);
    expect(second.skippedCount).toBe(2);
    expect(second.changes.map((c) => c.name).sort()).toEqual(
      first.changes.map((c) => c.name).sort(),
    );
  });

  it('gives a target the same name whatever else the report contained', async () => {
    const nonLatin: DriftFinding = {
      check: 'knowledge-size',
      severity: 'warn',
      source_path: 'prospec/ai-knowledge/modules/使用者/README.md',
      detail: 'first subject',
    };
    const colliding: DriftFinding = {
      check: 'knowledge-size',
      severity: 'warn',
      source_path: 'prospec/ai-knowledge/modules/модуль/README.md',
      detail: 'second subject',
    };

    // Alone, then alongside a target that slugs to the same base. A run-scoped
    // suffix would give the first run the clean name and the second a suffixed
    // one — and the second run would then create a change instead of skipping.
    const alone = await execute({ cwd, findings: [nonLatin], dryRun: true });
    const together = await execute({ cwd, findings: [nonLatin, colliding], dryRun: true });

    const aloneName = alone.changes[0]!.name;
    const togetherName = together.changes.find((c) => c.target === '使用者')!.name;
    expect(togetherName).toBe(aloneName);
  });

  it('keeps drafting the other groups after one of them fails', async () => {
    failCreateNamed.name = 'fix-lib-knowledge-size';

    const result = await execute({
      cwd,
      findings: [
        {
          check: 'knowledge-size',
          severity: 'warn',
          source_path: 'prospec/ai-knowledge/modules/lib/README.md',
          detail: 'lib over budget',
        },
        {
          check: 'knowledge-size',
          severity: 'warn',
          source_path: 'prospec/ai-knowledge/modules/services/README.md',
          detail: 'services over budget',
        },
      ],
    });

    expect(result.failedCount).toBe(1);
    // The sibling still ran — a `break` on the first failure would zero this.
    expect(result.createdCount).toBe(1);
    expect(result.changes).toHaveLength(2);
    expect(vol.existsSync(`${changeDir('fix-services-knowledge-size')}/proposal.md`)).toBe(true);
    const failed = result.changes.find((c) => c.action === 'failed')!;
    expect(failed.name).toBe('fix-lib-knowledge-size');
    expect(failed.skipReason).toContain('EACCES');
  });

  it('treats an empty finding list as a clean run, not a missing source', async () => {
    const result = await execute({ cwd, findings: [] });

    expect(result.changes).toEqual([]);
    expect(result.createdCount).toBe(0);
    expect(result.failedCount).toBe(0);
  });

  it('writes the proposal in the project artifact language it was told to state', async () => {
    vol.reset();
    vol.fromJSON(
      { ...PROJECT, '.prospec.yaml': `${CONFIG}artifact_language: Traditional Chinese (Taiwan)\n` },
      cwd,
    );

    const result = await execute({
      cwd,
      findings: [
        {
          check: 'knowledge-size',
          severity: 'warn',
          source_path: 'prospec/ai-knowledge/modules/services/README.md',
          detail: 'Over budget',
        },
      ],
    });

    const proposal = vol.readFileSync(
      `${changeDir(result.changes[0]!.name)}/proposal.md`,
      'utf-8',
    ) as string;
    expect(proposal).toContain('rewrite this proposal in Traditional Chinese (Taiwan)');
  });

  it('omits the rewrite obligation when the project already writes English', async () => {
    const result = await execute({
      cwd,
      findings: [
        {
          check: 'knowledge-size',
          severity: 'warn',
          source_path: 'prospec/ai-knowledge/modules/services/README.md',
          detail: 'Over budget',
        },
      ],
    });

    const proposal = vol.readFileSync(
      `${changeDir(result.changes[0]!.name)}/proposal.md`,
      'utf-8',
    ) as string;
    expect(proposal).not.toContain('rewrite this proposal in');
  });

  it('carries every distinct remedy of a merged group, and de-duplicates repeats', async () => {
    const sized = (path: string, remedy: string): DriftFinding => ({
      check: 'knowledge-size',
      severity: 'warn',
      source_path: path,
      detail: `${path} over budget`,
      knowledge_size: {
        surface: 'module README',
        budget_key: 'readme_max_tokens',
        budget: 1000,
        actual: 1250,
        unit: 'tokens',
        tier: 'over',
        remedy,
      },
    });

    const result = await execute({
      cwd,
      findings: [
        sized('prospec/ai-knowledge/modules/services/a.md', 'extract a sub-module'),
        sized('prospec/ai-knowledge/modules/services/b.md', 'split into slices'),
        sized('prospec/ai-knowledge/modules/services/c.md', 'extract a sub-module'),
      ],
    });

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]!.remedies).toEqual(['extract a sub-module', 'split into slices']);
    const proposal = vol.readFileSync(
      `${changeDir('fix-services-knowledge-size')}/proposal.md`,
      'utf-8',
    ) as string;
    for (const p of ['a.md', 'b.md', 'c.md']) expect(proposal).toContain(p);
  });

  it('attributes a group the same way whichever finding arrives first', async () => {
    // Same two findings, same check, same group — only the order differs. One
    // path attributes to a module, the other does not.
    const spec: DriftFinding = {
      check: 'file-paths',
      severity: 'warn',
      source_path: 'prospec/specs/features/services/us-1.md',
      detail: 'broken link in the spec',
    };
    const code: DriftFinding = {
      check: 'file-paths',
      severity: 'warn',
      source_path: 'src/services/thing.ts',
      detail: 'broken link in the source',
    };

    // Read the module off DISK: `DraftedChange` carries no `module`, so
    // comparing the returned objects could not detect the order dependence.
    const relatedModulesAfter = async (findings: DriftFinding[]): Promise<string> => {
      vol.reset();
      vol.fromJSON(PROJECT, cwd);
      const res = await execute({ cwd, findings });
      const group = res.changes.find((c) => c.target === 'services')!;
      return vol.readFileSync(`${changeDir(group.name)}/metadata.yaml`, 'utf-8') as string;
    };

    const specFirst = await relatedModulesAfter([spec, code]);
    const codeFirst = await relatedModulesAfter([code, spec]);

    expect(specFirst).toMatch(/related_modules:\n\s+- services/);
    expect(codeFirst).toMatch(/related_modules:\n\s+- services/);
  });

  it('refuses to claim a knowledge directory segment module-map never declared', async () => {
    const result = await execute({
      cwd,
      findings: [
        {
          check: 'knowledge-size',
          severity: 'warn',
          source_path: 'prospec/ai-knowledge/modules/not-a-module/README.md',
          detail: 'Over budget',
        },
      ],
    });

    expect(result.changes[0]!.target).toBe('not-a-module');
    const metadata = vol.readFileSync(
      `${changeDir('fix-not-a-module-knowledge-size')}/metadata.yaml`,
      'utf-8',
    ) as string;
    // Named as the subject, never asserted as a module.
    expect(metadata).not.toContain('related_modules');
  });

  it('names the three ways a report can be unusable, distinctly', async () => {
    vol.writeFileSync(`${cwd}/empty.json`, '');
    await expect(execute({ cwd, fromReport: 'empty.json' })).rejects.toThrow(/not found or empty/);

    vol.writeFileSync(`${cwd}/bad.json`, '{ not json');
    await expect(execute({ cwd, fromReport: 'bad.json' })).rejects.toThrow(/not valid JSON/);

    vol.writeFileSync(`${cwd}/wrong.json`, '{"hello":1}');
    const offSchema = execute({ cwd, fromReport: 'wrong.json' });
    await expect(offSchema).rejects.toThrow(/does not match the drift report schema/);
    // Field paths, not a validator dump.
    await expect(offSchema).rejects.toThrow(/structural/);
  });

  it('drafts from a well-formed report file', async () => {
    vol.writeFileSync(
      `${cwd}/report.json`,
      JSON.stringify({
        version: 1,
        generated_at: '2026-08-21T00:00:00Z',
        structural: {
          checks: [{ id: 'knowledge-size', status: 'warn' }],
          findings: [
            {
              check: 'knowledge-size',
              severity: 'warn',
              source_path: 'prospec/ai-knowledge/modules/services/README.md',
              detail: 'Over budget',
            },
          ],
        },
        semantic: { status: 'not-checked' },
        summary: { fail_count: 0, warn_count: 1, skipped_count: 0 },
      }),
    );

    const result = await execute({ cwd, fromReport: 'report.json' });

    expect(result.createdCount).toBe(1);
    expect(result.changes[0]!.name).toBe('fix-services-knowledge-size');
  });

  it('refuses a report source combined with an explicit target, reason or check', async () => {
    for (const manual of [{ target: 'x' }, { reason: 'y' }, { checkId: 'file-paths' }]) {
      await expect(execute({ cwd, fromReport: 'report.json', ...manual })).rejects.toThrow(
        /not both/,
      );
    }
  });

  it('refuses a call with no drift source instead of reporting a clean verdict', async () => {
    await expect(execute({ cwd })).rejects.toBeInstanceOf(PrerequisiteError);
  });

  it('names the missing report rather than reporting nothing to draft', async () => {
    await expect(execute({ cwd, fromReport: 'nope.json' })).rejects.toThrow(/nope\.json/);
  });
});
