import { existsSync, readFileSync, readdirSync, type Dirent } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { scanDirSync, classifyModulePath, filterConventions } from './scanner.js';
import { parseYaml } from './yaml-utils.js';
import { parseDocument, isMap, isScalar } from 'yaml';
import { DEFAULT_KNOWLEDGE_TOKEN_BUDGET } from '../types/config.js';
import { withoutFencedBlocks } from './markdown-fences.js';
import { ARCHIVE_NATIVE_GLOB } from './language-policy.js';
import { parseConstitutionRules } from './constitution-parser.js';
import { defaultExecutableProbe, unspawnableReason, type ExecutableProbe } from './test-runner.js';
import { parseTaskLine, type TaskKind } from './task-markers.js';
import { indexSpec, matchReqHeading, readSpecCounters, REQ_ID_SOURCE, type SpecContent } from './spec-headings.js';
import { stripTrailingCr } from './text-lines.js';
import {
  classifyRoutingResolution,
  declaredDrops,
  extractDeltaBlock,
  iterateDeltaEntries,
  type Bullet,
  type RoutingResolution,
} from './landing-fidelity.js';
import { buildReqHomeIndex } from './spec-read.js';
import {
  ARCHIVED_EXCLUDES,
  isContainedPath,
  isSafeResourceName,
  listFeatureSpecs,
  loadFeatureMap,
  loadFeatureSpecContent,
  readContainedText,
  readIndex,
  readModuleReadme,
} from './knowledge-reader.js';
import { estimateTokens } from './token-accounting.js';
import { DRIFT_REPORT_FILENAME, type ConstitutionRuleEntry } from '../types/drift-report.js';
import { ESCAPED_DEFECT_REPORT_FILENAME } from '../types/escaped-defect.js';
import type { ModuleMap } from '../types/module-map.js';
import type { FeatureMap } from '../types/feature-map.js';
import { AGENT_CONFIGS } from '../types/skill.js';
import type { KnowledgeSizeBudget, KnowledgeSizeKind, ProspecConfig } from '../types/config.js';
import { CANONICAL_INIT_DOCS } from '../types/conventions.js';

/**
 * The init-doc rendering surface `collectCanonicalDocDrift` needs. Injected by
 * the caller (which `await import`s `./init-docs.js`) so this module — loaded on
 * nearly every read path via `computeChangeDigest` — never statically pulls the
 * Handlebars template chain (`init-docs → template → handlebars`).
 */
export type InitDocRenderer = Pick<
  typeof import('./init-docs.js'),
  'buildInitDocContexts' | 'renderInitDoc' | 'resolveInitDocLocation'
>;

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

/** Every REQ id MENTION in prose — the heading matcher's sibling, built from the
 *  same single-sourced id shape (`REQ_ID_SOURCE`) so a reference and a definition
 *  can never disagree about what an id looks like. Own instance: `/g` carries
 *  `lastIndex`, which a shared one would leak between callers. */
const REQ_ID_PATTERN = new RegExp(REQ_ID_SOURCE, 'g');

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
  /** Newest commit across the module's sub-module `.md` siblings; null when it has none. */
  last_sub_module_commit: string | null;
  /** The module's declared `last_verified` (module-map.yaml); null when it declares none. */
  last_verified: string | null;
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

export interface BudgetOverride {
  key: keyof KnowledgeSizeBudget;
  value: number;
  defaultValue: number;
  hasComment: boolean;
  line: number;
}

export interface BudgetOverrideSource {
  available: boolean;
  reason?: string;
  source_path: string;
  overrides: BudgetOverride[];
}

export interface CanonicalDocDriftItem {
  /** Repo-relative path of the checked document. */
  source_path: string;
  /** Whether the on-disk content matches the template-rendered content exactly (CRLF normalized). */
  matches: boolean;
}

export interface CanonicalDocDriftSource {
  available: boolean;
  reason?: string;
  docs: CanonicalDocDriftItem[];
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
  /** Whether the working tree is clean in the digest scope (empty `git diff HEAD`,
   *  no untracked) — the one whole-tree signal, so it sits on the source, not per
   *  change. `null` when unknown (not git / a git capture failed). A stale finding
   *  reads `true` as "commit-induced, re-record" and `false`/`null` as "code changed". */
  working_tree_clean: boolean | null;
  changes: ReviewProvenanceChange[];
}

export interface DeltaSpecProvenanceChange {
  name: string;
  /** repo-relative metadata.yaml path (finding anchor). */
  source_path: string;
  status: string;
  scale: string;
  /** digest recorded by `--record-review`; null when never recorded. */
  recorded_digest: string | null;
  /** Fingerprint of THIS change's delta-spec right now; null when absent or
   *  unreadable — which of the two is told apart by `delta_spec_present`, so an
   *  unreadable file can never be mistaken for a scale that carries none. */
  current_digest: string | null;
  /** False for a scale with no delta-spec (quick) — that change is skipped, never
   *  read as agreement. */
  delta_spec_present: boolean;
  /** True when `backfill-draft.md` sits beside the metadata. A proven backfill is
   *  exempt from review, so `--record-review` never runs for one and no baseline
   *  can exist — without this exemption the gate would make every backfill
   *  permanently unarchivable. Keyed on the draft, not the hand-editable `scale`,
   *  exactly like the other two provenance gates. */
  backfill_draft_present: boolean;
}

/** Unlike its two provenance siblings there is no ONE current digest here: the
 *  fingerprint is per change, because each hashes its own `delta-spec.md`. */
export interface DeltaSpecProvenanceSource {
  available: boolean;
  reason?: string;
  changes: DeltaSpecProvenanceChange[];
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
  /** Whether the working tree is clean in the digest scope — the same whole-tree
   *  signal review-provenance carries, `null` when unknown. A stale finding reads
   *  `true` as "commit-induced, re-record" and `false`/`null` as "code changed". */
  working_tree_clean: boolean | null;
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
  const features = listFeatureSpecs(featuresDir);
  if (features.length === 0) {
    return { available: false, reason: `source unavailable: no feature specs in ${featuresDir}`, ids: [] };
  }
  const ids = new Set<string>();
  for (const feature of features) {
    // Assemble main + `features/{feature}/` slices, so a REQ defined only in a
    // slice still registers here — otherwise its own heading, scanned as a
    // reference, would resolve to no definition and FAIL req-references.
    const loaded = loadFeatureSpecContent(featuresDir, feature);
    if (loaded === null) continue;
    // The same index the narrow REQ-scoped read is built on, so a change to what
    // counts as a definition reaches this inventory and that read together.
    // A struck id is still DEFINED — this index answers "does this REQ exist
    // anywhere", so a reference to a deprecated REQ is not a dangling one.
    for (const req of indexSpec(loaded.specContent, { includeStruck: true }).requirements) ids.add(req.id);
  }
  return { available: true, ids: [...ids].sort() };
}

/** One definition site of a REQ id (heading location). */
export interface ReqIdDefinition {
  feature: string;
  /** repo-relative path of the main or slice file the heading lives in. */
  source_path: string;
  /** 1-based line of the heading within that file. */
  line: number;
}

export interface ReqIdUniquenessSource {
  available: boolean;
  reason?: string;
  /** reqId → every place it is defined as a heading (main + slices, all features). */
  definitions: Map<string, ReqIdDefinition[]>;
}

/**
 * Collect every REQ id's definition site(s), so the `req-id-uniqueness` check can
 * flag an id defined in more than one place. Reuses the same `indexSpec` walk as
 * `collectReqDefinitions` (slices grouped with their parent feature, struck ids
 * included), but keeps each definition's path + line so the finding can name it —
 * `buildReqHomeIndex` gives only feature slugs and cannot. A REQ defined once (in
 * main OR one slice) yields one site; the check flags ids with two or more.
 */
