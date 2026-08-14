import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrerequisiteError } from '../types/errors.js';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { atomicWrite } from '../lib/fs-utils.js';
import {
  parseYaml,
  parseYamlDocument,
  stringifyYamlDocument,
  mergeIntoDocument,
} from '../lib/yaml-utils.js';
import type { ModuleMap } from '../types/module-map.js';

export interface KnowledgeVerifyOptions {
  /** Module names to stamp as verified. */
  modules: string[];
  cwd?: string;
  /**
   * The confirmation instant (ISO 8601) to stamp. Injected so the write is
   * deterministic under test; defaults to the current time.
   */
  now?: string;
}

export interface KnowledgeVerifyResult {
  moduleMapPath: string;
  /** Module names stamped, in the order requested (de-duplicated). */
  verified: string[];
  timestamp: string;
}

/**
 * Stamp `last_verified` for the named modules in `module-map.yaml` — the CLI-owned,
 * dated confirmation that a module's knowledge is current against its source. This
 * is the sole writer of `last_verified`: it is what the `knowledge:check` gate
 * requires to move when a module's source changes, and what `knowledge-health`
 * reads for staleness (REQ-LIB-015). The write goes through the comment-preserving
 * document path so the curated header and every other module's fields survive.
 */
export async function execute(options: KnowledgeVerifyOptions): Promise<KnowledgeVerifyResult> {
  const cwd = options.cwd ?? process.cwd();
  const now = options.now ?? new Date().toISOString();
  const requested = [...new Set(options.modules)];
  if (requested.length === 0) {
    throw new PrerequisiteError(
      'no module named',
      'Name one or more modules: `prospec knowledge verify <module>...`',
    );
  }

  const config = await readConfig(cwd);
  const { knowledgePath } = resolveBasePaths(config, cwd);
  const moduleMapPath = path.join(knowledgePath, 'module-map.yaml');

  let content: string;
  try {
    content = await fs.promises.readFile(moduleMapPath, 'utf-8');
  } catch {
    throw new PrerequisiteError(
      `module-map.yaml not found at ${moduleMapPath}`,
      'Run `prospec knowledge init` (and `/prospec-knowledge-generate`) first.',
    );
  }

  const moduleMap = parseYaml<ModuleMap>(content, moduleMapPath);
  const known = new Set(moduleMap.modules.map((m) => m.name));
  const unknown = requested.filter((m) => !known.has(m));
  if (unknown.length > 0) {
    throw new PrerequisiteError(
      `unknown module(s): ${unknown.join(', ')}`,
      `Name a module declared in module-map.yaml (${[...known].join(', ')}).`,
    );
  }

  const targets = new Set(requested);
  for (const m of moduleMap.modules) {
    if (targets.has(m.name)) m.last_verified = now;
  }

  // Comment-preserving in-place merge: module-map.yaml is a CURATED file. Reusing
  // the same Document path as `updateModuleMap` keeps the header comments and every
  // untouched module's fields byte-stable.
  const doc = parseYamlDocument(content, moduleMapPath);
  mergeIntoDocument(doc, moduleMap as unknown as Record<string, unknown>);
  await atomicWrite(moduleMapPath, stringifyYamlDocument(doc));

  return { moduleMapPath, verified: requested, timestamp: now };
}
