import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { execute } from '../../../src/services/init.service.js';
import { AlreadyExistsError } from '../../../src/types/errors.js';
import { renderTemplate } from '../../../src/lib/template.js';
import { input } from '@inquirer/prompts';
import type { ConstitutionRule } from '../../../src/types/constitution.js';
import { INIT_DOC_REGISTRY } from '../../../src/types/conventions.js';

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

vi.mock('node:os', () => ({
  homedir: () => '/home/testuser',
  default: { homedir: () => '/home/testuser' },
}));

vi.mock('@inquirer/prompts', () => ({
  checkbox: vi.fn().mockResolvedValue(['claude']),
  input: vi.fn().mockResolvedValue('prospec'),
  Separator: class Separator {
    constructor(public text?: string) {}
  },
}));

beforeEach(() => {
  vol.reset();
});

describe('init.service', () => {
  it('should create .prospec.yaml and directories', async () => {
    vol.fromJSON({
      '/project/package.json': JSON.stringify({ name: 'test-project' }),
      '/project/tsconfig.json': '{}',
    });

    const result = await execute({
      name: 'test-project',
      agents: ['claude'],
      cwd: '/project',
    });

    expect(result.projectName).toBe('test-project');
    expect(result.selectedAgents).toEqual(['claude']);
    expect(result.createdFiles).toContain('.prospec.yaml');
    expect(result.createdFiles).toContain('prospec/CONSTITUTION.md');
    expect(result.createdFiles).toContain('AGENTS.md');

    // Verify files exist under prospec/ (DEFAULT_BASE_DIR)
    expect(fs.existsSync('/project/.prospec.yaml')).toBe(true);
    expect(fs.existsSync('/project/prospec/CONSTITUTION.md')).toBe(true);
    expect(fs.existsSync('/project/AGENTS.md')).toBe(true);
    expect(fs.existsSync('/project/prospec/index.md')).toBe(true);
    expect(fs.existsSync('/project/prospec/ai-knowledge/_conventions.md')).toBe(true);
    expect(fs.existsSync('/project/prospec/specs/.gitkeep')).toBe(true);

    // Canonical convention docs referenced by skills
    expect(result.createdFiles).toContain('prospec/ai-knowledge/_status-lifecycle.md');
    expect(result.createdFiles).toContain('prospec/ai-knowledge/_module-readme-conventions.md');
    expect(result.createdFiles).toContain('prospec/ai-knowledge/_diagram-conventions.md');
    expect(fs.existsSync('/project/prospec/ai-knowledge/_status-lifecycle.md')).toBe(true);
    expect(fs.existsSync('/project/prospec/ai-knowledge/_module-readme-conventions.md')).toBe(true);
    expect(fs.existsSync('/project/prospec/ai-knowledge/_diagram-conventions.md')).toBe(true);
  });

  it('rejects an unknown --agents value up front (not on the next readConfig)', async () => {
    vol.fromJSON({ '/project/package.json': JSON.stringify({ name: 'test' }) });

    await expect(
      execute({ name: 'test', agents: ['claude', 'foo'], cwd: '/project' }),
    ).rejects.toThrow(/unknown agent\(s\): foo/);
    // failure must not have written a corrupt config
    expect(fs.existsSync('/project/.prospec.yaml')).toBe(false);
  });

  it('should throw AlreadyExistsError when config exists', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: existing\n',
    });

    await expect(
      execute({ name: 'test', agents: ['claude'], cwd: '/project' }),
    ).rejects.toThrow(AlreadyExistsError);
  });

  it('should detect TypeScript tech stack', async () => {
    vol.fromJSON({
      '/project/package.json': JSON.stringify({ name: 'test' }),
      '/project/tsconfig.json': '{}',
    });

    const result = await execute({
      name: 'test',
      agents: [],
      cwd: '/project',
    });

    expect(result.techStack.language).toBe('typescript');
  });

  it('should use project directory name when no name is provided', async () => {
    vol.fromJSON({}, '/');
    vol.mkdirSync('/my-project', { recursive: true });

    const result = await execute({
      agents: ['claude'],
      cwd: '/my-project',
    });

    expect(result.projectName).toBe('my-project');
  });

  it('should skip interactive prompt when agents are provided via options', async () => {
    vol.fromJSON({}, '/');
    vol.mkdirSync('/project', { recursive: true });

    const result = await execute({
      name: 'test',
      agents: ['claude', 'antigravity'],
      cwd: '/project',
    });

    expect(result.selectedAgents).toEqual(['claude', 'antigravity']);
  });

  it('should write valid YAML config', async () => {
    vol.fromJSON({}, '/');
    vol.mkdirSync('/project', { recursive: true });

    await execute({
      name: 'my-app',
      agents: ['claude'],
      cwd: '/project',
    });

    const configContent = fs.readFileSync('/project/.prospec.yaml', 'utf-8');
    expect(configContent).toContain('my-app');
  });

  it('should write paths.base_dir to generated config', async () => {
    vol.fromJSON({}, '/');
    vol.mkdirSync('/project', { recursive: true });

    await execute({
      name: 'test',
      agents: ['claude'],
      cwd: '/project',
    });

    const configContent = fs.readFileSync('/project/.prospec.yaml', 'utf-8');
    // Pin the key/value pairing on one line: proves paths.base_dir resolved to
    // 'prospec' specifically. A bare toContain('prospec') would still pass via
    // knowledge.base_path: prospec/ai-knowledge even if base_dir were dropped.
    expect(configContent).toMatch(/base_dir:\s*prospec/);
  });

  it('passes stack-appropriate example_rules to the Constitution template', async () => {
    vi.clearAllMocks();
    vol.fromJSON({
      '/project/package.json': JSON.stringify({ name: 'test' }),
      '/project/tsconfig.json': '{}',
    });

    await execute({ name: 'test', agents: ['claude'], cwd: '/project' });

    const constitutionCall = vi
      .mocked(renderTemplate)
      .mock.calls.find((c) => c[0] === 'init/constitution.md.hbs');
    expect(constitutionCall).toBeDefined();

    const ctx = constitutionCall![1] as {
      example_rules?: Array<{ severity: string; name: string }>;
    };
    expect(ctx.example_rules?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(
      ctx.example_rules?.every((r) =>
        ['MUST', 'SHOULD', 'MAY'].includes(r.severity),
      ),
    ).toBe(true);

    // TypeScript project (tsconfig.json present) must seed TYPESCRIPT_RULES,
    // not PYTHON_RULES or the language-neutral GENERIC_RULES.
    const ruleNames = ctx.example_rules?.map((r) => r.name) ?? [];
    expect(ruleNames).toContain('No any in public APIs');
    expect(ruleNames).toContain('One-way dependency direction');
    expect(ruleNames).toContain('Validate input at boundaries');
    // GENERIC-only and PYTHON-only markers must be absent for a TS stack.
    expect(ruleNames).not.toContain('No committed secrets');
    expect(ruleNames).not.toContain('Authenticated API endpoints');
  });
});

