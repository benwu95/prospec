import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { scanDirSync, classifyModulePath } from './scanner.js';
import { parseYaml } from './yaml-utils.js';
import { withoutFencedBlocks } from './markdown-fences.js';
import { ARCHIVE_NATIVE_GLOB } from './language-policy.js';
import { parseConstitutionRules } from './constitution-parser.js';
import { defaultExecutableProbe, unspawnableReason, type ExecutableProbe } from './test-runner.js';
import { parseTaskLine, type TaskKind } from './task-markers.js';
import {
  ARCHIVED_EXCLUDES,
  isArchivedSpec,
  isSafeResourceName,
  loadFeatureMap,
  readIndex,
  readModuleReadme,
} from './knowledge-reader.js';
import { estimateTokens } from './token-accounting.js';
import { CORE_CONVENTIONS } from '../types/conventions.js';
import { DRIFT_REPORT_FILENAME, type ConstitutionRuleEntry } from '../types/drift-report.js';
import { ESCAPED_DEFECT_REPORT_FILENAME } from '../types/escaped-defect.js';
import type { ModuleMap } from '../types/module-map.js';
import type { FeatureMap } from '../types/feature-map.js';
import type { KnowledgeSizeBudget } from '../types/config.js';

/**
 * Drift source collectors — ALL filesystem/git I/O for `prospec check`
 * lives here. Collectors emit plain data; the evaluators in
 * drift-checker.ts are pure functions over these structures, which is
 * what keeps the check deterministic and unit-testable.
 *
 * Unavailable sources are reported as { available: false, reason } so the
 * evaluators can mark the corresponding check `skipped` — never a silent
 * pass (REQ-LIB-014..016).
 */

/** REQ-{MODULE}-{NUMBER} with uppercase, possibly hyphenated module names. */
const REQ_ID_PATTERN = /REQ-(?:[A-Z][A-Z0-9]*-)+\d+/g;

/** Reports `prospec check` itself writes into the repo root. Excluded from the
 *  change digest so a command cannot invalidate the very baselines it feeds —
 *  derived from the filename constants, never re-typed, so a future report joins
 *  this list by construction. */
const DIGEST_EXCLUDED_REPORTS = [
  DRIFT_REPORT_FILENAME,
  ESCAPED_DEFECT_REPORT_FILENAME,
] as const;

// Archived exclusion is single-sourced in knowledge-reader.ts so the MCP
// spec listing and this check can never drift apart (REQ-MCP-003).

export interface ReqDefinitionIndex {
  available: boolean;
  reason?: string;
  ids: string[];
}

export interface ReqReference {
  id: string;
  source_path: string;
  line: number;
}

export interface LinkReference {
  raw_target: string;
  resolved_path: string;
  exists: boolean;
  source_path: string;
  line: number;
}

export interface LinkSource {
  available: boolean;
  reason?: string;
  links: LinkReference[];
}

export interface ImportEdge {
  from_path: string;
  from_module: string;
  to_module: string;
  specifier: string;
  line: number;
}

export interface ImportEdgeSource {
  available: boolean;
  reason?: string;
  edges: ImportEdge[];
}

export interface ModuleTimestamps {
  name: string;
  readme_path: string;
  readme_exists: boolean;
  last_src_commit: string | null;
  last_readme_commit: string | null;
}

export interface GitTimestampSource {
  available: boolean;
  reason?: string;
  modules: ModuleTimestamps[];
}

export interface McpReadmeCountClaim {
  module: string;
  readme_path: string;
  line: number;
  /** The counted noun as written in the README (e.g. "resources", "tools"). */
  noun: string;
  /** Repo-relative source file the claim names. */
  source_path: string;
  claimed: number;
  actual: number;
}

export interface McpReadmeCountSource {
  available: boolean;
  reason?: string;
  claims: McpReadmeCountClaim[];
}

/** Which progressive-loading layer a knowledge file belongs to. */
export type KnowledgeSizeKind = 'l1' | 'l2';

export interface KnowledgeSizeItem {
  /** repo-relative path of the measured knowledge file */
  source_path: string;
  kind: KnowledgeSizeKind;
  tokens: number;
  lines: number;
}

export interface KnowledgeSizeSource {
  available: boolean;
  reason?: string;
  budget: KnowledgeSizeBudget;
  items: KnowledgeSizeItem[];
}

export type { TaskKind } from './task-markers.js';

export interface TaskItem {
  checked: boolean;
  kind: TaskKind;
  text: string;
  line: number;
}

export interface TaskSource {
  available: boolean;
  reason?: string;
  changes: Array<{ name: string; tasks_path: string; tasks: TaskItem[] }>;
}

export interface ReviewProvenanceChange {
  name: string;
  /** repo-relative metadata.yaml path (finding anchor). */
  source_path: string;
  status: string;
  scale: string;
  /** digest recorded by `--record-review`; null when never reviewed. */
  recorded_digest: string | null;
  /** True when `backfill-draft.md` sits beside the metadata — the backfill
   *  exemption keys on this, not on the hand-editable `scale`, exactly like
   *  test-provenance (issue #103 aligned the two). */
  backfill_draft_present: boolean;
}

export interface ReviewProvenanceSource {
  available: boolean;
  reason?: string;
  /** current code fingerprint to compare each recorded digest against. */
  current_digest: string | null;
  changes: ReviewProvenanceChange[];
}

/** Required metadata fields a well-formed change carries — checked for presence
 *  (non-empty), stricter than ChangeMetadataSchema (which makes `scale` optional). */
export const REQUIRED_METADATA_FIELDS = ['name', 'created_at', 'status', 'scale'] as const;

/** Statuses at/after which a /prospec-verify S/A grade must be recorded. */
const GRADED_STATUSES = new Set(['verified', 'archived']);

export interface MetadataCompletenessChange {
  name: string;
  /** repo-relative metadata.yaml path (finding anchor). */
  source_path: string;
  status: string;
  /** subset of REQUIRED_METADATA_FIELDS absent or empty in metadata.yaml. */
  missing_fields: string[];
  /** true when status is verified/archived but quality_log has no S/A verify grade. */
  missing_verify_grade: boolean;
}

export interface MetadataCompletenessSource {
  available: boolean;
  reason?: string;
  changes: MetadataCompletenessChange[];
}

export interface TestProvenanceChange {
  name: string;
  /** repo-relative metadata.yaml path (finding anchor). */
  source_path: string;
  status: string;
  scale: string;
  /** digest recorded by `--record-tests`; null when no run was ever recorded. */
  recorded_digest: string | null;
  /** exit code of the recorded run; null when absent or not a number. */
  recorded_exit_code: number | null;
  /** the recorded command, for a finding that has to name what failed. */
  recorded_command: string;
  /** True when `backfill-draft.md` sits beside the metadata — proof the change
   *  came through `/prospec-promote-backfill` and really does record pre-existing
   *  code. `scale` alone is hand-editable, so the backfill relaxation is gated on
   *  this, exactly as the verify skill's Entry Gate requires. */
  backfill_draft_present: boolean;
}

export interface TestProvenanceSource {
  available: boolean;
  reason?: string;
  /** Why the test command cannot run on this machine (unset / unspawnable shim),
   *  or null when it can. A fact about THIS machine, deliberately NOT source-level
   *  unavailability: recorded runs are still enumerated so a recorded non-zero
   *  exit is never suppressed by an unresolvable command (issue #103). */
  command_unavailable_reason: string | null;
  /** current code fingerprint to compare each recorded digest against. */
  current_digest: string | null;
  changes: TestProvenanceChange[];
}

