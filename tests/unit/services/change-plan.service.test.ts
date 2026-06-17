import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { execute } from '../../../src/services/change-plan.service.js';
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
});

describe('change-plan.service', () => {
  it('should create plan.md and delta-spec.md', async () => {
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

    const result = await execute({ change: 'add-auth', cwd: '/project' });

    expect(result.changeName).toBe('add-auth');
    expect(result.createdFiles).toContain('.prospec/changes/add-auth/plan.md');
    expect(result.createdFiles).toContain('.prospec/changes/add-auth/delta-spec.md');

    // Verify files exist
    expect(fs.existsSync('/project/.prospec/changes/add-auth/plan.md')).toBe(true);
    expect(fs.existsSync('/project/.prospec/changes/add-auth/delta-spec.md')).toBe(true);
  });

  it('should throw PrerequisiteError when proposal.md does not exist', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });
    // the change dir exists, so resolveChange succeeds; the service-level
    // proposal.md guard is what fires — distinct from the change-not-found branch
    vol.mkdirSync('/project/.prospec/changes/add-auth', { recursive: true });

    await expect(
      execute({ change: 'add-auth', cwd: '/project' }),
    ).rejects.toThrow('proposal.md does not exist');
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

    // distinct from the proposal-missing branch: this fails inside resolveChange
    // because the named change directory itself is absent
    await expect(
      execute({ change: 'nonexistent', cwd: '/project' }),
    ).rejects.toThrow("Change 'nonexistent' not found");
    await expect(
      execute({ change: 'nonexistent', cwd: '/project' }),
    ).rejects.toThrow(PrerequisiteError);
  });

  it('should auto-select when only one change exists', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/.prospec/changes/only-one/proposal.md': '# Proposal\n',
      '/project/.prospec/changes/only-one/metadata.yaml': `name: only-one
created_at: "2026-01-01T00:00:00.000Z"
status: story
related_modules: []
description: Only change
`,
    });

    const result = await execute({ cwd: '/project' });
    expect(result.changeName).toBe('only-one');
  });

  it('should update metadata status to plan', async () => {
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

    await execute({ change: 'add-auth', cwd: '/project' });

    const metadataContent = fs.readFileSync(
      '/project/.prospec/changes/add-auth/metadata.yaml',
      'utf-8',
    );
    // status advanced from story → plan (not merely some incidental "plan" substring)
    expect(metadataContent).toContain('status: plan');
    expect(metadataContent).not.toContain('status: story');
  });

  it('should throw in quiet mode with multiple changes', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/.prospec/changes/change-a/proposal.md': '# A\n',
      '/project/.prospec/changes/change-b/proposal.md': '# B\n',
    });

    // pin the quiet+multiple branch: the distinguishing message (and the
    // discovered change names) — not merely the shared PrerequisiteError type,
    // which the adjacent 'No changes found' branches also throw
    await expect(
      execute({ quiet: true, cwd: '/project' }),
    ).rejects.toThrow(PrerequisiteError);
    await expect(
      execute({ quiet: true, cwd: '/project' }),
    ).rejects.toThrow(/Multiple changes found:.*change-a.*change-b/);
  });

  it('refuses to overwrite an existing plan.md without --force', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/.prospec/changes/add-auth/proposal.md': '# Proposal\n',
      '/project/.prospec/changes/add-auth/plan.md': '# hand-edited plan, do not lose\n',
      '/project/.prospec/changes/add-auth/metadata.yaml':
        'name: add-auth\ncreated_at: "2026-01-01"\nstatus: tasks\n',
    });

    await expect(
      execute({ change: 'add-auth', cwd: '/project' }),
    ).rejects.toThrow(PrerequisiteError);
    // the hand-edited plan is untouched
    expect(fs.readFileSync('/project/.prospec/changes/add-auth/plan.md', 'utf-8'))
      .toContain('hand-edited plan');
  });

  it('with --force regenerates but never regresses an advanced status', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/.prospec/changes/add-auth/proposal.md': '# Proposal\n',
      '/project/.prospec/changes/add-auth/plan.md': '# old\n',
      '/project/.prospec/changes/add-auth/metadata.yaml':
        'name: add-auth\ncreated_at: "2026-01-01"\nstatus: verified\n',
    });

    await execute({ change: 'add-auth', force: true, cwd: '/project' });

    const meta = fs.readFileSync('/project/.prospec/changes/add-auth/metadata.yaml', 'utf-8');
    // status stays 'verified' — regenerating the scaffold must not roll it back to 'plan'
    expect(meta).toContain('status: verified');
    expect(meta).not.toContain('status: plan');
  });

  it('with --force overwrites the stale plan.md content with freshly rendered output', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/.prospec/changes/add-auth/proposal.md': '# Proposal\n',
      '/project/.prospec/changes/add-auth/plan.md': '# old stale plan\n',
      '/project/.prospec/changes/add-auth/metadata.yaml':
        'name: add-auth\ncreated_at: "2026-01-01"\nstatus: verified\n',
    });

    await execute({ change: 'add-auth', force: true, cwd: '/project' });

    // the renderTemplate mock returns '# Rendered Template Content\n';
    // proving the atomicWrite under --force actually clobbered the old content
    const plan = fs.readFileSync('/project/.prospec/changes/add-auth/plan.md', 'utf-8');
    expect(plan).toBe('# Rendered Template Content\n');
    expect(plan).not.toContain('old stale plan');
  });

  it('preserves metadata.yaml comments when advancing status (B9)', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/.prospec/changes/add-auth/proposal.md': '# Proposal\n',
      '/project/.prospec/changes/add-auth/metadata.yaml':
        'name: add-auth\n# keep this human note\ncreated_at: "2026-01-01"\nstatus: story\n',
    });

    await execute({ change: 'add-auth', cwd: '/project' });

    const meta = fs.readFileSync('/project/.prospec/changes/add-auth/metadata.yaml', 'utf-8');
    expect(meta).toContain('status: plan');
    expect(meta).toContain('# keep this human note');
  });

  it('falls back to process.cwd() when options.cwd is omitted (L36)', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/proc-cwd');
    try {
      vol.fromJSON({
        '/proc-cwd/.prospec.yaml': 'project:\n  name: test\n',
        '/proc-cwd/.prospec/changes/add-auth/proposal.md': '# Proposal\n',
        '/proc-cwd/.prospec/changes/add-auth/metadata.yaml': `name: add-auth
created_at: "2026-01-01T00:00:00.000Z"
status: story
related_modules: []
description: Add auth
`,
      });

      const result = await execute({ change: 'add-auth' });

      // changeDir is rooted at process.cwd(), proving the ?? fallback was taken
      expect(result.changeDir).toBe('/proc-cwd/.prospec/changes/add-auth');
      expect(fs.existsSync('/proc-cwd/.prospec/changes/add-auth/plan.md')).toBe(true);
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it('creates plan artifacts without metadata.yaml and writes no status (L76 else)', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/.prospec/changes/no-meta/proposal.md': '# Proposal\n',
    });

    const result = await execute({ change: 'no-meta', cwd: '/project' });

    // plan + delta-spec still scaffolded
    expect(result.createdFiles).toContain('.prospec/changes/no-meta/plan.md');
    expect(result.createdFiles).toContain('.prospec/changes/no-meta/delta-spec.md');
    // no metadata to read → no related modules surfaced
    expect(result.relatedModules).toEqual([]);
    // the metadata-write branch is skipped because metaDoc is null:
    // no metadata.yaml is conjured into existence
    expect(fs.existsSync('/project/.prospec/changes/no-meta/metadata.yaml')).toBe(false);
  });

  it('maps related_modules into the template context when present (L84 then)', async () => {
    vi.mocked(renderTemplate).mockClear();
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/.prospec/changes/add-auth/proposal.md': '# Proposal\n',
      '/project/.prospec/changes/add-auth/metadata.yaml': `name: add-auth
created_at: "2026-01-01T00:00:00.000Z"
status: story
related_modules:
  - auth
  - session
description: Add auth
`,
    });

    const result = await execute({ change: 'add-auth', cwd: '/project' });

    // the resolved related_modules are returned verbatim
    expect(result.relatedModules).toEqual(['auth', 'session']);

    // the (name) => ({ name }) map callback shaped the template context
    const [, context] = vi.mocked(renderTemplate).mock.calls[0]!;
    expect(context).toMatchObject({
      change_name: 'add-auth',
      related_modules: [{ name: 'auth' }, { name: 'session' }],
    });
  });

  it('passes related_modules as undefined to the template when empty (L84 else)', async () => {
    vi.mocked(renderTemplate).mockClear();
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

    await execute({ change: 'add-auth', cwd: '/project' });

    const [, context] = vi.mocked(renderTemplate).mock.calls[0]! as [string, Record<string, unknown>];
    expect(context.related_modules).toBeUndefined();
  });
});
