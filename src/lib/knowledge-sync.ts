import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveBasePaths } from './config.js';
import { isStale } from './drift-checker.js';
import { collectGitTimestamps } from './drift-sources.js';
import { readFileIfExists } from './fs-utils.js';
import { loadModuleMap } from './knowledge-reader.js';
import { parseDeltaSpec } from './delta-spec-parser.js';
import type { ProspecConfig } from '../types/config.js';
import type { ChangeMetadata } from '../types/change.js';

/**
 * Whether affected-module Knowledge is confirmed synced for a change.
 *
 * Reads `metadata.related_modules` (falling back to `delta-spec.md` if present)
 * and confirms every affected module exists in `module-map.yaml` with a valid
 * README, a valid `last_verified` timestamp, and no staleness vs source commits.
 *
 * The single owner of this derivation: `status.service` routes on it, and the
 * archive Entry Gate refuses on it, so both call this rather than each computing
 * its own answer.
 */
export async function checkKnowledgeSync(
  changeDir: string,
  metadata: Pick<ChangeMetadata, 'related_modules'>,
  cwd: string,
  config: ProspecConfig | null,
): Promise<boolean> {
  let affectedModules = metadata.related_modules ?? [];
  if (affectedModules.length === 0) {
    const deltaSpecText = await readFileIfExists(path.join(changeDir, 'delta-spec.md'));
    if (deltaSpecText) {
      const delta = parseDeltaSpec(deltaSpecText);
      affectedModules = [
        ...new Set([...delta.added, ...delta.modified, ...delta.removed].map((e) => e.module)),
      ];
    }
  }

  if (affectedModules.length === 0) return true;

  const knowledgePath = config
    ? resolveBasePaths(config, cwd).knowledgePath
    : path.resolve(cwd, 'prospec/ai-knowledge');

  let moduleMap: ReturnType<typeof loadModuleMap> = null;
  try {
    moduleMap = loadModuleMap(knowledgePath, cwd);
  } catch {
    return false;
  }
  if (moduleMap === null) return true;

  const generatedArtifacts = config?.knowledge?.generated_artifacts ?? [];
  // Only this change's affected modules need timestamps, and collectGitTimestamps
  // gathers exactly the module set it is handed — so narrow the map before the walk
  // instead of computing every module's git history and discarding most of it.
  const affectedSet = new Set(affectedModules.map((m) => m.toLowerCase()));
  const affectedMap = {
    modules: moduleMap.modules.filter((m) => affectedSet.has(m.name.toLowerCase())),
  };
  const timestamps = collectGitTimestamps(cwd, affectedMap, knowledgePath, generatedArtifacts);

  for (const modName of affectedModules) {
    const norm = modName.toLowerCase();
    const entry = moduleMap.modules.find((m) => m.name.toLowerCase() === norm);
    if (!entry) return false;
    if (!entry.last_verified || isNaN(Date.parse(entry.last_verified))) return false;

    const readmePath = path.join(knowledgePath, 'modules', entry.name, 'README.md');
    if (!fs.existsSync(readmePath)) return false;

    if (timestamps.available) {
      const modTs = timestamps.modules.find((m) => m.name.toLowerCase() === norm);
      if (!modTs || !modTs.readme_exists || !modTs.last_verified) return false;
      if (modTs.last_src_commit && isStale(modTs.last_src_commit, modTs.last_verified)) {
        return false;
      }
    }
  }

  return true;
}
