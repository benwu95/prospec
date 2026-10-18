import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as childProcess from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GIT_ID } from '../../helpers/git-fixture.js';
import { usePrivateTmpdir } from '../../helpers/private-tmpdir.js';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFileSync: vi.fn(actual.execFileSync) };
});
vi.mock('../../../src/lib/fs-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/fs-utils.js')>();
  return { ...actual, captureFileInputs: vi.fn(actual.captureFileInputs), atomicWrite: vi.fn(actual.atomicWrite) };
});

const { syncGitignoreBlock } = await import('../../../src/lib/gitignore-block.js');
const fsUtils = await import('../../../src/lib/fs-utils.js');
const actualFsUtils = await vi.importActual<typeof import('../../../src/lib/fs-utils.js')>('../../../src/lib/fs-utils.js');

vi.setConfig({ testTimeout: 30_000 });

const root = usePrivateTmpdir('gitignore-block');
const execFileSync = vi.mocked(childProcess.execFileSync);
const realExecFileSync = (await vi.importActual<typeof import('node:child_process')>('node:child_process')).execFileSync;

const ISOLATION = ['HOME', 'XDG_CONFIG_HOME', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM'] as const;
const savedEnv = ISOLATION.map((name) => [name, process.env[name]] as const);
const home = path.join(root, 'home');
const globalConfig = path.join(home, 'global.gitconfig');

beforeAll(() => {
  mkdirSync(path.join(home, 'xdg'), { recursive: true });
  writeFileSync(globalConfig, '');
  process.env['HOME'] = home;
  process.env['XDG_CONFIG_HOME'] = path.join(home, 'xdg');
  process.env['GIT_CONFIG_GLOBAL'] = globalConfig;
  process.env['GIT_CONFIG_NOSYSTEM'] = '1';
});
afterAll(() => {
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});
afterEach(() => {
  execFileSync.mockImplementation(realExecFileSync);
  writeFileSync(globalConfig, '');
  rmSync(path.join(home, 'xdg', 'git'), { recursive: true, force: true });
});

const SKILL_FILES = [
  '.claude/skills/prospec-plan/SKILL.md',
  '.claude/skills/prospec-plan/references/a.md',
  '.claude/skills/prospec-tasks/SKILL.md',
];
const OTHER_FILES = [
  '.claude/settings.json',
  '.claude/agents/reviewer.md',
  '.claude/skills/mine/SKILL.md',
  '.claude/skills/prospec-plan/notes.txt',
  '.claude/skills/prospec-plan/references/r.txt',
  '.claude/skills/prospec-plan/build/b.txt',
  'packages/a/.claude/settings.json',
];
const LOCAL = ['.prospec/changes/c/proposal.md', '.prospec/archive/a.md', 'prospec-report.json'];
const START = '# prospec:auto-start';
const END = '# prospec:auto-end';

let counter = 0;
function makeRepo(rules?: string, { git = true }: { git?: boolean } = {}): string {
  const repo = realpathSync(mkdtempSync(path.join(root, `repo-${counter++}-`)));
  if (git) realExecFileSync('git', [...GIT_ID, 'init', '-q'], { cwd: repo, stdio: 'pipe' });
  for (const file of [...SKILL_FILES, ...OTHER_FILES, ...LOCAL]) touch(repo, file);
  if (rules !== undefined) writeFileSync(path.join(repo, '.gitignore'), rules);
  return repo;
}

function touch(dir: string, file: string, content = ''): void {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), content);
}

function input(cwd: string, skillPaths: string[] = ['.claude/skills'], skillFiles: string[] = ['SKILL.md', 'references/a.md']) {
  return { cwd, skillPaths, skillNames: ['prospec-plan', 'prospec-tasks'], skillFiles };
}

