import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { scanDirSync } from './scanner.js';
import { parseTaskLine, type TaskKind } from './task-markers.js';
import { ARCHIVED_EXCLUDES, isArchivedSpec, isSafeResourceName } from './knowledge-reader.js';
import type { ModuleMap } from '../types/module-map.js';

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
  for (const root of roots) {
    for (const { file, relPath } of markdownFiles(root, cwd)) {
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
      reason: 'source unavailable: no markdown roots (specs/knowledge) found',
      links: [],
    };
  }
  // `<...>` targets allow spaces; plain targets allow one balanced paren level
  // so `design (v2).md` style names do not truncate at the first `)`.
  const linkPattern = /\[[^\]]*\]\(<([^>]+)>\)|\[[^\]]*\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;
  const links: LinkReference[] = [];
  for (const root of existingRoots) {
    for (const { file, relPath } of markdownFiles(root, cwd)) {
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

function gitLastCommit(cwd: string, paths: string[]): string | null {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', ...paths], {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}
