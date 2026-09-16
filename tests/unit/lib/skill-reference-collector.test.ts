import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectSkillReferenceMap } from '../../../src/lib/drift-sources.js';
import type { ProspecConfig } from '../../../src/types/config.js';

/**
 * Real temp directories, never memfs: this collector enumerates directories and
 * reads through the realpath-containment helper, and a virtual filesystem answers
 * both questions differently from the one the check runs against.
 */
const created: string[] = [];
function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'prospec-skill-refs-'));
  created.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of created.splice(0)) {
    try {
      chmodSync(dir, 0o755);
    } catch {
      // already writable, or already gone
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

function deploy(root: string, skillPath: string, skill: string, references: string[] = []): void {
  mkdirSync(join(root, skillPath, skill), { recursive: true });
  writeFileSync(join(root, skillPath, skill, 'SKILL.md'), `# ${skill}\n`);
  if (references.length === 0) return;
  mkdirSync(join(root, skillPath, skill, 'references'), { recursive: true });
  for (const name of references) {
    writeFileSync(join(root, skillPath, skill, 'references', name), `# ${name}\n`);
  }
}

const config = (agents: string[]): ProspecConfig =>
  ({ version: '2.2.0', project: { name: 'x' }, agents } as unknown as ProspecConfig);

describe('skill reference deployment collector (REQ-LIB-079)', () => {
  it('reads a configured host deployment, bytes and reference inventory', () => {
    const root = project();
    deploy(root, '.claude/skills', 'prospec-tasks', ['tasks-format.md', 'tasks-verifier-rubric.md']);
    const source = collectSkillReferenceMap(config(['claude']), root);
    expect(source.available).toBe(true);
    expect(source.roots).toEqual(['.claude/skills']);
    const tasks = source.deployments.find((d) => d.skill === 'prospec-tasks')!;
    expect(tasks).toMatchObject({
      skill_path: '.claude/skills',
      source_path: '.claude/skills/prospec-tasks/SKILL.md',
      references: ['tasks-format.md', 'tasks-verifier-rubric.md'],
    });
    expect(tasks.text).toContain('# prospec-tasks');
  });

  it('reports a shipped skill with no deployed SKILL.md as unread, not as absent data', () => {
    const root = project();
    deploy(root, '.claude/skills', 'prospec-tasks', ['tasks-format.md']);
    const source = collectSkillReferenceMap(config(['claude']), root);
    const verify = source.deployments.find((d) => d.skill === 'prospec-verify')!;
    expect(verify.text).toBeNull();
    expect(verify.references).toEqual([]);
  });

  it('assesses a shared root once however many hosts name it', () => {
    const root = project();
    deploy(root, '.agents/skills', 'prospec-tasks', ['tasks-format.md']);
    const source = collectSkillReferenceMap(config(['codex', 'copilot', 'antigravity']), root);
    expect(source.roots).toEqual(['.agents/skills']);
    expect(source.deployments.filter((d) => d.skill === 'prospec-tasks')).toHaveLength(1);
  });

  it('assesses independent roots separately, so one host cannot mask another', () => {
    const root = project();
    deploy(root, '.claude/skills', 'prospec-tasks', ['tasks-format.md']);
    deploy(root, '.agents/skills', 'prospec-tasks', []);
    const source = collectSkillReferenceMap(config(['claude', 'codex']), root);
    expect(source.roots).toEqual(['.agents/skills', '.claude/skills']);
    const byRoot = Object.fromEntries(
      source.deployments.filter((d) => d.skill === 'prospec-tasks').map((d) => [d.skill_path, d.references]),
    );
    expect(byRoot).toEqual({ '.agents/skills': [], '.claude/skills': ['tasks-format.md'] });
  });

  it('leaves a project custom skill directory outside the collection', () => {
    const root = project();
    deploy(root, '.claude/skills', 'prospec-tasks', ['tasks-format.md']);
    deploy(root, '.claude/skills', 'my-house-style', ['whatever.md']);
    const source = collectSkillReferenceMap(config(['claude']), root);
    expect(source.deployments.map((d) => d.skill)).not.toContain('my-house-style');
  });

  it('skips a project that configures no agent rather than passing it', () => {
    const source = collectSkillReferenceMap(config([]), project());
    expect(source).toMatchObject({ available: false, deployments: [], roots: [] });
    expect(source.reason).toMatch(/no configured agent/);
  });

  it('collects a missing configured root as missing deployments', () => {
    const source = collectSkillReferenceMap(config(['claude']), project());
    expect(source.available).toBe(true);
    expect(source.deployments.length).toBeGreaterThan(0);
    expect(source.deployments.every((d) => d.text === null)).toBe(true);
  });

  // chmod does not revoke reads on Windows or for a privileged POSIX process.
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('records an unreadable root as unavailable rather than as an empty deployment', () => {
    const root = project();
    deploy(root, '.claude/skills', 'prospec-tasks', ['tasks-format.md']);
    try {
      chmodSync(join(root, '.claude/skills'), 0o000);
      const source = collectSkillReferenceMap(config(['claude']), root);
      // A root whose own listing is denied is explicitly named, never silently empty.
      expect(source.available).toBe(false);
      expect(Object.keys(source.unreadableRoots)).toEqual(['.claude/skills']);
      expect(source.reason).toContain('.claude/skills');
    } finally {
      chmodSync(join(root, '.claude/skills'), 0o755);
    }
  });
});
