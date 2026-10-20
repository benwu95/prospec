import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectKnowledgeSize, type KnowledgeSizeSource } from '../../src/lib/drift-sources.js';
import { evaluateKnowledgeSize } from '../../src/lib/drift-checker.js';
import { execute as check } from '../../src/services/check.service.js';
import { DEFAULT_KNOWLEDGE_TOKEN_BUDGET, type KnowledgeSizeBudget } from '../../src/types/config.js';

// Real git per test — the house timeout for git-bound suites (PB-010).
vi.setConfig({ testTimeout: 30_000 });

/**
 * REQ-LIB-107 / REQ-TESTS-142 — the knowledge-size ratchet measured against a real
 * repository: the merge-base read, the eol filter, symlinks, a project below the
 * repository root, and every way the base can fail to resolve.
 */

const BUDGET: KnowledgeSizeBudget = { ...DEFAULT_KNOWLEDGE_TOKEN_BUDGET, l1_per_file: 50, l2_per_module: 50, spec_per_file: 50, headroom: 1.0 };
const README = 'prospec/ai-knowledge/modules/x/README.md';

let root: string;
let project: string;
const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf-8' });
const write = (rel: string, text: string): void => {
  mkdirSync(path.dirname(path.join(project, rel)), { recursive: true });
  writeFileSync(path.join(project, rel), text);
};
const collect = (ratchet: unknown, cwd = project, inWorkTree = true): KnowledgeSizeSource =>
  collectKnowledgeSize(cwd, path.join(cwd, 'prospec'), path.join(cwd, 'prospec', 'ai-knowledge'), BUDGET, [], ratchet, inWorkTree);
const itemAt = (src: KnowledgeSizeSource, rel: string) => src.items.find((i) => i.source_path === rel)!;
const findingAt = (src: KnowledgeSizeSource, rel: string) =>
  evaluateKnowledgeSize(src).findings.find((f) => f.source_path === rel && f.knowledge_size?.unit === 'tokens');

function initRepo(projectSubdir = ''): void {
  root = mkdtempSync(path.join(os.tmpdir(), 'size-ratchet-'));
  project = path.join(root, projectSubdir);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.name', 'test');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'core.autocrlf', 'false');
  write('prospec/index.md', 'index\n');
  write(README, `${'A'.repeat(399)}\n`); // 400 chars → 100 tokens, over the 50 budget
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'base');
  git(root, 'branch', 'base');
}

