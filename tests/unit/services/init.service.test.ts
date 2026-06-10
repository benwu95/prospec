import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { execute } from '../../../src/services/init.service.js';
import { AlreadyExistsError } from '../../../src/types/errors.js';
import { renderTemplate } from '../../../src/lib/template.js';
import { input } from '@inquirer/prompts';
import type { ConstitutionRule } from '../../../src/types/constitution.js';

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
    expect(fs.existsSync('/project/prospec/ai-knowledge/_index.md')).toBe(true);
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
    expect(configContent).toContain('base_dir');
    expect(configContent).toContain('prospec');
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
      example_rules?: Array<{ severity: string }>;
    };
    expect(ctx.example_rules?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(
      ctx.example_rules?.every((r) =>
        ['MUST', 'SHOULD', 'MAY'].includes(r.severity),
      ),
    ).toBe(true);
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
});
