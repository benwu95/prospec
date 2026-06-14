import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { execute, synthesizeTriggers } from '../../../src/services/agent-sync.service.js';
import { renderTemplate } from '../../../src/lib/template.js';
import { PrerequisiteError } from '../../../src/types/errors.js';
import { parse as parseYamlDoc } from 'yaml';

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

beforeEach(() => {
  vol.reset();
});

describe('agent-sync.service', () => {
  it('should throw PrerequisiteError when no agents are configured', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });
    await expect(execute({ cwd: '/project' })).rejects.toThrow(PrerequisiteError);
  });

  it('should throw PrerequisiteError when specified CLI is not configured', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test
agents:
  - claude
`,
    });
    await expect(execute({ cli: 'antigravity', cwd: '/project' })).rejects.toThrow(
      PrerequisiteError,
    );
  });

  it('should generate skill files for configured agent', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test-project
agents:
  - claude
knowledge:
  base_path: docs/ai-knowledge
`,
    });

    const result = await execute({ cwd: '/project' });
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0]?.agent).toBe('claude');
    expect(result.agents[0]?.skillFiles.length).toBeGreaterThan(0);
    expect(result.totalFiles).toBeGreaterThan(0);
  });

  it('should generate skill files for a specific CLI', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test-project
agents:
  - claude
  - antigravity
knowledge:
  base_path: docs/ai-knowledge
`,
    });

    const result = await execute({ cli: 'claude', cwd: '/project' });
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0]?.agent).toBe('claude');
  });

  it('should generate entry config file', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test-project
agents:
  - claude
knowledge:
  base_path: docs/ai-knowledge
`,
    });

    const result = await execute({ cwd: '/project' });
    expect(result.agents[0]?.configFile).toBeTruthy();
    // Verify the config file was created
    const configPath = `/project/${result.agents[0]?.configFile}`;
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it('should sync multiple agents', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test-project
agents:
  - claude
  - antigravity
knowledge:
  base_path: docs/ai-knowledge
`,
    });

    const result = await execute({ cwd: '/project' });
    expect(result.agents).toHaveLength(2);
    const agentNames = result.agents.map((a) => a.agent);
    expect(agentNames).toContain('claude');
    expect(agentNames).toContain('antigravity');
  });

  it('should generate codex skills under .agents/skills with AGENTS.md entry', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test-project
agents:
  - codex
knowledge:
  base_path: docs/ai-knowledge
`,
    });

    const result = await execute({ cwd: '/project' });
    expect(result.agents[0]?.configFile).toBe('AGENTS.md');
    for (const skillFile of result.agents[0]!.skillFiles) {
      expect(skillFile).toContain('.agents/skills/');
    }
  });

  it('should generate antigravity entry config as AGENTS.md', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test-project
agents:
  - antigravity
knowledge:
  base_path: docs/ai-knowledge
`,
    });

    const result = await execute({ cwd: '/project' });
    expect(result.agents[0]?.configFile).toBe('AGENTS.md');
  });

  it('should dedup agents that share .agents/skills + AGENTS.md', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test-project
agents:
  - antigravity
  - codex
  - copilot
knowledge:
  base_path: docs/ai-knowledge
`,
    });

    const result = await execute({ cwd: '/project' });

    // antigravity / codex / copilot all map to (.agents/skills, AGENTS.md)
    // → collapse into a single output entry serving all three
    expect(result.agents).toHaveLength(1);
    const served = result.agents[0]!.agent;
    expect(served).toContain('antigravity');
    expect(served).toContain('codex');
    expect(served).toContain('copilot');
    expect(result.agents[0]?.configFile).toBe('AGENTS.md');
    expect(fs.existsSync('/project/AGENTS.md')).toBe(true);

    // totalFiles reflects a single output set, not 3×
    const single =
      1 +
      result.agents[0]!.skillFiles.length +
      result.agents[0]!.referenceFiles.length;
    expect(result.totalFiles).toBe(single);
  });

  it('renders an order-independent AGENTS.md regardless of agent list order', async () => {
    // Echo the template name so the rendered content reveals which template
    // was selected — this would differ per agent order if the entry config
    // were keyed by agent name instead of a single shared template.
    vi.mocked(renderTemplate).mockImplementation(
      (name: string) => `TEMPLATE:${name}\n`,
    );

    const yaml = (order: string) =>
      `project:\n  name: t\nagents:\n${order}\nknowledge:\n  base_path: docs/ai-knowledge\n`;

    vol.fromJSON({
      '/p/.prospec.yaml': yaml('  - antigravity\n  - codex\n  - copilot'),
    });
    await execute({ cwd: '/p' });
    const first = fs.readFileSync('/p/AGENTS.md', 'utf8');

    vol.reset();
    vol.fromJSON({
      '/p/.prospec.yaml': yaml('  - copilot\n  - codex\n  - antigravity'),
    });
    await execute({ cwd: '/p' });
    const second = fs.readFileSync('/p/AGENTS.md', 'utf8');

    expect(first).toBe(second);
    expect(first).toContain('agent-configs/entry.md.hbs');

    vi.mocked(renderTemplate).mockReturnValue('# Rendered Template Content\n');
  });
});

