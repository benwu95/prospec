import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { execute, type RelatedModule } from '../../../src/services/change-story.service.js';
import { AlreadyExistsError, ConfigNotFound, PrerequisiteError } from '../../../src/types/errors.js';
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

    const result = await execute({ relatedModules: ['auth'],
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

    const metaRaw = fs.readFileSync('/project/.prospec/changes/add-auth/metadata.yaml', 'utf-8');
    const parsedMeta = parseYaml(metaRaw) as Record<string, unknown>;
    expect(parsedMeta.premise_version).toBe(1);
    expect(parsedMeta.acceptance).toEqual({ version: 1, revisions: [] });
  });

  it('should throw AlreadyExistsError when change directory exists', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });
    vol.mkdirSync('/project/.prospec/changes/add-auth', { recursive: true });

    await expect(
      execute({ relatedModules: ['auth'], name: 'add-auth', cwd: '/project' }),
    ).rejects.toThrow(AlreadyExistsError);
  });

  it('should throw ConfigNotFound when .prospec.yaml is missing', async () => {
    vol.fromJSON({}, '/');
    vol.mkdirSync('/project', { recursive: true });

    await expect(
      execute({ relatedModules: ['auth'], name: 'add-auth', cwd: '/project' }),
    ).rejects.toThrow(ConfigNotFound);
  });

  it('includes a provided description in the result and the written metadata.yaml', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });

    const result = await execute({ relatedModules: [],
      name: 'add-feature',
      description: 'A new feature',
      cwd: '/project',
    });

    expect(result.description).toBe('A new feature');

    // The description must be serialized into metadata.yaml, not just echoed back.
    const metadata = parseYaml<{ description?: string }>(
      fs.readFileSync('/project/.prospec/changes/add-feature/metadata.yaml', 'utf-8'),
    );
    expect(metadata.description).toBe('A new feature');
  });

  it('omits description from metadata.yaml and result when none is provided', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });

    const result = await execute({ relatedModules: [],
      name: 'no-desc-feature',
      cwd: '/project',
    });

    expect(result.description).toBeUndefined();

    // The `...(options.description ? {...} : {})` branch must drop the key entirely.
    const metadata = parseYaml<Record<string, unknown>>(
      fs.readFileSync('/project/.prospec/changes/no-desc-feature/metadata.yaml', 'utf-8'),
    );
    expect('description' in metadata).toBe(false);
  });

  it('reads declared module descriptions from the canonical 7-column layout', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test
knowledge:
  base_path: prospec/ai-knowledge
`,
      // Canonical 7 columns with populated Aliases/Rationale — the column shift
      // that the old filter-empties + cells[3] parser misread (cells[3] = Status).
      '/project/prospec/index.md': `# Module Index

| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
|--------|----------|---------|--------|-------------|-----------|------------|
| auth | auth, authentication, login | 認證 | Active | Authentication module | core security boundary | |
| users | users, profile | 使用者 | Active | User management | crud domain | auth |
`,
    });

    const result = await execute({ relatedModules: ['auth'],
      name: 'update-auth-flow',
      cwd: '/project',
    });

    expect(result.relatedModules.some((m) => m.name === 'auth')).toBe(true);
    // Description must come from the Description column, not Status/Aliases.
    expect(result.relatedModules.find((m) => m.name === 'auth')?.description).toBe(
      'Authentication module',
    );
  });

  // A generated index.md renders the Module column bold. Forwarding the cell
  // verbatim produced `**auth**` in metadata (unresolvable as a module directory)
  // and `****auth****` in the proposal, since the template bolds it again.
  it('takes the bare module name from a bold Module cell, as the generated index writes it', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/prospec/index.md': `# Module Index

| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
|--------|----------|---------|--------|-------------|-----------|------------|
| **auth** | auth, authentication, login | 認證 | Active | Authentication module | core security boundary | |
`,
    });

    // mock.calls accumulate across tests in this file — clear so the assertion
    // below reads THIS execute()'s context, not an earlier test's.
    vi.mocked(renderTemplate).mockClear();

    const result = await execute({ relatedModules: ['auth'], name: 'update-auth-flow', cwd: '/project' });

    expect(result.relatedModules.map((m) => m.name)).toEqual(['auth']);

    const metadata = vol.readFileSync(
      '/project/.prospec/changes/update-auth-flow/metadata.yaml',
      'utf-8',
    ) as string;
    const relatedBlock = metadata.slice(metadata.indexOf('related_modules:'));
    expect(relatedBlock).toContain('- auth');
    expect(relatedBlock).not.toContain('*');

    // The proposal template bolds the name itself, so the context must carry it
    // bare — otherwise the rendered line reads `****auth****`. (The rendered
    // output is asserted in the integration test; renderTemplate is mocked here.)
    const proposalCtx = vi
      .mocked(renderTemplate)
      .mock.calls.find(([name]) => name === 'change/proposal.md.hbs')?.[1] as
      | { related_modules?: { name: string }[] }
      | undefined;
    expect(proposalCtx?.related_modules?.map((m) => m.name)).toEqual(['auth']);
  });

  it('reads declared module descriptions from a custom paths.base_dir index (never the default prospec/)', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test
paths:
  base_dir: docs
`,
      '/project/docs/index.md': `# Module Index

| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
|--------|----------|---------|--------|-------------|-----------|------------|
| auth | auth, authentication, login | 認證 | Active | Authentication module | core security boundary | |
`,
    });

    const result = await execute({ relatedModules: ['auth'],
      name: 'update-auth-flow',
      cwd: '/project',
    });

    expect(result.relatedModules.some((m) => m.name === 'auth')).toBe(true);
  });

  it('does not drop a data row whose Description cell contains --- (B11)', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\nknowledge:\n  base_path: prospec/ai-knowledge\n',
      '/project/prospec/index.md': `# Module Index

| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
|--------|----------|---------|--------|-------------|-----------|------------|
| auth | auth, login | 認證 | Active | Handles login --- and logout flows | security | |
`,
    });

    const result = await execute({ relatedModules: ['auth'], name: 'update-auth', cwd: '/project' });

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
      '/project/prospec/index.md': `# Module Index

| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
|--------|----------|---------|--------|-------------|-----------|------------|
| auth | auth, login | 認證 | Active | Authentication module | core | |

## Loading Rules

| Layer | Files | When to Load | Token Budget |
|-------|-------|-------------|-------------|
| L0 | index.md + _conventions.md | Every conversation | ≤ 1,500 tokens total |
| L1 | modules/{name}/README.md | On demand | ≤ 400 tokens |
`,
    });

    const result = await execute({ relatedModules: ['auth'],
      name: 'add-auth-tokens',
      cwd: '/project',
    });

    expect(result.relatedModules.every((m) => m.name === 'auth')).toBe(true);
    expect(result.relatedModules.some((m) => /L0|L1|index\.md/.test(m.name))).toBe(false);
  });

  it('preserves explicit empty scope when the index contains blank rows and keywords', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test
knowledge:
  base_path: prospec/ai-knowledge
`,
      '/project/prospec/index.md': `# Module Index

| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
|--------|----------|---------|--------|-------------|-----------|------------|
| billing | payment, | 帳務 | Active | Billing module | money | |
|  | auth | 別名 | Active | No module name | x | |
`,
    });

    const result = await execute({ relatedModules: [], name: 'update-auth-flow', cwd: '/project' });

    expect(result.relatedModules.some((m) => m.name === 'billing')).toBe(false);
    expect(result.relatedModules.some((m) => m.name === '')).toBe(false);
  });

  it('should return empty related modules when index.md does not exist', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });

    const result = await execute({ relatedModules: [],
      name: 'add-feature',
      cwd: '/project',
    });

    expect(result.relatedModules).toEqual([]);
  });

  it('writes metadata.yaml with name, status "story", an ISO created_at, and explicit empty related_modules', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });

    await execute({ relatedModules: [],
      name: 'new-feature',
      cwd: '/project',
    });

    const metadata = parseYaml<{
      name: string;
      status: string;
      created_at: string;
      related_modules?: unknown;
    }>(
      fs.readFileSync('/project/.prospec/changes/new-feature/metadata.yaml', 'utf-8'),
    );
    expect(metadata.name).toBe('new-feature');
    expect(metadata.status).toBe('story');
    // created_at is `new Date().toISOString()` — assert it parses as a real ISO date.
    expect(new Date(metadata.created_at).toISOString()).toBe(metadata.created_at);

    expect(metadata.related_modules).toEqual([]);
  });

  it('writes declared related_modules into metadata.yaml as a name array', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\nknowledge:\n  base_path: prospec/ai-knowledge\n',
      '/project/prospec/index.md': `# Module Index

| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
|--------|----------|---------|--------|-------------|-----------|------------|
| auth | auth, login | 認證 | Active | Authentication module | core | |
`,
    });

    await execute({ relatedModules: ['auth'], name: 'update-auth-flow', cwd: '/project' });

    const metadata = parseYaml<{ related_modules?: string[] }>(
      fs.readFileSync('/project/.prospec/changes/update-auth-flow/metadata.yaml', 'utf-8'),
    );

    expect(metadata.related_modules).toEqual(['auth']);
  });
});

describe('change-story metadata YAML escaping', () => {
  it('round-trips a quoted --description through metadata.yaml exactly', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });
    vi.mocked(renderTemplate).mockClear();

    await execute({ relatedModules: [],
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

  it('passes declared related_modules into the proposal template context (and undefined when none)', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\nknowledge:\n  base_path: prospec/ai-knowledge\n',
      '/project/prospec/index.md': `# Module Index

| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
|--------|----------|---------|--------|-------------|-----------|------------|
| auth | auth, login | 認證 | Active | Authentication module | core | |
`,
    });
    vi.mocked(renderTemplate).mockClear();

    await execute({ relatedModules: ['auth'], name: 'update-auth-flow', cwd: '/project' });

    const matchedCtx = vi
      .mocked(renderTemplate)
      .mock.calls.find(([name]) => name === 'change/proposal.md.hbs')![1] as {
      related_modules?: RelatedModule[];
    };
    // `relatedModules.length > 0 ? relatedModules : undefined` — non-empty branch.
    expect(matchedCtx.related_modules).toEqual([
      { name: 'auth', description: 'Authentication module' },
    ]);


    vol.reset();
    vol.fromJSON({ '/p2/.prospec.yaml': 'project:\n  name: test\n' });
    vi.mocked(renderTemplate).mockClear();

    await execute({ relatedModules: [], name: 'standalone-thing', cwd: '/p2' });

    const emptyCtx = vi
      .mocked(renderTemplate)
      .mock.calls.find(([name]) => name === 'change/proposal.md.hbs')![1] as {
      related_modules?: RelatedModule[];
    };
    expect(emptyCtx.related_modules).toBeUndefined();
  });

  it('preserves a multi-line description verbatim', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });

    await execute({ relatedModules: [],
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

describe('change-story branch coverage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to process.cwd() when no cwd option is given (L39)', async () => {
    // L39 binary-expr#1: options.cwd ?? process.cwd() — exercise the fallback by
    // omitting cwd and pointing process.cwd() at a memfs root that holds config.
    vol.fromJSON({
      '/fallback-root/.prospec.yaml': 'project:\n  name: test\n',
    });
    vi.spyOn(process, 'cwd').mockReturnValue('/fallback-root');

    const result = await execute({ relatedModules: [], name: 'cwd-fallback' });

    // The change resolves under the process.cwd() root, proving the fallback ran.
    expect(result.changeDir).toBe('/fallback-root/.prospec/changes/cwd-fallback');
    expect(fs.existsSync('/fallback-root/.prospec/changes/cwd-fallback/proposal.md')).toBe(
      true,
    );
    expect(fs.existsSync('/fallback-root/.prospec/changes/cwd-fallback/metadata.yaml')).toBe(
      true,
    );
  });

  it('preserves explicit empty scope for single-character change names', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\nknowledge:\n  base_path: prospec/ai-knowledge\n',
      '/project/prospec/index.md': `# Module Index

| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
|--------|----------|---------|--------|-------------|-----------|------------|
| a | a, b, c | 別名 | Active | Single-letter keyword module | x | |
`,
    });

    const result = await execute({ relatedModules: [], name: 'a-b-c', cwd: '/project' });

    expect(result.relatedModules).toEqual([]);
  });

  it('reads a declared module description even when its Keywords cell is empty', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\nknowledge:\n  base_path: prospec/ai-knowledge\n',
      '/project/prospec/index.md': `# Module Index

| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
|--------|----------|---------|--------|-------------|-----------|------------|
| nokeys |  | 別名 | Active | Has a name but no keywords | x | |
| auth | auth, login | 認證 | Active | Authentication module | core | |
`,
    });

    const result = await execute({ relatedModules: ['nokeys'], name: 'update-auth-flow', cwd: '/project' });

    expect(result.relatedModules).toEqual([{ name: 'nokeys', description: 'Has a name but no keywords' }]);
  });
});

describe('explicit related modules (--related-module)', () => {
  it('persists the caller-named modules without an index', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });
    const result = await execute({
      name: 'promote-widget',
      cwd: '/project',
      relatedModules: ['services', 'cli'],
    });
    expect(result.relatedModules.map((m) => m.name)).toEqual(['services', 'cli']);
    const metadata = vol.readFileSync(
      '/project/.prospec/changes/promote-widget/metadata.yaml',
      'utf-8',
    ) as string;
    expect(metadata).toContain('- services');
    expect(metadata).toContain('- cli');
  });
});

/**
 * The issue registration (issue #131) — the mechanical carrier for the
 * one-issue-one-change-one-PR convention. Shape-free and never validated; the
 * only contract is that an absent registration leaves no trace in the YAML.
 */
describe('issue registration (--issue)', () => {
  beforeEach(() => {
    vol.fromJSON({ '/project/.prospec.yaml': 'project:\n  name: test\n' });
  });

  it('writes the reference and round-trips a value that would read as a YAML comment', async () => {
    await execute({ relatedModules: [], name: 'add-widget', cwd: '/project', issue: '#131' });

    const raw = fs.readFileSync('/project/.prospec/changes/add-widget/metadata.yaml', 'utf-8');
    // Unquoted, `#131` opens a comment and the whole value is lost on read-back.
    expect(raw).toContain('issue: "#131"');
    const metadata = parseYaml<{ issue?: string }>(raw);
    expect(metadata.issue).toBe('#131');
  });

  it.each([
    ['https://github.com/benwu95/prospec/issues/131', 'a full URL'],
    ['ABC-123', 'another tracker id'],
  ])('stores %s verbatim — no forge is assumed (%s)', async (value) => {
    await execute({ relatedModules: [], name: 'add-widget', cwd: '/project', issue: value });

    const metadata = parseYaml<{ issue?: string }>(
      fs.readFileSync('/project/.prospec/changes/add-widget/metadata.yaml', 'utf-8'),
    );
    expect(metadata.issue).toBe(value);
  });

  it('omits the key when no issue is given', async () => {
    await execute({ relatedModules: [], name: 'add-widget', cwd: '/project' });

    const metadata = parseYaml<Record<string, unknown>>(
      fs.readFileSync('/project/.prospec/changes/add-widget/metadata.yaml', 'utf-8'),
    );
    expect('issue' in metadata).toBe(false);
  });

  // A blank flag value is the shape a shell expansion produces (`--issue "$REF"`
  // with REF unset); recording it as `issue: ""` would assert a registration
  // that was never made.
  it.each(['', '   '])('treats a blank value (%j) as no registration', async (blank) => {
    await execute({ relatedModules: [], name: 'add-widget', cwd: '/project', issue: blank });

    const metadata = parseYaml<Record<string, unknown>>(
      fs.readFileSync('/project/.prospec/changes/add-widget/metadata.yaml', 'utf-8'),
    );
    expect('issue' in metadata).toBe(false);
  });
});

