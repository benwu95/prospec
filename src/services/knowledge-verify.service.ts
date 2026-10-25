import * as path from 'node:path';
import { PrerequisiteError } from '../types/errors.js';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { atomicWrite } from '../lib/fs-utils.js';
import { collectModuleDigests, isGitWorkTree } from '../lib/drift-sources.js';
import { loadModuleMap, readModuleMapRaw, resolveContainedTarget } from '../lib/knowledge-reader.js';
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
  /** Module names left untouched: stamped later than their HEAD value with an unchanged source digest. */
  skipped: string[];
  timestamp: string;
}

/**
 * Stamp `last_verified` and `source_digest` for the named modules in `module-map.yaml` —
 * the CLI-owned, dated confirmation that a module's knowledge is current against its
 * source, and the digest of the source it was confirmed against. This is the sole
 * writer of both: `knowledge:check` requires `last_verified` to move when a module's
 * source changes, and `knowledge-health` compares `source_digest` with the current
 * source (REQ-LIB-015). The write goes through the comment-preserving document path
 * so the curated header and every other module's fields survive.
 *
 * A module whose working-tree stamp is later than its value at HEAD and whose recorded
 * digest equals its current one is skipped: re-stamping it adds no information but
 * would change module-map.yaml — a review and test evidence input. "Later than HEAD"
 * keeps each change stamping at least once and the CI gate's strictly-later bump
 * satisfied. Inside a git work tree a digest that cannot be computed refuses the
 * whole write; where git cannot confirm one, only `last_verified` is stamped.
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
  const { knowledgePath, specsPath } = resolveBasePaths(config, cwd);
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

  // The same validated, path-clamped map the freshness rule reads (REQ-LIB-015).
  let digests: Map<string, string> | null = null;
  if (isGitWorkTree(cwd)) {
    const clamped = loadModuleMap(knowledgePath, cwd) ?? { modules: [] };
    const computed = collectModuleDigests(cwd, clamped, {
      knowledgePath,
      specsPath,
      generatedArtifacts: config.knowledge?.generated_artifacts ?? [],
      subset: new Set(requested),
    });
    const failed = requested.map((name) => [name, computed.get(name)] as const)
      .filter(([, d]) => d?.digest == null)
      .map(([name, d]) => `${name} (${d?.reason ?? 'not digested'})`);
    if (failed.length > 0) {
      throw new PrerequisiteError(
        `source digest cannot be computed for ${failed.join('; ')} — no last_verified was written`,
        'resolve the cause named above, then re-run `prospec knowledge verify`',
      );
    }
    digests = new Map(requested.map((name) => [name, computed.get(name)!.digest!]));
  }

  const atHead = readHeadModuleStamps(cwd, target.path);
  const byName = new Map(moduleMap.modules.map((m) => [m.name, m]));
  const skipped = atHead === null || digests === null
    ? []
    : requested.filter((name) =>
      laterThanHead(byName.get(name)?.last_verified, atHead.get(name))
      && byName.get(name)?.source_digest === digests!.get(name));
  const verified = requested.filter((name) => !skipped.includes(name));
  if (verified.length === 0) return { moduleMapPath, verified, skipped, timestamp: now };

  const targets = new Set(verified);
  for (const m of moduleMap.modules) {
    if (!targets.has(m.name)) continue;
    m.last_verified = now;
    if (digests !== null) m.source_digest = digests.get(m.name)!;
  }

  // Comment-preserving in-place merge: module-map.yaml is a CURATED file. Reusing
  // the same Document path as `updateModuleMap` keeps the header comments and every
  // untouched module's fields byte-stable.
  const doc = parseYamlDocument(content, moduleMapPath);
  mergeIntoDocument(doc, moduleMap as unknown as Record<string, unknown>);
  await atomicWrite(target.path, stringifyYamlDocument(doc));

  return { moduleMapPath, verified, skipped, timestamp: now };
}

/** The working-tree stamp parses and is later than HEAD's (absent or unparsable there counts as earlier). */
function laterThanHead(worktree: string | undefined, atHead: string | undefined): boolean {
  const stamp = worktree === undefined ? NaN : Date.parse(worktree);
  if (isNaN(stamp)) return false;
  const head = atHead === undefined ? NaN : Date.parse(atHead);
  return isNaN(head) || stamp > head;
}
