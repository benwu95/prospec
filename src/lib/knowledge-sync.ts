import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveBasePaths } from './config.js';
import { isStale } from './drift-checker.js';
import { collectGitTimestamps } from './drift-sources.js';
import { readFileIfExists } from './fs-utils.js';
import { loadFeatureMap, loadModuleMap } from './knowledge-reader.js';
import { iterateDeltaEntries, type DeltaEntry } from './landing-fidelity.js';
import { isProvenBackfill } from './change-metadata.js';
import { parseYaml } from './yaml-utils.js';
import type { ProspecConfig } from '../types/config.js';
import type { FeatureMap } from '../types/feature-map.js';
import type { ModuleMap } from '../types/module-map.js';

/** The canonical `REQ-{MODULE}-NNN` id (a 3-digit sequence); capture 1 is the module prefix, hyphenated segments included. */
const CANONICAL_REQ_ID = /^REQ-([\w-]+)-\d{3}$/;

/**
 * Module name (lowercased) → paths, read leniently from `module-map.yaml`.
 * An absent file is an empty map; a file that exists but cannot be read or
 * parsed is `null`, so a gate can tell "no modules" from "not measured".
 */
export function buildModulePathMap(moduleMapPath: string): Map<string, string[]> | null {
  const pathMap = new Map<string, string[]>();
  if (!fs.existsSync(moduleMapPath)) return pathMap;
  try {
    const content = fs.readFileSync(moduleMapPath, 'utf-8');
    const moduleMap = parseYaml<ModuleMap>(content, moduleMapPath);
    for (const entry of moduleMap.modules) {
      pathMap.set(entry.name.toLowerCase(), entry.paths);
    }
  } catch {
    return null;
  }
  return pathMap;
}

/**
 * Known modules (lowercased): the module map's names when `module-map.yaml`
 * exists — the gate can only check a registered module, so a `modules/<name>/`
 * directory the map does not register (a module retired by an older
 * knowledge-update) is not one — otherwise the existing `modules/<name>/` directories.
 */
export function collectKnownModules(
  modulePathMap: Map<string, string[]>,
  knowledgePath: string,
): Set<string> {
  if (fs.existsSync(path.join(knowledgePath, 'module-map.yaml'))) return new Set(modulePathMap.keys());
  const known = new Set<string>();
  try {
    for (const e of fs.readdirSync(path.join(knowledgePath, 'modules'), { withFileTypes: true })) {
      if (e.isDirectory()) known.add(e.name.toLowerCase());
    }
  } catch {
    // no modules/ directory yet — nothing is known
  }
  return known;
}

/**
 * Lowercased modules of every feature whose declared req_prefixes include this
 * prefix (case-insensitive). Returns null when the prefix is NOT any feature's
 * req_prefix — the caller then treats it as a module name, not a feature prefix.
 */
export function featurePrefixModules(featureMap: FeatureMap | null, prefix: string): string[] | null {
  if (featureMap === null) return null;
  const want = prefix.toUpperCase();
  const modules = new Set<string>();
  let matched = false;
  for (const f of featureMap.features) {
    if ((f.req_prefixes ?? []).some((p) => p.toUpperCase() === want)) {
      matched = true;
      for (const m of f.modules) modules.add(m.toLowerCase());
    }
  }
  return matched ? [...modules] : null;
}

/** Everything the delta-spec classifier needs, loaded once per change. */
export interface DeltaModuleContext {
  modulePaths: Map<string, string[]>;
  known: Set<string>;
  featureMap: FeatureMap | null;
  related: string[];
  backfill: boolean;
  /** `module-map.yaml` is present but could not be read or parsed. */
  moduleMapUnreadable: boolean;
}

