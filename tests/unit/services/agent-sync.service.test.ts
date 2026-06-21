import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { execute, synthesizeTriggers } from '../../../src/services/agent-sync.service.js';
import { renderTemplate } from '../../../src/lib/template.js';
import { PrerequisiteError } from '../../../src/types/errors.js';
import { SKILL_DEFINITIONS } from '../../../src/types/skill.js';
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
  base_path: prospec/ai-knowledge
`,
    });

    const result = await execute({ cwd: '/project' });
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0]?.agent).toBe('claude');

    const agent = result.agents[0]!;
    // One SKILL.md per defined skill — exact invariant, not "> 0".
    expect(agent.skillFiles).toHaveLength(SKILL_DEFINITIONS.length);
    // Each skill landed under the claude skillPath as <name>/SKILL.md, and
    // the file actually exists on disk.
    for (const skill of SKILL_DEFINITIONS) {
      const rel = `.claude/skills/${skill.name}/SKILL.md`;
      expect(agent.skillFiles).toContain(rel);
      expect(fs.existsSync(`/project/${rel}`)).toBe(true);
    }
    // Reference files are produced for exactly the skills that declare them.
    expect(agent.referenceFiles.length).toBeGreaterThan(0);
    for (const refPath of agent.referenceFiles) {
      const owner = refPath.split('/')[2]; // .claude/skills/<owner>/references/...
      expect(SKILL_DEFINITIONS.find((s) => s.name === owner)?.hasReferences).toBe(true);
    }
    // totalFiles is the exact reduce: 1 entry config + skills + references.
    expect(result.totalFiles).toBe(
      1 + agent.skillFiles.length + agent.referenceFiles.length,
    );
  });

  it('should generate skill files for a specific CLI', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test-project
agents:
  - claude
  - antigravity
knowledge:
  base_path: prospec/ai-knowledge
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
  base_path: prospec/ai-knowledge
`,
    });

    const result = await execute({ cwd: '/project' });
    // Pin the concrete claude entry-config filename — symmetric with the
    // antigravity/codex 'AGENTS.md' assertions, so a wrong-but-non-empty path
    // (e.g. 'AGENTS.md') fails here instead of slipping past toBeTruthy.
    expect(result.agents[0]?.configFile).toBe('CLAUDE.md');
    expect(fs.existsSync('/project/CLAUDE.md')).toBe(true);
  });

  it('should sync multiple agents', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test-project
agents:
  - claude
  - antigravity
knowledge:
  base_path: prospec/ai-knowledge
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
  base_path: prospec/ai-knowledge
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
  base_path: prospec/ai-knowledge
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
  base_path: prospec/ai-knowledge
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

  it('writes the declared reference files for skills that have them', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test-project
agents:
  - claude
knowledge:
  base_path: prospec/ai-knowledge
`,
    });

    const result = await execute({ cwd: '/project' });
    const refs = result.agents[0]!.referenceFiles;

    // prospec-plan declares exactly two references (plan-format, delta-spec-format).
    expect(refs).toContain('.claude/skills/prospec-plan/references/plan-format.md');
    expect(refs).toContain('.claude/skills/prospec-plan/references/delta-spec-format.md');
    expect(fs.existsSync('/project/.claude/skills/prospec-plan/references/plan-format.md')).toBe(
      true,
    );

    // A skill with hasReferences:false produces no references/ entries.
    expect(refs.some((r) => r.startsWith('.claude/skills/prospec-explore/'))).toBe(false);
    expect(
      fs.existsSync('/project/.claude/skills/prospec-explore/references'),
    ).toBe(false);
  });

  it('falls back to process.cwd() when options.cwd is undefined', async () => {
    // Exercises the `options.cwd ?? process.cwd()` else-side: with no cwd
    // supplied, config must be read from — and files written under — the
    // current working directory, proving the fallback wires through.
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/from-cwd');
    try {
      vol.fromJSON({
        '/from-cwd/.prospec.yaml': `project:
  name: cwd-project
agents:
  - claude
knowledge:
  base_path: prospec/ai-knowledge
`,
      });

      const result = await execute({});

      expect(result.agents).toHaveLength(1);
      expect(result.agents[0]?.agent).toBe('claude');
      // CLAUDE.md landed under the process.cwd() root, not anywhere else.
      expect(fs.existsSync('/from-cwd/CLAUDE.md')).toBe(true);
      expect(fs.existsSync('/from-cwd/.claude/skills/prospec-explore/SKILL.md')).toBe(
        true,
      );
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it('renders an order-independent AGENTS.md regardless of agent list order', async () => {
    // Echo the template name so the rendered content reveals which template
    // was selected — this would differ per agent order if the entry config
    // were keyed by agent name instead of a single shared template.
    vi.mocked(renderTemplate).mockImplementation(
      (name: string) => `TEMPLATE:${name}\n`,
    );

    const yaml = (order: string) =>
      `project:\n  name: t\nagents:\n${order}\nknowledge:\n  base_path: prospec/ai-knowledge\n`;

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

  it('names the skills still missing triggers when partially localized (non-English)', async () => {
    // Only prospec-explore localized → the rest (incl. the newly-added
    // prospec-upgrade) are named so the user can fill just those — never deleting
    // .prospec.yaml to re-localize everything.
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
    const result = await execute({ cwd: '/project' });
    expect(result.hints).toHaveLength(1);
    expect(result.hints[0]).toContain('prospec-upgrade');
    expect(result.hints[0]).toContain('skill_triggers');
    // the already-localized skill is not re-listed
    expect(result.hints[0]).not.toContain('prospec-explore');
  });

  it('emits no hint when language is English', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\nagents:\n  - claude\n',
    });
    expect((await execute({ cwd: '/project' })).hints).toEqual([]);
  });

  it('emits no hint when every skill is already localized (non-English)', async () => {
    const allTriggers = SKILL_DEFINITIONS.map((s) => `  ${s.name}: [x]`).join('\n');
    vol.fromJSON({
      '/project/.prospec.yaml': [
        'project:',
        '  name: test',
        'agents:',
        '  - claude',
        'artifact_language: Japanese',
        'skill_triggers:',
        allTriggers,
        '',
      ].join('\n'),
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

  it('excludes excludeFromEntryConfig skills from the entry config but still writes their SKILL.md (REQ-AGNT-023)', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\nagents:\n  - claude\n',
    });

    // Clear the shared module-mock log so `calls` holds only THIS test's renders
    // (deterministic — no dependency on cross-test mock-call accumulation).
    vi.mocked(renderTemplate).mockClear();
    await execute({ cwd: '/project' });

    const calls = vi.mocked(renderTemplate).mock.calls;

    // Entry config (always-loaded Layer 0) omits excludeFromEntryConfig skills.
    // Mutation guard: dropping `.filter(s => !s.excludeFromEntryConfig)` in
    // agent-sync.service makes prospec-quickstart reappear here → this goes red.
    const entryCall = calls.find(([name]) => name === 'agent-configs/entry.md.hbs');
    const entryNames = (
      entryCall![1] as { skills: { name: string }[] }
    ).skills.map((s) => s.name);
    expect(entryNames).not.toContain('prospec-quickstart');
    expect(entryNames).toContain('prospec-explore');

    // ...but its SKILL.md is still generated on disk (invocable on demand).
    const quickstartRender = calls.find(
      ([name]) => name === 'skills/prospec-quickstart.hbs',
    );
    expect(quickstartRender).toBeDefined();
  });
});
