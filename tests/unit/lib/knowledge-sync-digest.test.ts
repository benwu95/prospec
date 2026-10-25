import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findUnsyncedModules } from '../../../src/lib/knowledge-sync.js';
import { collectModuleDigests } from '../../../src/lib/drift-sources.js';
import { stringifyYaml } from '../../../src/lib/yaml-utils.js';
import type { ModuleMap } from '../../../src/types/module-map.js';
import { gitIn } from '../../helpers/git-fixture.js';

vi.setConfig({ testTimeout: 30_000 });

let root: string;
const put = (file: string, text: string) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
};
const knowledge = () => path.join(root, 'prospec/ai-knowledge');
const writeMap = (map: ModuleMap) => put('prospec/ai-knowledge/module-map.yaml', stringifyYaml(map));
const baseMap = (lib: Partial<ModuleMap['modules'][number]>): ModuleMap => ({
  modules: [
    { name: 'lib', paths: ['src/lib'], keywords: [], last_verified: '2026-10-25T00:00:00.000Z', ...lib },
    { name: 'cli', paths: ['src/cli'], keywords: [], last_verified: '2026-10-25T00:00:00.000Z' },
  ],
});
const currentDigest = () => collectModuleDigests(root, baseMap({}), {
  knowledgePath: knowledge(),
  specsPath: path.join(root, 'prospec/specs'),
  generatedArtifacts: [],
}).get('lib')!.digest!;
const gaps = () => findUnsyncedModules(path.join(root, '.prospec/changes/c'), { related_modules: ['lib'] }, root, null);

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'sync-digest-')));
  put('src/lib/a.ts', 'a\n');
  put('src/cli/b.ts', 'b\n');
  put('prospec/ai-knowledge/modules/lib/README.md', '# lib\n');
  put('prospec/ai-knowledge/modules/cli/README.md', '# cli\n');
  mkdirSync(path.join(root, '.prospec/changes/c'), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('findUnsyncedModules by source digest (REQ-LIB-097)', () => {
  beforeEach(() => {
    gitIn(root, 'init', '-q');
    gitIn(root, 'add', '.');
    gitIn(root, 'commit', '-qm', 'base');
  });

  it('is synced while the recorded digest matches the source', async () => {
    writeMap(baseMap({ source_digest: currentDigest() }));
    expect((await gaps()).stale).toEqual([]);
  });

  it('is stale once the source changes after the stamp, whatever the day', async () => {
    writeMap(baseMap({ source_digest: currentDigest() }));
    put('src/lib/a.ts', 'edited\n');
    expect((await gaps()).stale).toEqual(['lib']);
  });

  it('is stale when the module carries no digest', async () => {
    writeMap(baseMap({}));
    expect((await gaps()).stale).toEqual(['lib']);
  });

  it('answers the affected module the same way the whole-map assessment does', async () => {
    writeMap(baseMap({ source_digest: currentDigest() }));
    put('src/cli/b.ts', 'edited\n');
    expect((await gaps()).stale).toEqual([]);
  });
});

describe('findUnsyncedModules in a repository git refuses to read (REQ-LIB-097)', () => {
  it('judges only the README and last_verified, like a directory outside a work tree', async () => {
    gitIn(root, 'init', '-q');
    gitIn(root, 'add', '.');
    gitIn(root, 'commit', '-qm', 'base');
    writeMap(baseMap({}));
    // CI runner images trust every directory (`safe.directory = *`) in system or global config.
    const env = {
      GIT_TEST_ASSUME_DIFFERENT_OWNER: '1',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: path.join(root, '.git', 'absent-global-config'),
    };
    const saved = Object.keys(env).map((name) => [name, process.env[name]] as const);
    Object.assign(process.env, env);
    try {
      expect((await gaps()).stale).toEqual([]);
    } finally {
      for (const [name, value] of saved) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});

describe('findUnsyncedModules outside a git work tree (REQ-LIB-097)', () => {
  it('judges only the README and last_verified', async () => {
    writeMap(baseMap({ source_digest: 'source-v1:stale' }));
    expect((await gaps()).stale).toEqual([]);
    writeMap(baseMap({ last_verified: undefined }));
    expect((await gaps()).stale).toEqual(['lib']);
  });
});
