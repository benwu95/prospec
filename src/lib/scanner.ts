import fg from 'fast-glob';
import path from 'node:path';
import { ScanError } from '../types/errors.js';
import { CORE_CONVENTIONS } from '../types/conventions.js';


/**
 * Sensitive file patterns excluded by default (REQ-STEER-008).
 */
export const SENSITIVE_PATTERNS = [
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
   * exposes no truncation signal, so artifact-directory callers needing deeper entries must raise it explicitly.
   */
  depth?: number;
  /** Additional negative patterns to exclude */
  exclude?: string[];
  /** Only return files (default: true) */
  onlyFiles?: boolean;
  /** Working directory (default: process.cwd()) */
  cwd?: string;
}

export interface ScanResult {
  /** All matched file paths (relative to cwd) */
  files: string[];
  /** Total file count */
  count: number;
}

/** Walk Prospec artifact directories with the caller's glob, depth and exclusions. */
export async function scanDir(
  patterns: string | string[] = '**',
  options: ScanOptions = {},
): Promise<ScanResult> {
  const {
    depth = 10,
    exclude = [],
    onlyFiles = true,
    cwd = process.cwd(),
  } = options;

  const ignore = [
    ...SENSITIVE_PATTERNS,
    ...exclude,
  ];

  try {
    const files = await fg.glob(patterns, {
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
