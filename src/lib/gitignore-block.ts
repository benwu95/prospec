/**
 * The `.gitignore` managed block (REQ-LIB-106): ignores prospec's local artifacts
 * and re-includes the shipped `prospec-*` skills.
 *
 * The block's content depends only on the inputs, never on the project's existing
 * rules, so every machine writes the same block. Inside a git work tree the writer
 * then asks git which existing skill files are still ignored and reports each
 * excluding rule; for a rule in `<cwd>/.gitignore` it also suggests lines to append.
 * Every failure becomes `skipped` or a warning — the writer never throws.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DRIFT_REPORT_FILENAME } from '../types/drift-report.js';
import type { GitignoreBlockResult, GitignoreBlockStatus } from '../types/gitignore-block.js';
import { GITIGNORE_AUTO_END, GITIGNORE_AUTO_START } from './content-markers.js';
import { atomicWrite, captureFileInputs } from './fs-utils.js';
import { fixedGitEnv } from './git-read.js';

export interface GitignoreBlockInput {
  cwd: string;
  /** Agent skill directories relative to `cwd`, e.g. `.claude/skills`. */
  skillPaths: readonly string[];
  /** Shipped skill directory names, e.g. `prospec-plan`. */
  skillNames: readonly string[];
  /** Skill files relative to their `prospec-*` directory, e.g. `SKILL.md`, `references/x.md`. */
  skillFiles: readonly string[];
}

const SKILL_DIR_GLOB = 'prospec-*';
const LOCAL_ARTIFACT_PATTERNS = ['/.prospec/*', `/${DRIFT_REPORT_FILENAME}`];
const GIT_TIMEOUT_MS = 30_000;
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

interface ParsedFile {
  /** `null` when the file is absent. */
  text: string | null;
  /** Range of the existing block, end exclusive of the end marker's line break. */
  block: { start: number; end: number } | null;
  eol: string;
}

interface Layout {
  skillPaths: string[];
  /** Directories under a `prospec-*` directory that hold skill files, parent first. */
  subdirs: string[];
  /** Directories (relative to a `prospec-*` directory, `.` for itself) that hold skill files. */
  fileDirs: string[];
  extensions: string[];
}

export async function syncGitignoreBlock(input: GitignoreBlockInput): Promise<GitignoreBlockResult> {
  const layout = describeLayout(input.skillPaths, input.skillFiles);
  let write: { status: GitignoreBlockStatus; warnings: string[] };
  try {
    write = await writeBlock(path.join(input.cwd, '.gitignore'), layout);
  } catch (err) {
    write = { status: 'skipped', warnings: [`.gitignore not updated: ${errorMessage(err)}`] };
  }
  let check: { warnings: string[]; suggestedLines: string[] };
  try {
    check = checkSkillFiles(input.cwd, layout, input.skillNames, input.skillFiles);
  } catch (err) {
    check = { warnings: [`could not check the skill files against the ignore rules (${errorMessage(err)})`], suggestedLines: [] };
  }
  return { status: write.status, warnings: [...write.warnings, ...check.warnings], suggestedLines: check.suggestedLines };
}

async function writeBlock(file: string, layout: Layout): Promise<{ status: GitignoreBlockStatus; warnings: string[] }> {
  const skip = (reason: string) => ({ status: 'skipped' as const, warnings: [`.gitignore not updated: ${reason}`] });

  const kind = lstatKind(file);
  if (kind === 'symlink') return skip('it is a symbolic link');
  if (kind === 'other') return skip('it is not a regular file');

  let capture: ReturnType<typeof captureFileInputs>;
  let text: string | null;
  try {
    capture = captureFileInputs({ gitignore: file });
    text = capture.values['gitignore'] ?? null;
    if (text !== null && !Buffer.from(text).equals(fs.readFileSync(file))) {
      return skip('it is not valid UTF-8, or it changed while being read');
    }
  } catch (err) {
    return skip(`it cannot be read (${errorMessage(err)})`);
  }
  const parsed = parseFile(text);
  if (typeof parsed === 'string') return skip(parsed);

  const next = applyBlock(parsed, composeBlock(layout));
  if (next === text) return { status: 'unchanged', warnings: [] };
  if (!capture.recheck()) return skip('it changed between the read and the write');
  try {
    await atomicWrite(file, next);
  } catch (err) {
    return skip(`it cannot be written (${errorMessage(err)})`);
  }
  return { status: text === null ? 'created' : 'updated', warnings: [] };
}

function lstatKind(file: string): 'absent' | 'file' | 'symlink' | 'other' {
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) return 'symlink';
    return stat.isFile() ? 'file' : 'other';
  } catch (err) {
    // ENOTDIR: a component of the path is a file, so nothing can exist at the path.
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return 'absent';
    throw err;
  }
}