describe('synthesizeTriggers', () => {
  const skill = { triggers: ['explore', 'compare'] };

  it('returns the English baseline for English with no custom triggers', () => {
    expect(synthesizeTriggers(skill, 'English', undefined)).toBe('explore, compare');
  });

  it('appends custom triggers after the baseline', () => {
    expect(
      synthesizeTriggers(skill, 'Traditional Chinese (Taiwan)', ['探索', '比較']),
    ).toBe('explore, compare, 探索, 比較');
  });

  it('appends a semantic-match hint for a non-English language with no custom triggers', () => {
    expect(synthesizeTriggers(skill, 'Japanese', undefined)).toBe(
      'explore, compare — or equivalent terms in Japanese',
    );
  });

  it('treats an empty custom array as unset (falls back to the hint)', () => {
    expect(synthesizeTriggers(skill, 'Japanese', [])).toBe(
      'explore, compare — or equivalent terms in Japanese',
    );
  });

  it('never appends a hint when custom triggers exist, regardless of language', () => {
    expect(synthesizeTriggers(skill, 'Japanese', ['カスタム'])).toBe(
      'explore, compare, カスタム',
    );
  });

  it('returns custom triggers verbatim — escaping is deferred to the frontmatter render', () => {
    const result = synthesizeTriggers(skill, 'English', ['say "review"', 'a\\b', '  spaced  ']);
    // raw (markdown-safe) form: no YAML backslash-escaping leaking in
    expect(result).toBe('explore, compare, say "review", a\\b, spaced');
  });

  it('returns the artifact language verbatim in the fallback hint', () => {
    expect(synthesizeTriggers(skill, '"Fancy" Lang', undefined)).toBe(
      'explore, compare — or equivalent terms in "Fancy" Lang',
    );
  });

  it('treats custom triggers that collapse to empty as unset', () => {
    expect(synthesizeTriggers(skill, 'Japanese', ['   '])).toBe(
      'explore, compare — or equivalent terms in Japanese',
    );
  });
});