describe('collectKnowledgeSize — size ratchet on a real repository', () => {
  beforeEach(() => initRepo());
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('adds no ratchet facts when the ratchet is not configured', () => {
    const src = collect(undefined);
    expect(src.ratchet).toBeUndefined();
    expect(src.items.every((i) => i.ratchet === undefined)).toBe(true);
  });

  it('resolves the merge-base and measures an over-budget file there', () => {
    const src = collect({ base: 'base' });
    expect(src.ratchet).toEqual({ status: 'resolved', base_ref: 'base', merge_base: git(root, 'rev-parse', 'base').trim() });
    expect(itemAt(src, README).ratchet).toEqual({ base: { tokens: 100, lines: 1 } });
    // within budget → not ratchet-measured, so no git read is spent on it
    expect(itemAt(src, 'prospec/index.md').ratchet).toBeUndefined();
    expect(findingAt(src, README)!.severity).toBe('warn');
  });

  it('fails a file that grew past its merge-base size, and returns to warn once it shrinks back', () => {
    write(README, `${'A'.repeat(399)}\n${'B'.repeat(40)}\n`);
    expect(findingAt(collect({ base: 'base' }), README)).toMatchObject({ severity: 'fail' });
    write(README, `${'A'.repeat(399)}\n`);
    expect(findingAt(collect({ base: 'base' }), README)).toMatchObject({ severity: 'warn' });
  });

  // R-8 pin: an L2 file within its token budget is a ratchet target on its line count alone.
  it('fails an L2 file whose line count grew past the line budget while its tokens stay in budget', () => {
    write(README, '\n'.repeat(120)); // 120 lines → 30 tokens, over readme_max_lines only
    git(root, 'commit', '-qam', 'long readme');
    git(root, 'branch', '-f', 'base');
    write(README, '\n'.repeat(130));
    const src = collect({ base: 'base' });
    const item = itemAt(src, README);
    expect(item.tokens).toBeLessThanOrEqual(BUDGET.l2_per_module);
    expect(item.ratchet).toEqual({ base: { tokens: 30, lines: 120 } });
    const lines = evaluateKnowledgeSize(src).findings.find((f) => f.source_path === README && f.knowledge_size?.unit === 'lines');
    expect(lines).toMatchObject({ severity: 'fail' });
  });

  it('fails a committed file that is new since the merge-base', () => {
    write('prospec/ai-knowledge/modules/y/README.md', 'C'.repeat(400));
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'new module');
    const src = collect({ base: 'base' });
    expect(itemAt(src, 'prospec/ai-knowledge/modules/y/README.md').ratchet).toEqual({ base: null });
    expect(findingAt(src, 'prospec/ai-knowledge/modules/y/README.md')).toMatchObject({ severity: 'fail' });
  });

  it('reads the base through the checkout filters, so a CRLF working tree is not growth', () => {
    const lines = Array.from({ length: 40 }, (_, i) => `line ${i} ${'A'.repeat(6)}`);
    write(README, `${lines.join('\n')}\n`);
    git(root, 'commit', '-qam', 'multi-line readme');
    git(root, 'branch', '-f', 'base');
    git(root, 'config', 'core.autocrlf', 'true');
    write(README, `${lines.join('\r\n')}\r\n`);
    const src = collect({ base: 'base' });
    const item = itemAt(src, README);
    expect(item.ratchet).toEqual({ base: { tokens: item.tokens, lines: item.lines } });
    expect(findingAt(src, README)).toMatchObject({ severity: 'warn' });
  });

  it.skipIf(process.platform === 'win32')('does not ratchet a symlinked knowledge file', () => {
    write('prospec/ai-knowledge/z-target.md', 'D'.repeat(400));
    mkdirSync(path.join(project, 'prospec/ai-knowledge/modules/z'), { recursive: true });
    symlinkSync('../../z-target.md', path.join(project, 'prospec/ai-knowledge/modules/z/README.md'));
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'symlinked module');
    const src = collect({ base: 'HEAD' });
    expect(itemAt(src, 'prospec/ai-knowledge/modules/z/README.md').ratchet).toMatchObject({ skipped: expect.stringContaining('symlink') });
    expect(findingAt(src, 'prospec/ai-knowledge/modules/z/README.md')).toMatchObject({ severity: 'warn' });
  });

  it('never ratchet-measures a growing over-budget Feature Spec (R-2)', () => {
    write('prospec/specs/features/a.md', 'F'.repeat(400));
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'spec');
    git(root, 'branch', '-f', 'base');
    write('prospec/specs/features/a.md', 'F'.repeat(800));
    const src = collect({ base: 'base' });
    expect(itemAt(src, 'prospec/specs/features/a.md').ratchet).toBeUndefined();
    expect(findingAt(src, 'prospec/specs/features/a.md')).toMatchObject({ severity: 'warn' });
  });

  it.skipIf(process.platform === 'win32')('skips a file that is a symlink only in the working tree (R-3)', () => {
    write('prospec/ai-knowledge/w-target.md', 'G'.repeat(800));
    rmSync(path.join(project, README));
    symlinkSync('../../w-target.md', path.join(project, README));
    const src = collect({ base: 'base' });
    expect(itemAt(src, README).ratchet).toEqual({ skipped: 'symlink on its path in the working tree' });
    expect(findingAt(src, README)).toMatchObject({ severity: 'warn' });
  });

  it.skipIf(process.platform === 'win32')('skips a file that was a symlink only at the merge-base (R-3)', () => {
    write('prospec/ai-knowledge/m-target.md', 'H'.repeat(400));
    rmSync(path.join(project, README));
    symlinkSync('../../m-target.md', path.join(project, README));
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'readme becomes a symlink');
    git(root, 'branch', '-f', 'base');
    rmSync(path.join(project, README));
    write(README, 'I'.repeat(800));
    const src = collect({ base: 'base' });
    expect(itemAt(src, README).ratchet).toEqual({ skipped: 'symlink at the merge-base' });
    expect(findingAt(src, README)).toMatchObject({ severity: 'warn' });
  });

  // R-1 pin: the symlink sits on a parent directory, not on the file. ls-tree cannot
  // list a path through a symlink, so a leaf-only check read it as absent → false FAIL.
  it.skipIf(process.platform === 'win32')('does not ratchet a file reached through a symlinked parent directory', () => {
    write('prospec/ai-knowledge/shared/lib/README.md', 'E'.repeat(400));
    mkdirSync(path.join(project, 'prospec/ai-knowledge/modules'), { recursive: true });
    symlinkSync('../shared/lib', path.join(project, 'prospec/ai-knowledge/modules/lib'));
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'symlinked module directory');
    const src = collect({ base: 'HEAD' });
    const rel = 'prospec/ai-knowledge/modules/lib/README.md';
    expect(itemAt(src, rel).ratchet).toMatchObject({ skipped: expect.stringContaining('symlink') });
    expect(findingAt(src, rel)).toMatchObject({ severity: 'warn' });
  });

  it.each([
    ['an unknown ref', () => ({ base: 'no-such-ref' })],
    ['a base with no common ancestor', () => {
      git(root, 'checkout', '-q', '--orphan', 'island');
      git(root, 'commit', '-qm', 'island', '--allow-empty');
      git(root, 'checkout', '-q', 'main');
      return { base: 'island' };
    }],
  ])('is unresolvable for %s, keeping every item', (_label, arrange) => {
    const src = collect(arrange());
    expect(src.ratchet).toMatchObject({ status: 'unresolvable', reason: expect.any(String) });
    expect(itemAt(src, README).ratchet).toBeUndefined();
    const r = evaluateKnowledgeSize(src);
    expect(r.result.status).toBe('fail');
    expect(r.findings.find((f) => f.source_path === '.prospec.yaml')).toMatchObject({ severity: 'fail' });
  });

  it('is unresolvable in a shallow clone', () => {
    const clone = path.join(root, '..', `${path.basename(root)}-shallow`);
    git(os.tmpdir(), 'clone', '-q', '--depth', '1', `file://${root}`, clone);
    try {
      const src = collect({ base: 'HEAD' }, clone);
      expect(src.ratchet).toMatchObject({ status: 'unresolvable', reason: expect.stringContaining('shallow') });
    } finally {
      rmSync(clone, { recursive: true, force: true });
    }
  });

  it('is unresolvable outside a git work tree', () => {
    const src = collect({ base: 'base' }, project, false);
    expect(src.ratchet).toMatchObject({ status: 'unresolvable', reason: expect.stringContaining('git') });
  });
});

