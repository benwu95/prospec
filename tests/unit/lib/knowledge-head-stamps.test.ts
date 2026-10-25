import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gitIn } from '../../helpers/git-fixture.js';
import { usePrivateTmpdir } from '../../helpers/private-tmpdir.js';
import { readHeadModuleStamps } from '../../../src/lib/knowledge-sync.js';
import { execute as knowledgeVerify } from '../../../src/services/knowledge-verify.service.js';

vi.setConfig({ testTimeout: 30_000 });

const root = usePrivateTmpdir('knowledge-head-stamps');

const MAP = (stamp: string | null) =>
  `modules:\n  - name: lib\n    paths: [src/lib/**]\n    keywords: []\n${stamp === null ? '' : `    last_verified: '${stamp}'\n`}  - name: cli\n    paths: [src/cli/**]\n    keywords: []\n`;

let seq = 0;
function repo(): { dir: string; mapFile: string } {
  const dir = path.join(root, `repo-${seq++}`);
  mkdirSync(path.join(dir, 'prospec', 'ai-knowledge'), { recursive: true });
  gitIn(dir, 'init', '-q');
  return { dir, mapFile: path.join(dir, 'prospec', 'ai-knowledge', 'module-map.yaml') };
}

function commit(dir: string): void {
  gitIn(dir, 'add', '-A');
  gitIn(dir, 'commit', '-q', '-m', 'c');
}

describe('readHeadModuleStamps (REQ-SERVICES-090)', () => {
  it("returns each module's last_verified at HEAD, undefined where HEAD carries no stamp", () => {
    const { dir, mapFile } = repo();
    writeFileSync(mapFile, MAP('2026-10-24T01:00:00.000Z'));
    commit(dir);
    writeFileSync(mapFile, MAP('2026-10-24T09:00:00.000Z'));
    const stamps = readHeadModuleStamps(dir, mapFile);
    expect(stamps).not.toBeNull();
    expect(stamps!.get('lib')).toBe('2026-10-24T01:00:00.000Z');
    expect(stamps!.has('cli')).toBe(true);
    expect(stamps!.get('cli')).toBeUndefined();
  });

  it('reads HEAD relative to the project directory inside a larger repository', () => {
    const { dir } = repo();
    const project = path.join(dir, 'packages', 'app');
    const mapFile = path.join(project, 'prospec', 'ai-knowledge', 'module-map.yaml');
    mkdirSync(path.dirname(mapFile), { recursive: true });
    writeFileSync(mapFile, MAP('2026-10-24T01:00:00.000Z'));
    commit(dir);
    expect(readHeadModuleStamps(project, mapFile)!.get('lib')).toBe('2026-10-24T01:00:00.000Z');
  });

  it("reads the real file's history when module-map.yaml is an in-root symlink", () => {
    const { dir } = repo();
    const knowledge = path.join(dir, 'prospec', 'ai-knowledge');
    const real = path.join(knowledge, 'maps', 'real.yaml');
    mkdirSync(path.dirname(real), { recursive: true });
    writeFileSync(real, MAP('2026-10-24T01:00:00.000Z'));
    symlinkSync(path.join('maps', 'real.yaml'), path.join(knowledge, 'module-map.yaml'));
    commit(dir);
    expect(readHeadModuleStamps(dir, real)!.get('lib')).toBe('2026-10-24T01:00:00.000Z');
  });

  it('resolves the project directory before relating the real map file to it, so a symlinked cwd still reads HEAD', () => {
    const { dir, mapFile } = repo();
    writeFileSync(mapFile, MAP('2026-10-24T01:00:00.000Z'));
    commit(dir);
    const linked = path.join(root, `linked-${seq++}`);
    symlinkSync(dir, linked);
    expect(readHeadModuleStamps(linked, mapFile)?.get('lib')).toBe('2026-10-24T01:00:00.000Z');
  });

  it('is null for a committed map that parses as YAML but fails the module-map schema', () => {
    const { dir, mapFile } = repo();
    writeFileSync(mapFile, "modules:\n  - name: lib\n    paths: [src/lib/**]\n    last_verified: '2026-10-24T01:00:00.000Z'\n");
    commit(dir);
    expect(readHeadModuleStamps(dir, mapFile)).toBeNull();
  });

  it('is null when HEAD cannot answer: no repository, no commit, the file absent at HEAD, or a map failing the schema', () => {
    const plain = path.join(root, `plain-${seq++}`);
    mkdirSync(plain, { recursive: true });
    writeFileSync(path.join(plain, 'module-map.yaml'), MAP(null));
    expect(readHeadModuleStamps(plain, path.join(plain, 'module-map.yaml'))).toBeNull();

    const unborn = repo();
    writeFileSync(unborn.mapFile, MAP(null));
    expect(readHeadModuleStamps(unborn.dir, unborn.mapFile)).toBeNull();

    const absent = repo();
    writeFileSync(path.join(absent.dir, 'README.md'), 'x');
    commit(absent.dir);
    writeFileSync(absent.mapFile, MAP(null));
    expect(readHeadModuleStamps(absent.dir, absent.mapFile)).toBeNull();

    const invalid = repo();
    writeFileSync(invalid.mapFile, 'modules: not-a-list\n');
    commit(invalid.dir);
    writeFileSync(invalid.mapFile, MAP(null));
    expect(readHeadModuleStamps(invalid.dir, invalid.mapFile)).toBeNull();
  });
});

