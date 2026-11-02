import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as childProcess from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { computeChangeState, computeEvidenceStates, computeTestState, type TestInputContext } from '../../../src/lib/drift-sources.js';
import { ProspecConfigSchema } from '../../../src/types/config.js';

vi.mock('node:fs', async (original) => ({ ...await original<typeof import('node:fs')>() }));
vi.mock('node:child_process', async (original) => ({ ...await original<typeof import('node:child_process')>() }));
vi.setConfig({ testTimeout: 30_000 });
let root: string;
const git = (...args: string[]) => childProcess.execFileSync('git', args, { cwd: root, stdio: 'pipe' });
const put = (file: string, bytes: string) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), bytes);
};
// base_dir is set after parsing: config validation refuses most of these values
// before any caller builds a test input context. Knowledge is always {base_dir}/ai-knowledge.
const configWith = (baseDir: string, enabled: boolean) => {
  const config = ProspecConfigSchema.parse({ project: { name: 'fixture' }, test_evidence: { exclude_knowledge: enabled } });
  config.paths = { base_dir: baseDir };
  return config;
};
const context = (baseDir = 'kb', enabled = true): TestInputContext => ({
  config: configWith(baseDir, enabled),
  configBytes: fs.readFileSync(path.join(root, '.prospec.yaml')),
  command: 'node suite.js',
});
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-inputs-'));
  git('init', '-q'); git('config', 'user.name', 'test'); git('config', 'user.email', 'test@example.com');
  put('source.ts', 'source'); put('kb/ai-knowledge/README.md', 'first'); put('.prospec.yaml', 'project: {name: fixture}\n');
  git('add', '.'); git('commit', '-qm', 'base');
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

