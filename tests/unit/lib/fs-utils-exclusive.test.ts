import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFileExclusive } from '../../../src/lib/fs-utils.js';

// An ESM namespace cannot be spied on, so the link failure is switched on through the mock.
const link = vi.hoisted(() => ({ unsupported: false }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const linkSync: typeof actual.linkSync = (from, to) => {
    if (link.unsupported) throw Object.assign(new Error('EPERM: operation not permitted, link'), { code: 'EPERM' });
    actual.linkSync(from, to);
  };
  return { ...actual, linkSync, default: { ...actual, linkSync } };
});

let dir: string;
beforeEach(() => { link.unsupported = false; dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prospec-excl-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('createFileExclusive (REQ-LIB-113)', () => {
  it('creates the file whole and leaves no temporary file behind', () => {
    const target = path.join(dir, 'owner');
    createFileExclusive(target, '{"pid":1}');
    expect(fs.readFileSync(target, 'utf8')).toBe('{"pid":1}');
    expect(fs.readdirSync(dir)).toEqual(['owner']);
  });

  it('refuses an existing name with EEXIST and keeps its content', () => {
    const target = path.join(dir, 'owner');
    createFileExclusive(target, 'first');
    expect(() => createFileExclusive(target, 'second')).toThrow(/EEXIST/);
    expect(fs.readFileSync(target, 'utf8')).toBe('first');
    expect(fs.readdirSync(dir)).toEqual(['owner']);
  });

  it('falls back to an exclusive create where hard links are unsupported', () => {
    const target = path.join(dir, 'owner');
    link.unsupported = true;
    createFileExclusive(target, 'body');
    expect(fs.readFileSync(target, 'utf8')).toBe('body');
    expect(() => createFileExclusive(target, 'again')).toThrow(/EEXIST/);
    expect(fs.readdirSync(dir)).toEqual(['owner']);
  });
});