/** Load the classifier context. A feature-map read failure propagates — it never reads as "no feature prefixes". */
export function loadDeltaModuleContext(
  knowledgePath: string,
  relatedModules: readonly string[],
  backfill: boolean,
): DeltaModuleContext {
  const parsed = buildModulePathMap(path.join(knowledgePath, 'module-map.yaml'));
  const modulePaths = parsed ?? new Map<string, string[]>();
  return {
    modulePaths,
    known: collectKnownModules(modulePaths, knowledgePath),
    featureMap: loadFeatureMap(knowledgePath),
    related: relatedModules.map((m) => m.toLowerCase()),
    backfill,
    moduleMapUnreadable: parsed === null,
  };
}

export type DeltaEntryKind = 'module' | 'feature' | 'feature-slug' | 'new' | 'ignored' | 'malformed';

export interface ClassifiedDeltaEntry {
  section: 'added' | 'modified' | 'removed';
  id: string;
  /** Lowercased REQ prefix (empty for a malformed id). */
  prefix: string;
  description: string;
  kind: DeltaEntryKind;
  /** Affected modules, lowercased and deduplicated. */
  modules: string[];
}

/**
 * The one mapping from a delta-spec REQ to the modules whose Knowledge it
 * affects — shared by the knowledge-sync gate and `prospec knowledge update`.
 */
export function classifyDeltaEntry(entry: DeltaEntry, ctx: DeltaModuleContext): ClassifiedDeltaEntry | null {
  const section = entry.section.toLowerCase();
  if (section !== 'added' && section !== 'modified' && section !== 'removed') return null;
  const base = { section, id: entry.reqId, description: entry.description.trim() } as const;
  const match = CANONICAL_REQ_ID.exec(entry.reqId);
  if (!match) return { ...base, prefix: '', kind: 'malformed', modules: [] };
  const prefix = match[1]!.toLowerCase();
  const withRelated = (modules: readonly string[]) =>
    [...new Set([...modules, ...ctx.related])].filter((m) => ctx.known.has(m));

  if (ctx.known.has(prefix)) return { ...base, prefix, kind: 'module', modules: [prefix] };
  const featureModules = featurePrefixModules(ctx.featureMap, prefix);
  if (featureModules !== null) return { ...base, prefix, kind: 'feature', modules: withRelated(featureModules) };
  if (ctx.backfill) {
    const feature = entry.feature.toLowerCase();
    const slugModules = ctx.featureMap?.features
      .filter((f) => feature !== '' && f.feature.toLowerCase() === feature)
      .flatMap((f) => f.modules.map((m) => m.toLowerCase())) ?? [];
    return { ...base, prefix, kind: 'feature-slug', modules: withRelated(slugModules) };
  }
  if (section === 'added') return { ...base, prefix, kind: 'new', modules: [prefix] };
  return { ...base, prefix, kind: 'ignored', modules: [] };
}

/** Classify every REQ entry of a delta-spec, walked the way archive graduation walks it. */
export function classifyDeltaSpec(content: string, ctx: DeltaModuleContext): ClassifiedDeltaEntry[] {
  return iterateDeltaEntries(content)
    .map((entry) => classifyDeltaEntry(entry, ctx))
    .filter((entry): entry is ClassifiedDeltaEntry => entry !== null);
}

/** The metadata fields the gate reads; `scale` stays a plain string because archive reads raw YAML. */
export interface KnowledgeSyncMetadata {
  related_modules?: readonly string[];
  scale?: string;
}

/** Why a change's affected-module Knowledge is not synced; all empty/false means synced. */
export interface KnowledgeSyncGaps {
  /** Registered modules whose `last_verified`, README or source-commit currency fails. */
  stale: string[];
  /** Affected names absent from the module map (`related_modules` guesses included). */
  unregistered: string[];
  /** Non-canonical REQ ids — archive would still graduate them, so they cannot be skipped. */
  malformedIds: string[];
  /** `module-map.yaml` exists but cannot be read, parsed or validated. */
  moduleMapUnreadable: boolean;
}

export function hasKnowledgeSyncGap(gaps: KnowledgeSyncGaps): boolean {
  return gaps.moduleMapUnreadable || gaps.stale.length + gaps.unregistered.length + gaps.malformedIds.length > 0;
}

