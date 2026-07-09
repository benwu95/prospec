import fg from 'fast-glob';
import { execFile } from 'node:child_process';
import { statSync } from 'node:fs';
import { promisify } from 'node:util';
import path from 'node:path';
import { ScanError } from '../types/errors.js';
import { CORE_CONVENTIONS } from '../types/conventions.js';

const execFileAsync = promisify(execFile);

/**
 * Default patterns to always exclude from scanning.
 */
const DEFAULT_IGNORE = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  'coverage/**',
  '.next/**',
  '.nuxt/**',
  '__pycache__/**',
  '.venv/**',
  'venv/**',
];

/**
 * Sensitive file patterns excluded by default (REQ-STEER-008).
 */
const SENSITIVE_PATTERNS = [
  '**/*.env*',
  '**/*credential*',
  '**/*secret*',
  '**/*.key',
  '**/*.pem',
];



export interface FilteredConventions {
  core: string[];
  demand: string[];
}

/**
 * Filters a list of convention file paths into core and load-on-demand arrays.
 * Always excludes `_index.md` (for backward compatibility).
 * 
 * @param files - Array of file paths (e.g. from a glob scan)
 * @returns Filtered core and demand file paths
 */
export function filterConventions(
  files: string[],
  additionalCore: string[] = []
): FilteredConventions {
  const core: string[] = [];
  const demand: string[] = [];
  const coreSet = new Set([...CORE_CONVENTIONS, ...additionalCore]);

  for (const file of files) {
    const basename = path.basename(file);
    if (basename === '_index.md') continue; // filter old index.md from previous versions

    if (coreSet.has(basename)) {
      core.push(file);
    } else {
      demand.push(file);
    }
  }

  return { core, demand };
}

export interface ScanOptions {
  /**
   * Maximum directory-traversal depth (default: 10), passed to fast-glob `deep`.
   *
   * NOTE: files nested deeper than `depth` are silently omitted — fast-glob
   * exposes no truncation signal, so callers doing structural analysis (module
   * / architecture detection) on deeply-nested repos must raise this explicitly
   * to avoid analyzing a partial file list.
   */
  depth?: number;
  /** Additional negative patterns to exclude */
  exclude?: string[];
  /** Only return files (default: true) */
  onlyFiles?: boolean;
  /** Working directory (default: process.cwd()) */
  cwd?: string;
  /**
   * Restrict results to git-tracked files (intersect the glob match with
   * `git ls-files`), so everything gitignored is excluded regardless of the
   * hardcoded ignore list. When `cwd` is not a git work tree (or git is
   * unavailable) this silently falls back to the full glob result.
   */
  gitTrackedOnly?: boolean;
}

export interface ScanResult {
  /** All matched file paths (relative to cwd) */
  files: string[];
  /** Total file count */
  count: number;
}

/**
 * List git-tracked files under `cwd` (paths relative to `cwd`, forward slashes),
 * or `null` when `cwd` is not inside a git work tree or git is unavailable.
 *
 * Lets a scan restrict itself to tracked files — excluding everything gitignored,
 * which the static {@link DEFAULT_IGNORE} list cannot know about — while degrading
 * to full globbing (the `null` case) when there is no git to consult.
 */
export async function listGitTrackedFiles(
  cwd: string,
): Promise<Set<string> | null> {
  try {
    // `-z` → NUL-separated, so paths with spaces/newlines survive intact.
    const { stdout } = await execFileAsync('git', ['-C', cwd, 'ls-files', '-z'], {
      maxBuffer: 64 * 1024 * 1024,
    });
    return new Set(stdout.split('\0').filter(Boolean));
  } catch {
    // Not a git work tree, or git not installed — caller falls back to globbing.
    return null;
  }
}

