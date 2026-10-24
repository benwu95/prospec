import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { execute } from '../../../src/services/knowledge-verify.service.js';
import { readHeadModuleStamps } from '../../../src/lib/knowledge-sync.js';
import { PrerequisiteError } from '../../../src/types/errors.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

// HEAD is read through git, which memfs cannot serve: every case states what
// HEAD holds, and by default HEAD cannot answer (no module is skipped).
vi.mock('../../../src/lib/knowledge-sync.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/knowledge-sync.js')>();
  return { ...actual, readHeadModuleStamps: vi.fn(() => null) };
});

vi.mock('../../../src/lib/config.js', () => ({
  readConfig: vi.fn().mockResolvedValue({
    project: { name: 'test-project' },
    knowledge: { base_path: 'prospec/ai-knowledge' },
  }),
  resolveBasePaths: vi.fn().mockReturnValue({
    baseDir: '/test/prospec',
    knowledgePath: '/test/prospec/ai-knowledge',
    constitutionPath: '/test/prospec/CONSTITUTION.md',
    specsPath: '/test/prospec/specs',
  }),
}));

const MAP_PATH = '/test/prospec/ai-knowledge/module-map.yaml';
const NOW = '2026-08-14T12:00:00.000Z';

describe('knowledge-verify.service (REQ-SERVICES-090)', () => {
  beforeEach(() => {
    vol.reset();
    vi.mocked(readHeadModuleStamps).mockReset().mockReturnValue(null);
  });

  it('stamps last_verified=now for a named module and preserves the others', async () => {
    vol.fromJSON({
      [MAP_PATH]:
        '# curated header — dependency direction: cli → services → lib → types\n' +
        'modules:\n' +
        '  - name: lib\n    paths: ["src/lib"]\n    keywords: ["lib"]\n    last_verified: "2026-01-01T00:00:00Z"\n' +
        '  - name: cli\n    paths: ["src/cli"]\n    keywords: ["cli"]\n    last_verified: "2026-02-02T00:00:00Z"\n',
    });

    const result = await execute({ modules: ['lib'], cwd: '/test', now: NOW });

    expect(result.verified).toEqual(['lib']);
    expect(result.timestamp).toBe(NOW);
    const content = vol.readFileSync(MAP_PATH, 'utf-8') as string;
    expect(content).toContain(`last_verified: ${NOW}`);
    // cli's stamp is untouched; the curated header comment survives the write.
    expect(content).toContain('2026-02-02T00:00:00Z');
    expect(content).not.toContain('2026-01-01T00:00:00Z');
    expect(content).toContain('# curated header');
  });

  it('adds last_verified to a module that had none', async () => {
    vol.fromJSON({
      [MAP_PATH]: 'modules:\n  - name: lib\n    paths: ["src/lib"]\n    keywords: ["lib"]\n',
    });

    await execute({ modules: ['lib'], cwd: '/test', now: NOW });

    const content = vol.readFileSync(MAP_PATH, 'utf-8') as string;
    expect(content).toContain(`last_verified: ${NOW}`);
  });

  it('stamps several de-duplicated modules in one call', async () => {
    vol.fromJSON({
      [MAP_PATH]:
        'modules:\n' +
        '  - name: lib\n    paths: ["src/lib"]\n    keywords: ["lib"]\n' +
        '  - name: cli\n    paths: ["src/cli"]\n    keywords: ["cli"]\n',
    });

    const result = await execute({ modules: ['lib', 'cli', 'lib'], cwd: '/test', now: NOW });

    expect(result.verified).toEqual(['lib', 'cli']);
    const content = vol.readFileSync(MAP_PATH, 'utf-8') as string;
    expect(content.match(new RegExp(NOW, 'g'))).toHaveLength(2);
  });

  it('throws PrerequisiteError naming an unknown module without writing', async () => {
    vol.fromJSON({
      [MAP_PATH]: 'modules:\n  - name: lib\n    paths: ["src/lib"]\n    keywords: ["lib"]\n',
    });
    const before = vol.readFileSync(MAP_PATH, 'utf-8') as string;

    await expect(execute({ modules: ['ghost'], cwd: '/test', now: NOW })).rejects.toThrow(
      PrerequisiteError,
    );
    expect(vol.readFileSync(MAP_PATH, 'utf-8')).toBe(before);
  });

  it('throws when no module is named', async () => {
    vol.fromJSON({
      [MAP_PATH]: 'modules:\n  - name: lib\n    paths: ["src/lib"]\n    keywords: ["lib"]\n',
    });
    await expect(execute({ modules: [], cwd: '/test', now: NOW })).rejects.toThrow(PrerequisiteError);
  });

  it('throws when module-map.yaml is absent', async () => {
    vol.fromJSON({});
    await expect(execute({ modules: ['lib'], cwd: '/test', now: NOW })).rejects.toThrow(
      PrerequisiteError,
    );
  });

  // #328: the stamp used to be written through a symlink, replacing the link with a
  // copy of the outside content.
  describe('judges the map before writing any last_verified', () => {
    const KP = '/test/prospec/ai-knowledge';
    const VALID_MAP = 'modules:\n  - name: lib\n    paths: ["src/lib"]\n    keywords: ["lib"]\n';

    const refusal = async (): Promise<PrerequisiteError> => {
      const error = await execute({ modules: ['lib'], cwd: '/test', now: NOW }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PrerequisiteError);
      return error as PrerequisiteError;
    };
    const linkMap = (target: string): void => {
      vol.mkdirSync(KP, { recursive: true });
      vol.symlinkSync(target, MAP_PATH);
    };

    it('refuses a map that resolves outside the knowledge root, writing nothing', async () => {
      vol.fromJSON({ '/outside/module-map.yaml': VALID_MAP });
      linkMap('/outside/module-map.yaml');
      const before = vol.toJSON();
      const error = await refusal();
      expect(error.message).toContain('resolves outside the knowledge root');
      expect(error.message).toContain('no last_verified was written');
      expect(error.suggestion).toContain('inside the knowledge root');
      expect(vol.toJSON()).toEqual(before);
      expect(vol.lstatSync(MAP_PATH).isSymbolicLink()).toBe(true);
      expect(vol.readFileSync('/outside/module-map.yaml', 'utf-8')).toBe(VALID_MAP);
    });

    it.each([
      ['cannot be parsed', (): void => void vol.fromJSON({ [MAP_PATH]: 'modules: [\n  - : :\n' })],
      ['fails its schema', (): void => void vol.fromJSON({ [MAP_PATH]: 'modules:\n  - name: lib\n    paths: ["src/lib"]\n' })],
      ['is a directory', (): void => void vol.mkdirSync(MAP_PATH, { recursive: true })],
    ])('refuses a map that %s with the cause readKnownModules reports, writing nothing', async (_label, arrange) => {
      arrange();
      const before = vol.toJSON();
      const error = await refusal();
      expect(error.message).toContain('module-map.yaml cannot be read, parsed or validated');
      expect(error.suggestion).toContain('repair module-map.yaml');
      expect(vol.toJSON()).toEqual(before);
    });

    it.each([
      ['absent', (): void => undefined],
      ['a symlink whose target does not exist', (): void => linkMap('/outside/missing.yaml')],
    ])('keeps the not-found refusal when the map is %s', async (_label, arrange) => {
      arrange();
      const error = await refusal();
      expect(error.message).toContain('module-map.yaml not found');
    });

    it('stamps the target of a map symlinked to another file inside the knowledge root, keeping the link', async () => {
      vol.fromJSON({ [`${KP}/real/map.yaml`]: VALID_MAP });
      linkMap(`${KP}/real/map.yaml`);
      const result = await execute({ modules: ['lib'], cwd: '/test', now: NOW });
      expect(vol.lstatSync(MAP_PATH).isSymbolicLink()).toBe(true);
      expect(vol.readFileSync(`${KP}/real/map.yaml`, 'utf-8')).toContain(`last_verified: ${NOW}`);
      expect(result.moduleMapPath).toBe(MAP_PATH);
    });

    it('changes only the named module stamp of a readable map inside the knowledge root', async () => {
      // block style: the Document write reflows flow sequences, which predates the judgment
      const blockMap = 'modules:\n  - name: lib\n    paths:\n      - src/lib\n    keywords:\n      - lib\n';
      vol.fromJSON({ [MAP_PATH]: blockMap });
      await execute({ modules: ['lib'], cwd: '/test', now: NOW });
      expect(vol.readFileSync(MAP_PATH, 'utf-8')).toBe(`${blockMap}    last_verified: ${NOW}\n`);
    });
  });
});

