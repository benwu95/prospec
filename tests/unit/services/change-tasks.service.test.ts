import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { execute } from '../../../src/services/change-tasks.service.js';
import { renderTemplate } from '../../../src/lib/template.js';
import { PrerequisiteError, ConfigNotFound } from '../../../src/types/errors.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

vi.mock('../../../src/lib/template.js', () => ({
  renderTemplate: vi.fn().mockReturnValue('# Rendered Template Content\n'),
  registerPartial: vi.fn(),
  registerPartialFromFile: vi.fn(),
  registerHelper: vi.fn(),
}));

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
}));

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  vi.mocked(renderTemplate).mockReturnValue('# Rendered Template Content\n');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('change-tasks.service', () => {
  it('should create tasks.md', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/.prospec/changes/add-auth/proposal.md': '# Proposal\n',
      '/project/.prospec/changes/add-auth/plan.md': '# Plan\n',
      '/project/.prospec/changes/add-auth/metadata.yaml': `name: add-auth
created_at: "2026-01-01T00:00:00.000Z"
status: plan
related_modules: []
description: Add auth
`,
    });

    const result = await execute({ change: 'add-auth', cwd: '/project' });

    expect(result.changeName).toBe('add-auth');
    expect(result.createdFiles).toContain('.prospec/changes/add-auth/tasks.md');
    expect(fs.existsSync('/project/.prospec/changes/add-auth/tasks.md')).toBe(true);
  });

  it('should throw PrerequisiteError when plan.md does not exist', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/.prospec/changes/add-auth/proposal.md': '# Proposal\n',
      '/project/.prospec/changes/add-auth/metadata.yaml': `name: add-auth
created_at: "2026-01-01T00:00:00.000Z"
status: story
related_modules: []
description: Add auth
`,
    });

    await expect(
      execute({ change: 'add-auth', cwd: '/project' }),
    ).rejects.toThrow(PrerequisiteError);
  });

  it('should throw ConfigNotFound when .prospec.yaml is missing', async () => {
    vol.fromJSON({}, '/');
    vol.mkdirSync('/project', { recursive: true });

    await expect(
      execute({ change: 'add-auth', cwd: '/project' }),
    ).rejects.toThrow(ConfigNotFound);
  });

  it('should throw PrerequisiteError when change does not exist', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });

    await expect(
      execute({ change: 'nonexistent', cwd: '/project' }),
    ).rejects.toThrow(PrerequisiteError);
  });

  it('should auto-select when only one change exists', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/.prospec/changes/only-one/proposal.md': '# Proposal\n',
      '/project/.prospec/changes/only-one/plan.md': '# Plan\n',
      '/project/.prospec/changes/only-one/metadata.yaml': `name: only-one
created_at: "2026-01-01T00:00:00.000Z"
status: plan
related_modules: []
description: Only change
`,
    });

    const result = await execute({ cwd: '/project' });
    expect(result.changeName).toBe('only-one');
  });

  it('should update metadata status to tasks', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/.prospec/changes/add-auth/proposal.md': '# Proposal\n',
      '/project/.prospec/changes/add-auth/plan.md': '# Plan\n',
      '/project/.prospec/changes/add-auth/metadata.yaml': `name: add-auth
created_at: "2026-01-01T00:00:00.000Z"
status: plan
related_modules: []
description: Add auth
`,
    });

    await execute({ change: 'add-auth', cwd: '/project' });

    const metadataContent = fs.readFileSync(
      '/project/.prospec/changes/add-auth/metadata.yaml',
      'utf-8',
    );
    // The forward-only advance must rewrite the exact status line, not merely
    // leave the word "tasks" lying around somewhere.
    expect(metadataContent).toContain('status: tasks');
    expect(metadataContent).not.toContain('status: plan');
    // Comments/field order are preserved (Document write, not toJS round-trip),
    // so the rest of the metadata survives the status bump.
    expect(metadataContent).toContain('name: add-auth');
    expect(metadataContent).toContain('description: Add auth');
  });

  it('should throw in quiet mode with multiple changes', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/.prospec/changes/change-a/plan.md': '# A\n',
      '/project/.prospec/changes/change-b/plan.md': '# B\n',
    });

    await expect(
      execute({ quiet: true, cwd: '/project' }),
    ).rejects.toThrow(PrerequisiteError);
  });

  // L36 binary-expr#1: options.cwd is undefined → falls back to process.cwd()
  it('should fall back to process.cwd() when cwd option is omitted', async () => {
    vol.fromJSON({
      '/cwdroot/.prospec.yaml': 'project:\n  name: test\n',
      '/cwdroot/.prospec/changes/cwd-change/plan.md': '# Plan\n',
      '/cwdroot/.prospec/changes/cwd-change/metadata.yaml': `name: cwd-change
created_at: "2026-01-01T00:00:00.000Z"
status: plan
related_modules: []
description: cwd change
`,
    });
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/cwdroot');

    const result = await execute({ change: 'cwd-change' });

    expect(cwdSpy).toHaveBeenCalled();
    expect(result.changeName).toBe('cwd-change');
    expect(result.changeDir).toBe('/cwdroot/.prospec/changes/cwd-change');
    expect(fs.existsSync('/cwdroot/.prospec/changes/cwd-change/tasks.md')).toBe(true);
  });

  // L63 if#0: tasks.md already present and force not set → refuse to clobber
  it('should throw PrerequisiteError when tasks.md already exists without force', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/.prospec/changes/add-auth/plan.md': '# Plan\n',
      '/project/.prospec/changes/add-auth/tasks.md': '# Existing tasks with progress\n- [x] done\n',
      '/project/.prospec/changes/add-auth/metadata.yaml': `name: add-auth
created_at: "2026-01-01T00:00:00.000Z"
status: plan
related_modules: []
description: Add auth
`,
    });

    await expect(
      execute({ change: 'add-auth', cwd: '/project' }),
    ).rejects.toThrow(PrerequisiteError);

    // The existing file must be left untouched (no silent overwrite).
    expect(
      fs.readFileSync('/project/.prospec/changes/add-auth/tasks.md', 'utf-8'),
    ).toContain('Existing tasks with progress');
  });

  // L63 if#0 else-side (!options.force short-circuits): force overwrites the file
  it('should overwrite an existing tasks.md when force is set', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/.prospec/changes/add-auth/plan.md': '# Plan\n',
      '/project/.prospec/changes/add-auth/tasks.md': '# Existing tasks with progress\n',
      '/project/.prospec/changes/add-auth/metadata.yaml': `name: add-auth
created_at: "2026-01-01T00:00:00.000Z"
status: plan
related_modules: []
description: Add auth
`,
    });

    const result = await execute({ change: 'add-auth', cwd: '/project', force: true });

    expect(result.createdFiles).toContain('.prospec/changes/add-auth/tasks.md');
    expect(
      fs.readFileSync('/project/.prospec/changes/add-auth/tasks.md', 'utf-8'),
    ).toBe('# Rendered Template Content\n');
  });

  // L75 cond-expr#1 (metaDoc null) + L95 if#1 (metaDoc falsy → no status write):
  // metadata.yaml absent → relatedModules defaults to [] and no metadata write happens.
  it('should proceed with empty modules and no metadata write when metadata.yaml is missing', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/.prospec/changes/no-meta/plan.md': '# Plan\n',
    });

    const result = await execute({ change: 'no-meta', cwd: '/project' });

    expect(result.relatedModules).toEqual([]);
    expect(fs.existsSync('/project/.prospec/changes/no-meta/tasks.md')).toBe(true);
    // No metadata.yaml existed and none must be created by this run.
    expect(fs.existsSync('/project/.prospec/changes/no-meta/metadata.yaml')).toBe(false);
    // Template context built from the empty-modules branch → related_modules undefined.
    const ctx = vi.mocked(renderTemplate).mock.calls[0]![1] as {
      change_name: string;
      related_modules?: unknown;
    };
    expect(ctx.related_modules).toBeUndefined();
  });

  // L83 cond-expr#0 + anonymous_1 (the .map callback): non-empty related_modules
  // are mapped to { name } objects and surfaced both in the result and template context.
  it('should map non-empty related_modules into the result and template context', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/.prospec/changes/multi-mod/plan.md': '# Plan\n',
      '/project/.prospec/changes/multi-mod/metadata.yaml': `name: multi-mod
created_at: "2026-01-01T00:00:00.000Z"
status: plan
related_modules:
  - auth
  - billing
description: multi module
`,
    });

    const result = await execute({ change: 'multi-mod', cwd: '/project' });

    expect(result.relatedModules).toEqual(['auth', 'billing']);
    const ctx = vi.mocked(renderTemplate).mock.calls[0]![1] as {
      related_modules?: Array<{ name: string }>;
    };
    expect(ctx.related_modules).toEqual([{ name: 'auth' }, { name: 'billing' }]);
  });

  // L77 `?? []` with a present metaDoc: metadata exists but omits related_modules.
  // Distinct from the missing-metadata case — here metaDoc is truthy so the status
  // write still fires, while related_modules falls back to [] (→ ctx undefined).
  it('should default related_modules to [] when metadata omits the key', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/.prospec/changes/no-mods/plan.md': '# Plan\n',
      '/project/.prospec/changes/no-mods/metadata.yaml': `name: no-mods
created_at: "2026-01-01T00:00:00.000Z"
status: plan
description: no modules key
`,
    });

    const result = await execute({ change: 'no-mods', cwd: '/project' });

    expect(result.relatedModules).toEqual([]);
    const ctx = vi.mocked(renderTemplate).mock.calls[0]![1] as {
      related_modules?: unknown;
    };
    expect(ctx.related_modules).toBeUndefined();
    // metaDoc is truthy → forward-only advance still runs.
    const metadataContent = fs.readFileSync(
      '/project/.prospec/changes/no-mods/metadata.yaml',
      'utf-8',
    );
    expect(metadataContent).toContain('status: tasks');
  });

  // L95 if#1 (isStatusBefore false side): status already at/after 'tasks' must not
  // regress — the metadata write is skipped entirely.
  it('should not regress status when metadata is already past tasks', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/.prospec/changes/ahead/plan.md': '# Plan\n',
      '/project/.prospec/changes/ahead/metadata.yaml': `name: ahead
created_at: "2026-01-01T00:00:00.000Z"
status: implemented
related_modules: []
description: already ahead
`,
    });

    await execute({ change: 'ahead', cwd: '/project', force: true });

    const metadataContent = fs.readFileSync(
      '/project/.prospec/changes/ahead/metadata.yaml',
      'utf-8',
    );
    expect(metadataContent).toContain('status: implemented');
    expect(metadataContent).not.toContain('status: tasks');
  });
});

