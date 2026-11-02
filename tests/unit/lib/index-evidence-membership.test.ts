import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectModuleDigests, computeChangeState } from '../../../src/lib/drift-sources.js';
import { moduleSourceDigest } from '../../../src/lib/source-digest.js';
import { gitIn } from '../../helpers/git-fixture.js';

vi.setConfig({ testTimeout: 30_000 });
let repository: string;
beforeEach(() => {
  repository = mkdtempSync(path.join(os.tmpdir(), 'index-evidence-'));
  gitIn(repository, 'init', '-q');
});
afterEach(() => rmSync(repository, { recursive: true, force: true }));

describe.each(['.', 'pkg'])('index evidence membership in %s', (project) => {
  function fixture() {
    const cwd = path.join(repository, project);
    mkdirSync(path.join(cwd, 'src'), { recursive: true });
    writeFileSync(path.join(cwd, 'src/source.ts'), 'before\n');
    gitIn(repository, 'add', '.');
    gitIn(repository, 'commit', '-qm', 'source');
    const source = () => collectModuleDigests(cwd, { modules: [{ name: 'source', paths: ['src'], keywords: [] }] }, {
      knowledgePath: path.join(cwd, 'prospec/ai-knowledge'), specsPath: path.join(cwd, 'prospec/specs'), generatedArtifacts: [],
    }).get('source')!;
    return { cwd, source };
  }

  it('ignores a local new file, admits it on staging, and reads unstaged edits and deletions', () => {
    const { cwd, source } = fixture();
    const before = { source: source().digest, snapshot: computeChangeState(cwd).digest };
    expect(before.source).toMatch(/^source-v1:/);
    expect(before.snapshot).toBeTruthy();
    writeFileSync(path.join(cwd, 'src/local.txt'), 'local\n');
    expect(source().digest).toBe(before.source);
    expect(computeChangeState(cwd).digest).toBe(before.snapshot);
    gitIn(cwd, 'add', 'src/local.txt');
    expect(source().digest).not.toBe(before.source);
    expect(computeChangeState(cwd).digest).not.toBe(before.snapshot);
    gitIn(cwd, 'rm', '--cached', 'src/local.txt');
    writeFileSync(path.join(cwd, 'src/source.ts'), 'after\n');
    expect(source().digest).not.toBe(before.source);
    expect(computeChangeState(cwd).digest).not.toBe(before.snapshot);
    unlinkSync(path.join(cwd, 'src/source.ts'));
    expect(source().digest).not.toBe(before.source);
    expect(computeChangeState(cwd).digest).not.toBe(before.snapshot);
  });

  it('preserves legacy identities without untracked members and invalidates their old inclusion once', () => {
    const { cwd, source } = fixture();
    const indexedSource = source().digest;
    const indexedSnapshot = computeChangeState(cwd).digest;
    const sourceId = gitIn(cwd, 'rev-parse', ':./src/source.ts');
    expect(indexedSource).toBe(moduleSourceDigest([{ path: 'src/source.ts', id: sourceId }]));
    expect(indexedSnapshot).toBe(computeChangeState(cwd, 'preservation').digest);
    writeFileSync(path.join(cwd, 'src/local.txt'), 'local\n');
    const oldSource = moduleSourceDigest([
      { path: 'src/source.ts', id: sourceId },
      { path: 'src/local.txt', id: gitIn(cwd, 'hash-object', 'src/local.txt') },
    ]);
    const oldSnapshot = computeChangeState(cwd, 'preservation').digest;
    expect(source().digest).not.toBe(oldSource);
    expect(computeChangeState(cwd).digest).not.toBe(oldSnapshot);
    const restamped = { source: source().digest, snapshot: computeChangeState(cwd).digest };
    expect(restamped).toEqual({ source: indexedSource, snapshot: indexedSnapshot });
    expect({ source: source().digest, snapshot: computeChangeState(cwd).digest }).toEqual(restamped);
    gitIn(cwd, 'add', 'src/local.txt');
    expect(source().digest).toBe(oldSource);
    expect(computeChangeState(cwd).digest).toBe(oldSnapshot);
  });
});