/** Paths the repository's own rules ignore. */
function ignoredSet(repo: string, paths: string[]): Set<string> {
  let out: string;
  try {
    out = realExecFileSync('git', ['check-ignore', '--stdin', '-z', '-v', '--non-matching', '--no-index'], {
      cwd: repo, input: paths.map((p) => `${p}\0`).join(''), stdio: 'pipe',
    }).toString();
  } catch (err) {
    out = (err as { stdout: Buffer }).stdout.toString();
  }
  const fields = out.split('\0');
  const ignored = new Set<string>();
  for (let i = 0; i + 3 < fields.length; i += 4) {
    if (fields[i + 2] !== '' && !fields[i + 2]!.startsWith('!')) ignored.add(fields[i + 3]!);
  }
  return ignored;
}

function gitignore(repo: string): string {
  return readFileSync(path.join(repo, '.gitignore'), 'utf8');
}

function blockOf(text: string): string[] {
  return text.slice(text.indexOf(START), text.indexOf(END) + END.length).split(/\r?\n/);
}

function paste(repo: string, lines: string[]): void {
  writeFileSync(path.join(repo, '.gitignore'), `${gitignore(repo)}${lines.join('\n')}\n`);
}

describe('syncGitignoreBlock — the write step', () => {
  it('creates an absent .gitignore holding only the block, then reports unchanged without writing', async () => {
    const repo = makeRepo();
    expect(await syncGitignoreBlock(input(repo))).toEqual({ status: 'created', warnings: [], suggestedLines: [] });
    expect(gitignore(repo).startsWith(`${START}\n`)).toBe(true);
    expect(gitignore(repo).endsWith(`${END}\n`)).toBe(true);
    const mtime = statSync(path.join(repo, '.gitignore')).mtimeMs;
    expect(await syncGitignoreBlock(input(repo))).toEqual({ status: 'unchanged', warnings: [], suggestedLines: [] });
    expect(statSync(path.join(repo, '.gitignore')).mtimeMs).toBe(mtime);
  });

  it('writes the expected fixed block, whatever the existing rules say', async () => {
    const plain = makeRepo('.claude/\n');
    await syncGitignoreBlock(input(plain, ['.claude/skills', '.agents/skills']));
    const expected = [
      START,
      '/.prospec/*',
      '/prospec-report.json',
      '!/.claude/skills/prospec-*/',
      '!/.claude/skills/prospec-*/references/',
      '!/.claude/skills/prospec-*/*.md',
      '!/.claude/skills/prospec-*/references/*.md',
      '!/.agents/skills/prospec-*/',
      '!/.agents/skills/prospec-*/references/',
      '!/.agents/skills/prospec-*/*.md',
      '!/.agents/skills/prospec-*/references/*.md',
      END,
    ];
    expect(blockOf(gitignore(plain))).toEqual(expected);
    const other = makeRepo('*.md\n');
    await syncGitignoreBlock(input(other, ['.claude/skills', '.agents/skills']));
    expect(blockOf(gitignore(other))).toEqual(expected);
  });

  it('writes only the block into an empty .gitignore', async () => {
    const repo = makeRepo('');
    expect((await syncGitignoreBlock(input(repo))).status).toBe('updated');
    expect(gitignore(repo).startsWith(`${START}\n`)).toBe(true);
  });

  it('adds the missing final newline before appending, and no blank line when one is there', async () => {
    const without = makeRepo('node_modules/\n# keep me');
    await syncGitignoreBlock(input(without));
    expect(gitignore(without).startsWith(`node_modules/\n# keep me\n${START}\n`)).toBe(true);
    const withNewline = makeRepo('node_modules/\n');
    await syncGitignoreBlock(input(withNewline));
    expect(gitignore(withNewline).startsWith(`node_modules/\n${START}\n`)).toBe(true);
  });

  it('replaces only the lines between the markers, keeping the content before and after in place', async () => {
    const repo = makeRepo(`a/\n${START}\n/stale\n${END}\nafter/\n`);
    expect((await syncGitignoreBlock(input(repo))).status).toBe('updated');
    expect(gitignore(repo).startsWith(`a/\n${START}\n/.prospec/*\n`)).toBe(true);
    expect(gitignore(repo).endsWith(`${END}\nafter/\n`)).toBe(true);
    expect(gitignore(repo)).not.toContain('/stale');
  });

  it('uses CRLF when every line break is CRLF, and LF otherwise', async () => {
    const crlf = makeRepo(`a/\r\n${START}\r\n/stale\r\n${END}\r\n`);
    await syncGitignoreBlock(input(crlf));
    expect(gitignore(crlf).match(/# prospec:auto-start/g)).toHaveLength(1);
    expect(gitignore(crlf)).toContain('/.prospec/*\r\n/prospec-report.json\r\n');
    const mixed = makeRepo('\na/\r\n');
    await syncGitignoreBlock(input(mixed));
    expect(gitignore(mixed)).toContain(`${START}\n/.prospec/*\n`);
  });

  it('rewrites a block the user deleted and reports updated', async () => {
    const repo = makeRepo('a/\n');
    await syncGitignoreBlock(input(repo));
    writeFileSync(path.join(repo, '.gitignore'), 'a/\n');
    expect((await syncGitignoreBlock(input(repo))).status).toBe('updated');
    expect(gitignore(repo)).toContain(START);
  });

  it('computes the same block whatever order the skill files arrive in, with no pattern for an extension-less file', async () => {
    const one = makeRepo();
    await syncGitignoreBlock({ ...input(one), skillFiles: ['SKILL.md', 'references/a.md', 'scripts/deep/c.md', 'references/b.json', 'NOTICE'] });
    const two = makeRepo();
    await syncGitignoreBlock({ ...input(two), skillFiles: ['scripts/deep/c.md', 'references/b.json', 'NOTICE', 'references/a.md', 'SKILL.md'] });
    expect(blockOf(gitignore(two))).toEqual(blockOf(gitignore(one)));
    expect(blockOf(gitignore(one)).filter((l) => l.startsWith('!') && l.endsWith('/*'))).toEqual([]);
    expect(blockOf(gitignore(one))).toContain('!/.claude/skills/prospec-*/references/*.json');
  });

  it('writes a shared skill path once, and treats trailing slashes as the same path', async () => {
    const one = makeRepo();
    await syncGitignoreBlock(input(one, ['.agents/skills']));
    const shared = makeRepo();
    await syncGitignoreBlock(input(shared, ['.agents/skills', '.agents/skills//']));
    expect(blockOf(gitignore(shared))).toEqual(blockOf(gitignore(one)));
  });

  it('lists nested skill subdirectories parent first', async () => {
    const repo = makeRepo();
    await syncGitignoreBlock({ ...input(repo), skillFiles: ['SKILL.md', 'references/deep/x.md'] });
    const block = blockOf(gitignore(repo));
    expect(block.indexOf('!/.claude/skills/prospec-*/references/')).toBeLessThan(block.indexOf('!/.claude/skills/prospec-*/references/deep/'));
  });

  it.each([
    ['a duplicated start marker', `${START}\n${START}\n${END}\n`],
    ['a duplicated end marker', `${START}\n${END}\n${END}\n`],
    ['a lone start marker', `a/\n${START}\n`],
    ['a lone end marker', `a/\n${END}\n`],
    ['an end marker before the start marker', `${END}\n${START}\n`],
  ])('skips %s without writing', async (_label, rules) => {
    const repo = makeRepo(rules);
    const result = await syncGitignoreBlock(input(repo));
    expect(result.status).toBe('skipped');
    expect(result.warnings).toContain('.gitignore not updated: its managed-block markers are malformed — expected one start marker followed by one end marker');
    expect(gitignore(repo)).toBe(rules);
  });

  it('skips a .gitignore that is not valid UTF-8', async () => {
    const repo = makeRepo();
    const bytes = Buffer.from([0x61, 0x2f, 0x0a, 0xff, 0xfe, 0x0a]);
    writeFileSync(path.join(repo, '.gitignore'), bytes);
    const result = await syncGitignoreBlock(input(repo));
    expect(result.status).toBe('skipped');
    expect(result.warnings).toContain('.gitignore not updated: it is not valid UTF-8, or it changed while being read');
    expect(readFileSync(path.join(repo, '.gitignore')).equals(bytes)).toBe(true);
  });

  it('skips a .gitignore that is a directory', async () => {
    const repo = makeRepo();
    mkdirSync(path.join(repo, '.gitignore'));
    expect((await syncGitignoreBlock(input(repo))).warnings).toContain('.gitignore not updated: it is not a regular file');
  });

  it.skipIf(process.platform === 'win32')('skips a .gitignore that is a symbolic link, leaving its target alone', async () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo, 'shared-ignore'), 'a/\n');
    symlinkSync('shared-ignore', path.join(repo, '.gitignore'));
    expect((await syncGitignoreBlock(input(repo))).warnings).toContain('.gitignore not updated: it is a symbolic link');
    expect(readFileSync(path.join(repo, 'shared-ignore'), 'utf8')).toBe('a/\n');
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('skips an unreadable .gitignore without throwing', async () => {
    const repo = makeRepo('a/\n');
    chmodSync(path.join(repo, '.gitignore'), 0o000);
    try {
      const result = await syncGitignoreBlock(input(repo));
      expect(result.status).toBe('skipped');
      expect(result.warnings.some((w) => w.startsWith('.gitignore not updated: it cannot be read'))).toBe(true);
    } finally {
      chmodSync(path.join(repo, '.gitignore'), 0o644);
    }
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('skips a .gitignore that cannot be inspected, and still returns', async () => {
    const repo = makeRepo('a/\n');
    chmodSync(repo, 0o600);
    try {
      const result = await syncGitignoreBlock(input(repo));
      expect(result.status).toBe('skipped');
      expect(result.warnings[0]).toMatch(/^\.gitignore not updated: EACCES/);
    } finally {
      chmodSync(repo, 0o755);
    }
    expect(gitignore(repo)).toBe('a/\n');
  });

  it('skips when the file changed between the read and the write', async () => {
    const repo = makeRepo('a/\n');
    vi.mocked(fsUtils.captureFileInputs).mockImplementationOnce((paths) => ({ ...actualFsUtils.captureFileInputs(paths), recheck: () => false }));
    const result = await syncGitignoreBlock(input(repo));
    expect(result.status).toBe('skipped');
    expect(result.warnings).toContain('.gitignore not updated: it changed between the read and the write');
    expect(gitignore(repo)).toBe('a/\n');
  });

  it('skips when the write fails, and does not throw', async () => {
    const repo = makeRepo('a/\n');
    vi.mocked(fsUtils.atomicWrite).mockRejectedValueOnce(new Error('disk full'));
    const result = await syncGitignoreBlock(input(repo));
    expect(result.status).toBe('skipped');
    expect(result.warnings).toContain('.gitignore not updated: it cannot be written (disk full)');
    expect(gitignore(repo)).toBe('a/\n');
  });

  it('leaves no temporary file behind', async () => {
    const repo = makeRepo('a/\n');
    await syncGitignoreBlock(input(repo));
    expect(readdirSync(repo).filter((name) => name.startsWith('.gitignore.tmp'))).toEqual([]);
  });

  it.each([
    ['inside a repository', true],
    ['outside a repository', false],
  ])('treats a regular file in place of a skill path ancestor as absent %s', async (_label, git) => {
    const dir = makeRepo('a/\n', { git });
    writeFileSync(path.join(dir, '.agents'), 'not a directory\n');
    const result = await syncGitignoreBlock(input(dir, ['.claude/skills', '.agents/skills']));
    expect(result.status).toBe('updated');
    expect(result.warnings.filter((w) => w.startsWith('could not'))).toEqual([]);
  });
});

describe('syncGitignoreBlock — warnings and suggested lines for project rules', () => {
  it('ignores the local artifacts (US-1.1)', async () => {
    const repo = makeRepo();
    await syncGitignoreBlock(input(repo));
    expect([...ignoredSet(repo, LOCAL)].sort()).toEqual([...LOCAL].sort());
  });

  it('re-includes skill files a file-name rule before the block excludes (US-2.1)', async () => {
    const repo = makeRepo('*.md\n');
    const result = await syncGitignoreBlock(input(repo));
    expect(result.warnings).toEqual([]);
    expect(ignoredSet(repo, SKILL_FILES).size).toBe(0);
  });

  it.each([
    ['.claude/ before the block', '.claude/\n', ''],
    ['.claude/skills/ before the block', '.claude/skills/\n', ''],
    ['.claude/skills/* after the block', '', '.claude/skills/*\n'],
    ['one skill directory after the block', '', '.claude/skills/prospec-plan/\n'],
    ['a skill directory without the references the others have, after the block', '', '.claude/skills/prospec-tasks/\n'],
    ['one references directory after the block', '', '.claude/skills/prospec-plan/references/\n'],
    ['*.md after the block', '', '*.md\n'],
  ])('warns and suggests lines for %s, which re-include the skills when pasted at the end (US-2.2)', async (_label, before, after) => {
    const repo = makeRepo(before);
    await syncGitignoreBlock(input(repo));
    if (after) writeFileSync(path.join(repo, '.gitignore'), `${gitignore(repo)}${after}`);
    const result = await syncGitignoreBlock(input(repo));
    expect(result.warnings.some((w) => w.includes(' still ignored by .gitignore:'))).toBe(true);
    expect(result.suggestedLines.length).toBeGreaterThan(0);
    const others = OTHER_FILES.filter((f) => f.startsWith('.claude/') && !f.includes('/prospec-'));
    const othersBefore = ignoredSet(repo, others);
    paste(repo, result.suggestedLines);
    expect(ignoredSet(repo, SKILL_FILES).size).toBe(0);
    expect(ignoredSet(repo, others)).toEqual(othersBefore);
  });

  it('suggests only the block lines for the skill path when the rule excludes no directory', async () => {
    const repo = makeRepo('');
    await syncGitignoreBlock(input(repo));
    writeFileSync(path.join(repo, '.gitignore'), `${gitignore(repo)}*.md\n`);
    const result = await syncGitignoreBlock(input(repo));
    expect(result.suggestedLines).toEqual([
      '!/.claude/skills/prospec-*/',
      '!/.claude/skills/prospec-*/references/',
      '!/.claude/skills/prospec-*/*.md',
      '!/.claude/skills/prospec-*/references/*.md',
    ]);
  });

  it.each([
    ['.claude/skills/*', '.claude/skills/*\n'],
    ['one skill directory', '.claude/skills/prospec-plan/\n'],
  ])('does not warn about %s before the block, which the block re-includes', async (_label, rules) => {
    const repo = makeRepo(rules);
    const result = await syncGitignoreBlock(input(repo));
    expect(result.warnings).toEqual([]);
    expect(ignoredSet(repo, SKILL_FILES).size).toBe(0);
  });

  it('suggests lines for every skill path one rule excludes, which re-include them all when pasted', async () => {
    const repo = makeRepo('skills/\n');
    touch(repo, '.agents/skills/prospec-plan/SKILL.md');
    const result = await syncGitignoreBlock(input(repo, ['.claude/skills', '.agents/skills']));
    paste(repo, result.suggestedLines);
    expect(ignoredSet(repo, [...SKILL_FILES, '.agents/skills/prospec-plan/SKILL.md']).size).toBe(0);
  });

  it('merges two rules on one skill path into suggested lines that keep each re-include ahead of its files', async () => {
    const repo = makeRepo('');
    await syncGitignoreBlock(input(repo));
    writeFileSync(path.join(repo, '.gitignore'), `${gitignore(repo)}.claude/skills/prospec-plan/references/\n.claude/skills/prospec-tasks/\n`);
    const result = await syncGitignoreBlock(input(repo));
    expect(result.warnings).toHaveLength(2);
    paste(repo, result.suggestedLines);
    expect(ignoredSet(repo, SKILL_FILES).size).toBe(0);
  });

  it('names the skill directories as prospec-* in the suggested lines', async () => {
    const repo = makeRepo('');
    await syncGitignoreBlock(input(repo));
    writeFileSync(path.join(repo, '.gitignore'), `${gitignore(repo)}.claude/skills/prospec-plan/references/\n`);
    expect((await syncGitignoreBlock(input(repo))).suggestedLines).toEqual([
      '!/.claude/skills/prospec-*/references/',
      '/.claude/skills/prospec-*/references/*',
      '!/.claude/skills/prospec-*/',
      '!/.claude/skills/prospec-*/references/',
      '!/.claude/skills/prospec-*/*.md',
      '!/.claude/skills/prospec-*/references/*.md',
    ]);
  });

  it('suggests no lines for a skill path the rule leaves alone', async () => {
    const repo = makeRepo('.claude/\n');
    touch(repo, '.agents/skills/prospec-plan/SKILL.md');
    const result = await syncGitignoreBlock(input(repo, ['.claude/skills', '.agents/skills']));
    expect(result.suggestedLines.length).toBeGreaterThan(0);
    expect(result.suggestedLines.filter((l) => l.includes('.agents'))).toEqual([]);
  });

  it('warns about nothing when no skill file exists, even under a catch-all rule', async () => {
    const repo = makeRepo('a/\n');
    writeFileSync(path.join(repo, '.git/info/exclude'), '*\n');
    expect(await syncGitignoreBlock({ ...input(repo), skillNames: ['prospec-absent'] })).toEqual({ status: 'updated', warnings: [], suggestedLines: [] });
  });

  it('changes no non-prospec path in the agent directory when no rule affects it (US-2.3)', async () => {
    const repo = makeRepo('.DS_Store\n');
    const agentOthers = OTHER_FILES.filter((f) => f.startsWith('.claude/'));
    const before = ignoredSet(repo, agentOthers);
    await syncGitignoreBlock(input(repo));
    expect(ignoredSet(repo, agentOthers)).toEqual(before);
  });

  it('warns once per rule, counting only skill files, and names a lone file without a count', async () => {
    const many = makeRepo('a/\n');
    writeFileSync(path.join(many, '.git/info/exclude'), '.claude/\n');
    expect((await syncGitignoreBlock(input(many))).warnings).toEqual([
      '.claude/skills/prospec-plan/SKILL.md and 2 more skill file(s) still ignored by .git/info/exclude:1 (.claude/)',
    ]);
    const one = makeRepo('a/\n');
    touch(one, '.claude/skills/.gitignore', 'prospec-tasks/SKILL.md\n');
    expect((await syncGitignoreBlock(input(one))).warnings).toEqual([
      '.claude/skills/prospec-tasks/SKILL.md still ignored by .claude/skills/.gitignore:1 (prospec-tasks/SKILL.md)',
    ]);
  });
});

describe('syncGitignoreBlock — rules from other sources and edge cases', () => {
  const personalIgnore = path.join(root, 'personal-ignore');
  beforeAll(() => writeFileSync(personalIgnore, '.claude/\n'));

  it.each([
    ['.git/info/exclude', (repo: string) => writeFileSync(path.join(repo, '.git/info/exclude'), '.claude/\n')],
    ['core.excludesFile', () => writeFileSync(globalConfig, `[core]\n\texcludesFile = ${personalIgnore}\n`)],
    ['the default global excludes file', () => touch(path.join(home, 'xdg'), 'git/ignore', '.claude/\n')],
  ])('warns without suggesting lines when %s excludes the skills', async (_label, setup) => {
    const repo = makeRepo('a/\n');
    setup(repo);
    const result = await syncGitignoreBlock(input(repo));
    expect(result.warnings.some((w) => w.includes('still ignored by'))).toBe(true);
    expect(result.suggestedLines).toEqual([]);
  });

  it('warns without suggesting lines for a rule in a parent directory', async () => {
    const repo = makeRepo('.claude/\n');
    const project = path.join(repo, 'pkg');
    for (const file of SKILL_FILES) touch(project, file);
    const result = await syncGitignoreBlock(input(project));
    expect(result.warnings.some((w) => w.includes('still ignored by ../.gitignore:1 (.claude/)'))).toBe(true);
    expect(result.suggestedLines).toEqual([]);
  });

  it('warns without suggesting lines when a parent rule excludes the project itself', async () => {
    const repo = makeRepo('pkg/\n');
    const project = path.join(repo, 'pkg');
    for (const file of SKILL_FILES) touch(project, file);
    const result = await syncGitignoreBlock(input(project));
    expect(result.warnings.some((w) => w.includes('still ignored by ../.gitignore:1 (pkg/)'))).toBe(true);
    expect(result.suggestedLines).toEqual([]);
  });

  it('suggests lines for a rule in the .gitignore of a project in a repository subdirectory', async () => {
    const repo = makeRepo('a/\n');
    const project = path.join(repo, 'pkg');
    for (const file of SKILL_FILES) touch(project, file);
    writeFileSync(path.join(project, '.gitignore'), '.claude/\n');
    const result = await syncGitignoreBlock(input(project));
    // Sources are named from the project directory, the base of the skill paths and of `.gitignore`.
    expect(result.warnings.map((w) => w.slice(w.indexOf(' by ') + 4))).toEqual(['.gitignore:1 (.claude/)']);
    expect(result.suggestedLines.length).toBeGreaterThan(0);
    paste(project, result.suggestedLines);
    expect(ignoredSet(project, SKILL_FILES).size).toBe(0);
  });

  it('names a nested .gitignore from a project in a repository subdirectory', async () => {
    const repo = makeRepo('a/\n');
    const project = path.join(repo, 'pkg');
    for (const file of SKILL_FILES) touch(project, file);
    touch(project, '.claude/skills/prospec-tasks/.gitignore', 'SKILL.md\n');
    const result = await syncGitignoreBlock(input(project));
    expect(result.warnings).toEqual(['.claude/skills/prospec-tasks/SKILL.md still ignored by .claude/skills/prospec-tasks/.gitignore:1 (SKILL.md)']);
    expect(result.suggestedLines).toEqual([]);
  });

  it('names .git/info/exclude from a project in a repository subdirectory', async () => {
    const repo = makeRepo('a/\n');
    const project = path.join(repo, 'pkg');
    for (const file of SKILL_FILES) touch(project, file);
    writeFileSync(path.join(repo, '.git/info/exclude'), '.claude/\n');
    const result = await syncGitignoreBlock(input(project));
    expect(result.warnings.some((w) => w.endsWith('still ignored by ../.git/info/exclude:1 (.claude/)'))).toBe(true);
    expect(result.suggestedLines).toEqual([]);
  });

  it('warns without suggesting lines for a nested .gitignore, leaving it untouched', async () => {
    const repo = makeRepo('a/\n');
    touch(repo, '.claude/skills/.gitignore', '*\n');
    const result = await syncGitignoreBlock(input(repo));
    expect(result.warnings.some((w) => w.includes('still ignored by .claude/skills/.gitignore:1 (*)'))).toBe(true);
    expect(result.suggestedLines).toEqual([]);
    expect(readFileSync(path.join(repo, '.claude/skills/.gitignore'), 'utf8')).toBe('*\n');
  });

  it('gives no suggestion for an outer repository rule when the project has an empty .git directory', async () => {
    const repo = makeRepo('.claude/\n');
    const project = path.join(repo, 'pkg');
    for (const file of SKILL_FILES) touch(project, file);
    mkdirSync(path.join(project, '.git'));
    const result = await syncGitignoreBlock(input(project));
    expect(result.suggestedLines).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')('suggests lines when the project path reaches the repository through a symbolic link', async () => {
    const repo = makeRepo('.claude/\n');
    const link = path.join(root, `link-${counter++}`);
    symlinkSync(repo, link);
    const result = await syncGitignoreBlock(input(link));
    expect(result.suggestedLines.length).toBeGreaterThan(0);
  });

  it('still checks and warns when the write step skips', async () => {
    const repo = makeRepo(`.claude/\n${START}\n`);
    const result = await syncGitignoreBlock(input(repo));
    expect(result.status).toBe('skipped');
    expect(result.warnings.some((w) => w.includes('still ignored by .gitignore:1 (.claude/)'))).toBe(true);
  });

  it('reports only the skip reason when the block is not written and no rule matches a skill file', async () => {
    const repo = makeRepo(`${START}\n`);
    expect(await syncGitignoreBlock(input(repo))).toEqual({
      status: 'skipped',
      warnings: ['.gitignore not updated: its managed-block markers are malformed — expected one start marker followed by one end marker'],
      suggestedLines: [],
    });
  });

  it('runs the repository probe in the C locale, so a translated git still reads as no repository', async () => {
    const dir = makeRepo('a/\n', { git: false });
    execFileSync.mockClear();
    await syncGitignoreBlock(input(dir));
    const probe = execFileSync.mock.calls.find(([, args]) => (args as string[]).includes('rev-parse'));
    expect((probe?.[2] as { env?: NodeJS.ProcessEnv } | undefined)?.env?.['LC_ALL']).toBe('C');
  });

  it('skips the check silently outside a repository', async () => {
    const dir = makeRepo('.claude/\n', { git: false });
    expect(await syncGitignoreBlock(input(dir))).toEqual({ status: 'updated', warnings: [], suggestedLines: [] });
  });

  it('warns when git refuses the repository for a reason other than its absence', async () => {
    const dir = makeRepo('a/\n', { git: false });
    writeFileSync(path.join(dir, '.git'), 'not a gitfile\n');
    const result = await syncGitignoreBlock(input(dir));
    expect(result.status).toBe('updated');
    expect(result.warnings.some((w) => w.startsWith('could not check the skill files'))).toBe(true);
  });

  it('keeps the write status and warns when git cannot run', async () => {
    const repo = makeRepo('a/\n');
    const saved = process.env['PATH'];
    process.env['PATH'] = path.join(root, 'no-git-here');
    const result = await syncGitignoreBlock(input(repo)).finally(() => { process.env['PATH'] = saved; });
    expect(result.status).toBe('updated');
    expect(result.warnings.some((w) => w.startsWith('could not check the skill files'))).toBe(true);
  });

  it('keeps the write status and warns when the check fails', async () => {
    const repo = makeRepo('a/\n');
    execFileSync.mockImplementation(((file: string, args: readonly string[], options: { cwd?: string }) => {
      if (args.includes('check-ignore')) throw Object.assign(new Error('check broke'), { status: 128 });
      return realExecFileSync(file, args, options);
    }) as typeof realExecFileSync);
    const result = await syncGitignoreBlock(input(repo));
    expect(result.status).toBe('updated');
    expect(result.warnings).toContain('could not check the skill files against the ignore rules (check broke)');
  });

  it.skipIf(process.platform === 'win32')('warns about a skill path behind a symbolic link and keeps checking the others', async () => {
    const repo = makeRepo('a/\n');
    writeFileSync(path.join(repo, '.git/info/exclude'), '.claude/\n');
    const elsewhere = realpathSync(mkdtempSync(path.join(root, 'elsewhere-')));
    mkdirSync(path.join(repo, '.agents'), { recursive: true });
    symlinkSync(elsewhere, path.join(repo, '.agents/skills'));
    touch(elsewhere, 'prospec-plan/SKILL.md');
    const result = await syncGitignoreBlock(input(repo, ['.claude/skills', '.agents/skills']));
    expect(result.warnings).toContain('.agents/skills is a symbolic link: git does not follow it to the skill files under it');
    expect(result.warnings.some((w) => w.includes('still ignored by .git/info/exclude:1'))).toBe(true);
  });
});
