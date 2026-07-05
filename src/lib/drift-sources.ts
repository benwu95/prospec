import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { scanDirSync } from './scanner.js';
import { parseYaml } from './yaml-utils.js';
import { parseTaskLine, type TaskKind } from './task-markers.js';
import {
  ARCHIVED_EXCLUDES,
  isArchivedSpec,
  isSafeResourceName,
  loadFeatureMap,
  readModuleReadme,
} from './knowledge-reader.js';
import type { ModuleMap } from '../types/module-map.js';
import type { FeatureMap } from '../types/feature-map.js';

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

/** Collect cross-module static import edges, attributed via module-map paths. */
export function collectImportEdges(cwd: string, moduleMap: ModuleMap): ImportEdgeSource {
  const toModule = moduleAttributor(moduleMap);
  // Whole-content matching so multi-line `import { … }\nfrom 'x'` statements are
  // caught. `from` is mandatory except for bare side-effect imports — otherwise
  // `export const X = './path'` string constants would register as edges.
  const importPattern =
    /(?:^|\n)\s*(?:(?:import|export)\s+[^;'"`]*?from\s*|import\s*)['"]([^'"]+)['"]/g;
  const edges: ImportEdge[] = [];
  let anyPathExists = false;
  for (const entry of moduleMap.modules) {
    for (const prefix of entry.paths) {
      const isGlob = prefix.includes('*');
      // A literal dir prefix is gated by its on-disk existence. A domain glob
      // ('**/auth/**') has no literal path to stat — `existsSync` on it is
      // always false — so it is scanned directly and counts as available only
      // when the glob actually matches files (domain projects relied on the
      // import-direction check silently degrading to `skipped` before this).
      if (!isGlob && !existsSync(path.resolve(cwd, prefix))) continue;
      const { files } = scanDirSync(importScanPattern(prefix), { cwd });
      if (isGlob && files.length === 0) continue;
      anyPathExists = true;
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
  if (!anyPathExists) {
    return {
      available: false,
      reason: 'source unavailable: none of the module paths exist on disk',
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

/**
 * Build the file-scan glob for a module path prefix. Supports both literal dir
 * prefixes (`src/lib` → `src/lib/**\/*.ext`) and domain globs (`**\/auth/**`,
 * `packages/web/**` → `<prefix>/*.ext`).
 */
function importScanPattern(prefix: string): string {
  const EXT = '*.{ts,tsx,mts,cts,js,jsx}';
  return prefix.endsWith('/**') ? `${prefix}/${EXT}` : `${prefix}/**/${EXT}`;
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

/**
 * Blank out fenced code block content (``` / ~~~), preserving line count so
 * finding line numbers stay correct. Fences carry illustrative examples —
 * scanning them produced false positives on first dogfood, and false
 * positives are what kills trust in a checker.
 *
 * CommonMark close rules matter here: the closer must use the same character,
 * be at least as long as the opener, and carry no info string — otherwise a
 * 4-backtick fence wrapping a 3-backtick example leaks its content.
 */
function withoutFencedBlocks(lines: string[]): string[] {
  let fence: { char: string; len: number } | null = null;
  return lines.map((line) => {
    const m = /^\s*(`{3,}|~{3,})\s*(.*)$/.exec(line);
    if (m !== null && m[1] !== undefined) {
      const marker = m[1];
      const info = (m[2] ?? '').trim();
      if (fence === null) {
        fence = { char: marker[0] ?? '`', len: marker.length };
      } else if (marker[0] === fence.char && marker.length >= fence.len && info === '') {
        fence = null;
      }
      return '';
    }
    return fence === null ? line : '';
  });
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
  return readFileSync(abs, 'utf-8');
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

/** Run git and capture stdout — null on failure, '' on empty success (the two
 *  must stay distinct: an empty diff is a valid state, a git failure is not). */
function gitCapture(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf-8' });
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
 * reviews) via a denylist — excluding only workflow state (`.prospec/`,
 * `prospec-report.json`), generated artifacts (deployed `.claude/` skills,
 * `dist/`), and lockfiles. This fails CLOSED (over-review), never open: an edit
 * to code outside `src/`+`tests/` (e.g. `scripts/`) still flips staleness, while
 * a `--record-review`/status write or an `agent sync` cannot self-trip it.
 * Returns null when not a git repo (honest skip; shallow clones are fine —
 * no history is read, only the working tree).
 */
export function computeChangeDigest(cwd: string): string | null {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, stdio: 'pipe' });
  } catch {
    return null;
  }
  const scope = [
    '--',
    '.',
    ':(exclude).prospec',
    ':(exclude)prospec-report.json',
    ':(exclude).claude',
    ':(exclude)dist',
    ':(exclude)pnpm-lock.yaml',
    ':(exclude)package-lock.json',
    ':(exclude)yarn.lock',
  ];
  const head = gitCapture(cwd, ['rev-parse', 'HEAD']);
  const diff = gitCapture(cwd, ['diff', 'HEAD', ...scope]) ?? '';
  const untracked = (gitCapture(cwd, ['ls-files', '--others', '--exclude-standard', ...scope]) ?? '')
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
export function collectReviewProvenance(cwd: string): ReviewProvenanceSource {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, stdio: 'pipe' });
  } catch {
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
  const current_digest = computeChangeDigest(cwd);
  if (current_digest === null) {
    return {
      available: false,
      reason: 'source unavailable: could not compute the current change digest',
      current_digest: null,
      changes: [],
    };
  }
  const changes: ReviewProvenanceChange[] = [];
  for (const name of readdirSync(changesDir).sort()) {
    const metadataPath = path.join(changesDir, name, 'metadata.yaml');
    if (!existsSync(metadataPath)) continue;
    let meta: Record<string, unknown>;
    try {
      meta = parseYaml<Record<string, unknown>>(readFileSync(metadataPath, 'utf-8'), metadataPath);
    } catch {
      continue; // unparseable metadata — skip this change, never fabricate a finding
    }
    const prov = meta.review_provenance as { digest?: unknown } | undefined;
    changes.push({
      name,
      source_path: path.relative(cwd, metadataPath).replace(/\\/g, '/'),
      status: typeof meta.status === 'string' ? meta.status : '',
      scale: typeof meta.scale === 'string' ? meta.scale : '',
      recorded_digest: prov && typeof prov.digest === 'string' ? prov.digest : null,
    });
  }
  return { available: true, current_digest, changes };
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
  for (const name of readdirSync(changesDir).sort()) {
    const metadataPath = path.join(changesDir, name, 'metadata.yaml');
    if (!existsSync(metadataPath)) continue;
    const source_path = path.relative(cwd, metadataPath).replace(/\\/g, '/');
    let meta: Record<string, unknown> | null = null;
    try {
      const parsed = parseYaml<unknown>(readFileSync(metadataPath, 'utf-8'), metadataPath);
      // parseYaml returns null (never throws) for empty/blank/comment-only/`null`
      // content — treat any non-mapping result as the worst incompleteness, same
      // as a thrown parse error, rather than dereferencing null below.
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        meta = parsed as Record<string, unknown>;
      }
    } catch {
      // unparseable metadata — fall through to the fully-incomplete report
    }
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
    const status = typeof meta.status === 'string' ? meta.status : '';
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
    if (e.skill !== 'prospec-verify') return false;
    return e.grade === 'S' || e.grade === 'A' || e.result === 'S' || e.result === 'A';
  });
}
