import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execute } from '../../../src/services/knowledge-update.service.js';
import { PrerequisiteError } from '../../../src/types/errors.js';

// Real fs on purpose: memfs does not model a directory's search permission, so a
// target hidden behind one would read as present there (REQ-SERVICES-023).

const MAP_LIB = 'modules:\n  - name: lib\n    paths: [src/lib]\n    keywords: [lib]\n';
const DELTA = '## ADDED\n\n### REQ-AAA-001: add aaa\n\n## MODIFIED\n\n### REQ-LIB-001: tweak\n';

let tmpDir: string;
const kp = (): string => path.join(tmpDir, 'prospec', 'ai-knowledge');
const libDir = (): string => path.join(kp(), 'modules', 'lib');

function write(relPath: string, content: string): void {
  const abs = path.join(tmpDir, relPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

/** Every entry under the project with its bytes; an entry it cannot look up is marked, not read. */
function snapshot(dir = tmpDir, out: Record<string, string> = {}): Record<string, string> {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    out[path.relative(tmpDir, dir)] = '<unreadable>';
    return out;
  }
  for (const name of names) {
    const abs = path.join(dir, name);
    const rel = path.relative(tmpDir, abs);
    try {
      if (lstatSync(abs).isDirectory()) snapshot(abs, out);
      else out[rel] = readFileSync(abs, 'utf-8');
    } catch {
      out[rel] = '<unreadable>';
    }
  }
  return out;
}

const refusal = async (options: Parameters<typeof execute>[0]): Promise<PrerequisiteError> => {
  const error = await execute(options).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(PrerequisiteError);
  return error as PrerequisiteError;
};

// options are built per test: tmpDir does not exist while it.each collects
const MODES: Array<[string, () => Parameters<typeof execute>[0]]> = [
  ['manual mode', () => ({ cwd: tmpDir, manualModules: ['aaa', 'lib'] })],
  ['delta-spec mode', () => ({ cwd: tmpDir, deltaSpecPath: path.join(tmpDir, 'delta-spec.md') })],
];

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'knowledge-update-realfs-'));
  write('.prospec.yaml', 'project:\n  name: test-project\n');
  write('delta-spec.md', DELTA);
  write('prospec/index.md', '# AI Knowledge Index\n');
  write('prospec/ai-knowledge/module-map.yaml', MAP_LIB);
});

afterEach(() => {
  try {
    chmodSync(libDir(), 0o755);
  } catch {
    // absent, or a regular file in the ENOTDIR cases
  }
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('knowledge update refuses a write target it cannot look up', () => {
  // chmod has no effect on Windows, and root searches through mode 0600
  describe.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('modules/<name> without search permission', () => {
    it.each(MODES)('%s refuses before any write, naming the directory', async (_mode, options) => {
      write('prospec/ai-knowledge/modules/lib/README.md', '# lib\n');
      chmodSync(libDir(), 0o600);
      const before = snapshot();

      const error = await refusal(options());

      expect(error.message).toContain(`${libDir()} cannot be looked up`);
      expect(error.message).toContain('(EACCES)');
      expect(error.suggestion).toContain(`fix ${libDir()} so modules/lib/README.md resolves`);
      expect(snapshot()).toEqual(before);
    });
  });

  describe('modules/<name> is a regular file', () => {
    it.each(MODES)('%s refuses before any write, naming the file', async (_mode, options) => {
      write('prospec/ai-knowledge/modules/lib', 'not a directory\n');
      const before = snapshot();

      const error = await refusal(options());

      expect(error.message).toContain(`${libDir()} cannot be looked up`);
      expect(error.message).toContain('(ENOTDIR)');
      expect(error.suggestion).toContain(`fix ${libDir()} so modules/lib/README.md resolves`);
      expect(snapshot()).toEqual(before);
    });
  });

  it('manual mode refuses a module name longer than 255 bytes before creating modules/ or any README', async () => {
    const long = 'a'.repeat(256);
    const before = snapshot();

    const error = await refusal({ cwd: tmpDir, manualModules: ['aaa', long] });

    expect(error.message).toContain(`${path.join(kp(), 'modules', long)} cannot be looked up`);
    expect(error.message).toContain('ENAMETOOLONG');
    expect(error.suggestion).toContain(`fix ${path.join(kp(), 'modules', long)} so`);
    expect(snapshot()).toEqual(before);
  });

  it.each(MODES)('%s refuses an index.md linked through a regular file before any write, naming the link', async (_mode, options) => {
    const index = path.join(tmpDir, 'prospec', 'index.md');
    unlinkSync(index);
    write('prospec/blocker', 'not a directory\n');
    symlinkSync(path.join(tmpDir, 'prospec', 'blocker', 'index.md'), index);
    write('prospec/ai-knowledge/modules/lib/README.md', '# lib\n');
    const before = snapshot();

    const error = await refusal(options());

    expect(error.message).toContain(`${index} cannot be looked up`);
    expect(error.message).toContain('(ENOTDIR)');
    expect(error.suggestion).toContain(`fix ${index} so index.md resolves`);
    expect(snapshot()).toEqual(before);
  });

  describe('a target that is a symlink loop', () => {
    it.each(MODES)('%s refuses a looping module README before any write, naming the link', async (_mode, options) => {
      const readme = path.join(libDir(), 'README.md');
      mkdirSync(libDir(), { recursive: true });
      symlinkSync(readme, readme);
      const before = snapshot();

      const error = await refusal(options());

      expect(error.message).toContain(`${readme} cannot be looked up`);
      expect(error.message).toContain('(ELOOP)');
      expect(error.suggestion).toContain(`fix ${readme} so modules/lib/README.md resolves`);
      expect(snapshot()).toEqual(before);
    });

    it.each(MODES)('%s refuses a looping index.md before any write, naming the link', async (_mode, options) => {
      const index = path.join(tmpDir, 'prospec', 'index.md');
      unlinkSync(index);
      symlinkSync(index, index);
      write('prospec/ai-knowledge/modules/lib/README.md', '# lib\n');
      const before = snapshot();

      const error = await refusal(options());

      expect(error.message).toContain(`${index} cannot be looked up`);
      expect(error.message).toContain('(ELOOP)');
      expect(error.suggestion).toContain(`fix ${index} so index.md resolves`);
      expect(snapshot()).toEqual(before);
    });
  });
});