describe('init.service artifact language', () => {
  beforeEach(() => {
    vol.reset();
    vi.mocked(renderTemplate).mockClear();
  });

  it('uses the --language flag value and writes it to .prospec.yaml', async () => {
    vol.fromJSON({ '/project/package.json': '{}' });

    const result = await execute({
      name: 'test',
      agents: ['claude'],
      language: 'Traditional Chinese (Taiwan)',
      cwd: '/project',
    });

    expect(result.artifactLanguage).toBe('Traditional Chinese (Taiwan)');
    const yaml = fs.readFileSync('/project/.prospec.yaml', 'utf-8');
    expect(yaml).toContain('artifact_language: Traditional Chinese (Taiwan)');
  });

  it('defaults to English in CI mode without a language flag', async () => {
    vol.fromJSON({ '/project/package.json': '{}' });

    const result = await execute({ name: 'test', agents: ['claude'], cwd: '/project' });

    expect(result.artifactLanguage).toBe('English');
    expect(fs.readFileSync('/project/.prospec.yaml', 'utf-8')).toContain(
      'artifact_language: English',
    );
  });

  it('prompts for the language in interactive mode', async () => {
    vol.fromJSON({ '/project/package.json': '{}' });
    vi.mocked(input)
      .mockResolvedValueOnce('prospec')
      .mockResolvedValueOnce('Français');

    const result = await execute({ name: 'test', cwd: '/project' });

    expect(result.artifactLanguage).toBe('Français');
  });

  it('falls back to English when the prompt answer is blank', async () => {
    vol.fromJSON({ '/project/package.json': '{}' });
    vi.mocked(input)
      .mockResolvedValueOnce('prospec')
      .mockResolvedValueOnce('   ');

    const result = await execute({ name: 'test', cwd: '/project' });

    expect(result.artifactLanguage).toBe('English');
  });

  it('seeds the Constitution with the Language Policy rule first', async () => {
    vol.fromJSON({ '/project/package.json': '{}' });

    await execute({
      name: 'test',
      agents: ['claude'],
      language: 'Japanese',
      cwd: '/project',
    });

    const constitutionCall = vi
      .mocked(renderTemplate)
      .mock.calls.find(([name]) => name === 'init/constitution.md.hbs');
    expect(constitutionCall).toBeDefined();
    const ctx = constitutionCall![1] as { example_rules: ConstitutionRule[]; artifact_language: string };
    expect(ctx.artifact_language).toBe('Japanese');
    expect(ctx.example_rules[0].name).toBe('Language Policy');
    expect(ctx.example_rules[0].severity).toBe('MUST');
    expect(ctx.example_rules[0].description).toContain('Japanese');
    expect(ctx.example_rules.length).toBeGreaterThanOrEqual(4);
  });

  it('does not write .prospec.yaml when a template render fails, keeping re-run safe (B10)', async () => {
    vol.fromJSON({ '/project/src/index.ts': '' });
    const mock = vi.mocked(renderTemplate);
    mock.mockImplementation((tpl: string) => {
      if (tpl === 'knowledge/index.md.hbs') throw new Error('render boom');
      return '# Rendered Template Content\n';
    });

    try {
      await expect(
        execute({ name: 'p', agents: ['claude'], cwd: '/project' }),
      ).rejects.toThrow('render boom');
      // .prospec.yaml is the completion marker — a failed init must not leave it,
      // or a re-run would hit AlreadyExistsError and refuse to recover.
      expect(fs.existsSync('/project/.prospec.yaml')).toBe(false);
    } finally {
      mock.mockReset();
      mock.mockReturnValue('# Rendered Template Content\n');
    }
  });
});

