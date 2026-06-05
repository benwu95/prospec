import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { execute } from '../../../src/services/agent-sync.service.js';
import { renderTemplate } from '../../../src/lib/template.js';
import { PrerequisiteError } from '../../../src/types/errors.js';

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