/**
 * Scan a directory using fast-glob with built-in safety defaults.
 *
 * - Excludes node_modules, .git, dist, build by default
 * - Excludes sensitive files (*.env*, *credential*, *secret*) per REQ-STEER-008
 * - Supports depth control and custom exclude patterns
 *
 * Files nested deeper than `options.depth` (default 10) are silently omitted —
 * see {@link ScanOptions.depth}.
 *
 * @param patterns - Glob patterns to match (default: '**')
 * @param options - Scan configuration
 * @returns Matched file paths and count
 * @throws ScanError if scanning fails
 */
export async function scanDir(
  patterns: string | string[] = '**',
  options: ScanOptions = {},
): Promise<ScanResult> {
  const {
    depth = 10,
    exclude = [],
    onlyFiles = true,
    cwd = process.cwd(),
    gitTrackedOnly = false,
  } = options;

  const ignore = [
    ...DEFAULT_IGNORE,
    ...SENSITIVE_PATTERNS,
    ...exclude,
  ];

  try {
    const matched = await fg.glob(patterns, {
      cwd,
      deep: depth,
      ignore,
      onlyFiles,
      dot: false,
      followSymbolicLinks: false,
    });

    // Optionally constrain to git-tracked files. A null result (no git work tree
    // or git unavailable) falls back to the full glob match — the original behavior.
    let files = matched;
    if (gitTrackedOnly) {
      const tracked = await listGitTrackedFiles(cwd);
      if (tracked) files = matched.filter((f) => tracked.has(f));
    }

    return {
      files: files.sort(),
      count: files.length,
    };
  } catch (err) {
    throw new ScanError(
      cwd,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Synchronous variant of scanDir for simpler use cases.
 */
export function scanDirSync(
  patterns: string | string[] = '**',
  options: ScanOptions = {},
): ScanResult {
  const {
    depth = 10,
    exclude = [],
    onlyFiles = true,
    cwd = process.cwd(),
  } = options;

  const ignore = [
    ...DEFAULT_IGNORE,
    ...SENSITIVE_PATTERNS,
    ...exclude,
  ];

  try {
    const files = fg.globSync(patterns, {
      cwd,
      deep: depth,
      ignore,
      onlyFiles,
      dot: false,
      followSymbolicLinks: false,
    });

    return {
      files: files.sort(),
      count: files.length,
    };
  } catch (err) {
    throw new ScanError(
      cwd,
      err instanceof Error ? err.message : String(err),
    );
  }
}

export type ModulePathKind = 'glob' | 'file' | 'dir' | 'missing';

/**
 * Classify one `module-map.yaml` `paths` entry by what it points at on disk —
 * the single source of truth for how the entry is scanned/attributed. A glob
 * (contains `*`) is honored verbatim. An entry that resolves outside `cwd` (same
 * lexical containment as `clampModulePaths`) or does not exist is `missing`, so
 * callers fall back to literal-prefix behavior rather than fabricating a match.
 */
export function classifyModulePath(rawPath: string, cwd: string): ModulePathKind {
  if (rawPath.includes('*')) return 'glob';
  const abs = path.resolve(cwd, rawPath);
  const rel = path.relative(cwd, abs);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return 'missing';
  try {
    const stat = statSync(abs);
    if (stat.isDirectory()) return 'dir';
    if (stat.isFile()) return 'file';
    return 'missing';
  } catch {
    return 'missing';
  }
}

/**
 * Map `module-map.yaml` `paths` entries to fast-glob scan patterns with
 * file/folder semantics: a directory expands to its subtree, a file scans only
 * itself, and a glob or a missing/out-of-repo entry passes through verbatim
 * (fast-glob then yields the literal match or nothing). Shared by the knowledge
 * README scanners so their `paths` interpretation matches the drift engine's.
 */
export function moduleScanPatterns(paths: string[], cwd: string): string[] {
  return paths.map((p) => {
    if (classifyModulePath(p, cwd) === 'dir') return `${p.replace(/\/+$/, '')}/**`;
    return p;
  });
}
