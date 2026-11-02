import { lstatSync } from 'node:fs';
import * as path from 'node:path';
import { nonDirectoryAncestor, type AncestorKind } from './fs-utils.js';
import { classifyModulePathSpec, gitPathspec, pathspecCovers } from './knowledge-reader.js';
import { SENSITIVE_PATTERNS } from './scanner.js';

export type ProjectFileMembersResult =
  | { available: true; files: readonly string[] }
  | { available: false; reason: string };

export interface ProjectFileSource {
  members(): ProjectFileMembersResult;
  listPathspecs(specs: readonly string[]): ProjectFileMembersResult;
}

export interface ProjectFileSelectOptions {
  modulePaths?: readonly string[];
  keep?: RegExp;
}

export interface ProjectFileSelectionOptions extends ProjectFileSelectOptions {
  exclude?: readonly string[];
}

export type ProjectFileListing =
  | { available: true; files: string[]; coverage: 'members' | 'no-members' | 'no-regular-files' | 'refused' }
  | { available: false; reason: string };

export interface ProjectFileSelector {
  select(options?: ProjectFileSelectOptions): ProjectFileListing;
}

/** The exclusions, the source's members and the ancestor checks are read once per selector and
 *  shared by every `select`, so one selector serves one run, not a long-lived cache. */
export function createProjectFileSelector(
  cwd: string,
  source: ProjectFileSource,
  exclude: readonly string[] = [],
): ProjectFileSelector {
  const exclusions = [...SENSITIVE_PATTERNS, ...exclude].map((raw) => classifyModulePathSpec(raw, cwd));
  const literalExclusions = exclusions.flatMap((spec) => spec.kind === 'literal' ? [spec.rel] : []);
  const globExclusions = exclusions.flatMap((spec) => spec.kind === 'glob' ? [gitPathspec(spec)!] : []);
  let excluded: { available: true; files: ReadonlySet<string> } | { available: false; reason: string } | undefined;
  let members: ProjectFileMembersResult | undefined;
  const ancestors = new Map<string, AncestorKind>();

  return {
    select({ modulePaths, keep } = {}) {
      const specs = modulePaths?.map((raw) => classifyModulePathSpec(raw, cwd));
      if (specs !== undefined && specs.every((spec) => spec.kind === 'refused')) {
        return { available: true, files: [], coverage: 'refused' };
      }
      if (members === undefined) {
        const listing = source.members();
        members = listing.available ? { available: true, files: [...new Set(listing.files)] } : listing;
      }
      if (!members.available) return members;
      let files = members.files.filter((file) => {
        if (keep === undefined) return true;
        keep.lastIndex = 0;
        return keep.test(file);
      });
      if (specs !== undefined && files.length > 0) {
        const literals = specs.flatMap((spec) => spec.kind === 'literal' ? [spec.rel] : []);
        const globs = specs.flatMap((spec) => spec.kind === 'glob' ? [gitPathspec(spec)!] : []);
        const listed = globs.length > 0 ? source.listPathspecs(globs) : { available: true as const, files: [] };
        if (!listed.available) return listed;
        const globbed = new Set(listed.files);
        files = files.filter((file) => literals.some((spec) => pathspecCovers(spec, file)) || globbed.has(file));
      }
      let coverage: 'members' | 'no-members' | 'no-regular-files' = files.length > 0 ? 'members' : 'no-members';
      files = files.filter((file) => !literalExclusions.some((spec) => pathspecCovers(spec, file)));
      if (files.length > 0 && globExclusions.length > 0) {
        if (excluded === undefined) {
          const listing = source.listPathspecs(globExclusions);
          excluded = listing.available ? { available: true, files: new Set(listing.files) } : listing;
        }
        if (!excluded.available) return excluded;
        const excludedFiles = excluded.files;
        files = files.filter((file) => !excludedFiles.has(file));
      }
      const result: string[] = [];
      for (const file of files) {
        try {
          if (nonDirectoryAncestor(cwd, file, ancestors) === null && lstatSync(path.join(cwd, file)).isFile()) result.push(file);
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === 'ENOENT' || code === 'ENOTDIR') continue;
          return { available: false, reason: `cannot inspect project file '${file}': ${code ?? String(error)}` };
        }
      }
      if (files.length > 0 && result.length === 0) coverage = 'no-regular-files';
      result.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
      return { available: true, files: result, coverage };
    },
  };
}
