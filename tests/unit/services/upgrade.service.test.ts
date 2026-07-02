import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { execute, detectMissingTriggers, detectNudges } from '../../../src/services/upgrade.service.js';
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

// Stub the deterministic raw-scan refresh — fast-glob bypasses memfs, so the real
// generateRawScan would scan the actual filesystem; the refresh wiring is asserted
// via this mock instead.
vi.mock('../../../src/services/raw-scan.service.js', () => ({
  generateRawScan: vi.fn().mockResolvedValue({
    configFiles: [],
    outputFile: 'prospec/ai-knowledge/raw-scan.md',
    dryRun: false,
    files: [],
  }),
}));

// Stub the interactive prompt; interactive-mode tests set its resolved value.
vi.mock('@inquirer/prompts', () => ({ input: vi.fn() }));

import { execute as agentSyncExecute } from '../../../src/services/agent-sync.service.js';
import { generateRawScan } from '../../../src/services/raw-scan.service.js';
import { input } from '@inquirer/prompts';

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
    '/project/prospec/index.md': '# CURATED index\n',
    [`${KB}/_conventions.md`]: '# CURATED conventions\n',
    [`${KB}/_status-lifecycle.md`]: '# canonical lifecycle\n',
    [`${KB}/_module-readme-conventions.md`]: '# canonical readme conv\n',
    [`${KB}/_diagram-conventions.md`]: '# canonical diagram\n',
  });
}

beforeEach(() => {
  vol.reset();
  vi.mocked(input).mockReset();
  vi.mocked(generateRawScan).mockReset();
  vi.mocked(generateRawScan).mockResolvedValue({
    configFiles: [],
    outputFile: 'prospec/ai-knowledge/raw-scan.md',
    dryRun: false,
    files: [],
  });
  vi.mocked(agentSyncExecute).mockResolvedValue({
    agents: [],
    totalFiles: 3,
    warnings: [],
    hints: [],
  });
});

