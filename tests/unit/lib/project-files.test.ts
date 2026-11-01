import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProjectFileSelector, type ProjectFileMembersResult, type ProjectFileSource } from '../../../src/lib/project-files.js';

vi.mock('node:fs', async (importOriginal) => ({ ...await importOriginal<typeof fs>() }));

let cwd: string;
beforeEach(() => { cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'prospec-selection-')); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(cwd, { recursive: true, force: true }); });

function file(name: string): void {
  fs.mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true });
  fs.writeFileSync(path.join(cwd, name), '');
}

function source(files: string[], listings: Record<string, ProjectFileMembersResult> = {}): ProjectFileSource {
  return {
    members: vi.fn((): ProjectFileMembersResult => ({ available: true, files })),
    listPathspecs: vi.fn((specs: readonly string[]): ProjectFileMembersResult => listings[specs.join('|')] ?? { available: true, files: [] }),
  };
}

describe('createProjectFileSelector', () => {
  it('selects literal files and subtrees, unions glob results with literals, and sorts unique bytes', () => {
    const files = ['src/z.ts', 'src/a.ts', 'other.ts', 'src-other.ts', 'src/a.ts'];
    for (const name of files) file(name);
    const input = source(files, { ':(glob)**/z.ts': { available: true, files: ['src/z.ts', 'unlisted.ts'] } });
    const selector = createProjectFileSelector(cwd, input, []);
    expect(selector.select({ modulePaths: ['src/a.ts', '**/z.ts'] })).toEqual({ available: true, files: ['src/a.ts', 'src/z.ts'], coverage: 'members' });
    expect(selector.select({ modulePaths: ['src'] })).toEqual({ available: true, files: ['src/a.ts', 'src/z.ts'], coverage: 'members' });
    expect(input.listPathspecs).toHaveBeenCalledWith([':(glob)**/z.ts']);
  });

  it('refuses unsupported paths without reading either source callback', () => {
    const input = source([]);
    const selector = createProjectFileSelector(cwd, input, []);
    expect(selector.select({ modulePaths: [':magic', '../outside', 'src/{a,b}/*'] })).toEqual({ available: true, files: [], coverage: 'refused' });
    expect(input.members).not.toHaveBeenCalled();
    expect(input.listPathspecs).not.toHaveBeenCalled();
  });

  it('distinguishes absent index coverage from members removed by exclusions or filesystem absence', () => {
    const selector = createProjectFileSelector(cwd, source(['src/a.ts']), ['src']);
    expect(selector.select({ modulePaths: ['src'] })).toEqual({ available: true, files: [], coverage: 'members' });
    expect(selector.select({ modulePaths: ['empty'] })).toEqual({ available: true, files: [], coverage: 'no-members' });
    expect(createProjectFileSelector(cwd, source(['missing.ts']), []).select({})).toEqual({ available: true, files: [], coverage: 'no-regular-files' });
    file('present.ts');
    expect(createProjectFileSelector(cwd, source(['missing.ts', 'present.ts']), []).select({})).toEqual({ available: true, files: ['present.ts'], coverage: 'members' });
  });

  it('reads the members once and shares them, unavailable included, across selections', () => {
    file('src/a.ts'); file('other/b.ts');
    const input = source(['src/a.ts', 'other/b.ts', 'src/a.ts']);
    const selector = createProjectFileSelector(cwd, input, []);
    expect(selector.select({ modulePaths: ['src'] })).toMatchObject({ files: ['src/a.ts'] });
    expect(selector.select({ modulePaths: ['other'] })).toMatchObject({ files: ['other/b.ts'] });
    expect(input.members).toHaveBeenCalledTimes(1);
    const failing = source([]);
    vi.mocked(failing.members).mockReturnValue({ available: false, reason: 'index unreadable' });
    const failed = createProjectFileSelector(cwd, failing, []);
    expect(failed.select({})).toEqual({ available: false, reason: 'index unreadable' });
    expect(failed.select({ modulePaths: ['src'] })).toEqual({ available: false, reason: 'index unreadable' });
    expect(failing.members).toHaveBeenCalledTimes(1);
  });

  it('makes exclusion glob listing lazy and shares even an empty result across selections', () => {
    file('src/a.ts'); file('other/b.ts');
    const input = source(['src/a.ts', 'other/b.ts']);
    const selector = createProjectFileSelector(cwd, input, []);
    expect(selector.select({ modulePaths: ['absent'] }).available).toBe(true);
    expect(selector.select({ keep: /\.json$/ }).available).toBe(true);
    expect(input.listPathspecs).not.toHaveBeenCalled();
    expect(selector.select({ modulePaths: ['src'] })).toMatchObject({ files: ['src/a.ts'] });
    expect(selector.select({ modulePaths: ['other'] })).toMatchObject({ files: ['other/b.ts'] });
    expect(input.listPathspecs).toHaveBeenCalledTimes(1);
  });

  it('shares exclusion failure without treating it as an empty set', () => {
    file('a.ts'); file('b.ts');
    const input = source(['a.ts', 'b.ts']);
    vi.mocked(input.listPathspecs).mockReturnValue({ available: false, reason: 'exclusion unreadable' });
    const selector = createProjectFileSelector(cwd, input, []);
    expect(selector.select({ modulePaths: ['a.ts'] })).toEqual({ available: false, reason: 'exclusion unreadable' });
    expect(selector.select({ modulePaths: ['b.ts'] })).toEqual({ available: false, reason: 'exclusion unreadable' });
    expect(input.listPathspecs).toHaveBeenCalledTimes(1);
  });

  it('subtracts positive exclusion results and literal subtrees, while refused exclusions do nothing', () => {
    for (const name of ['src/a.ts', 'src/b.ts', 'src/cache/c.ts']) file(name);
    const input = source(['src/a.ts', 'src/b.ts', 'src/cache/c.ts']);
    vi.mocked(input.listPathspecs).mockReturnValue({ available: true, files: ['src/b.ts'] });
    expect(createProjectFileSelector(cwd, input, ['src/cache/', ':bad', '../bad']).select({})).toEqual({ available: true, files: ['src/a.ts'], coverage: 'members' });
    expect(createProjectFileSelector(cwd, input, ['.']).select({})).toEqual({ available: true, files: [], coverage: 'members' });
  });

  it('propagates unavailable membership and module glob listings', () => {
    const input = source(['src/a.ts']);
    vi.mocked(input.members).mockReturnValue({ available: false, reason: 'index unreadable' });
    expect(createProjectFileSelector(cwd, input, []).select({})).toEqual({ available: false, reason: 'index unreadable' });
    vi.mocked(input.members).mockReturnValue({ available: true, files: ['src/a.ts'] });
    vi.mocked(input.listPathspecs).mockReturnValue({ available: false, reason: 'glob unreadable' });
    expect(createProjectFileSelector(cwd, input, []).select({ modulePaths: ['src/**'] })).toEqual({ available: false, reason: 'glob unreadable' });
  });

  it('applies keep without stateful RegExp results leaking between files or selections', () => {
    for (const name of ['a.ts', 'b.ts', 'c.json']) file(name);
    const selector = createProjectFileSelector(cwd, source(['a.ts', 'b.ts', 'c.json']), []);
    const keep = /\.ts$/g;
    expect(selector.select({ keep })).toMatchObject({ files: ['a.ts', 'b.ts'] });
    expect(selector.select({ keep })).toMatchObject({ files: ['a.ts', 'b.ts'] });
  });

  it.skipIf(process.platform === 'win32')('skips symlink leaves, symlink ancestors, directories, and absent files', () => {
    file('real/a.ts'); file('ordinary');
    fs.symlinkSync('real/a.ts', path.join(cwd, 'link.ts'));
    fs.symlinkSync('real', path.join(cwd, 'alias'));
    expect(createProjectFileSelector(cwd, source(['link.ts', 'alias/a.ts', 'real', 'absent.ts', 'ordinary/child.ts', 'real/a.ts']), []).select({})).toEqual({ available: true, files: ['real/a.ts'], coverage: 'members' });
  });

  it('reports inspection failures with the failing path rather than partial success', () => {
    file('a.ts'); file('b.ts');
    const original = fs.lstatSync;
    vi.spyOn(fs, 'lstatSync').mockImplementation(((p: fs.PathLike, ...args: unknown[]) => {
      if (String(p) === path.join(cwd, 'b.ts')) throw Object.assign(new Error('denied'), { code: 'EACCES' });
      return Reflect.apply(original, fs, [p, ...args]);
    }) as typeof fs.lstatSync);
    expect(createProjectFileSelector(cwd, source(['a.ts', 'b.ts']), []).select({})).toEqual({ available: false, reason: expect.stringContaining('b.ts') });
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('reports real EACCES beneath an inaccessible ancestor', () => {
    file('blocked/nested/a.ts');
    fs.chmodSync(path.join(cwd, 'blocked'), 0);
    try {
      expect(createProjectFileSelector(cwd, source(['blocked/nested/a.ts']), []).select({})).toEqual({ available: false, reason: expect.stringContaining('blocked/nested/a.ts') });
    } finally {
      fs.chmodSync(path.join(cwd, 'blocked'), 0o755);
    }
  });
});
