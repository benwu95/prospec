import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { stringifyYaml } from '../../../src/lib/yaml-utils.js';
import { sha256 } from '../../../src/lib/repo-state.js';
import { readAbandonHistory, matchingAbandoned, excludesAbandonFromYield } from '../../../src/lib/abandon-history.js';
let root: string;
const archive = '2026-10-05-old';
let dir: string;
const put = (name: string, value: string) => { const p = path.join(dir, name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, value); };
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'abandon-history-')));
  dir = path.join(root, '.prospec/abandoned', archive);
  put('metadata.yaml', stringifyYaml({ name: 'old', created_at: '2026-10-05', status: 'abandoned', issue: ' #333  ', abandonment: { reason: 'Premise disproved', at: '2026-10-05', from_status: 'plan', escalation: null, overturned: [], premise_note: 'None declared', manifest: 'preservation/manifest.json' } }));
  put('preservation/manifest.json', JSON.stringify({ version: 1, root, git_prefix: '', head: 'a'.repeat(40), patches: { staged: sha256(''), unstaged: sha256('') }, entries: [] }));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
describe('abandoned history', () => {
  it('reads completed reasons and matches only normalized registrations', () => {
    const history = readAbandonHistory(root);
    expect(history.errors).toEqual([]);
    expect(history.attempts[0]).toMatchObject({ archive, name: 'old', issue: '#333', reason: 'Premise disproved' });
    expect(matchingAbandoned(history, '  #333\n')).toHaveLength(1);
    expect(matchingAbandoned(history, 'https://github.com/owner/repo/issues/333')).toEqual([]);
    expect(matchingAbandoned(history, undefined)).toEqual([]);
    expect(excludesAbandonFromYield(dir, root)).toBe(true);
  });
  it('reports partial source identity rather than completed history', () => {
    put('metadata.yaml', stringifyYaml({ name: 'old', created_at: '2026-10-05', status: 'plan' }));
    put('abandon-operation.json', JSON.stringify({ version: 1, source: 'old', source_digest: sha256('old'), phase: 'moving', moved: [], pending: ['metadata.yaml'] }));
    expect(readAbandonHistory(root)).toMatchObject({ attempts: [], errors: [{ source: 'old' }] });
    expect(excludesAbandonFromYield(dir, root)).toBe(true);
  });
  it('keeps complete metadata authoritative when the operation marker remains', () => {
    put('abandon-operation.json', JSON.stringify({ version: 1, source: 'old', source_digest: sha256('old'), phase: 'publishing', moved: ['metadata.yaml'], pending: [] }));
    expect(readAbandonHistory(root).attempts).toHaveLength(1);
  });
  it('reports a missing manifest and malformed record', () => {
    fs.unlinkSync(path.join(dir, 'preservation/manifest.json'));
    expect(readAbandonHistory(root)).toMatchObject({ attempts: [], errors: [{ name: archive }] });
    put('metadata.yaml', 'status: [broken');
    expect(readAbandonHistory(root).errors).toHaveLength(1);
  });
  it('retains ordinary legacy corpus behavior and absent archive behavior', () => {
    put('metadata.yaml', 'status: archived\n');
    expect(readAbandonHistory(root)).toEqual({ attempts: [], errors: [] });
    expect(excludesAbandonFromYield(dir, root)).toBe(false);
    fs.rmSync(path.join(root, '.prospec/abandoned'), { recursive: true });
    expect(readAbandonHistory(root)).toEqual({ attempts: [], errors: [] });
  });
  it('refuses archive symlinks escaping the project', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'history-outside-'));
    try {
      fs.renameSync(dir, path.join(outside, archive)); fs.symlinkSync(path.join(outside, archive), dir);
      expect(readAbandonHistory(root)).toMatchObject({ attempts: [], errors: [{ name: archive }] });
    } finally { fs.rmSync(outside, { recursive: true, force: true }); }
  });
  it('ignores malformed and old abandoned records under successful archive', () => {
    const old = path.join(root, '.prospec/archive', archive);
    fs.mkdirSync(path.dirname(old), { recursive: true });
    fs.cpSync(dir, old, { recursive: true });
    fs.rmSync(path.dirname(dir), { recursive: true });
    expect(readAbandonHistory(root)).toEqual({ attempts: [], errors: [] });
    fs.writeFileSync(path.join(old, 'metadata.yaml'), 'invalid: [');
    expect(readAbandonHistory(root)).toEqual({ attempts: [], errors: [] });
  });
  it.each(['empty-link', 'dangling-link', 'file'])('reports an unsafe abandoned root: %s', (kind) => {
    const base = path.dirname(dir);
    fs.rmSync(base, { recursive: true });
    if (kind === 'file') fs.writeFileSync(base, 'not a directory');
    else {
      const target = path.join(root, 'elsewhere');
      if (kind === 'empty-link') fs.mkdirSync(target);
      fs.symlinkSync(target, base);
    }
    const result = readAbandonHistory(root);
    expect(result.attempts).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

});