describe('change-story.service metadata validation ordering', () => {
  const cwd = '/proj';

  beforeEach(() => {
    vol.reset();
    vol.fromJSON(
      {
        '.prospec.yaml': [
          'version: "1.0"',
          'project:',
          '  name: p',
          'paths:',
          '  base_dir: prospec',
          'tech_stack:',
          '  language: typescript',
          '',
        ].join('\n'),
        'prospec/index.md': '# Index\n',
      },
      cwd,
    );
  });

  it('refuses invalid metadata BEFORE writing anything, leaving no half a change', async () => {
    // `BareModuleNameSchema` rejects markdown emphasis. Validating inside the
    // write helper would refuse this too — but only after proposal.md landed,
    // leaving a directory the scan reports as an error and the idempotency
    // guard then refuses to re-draft.
    await expect(
      execute({ cwd, name: 'bad-change', relatedModules: ['**types**'] }),
    ).rejects.toThrow();

    // Not just the files — the DIRECTORY too. An empty husk is reported as
    // "already exists" by the collision check, so every later attempt is
    // refused and the change can never be created.
    expect(fs.existsSync(`${cwd}/.prospec/changes/bad-change`)).toBe(false);
  });

  it('applies the same validation under dryRun, so a preview cannot pass what the run refuses', async () => {
    await expect(
      execute({ cwd, name: 'bad-change', relatedModules: ['**types**'], dryRun: true }),
    ).rejects.toThrow();
    expect(fs.existsSync(`${cwd}/.prospec/changes/bad-change`)).toBe(false);
  });

  it('unwinds the directory when a write fails midway, so the change stays re-creatable', async () => {
    // Each write is atomic on its own; the SEQUENCE is not. A leftover directory
    // is reported as "already exists" by presence alone, so the half-change
    // could never be repaired — and one husk silences status's drift signal.
    const realWrite = fs.promises.writeFile.bind(fs.promises);
    const spy = vi.spyOn(fs.promises, 'writeFile').mockImplementation(((
      file: Parameters<typeof realWrite>[0],
      data: Parameters<typeof realWrite>[1],
      options?: Parameters<typeof realWrite>[2],
    ) => {
      if (String(file).includes('metadata.yaml')) {
        return Promise.reject(
          Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' }),
        );
      }
      return realWrite(file, data, options);
    }) as typeof fs.promises.writeFile);

    await expect(execute({ cwd, name: 'half-change', relatedModules: [] })).rejects.toThrow();
    spy.mockRestore();

    expect(fs.existsSync(`${cwd}/.prospec/changes/half-change`)).toBe(false);
    // And the name is still available — the whole point of unwinding.
    await expect(execute({ cwd, name: 'half-change', relatedModules: [] })).resolves.toBeTruthy();
  });

  it('writes both artifacts when the metadata is valid', async () => {
    const result = await execute({ cwd, name: 'good-change', relatedModules: [] });

    expect(result.dryRun).toBe(false);
    expect(fs.existsSync(`${cwd}/.prospec/changes/good-change/proposal.md`)).toBe(true);
    expect(fs.existsSync(`${cwd}/.prospec/changes/good-change/metadata.yaml`)).toBe(true);
  });
});


