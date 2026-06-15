import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { execute } from '../../../src/services/quickstart.service.js';
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

describe('quickstart.service', () => {
  it('fresh project: runs init then agent-sync, hands off to /prospec-quickstart', async () => {
    const result = await execute({ agents: ['claude'], cwd: '/project' });

    expect(result.steps).toEqual([
      { name: 'init', status: 'created' },
      { name: 'agent-sync', status: 'created' },
    ]);
    expect(result.nextStep).toBe('/prospec-quickstart');
    // init wrote the config marker; agent-sync produced files
    expect(vol.existsSync('/project/.prospec.yaml')).toBe(true);
    expect(result.agentSync.totalFiles).toBeGreaterThan(0);
  });

  it('re-run: catches AlreadyExistsError from init and marks it skipped', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\nagents:\n  - claude\n',
    });

    const result = await execute({ cwd: '/project' });

    expect(result.steps).toEqual([
      { name: 'init', status: 'skipped' },
      { name: 'agent-sync', status: 'created' },
    ]);
  });

  it('surfaces PrerequisiteError when the existing config has no agents', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });

    await expect(execute({ cwd: '/project' })).rejects.toThrow(PrerequisiteError);
  });

  it('carries agent-sync hints (native-language triggers) through to the result', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml':
        'project:\n  name: test\nagents:\n  - claude\nartifact_language: Japanese\n',
    });

    const result = await execute({ cwd: '/project' });

    expect(result.steps[0]).toEqual({ name: 'init', status: 'skipped' });
    expect(result.agentSync.hints).toHaveLength(1);
    expect(result.agentSync.hints[0]).toContain('Japanese');
    expect(result.agentSync.hints[0]).toContain('skill_triggers');
  });
});