describe('test input projection', () => {
  it('retains the full snapshot and default identity byte-for-byte', () => {
    const original = computeChangeState(root);
    for (const ctx of [undefined, context('kb', false)]) {
      const captured = computeEvidenceStates(root, ctx);
      expect(captured.repository).toEqual(original);
      expect(captured.test).toEqual({ ...original, identity: { fingerprintVersion: 'snapshot-v2', scope: 'repository-inputs-v2' } });
    }
  });

  it('excludes Knowledge through edit, deletion, commit and ordinary recreation', () => {
    const before = computeEvidenceStates(root, context());
    expect(before.test.digest).toBeTruthy();
    expect(before.test.identity).toEqual({ fingerprintVersion: 'test-inputs-v1', scope: 'repository-inputs-without-knowledge-v1', testPolicy: { version: 1, excluded_path: 'kb/ai-knowledge' } });
    put('kb/ai-knowledge/README.md', 'second');
    expect(computeTestState(root, context()).digest).toBe(before.test.digest);
    expect(computeChangeState(root).digest).not.toBe(before.repository.digest);
    fs.rmSync(path.join(root, 'kb/ai-knowledge'), { recursive: true });
    expect(computeTestState(root, context()).digest).toBe(before.test.digest);
    git('add', '-u'); git('commit', '-qm', 'delete knowledge');
    expect(computeTestState(root, context()).digest).toBe(before.test.digest);
    put('kb/ai-knowledge/new.md', 'new');
    git('add', 'kb/ai-knowledge/new.md');
    expect(computeTestState(root, context()).digest).toBe(before.test.digest);
    put('kb/ai-knowledge-copy/README.md', 'included');
    expect(computeTestState(root, context()).digest).toBe(before.test.digest);
    git('add', 'kb/ai-knowledge-copy/README.md');
    expect(computeTestState(root, context()).digest).not.toBe(before.test.digest);
  });

  it('excludes aliases of the same Knowledge directory without folding distinct filesystem paths', () => {
    const aliases = fs.existsSync(path.join(root, 'KB'));
    const ctx = context('KB');
    const before = computeEvidenceStates(root, ctx);
    expect(before.test.digest).toBeTruthy();
    put('kb/ai-knowledge/README.md', 'Knowledge bytes changed');
    const after = computeEvidenceStates(root, ctx);
    expect(after.repository.digest).not.toBe(before.repository.digest);
    if (aliases) expect(after.test.digest).toBe(before.test.digest);
    else expect(after.test.digest).not.toBe(before.test.digest);
    expect(before.test.identity.testPolicy).toEqual({ version: 1, excluded_path: aliases ? 'kb/ai-knowledge' : 'KB/ai-knowledge' });
  });

  it.each(['KB', 'other-kb'])('compares filesystem identities when Knowledge is renamed to %s', (renamed) => {
    fs.renameSync(path.join(root, 'kb'), path.join(root, 'temporary-kb'));
    fs.renameSync(path.join(root, 'temporary-kb'), path.join(root, renamed));
    const aliases = fs.existsSync(path.join(root, 'kb'));
    const ctx = context(renamed);
    const before = computeEvidenceStates(root, ctx);
    expect(before.repository.digest).toBeTruthy();
    expect(before.test.digest).toBeTruthy();
    put(`${renamed}/ai-knowledge/README.md`, 'Changed under the canonical directory spelling');
    const after = computeEvidenceStates(root, ctx);
    expect(after.repository.digest).toBeTruthy();
    if (aliases) expect(after.repository.digest).not.toBe(before.repository.digest);
    else expect(after.repository.digest).toBe(before.repository.digest);
    expect(after.test.digest).toBe(before.test.digest);
    git('add', '-A');
    const indexed = computeEvidenceStates(root, ctx);
    expect(indexed.repository.digest).toBeTruthy();
    expect(indexed.repository.digest).not.toBe(before.repository.digest);
    expect(indexed.test.digest).toBe(before.test.digest);
  });

  it('binds command, descriptor and ignored raw configuration bytes', () => {
    put('.gitignore', '.prospec.yaml\n'); git('rm', '--cached', '.prospec.yaml');
    const before = computeTestState(root, context()).digest;
    expect(computeTestState(root, { ...context(), command: 'node other.js' }).digest).not.toBe(before);
    expect(computeTestState(root, context('another')).digest).not.toBe(before);
    const full = computeChangeState(root).digest;
    put('.prospec.yaml', 'project: {name: fixture}\n# changed\n');
    expect(computeChangeState(root).digest).toBe(full);
    expect(computeTestState(root, context()).digest).not.toBe(before);
  });

  it('refuses stale context bytes without destroying the full snapshot', () => {
    const ctx = context(); put('.prospec.yaml', 'changed');
    const captured = computeEvidenceStates(root, ctx);
    expect(captured.repository.digest).toBeTruthy();
    expect(captured.test.digest).toBeNull();
    expect(captured.test.reason).toMatch(/config/i);
  });

  it.each(['unreadable', 'missing'])('refuses an %s ignored config without discarding the full capture', (failure) => {
    put('.gitignore', '.prospec.yaml\n');
    git('rm', '--cached', '.prospec.yaml');
    const ctx = context();
    const full = computeChangeState(root);
    if (failure === 'missing') fs.unlinkSync(path.join(root, '.prospec.yaml'));
    else {
      const read = fs.readFileSync;
      vi.spyOn(fs, 'readFileSync').mockImplementation((...args: Parameters<typeof fs.readFileSync>) => {
        if (String(args[0]).endsWith('.prospec.yaml')) throw new Error('EACCES config');
        return read(...args);
      });
    }
    const captured = computeEvidenceStates(root, ctx);
    expect(full.digest).toBeTruthy();
    expect(captured.repository).toEqual(full);
    expect(captured.test.digest).toBeNull();
    expect(captured.test.reason).toMatch(failure === 'missing' ? /ENOENT/ : /EACCES/);
  });

  it('retains contents and executable modes of included files', () => {
    const before = computeTestState(root, context()).digest;
    put('source.ts', 'modified');
    const changed = computeTestState(root, context()).digest;
    expect(changed).not.toBe(before);
    if (process.platform !== 'win32') {
      fs.chmodSync(path.join(root, 'source.ts'), 0o755);
      expect(computeTestState(root, context()).digest).not.toBe(changed);
    }
  });

  it('fails only the test projection for an unsafe exclusion root', () => {
    const captured = computeEvidenceStates(root, context('..'));
    expect(captured.repository).toEqual(computeChangeState(root));
    expect(captured.test.digest).toBeNull();
    expect(captured.test.reason).toMatch(/descendant/i);
  });

  it.skipIf(process.platform === 'win32')('refuses a retained symlink into excluded Knowledge', () => {
    fs.symlinkSync('kb/ai-knowledge/README.md', path.join(root, 'alias'));
    git('add', 'alias');
    const captured = computeEvidenceStates(root, context());
    expect(captured.repository.digest).toBeTruthy();
    expect(captured.test.digest).toBeNull();
    expect(captured.test.reason).toMatch(/symlink/i);
  });

  it.skipIf(process.platform === 'win32')('refuses a retained directory symlink onto excluded Knowledge or an ancestor of it', () => {
    put('docs/ai-knowledge/README.md', 'notes'); put('docs/guide.md', 'guide'); git('add', '.'); git('commit', '-qm', 'docs');
    fs.symlinkSync('docs', path.join(root, 'ancestor'));
    git('add', 'ancestor');
    const crossing = computeEvidenceStates(root, context('docs'));
    expect(crossing.repository.digest).toBeTruthy();
    expect(crossing.test).toMatchObject({ digest: null, reason: 'Symlink crosses Knowledge exclusion: ancestor' });
    fs.unlinkSync(path.join(root, 'ancestor')); fs.symlinkSync('docs/ai-knowledge', path.join(root, 'inside'));
    git('add', '-A');
    expect(computeEvidenceStates(root, context('docs')).test).toMatchObject({ digest: null, reason: 'Symlink crosses Knowledge exclusion: inside' });
  });

  // R1-2: deletions beneath a replaced directory share one confirming status read, so capture stays linear.
  it.skipIf(process.platform === 'win32')('confirms every deletion beneath a replaced directory with one extra status read', () => {
    for (const name of ['a', 'b', 'c']) { put(`skills/${name}.md`, name); put(`shared/${name}.md`, name); }
    git('add', '.'); git('commit', '-qm', 'skills');
    fs.rmSync(path.join(root, 'skills'), { recursive: true }); fs.symlinkSync('shared', path.join(root, 'skills'));
    const spy = vi.spyOn(childProcess, 'execFileSync');
    const captured = computeChangeState(root);
    const statusReads = spy.mock.calls.filter(([, args]) => (args as string[] | undefined)?.includes('status')).length;
    expect(captured.digest).toBeTruthy();
    expect(statusReads).toBe(2);
  });

  it.skipIf(process.platform === 'win32')('records a retained directory symlink beside the exclusion', () => {
    put('lib/a.ts', 'a'); fs.symlinkSync('lib', path.join(root, 'alias'));
    git('add', 'lib/a.ts', 'alias');
    const captured = computeEvidenceStates(root, context());
    expect(captured.repository.digest).toBeTruthy();
    expect(captured.test.digest).toBeTruthy();
  });

  it.skipIf(process.platform === 'win32')('refuses symlinks within the exclusion, including ignored topology', () => {
    put('.gitignore', 'kb/ai-knowledge/alias\n');
    fs.symlinkSync('../../source.ts', path.join(root, 'kb/ai-knowledge/alias'));
    const captured = computeEvidenceStates(root, context());
    expect(captured.repository.digest).toBeTruthy();
    expect(captured.test.digest).toBeNull();
  });

  it('never conceals full capture failure inside the excluded tree', () => {
    fs.unlinkSync(path.join(root, 'kb/ai-knowledge/README.md'));
    fs.mkdirSync(path.join(root, 'kb/ai-knowledge/README.md'));
    const captured = computeEvidenceStates(root, context());
    expect(captured.repository.digest).toBeNull();
    expect(captured.test.digest).toBeNull();
  });

  // vendor/ai-knowledge is the exclusion: an ancestor of, equal to, and inside each gitlink in turn.
  it.each(['vendor/ai-knowledge/module', 'vendor/ai-knowledge', 'vendor'])('refuses an exclusion intersecting a gitlink at %s', (gitlink) => {
    fs.mkdirSync(path.join(root, gitlink), { recursive: true });
    const head = git('rev-parse', 'HEAD').toString().trim();
    git('update-index', '--add', '--cacheinfo', `160000,${head},${gitlink}`);
    const captured = computeEvidenceStates(root, context('vendor'));
    expect(captured.repository.digest).toBeTruthy();
    expect(captured.test.digest).toBeNull();
    expect(captured.test.reason).toMatch(/submodule/i);
  });

  it('judges aliased gitlink ancestors by filesystem identity', () => {
    fs.mkdirSync(path.join(root, 'kb/module'));
    const aliases = fs.existsSync(path.join(root, 'kb/MODULE'));
    const head = git('rev-parse', 'HEAD').toString().trim();
    git('update-index', '--add', '--cacheinfo', `160000,${head},kb/module`);
    fs.renameSync(path.join(root, 'kb/module'), path.join(root, 'kb/temporary'));
    fs.renameSync(path.join(root, 'kb/temporary'), path.join(root, 'kb/MODULE'));
    const captured = computeEvidenceStates(root, context('kb/MODULE'));
    expect(captured.repository.digest).toBeTruthy();
    if (aliases) {
      expect(captured.test.digest).toBeNull();
      expect(captured.test.reason).toMatch(/submodule/i);
    } else expect(captured.test.digest).toBeTruthy();
  });

  it('refuses an unprovable input identity without changing the full capture', () => {
    const original = fs.realpathSync.native;
    vi.spyOn(fs.realpathSync, 'native').mockImplementation((...args: Parameters<typeof fs.realpathSync.native>) => {
      if (String(args[0]).endsWith('source.ts')) throw new Error('EACCES canonical input');
      return original(...args);
    });
    const full = computeChangeState(root);
    const captured = computeEvidenceStates(root, context());
    expect(captured.repository).toEqual(full);
    expect(full.digest).toBeTruthy();
    expect(captured.test.digest).toBeNull();
    expect(captured.test.reason).toMatch(/EACCES canonical input/);
  });

  it('preserves unreadable excluded-input failures', () => {
    const read = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((...args: Parameters<typeof fs.readFileSync>) => {
      if (String(args[0]).endsWith('kb/ai-knowledge/README.md')) throw new Error('EACCES excluded input');
      return read(...args);
    });
    const captured = computeEvidenceStates(root, context());
    expect(captured.repository.digest).toBeNull();
    expect(captured.test.digest).toBeNull();
    expect(captured.test.reason).toMatch(/EACCES/);
  });

  it('rechecks raw config after the retained bytes are read', () => {
    const ctx = context();
    const read = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((...args: Parameters<typeof fs.readFileSync>) => {
      const bytes = read(...args);
      if (String(args[0]).endsWith('source.ts')) put('.prospec.yaml', 'changed after config capture');
      return bytes;
    });
    const captured = computeEvidenceStates(root, ctx);
    expect(captured.repository.digest).toBeTruthy();
    expect(captured.test.digest).toBeNull();
    expect(captured.test.reason).toMatch(/config/i);
  });

  it.skipIf(process.platform === 'win32')('rechecks exclusion topology after the retained bytes are read', () => {
    const ctx = context();
    const read = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((...args: Parameters<typeof fs.readFileSync>) => {
      const bytes = read(...args);
      if (String(args[0]).endsWith('source.ts')) {
        fs.renameSync(path.join(root, 'kb/ai-knowledge'), path.join(root, 'kb/moved'));
        fs.symlinkSync('moved', path.join(root, 'kb/ai-knowledge'));
      }
      return bytes;
    });
    const captured = computeEvidenceStates(root, ctx);
    expect(captured.repository.digest).toBeTruthy();
    expect(captured.test.digest).toBeNull();
    expect(captured.test.reason).toMatch(/ordinary directory/i);
  });

  it('uses one inventory and one file-byte read for both scopes', () => {
    const spawn = vi.spyOn(childProcess, 'execFileSync');
    const reads = vi.spyOn(fs, 'readFileSync');
    const ctx = context(); reads.mockClear();
    expect(computeEvidenceStates(root, ctx).test.digest).toBeTruthy();
    expect(spawn.mock.calls.length).toBeGreaterThan(0);
    expect(spawn.mock.calls.length).toBeLessThanOrEqual(6);
    expect(reads.mock.calls.filter(([file]) => String(file) === path.join(fs.realpathSync(root), 'source.ts'))).toHaveLength(1);
  });
});
