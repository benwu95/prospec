import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { execute as init } from '../../src/services/init.service.js';
import { execute as sync } from '../../src/services/agent-sync.service.js';

vi.mock('../../src/lib/bundled-templates.js', () => ({ BUNDLED_TEMPLATES: {} }));

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'prospec-init-guidance-'));
  roots.push(cwd);
  writeFileSync(join(cwd, 'package.json'), '{"name":"fixture"}');
  return cwd;
}

const readEntry = (cwd: string): string => readFileSync(join(cwd, 'AGENTS.md'), 'utf8');
const invocationRows = (entry: string): string[] => entry.split('\n').filter((line) => /^\| (Codex|GitHub Copilot|Antigravity|Claude Code) \|/.test(line));
const protocol = (entry: string): string => entry.slice(entry.indexOf('**Station Transition Protocol**'), entry.indexOf('**Evidence Recording Order**'));
const checkpoint = (entry: string): string => entry.split('\n').find((line) => line.startsWith('**Checkpoint Correction Capture Protocol**'))!;

describe('init entry uses its configured output group', () => {
  it('renders the Codex invocation row before any sync', async () => {
    const cwd = project();
    await init({ agents: ['codex'], cwd });
    expect(invocationRows(readEntry(cwd))).toEqual(['| Codex | `$prospec-<name>` |']);
    expect(existsSync(join(cwd, '.agents/skills'))).toBe(false);
  });

  it('renders the station deployment location before any sync', async () => {
    const cwd = project();
    await init({ agents: ['codex'], cwd });
    expect(protocol(readEntry(cwd))).toContain('fallback path under `.agents/skills/`');
    expect(protocol(readEntry(cwd))).not.toContain('under `/`');
  });

  it('renders the checkpoint reference deployment location before any sync', async () => {
    const cwd = project();
    await init({ agents: ['codex'], cwd });
    expect(checkpoint(readEntry(cwd))).toContain('promotion-format reference under `.agents/skills/`');
  });

  it.each([
    { agents: ['codex', 'copilot', 'antigravity'] },
    { agents: ['antigravity', 'codex', 'copilot'] },
  ])('merges every shared host in canonical order for $agents', async ({ agents }) => {
    const cwd = project();
    await init({ agents, cwd });
    const entry = readEntry(cwd);
    expect(invocationRows(entry)).toEqual([
      '| Codex | `$prospec-<name>` |',
      '| GitHub Copilot | `/prospec-<name>` |',
      '| Antigravity | Mention the bare Skill name or select it from the Skills browser. `prospec-<name>` |',
    ]);
    expect(protocol(entry)).toContain('Read the named station');
    expect(protocol(entry)).not.toContain('Invoke — or re-invoke');
    await sync({ cwd });
    expect(invocationRows(readEntry(cwd))).toEqual(invocationRows(entry));
    expect(protocol(readEntry(cwd))).toBe(protocol(entry));
    expect(checkpoint(readEntry(cwd))).toBe(checkpoint(entry));
  });

  it('keeps Claude outside the provisional AGENTS.md group', async () => {
    const cwd = project();
    await init({ agents: ['claude', 'codex'], cwd });
    const entry = readEntry(cwd);
    expect(invocationRows(entry)).toEqual(['| Codex | `$prospec-<name>` |']);
    expect(protocol(entry)).toContain('Read the named station');
    expect(entry).not.toContain('.claude/skills');
  });

  it.each([{ agents: ['claude'] }, { agents: [] }])('provides conservative onboarding for $agents', async ({ agents }) => {
    const cwd = project();
    await init({ agents, cwd });
    const entry = readEntry(cwd);
    expect(invocationRows(entry)).toEqual([]);
    expect(entry).not.toContain('| Host |');
    expect(entry).toContain('No agent selected for this project reads `AGENTS.md`.');
    expect(protocol(entry)).toContain('an agent that reads `AGENTS.md`');
    expect(protocol(entry)).toContain('prospec agent sync');
    expect(protocol(entry)).toContain('prospec status');
    expect(protocol(entry)).not.toContain('under `/`');
    expect(checkpoint(entry)).toContain('prospec status');
    expect(checkpoint(entry)).not.toContain('under `/`');
    expect(entry).not.toContain('.claude/skills');
  });

  it('preserves authored entry content through init and sync', async () => {
    const cwd = project();
    writeFileSync(join(cwd, 'AGENTS.md'), '# Authored rules\nKeep this rule.\n');
    await init({ agents: ['codex'], cwd });
    expect(readEntry(cwd)).toContain('<!-- prospec:user-start -->\n# Authored rules\nKeep this rule.');
    await sync({ cwd });
    expect(readEntry(cwd)).toContain('<!-- prospec:user-start -->\n# Authored rules\nKeep this rule.');
  });
});

describe('init reports actual phase and artifact outcomes', () => {
  it('records completed phases and file order with config last', async () => {
    const cwd = project();
    const result = await init({ agents: ['codex'], cwd });
    expect(result.phases).toEqual([
      'inspect-project', 'resolve-configuration', 'render-templates',
      'write-artifacts', 'sync-gitignore', 'write-config',
    ]);
    expect(result.artifacts.at(-1)).toEqual({ path: '.prospec.yaml', status: 'created' });
    expect(result.artifacts.find((artifact) => artifact.path === 'AGENTS.md')).toEqual({ path: 'AGENTS.md', status: 'created' });
    expect(result.artifacts.every((artifact) => artifact.status === 'created')).toBe(true);
    expect(result.createdFiles[0]).toBe('.prospec.yaml');
  });

  it('reports preserved curated files and merged entry on recovery', async () => {
    const cwd = project();
    await init({ agents: ['codex'], cwd });
    unlinkSync(join(cwd, '.prospec.yaml'));
    const constitution = readFileSync(join(cwd, 'prospec/CONSTITUTION.md'), 'utf8');
    const result = await init({ agents: ['codex'], cwd });
    expect(result.artifacts.find((artifact) => artifact.path === 'prospec/CONSTITUTION.md')).toEqual({ path: 'prospec/CONSTITUTION.md', status: 'skipped' });
    expect(result.artifacts.find((artifact) => artifact.path === 'AGENTS.md')).toEqual({ path: 'AGENTS.md', status: 'merged' });
    expect(result.artifacts.at(-1)).toEqual({ path: '.prospec.yaml', status: 'created' });
    expect(readFileSync(join(cwd, 'prospec/CONSTITUTION.md'), 'utf8')).toBe(constitution);
    expect(result.createdFiles).toEqual(['.prospec.yaml', 'AGENTS.md']);
  });
});
