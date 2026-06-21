import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { execute, detectMissingTriggers } from '../../../src/services/upgrade.service.js';
import { readConfig } from '../../../src/lib/config.js';
import { PROSPEC_VERSION } from '../../../src/types/version.js';
import { ConfigNotFound } from '../../../src/types/errors.js';
import type { ProspecConfig } from '../../../src/types/config.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

// Isolate the orchestrator from the real agent-sync (its own suite covers it).
vi.mock('../../../src/services/agent-sync.service.js', () => ({
  execute: vi.fn().mockResolvedValue({ agents: [], totalFiles: 3, warnings: [], hints: [] }),
}));

import { execute as agentSyncExecute } from '../../../src/services/agent-sync.service.js';

const KB = '/project/prospec/ai-knowledge';

/** A non-English initialized project with curated + canonical docs on disk. */
function seedProject(opts: { version?: string } = {}): void {
  const versionLine = opts.version === undefined ? '' : `version: ${opts.version}\n`;
  vol.fromJSON({
    '/project/.prospec.yaml':
      versionLine +
      'project:\n  name: demo\nagents:\n  - claude\n' +
      'artifact_language: Traditional Chinese (Taiwan)\n' +
      'skill_triggers:\n  prospec-explore: [探索]\n',
    '/project/prospec/CONSTITUTION.md': '# CURATED principles\n',
    [`${KB}/_index.md`]: '# CURATED index\n',
    [`${KB}/_conventions.md`]: '# CURATED conventions\n',
    [`${KB}/_status-lifecycle.md`]: '# canonical lifecycle\n',
    [`${KB}/_module-readme-conventions.md`]: '# canonical readme conv\n',
    [`${KB}/_diagram-conventions.md`]: '# canonical diagram\n',
  });
}

beforeEach(() => {
  vol.reset();
  vi.mocked(agentSyncExecute).mockResolvedValue({
    agents: [],
    totalFiles: 3,
    warnings: [],
    hints: [],
  });
});

describe('upgrade.service', () => {
  it('records the prospec version in .prospec.yaml and runs agent sync', async () => {
    seedProject({ version: '0.1.0' });

    const result = await execute({ cwd: '/project' });

    expect(result.report.versionFrom).toBe('0.1.0');
    expect(result.report.versionTo).toBe(PROSPEC_VERSION);
    expect((await readConfig('/project')).version).toBe(PROSPEC_VERSION);
    expect(agentSyncExecute).toHaveBeenCalledWith({ cwd: '/project' });
    expect(result.nextStep).toBe('/prospec-upgrade');
  });

  it('NEVER writes any ai-knowledge doc or CONSTITUTION (CLI touches only .prospec.yaml + zone-1)', async () => {
    seedProject({ version: '0.1.0' });

    await execute({ cwd: '/project' });

    expect(fs.readFileSync('/project/prospec/CONSTITUTION.md', 'utf-8')).toBe('# CURATED principles\n');
    expect(fs.readFileSync(`${KB}/_index.md`, 'utf-8')).toBe('# CURATED index\n');
    expect(fs.readFileSync(`${KB}/_conventions.md`, 'utf-8')).toBe('# CURATED conventions\n');
    // Even the shipped canonical docs are left untouched — the consent-gated skill owns them.
    expect(fs.readFileSync(`${KB}/_status-lifecycle.md`, 'utf-8')).toBe('# canonical lifecycle\n');
    expect(fs.readFileSync(`${KB}/_module-readme-conventions.md`, 'utf-8')).toBe('# canonical readme conv\n');
    expect(fs.readFileSync(`${KB}/_diagram-conventions.md`, 'utf-8')).toBe('# canonical diagram\n');
  });

  it('reports skills missing triggers (non-English, partial localization)', async () => {
    seedProject({ version: '0.1.0' });

    const { report } = await execute({ cwd: '/project' });

    expect(report.missingTriggers).toContain('prospec-upgrade');
    expect(report.missingTriggers).not.toContain('prospec-explore');
  });

  it('treats an absent version as "unknown"', async () => {
    seedProject(); // no version line

    const { report } = await execute({ cwd: '/project' });
    expect(report.versionFrom).toBe('unknown');
  });

  it('throws ConfigNotFound on an uninitialized project (never writes)', async () => {
    vol.fromJSON({ '/project/package.json': '{}' });

    await expect(execute({ cwd: '/project' })).rejects.toThrow(ConfigNotFound);
  });
});

describe('detectMissingTriggers', () => {
  const base = { project: { name: 'x' } };

  it('returns [] for an English project (baseline triggers are English)', () => {
    const config = { ...base, skill_triggers: {} } as ProspecConfig;
    expect(detectMissingTriggers(config, 'English')).toEqual([]);
  });

  it('names skills with no entry (and treats empty arrays as unset)', () => {
    const config = {
      ...base,
      skill_triggers: { 'prospec-explore': ['探索'], 'prospec-plan': [] },
    } as ProspecConfig;
    const missing = detectMissingTriggers(config, 'Traditional Chinese (Taiwan)');
    expect(missing).not.toContain('prospec-explore');
    expect(missing).toContain('prospec-plan'); // empty array counts as unset
    expect(missing).toContain('prospec-upgrade');
  });
});
