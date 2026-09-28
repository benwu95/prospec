import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { findUnsyncedModules } from '../../src/lib/knowledge-sync.js';
import { execute as status } from '../../src/services/status.service.js';
import { execute as archive } from '../../src/services/archive.service.js';
import { executeForChange as knowledgeUpdate } from '../../src/services/knowledge-update.service.js';

vi.setConfig({ testTimeout: 30_000 });

let root: string;
const write = (name: string, text: string) => {
  mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  writeFileSync(path.join(root, name), text);
};
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });

// related_modules names only `lib` (fresh), while the delta-spec's REQ-SERVICES
// entry points at `services`, whose source was committed after its last_verified.
beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'knowledge-sync-union-'));
  git('init', '-q');
  git('config', 'user.name', 'test');
  git('config', 'user.email', 'test@example.com');
  write('.prospec.yaml', 'version: "1.0"\nproject:\n  name: fixture\n');
  write(
    'prospec/ai-knowledge/module-map.yaml',
    'modules:\n' +
      '  - name: lib\n    paths: [src/lib]\n    keywords: [lib]\n    last_verified: "2099-01-01T00:00:00Z"\n' +
      '  - name: services\n    paths: [src/services]\n    keywords: [services]\n    last_verified: "2000-01-01T00:00:00Z"\n',
  );
  write('prospec/ai-knowledge/modules/lib/README.md', '# lib\n');
  write('prospec/ai-knowledge/modules/services/README.md', '# services\n');
  write('src/lib/a.ts', 'export const a = 1;\n');
  write('src/services/b.ts', 'export const b = 1;\n');
  write(
    '.prospec/changes/x/metadata.yaml',
    'name: x\ncreated_at: "2026-09-28"\nstatus: verified\nscale: standard\nrelated_modules:\n  - lib\n',
  );
  write('.prospec/changes/x/delta-spec.md', '# Delta\n\n## MODIFIED\n\n### REQ-SERVICES-001: change b\n\n**Feature:** alpha\n**Story:** US-1\n');
  git('add', '.');
  git('commit', '-qm', 'fixture');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('knowledge-sync gate checks related_modules ∪ delta-spec modules', () => {
  it('reports the stale delta-spec module that related_modules does not name', async () => {
    const gaps = await findUnsyncedModules(
      path.join(root, '.prospec/changes/x'),
      { related_modules: ['lib'], scale: 'standard' },
      root,
      null,
    );
    expect(gaps).toEqual({ stale: ['services'], unregistered: [], malformedIds: [], moduleMapUnreadable: false });
  });

  it('routes the change to the knowledge-update station', async () => {
    const report = await status({ cwd: root });
    expect(report.changes.find((c) => c.name === 'x')?.next).toBe('knowledge-update');
  });

  it('refuses archive with a KNOWLEDGE_UNSYNCED reason naming services', async () => {
    const result = await archive({ cwd: root, names: ['x'], dryRun: true });
    expect(result.refused).toHaveLength(1);
    expect(result.refused[0]!.reason).toMatch(/KNOWLEDGE_UNSYNCED: [^;]*stale: services/);
  });
});

describe('a REMOVED REQ keeps its module registered through knowledge-update', () => {
  it('leaves the module checkable by the gate instead of unregistering it', async () => {
    write('.prospec/changes/x/delta-spec.md', '# Delta\n\n## REMOVED\n\n### REQ-SERVICES-001: drop b\n\n**Feature:** alpha\n');
    const result = await knowledgeUpdate({ cwd: root, change: 'x', quiet: true });
    expect(result.deprecated).toEqual([]);
    expect(result.readmePending).toContain('services');
    const gaps = await findUnsyncedModules(
      path.join(root, '.prospec/changes/x'),
      { related_modules: ['lib'], scale: 'standard' },
      root,
      null,
    );
    // still stale (the README must drop the behavior and be re-stamped), never unregistered
    expect(gaps.unregistered).toEqual([]);
    expect(gaps.stale).toEqual(['services']);
  });
});

describe('a modules/ directory the module map does not register', () => {
  it('is not a module: its REMOVED REQ neither blocks the gate nor loops through knowledge-update', async () => {
    write('prospec/ai-knowledge/modules/legacy/README.md', '> **DEPRECATED**: This module was removed.\n\n# legacy\n');
    write('.prospec/changes/x/delta-spec.md', '# Delta\n\n## REMOVED\n\n### REQ-LEGACY-002: drop\n\n**Feature:** alpha\n');
    const dir = path.join(root, '.prospec/changes/x');
    const meta = { related_modules: ['lib'], scale: 'standard' };
    expect((await findUnsyncedModules(dir, meta, root, null)).unregistered).toEqual([]);
    const result = await knowledgeUpdate({ cwd: root, change: 'x', quiet: true });
    expect(result.readmePending).toEqual([]);
    expect(result.warnings.join(' ')).toContain('REQ-LEGACY-002');
    expect(await findUnsyncedModules(dir, meta, root, null)).toEqual({
      stale: [], unregistered: [], malformedIds: [], moduleMapUnreadable: false,
    });
  });
});
