import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { SKILL_DEFINITIONS } from '../../../src/types/skill.js';
import type { GitignoreBlockResult } from '../../../src/types/gitignore-block.js';

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

vi.mock('../../../src/lib/gitignore-block.js', () => ({
  syncGitignoreBlock: vi.fn(),
}));

const { syncGitignoreBlock } = await import('../../../src/lib/gitignore-block.js');
const { execute: initExecute } = await import('../../../src/services/init.service.js');
const { execute: agentSyncExecute, shippedSkillLayout } = await import('../../../src/services/agent-sync.service.js');
const { execute: quickstartExecute } = await import('../../../src/services/quickstart.service.js');

const writer = vi.mocked(syncGitignoreBlock);
const result = (status: GitignoreBlockResult['status'], warnings: string[] = [], suggestedLines: string[] = []): GitignoreBlockResult => ({
  status, warnings, suggestedLines,
});

beforeEach(() => {
  vol.reset();
  writer.mockReset();
  writer.mockResolvedValue(result('updated'));
});

describe('.gitignore block wiring (REQ-SERVICES-130)', () => {
  it('init runs the writer for the selected agents before writing .prospec.yaml', async () => {
    writer.mockImplementation(async () => {
      expect(vol.existsSync('/project/.prospec.yaml')).toBe(false);
      return result('created', ['w']);
    });
    const out = await initExecute({ name: 'p', agents: ['claude', 'codex'], cwd: '/project' });
    expect(writer).toHaveBeenCalledTimes(1);
    expect(writer.mock.calls[0]![0]).toEqual({ cwd: '/project', skillPaths: ['.claude/skills', '.agents/skills'], ...shippedSkillLayout() });
    expect(out.gitignore).toEqual(result('created', ['w']));
    expect(out.createdFiles).not.toContain('.gitignore');
  });

  it('a full agent sync passes every configured agent and the layout it wrote — the shipped layout', async () => {
    vol.fromJSON({ '/project/.prospec.yaml': 'project:\n  name: p\nagents:\n  - claude\n  - codex\n  - copilot\n' });
    const out = await agentSyncExecute({ cwd: '/project' });
    expect(writer).toHaveBeenCalledTimes(1);
    const passed = writer.mock.calls[0]![0];
    expect(passed.skillPaths).toEqual(['.claude/skills', '.agents/skills']);
    const shipped = shippedSkillLayout();
    expect([...passed.skillNames].sort()).toEqual([...shipped.skillNames].sort());
    expect([...passed.skillFiles].sort()).toEqual([...shipped.skillFiles].sort());
    expect(shipped.skillNames).toEqual(SKILL_DEFINITIONS.map((s) => s.name));
    expect(out.gitignore).toEqual(result('updated'));
  });

  it('a --cli agent sync leaves .gitignore alone', async () => {
    vol.fromJSON({ '/project/.prospec.yaml': 'project:\n  name: p\nagents:\n  - claude\n  - codex\n' });
    const out = await agentSyncExecute({ cwd: '/project', cli: 'claude' });
    expect(writer).not.toHaveBeenCalled();
    expect(out).not.toHaveProperty('gitignore');
  });

  it.each([
    ['init created', result('created', ['a']), result('updated', ['a', 'b']), result('created', ['a', 'b'])],
    ['init unchanged, sync updated', result('unchanged'), result('updated', ['b']), result('updated', ['b'])],
    ['init updated, sync unchanged', result('updated'), result('unchanged'), result('updated')],
    ['both unchanged', result('unchanged', ['a']), result('unchanged', ['a']), result('unchanged', ['a'])],
    ['init skipped, sync unchanged', result('skipped', ['s']), result('unchanged'), result('unchanged', ['s'])],
    ['both suggest', result('created', ['w'], ['!/a/', '/a/*', '!/b']), result('unchanged', ['w'], ['!/b', '!/c/', '/c/*']), result('created', ['w'], ['!/b', '!/c/', '/c/*'])],
    ['only init suggests', result('created', [], ['!/a/', '/a/*']), result('unchanged'), result('created', [], ['!/a/', '/a/*'])],
  ])('quickstart merges the two runs: %s', async (_label, fromInit, fromSync, merged) => {
    writer.mockResolvedValueOnce(fromInit).mockResolvedValueOnce(fromSync);
    const out = await quickstartExecute({ agents: ['claude'], cwd: '/project' });
    expect(out.gitignore).toEqual(merged);
  });

  it('quickstart carries the sync result alone when init was already done', async () => {
    vol.fromJSON({ '/project/.prospec.yaml': 'project:\n  name: p\nagents:\n  - claude\n' });
    writer.mockResolvedValueOnce(result('unchanged', ['x']));
    const out = await quickstartExecute({ cwd: '/project' });
    expect(out.steps[0]).toEqual({ name: 'init', status: 'skipped' });
    expect(out.gitignore).toEqual(result('unchanged', ['x']));
  });
});
