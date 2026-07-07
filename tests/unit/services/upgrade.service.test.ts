import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { execute, detectMissingTriggers, detectNudges, buildDocsInventory } from '../../../src/services/upgrade.service.js';
import { INIT_DOC_REGISTRY } from '../../../src/types/conventions.js';
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

// Stub template rendering — memfs has no template files on disk, so the real
// renderTemplate would fail. The back-fill path only needs deterministic content
// to write; per-doc render failures are exercised via mockImplementationOnce.
vi.mock('../../../src/lib/template.js', () => ({
  renderTemplate: vi.fn().mockReturnValue('# stub\n'),
  registerPartial: vi.fn(),
  registerPartialFromFile: vi.fn(),
  registerHelper: vi.fn(),
}));

import { execute as agentSyncExecute } from '../../../src/services/agent-sync.service.js';
import { generateRawScan } from '../../../src/services/raw-scan.service.js';
import { input } from '@inquirer/prompts';
import { renderTemplate } from '../../../src/lib/template.js';

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
    '/project/prospec/README.md': '# CURATED readme\n',
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
    totalFiles: 0,
    scanDepth: 10,
    techStack: {},
    entryPoints: [],
    dependencies: [],
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
  vi.mocked(renderTemplate).mockReset();
  vi.mocked(renderTemplate).mockReturnValue('# stub\n');
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

  it('never overwrites an existing curated doc — only back-fills the missing ones', async () => {
    seedProject({ version: '0.1.0' }); // everything present except _glossary.md

    const { report } = await execute({ cwd: '/project' });

    // existing curated + canonical docs stay byte-identical (skip-if-exists) —
    // migrating an existing doc's FORMAT is the consent-gated skill's job.
    expect(fs.readFileSync('/project/prospec/CONSTITUTION.md', 'utf-8')).toBe('# CURATED principles\n');
    expect(fs.readFileSync('/project/prospec/index.md', 'utf-8')).toBe('# CURATED index\n');
    expect(fs.readFileSync(`${KB}/_conventions.md`, 'utf-8')).toBe('# CURATED conventions\n');
    expect(fs.readFileSync(`${KB}/_status-lifecycle.md`, 'utf-8')).toBe('# canonical lifecycle\n');
    expect(fs.readFileSync(`${KB}/_module-readme-conventions.md`, 'utf-8')).toBe('# canonical readme conv\n');
    expect(fs.readFileSync(`${KB}/_diagram-conventions.md`, 'utf-8')).toBe('# canonical diagram\n');
    // the one missing doc was back-filled — and only that one
    expect(report.createdDocs).toEqual(['prospec/ai-knowledge/_glossary.md']);
    expect(fs.existsSync(`${KB}/_glossary.md`)).toBe(true);
  });

  it('back-fills a baseline root index.md but never migrates or deletes a legacy _index.md', async () => {
    // A project scaffolded before the hierarchical-index migration: the index
    // still lives at <kb>/_index.md and no <base_dir>/index.md exists. The CLI
    // creates a BASELINE index.md; enriching it with the real module table and
    // migrating the legacy _index.md's curated columns is the skill's job.
    seedProject({ version: '0.1.0' });
    fs.rmSync('/project/prospec/index.md');
    fs.writeFileSync(`${KB}/_index.md`, '# LEGACY curated index\n');

    const { report } = await execute({ cwd: '/project' });

    expect(fs.existsSync('/project/prospec/index.md')).toBe(true);
    expect(report.createdDocs).toContain('prospec/index.md');
    // the legacy _index.md is left byte-identical — the CLI never migrates/deletes it
    expect(fs.readFileSync(`${KB}/_index.md`, 'utf-8')).toBe('# LEGACY curated index\n');
  });

  it('back-fills every missing registry doc (multiple) and lists them in createdDocs', async () => {
    seedProject({ version: '0.1.0' });
    fs.rmSync('/project/prospec/README.md');
    fs.rmSync(`${KB}/_diagram-conventions.md`);
    // _glossary.md is already absent in seedProject

    const { report } = await execute({ cwd: '/project' });

    expect(fs.existsSync('/project/prospec/README.md')).toBe(true);
    expect(fs.existsSync(`${KB}/_diagram-conventions.md`)).toBe(true);
    expect(fs.existsSync(`${KB}/_glossary.md`)).toBe(true);
    expect(report.createdDocs).toEqual(
      expect.arrayContaining([
        'prospec/README.md',
        'prospec/ai-knowledge/_diagram-conventions.md',
        'prospec/ai-knowledge/_glossary.md',
      ]),
    );
    expect(report.docs.every((d) => d.present)).toBe(true);
  });

  it('a doc that fails to render is left MISSING and non-fatal — the upgrade still succeeds', async () => {
    seedProject({ version: '0.1.0' }); // only _glossary.md is missing, so it is the only render call
    vi.mocked(renderTemplate).mockImplementationOnce(() => {
      throw new Error('render boom');
    });

    const { report } = await execute({ cwd: '/project' });

    expect(report.versionTo).toBe(PROSPEC_VERSION); // version bump + agent sync still stand
    expect(report.createdDocs).toEqual([]);
    expect(fs.existsSync(`${KB}/_glossary.md`)).toBe(false); // stayed missing
    expect(report.docs.find((d) => d.path === 'prospec/ai-knowledge/_glossary.md')?.present).toBe(false);
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

// Issue #48 → upgrade-create-missing-docs: the report's docs inventory is the
// /prospec-upgrade skill's authoritative scan scope — derived from
// INIT_DOC_REGISTRY and existence-checked against the project. `execute` now
// BACK-FILLS the missing ones, so the inventory it reports is post-creation;
// the pure `buildDocsInventory` function itself still writes nothing.
describe('upgrade.service docs inventory (issue #48)', () => {
  it('covers exactly the INIT_DOC_REGISTRY paths, base_dir-prefixed, each with its template', async () => {
    seedProject({ version: '0.1.0' });

    const { report } = await execute({ cwd: '/project' });

    expect(report.docs.map((d) => d.path)).toEqual(
      INIT_DOC_REGISTRY.map((d) =>
        d.root === 'knowledge' ? `prospec/ai-knowledge/${d.output}` : `prospec/${d.output}`,
      ),
    );
    expect(report.docs.map((d) => d.template)).toEqual(
      INIT_DOC_REGISTRY.map((d) => d.template),
    );
  });

  it('back-fills a doc init would create but the project lacks (_glossary.md) and reports it present', async () => {
    seedProject({ version: '0.1.0' }); // seeds everything except _glossary.md

    const { report } = await execute({ cwd: '/project' });

    expect(report.createdDocs).toContain('prospec/ai-knowledge/_glossary.md');
    const byPath = new Map(report.docs.map((d) => [d.path, d.present]));
    expect(byPath.get('prospec/ai-knowledge/_glossary.md')).toBe(true); // created → now present
    expect(byPath.get('prospec/CONSTITUTION.md')).toBe(true);
    expect(byPath.get('prospec/index.md')).toBe(true);
    expect(byPath.get('prospec/ai-knowledge/_conventions.md')).toBe(true);
  });

  it('marks every doc present on a fully-seeded project and back-fills nothing', async () => {
    seedProject({ version: '0.1.0' });
    fs.writeFileSync(`${KB}/_glossary.md`, '# glossary\n');

    const { report } = await execute({ cwd: '/project' });

    expect(report.docs.every((d) => d.present)).toBe(true);
    expect(report.createdDocs).toEqual([]);
  });

  it('buildDocsInventory is a pure existence probe — it writes nothing', () => {
    seedProject({ version: '0.1.0' }); // _glossary.md absent

    const config = { project: { name: 'demo' }, paths: { base_dir: 'prospec' } } as ProspecConfig;
    const docs = buildDocsInventory(config, '/project');

    const byPath = new Map(docs.map((d) => [d.path, d.present]));
    expect(byPath.get('prospec/ai-knowledge/_glossary.md')).toBe(false);
    expect(fs.existsSync(`${KB}/_glossary.md`)).toBe(false); // probing created nothing
  });

  it('honors a knowledge.base_path override — docs at the configured path are present, not MISSING', () => {
    // A user may hand-edit .prospec.yaml to relocate the knowledge base; every
    // knowledge consumer (knowledge-init, agent-sync, knowledge-reader) honors
    // it, so the inventory must too — else all five ai-knowledge docs misreport
    // as MISSING and the skill would create duplicates at the wrong location.
    vol.fromJSON({
      '/p/prospec/README.md': '# r\n',
      '/p/prospec/CONSTITUTION.md': '# c\n',
      '/p/prospec/index.md': '# i\n',
      '/p/docs/kb/_conventions.md': '# conv\n',
      '/p/docs/kb/_diagram-conventions.md': '# diag\n',
      '/p/docs/kb/_glossary.md': '# glos\n',
      '/p/docs/kb/_status-lifecycle.md': '# lc\n',
      '/p/docs/kb/_module-readme-conventions.md': '# mrc\n',
    });
    const config = {
      project: { name: 'demo' },
      paths: { base_dir: 'prospec' },
      knowledge: { base_path: 'docs/kb' },
    } as ProspecConfig;

    const docs = buildDocsInventory(config, '/p');

    expect(docs.every((d) => d.present)).toBe(true);
    // the reported paths point at the ACTUAL location the skill must diff/create
    const paths = docs.map((d) => d.path);
    expect(paths).toContain('docs/kb/_glossary.md');
    expect(paths).toContain('prospec/CONSTITUTION.md');
    expect(paths.some((p) => p.includes('prospec/ai-knowledge'))).toBe(false);
  });

  it('buildDocsInventory respects a custom paths.base_dir', () => {
    vol.fromJSON({ '/p/docs/CONSTITUTION.md': '# c\n' });
    const config = {
      project: { name: 'demo' },
      paths: { base_dir: 'docs' },
    } as ProspecConfig;

    const docs = buildDocsInventory(config, '/p');

    const byPath = new Map(docs.map((d) => [d.path, d.present]));
    expect(byPath.get('docs/CONSTITUTION.md')).toBe(true);
    expect(byPath.get('docs/ai-knowledge/_glossary.md')).toBe(false);
  });
});