describe('collectKnowledgeSize — project below the repository root', () => {
  beforeEach(() => initRepo('sub'));
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reads the merge-base path relative to the project, not the repository root', () => {
    write(README, `${'A'.repeat(399)}\n${'B'.repeat(40)}\n`);
    const src = collect({ base: 'base' });
    expect(itemAt(src, README).ratchet).toEqual({ base: { tokens: 100, lines: 1 } });
    expect(findingAt(src, README)).toMatchObject({ severity: 'fail' });
  });
});

describe('prospec check wires the configured ratchet through (REQ-SERVICES-065, US-1 Independent Test)', () => {
  beforeEach(() => {
    initRepo();
    write('.prospec.yaml', [
      'version: "1.0"',
      'project:',
      '  name: fixture',
      'knowledge:',
      '  base_path: prospec/ai-knowledge',
      '  token_budget:',
      '    # fixture-sized budget so a 100-token README is over it',
      '    l2_per_module: 50',
      '  size_ratchet:',
      '    base: base',
      '',
    ].join('\n'));
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'config');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const sizeStatus = async () => {
    const result = await check({ cwd: project });
    if (result.kind !== 'report') throw new Error('expected a report');
    return {
      status: result.report.structural.checks.find((c) => c.id === 'knowledge-size')!.status,
      hasFail: result.hasFail,
    };
  };

  it('fails knowledge-size (and so --strict) when the over-budget README grows, and warns again once reverted', async () => {
    write(README, `${'A'.repeat(399)}\n${'B'.repeat(40)}\n`);
    expect(await sizeStatus()).toEqual({ status: 'fail', hasFail: true });
    write(README, `${'A'.repeat(399)}\n`);
    expect((await sizeStatus()).status).toBe('warn');
  });
});
