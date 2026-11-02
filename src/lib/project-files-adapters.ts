import type { SourceInventory } from '../types/drift-report.js';
import { probeGitWorkTree } from './git-prerequisite.js';
import { failureLine, parseIndexRecord, readIndexEntries } from './git-read.js';
import { createProjectFileSelector, type ProjectFileListing, type ProjectFileMembersResult, type ProjectFileSelectionOptions, type ProjectFileSelector, type ProjectFileSource } from './project-files.js';

function listIndex(cwd: string, specs: readonly string[] | null): ProjectFileMembersResult {
  if (specs !== null && specs.length === 0) return { available: true, files: [] };
  try {
    const files = new Set<string>();
    for (const entry of readIndexEntries(cwd, { decoding: 'skip', ...(specs === null ? {} : { pathspecs: specs }) })) {
      const record = parseIndexRecord(entry);
      if (record.mode !== '160000') files.add(record.file);
    }
    return { available: true, files: [...files] };
  } catch (error) {
    return { available: false, reason: `git index unavailable: ${failureLine(error instanceof Error ? error.message : String(error))}` };
  }
}

export function gitIndexFileSource(cwd: string): ProjectFileSource {
  return {
    members() {
      const probe = probeGitWorkTree(cwd);
      if (probe.state !== 'work-tree') {
        return { available: false, reason: `git index unavailable: ${probe.state}${'detail' in probe && probe.detail ? `: ${probe.detail}` : ''}` };
      }
      return listIndex(cwd, null);
    },
    listPathspecs: (specs) => listIndex(cwd, specs),
  };
}

export function inventoryFileSource(cwd: string, inventory: SourceInventory): ProjectFileSource {
  return {
    members: () => ({ available: true, files: [...inventory.entries].flatMap(([file, { mode }]) => mode !== null && mode !== '160000' ? [file] : []) }),
    listPathspecs: (specs) => listIndex(cwd, specs),
  };
}

export function projectFileSelector(cwd: string, exclude?: readonly string[]): ProjectFileSelector {
  return createProjectFileSelector(cwd, gitIndexFileSource(cwd), exclude);
}

export function listProjectFiles(cwd: string, { exclude, ...options }: ProjectFileSelectionOptions = {}): ProjectFileListing {
  return projectFileSelector(cwd, exclude).select(options);
}
