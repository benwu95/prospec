import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { stringifyYaml } from '../../../src/lib/yaml-utils.js';
import { sha256 } from '../../../src/lib/repo-state.js';
import { readAbandonHistory, matchingAbandoned, excludesAbandonFromYield } from '../../../src/lib/abandon-history.js';
import { assertNoIncompleteAbandon, readAbandonedAttempt } from '../../../src/lib/abandon-history.js';
import { resolveHistoryPaths } from '../../../src/lib/history-paths.js';
import { transferBundle } from '../../../src/lib/terminal-transfer.js';
import { gitIn } from '../../helpers/git-fixture.js';
vi.setConfig({ testTimeout: 30_000 });
let root: string;
const archive = '2026-10-05-old';
let dir: string;
const put = (name: string, value: string) => { const p = path.join(dir, name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, value); };
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'abandon-history-')));
  dir = path.join(root, '.prospec/abandoned', archive);
  put('metadata.yaml', stringifyYaml({ name: 'old', created_at: '2026-10-05', status: 'abandoned', issue: ' #333  ', abandonment: { reason: 'Premise disproved', at: '2026-10-05', from_status: 'plan', escalation: null, overturned: [], premise_note: 'None declared', manifest: 'preservation/manifest.json' } }));
  put('preservation/manifest.json', JSON.stringify({ version: 1, root, git_prefix: '', head: 'a'.repeat(40), patches: { staged: sha256(''), unstaged: sha256('') }, entries: [] }));
  put('preservation/staged.patch', ''); put('preservation/unstaged.patch', '');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
describe('abandoned history', () => {
  it('shares completed history while binding unfinished transfers only to their source', async () => {
    fs.writeFileSync(path.join(root, '.prospec.yaml'), 'project:\n  name: test\n');
    fs.writeFileSync(path.join(root, '.gitignore'), '.prospec/\n');
    gitIn(root, 'init', '-qb', 'trunk'); gitIn(root, 'add', '.'); gitIn(root, 'commit', '-qm', 'base');
    const linked = `${root}-linked`;
    gitIn(root, 'worktree', 'add', '-qb', 'linked', linked);
    try {
      expect(readAbandonedAttempt(linked, archive).digest).toBe(readAbandonedAttempt(root, archive).digest);
      const source = path.join(linked, '.prospec/changes/new');
      fs.mkdirSync(source, { recursive: true }); fs.writeFileSync(path.join(source, 'proposal.md'), 'source');
      await expect(transferBundle({ paths: resolveHistoryPaths(linked), kind: 'archive', identity: '2026-10-10-new', changeName: 'new', sourceDir: source, cleanup: true,
        prepare: async () => { throw new Error('injected preparation fault'); } })).rejects.toThrow(/injected/);
      expect(() => assertNoIncompleteAbandon(linked, 'new')).toThrow(/Pending history/);
      expect(() => assertNoIncompleteAbandon(root, 'new')).not.toThrow();
      expect(readAbandonHistory(linked).errors.some((error) => error.source === 'new')).toBe(true);
      expect(readAbandonHistory(root).attempts).toHaveLength(1);
    } finally { fs.rmSync(linked, { recursive: true, force: true }); }
  });
  it.each(['staged.patch', 'unstaged.patch'])('refuses missing or corrupt %s bytes', (name) => {
    put(`preservation/${name}`, 'corrupted');
    expect(readAbandonHistory(root).attempts).toEqual([]);
    expect(readAbandonHistory(root).errors[0]?.error).toMatch(/hash|digest|preserv/i);
    fs.unlinkSync(path.join(dir, 'preservation', name));
    expect(readAbandonHistory(root).attempts).toEqual([]);
  });
  it('validates regular blobs without requiring the old worktree', () => {
    const file = path.join(dir, 'preservation/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    manifest.root = '/removed-worktree';
    manifest.entries = [{ path: 'work', kind: 'regular', mode: 420, sha256: sha256('saved'), blob: 'blobs/0' }];
    put('preservation/manifest.json', JSON.stringify(manifest)); put('preservation/blobs/0', 'saved');
    expect(readAbandonHistory(root).attempts).toHaveLength(1);
    put('preservation/blobs/0', 'corrupt');
    expect(readAbandonHistory(root).attempts).toHaveLength(0);
    manifest.entries[0].blob = '../../metadata.yaml';
    put('preservation/manifest.json', JSON.stringify(manifest));
    expect(readAbandonHistory(root).errors[0]?.error).toMatch(/blob|unsafe|path/i);
  });
  it('validates an existing gitlinks record', () => {
    put('preservation/gitlinks.json', '{"version":2}');
    expect(readAbandonHistory(root).attempts).toEqual([]);
    expect(readAbandonHistory(root).errors).toHaveLength(1);
  });
  it('refuses preservation stored through symlinked directories inside the project', () => {
    const saved = path.join(root, 'other-preservation');
    fs.renameSync(path.join(dir, 'preservation'), saved);
    fs.symlinkSync(saved, path.join(dir, 'preservation'));
    expect(readAbandonHistory(root).attempts).toEqual([]);
    expect(readAbandonHistory(root).errors[0]?.error).toMatch(/unsafe|symlink/i);
  });
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
