import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { atomicWrite, ensureDir, fileExists, readFileIfExists } from '../../../src/lib/fs-utils.js';
import { WriteError } from '../../../src/types/errors.js';

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

describe('atomicWrite', () => {
  it('should write content to a file', async () => {
    vol.fromJSON({ '/tmp': null }, '/');
    await atomicWrite('/tmp/test.txt', 'hello world');
    const content = fs.readFileSync('/tmp/test.txt', 'utf-8');
    expect(content).toBe('hello world');
  });

  it('should create parent directories if they do not exist', async () => {
    vol.fromJSON({}, '/');
    await atomicWrite('/tmp/nested/deep/file.txt', 'content');
    const content = fs.readFileSync('/tmp/nested/deep/file.txt', 'utf-8');
    expect(content).toBe('content');
  });

  it('should overwrite existing files', async () => {
    vol.fromJSON({ '/tmp/file.txt': 'old content' }, '/');
    await atomicWrite('/tmp/file.txt', 'new content');
    const content = fs.readFileSync('/tmp/file.txt', 'utf-8');
    expect(content).toBe('new content');
  });

  it('should throw WriteError on failure', async () => {
    // Mock a read-only scenario by using an invalid path
    vol.fromJSON({}, '/');
    // memfs doesn't truly enforce permissions, so we mock rename to fail
    const renameSpy = vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(
      new Error('EACCES: permission denied'),
    );
    await expect(atomicWrite('/readonly/file.txt', 'content')).rejects.toThrow(WriteError);
    renameSpy.mockRestore();
  });

  it('embeds the Error message as the WriteError cause when writeFile throws an Error', async () => {
    vol.fromJSON({ '/tmp': null }, '/');
    vi.spyOn(fs.promises, 'writeFile').mockRejectedValueOnce(
      new Error('disk full'),
    );
    await expect(
      atomicWrite('/tmp/file.txt', 'content'),
    ).rejects.toThrowError(/Write failed: \/tmp\/file\.txt \(disk full\)/);
  });

  it('stringifies a non-Error rejection value into the WriteError cause (L29 else branch)', async () => {
    vol.fromJSON({ '/tmp': null }, '/');
    // Reject with a plain string (not an Error) to force the `String(err)` branch.
    vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce('raw failure');
    let caught: unknown;
    try {
      await atomicWrite('/tmp/file.txt', 'content');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(WriteError);
    expect((caught as WriteError).code).toBe('WRITE_ERROR');
    // String('raw failure') === 'raw failure' is embedded as the cause.
    expect((caught as WriteError).message).toBe(
      'Write failed: /tmp/file.txt (raw failure)',
    );
  });

  it('removes the temp file after a write failure', async () => {
    vol.fromJSON({ '/tmp': null }, '/');
    const unlinkSpy = vi.spyOn(fs.promises, 'unlink');
    vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(
      new Error('rename blew up'),
    );
    await expect(atomicWrite('/tmp/file.txt', 'content')).rejects.toThrow(
      WriteError,
    );
    // Cleanup path runs unlink on the temp file (filePath.tmp.<pid>).
    expect(unlinkSpy).toHaveBeenCalledWith(`/tmp/file.txt.tmp.${process.pid}`);
    expect(fs.existsSync('/tmp/file.txt')).toBe(false);
  });

  it('still throws the original WriteError even when temp-file cleanup also fails', async () => {
    vol.fromJSON({ '/tmp': null }, '/');
    vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(
      new Error('primary failure'),
    );
    // The cleanup unlink throwing must be swallowed; the original cause survives.
    vi.spyOn(fs.promises, 'unlink').mockRejectedValueOnce(
      new Error('cleanup failure'),
    );
    let caught: unknown;
    try {
      await atomicWrite('/tmp/file.txt', 'content');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(WriteError);
    expect((caught as WriteError).message).toBe(
      'Write failed: /tmp/file.txt (primary failure)',
    );
  });
});

describe('ensureDir', () => {
  it('should create a directory recursively', async () => {
    vol.fromJSON({}, '/');
    await ensureDir('/tmp/a/b/c');
    const stat = fs.statSync('/tmp/a/b/c');
    expect(stat.isDirectory()).toBe(true);
  });

  it('should not throw if directory already exists', async () => {
    vol.fromJSON({}, '/');
    fs.mkdirSync('/tmp/existing', { recursive: true });
    await expect(ensureDir('/tmp/existing')).resolves.toBeUndefined();
  });

  it('throws WriteError with the Error message as cause when mkdir throws an Error (L41 + L43 then-branch)', async () => {
    vol.fromJSON({}, '/');
    vi.spyOn(fs.promises, 'mkdir').mockRejectedValueOnce(
      new Error('ENOSPC: no space left'),
    );
    let caught: unknown;
    try {
      await ensureDir('/tmp/cannot-make');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(WriteError);
    expect((caught as WriteError).code).toBe('WRITE_ERROR');
    expect((caught as WriteError).message).toBe(
      'Write failed: /tmp/cannot-make (ENOSPC: no space left)',
    );
  });

  it('stringifies a non-Error mkdir rejection into the WriteError cause (L43 else-branch)', async () => {
    vol.fromJSON({}, '/');
    // Reject with a non-Error value to force the `String(err)` branch.
    vi.spyOn(fs.promises, 'mkdir').mockRejectedValueOnce(42);
    let caught: unknown;
    try {
      await ensureDir('/tmp/cannot-make');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(WriteError);
    // String(42) === '42' is embedded as the cause.
    expect((caught as WriteError).message).toBe(
      'Write failed: /tmp/cannot-make (42)',
    );
  });
});

describe('fileExists', () => {
  it('should return true for existing files', () => {
    vol.fromJSON({ '/tmp/exists.txt': 'data' }, '/');
    expect(fileExists('/tmp/exists.txt')).toBe(true);
  });

  it('should return false for non-existing files', () => {
    vol.fromJSON({}, '/');
    expect(fileExists('/tmp/nope.txt')).toBe(false);
  });

  it('should return true for directories', () => {
    vol.fromJSON({}, '/');
    fs.mkdirSync('/tmp/dir', { recursive: true });
    expect(fileExists('/tmp/dir')).toBe(true);
  });
});

describe('readFileIfExists', () => {
  it('returns the file contents when the file exists', async () => {
    vol.fromJSON({ '/tmp/doc.md': '# hi\n' }, '/');
    expect(await readFileIfExists('/tmp/doc.md')).toBe('# hi\n');
  });

  it('returns an empty string when the file does not exist (ENOENT)', async () => {
    vol.fromJSON({}, '/');
    expect(await readFileIfExists('/tmp/missing.md')).toBe('');
  });

  it('propagates non-ENOENT read errors instead of masking them as absent', async () => {
    vol.fromJSON({ '/tmp/doc.md': 'x' }, '/');
    vi.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(
      Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }),
    );
    await expect(readFileIfExists('/tmp/doc.md')).rejects.toThrow('EACCES');
  });
});
