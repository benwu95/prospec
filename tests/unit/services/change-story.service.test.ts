import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { execute } from '../../../src/services/change-story.service.js';
import { AlreadyExistsError, ConfigNotFound } from '../../../src/types/errors.js';
import { renderTemplate } from '../../../src/lib/template.js';
import { parseYaml } from '../../../src/lib/yaml-utils.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

vi.mock('../../../src/lib/template.js', () => ({
  renderTemplate: vi.fn().mockImplementation((templateName: string) => {
    if (templateName.includes('metadata')) {
      return 'name: test\nstatus: story\ncreated_at: "2026-01-01T00:00:00.000Z"\nrelated_modules: []\ndescription: Test\n';
    }
    return '# Rendered Template Content\n';
  }),
  registerPartial: vi.fn(),
  registerPartialFromFile: vi.fn(),
  registerHelper: vi.fn(),
}));

beforeEach(() => {
  vol.reset();
});

describe('change-story.service', () => {
  it('should create change directory with proposal.md and metadata.yaml', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });

    const result = await execute({
      name: 'add-auth',
      description: 'Add user authentication',
      cwd: '/project',
    });

    expect(result.changeName).toBe('add-auth');
    expect(result.createdFiles).toContain('.prospec/changes/add-auth/proposal.md');
    expect(result.createdFiles).toContain('.prospec/changes/add-auth/metadata.yaml');

    // Verify files exist
    expect(fs.existsSync('/project/.prospec/changes/add-auth/proposal.md')).toBe(true);
    expect(fs.existsSync('/project/.prospec/changes/add-auth/metadata.yaml')).toBe(true);
  });

  it('should throw AlreadyExistsError when change directory exists', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });
    vol.mkdirSync('/project/.prospec/changes/add-auth', { recursive: true });

    await expect(
      execute({ name: 'add-auth', cwd: '/project' }),
    ).rejects.toThrow(AlreadyExistsError);
  });

  it('should throw ConfigNotFound when .prospec.yaml is missing', async () => {
    vol.fromJSON({}, '/');
    vol.mkdirSync('/project', { recursive: true });

    await expect(
      execute({ name: 'add-auth', cwd: '/project' }),
    ).rejects.toThrow(ConfigNotFound);
  });

  it('should include description in result', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });

    const result = await execute({
      name: 'add-feature',
      description: 'A new feature',
      cwd: '/project',
    });

    expect(result.description).toBe('A new feature');
  });

  it('matches related modules and reads Description from the canonical 7-column layout', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test
knowledge:
  base_path: prospec/ai-knowledge
`,
      // Canonical 7 columns with populated Aliases/Rationale — the column shift
      // that the old filter-empties + cells[3] parser misread (cells[3] = Status).
      '/project/prospec/ai-knowledge/_index.md': `# Module Index

| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
|--------|----------|---------|--------|-------------|-----------|------------|
| auth | auth, authentication, login | 認證 | Active | Authentication module | core security boundary | |
| users | users, profile | 使用者 | Active | User management | crud domain | auth |
`,
    });

    const result = await execute({
      name: 'update-auth-flow',
      cwd: '/project',
    });

    expect(result.relatedModules.some((m) => m.name === 'auth')).toBe(true);
    // Description must come from the Description column, not Status/Aliases.
    expect(result.relatedModules.find((m) => m.name === 'auth')?.description).toBe(
      'Authentication module',
    );
  });

  it('does not drop a data row whose Description cell contains --- (B11)', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\nknowledge:\n  base_path: prospec/ai-knowledge\n',
      '/project/prospec/ai-knowledge/_index.md': `# Module Index

| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
|--------|----------|---------|--------|-------------|-----------|------------|
| auth | auth, login | 認證 | Active | Handles login --- and logout flows | security | |
`,
    });

    const result = await execute({ name: 'update-auth', cwd: '/project' });

    // a '---' inside the Description cell must not be read as a separator row
    expect(result.relatedModules.some((m) => m.name === 'auth')).toBe(true);
    expect(result.relatedModules.find((m) => m.name === 'auth')?.description)
      .toContain('login --- and logout');
  });

  it('skips the Loading Rules table (fewer columns) — no garbage related modules', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test
knowledge:
  base_path: prospec/ai-knowledge
`,
      '/project/prospec/ai-knowledge/_index.md': `# Module Index

| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
|--------|----------|---------|--------|-------------|-----------|------------|
| auth | auth, login | 認證 | Active | Authentication module | core | |

## Loading Rules

| Layer | Files | When to Load | Token Budget |
|-------|-------|-------------|-------------|
| L0 | _index.md + _conventions.md | Every conversation | ≤ 1,500 tokens total |
| L1 | modules/{name}/README.md | On demand | ≤ 400 tokens |
`,
    });

    const result = await execute({
      name: 'add-auth-tokens',
      cwd: '/project',
    });

    expect(result.relatedModules.every((m) => m.name === 'auth')).toBe(true);
    expect(result.relatedModules.some((m) => /L0|L1|index\.md/.test(m.name))).toBe(false);
  });

  it('ignores empty keywords (stray commas) and blank module rows', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test
knowledge:
  base_path: prospec/ai-knowledge
`,
      '/project/prospec/ai-knowledge/_index.md': `# Module Index

| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
|--------|----------|---------|--------|-------------|-----------|------------|
| billing | payment, | 帳務 | Active | Billing module | money | |
|  | auth | 別名 | Active | No module name | x | |
`,
    });

    const result = await execute({ name: 'update-auth-flow', cwd: '/project' });

    // 'payment,' yields an empty keyword that must NOT match every change
    expect(result.relatedModules.some((m) => m.name === 'billing')).toBe(false);
    // a blank Module cell must not produce an empty-named related module
    expect(result.relatedModules.some((m) => m.name === '')).toBe(false);
  });

  it('should return empty related modules when _index.md does not exist', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });

    const result = await execute({
      name: 'add-feature',
      cwd: '/project',
    });

    expect(result.relatedModules).toEqual([]);
  });

  it('should write metadata with status "story"', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });

    await execute({
      name: 'new-feature',
      cwd: '/project',
    });

    const metadataContent = fs.readFileSync(
      '/project/.prospec/changes/new-feature/metadata.yaml',
      'utf-8',
    );
    expect(metadataContent).toContain('story');
  });
});

describe('change-story metadata YAML escaping', () => {
  it('round-trips a quoted --description through metadata.yaml exactly', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });
    vi.mocked(renderTemplate).mockClear();

    await execute({
      name: 'quoted-change',
      description: 'say "review" now',
      cwd: '/project',
    });

    const metadataRaw = fs.readFileSync(
      '/project/.prospec/changes/quoted-change/metadata.yaml',
      'utf-8',
    );
    const metadata = parseYaml<{ name: string; status: string; description: string }>(
      metadataRaw,
    );
    expect(metadata.name).toBe('quoted-change');
    expect(metadata.status).toBe('story');
    expect(metadata.description).toBe('say "review" now');

    const proposalCall = vi
      .mocked(renderTemplate)
      .mock.calls.find(([name]) => name === 'change/proposal.md.hbs');
    expect((proposalCall![1] as { description: string }).description).toBe(
      'say "review" now',
    );
  });

  it('preserves a multi-line description verbatim', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });

    await execute({
      name: 'multiline-change',
      description: 'line1\nline2',
      cwd: '/project',
    });

    const metadata = parseYaml<{ description: string }>(
      fs.readFileSync(
        '/project/.prospec/changes/multiline-change/metadata.yaml',
        'utf-8',
      ),
    );
    expect(metadata.description).toBe('line1\nline2');
  });
});
