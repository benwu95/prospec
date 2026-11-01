import { execFileSync } from 'node:child_process';
import type { SourceInventory } from '../types/drift-report.js';
import { probeGitWorkTree } from './git-prerequisite.js';
import { GIT_READ_TIMEOUT_MS, PATHSPEC_ENV, failureLine, parseIndexRecord } from './git-read.js';
import { createProjectFileSelector, type ProjectFileListing, type ProjectFileMembersResult, type ProjectFileSelectionOptions, type ProjectFileSelector, type ProjectFileSource } from './project-files.js';

function listIndex(cwd: string, specs: readonly string[] | null): ProjectFileMembersResult {
  if (specs !== null && specs.length === 0) return { available: true, files: [] };
  const env = { ...process.env };
  for (const name of PATHSPEC_ENV) delete env[name];
  try {
    const bytes = execFileSync('git', ['ls-files', '-z', '-t', '--stage', '--cached', ...(specs === null ? [] : ['--', ...specs])], {
      cwd,
      env,
      stdio: 'pipe',
      timeout: GIT_READ_TIMEOUT_MS,
      maxBuffer: 256 * 1024 * 1024,
    });
    if (bytes.length > 0 && bytes[bytes.length - 1] !== 0) throw new Error('Incomplete NUL Git capture');
    const files = new Set<string>();
    let start = 0;
    for (let end = 0; end < bytes.length; end++) {
      if (bytes[end] !== 0) continue;
      const raw = bytes.subarray(start, end);
      start = end + 1;
      const decoded = raw.toString('utf8');
      if (!Buffer.from(decoded).equals(raw)) continue;
      const record = parseIndexRecord(decoded);
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
