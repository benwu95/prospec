import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitWorkTreeProbe } from '../../../src/types/git-prerequisite.js';

const probe = vi.hoisted(() => ({ result: { state: 'work-tree' } as GitWorkTreeProbe }));
vi.mock('../../../src/lib/git-prerequisite.js', () => ({
  probeGitWorkTree: vi.fn(() => probe.result),
}));

const { requireGitWorkTree } = await import('../../../src/services/git-prerequisite.js');
const { probeGitWorkTree } = await import('../../../src/lib/git-prerequisite.js');
const { PrerequisiteError } = await import('../../../src/types/errors.js');

function refusal(result: GitWorkTreeProbe): InstanceType<typeof PrerequisiteError> {
  probe.result = result;
  try {
    requireGitWorkTree('/work/project');
  } catch (err) {
    expect(err).toBeInstanceOf(PrerequisiteError);
    return err as InstanceType<typeof PrerequisiteError>;
  }
  throw new Error('expected a refusal');
}

beforeEach(() => {
  vi.mocked(probeGitWorkTree).mockClear();
});

describe('requireGitWorkTree', () => {
  it('passes inside a work tree and probes the given directory', () => {
    probe.result = { state: 'work-tree' };
    expect(() => requireGitWorkTree('/work/project')).not.toThrow();
    expect(probeGitWorkTree).toHaveBeenCalledWith('/work/project');
  });

  it('tells the user to install git when no git executable is found', () => {
    const err = refusal({ state: 'git-missing' });
    expect(err.message).toContain('git was not found');
    expect(err.suggestion).toContain('Install git');
    expect(err.suggestion).not.toContain('git init');
  });

  it('names the directory, the reported error and both remedies outside a work tree', () => {
    const err = refusal({ state: 'not-work-tree', detail: 'fatal: not a git repository' });
    expect(err.message).toContain('/work/project is not inside a git work tree');
    expect(err.message).toContain('fatal: not a git repository');
    expect(err.suggestion).toContain('git init');
    expect(err.suggestion).toContain('commit the existing project files');
    expect(err.suggestion).toContain('error git reported');
  });

  it('omits the detail clause when git answered cleanly that the directory is not inside a work tree', () => {
    const err = refusal({ state: 'not-work-tree', detail: null });
    expect(err.message).toBe('Prerequisite not met: /work/project is not inside a git work tree');
  });

  it('reports that git cannot run without suggesting git init', () => {
    const err = refusal({ state: 'git-failed', detail: 'spawnSync git EACCES' });
    expect(err.message).toContain('git cannot run');
    expect(err.message).toContain('spawnSync git EACCES');
    expect(err.suggestion).toContain('git --version');
    expect(err.suggestion).not.toContain('git init');
  });
});
