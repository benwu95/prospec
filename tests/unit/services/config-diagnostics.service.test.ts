import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import { vol } from 'memfs';
import { execute } from '../../../src/services/config-diagnostics.service.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

beforeEach(() => {
  vol.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('config diagnostics service', () => {
  it('reads raw keys from the target config without modifying its bytes or writing output', async () => {
    const raw = '# user comment\nproject:\n  name: sample\n  naem: private-value\ncustom_extension:\n  nested: private-value\n';
    vol.fromJSON({ '/project/.prospec.yaml': raw });
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(await execute({ cwd: '/project' })).toEqual([
      { path: ['project', 'naem'], suggestion: 'name' },
      { path: ['custom_extension'] },
    ]);
    expect(fs.readFileSync('/project/.prospec.yaml', 'utf8')).toBe(raw);
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('uses the current directory when cwd is omitted', async () => {
    vol.fromJSON({ [path.join(process.cwd(), '.prospec.yaml')]: 'artfact_language: English\n' });
    expect(await execute({})).toEqual([
      { path: ['artfact_language'], suggestion: 'artifact_language' },
    ]);
  });

  it('collects diagnostics without enforcing schema, path topology or upgrade migration rules', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project: {}\npaths:\n  base_dir: prospec\nknowledge:\n  base_path: elsewhere\n  strategyy: auto\n',
      '/outside/retained': 'unchanged',
    });
    fs.symlinkSync('/outside', '/project/prospec');
    expect(await execute({ cwd: '/project' })).toEqual([
      { path: ['knowledge', 'strategyy'], suggestion: 'strategy' },
    ]);
    expect(fs.lstatSync('/project/prospec').isSymbolicLink()).toBe(true);
    expect(fs.readFileSync('/outside/retained', 'utf8')).toBe('unchanged');
  });

  it.each(['', '[]', 'null', 'project:\n  name: sample\n'])('returns no diagnostics for %j', async (raw) => {
    vol.fromJSON({ '/project/.prospec.yaml': raw });
    expect(await execute({ cwd: '/project' })).toEqual([]);
  });

  it('omits diagnostics for an absent config without creating one', async () => {
    vol.mkdirSync('/project');
    expect(await execute({ cwd: '/project' })).toEqual([]);
    expect(fs.existsSync('/project/.prospec.yaml')).toBe(false);
  });

  it.each(['project: [', 'project: one\nproject: two\n'])('omits malformed YAML diagnostics for %j', async (raw) => {
    vol.fromJSON({ '/project/.prospec.yaml': raw });
    expect(await execute({ cwd: '/project' })).toEqual([]);
    expect(fs.readFileSync('/project/.prospec.yaml', 'utf8')).toBe(raw);
  });

  it('omits diagnostics when the original read fails', async () => {
    vi.spyOn(fs.promises, 'readFile').mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }));
    expect(await execute({ cwd: '/project' })).toEqual([]);
  });
});
