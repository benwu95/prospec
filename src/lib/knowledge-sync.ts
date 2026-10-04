import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveBasePaths } from './config.js';
import { isStale } from './drift-checker.js';
import { collectGitTimestamps } from './drift-sources.js';
import { readFileIfExists } from './fs-utils.js';
import { loadFeatureMap, loadModuleMap, readContained } from './knowledge-reader.js';
import { iterateDeltaEntries, type DeltaEntry } from './landing-fidelity.js';
import { isProvenBackfill } from './change-metadata.js';
import { parseYaml } from './yaml-utils.js';
import { PrerequisiteError } from '../types/errors.js';
import type { ProspecConfig } from '../types/config.js';
import type { FeatureMap } from '../types/feature-map.js';
import type { ModuleMap } from '../types/module-map.js';
import type { WorkflowReason } from '../types/status.js';

/** The canonical `REQ-{MODULE}-NNN` id (a 3-digit sequence); capture 1 is the module prefix, hyphenated segments included. */
const CANONICAL_REQ_ID = /^REQ-([\w-]+)-\d{3}$/;

/** Whether `file` exists but resolves outside `root` — the contained read's own `escaped` verdict. */
function resolvesOutsideRoot(file: string, root: string): boolean {
  const read = readContained(file, root);
  return !read.ok && read.reason === 'escaped';
}

/**
 * Module name (lowercased) → paths, read leniently from the knowledge root's
 * `module-map.yaml`. An absent file is an empty map; a file that cannot be read
 * or parsed, or that resolves outside the knowledge root, is `null`, so a gate
 * can tell "no modules" from "not measured".
 */
