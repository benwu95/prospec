import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { execute } from '../../../src/services/knowledge-verify.service.js';
import { PrerequisiteError } from '../../../src/types/errors.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
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
});