describe('knowledge-verify.service — same-day stamp skip (REQ-SERVICES-090)', () => {
  const SAME_DAY = '2026-08-14T03:00:00.000Z';
  const map = (lib: string | null, cli: string | null) =>
    'modules:\n' +
    `  - name: lib\n    paths: ["src/lib"]\n    keywords: ["lib"]\n${lib === null ? '' : `    last_verified: "${lib}"\n`}` +
    `  - name: cli\n    paths: ["src/cli"]\n    keywords: ["cli"]\n${cli === null ? '' : `    last_verified: "${cli}"\n`}`;
  const head = (entries: Record<string, string | undefined>) =>
    vi.mocked(readHeadModuleStamps).mockReturnValue(new Map(Object.entries(entries)));

  beforeEach(() => {
    vol.reset();
    vi.mocked(readHeadModuleStamps).mockReset().mockReturnValue(null);
  });

  it('skips a module stamped later than HEAD on the same UTC day, leaving the map byte-identical', async () => {
    vol.fromJSON({ [MAP_PATH]: map(SAME_DAY, null) });
    head({ lib: '2026-08-01T00:00:00.000Z', cli: undefined });
    const before = vol.readFileSync(MAP_PATH, 'utf-8');
    const result = await execute({ modules: ['lib'], cwd: '/test', now: NOW });
    expect(result.verified).toEqual([]);
    expect(result.skipped).toEqual(['lib']);
    expect(vol.readFileSync(MAP_PATH, 'utf-8')).toBe(before);
  });

  it('treats a module or stamp absent at HEAD, or an unparsable HEAD stamp, as earlier', async () => {
    for (const headLib of [undefined, 'not-a-date']) {
      vol.reset();
      vol.fromJSON({ [MAP_PATH]: map(SAME_DAY, null) });
      head(headLib === undefined ? {} : { lib: headLib });
      const result = await execute({ modules: ['lib'], cwd: '/test', now: NOW });
      expect(result.skipped, String(headLib)).toEqual(['lib']);
    }
  });

  it('stamps when the working-tree stamp equals HEAD, precedes it, falls on another day, or does not parse', async () => {
    const cases: [string, string][] = [
      [SAME_DAY, SAME_DAY],
      ['2026-08-14T01:00:00.000Z', SAME_DAY],
      ['2026-08-13T23:00:00.000Z', '2026-08-01T00:00:00.000Z'],
      ['garbage', '2026-08-01T00:00:00.000Z'],
    ];
    for (const [worktree, atHead] of cases) {
      vol.reset();
      vol.fromJSON({ [MAP_PATH]: map(worktree, null) });
      head({ lib: atHead });
      const result = await execute({ modules: ['lib'], cwd: '/test', now: NOW });
      expect(result.verified, `${worktree} vs ${atHead}`).toEqual(['lib']);
      expect(result.skipped).toEqual([]);
      expect(vol.readFileSync(MAP_PATH, 'utf-8')).toContain(`last_verified: ${NOW}`);
    }
  });

  it('skips nothing when HEAD cannot answer', async () => {
    vol.fromJSON({ [MAP_PATH]: map(SAME_DAY, null) });
    const result = await execute({ modules: ['lib'], cwd: '/test', now: NOW });
    expect(result.verified).toEqual(['lib']);
    expect(result.skipped).toEqual([]);
  });

  it('rewrites only the modules not skipped and lists each kind', async () => {
    vol.fromJSON({ [MAP_PATH]: map(SAME_DAY, '2026-08-01T00:00:00.000Z') });
    head({ lib: '2026-08-01T00:00:00.000Z', cli: '2026-08-01T00:00:00.000Z' });
    const result = await execute({ modules: ['lib', 'cli'], cwd: '/test', now: NOW });
    expect(result.verified).toEqual(['cli']);
    expect(result.skipped).toEqual(['lib']);
    const content = vol.readFileSync(MAP_PATH, 'utf-8') as string;
    expect(content).toContain(SAME_DAY);
    expect(content.match(new RegExp(NOW, 'g'))).toHaveLength(1);
  });

  it('reads HEAD for the real file the stamp is written to', async () => {
    vol.fromJSON({ [MAP_PATH]: map(null, null) });
    await execute({ modules: ['lib'], cwd: '/test', now: NOW });
    expect(readHeadModuleStamps).toHaveBeenCalledWith('/test', MAP_PATH);
  });
});