// REQ-SERVICES-076: the station asks the forbidden-artifact registry instead of
// assuming every change has a plan.
describe('change-tasks.service light-scale contract', () => {
  const changeDir = '/project/.prospec/changes/light';
  const metadata = (scale?: string, status = 'story') =>
    `name: light
created_at: "2026-01-01T00:00:00.000Z"
status: ${status}
related_modules: []
description: light change
${scale ? `scale: ${scale}\n` : ''}`;

  it('scaffolds tasks.md under quick with no plan.md, advancing story → tasks', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      [`${changeDir}/proposal.md`]: '# Proposal\n',
      [`${changeDir}/metadata.yaml`]: metadata('quick'),
    });

    const result = await execute({ change: 'light', cwd: '/project' });

    expect(result.createdFiles).toContain('.prospec/changes/light/tasks.md');
    expect(fs.existsSync(`${changeDir}/tasks.md`)).toBe(true);
    // The quick contract forbids these two — skipping the prerequisite must not
    // start producing them.
    expect(fs.existsSync(`${changeDir}/plan.md`)).toBe(false);
    expect(fs.existsSync(`${changeDir}/delta-spec.md`)).toBe(false);
    expect(fs.readFileSync(`${changeDir}/metadata.yaml`, 'utf-8')).toContain('status: tasks');
  });

  it.each(['standard', 'full'])(
    'still refuses a missing plan.md under %s',
    async (scale) => {
      vol.fromJSON({
        '/project/.prospec.yaml': 'project:\n  name: test\n',
        [`${changeDir}/proposal.md`]: '# Proposal\n',
        [`${changeDir}/metadata.yaml`]: metadata(scale),
      });

      await expect(execute({ change: 'light', cwd: '/project' })).rejects.toThrow(
        /plan\.md does not exist/,
      );
      expect(fs.existsSync(`${changeDir}/tasks.md`)).toBe(false);
    },
  );

  it('refuses a missing plan.md when metadata.yaml is absent — unknown scale relaxes nothing', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      [`${changeDir}/proposal.md`]: '# Proposal\n',
    });

    await expect(execute({ change: 'light', cwd: '/project' })).rejects.toThrow(
      /plan\.md does not exist/,
    );
    expect(fs.existsSync(`${changeDir}/tasks.md`)).toBe(false);
  });

  it('refuses backfill for its own reason, not for a missing plan.md', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      [`${changeDir}/proposal.md`]: '# Proposal\n',
      [`${changeDir}/delta-spec.md`]: '# Delta\n',
      // status `story`, not `implemented`: at `implemented` the forward-only
      // guard would block the metadata write anyway, so the byte-identical
      // claim below would hold for the wrong reason.
      [`${changeDir}/metadata.yaml`]: metadata('backfill'),
    });
    const before = fs.readFileSync(`${changeDir}/metadata.yaml`, 'utf-8');

    await expect(execute({ change: 'light', cwd: '/project' })).rejects.toThrow(
      /tasks\.md must not exist under `scale: backfill`/,
    );
    // Refuse before writing: no product, and metadata byte-identical.
    expect(fs.existsSync(`${changeDir}/tasks.md`)).toBe(false);
    expect(fs.readFileSync(`${changeDir}/metadata.yaml`, 'utf-8')).toBe(before);
  });

  // The contract refusal must win over BOTH later prerequisites, or the user is
  // told to use --force (or to write a proposal) for a station that will never
  // apply to this change.
  it('refuses backfill ahead of the clobber and proposal checks', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      [`${changeDir}/tasks.md`]: '# Stray tasks\n',
      [`${changeDir}/metadata.yaml`]: metadata('backfill'),
    });

    await expect(execute({ change: 'light', cwd: '/project' })).rejects.toThrow(
      /tasks\.md must not exist under `scale: backfill`/,
    );
    expect(fs.readFileSync(`${changeDir}/tasks.md`, 'utf-8')).toBe('# Stray tasks\n');
  });

  // Skipping the plan.md prerequisite must not leave the station with NO input
  // prerequisite: quick decomposes FROM proposal.md, so its absence is a refusal.
  it('refuses quick when proposal.md — its decomposition source — is missing', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      [`${changeDir}/metadata.yaml`]: metadata('quick'),
    });

    await expect(execute({ change: 'light', cwd: '/project' })).rejects.toThrow(
      /proposal\.md does not exist/,
    );
    expect(fs.existsSync(`${changeDir}/tasks.md`)).toBe(false);
    expect(fs.readFileSync(`${changeDir}/metadata.yaml`, 'utf-8')).toContain('status: story');
  });

  it('refuses backfill even when a plan.md happens to exist', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      [`${changeDir}/proposal.md`]: '# Proposal\n',
      [`${changeDir}/plan.md`]: '# Stray plan\n',
      [`${changeDir}/metadata.yaml`]: metadata('backfill', 'implemented'),
    });

    await expect(execute({ change: 'light', cwd: '/project' })).rejects.toThrow(
      /scale: backfill/,
    );
    expect(fs.existsSync(`${changeDir}/tasks.md`)).toBe(false);
  });
});