describe('agent-sync skill_triggers warnings', () => {
  beforeEach(() => {
    vol.reset();
    vi.mocked(renderTemplate).mockClear();
    vi.mocked(renderTemplate).mockReturnValue('# Rendered Template Content\n');
  });

  it('warns on unknown skill names in skill_triggers and ignores them', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': [
        'project:',
        '  name: test',
        'agents:',
        '  - claude',
        'skill_triggers:',
        '  prospec-explore: [探索]',
        '  no-such-skill: [whatever]',
        '',
      ].join('\n'),
    });

    const result = await execute({ cwd: '/project' });
    expect(result.warnings).toEqual([
      "skill_triggers: unknown skill 'no-such-skill' ignored",
    ]);
  });

  it('returns no warnings when skill_triggers is absent', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\nagents:\n  - claude\n',
    });

    const result = await execute({ cwd: '/project' });
    expect(result.warnings).toEqual([]);
  });

  it('passes synthesized trigger_words into each skill template render', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': [
        'project:',
        '  name: test',
        'agents:',
        '  - claude',
        'artifact_language: Traditional Chinese (Taiwan)',
        'skill_triggers:',
        '  prospec-explore: [探索, 比較]',
        '',
      ].join('\n'),
    });

    await execute({ cwd: '/project' });

    const calls = vi.mocked(renderTemplate).mock.calls;
    const exploreCall = calls.find(([name]) => name === 'skills/prospec-explore.hbs');
    expect(exploreCall).toBeDefined();
    const exploreCtx = exploreCall![1] as Record<string, unknown>;
    expect(exploreCtx.trigger_words).toBe(
      'explore, compare, investigate, unsure, clarify, 探索, 比較',
    );

    const planCall = calls.find(([name]) => name === 'skills/prospec-plan.hbs');
    const planCtx = planCall![1] as Record<string, unknown>;
    expect(planCtx.trigger_words).toBe(
      'plan, design architecture, how to implement — or equivalent terms in Traditional Chinese (Taiwan)',
    );

    const entryCall = calls.find(([name]) => name === 'agent-configs/entry.md.hbs');
    const entryCtx = entryCall![1] as Record<string, unknown>;
    expect(entryCtx.artifact_language).toBe('Traditional Chinese (Taiwan)');
  });

  it('escapes trigger_words at the SKILL.md frontmatter render so it stays valid YAML', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': [
        'project:',
        '  name: test',
        'agents:',
        '  - claude',
        'skill_triggers:',
        "  prospec-explore: ['say \"hi\"']",
        '',
      ].join('\n'),
    });

    await execute({ cwd: '/project' });

    const calls = vi.mocked(renderTemplate).mock.calls;
    const exploreCall = calls.find(([name]) => name === 'skills/prospec-explore.hbs');
    const triggerWords = (exploreCall![1] as Record<string, unknown>).trigger_words as string;
    // escaped for the double-quoted YAML scalar, and parses cleanly
    expect(triggerWords).toContain('say \\"hi\\"');
    expect(() => parseYamlDoc(`description: "Triggers: ${triggerWords}"`)).not.toThrow();
  });

  it('hints to populate skill_triggers when language is non-English and none are set', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml':
        'project:\n  name: test\nagents:\n  - claude\nartifact_language: Japanese\n',
    });

    const result = await execute({ cwd: '/project' });
    expect(result.hints).toHaveLength(1);
    expect(result.hints[0]).toContain('Japanese');
    expect(result.hints[0]).toContain('skill_triggers');
  });

  it('emits no hint when skill_triggers are set or language is English', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': [
        'project:',
        '  name: test',
        'agents:',
        '  - claude',
        'artifact_language: Japanese',
        'skill_triggers:',
        '  prospec-explore: [調査]',
        '',
      ].join('\n'),
    });
    expect((await execute({ cwd: '/project' })).hints).toEqual([]);

    vol.reset();
    vi.mocked(renderTemplate).mockReturnValue('# Rendered Template Content\n');
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\nagents:\n  - claude\n',
    });
    expect((await execute({ cwd: '/project' })).hints).toEqual([]);
  });

  it('defaults artifact_language to English when absent from config', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\nagents:\n  - claude\n',
    });

    await execute({ cwd: '/project' });

    const entryCall = vi
      .mocked(renderTemplate)
      .mock.calls.find(([name]) => name === 'agent-configs/entry.md.hbs');
    const entryCtx = entryCall![1] as Record<string, unknown>;
    expect(entryCtx.artifact_language).toBe('English');
  });
});