export function collectReqIdUniqueness(featuresDir: string, cwd: string): ReqIdUniquenessSource {
  if (!existsSync(featuresDir)) {
    return { available: false, reason: `source unavailable: ${featuresDir} not found`, definitions: new Map() };
  }
  const features = listFeatureSpecs(featuresDir);
  if (features.length === 0) {
    return {
      available: false,
      reason: `source unavailable: no feature specs in ${featuresDir}`,
      definitions: new Map(),
    };
  }
  const definitions = new Map<string, ReqIdDefinition[]>();
  for (const feature of features) {
    const loaded = loadFeatureSpecContent(featuresDir, feature);
    if (loaded === null) continue;
    const { specContent, mainFile } = loaded;
    const isMulti = typeof specContent !== 'string';
    for (const req of indexSpec(specContent, { includeStruck: true }).requirements) {
      // `start` is the offset within the content indexSpec walked for this
      // requirement — the slice's content if it lives in a slice, else main.
      const content = req.slice
        ? (isMulti ? ((specContent as { slices: Record<string, string> }).slices[req.slice] ?? '') : '')
        : (isMulti ? (specContent as { main: string }).main : (specContent as string));
      const line = content.slice(0, req.start).split('\n').length;
      const filePath = req.slice ? path.join(featuresDir, feature, `${req.slice}.md`) : mainFile;
      const entry: ReqIdDefinition = {
        feature,
        source_path: path.relative(cwd, filePath).replace(/\\/g, '/'),
        line,
      };
      const list = definitions.get(req.id);
      if (list) list.push(entry);
      else definitions.set(req.id, [entry]);
    }
  }
  return { available: true, definitions };
}

/** One feature spec's declared counters beside the counts its body yields. */
export interface SpecCounterClaim {
  /** repo-relative spec path. */
  source_path: string;
  /** Canonical slug = filename without `.md`. */
  feature: string;
  declared: { story_count: number | null; req_count: number | null };
  actual: { story_count: number; req_count: number };
}

export interface SpecCounterSource {
  available: boolean;
  reason?: string;
  specs: SpecCounterClaim[];
}

/**
 * Collect each active feature spec's frontmatter counters against its own body
 * (REQ-LIB-042). The derivation is `readSpecCounters` — the same function
 * `archive finalize` writes with, so the check cannot police a rule the writer
 * does not follow.
 *
 * Absent directory / no specs → unavailable, so the check skips rather than
 * passing vacuously. An unreadable enumerated file costs its own line, never the
 * run (`readTextOrSkip`), and a file without frontmatter is not a spec.
 */
export function collectSpecCounters(featuresDir: string, cwd: string): SpecCounterSource {
  if (!existsSync(featuresDir)) {
    return { available: false, reason: `source unavailable: ${featuresDir} not found`, specs: [] };
  }
  const features = listFeatureSpecs(featuresDir);
  if (features.length === 0) {
    return {
      available: false,
      reason: `source unavailable: no feature specs in ${featuresDir}`,
      specs: [],
    };
  }
  const specs: SpecCounterClaim[] = [];
  for (const feature of features) {
    // Assemble main + slices, so a sliced spec's body-derived counts sum every
    // slice — genuinely matching what `archive finalize` writes, rather than the
    // main file alone.
    const loaded = loadFeatureSpecContent(featuresDir, feature);
    if (loaded === null) continue;
    const counters = readSpecCounters(loaded.specContent);
    if (counters === null) continue;
    specs.push({
      source_path: path.relative(cwd, loaded.mainFile).replace(/\\/g, '/'),
      feature,
      declared: counters.declared,
      actual: counters.actual,
    });
  }
  // Files existed but none of them yielded counters (unreadable, or no
  // frontmatter at all) — a sample of zero is not a clean bill of health. Saying
  // `available: true` here reported PASS over nothing checked.
  if (specs.length === 0) {
    return {
      available: false,
      reason: `source unavailable: no feature spec in ${featuresDir} could be parsed (frontmatter missing or unreadable)`,
      specs: [],
    };
  }
  return { available: true, specs };
}

