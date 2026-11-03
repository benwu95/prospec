import * as fs from 'node:fs';
import { vol } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readChangeMetadata, writeChangeMetadataDoc } from '../../../src/lib/change-metadata.js';

vi.mock('node:fs', async () => {
  const { fs } = await import('memfs');
  return { ...fs, default: fs };
});

const target = '/repo/change/metadata.yaml';
const claim = '/repo/change/.metadata.yaml.write-claim';
const original = 'name: change\ncreated_at: 2026-11-03T00:00:00.000Z\nstatus: story\n';
beforeEach(() => vol.fromJSON({ [target]: original }));
afterEach(() => { vol.reset(); vi.restoreAllMocks(); });

describe('metadata publication', () => {
  it('refuses a busy claim without replacing metadata or removing another writer claim', async () => {
    fs.mkdirSync(claim);
    const { doc } = readChangeMetadata(target, 'change');
    doc.set('status', 'plan');
    await expect(writeChangeMetadataDoc(target, doc, 'change')).rejects.toMatchObject({ code: 'METADATA_WRITE_FAILED', details: { metadata_published: false, claimPath: claim } });
    expect(fs.readFileSync(target, 'utf8')).toBe(original);
    expect(fs.statSync(claim).isDirectory()).toBe(true);
  });

  it('checks inputs inside the claim before staging and again before rename', async () => {
    const { doc } = readChangeMetadata(target, 'change');
    const guard = vi.fn(() => {
      expect(fs.statSync(claim).isDirectory()).toBe(true);
      if (guard.mock.calls.length === 2) throw new Error('inputs changed during staging');
    });
    doc.set('status', 'plan');
    await expect(writeChangeMetadataDoc(target, doc, 'change', { beforeCommit: guard })).rejects.toMatchObject({ details: { metadata_published: false } });
    expect(guard).toHaveBeenCalledTimes(2);
    expect(fs.readFileSync(target, 'utf8')).toBe(original);
    expect(fs.readdirSync('/repo/change')).toEqual(['metadata.yaml']);
  });

  it('reports committed bytes when claim cleanup fails and retains the claim', async () => {
    const { doc } = readChangeMetadata(target, 'change');
    doc.set('status', 'plan');
    vi.spyOn(fs.promises, 'rmdir').mockRejectedValueOnce(new Error('claim cleanup failed'));
    await expect(writeChangeMetadataDoc(target, doc, 'change')).rejects.toMatchObject({ details: { metadata_published: true, metadataPath: target, claimPath: claim } });
    expect(fs.readFileSync(target, 'utf8')).toContain('status: plan');
    expect(fs.statSync(claim).isDirectory()).toBe(true);
  });

  it('supports repeated writes of one Document and copying it to a new target', async () => {
    const { doc } = readChangeMetadata(target, 'change');
    doc.set('status', 'plan');
    await writeChangeMetadataDoc(target, doc, 'change');
    doc.set('status', 'tasks');
    await writeChangeMetadataDoc(target, doc, 'change');
    await writeChangeMetadataDoc('/repo/staging/metadata.yaml', doc, 'change');
    expect(fs.readFileSync(target, 'utf8')).toContain('status: tasks');
    expect(fs.readFileSync('/repo/staging/metadata.yaml', 'utf8')).toBe(fs.readFileSync(target, 'utf8'));
  });

  it('preserves metadata and releases its claim after a rename failure', async () => {
    const { doc } = readChangeMetadata(target, 'change');
    doc.set('status', 'plan');
    vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(new Error('rename failed'));
    await expect(writeChangeMetadataDoc(target, doc, 'change')).rejects.toMatchObject({ details: { metadata_published: false } });
    expect(fs.readFileSync(target, 'utf8')).toBe(original);
    expect(fs.readdirSync('/repo/change')).toEqual(['metadata.yaml']);
  });
});
