import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abandonDirFor } from '../../../src/lib/abandon-paths.js';
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof fs>();
  return { ...actual, lstatSync: vi.fn(actual.lstatSync) };
});
let root: string;
let base: string;
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'abandon-paths-')));
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-09T23:59:59Z'));
  base = path.join(root, '.prospec/abandoned/2026-10-09-x');
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); fs.rmSync(root, { recursive: true, force: true }); });
it('allocates the first absent suffix and reuses gaps', () => {
  expect(abandonDirFor(root, 'x')).toBe(base);
  fs.mkdirSync(base, { recursive: true });
  expect(abandonDirFor(root, 'x')).toBe(`${base}-2`);
  fs.mkdirSync(`${base}-2`); fs.mkdirSync(`${base}-4`);
  expect(abandonDirFor(root, 'x')).toBe(`${base}-3`);
  fs.rmdirSync(`${base}-2`);
  expect(abandonDirFor(root, 'x')).toBe(`${base}-2`);
});
it('captures the date once even when candidate probing crosses UTC midnight', async () => {
  fs.mkdirSync(base, { recursive: true });
  const actual = await vi.importActual<typeof fs>('node:fs');
  vi.mocked(fs.lstatSync).mockImplementation((...args: Parameters<typeof fs.lstatSync>) => {
    if (String(args[0]) === base) vi.setSystemTime(new Date('2026-10-10T00:00:00Z'));
    return actual.lstatSync(...args);
  });
  expect(abandonDirFor(root, 'x')).toBe(`${base}-2`);
});
it.each(['file', 'link', 'dangling'])('refuses an unsafe %s candidate instead of skipping it', (kind) => {
  fs.mkdirSync(base, { recursive: true });
  if (kind === 'file') fs.writeFileSync(`${base}-2`, 'retained');
  else fs.symlinkSync(kind === 'link' ? base : path.join(root, 'missing'), `${base}-2`);
  expect(() => abandonDirFor(root, 'x')).toThrow(/unsafe/i);
  expect(fs.existsSync(`${base}-3`)).toBe(false);
});
it.each(['EACCES', 'EIO'])('propagates %s instead of treating it as absence', async (code) => {
  const actual = await vi.importActual<typeof fs>('node:fs');
  vi.mocked(fs.lstatSync).mockImplementation((...args: Parameters<typeof fs.lstatSync>) => {
    if (String(args[0]) === base) throw Object.assign(new Error(code), { code });
    return actual.lstatSync(...args);
  });
  expect(() => abandonDirFor(root, 'x')).toThrow(code);
});