/** Collect every REQ id mention in markdown under the given roots. */
export function collectReqReferences(roots: string[], cwd: string): ReqReference[] {
  const refs: ReqReference[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    for (const { file, relPath } of markdownFiles(root, cwd)) {
      if (seen.has(file)) continue;
      seen.add(file);
      const body = readTextOrSkip(file);
      if (body === null) continue;
      const lines = withoutFencedBlocks(body.split('\n'));
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
      const body = readTextOrSkip(file);
      if (body === null) continue;
      const lines = withoutFencedBlocks(body.split('\n'));
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

/** Byte offsets of every `\n` in `content`, ascending — the index for line lookups. */
function buildNewlineOffsets(content: string): number[] {
  const offsets: number[] = [];
  for (let i = content.indexOf('\n'); i !== -1; i = content.indexOf('\n', i + 1)) {
    offsets.push(i);
  }
  return offsets;
}

/** 1-based line number of `offset`, equivalent to `content.slice(0, offset).split('\n').length`
 *  but O(log lines): the count of newlines strictly before `offset`, plus one. */
function lineNumberAt(newlineOffsets: number[], offset: number): number {
  let lo = 0;
  let hi = newlineOffsets.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((newlineOffsets[mid] as number) < offset) lo = mid + 1;
    else hi = mid;
  }
  return lo + 1;
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
  // `export const X = './path'` string constants would register as edges. The
  // statement head is anchored to the start of a line (`^[ \t]*` + `m`) rather
  // than `(?:^|\n)\s*`: the old prefix let `\s*` re-enter at every newline, so a
  // file of `export … ;` statements drove super-linear backtracking (82ms → 6ms
  // on this repo). The captured edge set is identical — an import head always
  // begins its line.
  const importPattern =
    /^[ \t]*(?:(?:import|export)\s+[^;'"`]*?from\s*|import\s*)['"]([^'"]+)['"]/gm;
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
        const raw = readTextOrSkip(path.resolve(cwd, relPath));
        if (raw === null) continue;
        const content = raw
          .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
          .replace(/`(?:\\[\s\S]|[^\\`])*`/g, (c) => c.replace(/[^\n]/g, ' '));
        // One newline-offset table per file, so the line number of each match is a
        // binary search instead of re-slicing and re-splitting the whole prefix per
        // match (O(matches × length) → O(matches × log lines)).
        const newlineOffsets = buildNewlineOffsets(content);
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
            line: lineNumberAt(newlineOffsets, matchOffset),
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

/** Newest commits the batched timestamp walk scans. A path-group untouched within
 *  this window falls back to its own `git log -1`, so the number only trades spawn
 *  count against nothing — never byte-identical correctness. */
const TIMESTAMP_BATCH_WINDOW = 400;

/** A literal pathspec carries no git glob magic, so the batch walk can match it with
 *  exact/prefix rules identical to git's default pathspec; a glob spec is left to
 *  `git log -1` (git's own matching) rather than reimplemented here. */
function isLiteralPathspec(spec: string): boolean {
  return !/[*?[\]]/.test(spec);
}

/** git default pathspec over a literal spec: a file matches its exact self or
 *  anything beneath it as a directory prefix. */
function pathspecCovers(spec: string, file: string): boolean {
  return file === spec || file.startsWith(`${spec}/`);
}

/** One path-group's last-commit query for the batched walk. */
interface TimestampGroup {
  includes: readonly string[];
  excludes: readonly string[];
}

/**
 * Resolve each group's newest touching commit (its `%cI`) in ONE `git log
 * --name-only` pass. Returns a parallel array: the ISO date for a group matched
 * within the scan window, or `undefined` for a group not matched — the caller then
 * falls back to a per-group `git log -1`, so an out-of-window (or capture-failed)
 * group resolves byte-identically to the un-batched form. The newest-first scan
 * order mirrors `git log -1`'s default, so a matched group's commit is the same one
 * that per-group query would return; the exclude test reproduces `:(exclude)` in-walk.
 *
 * `-c` (combined diff) is what makes a MERGE commit list files in `--name-only`: git
 * omits merge diffs by default, but `git log -1 -- <path>`'s pathspec simplification
 * DOES return a merge whose tree differs from all parents for that path. Combined diff
 * lists exactly those files (differ from all parents) — so a combining or evil merge is
 * attributed to the merge (matching the per-module query), while a clean merge that is
 * TREESAME to a parent lists nothing and is correctly skipped. Without `-c` a module
 * last touched by a merge resolved to an older commit — a fail-open staleness bug.
 */
function batchGroupTimestamps(cwd: string, groups: TimestampGroup[]): (string | undefined)[] {
  const result: (string | undefined)[] = groups.map(() => undefined);
  if (groups.length === 0) return result;
  const out = gitCapture(cwd, [
    'log',
    '-c',
    '--format=%x00%cI',
    '--name-only',
    '-n',
    String(TIMESTAMP_BATCH_WINDOW),
  ]);
  if (out === null) return result; // capture failed — every group falls back below
  const pending = new Set(groups.map((_, i) => i));
  // Records are NUL-delimited (%x00): each chunk is `<ISO>\n<changed files…>`.
  for (const chunk of out.split('\0')) {
    if (pending.size === 0) break;
    const nl = chunk.indexOf('\n');
    if (nl === -1) continue; // the empty lead chunk before the first record
    const iso = chunk.slice(0, nl).trim();
    if (iso === '') continue;
    const files = chunk
      .slice(nl + 1)
      .split('\n')
      .filter((line) => line.length > 0);
    for (const gi of [...pending]) {
      const group = groups[gi] as TimestampGroup;
      const hit = files.some(
        (file) =>
          group.includes.some((inc) => pathspecCovers(inc, file)) &&
          !group.excludes.some((exc) => pathspecCovers(exc, file)),
      );
      if (hit) {
        result[gi] = iso;
        pending.delete(gi);
      }
    }
  }
  return result;
}

/** Collect per-module last-commit timestamps for sources and READMEs. */
export function collectGitTimestamps(
  cwd: string,
  moduleMap: ModuleMap,
  knowledgePath: string,
  generatedArtifacts: readonly string[],
  /** The one work-tree probe. Defaults to probing so any caller is correct;
   *  check.service shares its once-computed value so the whole run probes once. */
  inWorkTree: boolean = isGitWorkTree(cwd),
): GitTimestampSource {
  if (!inWorkTree) {
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

  // Gather every module's three path-groups, then resolve them ALL in ONE
  // `git log --name-only` walk instead of a `git log -1` per group (17 spawns → 1
  // on this repo). A group whose pathspecs carry git glob magic — or that the walk
  // window does not reach — is left to `gitLastCommit` below, so the batched result
  // is byte-identical to the per-module queries it replaces.
  interface PreparedModule {
    entry: ModuleMap['modules'][number];
    readmeRel: string;
    readmeExists: boolean;
    subModuleRels: string[];
    srcBatch?: number;
    readmeBatch?: number;
    subBatch?: number;
  }
  const prepared: PreparedModule[] = [];
  const batchGroups: TimestampGroup[] = [];
  const register = (group: TimestampGroup): number => batchGroups.push(group) - 1;

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
    const subModuleRels = moduleKnowledgeFiles(
      path.resolve(cwd, knowledgePath, 'modules'),
      entry.name,
    )
      .filter((file) => file !== 'README.md')
      .map((file) => path.join(path.dirname(readmeRel), file));

    const pm: PreparedModule = { entry, readmeRel, readmeExists, subModuleRels };
    // Generated artifacts carry code but no knowledge a README could describe, so
    // regenerating one must not make the module stale (REQ-LIB-015 / REQ-LIB-039);
    // the same file stays inside computeChangeDigest. The src group batches only
    // when every include AND exclude is literal — a glob exclude keeps git's own
    // matching (and its unexcluded fallback) via gitLastCommit.
    if (entry.paths.every(isLiteralPathspec) && generatedArtifacts.every(isLiteralPathspec)) {
      pm.srcBatch = register({ includes: entry.paths, excludes: generatedArtifacts });
    }
    if (readmeExists) pm.readmeBatch = register({ includes: [readmeRel], excludes: [] });
    if (subModuleRels.length > 0) pm.subBatch = register({ includes: subModuleRels, excludes: [] });
    prepared.push(pm);
  }

  const batched = batchGroupTimestamps(cwd, batchGroups);
  // A batched hit is the answer; a batch miss (glob group or out-of-window) falls
  // back to the per-group query, so both paths return the same commit.
  const resolve = (idx: number | undefined, fallback: () => string | null): string | null =>
    idx !== undefined && batched[idx] !== undefined ? (batched[idx] as string) : fallback();

  const modules: ModuleTimestamps[] = [];
  for (const pm of prepared) {
    try {
      modules.push({
        name: pm.entry.name,
        readme_path: pm.readmeRel.replace(/\\/g, '/'),
        readme_exists: pm.readmeExists,
        last_src_commit: resolve(pm.srcBatch, () =>
          gitLastCommit(cwd, pm.entry.paths, generatedArtifacts),
        ),
        last_readme_commit: pm.readmeExists
          ? resolve(pm.readmeBatch, () => gitLastCommit(cwd, [pm.readmeRel]))
          : null,
        last_sub_module_commit:
          pm.subModuleRels.length > 0
            ? resolve(pm.subBatch, () => gitLastCommit(cwd, pm.subModuleRels))
            : null,
        last_verified: pm.entry.last_verified ?? null,
      });
    } catch (e) {
      return {
        available: false,
        reason: `source unavailable: ${e instanceof Error ? e.message : String(e)}`,
        modules: [],
      };
    }
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
 * Collect token/line sizes of every knowledge file the progressive-loading budget
 * governs (REQ-LIB-027): `index.md` + each core convention (L1), every module
 * README and sub-module (L2), every Feature Spec and `product.md` (spec), the
 * load-on-demand governance files (demand-knowledge), and — only where the project
 * authors skills — each deployed `SKILL.md` and reference. Sizes come from the
 * deterministic `estimateTokens` (chars-per-token) so the check stays zero-LLM; the
 * pure evaluator compares them against `budget`. L0 (`AGENTS.md`/`CLAUDE.md`) is
 * agent-injected config, not a knowledge-base file, and is out of scope. The whole
 * check skips when the knowledge base is absent — never a fabricated pass. Module
 * READMEs are enumerated straight from `modules/` (no module-map needed: sizing
 * needs only the file, and the module name is its directory).
 */
export function collectKnowledgeSize(
  cwd: string,
  baseDir: string,
  knowledgePath: string,
  budget: KnowledgeSizeBudget,
  additionalCore: string[],
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

  // L1 / demand-knowledge — index.md (via the canonical base-dir reader, so this
  // can never disagree with the services that write it) plus BOTH halves of the
  // convention split. The split is the one `filterConventions` call index.md's own
  // Conventions block is generated from, `additionalCore` included: a project that
  // promotes a file to `additional_core_conventions` has it listed under "Core
  // Conventions (L1)" in index.md, so grading it against the load-on-demand budget
  // — 10,000 instead of 1,800 — would silently exempt it from the budget its own
  // index.md declares. Load-on-demand conventions are deliberately NOT core: a file
  // read in slices has no business being graded against the per-file budget of a
  // document read whole (issue #135).
  measure(path.relative(cwd, path.resolve(cwd, baseDir, 'index.md')), 'l1', readIndex(baseDir));
  const { core, demand } = filterConventions(conventionFileNames(cwd, knowledgeRel), additionalCore);
  for (const [names, kind] of [[core, 'l1'], [demand, 'demand-knowledge']] as const) {
    for (const name of names) {
      const rel = path.join(knowledgeRel, name);
      measure(rel, kind, readContainedFile(cwd, rel));
    }
  }

  // L2 — every module README under modules/, plus each extracted sub-module
  // sibling: the conventions give a sub-module the SAME budget as a README, so
  // measuring only the README would let an extraction move knowledge out of the
  // budget's sight instead of making it smaller.
  // `existsSync` is not enough of a guard: `modules` being a FILE (ENOTDIR) or
  // unreadable (EACCES) makes `readdirSync` throw, and this collector is an
  // argument to `runChecks(...)` — the throw would take all fifteen verdicts.
  const modulesDir = path.resolve(cwd, knowledgePath, 'modules');
  for (const name of readdirNamesOrEmpty(modulesDir)) {
    if (!isSafeResourceName(name)) continue;
    for (const file of moduleKnowledgeFiles(modulesDir, name)) {
      const rel = path.join(knowledgeRel, 'modules', name, file);
      measure(
        rel,
        'l2',
        file === 'README.md' ? readModuleReadme(knowledgePath, name) : readContainedFile(cwd, rel),
      );
    }
  }

  // spec — product.md + every Feature Spec, RECURSIVELY: a spec sliced into
  // `features/{feature}/{slice}.md` must stay measured, or splitting an
  // over-budget spec would move it out of the budget's sight instead of making it
  // smaller (the same failure mode sub-module extraction had).
  const specsRel = path.relative(cwd, path.resolve(cwd, baseDir, 'specs')).replace(/\\/g, '/');
  const productRel = path.join(specsRel, 'product.md');
  measure(productRel, 'spec', readContainedFile(cwd, productRel));
  for (const rel of budgetedMarkdownFiles(cwd, path.join(specsRel, 'features'))) {
    measure(rel, 'spec', readContainedFile(cwd, rel));
  }

  // skill / reference — only where the project holds the skill template sources.
  // A project that merely consumes generated skills cannot act on such a finding,
  // and an unactionable WARN is the shape this check exists to avoid.
  if (existsSync(path.resolve(cwd, SKILL_TEMPLATE_SOURCE_DIR))) {
    for (const item of collectAuthoredSkillItems(cwd)) items.push(item);
  }

  return { available: true, budget, items };
}

/**
 * Collect token_budget overrides from .prospec.yaml, utilizing YAML AST to
 * check for neighboring comments.
 */
export function collectBudgetOverrides(cwd: string): BudgetOverrideSource {
  const configPath = path.resolve(cwd, '.prospec.yaml');
  const content = readContainedText(configPath, cwd);
  if (!content) {
    return { available: false, reason: 'source unavailable: .prospec.yaml not found', source_path: '.prospec.yaml', overrides: [] };
  }
  
  let doc;
  try {
    doc = parseDocument(content);
    if (doc.errors.length > 0) throw new Error('yaml parse error');
    
    const overrides: BudgetOverride[] = [];
    const contents = doc.contents;
    let hasBudgetSection = false;
    
    if (isMap(contents)) {
      const knowledgeNode = contents.get('knowledge', true);
      if (isMap(knowledgeNode)) {
        const budgetNode = knowledgeNode.get('token_budget', true);
        if (isMap(budgetNode)) {
          hasBudgetSection = true;
          
          for (const [index, item] of budgetNode.items.entries()) {
            if (!isScalar(item.key) || !isScalar(item.value)) continue;
            const keyStr = String(item.key.value);
            if (!(keyStr in DEFAULT_KNOWLEDGE_TOKEN_BUDGET)) continue;

            const defaultValue = DEFAULT_KNOWLEDGE_TOKEN_BUDGET[keyStr as keyof KnowledgeSizeBudget];
            const value = Number(item.value.value);

            if (value > (defaultValue ?? 0)) {
              const startPos = item.key.range?.[0] ?? 0;
              const line = content.substring(0, startPos).split('\n').length;
              // A comment introducing the block's first key hangs on the collection,
              // not on that key — so the most natural way to justify an override
              // (a line above it) is invisible from `key.commentBefore` alone.
              const leadsTheBlock = index === 0 && !!budgetNode.commentBefore;
              const hasComment =
                !!item.key.commentBefore || !!item.value.comment || !!item.value.commentBefore || leadsTheBlock;

              overrides.push({
                key: keyStr as keyof KnowledgeSizeBudget,
                value,
                defaultValue,
                hasComment,
                line,
              });
            }
          }
        }
      }
    }
    if (!hasBudgetSection) {
      return { available: false, reason: 'no knowledge.token_budget section configured', source_path: '.prospec.yaml', overrides: [] };
    }
    
    return {
      available: true,
      source_path: '.prospec.yaml',
      overrides,
    };
  } catch {
    return { available: false, reason: 'source unavailable: failed to parse .prospec.yaml AST', source_path: '.prospec.yaml', overrides: [] };
  }
}

/**
 * Authoring mode — the project holds the skill templates that generate the
 * deployed `SKILL.md` files, so a size finding on one names something it can fix.
 */
const SKILL_TEMPLATE_SOURCE_DIR = 'src/templates/skills';

/**
 * Top-level `_*.md` names under the knowledge base — the same glob
 * `scanDir('_*.md', { cwd: knowledgeRoot })` gives the index writers, listed here
 * without `scanDirSync` for the reasons `budgetedMarkdownFiles` documents.
 *
 * Two deliberate divergences from those writers, both in the direction of
 * measuring MORE (a budget that exempts a file silently fails open, which is the
 * defect this check exists to remove): `SENSITIVE_PATTERNS` is not applied, so
 * `_secret-rotation-rules.md` is measured though index.md does not list it; and a
 * SYMLINKED `_*.md` is measured, where the writers' `onlyFiles: true` +
 * `followSymbolicLinks: false` drops it. Both are gaps on the writers' side.
 */
function conventionFileNames(cwd: string, knowledgeRel: string): string[] {
  try {
    return readdirSync(path.resolve(cwd, knowledgeRel), { withFileTypes: true })
      .filter((e) => !e.isDirectory() && e.name.startsWith('_') && e.name.endsWith('.md'))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** Directory entry names, or `[]` when the path is missing, a file, or unreadable. */
function readdirNamesOrEmpty(absDir: string): string[] {
  try {
    return readdirSync(absDir).sort();
  } catch {
    return [];
  }
}

/**
 * Every `.md` under `dirRel`, recursively, as sorted repo-relative paths.
 *
 * Deliberately NOT `markdownFiles`/`scanDirSync`, which this collector briefly
 * used and must not, for two measured reasons. (1) `scanDirSync` THROWS
 * `ScanError` on an unreadable entry, and `collectKnowledgeSize` is evaluated as
 * an ARGUMENT to `runChecks(...)` — one `references/` path that is a file rather
 * than a directory took all fifteen verdicts down with it. This walk closes the
 * shapes THIS collector owns; an EACCES directory under a `markdownRoots` path
 * still aborts the run from `collectMarkdownLinks`' `scanDirSync`, and a
 * `specs/features` that is a file aborts it from `collectReqDefinitions`' bare
 * `readdirSync` — both pre-existing, reproducible on the parent commit, and NOT
 * fixed here. (2) It merges `SENSITIVE_PATTERNS`, which
 * silently drops a Feature Spec named `secret-rotation.md` or
 * `credential-vault.md`; a budget gate that fails OPEN is the exact defect this
 * check exists to remove, and a spec is not a credential.
 *
 * `isSafeResourceName` is the ONE name filter — it admits only `[A-Za-z0-9]`-initial
 * names, which already excludes `_archived*` artifacts and dotfiles. A symlinked
 * `.md` FILE is a candidate (containment stays the canonical reader's realpath
 * check, and skipping it would silently drop a real measurement — the argument
 * `moduleKnowledgeFiles` makes), but a symlinked sub-DIRECTORY is NOT descended
 * into: `followSymbolicLinks: false` is what the replaced `scanDirSync`
 * guaranteed, and without it one `features/loop -> ..` turns a single spec into
 * tens of thousands of duplicate items. `depth` is the backstop for a deep real tree.
 *
 * The walk ROOT is deliberately NOT given that rule, even though `readdirSync`
 * resolves the last segment of its own argument. Refusing a symlinked root was
 * tried and reverted: it silently zeroed every measurement for a project that
 * legitimately symlinks `specs/features` or a skill's `references/` — a budget
 * failing OPEN on a normal deployment, which is worse than the bounded oddity it
 * prevented (a self-referential root like `references -> ..` re-listing one file
 * under the wrong kind, one level deep, from a configuration nothing generates).
 */
function budgetedMarkdownFiles(cwd: string, dirRel: string, depth = 10): string[] {
  if (depth <= 0) return [];
  let entries: Dirent[];
  try {
    entries = readdirSync(path.resolve(cwd, dirRel), { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    if (!isSafeResourceName(entry.name)) continue;
    const rel = path.join(dirRel, entry.name).replace(/\\/g, '/');
    // A `.md` name is a file candidate even when it is a symlink or an unreadable
    // directory — the reader turns those into "absent" without erroring.
    if (entry.name.endsWith('.md')) found.push(rel);
    else if (entry.isDirectory()) found.push(...budgetedMarkdownFiles(cwd, rel, depth - 1));
  }
  return found.sort();
}

/**
 * The deployed skill artifacts, deduplicated across every agent skill path. The
 * same skill is written to `.claude/skills` AND `.agents/skills`, so measuring
 * each copy would multiply one oversized skill into one finding per agent. The
 * LARGEST copy is kept — the budget asks whether the skill fits, and the worst
 * case is the binding one.
 *
 * Identity is `{skill}` for a SKILL.md and `{skill}/{basename}` for a reference —
 * the SKILL name is part of the key on purpose. Keying a reference by basename
 * alone deduplicates across DIFFERENT skills, and two skills may ship different
 * files under one basename: the smaller one then disappears and can never warn.
 * Deduplicating only what deployment actually duplicates (one skill NAME across
 * agent paths) costs a second finding for a shared oversized reference and buys
 * back the guarantee that nothing measured is silently dropped.
 *
 * The key is the directory name, so two differently-named directories are two
 * skills even when one is a symlink to the other — deliberately: the harness
 * dispatches on the directory name, so it really would load both, and collapsing
 * them by resolved path would under-report a genuinely doubled load.
 */
function collectAuthoredSkillItems(cwd: string): KnowledgeSizeItem[] {
  const largestByName = new Map<string, KnowledgeSizeItem>();
  const consider = (name: string, item: KnowledgeSizeItem): void => {
    const key = `${item.kind}:${name}`;
    const seen = largestByName.get(key);
    if (seen === undefined || item.tokens > seen.tokens) largestByName.set(key, item);
  };
  // Sorted so a tie between two agent paths resolves to the same copy on every
  // machine (the first wins — `consider` replaces only on strictly greater).
  const skillPaths = [...new Set(Object.values(AGENT_CONFIGS).map((a) => a.skillPath))].sort();
  for (const skillPath of skillPaths) {
    let skillDirs: Dirent[];
    try {
      skillDirs = readdirSync(path.resolve(cwd, skillPath), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const dir of skillDirs) {
      // A symlinked skill directory reports `isDirectory() === false`; skipping it
      // would leave a really-deployed skill unmeasured (budget failing open).
      if (!(dir.isDirectory() || dir.isSymbolicLink()) || !isSafeResourceName(dir.name)) continue;
      const skillRel = path.join(skillPath, dir.name, 'SKILL.md').replace(/\\/g, '/');
      const skillText = readContainedFile(cwd, skillRel);
      if (skillText !== null) {
        consider(dir.name, {
          source_path: skillRel,
          kind: 'skill',
          tokens: estimateTokens(skillText),
          lines: countLines(skillText),
        });
      }
      for (const relPath of budgetedMarkdownFiles(cwd, path.join(skillPath, dir.name, 'references'))) {
        const refText = readContainedFile(cwd, relPath);
        if (refText === null) continue;
        consider(`${dir.name}/${path.basename(relPath)}`, {
          source_path: relPath,
          kind: 'reference',
          tokens: estimateTokens(refText),
          lines: countLines(refText),
        });
      }
    }
  }
  return [...largestByName.values()].sort((a, b) =>
    a.source_path < b.source_path ? -1 : a.source_path > b.source_path ? 1 : 0,
  );
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
    const body = readTextOrSkip(tasksPath);
    if (body === null) continue;
    body.split('\n').forEach((line, i) => {
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
  // Line-by-line so each REQ keeps its own line number for the finding anchor —
  // deliberately NOT `indexSpec`, whose record `start` is a character offset.
  const scanReqs = (body: string, reqs: FeatureSpecReqs['reqs']): void => {
    body.split('\n').forEach((line, i) => {
      const id = matchReqHeading(line)?.id;
      if (id === undefined) return;
      reqs.push({ id, prefix: reqIdToPrefix(id), line: i + 1 });
    });
  };
  for (const feature of listFeatureSpecs(featuresDir)) {
    const loaded = loadFeatureSpecContent(featuresDir, feature);
    if (loaded === null) continue;
    const reqs: FeatureSpecReqs['reqs'] = [];
    const sc = loaded.specContent;
    // A REQ defined only in a `features/{feature}/` slice enters the feature↔module
    // and prefix checks too — main first, then each slice in a stable order.
    if (typeof sc === 'string') {
      scanReqs(sc, reqs);
    } else {
      scanReqs(sc.main, reqs);
      for (const name of Object.keys(sc.slices).sort()) scanReqs(sc.slices[name]!, reqs);
    }
    specs.push({
      feature,
      source_path: path.relative(cwd, loaded.mainFile).replace(/\\/g, '/'),
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
 * Split the modules a change's diff touches into those a requirement already
 * acknowledged and those only a file-path diff attributes — the stamp-only
 * candidates, typically a generated artifact pulling in its module (a bundled
 * template regenerated under `src/lib/**`). `acknowledged` names the REQ-prefix
 * modules the caller already resolved; the comparison is case-insensitive. A path
 * no module claims contributes to neither set, exactly as `moduleAttributor`
 * returns null for it. Pure — the git read that feeds `changedPaths` lives in
 * `changedPathsFromWorkTree`, so the split itself is unit-tested without git.
 */
export function partitionDiffAttributedModules(
  changedPaths: readonly string[],
  moduleMap: ModuleMap,
  acknowledged: readonly string[],
): { diffAttributed: string[]; stampOnly: string[] } {
  const attribute = moduleAttributor(moduleMap);
  const diffAttributed = new Set<string>();
  for (const p of changedPaths) {
    const mod = attribute(p);
    if (mod !== null) diffAttributed.add(mod);
  }
  const ack = new Set(acknowledged.map((m) => m.toLowerCase()));
  const stampOnly = [...diffAttributed].filter((m) => !ack.has(m.toLowerCase())).sort();
  return { diffAttributed: [...diffAttributed].sort(), stampOnly };
}

/**
 * Existence check that refuses to follow a symlink out of the repo. A target
 * whose lexical path stays inside cwd but whose real (symlink-resolved) path
 * lands outside is reported as non-existent, closing the existence oracle.
 */
function existsContained(abs: string, cwd: string): boolean {
  // Existence and containment only — deliberately NOT the whole contained read:
  // a markdown link pointing at a real directory must count as EXISTING (else
  // collectMarkdownLinks invents a broken-link FAIL) while being unreadable.
  // The predicate itself is knowledge-reader's, so this is not a third copy.
  return existsSync(abs) && isContainedPath(abs, cwd);
}

/**
 * Read a file the caller ENUMERATED from disk, skipping it when the read fails.
 *
 * Containment is deliberately absent here: these callers walk a root they were
 * handed and must keep scanning exactly what they scanned before. What changes is
 * only the failure mode — a directory wearing a `.md` name (or a revoked
 * permission) used to throw EISDIR out of the collector during `runChecks(...)`
 * argument evaluation, taking all thirteen other verdicts with it. One
 * pathological entry may cost its own line, never the whole run.
 */
function readTextOrSkip(absPath: string): string | null {
  try {
    return readFileSync(absPath, 'utf-8');
  } catch {
    return null;
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
  // Lexical reject first (cheap, no FS touch); realpath containment and the
  // "exists but unreadable → absent" rule belong to the ONE shared helper —
  // a second copy here is exactly how the two drifted into disagreeing about
  // read failures, which cost an entire check run per pathological file (PB-006).
  if (path.relative(cwd, abs).startsWith('..')) return null;
  return readContainedText(abs, cwd);
}

/**
 * A module's knowledge files — its `README.md` plus every extracted sub-module
 * sibling — as sorted entry names.
 *
 * ONE source for both collectors that walk a module directory (size budget and
 * staleness): a hand-copied walk in each would drift the moment a skip rule
 * changes (PB-006). Subdirectories, non-`.md` entries and names rejected by
 * `isSafeResourceName` are skipped rather than measured — a module directory may
 * hold diagrams or an editor's dotfile, and neither is knowledge the budget
 * governs.
 *
 * A symlink is a CANDIDATE, not a skip: containment is the readers' job
 * (`readModuleReadme`/`readContainedFile` both resolve realpath and reject a
 * target outside the tree), so filtering symlinks here buys no safety and
 * silently drops a real measurement — a symlinked README used to be measured
 * through `readModuleReadme` and would have gone unmeasured, i.e. the budget
 * gate failing OPEN. Sorted so the emitted item order is reproducible across
 * machines rather than inheriting readdir order.
 */
function moduleKnowledgeFiles(modulesDir: string, moduleName: string): string[] {
  try {
    return readdirSync(path.join(modulesDir, moduleName), { withFileTypes: true })
      .filter((e) => !e.isDirectory() && e.name.endsWith('.md') && isSafeResourceName(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    // not a directory / unreadable — the module simply contributes no knowledge file
    return [];
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

/** Last commit touching `paths`, ignoring `excludes` (repo-relative, posix).
 *
 *  A pathspec the local git cannot parse fails the capture — and folding THAT
 *  into null would report "no source commit", which the staleness rule reads as
 *  fresh (PB-013: a swallowed error must not turn a fact into a constant). Fall
 *  back to the unexcluded query: noisier than intended, but true. */
function gitLastCommit(
  cwd: string,
  paths: string[],
  excludes: readonly string[] = [],
): string | null {
  const args = ['log', '-1', '--format=%cI', '--', ...paths];
  if (excludes.length > 0) {
    // Fall through on BOTH empty answers, not only on a failed capture: a
    // pathspec git cannot parse and an exclusion covering every file the module
    // has are the same fact here — no excluded answer exists. `isStale` reads a
    // null last_src_commit as "not stale", so folding either into null lets one
    // configured glob (`src/**`) silence a whole module forever. The unexcluded
    // timestamp is noisier but true — the degradation PB-013 prescribes.
    const excluded = gitCapture(cwd, [...args, ...excludes.map((p) => `:(exclude)${p}`)])?.trim();
    if (excluded) return excluded;
  }
  const out = gitCapture(cwd, args);
  if (out === null) throw new Error(`git log capture failed for paths: ${paths.join(' ')}`);
  return out.trim() || null;
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
/**
 * Content fingerprint of ONE change's `delta-spec.md` (REQ-LIB-045) — the narrow
 * sibling of `computeChangeDigest`, and narrow on purpose.
 *
 * `computeChangeDigest` excludes `.prospec/` so that a `--record-review`, a status
 * write or an `agent sync` cannot self-trip the review baseline. The cost of that
 * exclusion is that the delta-spec — the ONE artifact archive copies verbatim into
 * `specs/features/**` — sits outside every provenance gate: a review round that
 * corrects a REQ's behavior without folding the correction back into its `**Spec:**`
 * block leaves review- and test-provenance green while archive reverts the fix.
 * Widening the whole-tree digest to cover `.prospec/` would red every baseline on
 * any artifact edit, which is the very thing that exclusion exists to prevent, so
 * the coverage is bought with this separate, single-file fingerprint instead.
 *
 * Deliberately git-free: it hashes bytes, so it works the same in a fresh clone, a
 * shallow clone, or a directory that is not a repository at all. Returns null when
 * the file is absent (a scale with no delta-spec — the caller skips that change)
 * and when it cannot be read (PB-013: an unreadable source degrades to an honest
 * null, never to a constant that would certify a stale landing block as current).
 */
export function computeDeltaSpecDigest(changeDir: string): string | null {
  try {
    const contents = readFileSync(path.join(changeDir, 'delta-spec.md'));
    return createHash('sha256').update('delta-spec\0').update(contents).digest('hex');
  } catch {
    return null;
  }
}

/** The denylist pathspec shared by the whole-tree digest and the working-tree-clean
 *  probe. Both MUST judge the SAME file set — a signal computed over a wider or
 *  narrower scope than the digest it explains would be worse than none — so the
 *  scope lives in one place rather than being duplicated at each call site. */
function digestScope(): string[] {
  return [
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
}

/** The change's code state from ONE capture: the content fingerprint and the
 *  whole-tree-clean signal, both over the shared denylist scope. */
export interface ChangeState {
  /** Content fingerprint of the change's code state; null on any capture failure. */
  digest: string | null;
  /** Whether the working tree is clean in the same scope; null on any capture failure. */
  clean: boolean | null;
}

/**
 * Compute the digest AND the clean signal from a SINGLE `git diff HEAD` +
 * `ls-files` capture. `computeChangeDigest` and `computeWorkingTreeClean` are thin
 * wrappers over this, so a caller that needs both (check.service) pays for one
 * capture instead of two near-identical ones. No `isGitWorkTree` probe: `git
 * rev-parse HEAD` and the diff already fail outside a work tree and on an unborn
 * HEAD, so both fields fall closed to null there — the same tri-state PB-013
 * requires, one spawn cheaper. A capture failure (buffer overrun, unborn HEAD)
 * yields null for BOTH, never a constant that would certify stale code as current.
 */
export function computeChangeState(cwd: string): ChangeState {
  const scope = digestScope();
  const head = gitCapture(cwd, ['rev-parse', 'HEAD']);
  if (head === null) return { digest: null, clean: null };
  const diff = gitCapture(cwd, ['diff', 'HEAD', ...scope]);
  if (diff === null) return { digest: null, clean: null };
  // `?? ''` here would silently drop the untracked dimension — fail-open, the
  // pattern issue #103 removed. Fail closed to null for both instead.
  const untrackedOut = gitCapture(cwd, ['ls-files', '--others', '--exclude-standard', ...scope]);
  if (untrackedOut === null) return { digest: null, clean: null };
  const clean = diff === '' && untrackedOut.trim() === '';
  const untracked = untrackedOut
    .split('\n')
    .filter((l) => l.length > 0)
    .sort();
  const hash = createHash('sha256');
  hash.update(`head\0${head.trim()}\0diff\0${diff}`);
  for (const rel of untracked) {
    hash.update(`\0file\0${rel}\0`);
    try {
      hash.update(readFileSync(path.resolve(cwd, rel)));
    } catch {
      // unreadable untracked file — fold in only its path (already hashed above)
    }
  }
  return { digest: hash.digest('hex'), clean };
}

export function computeChangeDigest(cwd: string): string | null {
  return computeChangeState(cwd).digest;
}

/**
 * Whether the working tree is clean in the SAME denylist scope as the digest — an
 * empty `git diff HEAD` and no untracked files (REQ-LIB-024). This is what lets the
 * review/test-provenance stale findings tell a commit-INDUCED stale baseline (tree
 * clean → the recorded baseline predates the current commit, re-record) apart from a
 * genuine code change (tree dirty → re-review / re-run), rather than always reporting
 * the latter.
 *
 * Tri-state on purpose: `null` when it is not a git repository or ANY git capture
 * fails, so a swallowed error can never masquerade as a clean tree (PB-013 — the same
 * fail-closed rule `computeChangeDigest` follows; the evaluators read `null` as "not
 * clean" and keep the code-changed wording). It never widens or opens the gate: a
 * stale baseline still FAILs whatever this returns; only the finding's remedy text
 * changes.
 */
export function computeWorkingTreeClean(cwd: string): boolean | null {
  return computeChangeState(cwd).clean;
}

/**
 * The repo-relative paths a change has touched in the working tree — tracked
 * (`git diff --name-only HEAD`) plus untracked (`git ls-files --others`) — over the
 * SAME denylist scope as the change digest, so a generated `src/**` artifact counts
 * while `.prospec`/`.claude`/`dist`/lockfiles do not.
 *
 * This is the pre-commit counterpart of the `knowledge:check` gate's committed-range
 * diff. The gate runs in CI after the commit and can diff a base branch; the
 * knowledge-update station runs at the verify S/A commit prompt, BEFORE the feature
 * commit, when every edit still sits in the working tree — so this, not a base
 * branch the shipped tool cannot assume downstream, is how the station sees what the
 * change touched. Both attribute those paths through the one `moduleAttributor`.
 *
 * Tri-state fail-closed, exactly like `computeChangeDigest`/`computeWorkingTreeClean`
 * (PB-013): null when it is not a git repository or ANY git capture fails, so a
 * swallowed error can never masquerade as an empty change set.
 */
export function changedPathsFromWorkTree(cwd: string): string[] | null {
  if (!isGitWorkTree(cwd)) return null;
  const scope = digestScope();
  const tracked = gitCapture(cwd, ['diff', '--name-only', 'HEAD', ...scope]);
  if (tracked === null) return null;
  const untracked = gitCapture(cwd, ['ls-files', '--others', '--exclude-standard', ...scope]);
  if (untracked === null) return null;
  const paths = new Set<string>();
  for (const line of [...tracked.split('\n'), ...untracked.split('\n')]) {
    const p = line.trim();
    if (p.length > 0) paths.add(p);
  }
  return [...paths].sort();
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
  /** The one whole-tree clean signal. Defaults to computing it (mirroring
   *  collectTestProvenance's probe default) so any caller is correct; check.service
   *  computes it once and passes it into both provenance collectors. */
  workingTreeClean: boolean | null = computeWorkingTreeClean(cwd),
  /** The one work-tree probe. Defaults to probing so any caller is correct;
   *  check.service computes it once and shares it across the git-backed collectors. */
  inWorkTree: boolean = isGitWorkTree(cwd),
): ReviewProvenanceSource {
  if (!inWorkTree) {
    return {
      available: false,
      reason: 'source unavailable: not a git repository',
      current_digest: null,
      working_tree_clean: null,
      changes: [],
    };
  }
  const changesDir = path.resolve(cwd, '.prospec/changes');
  if (!existsSync(changesDir)) {
    return {
      available: false,
      reason: 'source unavailable: .prospec/changes/ not found (not version-controlled)',
      current_digest: null,
      working_tree_clean: null,
      changes: [],
    };
  }
  const current_digest = digest;
  if (current_digest === null) {
    return {
      available: false,
      reason: 'source unavailable: could not compute the current change digest',
      current_digest: null,
      working_tree_clean: null,
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
  return { available: true, current_digest, working_tree_clean: workingTreeClean, changes };
}

/**
 * Collect delta-spec-provenance facts for every change in `.prospec/changes/`
 * (REQ-LIB-045). Sibling of collectReviewProvenance, with one structural
 * difference: there is no single current digest to pass in, because each change
 * fingerprints its OWN `delta-spec.md`.
 *
 * Deliberately NOT gated on being a git repository — the fingerprint hashes bytes,
 * so it is just as meaningful outside one, and requiring git here would skip the
 * gate in exactly the environments (fresh clone, export) where a stale landing
 * block is most likely to go unnoticed. Only a missing `.prospec/changes/` makes
 * the source unavailable; a change that carries no delta-spec is flagged per change
 * so the evaluator can skip it, because marking the whole source unavailable for
 * one quick change would blind the gate to every other change beside it.
 */
export function collectDeltaSpecProvenance(cwd: string): DeltaSpecProvenanceSource {
  const changesDir = path.resolve(cwd, '.prospec/changes');
  if (!existsSync(changesDir)) {
    return {
      available: false,
      reason: 'source unavailable: .prospec/changes/ not found (not version-controlled)',
      changes: [],
    };
  }
  const changes: DeltaSpecProvenanceChange[] = [];
  for (const entry of enumerateChangeMetadata(changesDir, cwd)) {
    // unparseable metadata — metadata-completeness owns that finding, not this one
    if (entry.meta === null) continue;
    const changeDir = path.join(changesDir, entry.name);
    const prov = entry.meta.delta_spec_provenance as { digest?: unknown } | undefined;
    changes.push({
      name: entry.name,
      source_path: entry.source_path,
      status: readString(entry.meta.status),
      scale: readString(entry.meta.scale),
      recorded_digest: prov && typeof prov.digest === 'string' ? prov.digest : null,
      current_digest: computeDeltaSpecDigest(changeDir),
      delta_spec_present: existsSync(path.join(changeDir, 'delta-spec.md')),
      backfill_draft_present: existsSync(path.join(changeDir, 'backfill-draft.md')),
    });
  }
  return { available: true, changes };
}

/** One MODIFIED or REMOVED delta-spec entry the landing-fidelity check assesses. */
export interface LandingFidelityEntry {
  change: string;
  /** repo-relative delta-spec.md path — the finding anchor. */
  source_path: string;
  reqId: string;
  feature: string;
  /** Whether the declared `**Feature:**` actually hosts this REQ id. A non-`resolved`
   *  verdict is a routing-header misplacement the check fails on (issue #211) — the
   *  same verdict the archive write path refuses on, from one shared classifier. */
  resolution: RoutingResolution;
  /** `**Spec:**` landing body; `''` when the entry carries no Spec block. */
  landing: string;
  /** The current trust-zone REQ body the landing would overwrite verbatim; null
   *  when the REQ has no resolvable existing body (ADDED-like) or no Spec block —
   *  either way the entry is excluded from the drop comparison. */
  existingBody: string | null;
  /** Bullets declared under `**Dropped:**`, parsed with the same collector the
   *  drop diff uses so keys match. */
  declared: Bullet[];
  /** True when `**Dropped:**` carries non-empty content — drives the prose-"none"
   *  warning when it nonetheless parses to zero list items. */
  droppedBlockPresent: boolean;
}

/** Unlike its provenance sibling there is no per-change digest here: the check
 *  compares each MODIFIED entry's landing block against the body it would replace. */
export interface DeltaSpecLandingFidelitySource {
  available: boolean;
  reason?: string;
  entries: LandingFidelityEntry[];
}

/** The current trust-zone REQ body a landing block would overwrite — resolved the
 *  same way `archive.service`'s in-place merge resolves it (`indexSpec` boundaries,
 *  the title line stripped), across the main file and any slice, so the check and
 *  archive compare against byte-identical text. */
function resolveExistingReqBody(
  featuresDir: string,
  feature: string,
  reqId: string,
): string | null {
  if (!isSafeResourceName(feature)) return null;
  const loaded = loadFeatureSpecContent(featuresDir, feature);
  if (!loaded) return null;
  const specContent: SpecContent = loaded.specContent;
  const rec = indexSpec(specContent, { includeStruck: true }).requirements.find(
    (r) => r.id === reqId,
  );
  if (!rec) return null;
  const source = rec.slice
    ? typeof specContent === 'string'
      ? undefined
      : specContent.slices[rec.slice]
    : typeof specContent === 'string'
      ? specContent
      : specContent.main;
  if (source === undefined) return null;
  const oldLines = stripTrailingCr(source.slice(rec.start, rec.end)).split('\n');
  return oldLines.slice(1).join('\n');
}

/**
 * Collect landing-fidelity facts for every change in `.prospec/changes/`.
 *
 * Deliberately NOT audit-scoped like the provenance gates: the whole point is to
 * surface an undeclared landing-block drop OR a mis-pointing routing header at
 * plan/review/verify — before archive, the only station that catches them today —
 * so every in-progress change's delta-spec is read regardless of status. Only a
 * missing `.prospec/changes/` makes the source unavailable; a change with no
 * delta-spec, no MODIFIED/REMOVED entry, or no `**Feature:**` simply contributes no
 * entries. Per-change I/O is guarded so one unreadable file costs its own entry,
 * never the other eighteen verdicts. The reqId→home index is built once per run and
 * shared across every entry's routing resolution.
 */
export function collectDeltaSpecLandingFidelity(
  featuresDir: string,
  cwd: string,
): DeltaSpecLandingFidelitySource {
  const changesDir = path.resolve(cwd, '.prospec/changes');
  if (!existsSync(changesDir)) {
    return {
      available: false,
      reason: 'source unavailable: .prospec/changes/ not found (not version-controlled)',
      entries: [],
    };
  }
  const reqHomes = buildReqHomeIndex(featuresDir);
  const entries: LandingFidelityEntry[] = [];
  for (const change of enumerateChangeMetadata(changesDir, cwd)) {
    // The delta-spec read goes through the non-throwing wrapper (null = absent or
    // unreadable), so one bad file skips its change rather than aborting all 19 checks.
    const deltaContent = readTextOrSkip(path.join(changesDir, change.name, 'delta-spec.md'));
    if (deltaContent === null) continue;
    const sourcePath = change.source_path.replace(/metadata\.yaml$/, 'delta-spec.md');
    for (const entry of iterateDeltaEntries(deltaContent)) {
      // REMOVED joins MODIFIED here: both carry a `**Feature:**` the archive write
      // path routes by, so a mis-pointing one must fail the same way (issue #211).
      // A REMOVED entry has no landing block, so only its routing header is assessed.
      if ((entry.section !== 'MODIFIED' && entry.section !== 'REMOVED') || !entry.feature) continue;
      const landing = extractDeltaBlock(entry.body, 'Spec').content;
      const droppedContent = extractDeltaBlock(entry.body, 'Dropped').content;
      entries.push({
        change: change.name,
        source_path: sourcePath,
        reqId: entry.reqId,
        feature: entry.feature,
        resolution: classifyRoutingResolution(entry.reqId, entry.feature, reqHomes),
        landing,
        existingBody:
          landing === '' ? null : resolveExistingReqBody(featuresDir, entry.feature, entry.reqId),
        declared: declaredDrops(entry.body),
        droppedBlockPresent: droppedContent.trim() !== '',
      });
    }
  }
  return { available: true, entries };
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
  /** The one whole-tree clean signal — placed after `probe` so existing positional
   *  probe callers keep working. Defaults to computing it; check.service passes the
   *  once-computed value shared with collectReviewProvenance. */
  workingTreeClean: boolean | null = computeWorkingTreeClean(cwd),
  /** The one work-tree probe — placed after `workingTreeClean` so existing positional
   *  callers keep working. Defaults to probing; check.service shares its once-computed
   *  value across the git-backed collectors. */
  inWorkTree: boolean = isGitWorkTree(cwd),
): TestProvenanceSource {
  const unavailable = (reason: string): TestProvenanceSource => ({
    available: false,
    reason,
    command_unavailable_reason: null,
    current_digest: null,
    working_tree_clean: null,
    changes: [],
  });
  if (!inWorkTree) return unavailable('source unavailable: not a git repository');
  const changesDir = path.resolve(cwd, '.prospec/changes');
  if (!existsSync(changesDir)) {
    return unavailable(
      'source unavailable: .prospec/changes/ not found (not version-controlled)',
    );
  }
  const current_digest = digest;
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
  return {
    available: true,
    command_unavailable_reason,
    current_digest,
    working_tree_clean: workingTreeClean,
    changes,
  };
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
      missing_verify_grade: GRADED_STATUSES.has(status) && !hasVerifyGrade(meta.quality_log, status),
    });
  }
  return { available: true, changes };
}

/** True when the /prospec-verify grade that still counts is S or A.
 *  Prefers the structured `grade` field (issue #61); falls back to the legacy
 *  shape where the grade was written into `result` (pre-#61 metadata) so already
 *  archived changes still satisfy the gate. Which entry counts depends on
 *  `status`: `archived` keeps the historical any-entry reading so stable history
 *  cannot flip, while every other graded status reads only the LATEST verify —
 *  a re-verify at B/C/D must not stay green on an earlier S/A. */
function hasVerifyGrade(quality_log: unknown, status: string): boolean {
  if (!Array.isArray(quality_log)) return false;

  // Trimmed like readGateResults: these rows come off raw YAML with no schema
  // pass, and an exact match on `"A "` would flip a genuinely verified change
  // into a FAIL-class metadata-completeness finding (#103, PB-007 sweep).
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  type LogEntry = { skill?: unknown; result?: unknown; grade?: unknown };
  const asEntry = (entry: unknown): LogEntry | null =>
    entry !== null && typeof entry === 'object' ? (entry as LogEntry) : null;
  const isVerify = (entry: unknown): boolean => str(asEntry(entry)?.skill) === 'prospec-verify';
  const isPass = (entry: unknown): boolean => {
    const e = asEntry(entry);
    if (e === null) return false;
    const grade = str(e.grade);
    const result = str(e.result);
    return grade === 'S' || grade === 'A' || result === 'S' || result === 'A';
  };

  if (status === 'archived') {
    return quality_log.some((entry) => isVerify(entry) && isPass(entry));
  } else {
    const lastVerify = quality_log.findLast(isVerify);
    return lastVerify ? isPass(lastVerify) : false;
  }
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

/**
 * Collect Canonical Doc Drift - compares each present canonical/no-authored-content
 * init doc against its template-rendered content. Resolves actual locations, reuses
 * init's rendering path, and normalizes CRLF to LF for comparison.
 */
export function collectCanonicalDocDrift(
  config: ProspecConfig,
  cwd: string,
  initDocs: InitDocRenderer,
): CanonicalDocDriftSource {
  const docs: CanonicalDocDriftItem[] = [];
  let contexts;
  try {
    contexts = initDocs.buildInitDocContexts(config, cwd);
  } catch (e) {
    // Never throw out of a runChecks(...) argument (AC#3): a malformed config that
    // still passed readConfig must degrade this one check to skipped, not abort all.
    return {
      available: false,
      reason: `source unavailable: ${e instanceof Error ? e.message : String(e)}`,
      docs: [],
    };
  }

  for (const doc of CANONICAL_INIT_DOCS) {
    const { absPath, label } = initDocs.resolveInitDocLocation(doc, config, cwd);
    if (!existsSync(absPath)) continue;

    const actual = readTextOrSkip(absPath);
    if (actual === null) continue;
    let expected: string;
    try {
      expected = initDocs.renderInitDoc(doc, contexts);
    } catch {
      // The spec explicitly requires: "the collector never throws (per-doc read/render is try/skip)"
      continue;
    }

    const normActual = actual.replace(/\r\n/g, '\n').trimEnd() + '\n';
    const normExpected = expected.replace(/\r\n/g, '\n').trimEnd() + '\n';

    docs.push({
      source_path: label,
      matches: normActual === normExpected,
    });
  }

  if (docs.length === 0) {
    return { available: false, reason: 'no canonical docs present', docs: [] };
  }

  return { available: true, docs };
}