/**
 * The affected modules of a change whose Knowledge is not synced.
 *
 * The affected set is `metadata.related_modules` ∪ every module the shared
 * classifier resolves from `delta-spec.md` — never one in place of the other,
 * since `related_modules` is a name-word guess that can be wrong but non-empty.
 * A change without a delta-spec is judged on `related_modules` alone.
 */
export async function findUnsyncedModules(
  changeDir: string,
  metadata: KnowledgeSyncMetadata,
  cwd: string,
  config: ProspecConfig | null,
): Promise<KnowledgeSyncGaps> {
  const knowledgePath = config
    ? resolveBasePaths(config, cwd).knowledgePath
    : path.resolve(cwd, 'prospec/ai-knowledge');
  const related = (metadata.related_modules ?? []).map((m) => m.toLowerCase());
  const gaps: KnowledgeSyncGaps = { stale: [], unregistered: [], malformedIds: [], moduleMapUnreadable: false };
  const affected = new Set(related);

  const deltaSpecText = await readFileIfExists(path.join(changeDir, 'delta-spec.md'));
  if (deltaSpecText) {
    const ctx = loadDeltaModuleContext(knowledgePath, related, isProvenBackfill(changeDir, metadata.scale));
    gaps.moduleMapUnreadable = ctx.moduleMapUnreadable;
    for (const entry of classifyDeltaSpec(deltaSpecText, ctx)) {
      if (entry.kind === 'malformed') gaps.malformedIds.push(entry.id);
      for (const m of entry.modules) affected.add(m);
    }
  }
  if (affected.size === 0) return gaps;

  let moduleMap: ReturnType<typeof loadModuleMap> = null;
  try {
    moduleMap = loadModuleMap(knowledgePath, cwd);
  } catch {
    return { ...gaps, moduleMapUnreadable: true };
  }
  if (moduleMap === null) return gaps;

  const generatedArtifacts = config?.knowledge?.generated_artifacts ?? [];
  // Only this change's affected modules need timestamps, and collectGitTimestamps
  // gathers exactly the module set it is handed — so narrow the map before the walk
  // instead of computing every module's git history and discarding most of it.
  const affectedMap = {
    modules: moduleMap.modules.filter((m) => affected.has(m.name.toLowerCase())),
  };
  const timestamps = collectGitTimestamps(cwd, affectedMap, knowledgePath, generatedArtifacts);

  for (const norm of affected) {
    const entry = moduleMap.modules.find((m) => m.name.toLowerCase() === norm);
    if (!entry) {
      gaps.unregistered.push(norm);
      continue;
    }
    if (!isModuleCurrent(entry, norm, knowledgePath, timestamps)) gaps.stale.push(norm);
  }
  return gaps;
}

function isModuleCurrent(
  entry: ModuleMap['modules'][number],
  norm: string,
  knowledgePath: string,
  timestamps: ReturnType<typeof collectGitTimestamps>,
): boolean {
  if (!entry.last_verified || isNaN(Date.parse(entry.last_verified))) return false;
  if (!fs.existsSync(path.join(knowledgePath, 'modules', entry.name, 'README.md'))) return false;
  if (!timestamps.available) return true;
  const modTs = timestamps.modules.find((m) => m.name.toLowerCase() === norm);
  if (!modTs || !modTs.readme_exists || !modTs.last_verified) return false;
  return !(modTs.last_src_commit && isStale(modTs.last_src_commit, modTs.last_verified));
}

/**
 * Whether affected-module Knowledge is confirmed synced for a change — true
 * exactly when `findUnsyncedModules` reports no gap.
 *
 * The single owner of this derivation: `status.service` routes on it, and the
 * archive Entry Gate refuses on the gaps behind it, so neither computes its own.
 */
export async function checkKnowledgeSync(
  changeDir: string,
  metadata: KnowledgeSyncMetadata,
  cwd: string,
  config: ProspecConfig | null,
): Promise<boolean> {
  return !hasKnowledgeSyncGap(await findUnsyncedModules(changeDir, metadata, cwd, config));
}