describe('init.service per-file idempotency (BL-044)', () => {
  beforeEach(() => {
    vol.reset();
    vi.mocked(renderTemplate).mockReturnValue('# Rendered Template Content\n');
  });

  it('rebuilds .prospec.yaml + merges AGENTS.md while curated trust-zone files stay byte-unchanged', async () => {
    // Prior project; .prospec.yaml deleted to re-run, every other artifact still
    // present with hand-edited content. Trust-zone docs keep skip-if-exists; the
    // managed AGENTS.md merges so its hand-written content survives in the user
    // block instead of being skipped or clobbered (REQ-SETUP-018).
    vol.fromJSON({
      '/project/package.json': '{}',
      '/project/prospec/CONSTITUTION.md': '# CURATED Constitution — do not clobber\n',
      '/project/prospec/ai-knowledge/_conventions.md': '# CURATED conventions\n',
      '/project/prospec/index.md': '# CURATED index\n',
      '/project/prospec/ai-knowledge/_status-lifecycle.md': '# CURATED lifecycle\n',
      '/project/prospec/ai-knowledge/_module-readme-conventions.md': '# CURATED readme conv\n',
      '/project/prospec/ai-knowledge/_diagram-conventions.md': '# CURATED diagram\n',
      '/project/prospec/ai-knowledge/_glossary.md': '# CURATED glossary\n',
      '/project/AGENTS.md': '# CURATED agents\n',
      '/project/prospec/specs/.gitkeep': '',
    });

    const result = await execute({ name: 'test', agents: ['claude'], cwd: '/project' });

    // .prospec.yaml recreated; the managed AGENTS.md is (re)written via merge.
    expect(result.createdFiles).toEqual(['.prospec.yaml', 'AGENTS.md']);

    // Every curated trust-zone file is byte-for-byte unchanged (still skip-if-exists).
    expect(fs.readFileSync('/project/prospec/CONSTITUTION.md', 'utf-8')).toBe(
      '# CURATED Constitution — do not clobber\n',
    );
    expect(fs.readFileSync('/project/prospec/ai-knowledge/_conventions.md', 'utf-8')).toBe(
      '# CURATED conventions\n',
    );
    expect(fs.readFileSync('/project/prospec/index.md', 'utf-8')).toBe(
      '# CURATED index\n',
    );
    expect(fs.readFileSync('/project/prospec/ai-knowledge/_status-lifecycle.md', 'utf-8')).toBe(
      '# CURATED lifecycle\n',
    );

    // The hand-written AGENTS.md content is preserved (migrated into the user block).
    expect(fs.readFileSync('/project/AGENTS.md', 'utf-8')).toContain('# CURATED agents');
  });

  it('rebuilds only the missing files (half-initialized recovery)', async () => {
    vol.fromJSON({
      '/project/package.json': '{}',
      '/project/prospec/CONSTITUTION.md': '# CURATED Constitution\n',
    });

    const result = await execute({ name: 'test', agents: ['claude'], cwd: '/project' });

    // surviving curated file preserved...
    expect(fs.readFileSync('/project/prospec/CONSTITUTION.md', 'utf-8')).toBe(
      '# CURATED Constitution\n',
    );
    expect(result.createdFiles).not.toContain('prospec/CONSTITUTION.md');
    // ...missing ones rebuilt.
    expect(result.createdFiles).toContain('prospec/index.md');
    expect(fs.existsSync('/project/prospec/index.md')).toBe(true);
  });

  it('writes every artifact on a greenfield init (behavior unchanged)', async () => {
    vol.fromJSON({ '/project/package.json': '{}' });

    const result = await execute({ name: 'test', agents: ['claude'], cwd: '/project' });

    expect(result.createdFiles).toContain('prospec/CONSTITUTION.md');
    expect(result.createdFiles).toContain('AGENTS.md');
    expect(result.createdFiles).toContain('prospec/index.md');
    expect(result.createdFiles).toContain('prospec/specs/.gitkeep');
  });

  it('seeds the prospec version into the config `version` field (not a separate prospec_version)', async () => {
    vol.fromJSON({ '/project/package.json': '{}' });

    await execute({ name: 'test', agents: ['claude'], cwd: '/project' });

    const yaml = fs.readFileSync('/project/.prospec.yaml', 'utf-8');
    expect(yaml).toMatch(/version:\s*\d+\.\d+\.\d+/);
    expect(yaml).not.toContain('prospec_version');
  });
});