describe('upgrade.service', () => {
  it('records the prospec version, runs agent sync, and refreshes raw-scan', async () => {
    seedProject({ version: '0.1.0' });

    const result = await execute({ cwd: '/project' });

    expect(result.report.versionFrom).toBe('0.1.0');
    expect(result.report.versionTo).toBe(PROSPEC_VERSION);
    expect((await readConfig('/project')).version).toBe(PROSPEC_VERSION);
    expect(agentSyncExecute).toHaveBeenCalledWith({ cwd: '/project' });
    // raw-scan.md is refreshed to the new version's scanner (like agent sync).
    expect(generateRawScan).toHaveBeenCalledWith({ cwd: '/project' });
    expect(result.rawScanRefreshed).toBe(true);
    expect(result.nextStep).toBe('/prospec-upgrade');
  });

  it('a raw-scan refresh failure is non-fatal — the version bump + agent sync still stand', async () => {
    seedProject({ version: '0.1.0' });
    vi.mocked(generateRawScan).mockRejectedValueOnce(new Error('scan blew up'));

    const result = await execute({ cwd: '/project' });

    expect(result.rawScanRefreshed).toBe(false);
    expect(result.report.versionTo).toBe(PROSPEC_VERSION);
    expect((await readConfig('/project')).version).toBe(PROSPEC_VERSION);
  });

  it('NEVER writes a CURATED ai-knowledge doc or CONSTITUTION (only .prospec.yaml + zone-1 + raw-scan)', async () => {
    seedProject({ version: '0.1.0' });

    await execute({ cwd: '/project' });

    // raw-scan.md is the one allowed ai-knowledge write (mocked here); the curated
    // docs below must stay byte-identical — they are the consent-gated skill's job.
    expect(generateRawScan).toHaveBeenCalledWith({ cwd: '/project' });
    expect(fs.readFileSync('/project/prospec/CONSTITUTION.md', 'utf-8')).toBe('# CURATED principles\n');
    expect(fs.readFileSync('/project/prospec/index.md', 'utf-8')).toBe('# CURATED index\n');
    expect(fs.readFileSync(`${KB}/_conventions.md`, 'utf-8')).toBe('# CURATED conventions\n');
    // Even the shipped canonical docs are left untouched — the consent-gated skill owns them.
    expect(fs.readFileSync(`${KB}/_status-lifecycle.md`, 'utf-8')).toBe('# canonical lifecycle\n');
    expect(fs.readFileSync(`${KB}/_module-readme-conventions.md`, 'utf-8')).toBe('# canonical readme conv\n');
    expect(fs.readFileSync(`${KB}/_diagram-conventions.md`, 'utf-8')).toBe('# canonical diagram\n');
  });

  it('leaves a pre-migration legacy _index.md byte-identical and never creates the root index.md', async () => {
    // A project scaffolded before the hierarchical-index migration: the index
    // still lives at <kb>/_index.md and no <base_dir>/index.md exists. The CLI
    // must not migrate — that is the consent-gated /prospec-upgrade skill's job.
    seedProject({ version: '0.1.0' });
    fs.rmSync('/project/prospec/index.md');
    fs.writeFileSync(`${KB}/_index.md`, '# LEGACY curated index\n');

    await execute({ cwd: '/project' });

    expect(fs.readFileSync(`${KB}/_index.md`, 'utf-8')).toBe('# LEGACY curated index\n');
    expect(fs.existsSync('/project/prospec/index.md')).toBe(false);
  });

  it('reports skills missing triggers (non-English, partial localization)', async () => {
    seedProject({ version: '0.1.0' });

    const { report } = await execute({ cwd: '/project' });

    expect(report.missingTriggers).toContain('prospec-upgrade');
    expect(report.missingTriggers).not.toContain('prospec-explore');
  });

  it('fires the artifact_language nudge for a pre-feature project (and reports no missing triggers)', async () => {
    // A project scaffolded by a pre-feature CLI: no artifact_language field at all.
    vol.fromJSON({
      '/project/.prospec.yaml': 'version: 0.1.0\nproject:\n  name: legacy\nagents:\n  - claude\n',
    });

    const { report } = await execute({ cwd: '/project' });

    expect(report.nudges.map((n) => n.field)).toEqual(['artifact_language']);
    // Unset resolves to English, so nothing is reported "missing" — the two
    // signals are mutually exclusive in practice.
    expect(report.missingTriggers).toEqual([]);
    // Non-interactive: no prompt is shown — the report just names the nudge.
    expect(input).not.toHaveBeenCalled();
  });

  it('interactive: prompts to fill an unset artifact_language and writes the answer', async () => {
    vi.mocked(input).mockResolvedValue('日本語');
    vol.fromJSON({
      '/project/.prospec.yaml': 'version: 0.1.0\nproject:\n  name: legacy\nagents:\n  - claude\n',
    });

    const result = await execute({ cwd: '/project', interactive: true });

    expect(input).toHaveBeenCalledTimes(1);
    expect((await readConfig('/project')).artifact_language).toBe('日本語');
    expect(result.resolvedNudges).toEqual([{ field: 'artifact_language', value: '日本語' }]);
    // Field is now set, so the nudge no longer fires…
    expect(result.report.nudges).toEqual([]);
    // …but a non-English language with no triggers yet surfaces every skill.
    expect(result.report.missingTriggers).toContain('prospec-explore');
  });

  it('interactive: accepting the default (empty input) records English and self-terminates', async () => {
    vi.mocked(input).mockResolvedValue(''); // user pressed Enter → falls back to English
    vol.fromJSON({
      '/project/.prospec.yaml': 'version: 0.1.0\nproject:\n  name: legacy\nagents:\n  - claude\n',
    });

    const result = await execute({ cwd: '/project', interactive: true });

    expect((await readConfig('/project')).artifact_language).toBe('English');
    expect(result.resolvedNudges).toEqual([{ field: 'artifact_language', value: 'English' }]);
    expect(result.report.nudges).toEqual([]);
    expect(result.report.missingTriggers).toEqual([]); // English uses the baseline
  });

  it('interactive: does not prompt when no nudge fires (a language was already chosen)', async () => {
    seedProject({ version: '0.1.0' }); // explicit Traditional Chinese (Taiwan)

    await execute({ cwd: '/project', interactive: true });

    expect(input).not.toHaveBeenCalled();
  });

  it('leaves a field-less config without artifact_language, so the nudge persists across re-runs', async () => {
    // The nudge's central promise: upgrade must NOT silently "answer" the prompt
    // by writing a language for the user. If the field were added (or written as
    // null), the nudge would fire once and then vanish forever.
    vol.fromJSON({
      '/project/.prospec.yaml': 'version: 0.1.0\nproject:\n  name: legacy\nagents:\n  - claude\n',
    });

    await execute({ cwd: '/project' });

    const afterFirst = await readConfig('/project');
    expect(afterFirst.artifact_language).toBeUndefined();

    // A second upgrade still fires the nudge — idempotent until the user opts in.
    const { report: secondReport } = await execute({ cwd: '/project' });
    expect(secondReport.nudges.map((n) => n.field)).toContain('artifact_language');
  });

  it('fires no nudge for a project that explicitly chose a language', async () => {
    seedProject({ version: '0.1.0' }); // seeds artifact_language: Traditional Chinese (Taiwan)

    const { report } = await execute({ cwd: '/project' });

    expect(report.nudges).toEqual([]);
  });

  it('preserves .prospec.yaml comments when recording the version', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml':
        '# header comment\nversion: 0.1.0\nproject:\n  name: demo # inline\nagents:\n  - claude\n',
    });

    await execute({ cwd: '/project' });

    const raw = fs.readFileSync('/project/.prospec.yaml', 'utf-8');
    expect(raw).toContain('# header comment');
    expect(raw).toContain('# inline');
    expect(raw).toContain(`version: ${PROSPEC_VERSION}`);
    expect(raw).not.toContain('0.1.0');
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

describe('detectNudges', () => {
  const base = { project: { name: 'x' } };

  it('fires the artifact_language nudge with a non-empty message when the field is absent', () => {
    const nudges = detectNudges(base as ProspecConfig);
    expect(nudges.map((n) => n.field)).toEqual(['artifact_language']);
    expect(nudges[0]?.message).toContain('artifact_language');
    expect(nudges[0]?.message.length).toBeGreaterThan(0);
  });

  it('fires no nudge when artifact_language is explicitly set (even to English)', () => {
    expect(detectNudges({ ...base, artifact_language: 'English' } as ProspecConfig)).toEqual([]);
    expect(
      detectNudges({ ...base, artifact_language: 'Traditional Chinese (Taiwan)' } as ProspecConfig),
    ).toEqual([]);
  });
});
