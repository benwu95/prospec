/**
 * `pnpm knowledge:check` — fail when a change edits a module's source without
 * confirming that module's knowledge.
 *
 * The recurring failure it prevents (`archive/knowledge-sync-touched-module-readme`,
 * the ledger's most-repeated lesson): a change touches a module's source, the
 * agent syncs some modules' knowledge and misses one, and `knowledge-health` only
 * WARNs after the fact. This gate makes prevention mechanical, in the shape of
 * `counts:check` / `agents:check`: over the change's own diff it requires that any
 * source-touched module also bumped its `last_verified` (via `prospec knowledge
 * verify`). Repo-internal — `scripts/` is not shipped.
 *
 * Diff base = `git merge-base origin/main HEAD` (falls back to `main`): the changes
 * since the branch diverged, correct under rebase. CI must check out with
 * `fetch-depth: 0` so that base history is present.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleAttributor } from '../src/lib/drift-sources.js';
import { loadModuleMap } from '../src/lib/knowledge-reader.js';
import { parseYaml } from '../src/lib/yaml-utils.js';
import { ModuleMapSchema, type ModuleMap } from '../src/types/module-map.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KNOWLEDGE_PATH = 'prospec/ai-knowledge';
const MODULE_MAP_REL = `${KNOWLEDGE_PATH}/module-map.yaml`;
/** Ordered base-ref candidates: origin/main in CI, main for a local checkout. */
const BASE_CANDIDATES = ['origin/main', 'main'] as const;

export interface SyncPartition {
  /** Modules whose declared source paths changed in the range. */
  srcModules: string[];
  /** Modules whose `last_verified` changed in the range. */
  bumped: string[];
  /** Source-touched modules that did NOT bump `last_verified` — the violations. */
  missing: string[];
}

/**
 * Pure core (injected, git-free): which source-touched modules failed to move
 * their `last_verified` between the base and head module maps. `moduleAttributor`
 * maps a changed path to a module by the `paths` that module DECLARES in the head
 * map — `tests` declares `tests/`, not a `src/**` prefix — and a path no module
 * declares is nobody's source, which is why knowledge/doc/script edits never count
 * a module as source-touched. A module absent from the base map compares its head
 * `last_verified` against `undefined`, so a newly-added stamped module counts as
 * bumped and an added-but-unstamped one is flagged.
 */
export function partitionMissingSync(
  changed: readonly string[],
  baseMap: ModuleMap,
  headMap: ModuleMap,
): SyncPartition {
  const attribute = moduleAttributor(headMap);
  const srcModules = new Set<string>();
  for (const p of changed) {
    const mod = attribute(p);
    if (mod !== null) srcModules.add(mod);
  }
  const baseVerified = new Map(baseMap.modules.map((m) => [m.name, m.last_verified]));
  const bumped = new Set<string>();
  for (const m of headMap.modules) {
    // A bump is a NEW, later confirmation, not merely a different value: the head
    // `last_verified` must be present, parse as a timestamp, and be newly-added or
    // strictly later than the base. Clearing the stamp, or hand-editing it to the
    // same / an earlier / an unparseable value, is NOT a bump — the module stays
    // unconfirmed and (if its source changed) is flagged. `!==` alone would let a
    // cleared or backdated stamp pass the gate.
    const head = m.last_verified;
    if (head === undefined) continue;
    const headTime = Date.parse(head);
    if (Number.isNaN(headTime)) continue;
    const base = baseVerified.get(m.name);
    const baseTime = base === undefined ? -Infinity : Date.parse(base);
    if (Number.isNaN(baseTime) || headTime > baseTime) bumped.add(m.name);
  }
  const missing = [...srcModules].filter((m) => !bumped.has(m)).sort();
  return { srcModules: [...srcModules].sort(), bumped: [...bumped].sort(), missing };
}

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, stdio: 'pipe', encoding: 'utf-8' }).trim();
}

function insideWorkTree(): boolean {
  try {
    git(['rev-parse', '--is-inside-work-tree']);
    return true;
  } catch {
    return false;
  }
}

function resolveBase(): string | null {
  for (const ref of BASE_CANDIDATES) {
    try {
      return git(['merge-base', ref, 'HEAD']);
    } catch {
      // ref absent in this checkout — try the next candidate.
    }
  }
  return null;
}

function changedPaths(base: string): string[] {
  const out = git(['diff', '--name-only', `${base}..HEAD`]);
  return out.length > 0 ? out.split('\n').map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * The module map as it was at `base`. A genuinely ABSENT map (the file did not
 * exist at base — the bootstrap commit) degrades to an empty map: there is nothing
 * to compare against, and every stamped head module reads as newly-confirmed. But a
 * map that IS present at base and fails to parse must fail LOUD, not silently
 * collapse to empty — collapsing would make every head module read as bumped and
 * disable the gate exactly when the base is corrupt (fail-open). Fail closed instead.
 */
function mapAtBase(base: string): ModuleMap {
  let text: string;
  try {
    text = git(['show', `${base}:${MODULE_MAP_REL}`]);
  } catch {
    return { modules: [] };
  }
  const parsed = ModuleMapSchema.safeParse(parseYaml(text));
  if (!parsed.success) {
    throw new Error(
      `module-map.yaml at base ${base.slice(0, 12)} is present but does not parse — ` +
        `refusing to run the sync gate open. ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    );
  }
  return parsed.data;
}

function main(): void {
  if (!insideWorkTree()) {
    console.log('✓ knowledge:check skipped — not a git work tree');
    return;
  }
  const base = resolveBase();
  if (base === null) {
    console.error('✗ knowledge:check could not resolve a base commit (origin/main / main).');
    console.error('  In CI, check out with `fetch-depth: 0` so the base branch history is present.');
    process.exit(1);
  }
  const headMap = loadModuleMap(KNOWLEDGE_PATH, REPO_ROOT);
  if (headMap === null) {
    console.log('✓ knowledge:check skipped — no module-map.yaml');
    return;
  }
  const { missing, srcModules } = partitionMissingSync(changedPaths(base), mapAtBase(base), headMap);
  if (missing.length > 0) {
    console.error(`✗ ${missing.length} module(s) changed source without confirming knowledge:`);
    for (const m of missing) {
      console.error(
        `    ${m} — run \`prospec knowledge verify ${m}\` (after updating its knowledge if needed) and commit module-map.yaml`,
      );
    }
    console.error(
      `  base ${base.slice(0, 12)}: a module whose declared source paths changed must bump its last_verified in the same change.`,
    );
    process.exit(1);
  }
  console.log(
    `✓ knowledge:check — ${srcModules.length} source-touched module(s) all confirmed since ${base.slice(0, 12)}`,
  );
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main();
}
