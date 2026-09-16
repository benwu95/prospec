/**
 * Integration: a real four-host `agent sync`, on a real filesystem, with the real
 * templates — then the real collector and evaluator over what it wrote.
 *
 * Everything here is compared against the FROZEN pre-migration baseline rather
 * than against the registry that produced it, and every mutation is asserted to
 * have landed in the deployed bytes before its verdict is read. A "mutant fails"
 * assertion whose mutation silently missed is the failure mode this guards.
 */
import { chmodSync, existsSync, symlinkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import BASELINE from '../fixtures/station-reference-baseline.json' with { type: 'json' };
import { evaluateSkillReferenceMap } from '../../src/lib/drift-checker.js';
import { collectSkillReferenceMap } from '../../src/lib/drift-sources.js';
import { execute as agentSync } from '../../src/services/agent-sync.service.js';
import type { ProspecConfig } from '../../src/types/config.js';
import { SKILL_DEFINITIONS } from '../../src/types/skill.js';

const baseline = BASELINE as unknown as {
  hosts: Record<string, { skill_path: string; references: Record<string, string[]> }>;
};

const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function sync(agents: string[]): Promise<{ cwd: string; config: ProspecConfig }> {
  const cwd = mkdtempSync(join(tmpdir(), 'prospec-station-sync-'));
  created.push(cwd);
  const yaml =
    'version: "2.2.0"\nproject:\n  name: sync-test\npaths:\n  base_dir: prospec\n' +
    `agents:\n${agents.map((agent) => `  - ${agent}\n`).join('')}`;
  writeFileSync(join(cwd, '.prospec.yaml'), yaml);
  mkdirSync(join(cwd, 'prospec'), { recursive: true });
  await agentSync({ cwd });
  return { cwd, config: { agents } as unknown as ProspecConfig };
}

const deployedReferences = (cwd: string, skillPath: string, skill: string): string[] => {
  try {
    return readdirSync(join(cwd, skillPath, skill, 'references')).sort();
  } catch {
    return [];
  }
};

const verdict = (cwd: string, config: ProspecConfig) =>
  evaluateSkillReferenceMap(collectSkillReferenceMap(config, cwd));

describe('four-host sync deploys the pre-migration reference set (REQ-TEMPLATES-232)', () => {
  it.each(Object.keys(baseline.hosts))('%s', async (host) => {
    const { cwd } = await sync([host]);
    const skillPath = baseline.hosts[host]!.skill_path;
    for (const skill of SKILL_DEFINITIONS) {
      expect(deployedReferences(cwd, skillPath, skill.name), `${host}: ${skill.name}`).toEqual(
        baseline.hosts[host]!.references[skill.name],
      );
    }
  });

  it('writes one set for the three hosts that share a root', async () => {
    const { cwd, config } = await sync(['codex', 'copilot', 'antigravity']);
    expect(readdirSync(cwd).sort()).toEqual(['.agents', '.prospec.yaml', 'AGENTS.md', 'prospec']);
    const source = collectSkillReferenceMap(config, cwd);
    expect(source.roots).toEqual(['.agents/skills']);
    // One deployment row per shipped skill — not three, one per host naming the root.
    expect(source.deployments).toHaveLength(SKILL_DEFINITIONS.length);
    expect(verdict(cwd, config).result.status).toBe('pass');
  });

  it('assesses independent roots separately, so a synced host cannot cover an unsynced one', async () => {
    const { cwd } = await sync(['claude']);
    // The project also configures codex, whose root was never written.
    const config = { agents: ['claude', 'codex'] } as unknown as ProspecConfig;
    const source = collectSkillReferenceMap(config, cwd);
    expect(source.deployments.some((d) => d.skill_path === '.agents/skills' && d.text === null)).toBe(true);
    expect(verdict(cwd, config).result.status).toBe('fail');
  });
});

describe('the deployed map is what the check reads (REQ-LIB-079, REQ-TESTS-119)', () => {
  it('passes a freshly synced project on every host', async () => {
    const { cwd, config } = await sync(['claude', 'codex', 'copilot', 'antigravity']);
    const result = verdict(cwd, config);
    expect(result.findings).toEqual([]);
    expect(result.result.status).toBe('pass');
  });

  it('fails when a phase citation is deleted from the deployed file', async () => {
    const { cwd, config } = await sync(['claude']);
    const file = join(cwd, '.claude/skills/prospec-tasks/SKILL.md');
    const before = readFileSync(file, 'utf8');
    const start = before.indexOf('### Phase 3: Decompose by Architecture Layer');
    const end = before.indexOf('### Phase 4', start);
    expect(start).toBeGreaterThan(-1);
    const section = before.slice(start, end);
    expect(section).toContain('references/tasks-format.md');
    writeFileSync(
      file,
      before.slice(0, start) + section.replaceAll('references/tasks-format.md', 'the tasks format') + before.slice(end),
    );
    // Prove the mutation landed in the bytes the collector will read.
    const after = readFileSync(file, 'utf8');
    expect(after).not.toBe(before);
    expect(after.slice(start, after.indexOf('### Phase 4', start))).not.toContain('references/tasks-format.md');

    const result = verdict(cwd, config);
    expect(result.result.status).toBe('fail');
    expect(result.findings.map((finding) => finding.detail).join('\n')).toContain(
      'Phase 3: Decompose by Architecture Layer',
    );
  });

  it('fails when a phase citation is only MOVED, not removed from the file', async () => {
    const { cwd, config } = await sync(['claude']);
    const file = join(cwd, '.claude/skills/prospec-tasks/SKILL.md');
    const before = readFileSync(file, 'utf8');
    const start = before.indexOf('### Phase 3: Decompose by Architecture Layer');
    const end = before.indexOf('### Phase 4', start);
    const section = before.slice(start, end);
    const moved =
      before.slice(0, start) +
      section.replaceAll('references/tasks-format.md', 'the tasks format') +
      before.slice(end) +
      '\n## Appendix\n\nSee `references/tasks-format.md`.\n';
    writeFileSync(file, moved);
    const after = readFileSync(file, 'utf8');
    // The file still names the reference — just not where the station reads it.
    expect(after).toContain('references/tasks-format.md');
    expect(after.slice(start, after.indexOf('### Phase 4', start))).not.toContain('references/tasks-format.md');

    const result = verdict(cwd, config);
    expect(result.result.status).toBe('fail');
    expect(result.findings.map((finding) => finding.detail).join('\n')).toContain(
      'A citation elsewhere in the file does not satisfy this load point',
    );
  });

  it('fails when a rendered map keeps its links but loses its purpose text', async () => {
    const { cwd, config } = await sync(['claude']);
    const file = join(cwd, '.claude/skills/prospec-tasks/SKILL.md');
    const before = readFileSync(file, 'utf8');
    expect(before).toContain(' for tasks.md format');
    writeFileSync(file, before.replace(' for tasks.md format', ' whenever you feel like it'));
    const after = readFileSync(file, 'utf8');
    expect(after).not.toContain(' for tasks.md format');
    // Every citation survives; only the map text changed.
    expect(after).toContain('references/tasks-format.md');

    const result = verdict(cwd, config);
    expect(result.result.status).toBe('fail');
    expect(result.findings.map((finding) => finding.detail).join('\n')).toContain(
      'no longer match the registry',
    );
  });

  it('fails when a deployed reference is removed', async () => {
    const { cwd, config } = await sync(['claude']);
    const file = join(cwd, '.claude/skills/prospec-tasks/references/tasks-format.md');
    rmSync(file);
    expect(deployedReferences(cwd, '.claude/skills', 'prospec-tasks')).not.toContain('tasks-format.md');

    const result = verdict(cwd, config);
    expect(result.result.status).toBe('fail');
    expect(result.findings.map((finding) => finding.detail).join('\n')).toContain('is registered');
  });

  it('fails when a stale reference is left behind', async () => {
    const { cwd, config } = await sync(['claude']);
    const file = join(cwd, '.claude/skills/prospec-tasks/references/retired-format.md');
    writeFileSync(file, '# retired\n');
    expect(deployedReferences(cwd, '.claude/skills', 'prospec-tasks')).toContain('retired-format.md');

    const result = verdict(cwd, config);
    expect(result.result.status).toBe('fail');
    expect(result.findings.map((finding) => finding.detail).join('\n')).toContain('no load point claims it');
  });

  it('leaves a project custom skill alone', async () => {
    const { cwd, config } = await sync(['claude']);
    mkdirSync(join(cwd, '.claude/skills/my-house-style/references'), { recursive: true });
    writeFileSync(join(cwd, '.claude/skills/my-house-style/SKILL.md'), 'Read `references/mine.md`.\n');
    writeFileSync(join(cwd, '.claude/skills/my-house-style/references/mine.md'), '# mine\n');
    expect(verdict(cwd, config).result.status).toBe('pass');
  });
});


describe('review regression pins for unavailable deployments and hidden citations', () => {
  it('R1-1: fails when a configured deployment root is deleted', async () => {
    const { cwd, config } = await sync(['claude', 'codex']);
    expect(verdict(cwd, config).result.status).toBe('pass');
    rmSync(join(cwd, '.agents/skills'), { recursive: true });
    expect(existsSync(join(cwd, '.agents/skills'))).toBe(false);
    expect(verdict(cwd, config).result.status).toBe('fail');
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'R1-2: an unreadable host cannot be masked by a healthy host', async () => {
      const { cwd, config } = await sync(['claude', 'codex']);
      const denied = join(cwd, '.agents/skills');
      expect(verdict(cwd, config).result.status).toBe('pass');
      try {
        chmodSync(denied, 0o000);
        const source = collectSkillReferenceMap(config, cwd);
        expect(source.unreadableRoots['.agents/skills']).toBeTruthy();
        const result = evaluateSkillReferenceMap(source);
        expect(result.result.status).toBe('skipped');
        expect(result.result.reason).toContain('.agents/skills');
        // Known failures on the readable host still take precedence over a skip.
        rmSync(join(cwd, '.claude/skills/prospec-tasks/references/tasks-format.md'));
        const failed = verdict(cwd, config);
        expect(failed.result.status).toBe('fail');
        expect(failed.result.reason).toContain('.agents/skills');
      } finally {
        chmodSync(denied, 0o755);
      }
    },
  );

  it.skipIf(process.platform === 'win32')('R1-3: a dangling reference symlink is not deployed', async () => {
    const { cwd, config } = await sync(['claude']);
    const reference = join(cwd, '.claude/skills/prospec-tasks/references/tasks-format.md');
    expect(verdict(cwd, config).result.status).toBe('pass');
    rmSync(reference);
    symlinkSync(join(cwd, 'missing.md'), reference);
    expect(existsSync(reference)).toBe(false);
    const result = verdict(cwd, config);
    expect(result.result.status).toBe('fail');
    expect(result.findings.some((f) => f.source_path.endsWith('/references/tasks-format.md'))).toBe(true);
  });

  it('R1-4: a commented phase citation cannot satisfy its load point', async () => {
    const { cwd, config } = await sync(['claude']);
    const file = join(cwd, '.claude/skills/prospec-tasks/SKILL.md');
    const before = readFileSync(file, 'utf8');
    const start = before.indexOf('### Phase 3: Decompose by Architecture Layer');
    const end = before.indexOf('### Phase 4', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const section = before.slice(start, end);
    expect(section).toContain('references/tasks-format.md');
    const commented = section.split('\n').map((line) =>
      line.includes('references/tasks-format.md') ? `<!-- ${line} -->` : line,
    ).join('\n');
    expect(commented).not.toBe(section);
    writeFileSync(file, before.slice(0, start) + commented + before.slice(end));
    const result = verdict(cwd, config);
    expect(result.result.status).toBe('fail');
    expect(result.findings.some((f) => f.detail.includes('Phase 3: Decompose'))).toBe(true);
  });
});
