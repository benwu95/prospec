/**
 * Integration test: upgrade command flow (BL-044).
 *
 * Simulates a CLI version bump + a newly-shipped skill on a non-English project,
 * then runs upgrade end-to-end (service → lib → agent-sync) on memfs. Asserts the
 * CLI contract: it records the prospec `version`, re-syncs agents (zone-1), and
 * reports the new skill's missing triggers — while touching NO init-created doc
 * (those are the consent-gated /prospec-upgrade skill's job).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { execute as initExecute } from '../../src/services/init.service.js';
import { execute as upgradeExecute } from '../../src/services/upgrade.service.js';
import { readConfig, writeConfig } from '../../src/lib/config.js';
import { PROSPEC_VERSION } from '../../src/types/version.js';
import { SKILL_DEFINITIONS } from '../../src/types/skill.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

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

vi.mock('../../src/lib/template.js', () => ({
  renderTemplate: vi.fn().mockReturnValue('# Template Content\n'),
  registerPartial: vi.fn(),
  registerPartialFromFile: vi.fn(),
  registerHelper: vi.fn(),
}));

const KB = '/project/prospec/ai-knowledge';

beforeEach(() => {
  vol.reset();
});

describe('Upgrade Flow Integration (BL-044)', () => {
  it('CLI bump + new skill: records version, runs agent sync, flags the new skill, never touches docs', async () => {
    vol.fromJSON({ '/project/package.json': JSON.stringify({ name: 'demo' }) });

    // 1. init a non-English project (seeds version + the init-created docs)
    await initExecute({
      name: 'demo',
      agents: ['claude'],
      language: 'Traditional Chinese (Taiwan)',
      cwd: '/project',
    });

    // 2. Simulate the pre-upgrade state: an older CLI version + every skill
    //    localized EXCEPT prospec-upgrade (it did not exist before this bump).
    const cfg = await readConfig('/project');
    cfg.version = '0.1.0';
    cfg.skill_triggers = Object.fromEntries(
      SKILL_DEFINITIONS.filter((s) => s.name !== 'prospec-upgrade').map((s) => [s.name, ['詞']]),
    );
    await writeConfig(cfg, '/project');

    // 3. Hand-curate the init-created docs (the CLI must touch none of them)
    fs.writeFileSync('/project/prospec/CONSTITUTION.md', '# CURATED principles\n');
    fs.writeFileSync(`${KB}/_index.md`, '# CURATED index\n');
    fs.writeFileSync(`${KB}/_conventions.md`, '# CURATED conventions\n');
    fs.writeFileSync(`${KB}/_status-lifecycle.md`, '# canonical lifecycle (existing)\n');

    // 4. Upgrade
    const result = await upgradeExecute({ cwd: '/project' });

    // version bumped + recorded in the `version` field
    expect(result.report.versionFrom).toBe('0.1.0');
    expect(result.report.versionTo).toBe(PROSPEC_VERSION);
    expect((await readConfig('/project')).version).toBe(PROSPEC_VERSION);

    // only the newly-shipped skill is flagged as missing triggers
    expect(result.report.missingTriggers).toEqual(['prospec-upgrade']);

    // the CLI touches NO ai-knowledge doc or CONSTITUTION — all byte-unchanged
    // (init-created doc format updates are the consent-gated /prospec-upgrade skill's job)
    expect(fs.readFileSync('/project/prospec/CONSTITUTION.md', 'utf-8')).toBe('# CURATED principles\n');
    expect(fs.readFileSync(`${KB}/_index.md`, 'utf-8')).toBe('# CURATED index\n');
    expect(fs.readFileSync(`${KB}/_conventions.md`, 'utf-8')).toBe('# CURATED conventions\n');
    expect(fs.readFileSync(`${KB}/_status-lifecycle.md`, 'utf-8')).toBe('# canonical lifecycle (existing)\n');
  });
});