export interface ConstitutionRuleSource {
  available: boolean;
  reason?: string;
  /** repo-relative CONSTITUTION.md path (finding anchor). */
  source_path: string;
  rules: ConstitutionRuleEntry[];
}

export interface QualityLedgerChange {
  /** Canonical change name — metadata `name`, falling back to the directory name.
   *  `introduced_by` is registered as this name, so it is what resolution keys on. */
  name: string;
  /** The ledger directory name. Archived dirs carry a `YYYY-MM-DD-` prefix the
   *  canonical name does not, which is why both are reported. */
  dir: string;
  /** `changes` for an in-flight change, `archive` for an archived one. */
  ledger: 'changes' | 'archive';
  status: string;
  /** the change this one blames for letting a defect through, when registered. */
  introduced_by: string | null;
  /** `{skill, result}` pairs distilled from quality_log, in file order. */
  gate_results: Array<{ skill: string; result: string }>;
}

export interface QualityLedgerSource {
  available: boolean;
  reason?: string;
  /** False when `.prospec/archive/` is absent (gitignored by design) — the sample
   *  is then honestly partial rather than silently so. */
  archive_available: boolean;
  changes: QualityLedgerChange[];
}

/** Collect defined REQ ids from feature spec headings (deprecated ~~REQ~~ included). */
export function collectReqDefinitions(featuresDir: string): ReqDefinitionIndex {
  if (!existsSync(featuresDir)) {
    return { available: false, reason: `source unavailable: ${featuresDir} not found`, ids: [] };
  }
  const files = readdirSync(featuresDir).filter(
    (f) => f.endsWith('.md') && !isArchivedSpec(f),
  );
  if (files.length === 0) {
    return { available: false, reason: `source unavailable: no feature specs in ${featuresDir}`, ids: [] };
  }
  const headingReq = /^#{1,6}\s+~{0,2}(REQ-(?:[A-Z][A-Z0-9]*-)+\d+)/;
  const ids = new Set<string>();
  for (const file of files.sort()) {
    const lines = readFileSync(path.join(featuresDir, file), 'utf-8').split('\n');
    for (const line of lines) {
      const id = headingReq.exec(line)?.[1];
      if (id !== undefined) ids.add(id);
    }
  }
  return { available: true, ids: [...ids].sort() };
}

/** Collect every REQ id mention in markdown under the given roots. */
export function collectReqReferences(roots: string[], cwd: string): ReqReference[] {
  const refs: ReqReference[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    for (const { file, relPath } of markdownFiles(root, cwd)) {
      if (seen.has(file)) continue;
      seen.add(file);
      const lines = withoutFencedBlocks(readFileSync(file, 'utf-8').split('\n'));
      lines.forEach((text, i) => {
        for (const m of text.matchAll(REQ_ID_PATTERN)) {
          refs.push({ id: m[0], source_path: relPath, line: i + 1 });
        }
      });
    }
  }
  return refs;
}

