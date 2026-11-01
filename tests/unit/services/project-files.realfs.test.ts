import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateRawScan } from '../../../src/services/raw-scan.service.js';
import { updateModuleReadme } from '../../../src/services/knowledge-update.service.js';
import { ScanError } from '../../../src/types/errors.js';
import { toInlineCodeSpan } from '../../../src/lib/markdown-fences.js';

vi.setConfig({ testTimeout: 30_000 });

vi.mock('../../../src/lib/bundled-templates.js', () => ({ BUNDLED_TEMPLATES: {} }));

let root: string;
let cwd: string;
function write(file: string, content = ''): void {
  const target = path.join(cwd, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}
function git(...args: string[]): Buffer {
  return execFileSync('git', args, { cwd });
}
function setup(project: string): void {
  cwd = root;
  git('init', '-q');
  cwd = path.join(root, project);
  mkdirSync(cwd, { recursive: true });
  write('.prospec.yaml', 'project:\n  name: index-services\n');
  write('.gitignore', '**/node_modules/\n**/__pycache__/\n');
  write('src/main.ts', 'export const main = true;\n');
  write('src/new.ts', 'export const staged = true;\n');
  write('src/.hidden/file.ts');
  write('build/output.ts');
  write('dist/output.ts');
  write('a/b/c/d/e/f/g/h/i/j/k/deep.ts');
  write('.env', 'secret');
  git('add', '.');
  write('src/untracked.ts');
  write('src/nested/node_modules/cache.ts');
  write('src/nested/__pycache__/cache.py');
}
function readme(module = 'demo'): string {
  return readFileSync(path.join(cwd, `prospec/ai-knowledge/modules/${module}/README.md`), 'utf-8');
}
function skeleton(paths: string[], warnings: string[] = [], module = 'demo') {
  return updateModuleReadme(module, paths, { cwd, knowledgeBasePath: 'prospec/ai-knowledge', warnings });
}

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'prospec-index-services-'));
  cwd = root;
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe.each(['', 'pkg'])('services in project %j', (project) => {
  beforeEach(() => setup(project));

  it('raw scan equals project-relative index members minus exclusions regardless of tree depth', async () => {
    const expected = git('ls-files', '-z', '--cached').toString().split('\0').filter((f) => f && f !== '.env').sort();
    const shallow = await generateRawScan({ cwd, depth: 1 });
    const deep = await generateRawScan({ cwd, depth: 20, dryRun: true });
    expect(shallow.files).toEqual(expected);
    expect(deep.files).toEqual(expected);
    expect(shallow.totalFiles).toBe(expected.length);
    expect(deep.totalFiles).toBe(expected.length);
    const tree = readFileSync(path.join(cwd, shallow.outputFile!), 'utf-8').split('## Directory Tree')[1]?.split('```')[1];
    expect(tree).toBeDefined();
    expect(tree).toContain('a/');
    expect(tree).not.toContain('  b/');
    expect(shallow.files).toContain('a/b/c/d/e/f/g/h/i/j/k/deep.ts');
  });

  it('skeleton folder and single-file scopes contain only staged index members', async () => {
    const warnings: string[] = [];
    await skeleton(['src'], warnings);
    const rows = readme().split('## Key Files')[1]!.split('## Public API')[0]!;
    expect(rows).toContain('`src/main.ts`');
    expect(rows).toContain('`src/new.ts`');
    expect(rows).toContain('`src/.hidden/file.ts`');
    expect(rows).not.toContain('untracked');
    expect(rows).not.toContain('node_modules');
    expect(rows).not.toContain('__pycache__');
    expect(warnings).toEqual([]);
    await skeleton(['src/main.ts'], [], 'single');
    const singleRows = readme('single').split('## Key Files')[1]!.split('## Public API')[0]!;
    expect(singleRows).toContain('`src/main.ts`');
    expect(singleRows).not.toContain('src/new.ts');
  });

  it('distinguishes refused paths, no index members and members wholly excluded', async () => {
    const refused: string[] = [];
    await skeleton(['../escape'], refused, 'refused');
    expect(refused).toEqual(["module 'refused': every module path is unsupported — see the unsupported-module-path check"]);
    const empty: string[] = [];
    await skeleton(['src/untracked.ts'], empty, 'empty');
    expect(empty).toEqual(["module 'empty': no git index member under the module paths — git add new files, delete the skeleton and re-run"]);
    const excluded: string[] = [];
    await updateModuleReadme('excluded', ['src/main.ts'], { cwd, knowledgeBasePath: 'prospec/ai-knowledge', excludePatterns: ['src/main.ts'], warnings: excluded });
    expect(excluded).toEqual([]);
    expect(readme('excluded')).not.toContain('`src/main.ts`');
    rmSync(path.join(cwd, 'src/new.ts'));
    const deleted: string[] = [];
    await skeleton(['src/new.ts'], deleted, 'deleted');
    expect(deleted).toEqual(["module 'deleted': no index member under the module paths is a regular file in the work tree (deleted, a symlink, or beneath a symlinked directory) — restore the files, delete the skeleton and re-run"]);
  });

  it('preserves an existing README byte-for-byte without emitting scan warnings', async () => {
    const content = '# curated\n\n<!-- prospec:auto-start -->\nauthored\n<!-- prospec:auto-end -->\n';
    write('prospec/ai-knowledge/modules/demo/README.md', content);
    const warnings: string[] = [];
    expect(await skeleton(['../escape'], warnings)).toBeNull();
    expect(readme()).toBe(content);
    expect(warnings).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')('raw scan renders LF/CR directory names visibly in the tree', async () => {
    const file = 'src/dir\n```\r/name`\n.ts';
    write(file);
    git('add', '--', file);
    const result = await generateRawScan({ cwd });
    expect(result.files).toContain(file);
    const raw = readFileSync(path.join(cwd, result.outputFile!), 'utf-8');
    const tree = raw.match(/## Directory Tree\n\n```[^\n]*\n([\s\S]*?)\n```/)?.[1];
    expect(tree).toBeDefined();
    expect(tree).toContain('dir\\n');
    expect(raw).toContain('dir\\n```\\r/');
    expect(raw).not.toContain('dir\n```\r/');
  });

  it.skipIf(process.platform === 'win32')('skeleton safely spans key files and export names containing LF and backticks', async () => {
    const file = 'src/dir\n```\r/name`\n.ts';
    write(file);
    git('add', '--', file);
    await skeleton([file]);
    expect(readme()).toContain(`| ${toInlineCodeSpan(file)} | TypeScript source |`);
    expect(readme()).toContain(`- ${toInlineCodeSpan('name`\n')} — TypeScript source`);
    expect(readme()).not.toContain(file);
  });
});

describe.each(['non-work-tree', 'bare'])('%s service failures', (kind) => {
  beforeEach(() => {
    if (kind === 'bare') git('init', '--bare', '-q');
    write('.prospec.yaml', 'project:\n  name: unavailable\n');
  });
  it('raw scan throws ScanError and leaves an existing snapshot untouched', async () => {
    write('prospec/ai-knowledge/raw-scan.md', 'preserve snapshot\n');
    const error = await generateRawScan({ cwd }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ScanError);
    expect((error as Error).message).toContain('git index unavailable: ');
    expect(readFileSync(path.join(cwd, 'prospec/ai-knowledge/raw-scan.md'), 'utf-8')).toBe('preserve snapshot\n');
  });
  it('raw scan does not create a new snapshot', async () => {
    await expect(generateRawScan({ cwd })).rejects.toBeInstanceOf(ScanError);
    expect(existsSync(path.join(cwd, 'prospec/ai-knowledge/raw-scan.md'))).toBe(false);
  });
  it('creates an empty skeleton and reports the module and index failure', async () => {
    const warnings: string[] = [];
    await skeleton(['src'], warnings);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("module 'demo': Key Files left empty");
    expect(warnings[0]).toContain('git index unavailable: ');
    const rows = readme().split('## Key Files')[1]!.split('## Public API')[0]!;
    expect(rows.trim().split('\n')).toHaveLength(2);
  });
});

describe.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('uninspectable indexed members', () => {
  it.each(['raw scan', 'skeleton'])('%s identifies the inaccessible path', async (kind) => {
    setup('');
    write('blocked/member.ts');
    git('add', 'blocked/member.ts');
    chmodSync(path.join(cwd, 'blocked'), 0o000);
    try {
      if (kind === 'raw scan') {
        const error = await generateRawScan({ cwd }).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ScanError);
        expect((error as Error).message).toContain('blocked');
        expect(existsSync(path.join(cwd, 'prospec/ai-knowledge/raw-scan.md'))).toBe(false);
      } else {
        const warnings: string[] = [];
        await skeleton(['blocked'], warnings);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("module 'demo': Key Files left empty");
        expect(warnings[0]).toContain('blocked');
      }
    } finally {
      chmodSync(path.join(cwd, 'blocked'), 0o755);
    }
  });
});