describe('explicit scope declarations', () => {
  beforeEach(() => {
    vol.fromJSON({ '/project/.prospec.yaml': 'project:\n  name: test\n' });
  });

  it.each([false, true])('refuses omitted scope before artifacts, dryRun=%s', async (dryRun) => {
    await expect(execute({ name: 'add-auth', cwd: '/project', dryRun }))
      .rejects.toBeInstanceOf(PrerequisiteError);
    expect(fs.existsSync('/project/.prospec/changes/add-auth')).toBe(false);
  });

  it.each([null, 'auth', {}])('refuses non-array scope %j without writes', async (relatedModules) => {
    await expect(execute({ name: 'bad-scope', cwd: '/project', relatedModules: relatedModules as never }))
      .rejects.toBeInstanceOf(PrerequisiteError);
    expect(fs.existsSync('/project/.prospec/changes/bad-scope')).toBe(false);
  });

  it('preserves empty scope despite matching keywords in the change name', async () => {
    vol.fromJSON({ '/project/prospec/index.md': '| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |\n|---|---|---|---|---|---|---|\n| auth | auth, add | | Active | Authentication | | |\n' });
    const result = await execute({ name: 'add-auth', cwd: '/project', relatedModules: [] });
    const metadata = parseYaml<Record<string, unknown>>(fs.readFileSync('/project/.prospec/changes/add-auth/metadata.yaml', 'utf-8'));
    expect(result.relatedModules).toEqual([]);
    expect(metadata.related_modules).toEqual([]);
  });

  it('looks up exact names independently of keywords and preserves unregistered new names', async () => {
    vol.fromJSON({ '/project/prospec/index.md': '| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |\n|---|---|---|---|---|---|---|\n| **auth** | credentials | | Active | Authentication | | |\n| authentication | auth | | Active | Other module | | |\n' });
    const result = await execute({ name: 'add-authentication', cwd: '/project', relatedModules: ['auth', 'new-module'] });
    expect(result.relatedModules).toEqual([{ name: 'auth', description: 'Authentication' }, { name: 'new-module', description: '' }]);
    const metadata = parseYaml<Record<string, unknown>>(fs.readFileSync('/project/.prospec/changes/add-authentication/metadata.yaml', 'utf-8'));
    expect(metadata.related_modules).toEqual(['auth', 'new-module']);
  });
});