/** Collect relative markdown link targets and their on-disk existence. */
export function collectMarkdownLinks(roots: string[], cwd: string): LinkSource {
  const existingRoots = roots.filter((r) => existsSync(path.resolve(cwd, r)));
  if (existingRoots.length === 0) {
    return {
      available: false,
      reason: 'source unavailable: no markdown roots (specs/knowledge/base dir) found',
      links: [],
    };
  }
  // `<...>` targets allow spaces; plain targets allow one balanced paren level
  // so `design (v2).md` style names do not truncate at the first `)`.
  const linkPattern = /\[[^\]]*\]\(<([^>]+)>\)|\[[^\]]*\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;
  const links: LinkReference[] = [];
  const seen = new Set<string>();
  for (const root of existingRoots) {
    for (const { file, relPath } of markdownFiles(root, cwd)) {
      if (seen.has(file)) continue;
      seen.add(file);
      const lines = withoutFencedBlocks(readFileSync(file, 'utf-8').split('\n'));
      lines.forEach((text, i) => {
        for (const m of text.matchAll(linkPattern)) {
          const raw = m[1] ?? m[2];
          if (raw === undefined || !isCheckableLink(raw)) continue;
          let target = raw.replace(/[#?].*$/, '');
          if (target === '') continue;
          try {
            target = decodeURI(target);
          } catch {
            // keep the raw target — a malformed escape is still a checkable string
          }
          const resolved = path
            .normalize(path.join(path.dirname(relPath), target))
            .replace(/\\/g, '/');
          const abs = path.resolve(cwd, resolved);
          // never probe outside the repo — a `../..` link must not become a
          // filesystem-existence oracle in reports or PR comments
          if (path.relative(cwd, abs).startsWith('..')) continue;
          links.push({
            raw_target: raw,
            resolved_path: resolved,
            // existence is resolved through symlinks: an in-repo link that
            // lexically stays inside cwd but physically points outside must
            // not leak the outside file's existence (same containment
            // invariant as knowledge-reader's content reads)
            exists: existsContained(abs, cwd),
            source_path: relPath,
            line: i + 1,
          });
        }
      });
    }
  }
  return { available: true, links };
}

/**
 * Collect cross-module static import edges, attributed via module-map paths.
 * Deliberately JS/TS-only: it parses ES-module `import … from` / side-effect
 * imports. Other languages resolve imports through their own systems (package
 * roots, namespaces) a lightweight scan cannot follow, and each has a
 * purpose-built architecture linter (import-linter, deptrac, packwerk,
 * dependency-cruiser, go-arch-lint, …) that does it properly — so on a project
 * with no JS/TS source this reports honest `skipped`, never a vacuous PASS.
 */
export function collectImportEdges(cwd: string, moduleMap: ModuleMap): ImportEdgeSource {
  const toModule = moduleAttributor(moduleMap);
  // Whole-content matching so multi-line `import { … }\nfrom 'x'` statements are
  // caught. `from` is mandatory except for bare side-effect imports — otherwise
  // `export const X = './path'` string constants would register as edges.
  const importPattern =
    /(?:^|\n)\s*(?:(?:import|export)\s+[^;'"`]*?from\s*|import\s*)['"]([^'"]+)['"]/g;
  const edges: ImportEdge[] = [];
  let anyJsTsSource = false;
  for (const entry of moduleMap.modules) {
    for (const prefix of entry.paths) {
      const isGlob = prefix.includes('*');
      // A literal dir prefix is gated by its on-disk existence; a domain glob
      // ('**/auth/**') has no literal path to stat, so it is scanned directly.
      if (!isGlob && !existsSync(path.resolve(cwd, prefix))) continue;
      const pattern = importScanPattern(prefix, cwd);
      if (pattern === null) continue; // non-source file entry — carries no import edges
      const { files } = scanDirSync(pattern, { cwd });
      // The check is `available` only where JS/TS source is actually found —
      // a path (or whole project) with no .ts/.js contributes nothing, so a
      // non-JS/TS project degrades to honest `skipped`, not a vacuous PASS.
      if (files.length === 0) continue;
      anyJsTsSource = true;
      for (const relPath of files) {
        const fromModule = toModule(relPath);
        if (fromModule !== entry.name) continue; // longest-prefix owner emits the edge once
        // blank block comments AND template-literal interiors (newlines kept) —
        // commented-out or string-embedded imports are not real edges
        const content = readFileSync(path.resolve(cwd, relPath), 'utf-8')
          .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
          .replace(/`(?:\\[\s\S]|[^\\`])*`/g, (c) => c.replace(/[^\n]/g, ' '));
        for (const m of content.matchAll(importPattern)) {
          const specifier = m[1];
          if (specifier === undefined || !specifier.startsWith('.')) continue;
          const resolved = path.normalize(path.join(path.dirname(relPath), specifier));
          const target = toModule(resolved);
          if (target === null || target === fromModule) continue;
          const matchOffset = (m.index ?? 0) + m[0].indexOf(specifier);
          edges.push({
            from_path: relPath,
            from_module: fromModule,
            to_module: target,
            specifier,
            line: content.slice(0, matchOffset).split('\n').length,
          });
        }
      }
    }
  }
  if (!anyJsTsSource) {
    return {
      available: false,
      reason:
        "source unavailable: no JavaScript/TypeScript source under module paths (import-direction is JS/TS-only — use your language's import linter, e.g. import-linter / deptrac / packwerk, for others)",
      edges: [],
    };
  }
  return { available: true, edges };
}

/** Collect per-module last-commit timestamps for sources and READMEs. */
export function collectGitTimestamps(
  cwd: string,
  moduleMap: ModuleMap,
  knowledgePath: string,
): GitTimestampSource {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, stdio: 'pipe' });
  } catch {
    return { available: false, reason: 'source unavailable: not a git repository', modules: [] };
  }
  try {
    const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    }).trim();
    if (shallow === 'true') {
      // Shallow boundary commits carry the clone date, not the real history —
      // those would be fabricated staleness facts (REQ-LIB-015: shallow → skipped).
      return {
        available: false,
        reason: 'source unavailable: shallow git clone (commit history incomplete)',
        modules: [],
      };
    }
  } catch {
    // very old git without --is-shallow-repository — proceed with best effort
  }
  const modules: ModuleTimestamps[] = [];
  for (const entry of moduleMap.modules) {
    // a module name is one path segment, never a traversal — a crafted name
    // (e.g. "../../etc") must not turn health into an existence oracle for
    // files outside the repo (same guard as the MCP listing surface)
    if (!isSafeResourceName(entry.name)) continue;
    const readmeRel = path.join(
      path.relative(cwd, path.resolve(cwd, knowledgePath)),
      'modules',
      entry.name,
      'README.md',
    );
    const readmeExists = existsSync(path.resolve(cwd, readmeRel));
    modules.push({
      name: entry.name,
      readme_path: readmeRel.replace(/\\/g, '/'),
      readme_exists: readmeExists,
      last_src_commit: gitLastCommit(cwd, entry.paths),
      last_readme_commit: readmeExists ? gitLastCommit(cwd, [readmeRel]) : null,
    });
  }
  return { available: true, modules };
}

/** Whitelisted MCP README count claims — a prose noun → the code call that realizes it. */
const MCP_README_COUNT_RULES: ReadonlyArray<{ noun: string; token: RegExp }> = [
  { noun: 'resources', token: /\bregisterResource\s*\(/ },
  { noun: 'tools', token: /\bregisterTool\s*\(/ },
];

// "… `src/foo.ts` … registers 6 resources + 2 tools …" — one README line naming
// a source file and declaring its resource (and optional tool) count.
const MCP_README_COUNT_CLAIM =
  /`(src\/[^`]+\.[cm]?tsx?)`[^\n]*?\bregisters\s+(\d+)\s+resources(?:\s*\+\s*(\d+)\s+tools)?/;

/**
 * Collect declared-vs-actual MCP count claims from module READMEs (REQ-LIB-020).
 * A README line stating "`src/x.ts` … registers N resources + M tools" is
 * checked against the actual registerResource/registerTool call count in that
 * file. Whitelist-driven (MCP_README_COUNT_RULES) — prose that does not match a
 * rule yields no claim, never a false finding. The named file missing yields no
 * claim (file-paths owns broken links). Counting strips comments so a
 * commented-out call is not counted. Scope is the MCP registration pattern only
 * (hence the `mcp-` check id) — root-README badges/inventory counts are not covered.
 */
export function collectMcpReadmeCounts(
  cwd: string,
  knowledgePath: string,
  moduleMap: ModuleMap,
): McpReadmeCountSource {
  const claims: McpReadmeCountClaim[] = [];
  const knowledgeRel = path.relative(cwd, path.resolve(cwd, knowledgePath));
  for (const entry of moduleMap.modules) {
    if (!isSafeResourceName(entry.name)) continue;
    const readme = readModuleReadme(knowledgePath, entry.name);
    if (readme === null) continue;
    const readmeRel = path
      .join(knowledgeRel, 'modules', entry.name, 'README.md')
      .replace(/\\/g, '/');
    // strip fenced examples first — a count claim inside a ``` block is illustrative,
    // not a live claim (same reason as collectReqReferences/collectMarkdownLinks)
    withoutFencedBlocks(readme.split('\n')).forEach((line, i) => {
      const m = MCP_README_COUNT_CLAIM.exec(line);
      if (m === null) return;
      const sourceRel = m[1]!;
      const code = readContainedFile(cwd, sourceRel);
      if (code === null) return;
      const declared = [{ noun: 'resources', claimed: Number(m[2]) }];
      if (m[3] !== undefined) declared.push({ noun: 'tools', claimed: Number(m[3]) });
      for (const { noun, claimed } of declared) {
        const rule = MCP_README_COUNT_RULES.find((r) => r.noun === noun);
        if (rule === undefined) continue;
        claims.push({
          module: entry.name,
          readme_path: readmeRel,
          line: i + 1,
          noun,
          source_path: sourceRel.replace(/\\/g, '/'),
          claimed,
          actual: countCalls(code, rule.token),
        });
      }
    });
  }
  return { available: true, claims };
}

/**
 * Collect token/line sizes of the knowledge files the progressive-loading
 * budget governs (REQ-LIB-027): `index.md` + each core convention (L1) and
 * every module README (L2). Sizes come from the deterministic `estimateTokens`
 * (chars-per-token) so the check stays zero-LLM; the pure evaluator compares
 * them against `budget`. L0 (`AGENTS.md`/`CLAUDE.md`) is agent-injected config,
 * not a knowledge-base file, and is out of scope. The whole check skips when the
 * knowledge base is absent — never a fabricated pass. Module READMEs are
 * enumerated straight from `modules/` (no module-map needed: sizing needs only
 * the file, and the module name is its directory).
 */
export function collectKnowledgeSize(
  cwd: string,
  baseDir: string,
  knowledgePath: string,
  budget: KnowledgeSizeBudget,
): KnowledgeSizeSource {
  if (!existsSync(path.resolve(cwd, knowledgePath))) {
    return {
      available: false,
      reason: 'source unavailable: knowledge base not found',
      budget,
      items: [],
    };
  }
  const knowledgeRel = path.relative(cwd, path.resolve(cwd, knowledgePath)).replace(/\\/g, '/');
  const items: KnowledgeSizeItem[] = [];
  const measure = (relPath: string, kind: KnowledgeSizeKind, content: string | null): void => {
    if (content === null) return;
    items.push({
      source_path: relPath.replace(/\\/g, '/'),
      kind,
      tokens: estimateTokens(content),
      lines: countLines(content),
    });
  };

  // L1 — index.md (via the canonical base-dir reader, so this can never disagree
  // with the services that write it) + each core convention.
  measure(path.relative(cwd, path.resolve(cwd, baseDir, 'index.md')), 'l1', readIndex(baseDir));
  for (const conv of CORE_CONVENTIONS) {
    const rel = path.join(knowledgeRel, conv);
    measure(rel, 'l1', readContainedFile(cwd, rel));
  }

  // L2 — every module README under modules/.
  const modulesDir = path.resolve(cwd, knowledgePath, 'modules');
  if (existsSync(modulesDir)) {
    for (const name of readdirSync(modulesDir).sort()) {
      if (!isSafeResourceName(name)) continue;
      measure(
        path.join(knowledgeRel, 'modules', name, 'README.md'),
        'l2',
        readModuleReadme(knowledgePath, name),
      );
    }
  }

  return { available: true, budget, items };
}

/** Collect checkbox/kind state from every active change's tasks.md. */
export function collectTaskStates(cwd: string): TaskSource {
  const changesDir = path.resolve(cwd, '.prospec/changes');
  if (!existsSync(changesDir)) {
    return {
      available: false,
      reason: 'source unavailable: .prospec/changes/ not found (not version-controlled)',
      changes: [],
    };
  }
  // The frozen kind grammar has exactly one executable copy: lib/task-markers
  // (shared with archive.service so verify V1 and archive can never disagree).
  const changes: TaskSource['changes'] = [];
  for (const name of readdirSync(changesDir).sort()) {
    const tasksPath = path.join(changesDir, name, 'tasks.md');
    if (!existsSync(tasksPath)) continue;
    const tasks: TaskItem[] = [];
    readFileSync(tasksPath, 'utf-8').split('\n').forEach((line, i) => {
      const task = parseTaskLine(line);
      if (task === null) return;
      tasks.push({ ...task, line: i + 1 });
    });
    changes.push({
      name,
      tasks_path: path.relative(cwd, tasksPath).replace(/\\/g, '/'),
      tasks,
    });
  }
  return { available: true, changes };
}

/** REQ headings a feature spec owns. A `~~deprecated~~` heading starts with
 *  `~~`, so the id capture fails at that offset — governance operates on the
 *  live spec surface, never historical/removed behavior. Shared with the
 *  archive feature-map bootstrap so seeded modules and the self-validating
 *  drift extract module-prefix REQs identically (no dual-copy drift). */
export const ACTIVE_REQ_HEADING = /^#{1,6}\s+(REQ-(?:[A-Z][A-Z0-9]*-)+\d+)/;

/** REQ-{PREFIX}-{NNN} → {PREFIX} (multi-segment safe, e.g. API-MIDDLEWARE). */
export function reqIdToPrefix(id: string): string {
  return id.replace(/^REQ-/, '').replace(/-\d+$/, '');
}

export interface FeatureSpecReqs {
  /** Canonical slug = filename without `.md` (matches frontmatter `feature:`). */
  feature: string;
  source_path: string;
  reqs: Array<{ id: string; prefix: string; line: number }>;
}

export interface FeatureMapGovernanceSource {
  available: boolean;
  reason?: string;
  featureMap: FeatureMap;
  /** module-map module names — the legal-prefix and module-edge universe. */
  moduleNames: string[];
  specs: FeatureSpecReqs[];
}

/**
 * Collect the facts both feature-map governance checks share: the loaded
 * index, the module name set, and every active REQ heading grouped by the
 * feature spec that owns it. The index is optional — when feature-map.yaml is
 * absent the source is unavailable, so both checks skip (never a false
 * positive). A present-but-invalid index fails loud via loadFeatureMap.
 */
export function collectFeatureMapGovernance(
  featuresDir: string,
  knowledgePath: string,
  cwd: string,
  moduleMap: ModuleMap,
): FeatureMapGovernanceSource {
  const empty = { featureMap: { features: [] }, moduleNames: [], specs: [] };
  const featureMap = loadFeatureMap(knowledgePath);
  if (featureMap === null) {
    return {
      available: false,
      reason: 'source unavailable: feature-map.yaml not present (optional index — checks skipped)',
      ...empty,
    };
  }
  if (!existsSync(featuresDir)) {
    return { available: false, reason: `source unavailable: ${featuresDir} not found`, ...empty };
  }
  const specs: FeatureSpecReqs[] = [];
  const files = readdirSync(featuresDir)
    .filter((f) => f.endsWith('.md') && !isArchivedSpec(f))
    .sort();
  for (const file of files) {
    const reqs: FeatureSpecReqs['reqs'] = [];
    readFileSync(path.join(featuresDir, file), 'utf-8')
      .split('\n')
      .forEach((line, i) => {
        const id = ACTIVE_REQ_HEADING.exec(line)?.[1];
        if (id === undefined) return;
        reqs.push({ id, prefix: reqIdToPrefix(id), line: i + 1 });
      });
    specs.push({
      feature: file.slice(0, -'.md'.length),
      source_path: path.relative(cwd, path.join(featuresDir, file)).replace(/\\/g, '/'),
      reqs,
    });
  }
  return { available: true, featureMap, moduleNames: moduleMap.modules.map((m) => m.name), specs };
}

interface PathMatcher {
  name: string;
  weight: number;
  test: (relPath: string) => boolean;
}

/**
 * Build a matcher for one module-map path. A domain glob (`**\/auth/**`) matches
 * any file carrying that directory segment; a literal prefix (`src/lib`, also
 * `packages/web/**`) matches by path-prefix. Literal prefixes always outrank
 * globs, and among each kind the longer match wins.
 */
function makePathMatcher(rawPrefix: string, name: string): PathMatcher {
  const prefix = rawPrefix.replace(/\/+$/, '');
  if (prefix.startsWith('**/')) {
    const segment = prefix.replace(/\/\*\*$/, '').slice(3);
    return { name, weight: segment.length, test: (p) => p.split('/').includes(segment) };
  }
  const literal = prefix.replace(/\/\*\*$/, '');
  return {
    name,
    weight: 1000 + literal.length,
    test: (p) => p === literal || p.startsWith(`${literal}/`),
  };
}

/** Map a repo-relative path to its module by longest module-map path prefix. */
export function moduleAttributor(moduleMap: ModuleMap): (relPath: string) => string | null {
  const matchers = moduleMap.modules
    .flatMap((m) => m.paths.map((p) => makePathMatcher(p, m.name)))
    .sort((a, b) => b.weight - a.weight);
  return (relPath) => {
    const normalized = relPath.replace(/\\/g, '/');
    for (const matcher of matchers) {
      if (matcher.test(normalized)) return matcher.name;
    }
    return null;
  };
}

/**
 * Existence check that refuses to follow a symlink out of the repo. A target
 * whose lexical path stays inside cwd but whose real (symlink-resolved) path
 * lands outside is reported as non-existent, closing the existence oracle.
 */
function existsContained(abs: string, cwd: string): boolean {
  if (!existsSync(abs)) return false;
  try {
    const rel = path.relative(realpathSync(cwd), realpathSync(abs));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  } catch {
    return false;
  }
}

// The extensions the import-direction scan understands — the SINGLE source for
// both the directory-scan glob and the single-file-entry guard, so the two can
// never drift. NOTE: this check is JS/TS-ESM-specific (the `import … from '…'`
// regex in collectImportEdges parses ESM syntax only); a downstream project in
// another language gets no import-direction edges from it. Widening to other
// languages means per-language import parsing, not just more extensions here.
const IMPORT_SCAN_EXTS = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx'] as const;
const IMPORT_SCAN_GLOB = `*.{${IMPORT_SCAN_EXTS.join(',')}}`;
const IMPORT_SCAN_FILE_RE = new RegExp(`\\.(?:${IMPORT_SCAN_EXTS.join('|')})$`);

/**
 * Build the file-scan glob for a module path entry, or `null` when the entry
 * carries no scannable source. A single SOURCE file entry (`src/lib/config.ts`)
 * is scanned as just itself; a NON-source file entry (`docs/x.md`) yields `null`
 * — import edges come only from source, and globbing `<file>/**` would ENOTDIR.
 * A literal dir prefix (`src/lib` → `src/lib/**\/*.ext`) expands to its subtree;
 * domain globs (`**\/auth/**`, `packages/web/**` → `<prefix>/*.ext`) are verbatim.
 */
function importScanPattern(prefix: string, cwd: string): string | null {
  if (classifyModulePath(prefix, cwd) === 'file') {
    return IMPORT_SCAN_FILE_RE.test(prefix) ? prefix : null;
  }
  return prefix.endsWith('/**')
    ? `${prefix}/${IMPORT_SCAN_GLOB}`
    : `${prefix}/**/${IMPORT_SCAN_GLOB}`;
}

function markdownFiles(root: string, cwd: string): Array<{ file: string; relPath: string }> {
  const absRoot = path.resolve(cwd, root);
  if (!existsSync(absRoot)) return [];
  const { files } = scanDirSync('**/*.md', { cwd: absRoot, exclude: ARCHIVED_EXCLUDES });
  return files.map((f) => ({
    file: path.join(absRoot, f),
    relPath: path.join(path.relative(cwd, absRoot), f).replace(/\\/g, '/'),
  }));
}

function isCheckableLink(raw: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return false; // http:, https:, mailto:, vscode:, …
  if (raw.startsWith('#') || raw.startsWith('/')) return false;
  if (raw.includes('{') || raw.includes('*')) return false; // placeholder / glob noise
  return true;
}

/** Read a repo-relative file, refusing to escape the repo (symlink-resolved). */
function readContainedFile(cwd: string, relPath: string): string | null {
  const abs = path.resolve(cwd, relPath);
  if (path.relative(cwd, abs).startsWith('..') || !existsContained(abs, cwd)) return null;
  try {
    return readFileSync(abs, 'utf-8');
  } catch {
    // A path that exists but cannot be read (EISDIR / EACCES / too large) is
    // reported as absent: every caller already degrades a null to an honest
    // `{available:false}` skip, whereas a throw here kills the whole check run.
    return null;
  }
}

/** Text line count (matches `wc -l`: a trailing newline does not add a line). */
function countLines(text: string): number {
  if (text === '') return 0;
  const n = text.split('\n').length;
  return text.endsWith('\n') ? n - 1 : n;
}

/**
 * Count a code-call token outside comments AND strings — a commented-out or
 * string-embedded call is not a real call. Block comments, template literals,
 * and quoted strings are blanked (newlines preserved) BEFORE stripping line
 * comments, so a `//` inside a string (e.g. `"spec://x"`) can no longer
 * truncate the line and undercount a real call after it.
 */
function countCalls(content: string, token: RegExp): number {
  const code = content
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/(['"])(?:\\.|(?!\1)[^\\\n])*\1/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '');
  return (code.match(new RegExp(token.source, 'g')) ?? []).length;
}

/** Upper bound on captured git stdout. The default 1 MB silently turned a large
 *  `git diff HEAD` into an ENOBUFS failure — and a failure the digest then folded
 *  into a CONSTANT, disabling staleness detection exactly when a change is big.
 *  Generous enough that a real diff never trips it; bounded so a pathological
 *  repo cannot exhaust memory unnoticed. */
const GIT_CAPTURE_MAX_BUFFER = 256 * 1024 * 1024;

/** Run git and capture stdout — null on failure, '' on empty success (the two
 *  must stay distinct: an empty diff is a valid state, a git failure is not). */
function gitCapture(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8',
      maxBuffer: GIT_CAPTURE_MAX_BUFFER,
    });
  } catch {
    return null;
  }
}

function gitLastCommit(cwd: string, paths: string[]): string | null {
  const out = gitCapture(cwd, ['log', '-1', '--format=%cI', '--', ...paths]);
  return out === null ? null : out.trim() || null;
}

/**
 * Content fingerprint of the change's CODE state — NOT git commit timestamps
 * (REQ-LIB-024). The commit boundary is after verify S/A, so review/verify run
 * pre-commit and commit timestamps would all point at the branch base. Hash the
 * working-tree code delta instead: HEAD sha + `git diff HEAD` + untracked
 * contents, covering the WHOLE first-party change (everything `/prospec-review`
 * reviews) via a denylist — excluding only workflow state (`.prospec/`) and
 * check-written reports, generated artifacts (deployed `.claude/`/`.agents/`
 * skills, `dist/`), and lockfiles. This fails CLOSED (over-review), never open:
 * an edit to code outside `src/`+`tests/` (e.g. `scripts/`) still flips
 * staleness, while a `--record-review`/`--record-tests`/status write, a report
 * this very command generated, or an `agent sync` cannot self-trip it. Returns
 * null when not a git repo AND when the diff cannot be captured (honest skip;
 * shallow clones are fine — no history is read, only the working tree).
 *
 * The generated-artifact exclusions are derived from the report filename
 * constants, so adding a new report cannot silently re-open the self-trip hole.
 *
 * Callers pass the result INTO the provenance collectors rather than letting each
 * compute its own: this is the most expensive collector (a whole-tree `git diff`
 * plus a hash of every untracked file), the two results can never differ within a
 * run, and computing it per-collector doubled every `prospec check`.
 */
export function computeChangeDigest(cwd: string): string | null {
  if (!isGitWorkTree(cwd)) return null;
  const scope = [
    '--',
    '.',
    ':(exclude).prospec',
    ...DIGEST_EXCLUDED_REPORTS.map((f) => `:(exclude)${f}`),
    ':(exclude).claude',
    ':(exclude).agents',
    ':(exclude)dist',
    ':(exclude)pnpm-lock.yaml',
    ':(exclude)package-lock.json',
    ':(exclude)yarn.lock',
  ];
  const head = gitCapture(cwd, ['rev-parse', 'HEAD']);
  const diff = gitCapture(cwd, ['diff', 'HEAD', ...scope]);
  // A capture failure (e.g. a diff past gitCapture's buffer) must NOT collapse
  // into a constant digest — that would silently certify stale code as current.
  if (diff === null) return null;
  // Same rule for the untracked listing: `?? ''` here would silently drop the
  // untracked dimension from the digest — fail-open, the pattern issue #103
  // removed. Fail closed to an honest skip instead.
  const untrackedOut = gitCapture(cwd, ['ls-files', '--others', '--exclude-standard', ...scope]);
  if (untrackedOut === null) return null;
  const untracked = untrackedOut
    .split('\n')
    .filter((l) => l.length > 0)
    .sort();
  const hash = createHash('sha256');
  hash.update(`head\0${head === null ? '' : head.trim()}\0diff\0${diff}`);
  for (const rel of untracked) {
    hash.update(`\0file\0${rel}\0`);
    try {
      hash.update(readFileSync(path.resolve(cwd, rel)));
    } catch {
      // unreadable untracked file — fold in only its path (already hashed above)
    }
  }
  return hash.digest('hex');
}

/**
 * Collect review-provenance facts for every change in `.prospec/changes/`
 * (REQ-LIB-024). Mirrors collectTaskStates' change enumeration. Each change
 * carries its status/scale and the digest recorded by `--record-review`, plus
 * the one current code digest to compare against. Unavailable (not a git repo,
 * no `.prospec/changes/`, or the digest cannot be computed) → the check skips,
 * never a fabricated pass.
 */
export function collectReviewProvenance(
  cwd: string,
  digest: string | null,
): ReviewProvenanceSource {
  if (!isGitWorkTree(cwd)) {
    return {
      available: false,
      reason: 'source unavailable: not a git repository',
      current_digest: null,
      changes: [],
    };
  }
  const changesDir = path.resolve(cwd, '.prospec/changes');
  if (!existsSync(changesDir)) {
    return {
      available: false,
      reason: 'source unavailable: .prospec/changes/ not found (not version-controlled)',
      current_digest: null,
      changes: [],
    };
  }
  const current_digest = digest;
  if (current_digest === null) {
    return {
      available: false,
      reason: 'source unavailable: could not compute the current change digest',
      current_digest: null,
      changes: [],
    };
  }
  const changes: ReviewProvenanceChange[] = [];
  for (const entry of enumerateChangeMetadata(changesDir, cwd)) {
    // unparseable metadata — skip this change, never fabricate a finding
    if (entry.meta === null) continue;
    const prov = entry.meta.review_provenance as { digest?: unknown } | undefined;
    changes.push({
      name: entry.name,
      source_path: entry.source_path,
      status: readString(entry.meta.status),
      scale: readString(entry.meta.scale),
      recorded_digest: prov && typeof prov.digest === 'string' ? prov.digest : null,
      backfill_draft_present: existsSync(
        path.join(changesDir, entry.name, 'backfill-draft.md'),
      ),
    });
  }
  return { available: true, current_digest, changes };
}

/**
 * Collect test-provenance facts for every change in `.prospec/changes/`
 * (REQ-LIB-033). Sibling of collectReviewProvenance — same whole-tree digest
 * comparison, reading the baseline `--record-tests` wrote. Unavailable (not a git
 * repo, no `.prospec/changes/`, or the digest cannot be computed) → the check
 * skips, never a fabricated pass. An unresolvable test command is NOT source
 * unavailability — it lands in `command_unavailable_reason` while the changes are
 * still enumerated, so recorded failures survive it (issue #103).
 */
export function collectTestProvenance(
  cwd: string,
  testCommand: string | null,
  digest: string | null,
  /** Injection seam for the platform probe. Omitting it yields the real platform,
   *  so production behaviour cannot be changed by forgetting it — it exists so the
   *  win32 shim branch is provable from a POSIX host. The default carries this
   *  collector's `cwd`, which is the cwd `--record-tests` would spawn the suite in —
   *  the same directory libuv resolves a bare argv[0] against. */
  probe: ExecutableProbe = defaultExecutableProbe(process.env, process.platform, cwd),
): TestProvenanceSource {
  const unavailable = (reason: string): TestProvenanceSource => ({
    available: false,
    reason,
    command_unavailable_reason: null,
    current_digest: null,
    changes: [],
  });
  if (!isGitWorkTree(cwd)) return unavailable('source unavailable: not a git repository');
  const changesDir = path.resolve(cwd, '.prospec/changes');
  if (!existsSync(changesDir)) {
    return unavailable(
      'source unavailable: .prospec/changes/ not found (not version-controlled)',
    );
  }
  const current_digest = digest;
  if (current_digest === null) {
    return unavailable('source unavailable: could not compute the current change digest');
  }
  // An unset or unspawnable command is a fact about THIS machine, not about the
  // recorded runs — it must never gate enumeration. The old early-return here
  // (available: false, changes: []) suppressed recorded non-zero exits, letting a
  // known-red change reach `verified` wherever the command stopped resolving
  // (issue #103). The evaluator judges recorded failures before this reason.
  let command_unavailable_reason: string | null = null;
  if (testCommand === null) {
    command_unavailable_reason =
      'test command unavailable: no test command configured — set tech_stack.test_command in .prospec.yaml';
  } else {
    const unspawnable = unspawnableReason(testCommand, probe);
    if (unspawnable !== null) {
      command_unavailable_reason = `test command unavailable: ${unspawnable}`;
    }
  }
  const changes: TestProvenanceChange[] = [];
  for (const entry of enumerateChangeMetadata(changesDir, cwd)) {
    if (entry.meta === null) continue; // unparseable — metadata-completeness owns that finding
    const prov = entry.meta.test_provenance as
      | { digest?: unknown; exit_code?: unknown; command?: unknown }
      | undefined;
    changes.push({
      name: entry.name,
      source_path: entry.source_path,
      status: readString(entry.meta.status),
      scale: readString(entry.meta.scale),
      recorded_digest: prov && typeof prov.digest === 'string' ? prov.digest : null,
      recorded_exit_code: prov && typeof prov.exit_code === 'number' ? prov.exit_code : null,
      recorded_command: prov ? readString(prov.command) : '',
      backfill_draft_present: existsSync(
        path.join(changesDir, entry.name, 'backfill-draft.md'),
      ),
    });
  }
  return { available: true, command_unavailable_reason, current_digest, changes };
}

/**
 * Collect the Constitution's rule inventory (REQ-LIB-032). The parse itself is the
 * pure `parseConstitutionRules`; this is only the read. Two distinct honest
 * unavailable reasons — the file is missing, or it declares no principles — because
 * an empty inventory is no facts, and no facts must never present as a pass.
 */
export function collectConstitutionRules(
  constitutionPath: string,
  cwd: string,
): ConstitutionRuleSource {
  const source_path = path.relative(cwd, constitutionPath).replace(/\\/g, '/');
  // Read through the canonical contained reader: a `paths.base_dir` escaping the
  // repo must not turn the report into an out-of-tree file oracle, and an
  // unreadable path (EISDIR/EACCES/oversized) must degrade to an honest skip
  // rather than throw out of runChecks and kill every other check.
  const content = readContainedFile(cwd, source_path);
  if (content === null) {
    return {
      available: false,
      reason: `source unavailable: ${source_path} not found or not readable inside the repo`,
      source_path,
      rules: [],
    };
  }
  const rules = parseConstitutionRules(content);
  if (rules.length === 0) {
    return {
      available: false,
      reason: `source unavailable: ${source_path} declares no principles`,
      source_path,
      rules: [],
    };
  }
  return { available: true, source_path, rules };
}

/**
 * Collect the gate ledger across BOTH `.prospec/changes/` and `.prospec/archive/`
 * (REQ-LIB-034) — the input to escaped-defect aggregation. The archive is
 * gitignored by design, so its absence is reported rather than treated as an empty
 * history. Needs no git.
 */
export function collectQualityLedger(cwd: string): QualityLedgerSource {
  const changesDir = path.resolve(cwd, '.prospec/changes');
  const archiveDir = path.resolve(cwd, '.prospec/archive');
  const archive_available = existsSync(archiveDir);
  if (!existsSync(changesDir) && !archive_available) {
    return {
      available: false,
      reason: 'source unavailable: neither .prospec/changes/ nor .prospec/archive/ found',
      archive_available: false,
      changes: [],
    };
  }
  const changes: QualityLedgerChange[] = [];
  const ledgers: Array<{ dir: string; ledger: 'changes' | 'archive' }> = [
    { dir: changesDir, ledger: 'changes' },
    { dir: archiveDir, ledger: 'archive' },
  ];
  for (const { dir, ledger } of ledgers) {
    if (!existsSync(dir)) continue;
    for (const entry of enumerateChangeMetadata(dir, cwd)) {
      if (entry.meta === null) continue; // unparseable — no gate facts to harvest
      const introduced = entry.meta.introduced_by;
      const declaredName = readString(entry.meta.name).trim();
      changes.push({
        name: declaredName.length > 0 ? declaredName : entry.name,
        dir: entry.name,
        ledger,
        status: readString(entry.meta.status),
        introduced_by:
          typeof introduced === 'string' && introduced.trim().length > 0
            ? introduced.trim()
            : null,
        gate_results: readGateResults(entry.meta.quality_log),
      });
    }
  }
  return { available: true, archive_available, changes };
}

/** Distil quality_log into `{skill, result}` pairs, dropping malformed entries —
 *  an aggregate must not invent a gate record it cannot read. */
function readGateResults(quality_log: unknown): Array<{ skill: string; result: string }> {
  if (!Array.isArray(quality_log)) return [];
  const out: Array<{ skill: string; result: string }> = [];
  for (const entry of quality_log) {
    if (entry === null || typeof entry !== 'object') continue;
    const e = entry as { skill?: unknown; result?: unknown };
    if (typeof e.skill !== 'string' || typeof e.result !== 'string') continue;
    // A blank skill/result is as malformed as a missing one — and downstream the
    // escaped-defect schema rejects an empty gate name, so letting it through
    // would take the whole report down instead of dropping one bad record.
    if (e.skill.trim().length === 0 || e.result.trim().length === 0) continue;
    // Both trimmed, symmetrically: an untrimmed result made `'PASS '` invisible to
    // the exact-match PASS comparison — the change silently left the escape stats.
    out.push({ skill: e.skill.trim(), result: e.result.trim() });
  }
  return out;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Exported for the record paths in check.service, which must tell "not a git
 *  repository" apart from "in a repo, but the digest could not be computed"
 *  (issue #103: both used to report the former). */
export function isGitWorkTree(cwd: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Enumerate one change ledger directory, yielding every entry that HAS a
 * metadata.yaml. `meta` is null when the file is unparseable or not a mapping, so
 * each caller keeps its own policy for a corrupt record (review-provenance skips
 * it; metadata-completeness reports it fully incomplete) instead of four
 * hand-copied enumerations drifting apart (PB-006).
 */
function enumerateChangeMetadata(
  dir: string,
  cwd: string,
): Array<{
  name: string;
  source_path: string;
  meta: Record<string, unknown> | null;
}> {
  const out: Array<{ name: string; source_path: string; meta: Record<string, unknown> | null }> = [];
  for (const name of readdirSync(dir).sort()) {
    const metadataPath = path.join(dir, name, 'metadata.yaml');
    if (!existsSync(metadataPath)) continue;
    const source_path = path.relative(cwd, metadataPath).replace(/\\/g, '/');
    let meta: Record<string, unknown> | null = null;
    try {
      const parsed = parseYaml<unknown>(readFileSync(metadataPath, 'utf-8'), metadataPath);
      // parseYaml returns null (never throws) for empty/blank/comment-only/`null`
      // content — any non-mapping result is reported as null, same as a parse error.
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        meta = parsed as Record<string, unknown>;
      }
    } catch {
      // unparseable metadata — reported as null for the caller to decide
    }
    out.push({ name, source_path, meta });
  }
  return out;
}

/**
 * Collect metadata-completeness facts for every change in `.prospec/changes/`.
 * Each change reports which REQUIRED_METADATA_FIELDS are absent/empty and, for a
 * verified/archived change, whether quality_log records a /prospec-verify S/A
 * grade. Mirrors collectTaskStates' change enumeration; needs no git. Unparseable
 * metadata is reported as fully incomplete (a corrupt file must not slip through),
 * never skipped. Unavailable (no `.prospec/changes/`) → the check skips.
 */
export function collectMetadataCompleteness(cwd: string): MetadataCompletenessSource {
  const changesDir = path.resolve(cwd, '.prospec/changes');
  if (!existsSync(changesDir)) {
    return {
      available: false,
      reason: 'source unavailable: .prospec/changes/ not found (not version-controlled)',
      changes: [],
    };
  }
  const changes: MetadataCompletenessChange[] = [];
  for (const { name, source_path, meta } of enumerateChangeMetadata(changesDir, cwd)) {
    // unparseable or non-mapping metadata is the worst incompleteness, not a skip —
    // a corrupt file must not slip through.
    if (meta === null) {
      changes.push({
        name,
        source_path,
        status: '',
        missing_fields: [...REQUIRED_METADATA_FIELDS],
        missing_verify_grade: false,
      });
      continue;
    }
    const missing_fields = REQUIRED_METADATA_FIELDS.filter((f) => {
      const v = meta[f];
      return typeof v !== 'string' ? true : v.trim().length === 0;
    });
    const status = readString(meta.status);
    changes.push({
      name,
      source_path,
      status,
      missing_fields,
      missing_verify_grade: GRADED_STATUSES.has(status) && !hasVerifyGrade(meta.quality_log),
    });
  }
  return { available: true, changes };
}

/** True when quality_log carries a /prospec-verify entry graded S or A.
 *  Prefers the structured `grade` field (issue #61); falls back to the legacy
 *  shape where the grade was written into `result` (pre-#61 metadata) so already
 *  archived changes still satisfy the gate. */
function hasVerifyGrade(quality_log: unknown): boolean {
  if (!Array.isArray(quality_log)) return false;
  return quality_log.some((entry) => {
    if (entry === null || typeof entry !== 'object') return false;
    const e = entry as { skill?: unknown; result?: unknown; grade?: unknown };
    // Trimmed like readGateResults: these rows come off raw YAML with no schema
    // pass, and an exact match on `"A "` would flip a genuinely verified change
    // into a FAIL-class metadata-completeness finding (#103, PB-007 sweep).
    const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    if (str(e.skill) !== 'prospec-verify') return false;
    const grade = str(e.grade);
    const result = str(e.result);
    return grade === 'S' || grade === 'A' || result === 'S' || result === 'A';
  });
}

// --- Artifact language (REQ-LIB-037) ---

/**
 * Unicode ranges that identify an artifact language's writing system.
 *
 * Deliberately a small allowlist rather than a language detector: presence of a
 * script is a fact a regex can settle, whereas "is this prose Spanish?" is not.
 * A language absent from this table makes the check SKIP with that reason — the
 * honest outcome, since a vacuous pass would report "language verified" for
 * every Latin-script project while inspecting nothing.
 */
const SCRIPT_PATTERNS: ReadonlyArray<{ match: RegExp; script: RegExp }> = [
  { match: /chinese|中文|japanese|日本語|korean|한국어/i, script: /[぀-ヿ㐀-䶿一-鿿가-힯]/ },
  // Digraphic languages (Serbian, Kazakh, Uzbek…) stay OUT of the alternation:
  // their name cannot decide the script. `LATIN_ORTHOGRAPHY` above handles the
  // explicitly-Latin spellings of every entry here; a project writing one of
  // these in Cyrillic opts in by naming the script.
  { match: /russian|русский|ukrainian|українська|bulgarian|български|cyrillic/i, script: /[Ѐ-ӿ]/ },
  { match: /arabic|العربية|persian|فارسی|farsi|urdu|اردو/i, script: /[؀-ۿ]/ },
  { match: /hebrew|עברית/i, script: /[֐-׿]/ },
  { match: /thai|ไทย/i, script: /[฀-๿]/ },
  { match: /hindi|हिन्दी|marathi|nepali|sanskrit|devanagari/i, script: /[ऀ-ॿ]/ },
  { match: /greek|ελληνικά/i, script: /[Ͱ-Ͽἀ-῿]/ },
];

/**
 * A name that declares a Latin/romanised orthography for a language whose base
 * name would otherwise resolve to a non-Latin script.
 *
 * Rule, not a list of exceptions: `Serbian (Latin)`, `Hindi (Romanized)`,
 * `Persian (Latin)` and `Urdu (Roman)` all name a language written in Latin
 * letters, and guessing the base script would flag 100% of such a project's
 * artifacts — the mass false positive this check exists to avoid. `Greeklish`
 * (Latin transliteration of Greek) is the same shape without parentheses.
 */
const LATIN_ORTHOGRAPHY =
  /\b(latin|roman|romanized|romanised|romaji|transliterat\w*|pinyin)\b|greeklish|ローマ字|拼音|латиница|latinica/i;

/** The script test for an artifact language, or undefined when undetectable. */
export function scriptPatternFor(language: string): RegExp | undefined {
  if (LATIN_ORTHOGRAPHY.test(language)) return undefined;
  return SCRIPT_PATTERNS.find((entry) => entry.match.test(language))?.script;
}

/** Why `scriptPatternFor` returned nothing — the two causes are not the same gap. */
export function scriptGapReason(language: string): string {
  return LATIN_ORTHOGRAPHY.test(language)
    ? `artifact language "${language}" declares a Latin orthography, which overrides ` +
      'its base-language script — presence cannot be settled by character range'
    : `artifact language "${language}" is not in the script table — its writing ` +
      'system may well be settleable by character range; what is missing is a ' +
      'mapping from this NAME to a script, so nothing is claimed';
}

export interface ArtifactLanguageFile {
  /** repo-relative, posix-separated (finding anchor). */
  path: string;
  hasScript: boolean;
}

export interface ArtifactLanguageSource {
  available: boolean;
  reason?: string;
  language: string;
  files: ArtifactLanguageFile[];
}

/**
 * Collect the artifact-language sample.
 *
 * The scan set is derived from the resolved language scope's `nativePaths` — the
 * same resolver the Constitution's Language Policy rule is generated from — and
 * is a deliberate SUBSET of it, so it enforces less than the rule states but can
 * never contradict it.
 * `.prospec/archive/**` is excluded: it is gitignored, its content is a copy of
 * what already shipped, and flagging it would be unactionable noise.
 *
 * The sample is NARROWER than "every `.md` under nativePaths", and the honest
 * framing is definitional, not a list: whatever the canonical scanner filters is
 * simply not in the sample, and this collector cannot tell those files from files
 * that were never there. Reusing the scanner is the right trade — a compliance
 * check should not be the one reader that opens a credential-shaped file — but it
 * inherits every one of its filters: hardcoded security patterns (`*secret*`,
 * `*credential*`, `*.env*`, `*.key`, `*.pem` — prospec's own defaults, NOT the
 * project's `.prospec.yaml` `exclude:` list, which is deliberately not consulted),
 * `DEFAULT_IGNORE` build-artifact directory names, symlinked entries
 * (`followSymbolicLinks: false`), dotfiles, and depth over 10.
 *
 * What this collector DOES guarantee is narrower and exact: the four classes
 * recorded in `unread[]` below never report as clean. Everything else the scanner
 * removes is indistinguishable from absence — stated here rather than papered
 * over, because four rounds of this defect each came from claiming more.
 *
 * Every finding is WARN-class. A fail tier for the committed record is the right
 * end state, but it needs a shrink-only legacy exemption first: this repo alone
 * carries 9 pre-existing English archive summaries, and any project adopting
 * prospec mid-life has its own — a gate that reds them on day one gets switched
 * off rather than satisfied.
 */
export function collectArtifactLanguage(
  cwd: string,
  scope: { language: string; nativePaths: string[] },
): ArtifactLanguageSource {
  const script = scriptPatternFor(scope.language);
  if (!script) {
    return {
      available: false,
      reason: scriptGapReason(scope.language),
      language: scope.language,
      files: [],
    };
  }

  const files: ArtifactLanguageFile[] = [];
  // The four classes below degrade the whole source rather than reporting clean:
  // a lexically escaping root, a root resolving outside via symlink, a scanner
  // throw, and a file that could not be read. This is the exact guarantee — not
  // "anything unread", which four rounds of this defect proved unattainable
  // while the scanner keeps filters this collector cannot enumerate.
  const unread: string[] = [];
  for (const glob of scope.nativePaths) {
    // Keyed on the exported constant, never a twin literal: relocating the
    // archive glob must not silently pull 300+ gitignored copies into scope.
    if (glob === ARCHIVE_NATIVE_GLOB) continue;
    const absRoot = path.resolve(cwd, glob.replace(/\/\*\*$/, ''));
    // A scope that escapes the repo is refused — but refusing is not the same
    // as finding it clean, so it is recorded rather than skipped over.
    if (path.relative(cwd, absRoot).startsWith('..')) {
      unread.push(`${glob} (outside the repository)`);
      continue;
    }
    // A root that simply does not exist is nothing to scan — a legitimate
    // absence, not an unread file. (Limitation, stated rather than papered
    // over: an existing root whose PARENT is unreadable is indistinguishable
    // from an absent one here, because existsSync reports false for both.)
    if (!existsSync(absRoot)) continue;
    if (!existsContained(absRoot, cwd)) {
      unread.push(`${glob} (resolves outside the repository)`);
      continue;
    }
    // The canonical scanner ignores symlinks and bounds depth, but it does NOT
    // swallow scan errors — it re-raises EACCES/ENOTDIR as ScanError. Catching
    // is what stops one unreadable directory from taking the other thirteen
    // verdicts down with it; recording is what stops it reporting as clean.
    let found: string[];
    try {
      ({ files: found } = scanDirSync('**/*.md', { cwd: absRoot }));
    } catch (err) {
      unread.push(`${glob} (${err instanceof Error ? err.message : String(err)})`);
      continue;
    }
    for (const rel of found) {
      const relPath = path
        .join(path.relative(cwd, absRoot), rel)
        .replace(/\\/g, '/');
      const body = readContainedFile(cwd, relPath);
      if (body === null) {
        unread.push(relPath);
        continue;
      }
      // The predicate is the file's PROSE, not its raw bytes: fenced blocks are
      // stripped first, like every sibling markdown collector, so an English
      // artifact quoting one native string in a code sample does not score as
      // written in that language.
      const prose = withoutFencedBlocks(body.split('\n')).join('\n');
      files.push({ path: relPath, hasScript: script.test(prose) });
    }
  }
  if (unread.length > 0) {
    return {
      available: false,
      reason:
        `could not read ${unread.length} path(s) in scope (${unread.slice(0, 3).join('; ')}` +
        `${unread.length > 3 ? ', …' : ''}) — reporting unchecked rather than clean`,
      language: scope.language,
      files: [],
    };
  }
  // Codepoint order, NOT localeCompare — ICU collation varies per environment
  // and would break cross-machine report byte-identity.
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { available: true, language: scope.language, files };
}