describe('prospec knowledge verify against a real repository (REQ-SERVICES-090, REQ-TESTS-142)', () => {
  const project = (dir: string) => {
    writeFileSync(path.join(dir, '.prospec.yaml'), 'project:\n  name: t\n');
    mkdirSync(path.join(dir, 'src', 'lib'), { recursive: true });
    writeFileSync(path.join(dir, 'src', 'lib', 'a.ts'), 'a\n');
  };

  it('skips a re-stamp while the source is unchanged, on any day, and stamps again once it changes', async () => {
    const { dir, mapFile } = repo();
    project(dir);
    writeFileSync(mapFile, MAP('2026-10-20T01:00:00.000Z'));
    commit(dir);

    const first = await knowledgeVerify({ modules: ['lib'], cwd: dir, now: '2026-10-24T02:00:00.000Z' });
    expect(first.verified).toEqual(['lib']);
    const stamped = readFileSync(mapFile, 'utf-8');
    expect(stamped).toMatch(/source_digest: source-v1:[0-9a-f]{64}/);

    const nextDay = await knowledgeVerify({ modules: ['lib'], cwd: dir, now: '2026-10-25T05:00:00.000Z' });
    expect(nextDay).toMatchObject({ verified: [], skipped: ['lib'] });
    expect(readFileSync(mapFile, 'utf-8')).toBe(stamped);

    writeFileSync(path.join(dir, 'src', 'lib', 'b.ts'), 'added after the stamp\n');
    const edited = await knowledgeVerify({ modules: ['lib'], cwd: dir, now: '2026-10-25T06:00:00.000Z' });
    expect(edited.verified).toEqual(['lib']);
    expect(readFileSync(mapFile, 'utf-8')).not.toBe(stamped);

    commit(dir);
    const afterCommit = await knowledgeVerify({ modules: ['lib'], cwd: dir, now: '2026-10-25T07:00:00.000Z' });
    expect(afterCommit.verified).toEqual(['lib']);
    expect(readFileSync(mapFile, 'utf-8')).toContain('2026-10-25T07:00:00.000Z');
  });

  it('skips an unchanged re-stamp when module-map.yaml is an in-root symlink, reading HEAD for the real file', async () => {
    const { dir } = repo();
    project(dir);
    const knowledge = path.join(dir, 'prospec', 'ai-knowledge');
    const real = path.join(knowledge, 'maps', 'real.yaml');
    mkdirSync(path.dirname(real), { recursive: true });
    writeFileSync(real, MAP('2026-10-20T01:00:00.000Z'));
    symlinkSync(path.join('maps', 'real.yaml'), path.join(knowledge, 'module-map.yaml'));
    commit(dir);

    expect((await knowledgeVerify({ modules: ['lib'], cwd: dir, now: '2026-10-24T02:00:00.000Z' })).verified).toEqual(['lib']);
    const stamped = readFileSync(real, 'utf-8');
    const again = await knowledgeVerify({ modules: ['lib'], cwd: dir, now: '2026-10-24T05:00:00.000Z' });
    expect(again).toMatchObject({ verified: [], skipped: ['lib'] });
    expect(readFileSync(real, 'utf-8')).toBe(stamped);
  });

  it('stamps a working-tree stamp earlier than HEAD or unparsable, and skips only the modules this change stamped', async () => {
    const { dir, mapFile } = repo();
    project(dir);
    writeFileSync(mapFile, MAP('2026-10-24T05:00:00.000Z'));
    commit(dir);

    writeFileSync(mapFile, MAP('2026-10-24T01:00:00.000Z'));
    const earlier = await knowledgeVerify({ modules: ['lib'], cwd: dir, now: '2026-10-24T08:00:00.000Z' });
    expect(earlier).toMatchObject({ verified: ['lib'], skipped: [] });

    const partial = await knowledgeVerify({ modules: ['lib', 'cli'], cwd: dir, now: '2026-10-24T09:00:00.000Z' });
    expect(partial).toMatchObject({ verified: ['cli'], skipped: ['lib'] });
    const after = readFileSync(mapFile, 'utf-8');
    expect(after).toContain('2026-10-24T08:00:00.000Z');
    expect(after).toContain('2026-10-24T09:00:00.000Z');
  });

  it('refuses, leaving the map byte-identical, while the index holds unmerged entries', async () => {
    const { dir, mapFile } = repo();
    project(dir);
    writeFileSync(mapFile, MAP(null));
    commit(dir);
    gitIn(dir, 'checkout', '-qb', 'side');
    writeFileSync(path.join(dir, 'src', 'lib', 'a.ts'), 'side\n');
    commit(dir);
    gitIn(dir, 'checkout', '-q', '-');
    writeFileSync(path.join(dir, 'src', 'lib', 'a.ts'), 'main\n');
    commit(dir);
    try { gitIn(dir, 'merge', 'side'); } catch { /* conflict expected */ }
    const before = readFileSync(mapFile, 'utf-8');
    await expect(knowledgeVerify({ modules: ['lib'], cwd: dir, now: '2026-10-24T02:00:00.000Z' })).rejects.toThrow(/source digest cannot be computed/);
    expect(readFileSync(mapFile, 'utf-8')).toBe(before);
  });
});
