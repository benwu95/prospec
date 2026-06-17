/**
 * Integration test: skill generation flow.
 *
 * Tests agent sync generates correct skill structure for each agent type.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { execute } from '../../src/services/agent-sync.service.js';
import { PrerequisiteError } from '../../src/types/errors.js';
import { SKILL_DEFINITIONS } from '../../src/types/skill.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

vi.mock('../../src/lib/template.js', () => ({
  renderTemplate: vi.fn().mockImplementation((templateName: string) => {
    if (templateName.includes('agent-configs/')) {
      return '# Agent Config\n\nGenerated entry point.\n';
    }
    return '---\nname: test-skill\ndescription: A test skill\n---\n\n# Skill Content\n';
  }),
  registerPartial: vi.fn(),
  registerPartialFromFile: vi.fn(),
  registerHelper: vi.fn(),
}));

beforeEach(() => {
  vol.reset();
});

describe('Skill Generation Integration', () => {
  it('should generate all skills for Claude agent', async () => {
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
    const claudeResult = result.agents.find((a) => a.agent === 'claude');
    expect(claudeResult).toBeTruthy();
    expect(claudeResult!.skillFiles).toHaveLength(SKILL_DEFINITIONS.length);

    // Verify SKILL.md files exist in the correct directory structure
    for (const skill of SKILL_DEFINITIONS) {
      const skillPath = `/project/.claude/skills/${skill.name}/SKILL.md`;
      expect(fs.existsSync(skillPath)).toBe(true);
    }
  });

  it('should generate reference files for skills that need them', async () => {
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
    const claudeResult = result.agents.find((a) => a.agent === 'claude');
    // claude emits a fixed total of 23 reference files across the skills that
    // declare references (new-story 1 + plan 2 + design 6 + tasks 1 + ff 4 +
    // implement 1 + review 2 + verify 1 + archive 4 + learn 1).
    expect(claudeResult!.referenceFiles).toHaveLength(23);
    // A skill with hasReferences=false (prospec-explore) must emit none.
    expect(
      claudeResult!.referenceFiles.some((f) => f.includes('prospec-explore/')),
    ).toBe(false);
  });

  // REQ-AGNT-015 — archive's Phase 4.5 cites references/promotion-format.md, so the
  // referenceMap must deploy it into archive's OWN dir (not borrow prospec-learn's).
  it("should bundle prospec-archive's own promotion-format reference (REQ-AGNT-015)", async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test-project
agents:
  - claude
knowledge:
  base_path: prospec/ai-knowledge
`,
    });

    await execute({ cwd: '/project' });

    expect(
      fs.existsSync(
        '/project/.claude/skills/prospec-archive/references/promotion-format.md',
      ),
    ).toBe(true);
  });

  // REQ-AGNT-022 — verify gains its first reference (debug-recovery-format) and review
  // gains a second (review-lenses-content); both deploy self-contained into their OWN dir.
  it('deploys verify (1) and review (2) vendored references self-contained (REQ-AGNT-022)', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test-project
agents:
  - claude
knowledge:
  base_path: prospec/ai-knowledge
`,
    });

    await execute({ cwd: '/project' });

    const verifyDir = '/project/.claude/skills/prospec-verify/references';
    expect(fs.existsSync(`${verifyDir}/debug-recovery-format.md`)).toBe(true);
    expect(fs.readdirSync(verifyDir)).toHaveLength(1);

    const reviewDir = '/project/.claude/skills/prospec-review/references';
    expect(fs.existsSync(`${reviewDir}/review-format.md`)).toBe(true);
    expect(fs.existsSync(`${reviewDir}/review-lenses-content.md`)).toBe(true);
    expect(fs.readdirSync(reviewDir)).toHaveLength(2);
  });

  it('should generate entry config file for each agent', async () => {
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

    // Pin the concrete per-agent mapping derived from AGENT_CONFIGS, not just
    // truthiness: claude → CLAUDE.md, antigravity → AGENTS.md (agents.md standard).
    expect(
      result.agents.find((a) => a.agent === 'claude')!.configFile,
    ).toBe('CLAUDE.md');
    expect(
      result.agents.find((a) => a.agent === 'antigravity')!.configFile,
    ).toBe('AGENTS.md');

    // Each agent should have its config file written to disk
    for (const agentResult of result.agents) {
      const configPath = `/project/${agentResult.configFile}`;
      expect(fs.existsSync(configPath)).toBe(true);
    }
  });

  it('should generate Copilot skills under .agents/skills (agents.md standard)', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': `project:
  name: test-project
agents:
  - copilot
knowledge:
  base_path: prospec/ai-knowledge
`,
    });

    const result = await execute({ cwd: '/project' });
    const copilotResult = result.agents.find((a) => a.agent === 'copilot');
    expect(copilotResult).toBeTruthy();

    // One SKILL.md per skill — guard the count so the loop below can't pass vacuously.
    expect(copilotResult!.skillFiles).toHaveLength(SKILL_DEFINITIONS.length);
    // Pin a concrete .agents/skills path so the skills-dir location is anchored.
    expect(copilotResult!.skillFiles).toContain(
      '.agents/skills/prospec-explore/SKILL.md',
    );

    // Copilot now uses the skills-dir format under .agents/skills
    for (const skillFile of copilotResult!.skillFiles) {
      expect(skillFile).toContain('.agents/skills/');
      expect(skillFile).toContain('SKILL.md');
    }
    expect(copilotResult!.configFile).toBe('AGENTS.md');

    // skills-dir agents emit reference files in references/ subdirs
    expect(copilotResult!.referenceFiles.length).toBeGreaterThan(0);
  });

  it('should fail when no agents are configured', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });

    await expect(execute({ cwd: '/project' })).rejects.toThrow(PrerequisiteError);
  });

  it('should only sync specified CLI with --cli option', async () => {
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

    const result = await execute({ cli: 'antigravity', cwd: '/project' });
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0]?.agent).toBe('antigravity');
  });
});
