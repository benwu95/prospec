import * as path from 'node:path';
import { PrerequisiteError } from '../types/errors.js';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { atomicWrite } from '../lib/fs-utils.js';
import { readModuleMapRaw, resolveContainedTarget } from '../lib/knowledge-reader.js';
import { readHeadModuleStamps, readKnownModules } from '../lib/knowledge-sync.js';
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
  /** Module names left untouched: stamped later than their HEAD value, on the current UTC day. */
  skipped: string[];
  timestamp: string;
}

/**
 * Stamp `last_verified` for the named modules in `module-map.yaml` — the CLI-owned,
 * dated confirmation that a module's knowledge is current against its source. This
 * is the sole writer of `last_verified`: it is what the `knowledge:check` gate
 * requires to move when a module's source changes, and what `knowledge-health`
 * reads for staleness (REQ-LIB-015). The write goes through the comment-preserving
 * document path so the curated header and every other module's fields survive.
 *
 * A module whose working-tree stamp is later than its value at HEAD and falls on
 * the current UTC day is skipped: freshness compares by UTC day, so re-stamping it
 * adds no information but would change module-map.yaml — a review and test
 * evidence input. "Later than HEAD" keeps each change stamping at least once and
 * keeps the CI gate's strictly-later bump satisfied.
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

  const { unreadable } = readKnownModules(knowledgePath, cwd);
  if (unreadable) {
    throw new PrerequisiteError(
      `${unreadable.cause} — no last_verified was written`,
      `${unreadable.remedy}, then re-run \`prospec knowledge verify\``,
    );
  }
  const content = readModuleMapRaw(knowledgePath);
  if (content === null) {
    throw new PrerequisiteError(
      `module-map.yaml not found at ${moduleMapPath}`,
      'Run `prospec knowledge init` (and `prospec-knowledge-generate`) first.',
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

  // the same real file the reader above read, so an in-root symlink keeps its link
  const target = resolveContainedTarget(moduleMapPath, knowledgePath);
  if (!target.ok) {
    throw new PrerequisiteError(
      'module-map.yaml cannot be resolved inside the knowledge root — no last_verified was written',
      'keep module-map.yaml itself inside the knowledge root as a regular file, then re-run `prospec knowledge verify`',
    );
  }

  const atHead = readHeadModuleStamps(cwd, target.path);
  const stampOf = new Map(moduleMap.modules.map((m) => [m.name, m.last_verified]));
  const skipped = atHead === null
    ? []
    : requested.filter((name) => stampedToday(stampOf.get(name), atHead.get(name), now));
  const verified = requested.filter((name) => !skipped.includes(name));
  if (verified.length === 0) return { moduleMapPath, verified, skipped, timestamp: now };

  const targets = new Set(verified);
  for (const m of moduleMap.modules) {
    if (targets.has(m.name)) m.last_verified = now;
  }

  // Comment-preserving in-place merge: module-map.yaml is a CURATED file. Reusing
  // the same Document path as `updateModuleMap` keeps the header comments and every
  // untouched module's fields byte-stable.
  const doc = parseYamlDocument(content, moduleMapPath);
  mergeIntoDocument(doc, moduleMap as unknown as Record<string, unknown>);
  await atomicWrite(target.path, stringifyYamlDocument(doc));

  return { moduleMapPath, verified, skipped, timestamp: now };
}

const utcDay = (ts: number): number => Math.floor(ts / 86_400_000);

/** The working-tree stamp is later than HEAD's (absent or unparsable there counts as earlier) and on `now`'s UTC day. */
function stampedToday(worktree: string | undefined, atHead: string | undefined, now: string): boolean {
  const stamp = worktree === undefined ? NaN : Date.parse(worktree);
  if (isNaN(stamp) || utcDay(stamp) !== utcDay(Date.parse(now))) return false;
  const head = atHead === undefined ? NaN : Date.parse(atHead);
  return isNaN(head) || stamp > head;
}