/** Locate the managed block; a malformed marker layout is returned as the skip reason. */
function parseFile(text: string | null): ParsedFile | string {
  if (text === null) return { text, block: null, eol: '\n' };
  const eol = /\r\n/.test(text) && !/(^|[^\r])\n/.test(text) ? '\r\n' : '\n';
  const starts: number[] = [];
  const ends: number[] = [];
  const lineEnds: number[] = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    const bare = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (bare === GITIGNORE_AUTO_START) starts.push(offset);
    if (bare === GITIGNORE_AUTO_END) { ends.push(offset); lineEnds.push(offset + bare.length); }
    offset += line.length + 1;
  }
  if (starts.length === 0 && ends.length === 0) return { text, block: null, eol };
  if (starts.length !== 1 || ends.length !== 1 || ends[0]! < starts[0]!) {
    return 'its managed-block markers are malformed — expected one start marker followed by one end marker';
  }
  return { text, block: { start: starts[0]!, end: lineEnds[0]! }, eol };
}

function applyBlock(parsed: ParsedFile, blockLines: string[]): string {
  const block = blockLines.join(parsed.eol);
  if (parsed.text === null) return block + parsed.eol;
  if (parsed.block !== null) {
    return parsed.text.slice(0, parsed.block.start) + block + parsed.text.slice(parsed.block.end);
  }
  if (parsed.text === '') return block + parsed.eol;
  const separator = parsed.text.endsWith('\n') ? '' : parsed.eol;
  return parsed.text + separator + block + parsed.eol;
}

function describeLayout(skillPaths: readonly string[], skillFiles: readonly string[]): Layout {
  const files = skillFiles.map(toPosix);
  return {
    skillPaths: [...new Set(skillPaths.map(toPosix))],
    // A parent is a prefix of its child, so the sort keeps every subdirectory after its parent.
    subdirs: [...new Set(files.flatMap((file) => ancestorChain(path.posix.dirname(file))))].sort(),
    fileDirs: [...new Set(files.map((file) => path.posix.dirname(file)))].sort(),
    extensions: [...new Set(files.map((file) => path.posix.extname(file)).filter(Boolean))].sort(),
  };
}

function composeBlock(layout: Layout): string[] {
  return [GITIGNORE_AUTO_START, ...LOCAL_ARTIFACT_PATTERNS, ...layout.skillPaths.flatMap((sp) => skillLines(layout, sp)), GITIGNORE_AUTO_END];
}

/** The block's re-include lines for one skill path: the `prospec-*` directories, their subdirectories, then the files. */
function skillLines(layout: Layout, skillPath: string): string[] {
  const lines = [`!/${skillPath}/${SKILL_DIR_GLOB}/`];
  for (const sub of layout.subdirs) lines.push(`!/${skillPath}/${SKILL_DIR_GLOB}/${sub}/`);
  for (const dir of layout.fileDirs) {
    const base = dir === '.' ? `${skillPath}/${SKILL_DIR_GLOB}` : `${skillPath}/${SKILL_DIR_GLOB}/${dir}`;
    for (const ext of layout.extensions) lines.push(`!/${base}/*${ext}`);
  }
  return lines;
}

/** `a/b/c` → `['a', 'a/b', 'a/b/c']`; `.` → `[]`. */
function ancestorChain(dir: string): string[] {
  if (dir === '.' || dir === '') return [];
  const parts = dir.split('/');
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'));
}

interface ExcludingRule { source: string; line: string; pattern: string; files: string[]; dirs: string[] }

