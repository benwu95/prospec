import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { NATIVE_FILES_SCRIPT, parseNativeFiles } from '../../../scripts/workflow-eval/native-files.js';
import { boundedProcess } from '../../../scripts/workflow-eval/process.js';
vi.setConfig({ testTimeout: 90_000 });

it('runs the same bounded collector outside the repository without dependencies', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'native-files-script-'));
  try {
    await mkdir(join(cwd, '.git'));
    await writeFile(join(cwd, '.git/config'), 'not collected');
    await writeFile(join(cwd, 'binary'), Buffer.from([0, 255, 128]));
    await writeFile(join(cwd, 'oversized'), 'x'.repeat(100));
    await symlink(join(cwd, '.git/config'), join(cwd, 'link'));
    const result = await boundedProcess({ command: process.execPath, args: ['-e', NATIVE_FILES_SCRIPT, '10'], cwd,
      input: '', timeoutMs: 10000, maxBytes: 10000 });
    expect(parseNativeFiles(result.output)).toEqual({ encoding: 'base64', files: { binary: 'AP+A' }, unavailable: ['link', 'oversized'] });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
it('rejects malformed collection output instead of treating it as evidence', () => {
  for (const files of [{ '../escape': 'YQ==' }, { valid: 'not base64!' }]) {
    expect(() => parseNativeFiles(JSON.stringify({ encoding: 'base64', files, unavailable: [] }))).toThrow();
  }
  expect(() => parseNativeFiles('{}')).toThrow();
});
