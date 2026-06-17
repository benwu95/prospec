import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fg from 'fast-glob';
import { scanDir, scanDirSync } from '../../../src/lib/scanner.js';
import { ScanError } from '../../../src/types/errors.js';

// scanner uses fast-glob directly, so we test with real filesystem using temp dirs
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prospec-scanner-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Helper to create files in tmpDir
function createFiles(files: Record<string, string>) {
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
}


describe('scanDir', () => {
  it('should scan all files in a directory', async () => {
    createFiles({
      'src/index.ts': '',
      'src/app.ts': '',
      'README.md': '',
    });
    const result = await scanDir('**', { cwd: tmpDir });
    expect(result.count).toBe(3);
    expect(result.files).toContain('src/index.ts');
    expect(result.files).toContain('README.md');
  });

  it('should exclude node_modules by default', async () => {
    createFiles({
      'src/index.ts': '',
      'node_modules/pkg/index.js': '',
    });
    const result = await scanDir('**', { cwd: tmpDir });
    expect(result.files).not.toContain('node_modules/pkg/index.js');
  });

  it('should exclude sensitive files by default', async () => {
    // Use NON-dotfile names so the exclusion is attributable to SENSITIVE_PATTERNS,
    // not to `dot: false` (which alone would drop any .env* dotfile). Each name
    // targets a distinct SENSITIVE_PATTERN entry.
    createFiles({
      'src/index.ts': '',
      'config.env.json': 'X=1', // **/*.env*
      'my-credential.txt': 'tok', // **/*credential*
      'secret-config.yaml': 'k: v', // **/*secret*
      'server.key': 'PRIV', // **/*.key
      'cert.pem': 'CERT', // **/*.pem
    });
    const result = await scanDir('**', { cwd: tmpDir });
    expect(result.files).not.toContain('config.env.json');
    expect(result.files).not.toContain('my-credential.txt');
    expect(result.files).not.toContain('secret-config.yaml');
    expect(result.files).not.toContain('server.key');
    expect(result.files).not.toContain('cert.pem');
    // Control: a non-sensitive sibling survives, proving the filter is selective.
    expect(result.files).toEqual(['src/index.ts']);
  });

  it('should respect depth option', async () => {
    createFiles({
      'a/b/c/deep.ts': '',
      'a/shallow.ts': '',
    });
    const result = await scanDir('**', { cwd: tmpDir, depth: 2 });
    expect(result.files).toContain('a/shallow.ts');
    expect(result.files).not.toContain('a/b/c/deep.ts');
  });

  it('should support custom exclude patterns', async () => {
    createFiles({
      'src/index.ts': '',
      'src/generated/auto.ts': '',
    });
    const result = await scanDir('**', {
      cwd: tmpDir,
      exclude: ['**/generated/**'],
    });
    expect(result.files).not.toContain('src/generated/auto.ts');
    expect(result.files).toContain('src/index.ts');
  });

  it('should return sorted files', async () => {
    createFiles({
      'c.ts': '',
      'a.ts': '',
      'b.ts': '',
    });
    const result = await scanDir('**', { cwd: tmpDir });
    expect(result.files).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  it('should include directory entries when onlyFiles is false', async () => {
    createFiles({
      'src/index.ts': '',
    });
    const filesOnly = await scanDir('**', { cwd: tmpDir });
    const withDirs = await scanDir('**', { cwd: tmpDir, onlyFiles: false });
    // Default (onlyFiles: true) yields only the file.
    expect(filesOnly.files).toEqual(['src/index.ts']);
    // onlyFiles: false additionally surfaces the containing directory.
    expect(withDirs.files).toContain('src');
    expect(withDirs.files).toContain('src/index.ts');
    expect(withDirs.count).toBeGreaterThan(filesOnly.count);
  });

  it('should return empty results for non-existent directory', async () => {
    // fast-glob returns empty array for non-existent cwd rather than throwing
    const result = await scanDir('**', { cwd: '/nonexistent/path/xyz' });
    expect(result.files).toEqual([]);
    expect(result.count).toBe(0);
  });
});

describe('scanDirSync', () => {
  it('should scan files synchronously', () => {
    createFiles({
      'src/index.ts': '',
      'package.json': '{}',
    });
    const result = scanDirSync('**', { cwd: tmpDir });
    expect(result.count).toBe(2);
    expect(result.files).toContain('src/index.ts');
  });

  it('should exclude default patterns', () => {
    createFiles({
      'src/app.ts': '',
      'node_modules/dep/index.js': '',
      '.git/config': '',
    });
    const result = scanDirSync('**', { cwd: tmpDir });
    expect(result.files).toEqual(['src/app.ts']);
  });
});

describe('scanDir error handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should wrap an underlying Error into a ScanError carrying its message (L105 then-branch)', async () => {
    vi.spyOn(fg, 'glob').mockRejectedValue(new Error('glob blew up'));

    const promise = scanDir('**', { cwd: '/some/dir' });
    await expect(promise).rejects.toBeInstanceOf(ScanError);
    await expect(promise).rejects.toMatchObject({ code: 'SCAN_ERROR' });
    // err instanceof Error -> err.message is embedded in the ScanError message
    await expect(promise).rejects.toThrow('Scan failed: /some/dir (glob blew up)');
  });

  it('should stringify a non-Error throw value into the ScanError message (L105 else-branch)', async () => {
    // reject with a plain string (not an Error) to exercise String(err)
    vi.spyOn(fg, 'glob').mockRejectedValue('raw string failure');

    const promise = scanDir('**', { cwd: '/other/dir' });
    await expect(promise).rejects.toBeInstanceOf(ScanError);
    await expect(promise).rejects.toThrow('Scan failed: /other/dir (raw string failure)');
  });
});

describe('scanDirSync error handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should wrap an underlying Error into a ScanError carrying its message (L147 then-branch)', () => {
    vi.spyOn(fg, 'globSync').mockImplementation(() => {
      throw new Error('sync glob blew up');
    });

    expect(() => scanDirSync('**', { cwd: '/sync/dir' })).toThrow(ScanError);
    try {
      scanDirSync('**', { cwd: '/sync/dir' });
      expect.unreachable('scanDirSync should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ScanError);
      expect((err as ScanError).code).toBe('SCAN_ERROR');
      expect((err as ScanError).message).toBe('Scan failed: /sync/dir (sync glob blew up)');
    }
  });

  it('should stringify a non-Error throw value into the ScanError message (L147 else-branch)', () => {
    vi.spyOn(fg, 'globSync').mockImplementation(() => {
      throw 42;
    });

    try {
      scanDirSync('**', { cwd: '/sync/dir2' });
      expect.unreachable('scanDirSync should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ScanError);
      // String(42) -> "42"
      expect((err as ScanError).message).toBe('Scan failed: /sync/dir2 (42)');
    }
  });
});