export function buildModulePathMap(knowledgePath: string): Map<string, string[]> | null {
  const moduleMapPath = path.join(knowledgePath, 'module-map.yaml');
  const pathMap = new Map<string, string[]>();
  const read = readContained(moduleMapPath, knowledgePath);
  if (!read.ok) return read.reason === 'absent' ? pathMap : null;
  try {
    const moduleMap = parseYaml<ModuleMap>(read.text, moduleMapPath);
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
  return new Set(listModuleDirectories(knowledgePath).map((name) => name.toLowerCase()));
}

/** The `modules/<name>/` directory names as written on disk. */
function listModuleDirectories(knowledgePath: string): string[] {
  try {
    return fs
      .readdirSync(path.join(knowledgePath, 'modules'), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    // no modules/ directory yet — nothing is known
    return [];
  }
}

/** The related-only unregistered condition, shared with `routeChange`'s halt gate. */
export const RELATED_MODULE_HALT_CONDITION =
  'a `related_modules` name the map does not register and no ADDED REQ introduces as a new module';
/** The cause and remedy of an unreadable `module-map.yaml`, shared by every surface that reports it. */
export const MODULE_MAP_UNREADABLE_CAUSE = 'module-map.yaml cannot be read, parsed or validated';
export const MODULE_MAP_UNREADABLE_REMEDY = 'repair module-map.yaml';
const MODULE_MAP_OUTSIDE_ROOT = {
  cause: 'module-map.yaml resolves outside the knowledge root',
  remedy: 'keep module-map.yaml itself inside the knowledge root instead of linking to one outside it',
} as const;
const FEATURE_MAP_OUTSIDE_ROOT = {
  cause: 'feature-map.yaml resolves outside the knowledge root',
  remedy: 'keep feature-map.yaml itself inside the knowledge root instead of linking to one outside it',
} as const;

export interface KnownModules {
  /** Lowercased name → the module's own spelling (module-map name, else directory name). */
  known: Map<string, string>;
  /** Present when `module-map.yaml` exists but a writer cannot trust it: why, and what repairs it. */
  unreadable?: { cause: string; remedy: string };
}

/**
 * The known modules as a writer must judge them: through the validating,
 * contained module-map reader, failing closed on a map that cannot be read,
 * parsed or validated, or that resolves outside the knowledge root.
 */
export function readKnownModules(knowledgePath: string, cwd: string): KnownModules {
  let moduleMap: ModuleMap | null;
  try {
    moduleMap = loadModuleMap(knowledgePath, cwd);
  } catch {
    return { known: new Map(), unreadable: { cause: MODULE_MAP_UNREADABLE_CAUSE, remedy: MODULE_MAP_UNREADABLE_REMEDY } };
  }
  if (moduleMap === null) {
    // loadModuleMap reads a map outside the knowledge root as absent; falling back
    // to modules/ past a map that is there would judge names against the wrong set
    if (resolvesOutsideRoot(path.join(knowledgePath, 'module-map.yaml'), knowledgePath)) {
      return { known: new Map(), unreadable: { ...MODULE_MAP_OUTSIDE_ROOT } };
    }
    return { known: new Map(listModuleDirectories(knowledgePath).map((n) => [n.toLowerCase(), n])) };
  }
  return { known: new Map(moduleMap.modules.map((m) => [m.name.toLowerCase(), m.name])) };
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
  /** `module-map.yaml` is present but could not be read or parsed, or resolves outside the knowledge root. */
  moduleMapUnreadable: boolean;
}

/**
 * Load the classifier context. A feature map that cannot be read, parsed or
 * validated, or that resolves outside the knowledge root, raises — it never
 * reads as "no feature prefixes".
 */
export function loadDeltaModuleContext(
  knowledgePath: string,
  relatedModules: readonly string[],
  backfill: boolean,
): DeltaModuleContext {
  const parsed = buildModulePathMap(knowledgePath);
  const modulePaths = parsed ?? new Map<string, string[]>();
  const featureMap = loadFeatureMap(knowledgePath);
  if (featureMap === null && resolvesOutsideRoot(path.join(knowledgePath, 'feature-map.yaml'), knowledgePath)) {
    // status and archive keep only the message, so the remedy rides in it too
    throw new PrerequisiteError(
      `${FEATURE_MAP_OUTSIDE_ROOT.cause} — ${FEATURE_MAP_OUTSIDE_ROOT.remedy}`,
      FEATURE_MAP_OUTSIDE_ROOT.remedy,
    );
  }
  return {
    modulePaths,
    known: collectKnownModules(modulePaths, knowledgePath),
    featureMap,
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
  /** The `unregistered` names only `related_modules` supplies — no classified entry
   *  produces them; present only when non-empty, so the four-field shape holds. */
  relatedUnregistered?: string[];
  /** Non-canonical REQ ids — archive would still graduate them, so they cannot be skipped. */
  malformedIds: string[];
  /** Set when the gate's read of an existing `module-map.yaml` fails — it cannot be read, parsed or
   *  validated, or it resolves outside the knowledge root. */
  moduleMapUnreadable: boolean;
  /** Present only when that map resolves outside the knowledge root. */
  moduleMapOutsideRoot?: true;
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
  const deltaSourced = new Set<string>();

  const mapOutsideRoot = (): boolean => resolvesOutsideRoot(path.join(knowledgePath, 'module-map.yaml'), knowledgePath);
  const markModuleMapUnreadable = (outsideRoot: boolean): void => {
    gaps.moduleMapUnreadable = true;
    if (outsideRoot) gaps.moduleMapOutsideRoot = true;
  };

  const deltaSpecText = await readFileIfExists(path.join(changeDir, 'delta-spec.md'));
  if (deltaSpecText) {
    const ctx = loadDeltaModuleContext(knowledgePath, related, isProvenBackfill(changeDir, metadata.scale));
    if (ctx.moduleMapUnreadable) markModuleMapUnreadable(mapOutsideRoot());
    for (const entry of classifyDeltaSpec(deltaSpecText, ctx)) {
      if (entry.kind === 'malformed') gaps.malformedIds.push(entry.id);
      for (const m of entry.modules) {
        affected.add(m);
        deltaSourced.add(m);
      }
    }
  }
  if (affected.size === 0) return gaps;

  let moduleMap: ReturnType<typeof loadModuleMap> = null;
  try {
    moduleMap = loadModuleMap(knowledgePath, cwd);
  } catch {
    return { ...gaps, moduleMapUnreadable: true };
  }
  if (moduleMap === null) {
    // loadModuleMap reads a map outside the knowledge root as absent
    if (mapOutsideRoot()) markModuleMapUnreadable(true);
    return gaps;
  }

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
  const relatedOnly = gaps.unregistered.filter((m) => !deltaSourced.has(m));
  if (relatedOnly.length > 0) gaps.relatedUnregistered = relatedOnly;
  return gaps;
}

/**
 * The one mapping from knowledge-sync gaps to `WorkflowReason`s, shared by
 * `prospec status` and `prospec archive`. Inputs no station repairs — an
 * unreadable module map, non-canonical ids and RELATED_MODULE_HALT_CONDITION —
 * come first under
 * `KNOWLEDGE_INPUT_INVALID`; what
 * `prospec-knowledge-update` repairs follows under `KNOWLEDGE_UNSYNCED`.
 * Returns a reason exactly when `hasKnowledgeSyncGap` is true.
 */
export function knowledgeSyncReasons(gaps: KnowledgeSyncGaps, changeName: string): WorkflowReason[] {
  const relatedOnly = (gaps.relatedUnregistered ?? []).filter((m) => gaps.unregistered.includes(m));
  const deltaUnregistered = gaps.unregistered.filter((m) => !relatedOnly.includes(m));
  const reasons: WorkflowReason[] = [];

  const invalid = { causes: [] as string[], remedies: [] as string[] };
  if (gaps.moduleMapUnreadable && gaps.moduleMapOutsideRoot) {
    invalid.causes.push(MODULE_MAP_OUTSIDE_ROOT.cause);
    invalid.remedies.push(MODULE_MAP_OUTSIDE_ROOT.remedy);
  } else if (gaps.moduleMapUnreadable) {
    invalid.causes.push(MODULE_MAP_UNREADABLE_CAUSE);
    invalid.remedies.push(MODULE_MAP_UNREADABLE_REMEDY);
  }
  if (gaps.malformedIds.length > 0) {
    invalid.causes.push(`non-canonical REQ id(s): ${gaps.malformedIds.join(', ')}`);
    invalid.remedies.push('rename each to REQ-{MODULE}-NNN');
  }
  if (relatedOnly.length > 0) {
    invalid.causes.push(`${RELATED_MODULE_HALT_CONDITION}: ${relatedOnly.join(', ')}`);
    invalid.remedies.push(
      `for ${relatedOnly.join(', ')}: register the module in module-map.yaml, or correct a mistyped name with \`prospec change related-modules <module...> --change ${changeName}\` (every registered module kept)`,
    );
  }
  if (invalid.causes.length > 0) {
    reasons.push({
      code: 'KNOWLEDGE_INPUT_INVALID',
      message: `knowledge-sync input no station repairs — ${invalid.causes.join('; ')}`,
      remediation: invalid.remedies.join('; '),
    });
  }

  const unsynced = { causes: [] as string[], remedies: [] as string[] };
  if (gaps.stale.length > 0) {
    unsynced.causes.push(`stale: ${gaps.stale.join(', ')}`);
    unsynced.remedies.push(`run \`prospec-knowledge-update\`, then \`prospec knowledge verify ${gaps.stale.join(' ')}\``);
  }
  if (deltaUnregistered.length > 0) {
    unsynced.causes.push(`not registered in module-map: ${deltaUnregistered.join(', ')}`);
    unsynced.remedies.push(
      `for ${deltaUnregistered.join(', ')}: declare the REQ prefix in feature-map.yaml \`req_prefixes\`, or create the module through \`prospec-knowledge-update\``,
    );
  }
  if (unsynced.causes.length > 0) {
    reasons.push({
      code: 'KNOWLEDGE_UNSYNCED',
      message: `affected-module Knowledge is not synced — ${unsynced.causes.join('; ')}`,
      remediation: unsynced.remedies.join('; '),
    });
  }
  return reasons;
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
 * exactly when `findUnsyncedModules` reports no gap (and so exactly when
 * `knowledgeSyncReasons` returns nothing).
 */
export async function checkKnowledgeSync(
  changeDir: string,
  metadata: KnowledgeSyncMetadata,
  cwd: string,
  config: ProspecConfig | null,
): Promise<boolean> {
  return !hasKnowledgeSyncGap(await findUnsyncedModules(changeDir, metadata, cwd, config));
}