describe('init.service managed AGENTS.md merge (REQ-SETUP-018)', () => {
  // The real agent-configs/entry.md.hbs carries auto/user blocks; the file-level mock is
  // markerless. Override it so the block structure can be asserted precisely.
  const STUB = `<!-- prospec:auto-start -->
# AI Agents Configuration
run prospec agent sync
<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- placeholder -->
<!-- prospec:user-end -->
`;

  beforeEach(() => {
    vi.mocked(renderTemplate).mockImplementation((name: string) =>
      name === 'agent-configs/entry.md.hbs' ? STUB : '# doc\n',
    );
  });

  afterEach(() => {
    vi.mocked(renderTemplate).mockReset();
    vi.mocked(renderTemplate).mockReturnValue('# Rendered Template Content\n');
  });

  it('greenfield: writes the stub into the auto block with an empty user block', async () => {
    vol.fromJSON({ '/project/package.json': '{}' });

    await execute({ name: 'test', agents: ['claude'], cwd: '/project' });

    // Empty existing → generated stub written verbatim (auto + empty user block).
    expect(fs.readFileSync('/project/AGENTS.md', 'utf-8')).toBe(STUB);
  });

  it('brownfield: migrates an existing AGENTS.md into the user block, stub in auto', async () => {
    vol.fromJSON({
      '/project/package.json': '{}',
      '/project/AGENTS.md': '# my existing agent rules\nrule A\n',
    });

    await execute({ name: 'test', agents: ['claude'], cwd: '/project' });

    const out = fs.readFileSync('/project/AGENTS.md', 'utf-8');
    expect(out).toContain('# AI Agents Configuration'); // stub in auto block
    expect(out).toContain('rule A');                    // existing preserved
    // ...and the existing content sits inside the user block.
    expect(out.indexOf('<!-- prospec:user-start -->')).toBeLessThan(out.indexOf('rule A'));
    expect(out.indexOf('rule A')).toBeLessThan(out.indexOf('<!-- prospec:user-end -->'));
  });
});

// Issue #48 drift guard: what init actually writes must equal what
// INIT_DOC_REGISTRY declares (plus the non-doc artifacts), in BOTH directions —
// a doc added to init but not the registry (or vice versa) turns this red, so
// the upgrade docs inventory can never silently miss an init-created file.
describe('init.service ⇄ INIT_DOC_REGISTRY equality (issue #48)', () => {
  it('greenfield init creates exactly the registry docs plus .prospec.yaml, AGENTS.md, specs/.gitkeep', async () => {
    vol.fromJSON({ '/project/package.json': '{}' });

    await execute({ name: 'test', agents: ['claude'], cwd: '/project' });

    const written = new Set(
      Object.entries(vol.toJSON())
        .filter(([, content]) => content !== null)
        .map(([abs]) => abs.replace('/project/', ''))
        .filter((rel) => rel !== 'package.json'),
    );
    const expected = new Set([
      '.prospec.yaml',
      'AGENTS.md',
      'prospec/specs/.gitkeep',
      ...INIT_DOC_REGISTRY.map((doc) =>
        doc.root === 'knowledge'
          ? `prospec/ai-knowledge/${doc.output}`
          : `prospec/${doc.output}`,
      ),
    ]);
    expect(written).toEqual(expected);
  });

  it('labels every registry doc under its root in createdFiles', async () => {
    vol.fromJSON({ '/project/package.json': '{}' });

    const result = await execute({ name: 'test', agents: ['claude'], cwd: '/project' });

    for (const doc of INIT_DOC_REGISTRY) {
      expect(result.createdFiles).toContain(
        doc.root === 'knowledge'
          ? `prospec/ai-knowledge/${doc.output}`
          : `prospec/${doc.output}`,
      );
    }
  });
});