function checkSkillFiles(cwd: string, layout: Layout, skillNames: readonly string[], skillFiles: readonly string[]): { warnings: string[]; suggestedLines: string[] } {
  const prefix = workTreePrefix(cwd);
  if (prefix === null) return { warnings: [], suggestedLines: [] };

  const warnings: string[] = [];
  const links = new Set<string>();
  const files: string[] = [];
  for (const skillPath of layout.skillPaths) {
    for (const name of skillNames) {
      for (const file of skillFiles) {
        const rel = `${skillPath}/${name}/${toPosix(file)}`;
        const link = ancestorChain(path.posix.dirname(rel)).find((dir) => lstatKind(path.join(cwd, dir)) === 'symlink');
        if (link !== undefined) { links.add(link); continue; }
        if (lstatKind(path.join(cwd, rel)) === 'file') files.push(rel);
      }
    }
  }
  for (const link of links) warnings.push(`${link} is a symbolic link: git does not follow it to the skill files under it`);
  if (files.length === 0) return { warnings, suggestedLines: [] };

  const dirs = [...new Set(files.flatMap((file) => ancestorChain(path.posix.dirname(file))))];
  const fileSet = new Set(files);
  const rules = new Map<string, ExcludingRule>();
  for (const record of parseCheckIgnore(runGit(cwd, ['check-ignore', '--stdin', '-z', '-v', '--no-index'], [...dirs, ...files]))) {
    if (record.pattern === '' || record.pattern.startsWith('!')) continue;
    const source = sourceFromCwd(record.source, prefix);
    const key = `${source}\0${record.line}\0${record.pattern}`;
    const rule = rules.get(key) ?? { source, line: record.line, pattern: record.pattern, files: [], dirs: [] };
    (fileSet.has(record.path) ? rule.files : rule.dirs).push(record.path);
    rules.set(key, rule);
  }

  // Directory records of the rules in `<cwd>/.gitignore`, merged per skill path: one
  // suggestion per skill path keeps every re-include ahead of the lines that need it.
  const suggestedDirs = new Map<string, Set<string>>();
  for (const rule of rules.values()) {
    if (rule.files.length === 0) continue;
    const others = rule.files.length - 1;
    const more = others > 0 ? ` and ${others} more skill file(s)` : '';
    warnings.push(`${rule.files[0]}${more} still ignored by ${rule.source}:${rule.line} (${rule.pattern})`);
    if (rule.source !== '.gitignore') continue;
    for (const skillPath of layout.skillPaths) {
      const ruleFiles = rule.files.filter((file) => file.startsWith(`${skillPath}/`));
      if (ruleFiles.length === 0) continue;
      const globs = suggestedDirs.get(skillPath) ?? new Set<string>();
      for (const dir of rule.dirs) {
        if (ruleFiles.some((file) => file.startsWith(`${dir}/`))) globs.add(globOf(dir, skillPath));
      }
      suggestedDirs.set(skillPath, globs);
    }
  }
  const suggestedLines: string[] = [];
  for (const [skillPath, globs] of suggestedDirs) {
    const ordered = [...globs].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
    for (const glob of ordered) suggestedLines.push(`!/${glob}/`, `/${glob}/*`);
    // A `prospec-*` re-exclude also covers skills the rule left alone, so the block's own
    // lines follow to restore every skill directory and subdirectory it re-included.
    suggestedLines.push(...skillLines(layout, skillPath));
  }
  return { warnings, suggestedLines };
}

/**
 * git names an in-repository source relative to the work tree's top level; the warnings
 * name it from `cwd`, the base of the skill paths beside it. Absolute sources stay as they are.
 */
function sourceFromCwd(source: string, prefix: string): string {
  if (path.isAbsolute(source)) return source;
  return path.posix.relative(prefix.replace(/\/$/, '') || '.', source);
}

/** `<skillPath>/<name>/rest` → `<skillPath>/prospec-*` + `/rest`; ancestors of the skill path stay as they are. */
function globOf(dir: string, skillPath: string): string {
  if (!dir.startsWith(`${skillPath}/`)) return dir;
  const [, ...rest] = dir.slice(skillPath.length + 1).split('/');
  return [skillPath, SKILL_DIR_GLOB, ...rest].join('/');
}

/** The work-tree prefix of `cwd` (`''` at the top level), or `null` when git reports no repository. */
function workTreePrefix(cwd: string): string | null {
  try {
    // The C locale keeps git's message untranslated for the match below.
    return execFileSync('git', ['rev-parse', '--show-prefix'], {
      cwd, env: fixedGitEnv({ LC_ALL: 'C' }), stdio: 'pipe', timeout: GIT_TIMEOUT_MS,
    }).toString('utf8').trim();
  } catch (err) {
    const failure = err as { status?: number | null; stderr?: Buffer };
    if (failure.status === 128 && /not a git repository/i.test(failure.stderr?.toString('utf8') ?? '')) return null;
    throw err;
  }
}

function runGit(cwd: string, args: string[], paths: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd, env: fixedGitEnv(), input: paths.map((p) => `${p}\0`).join(''), stdio: 'pipe', timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER,
    }).toString('utf8');
  } catch (err) {
    // Exit status 1 means "no path is ignored" — a result, not a failure.
    const failure = err as { status?: number | null; stdout?: Buffer };
    if (failure.status === 1 && failure.stdout !== undefined) return failure.stdout.toString('utf8');
    throw err;
  }
}

interface CheckIgnoreRecord { source: string; line: string; pattern: string; path: string }

function parseCheckIgnore(out: string): CheckIgnoreRecord[] {
  const fields = out.split('\0');
  const records: CheckIgnoreRecord[] = [];
  for (let i = 0; i + 3 < fields.length; i += 4) {
    records.push({ source: fields[i]!, line: fields[i + 1]!, pattern: fields[i + 2]!, path: fields[i + 3]! });
  }
  return records;
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/').replace(/\/+$/, '');
}

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split('\n')[0]!;
}
