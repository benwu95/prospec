import * as fs from 'node:fs';
import * as path from 'node:path';
import { ensureDir, atomicWrite } from '../lib/fs-utils.js';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { parseYaml, stringifyYaml } from '../lib/yaml-utils.js';
import { parseTaskLine } from '../lib/task-markers.js';
import { isArchivedSpec, isSafeResourceName, loadModuleMap, loadFeatureSpecContent } from '../lib/knowledge-reader.js';
import { reqIdToPrefix } from '../lib/drift-sources.js';
import { checkKnowledgeSync } from '../lib/knowledge-sync.js';
import { evaluateArchiveEntryGate } from '../lib/archive-gate.js';
import { matchReqHeading, readSpecCounters, indexSpec, hasChangeHistorySection, type SpecContent, type SpecIndex } from '../lib/spec-headings.js';
import { hasUnclosedFence, withoutFencedBlocks } from '../lib/markdown-fences.js';
import { constitutionFallbackModuleMap } from '../lib/drift-checker.js';
import { renderTemplate } from '../lib/template.js';
import { escapeTableCell } from '../lib/markdown-table.js';
import { stripTrailingCr } from '../lib/text-lines.js';
import { normalizeIssueRef } from '../lib/change-metadata.js';
import {
  assessDrops,
  classifyBlockTerminator,
  classifyRoutingResolution,
  declaredDrops,
  DELTA_TEMPLATE_FIELDS,
  extractDeltaBlock,
  iterateDeltaEntries,
  whenThenBullets,
  type BlockTerminator,
  type Bullet,
  type DeltaBlock,
  type DeltaBlockTruncation,
} from '../lib/landing-fidelity.js';
import { buildReqHomeIndex } from '../lib/spec-read.js';
// Re-exported so `services/archive.service` stays the documented import site for
// the landing-fidelity parsers, even though their single implementation now lives
// in `lib/landing-fidelity` — shared verbatim with the delta-spec-landing-fidelity
// drift check so the two comparisons can never diverge.
export {
  classifyBlockTerminator,
  declaredDrops,
  DELTA_TEMPLATE_FIELDS,
  extractDeltaBlock,
  whenThenBullets,
};
export type { BlockTerminator, Bullet, DeltaBlock, DeltaBlockTruncation };
import type { ChangeStatus } from '../types/change.js';
import type { ProspecConfig } from '../types/config.js';
import { assessCurrentDrift } from '../lib/drift-assessment.js';
import type { CurrentDriftAssessment } from '../types/drift-report.js';
import { PrerequisiteError } from '../types/errors.js';
import type { ModuleMap } from '../types/module-map.js';
import type { FeatureEntry } from '../types/feature-map.js';
import { ScanError, WriteError } from '../types/errors.js';

// --- Interfaces ---

export interface ArchiveOptions {
  /** Filter changes by this status (default: 'verified') */
  status?: ChangeStatus;
  /** Specific change names to archive (if empty, archive all matching) */
  names?: string[];
  /** Working directory */
  cwd?: string;
  /** Compute and report every mutation without writing anything */
  dryRun?: boolean;
  /** Exempt the `metadata-completeness` Entry-Gate condition only (pre-schema records) */
  allowIncomplete?: boolean;
}

export interface ChangeEntry {
  name: string;
  dir: string;
  metadata: Record<string, unknown>;
  status: string;
}

export interface ArchiveResult {
  archived: ArchivedChange[];
  skipped: string[];
  /** Why each skipped change was skipped, keyed by change name */
  skippedReasons: Record<string, string>;
  affectedModules: string[];
  specFiles: string[];
  /** True when the run was a dry-run preview (nothing written) */
  dryRun: boolean;
  /** Mutations a dry-run would perform; empty on a real run */
  planned: PlannedMutation[];
  /** Named targets that exist but do not have the target status */
  refused: RefusedChange[];
  /** Named targets with no matching change directory */
  notFound: string[];
  /**
   * REQs whose Feature-Spec body the sync did NOT replace (REQ-SERVICES-072) —
   * the graduation phase's worklist. Populated under dry-run too.
   */
  pendingConvergence: PendingConvergence[];
  /**
   * REQs whose replacement body omitted authored behavior — the graduation
   * phase confirms each dropped bullet was deliberate. Dry-run too.
   */
  droppedBehavior: DroppedBehavior[];
  /**
   * REQs the sync refused to land because their delta-spec landing block was cut
   * short by a foreign label (REQ-SERVICES-081). Blocking-class: the feature spec
   * was left byte-identical. Dry-run too.
   */
  refusedRequirements: SpecRefusal[];
  /** Dropped bullets the delta-spec declared deliberate — informational. Dry-run too. */
  acknowledgedDrops: DroppedBehavior[];
  /** Declared bullets that were not actually dropped — informational. Dry-run too. */
  staleDeclarations: StaleDeclaration[];
  /** Feature specs with no `## Change History` host for the graduation row —
   *  surfaced loudly, never blocking. Dry-run too. */
  missingChangeHistory: MissingChangeHistory[];
  /**
   * Why the product.md Feature Map sync wrote nothing, or null when it wrote.
   * A decline is the ONLY signal that the Feature Map is not current — without it
   * a silent non-write reads exactly like a successful sync.
   */
  productSpecDeclined: ProductSpecDecline | null;
}

export interface PlannedMutation {
  /** `skip` is a planned NON-mutation — a write the run will deliberately not perform. */
  action: 'move' | 'write' | 'update' | 'skip';
  target: string;
  detail: string;
}

export interface RefusedChange {
  name: string;
  status: string;
  reason: string;
}

export interface ArchivedChange {
  name: string;
  sourcePath: string;
  archivePath: string;
  summaryGenerated: boolean;
}

/** Routing info extracted from delta-spec Feature/Story fields. */
export interface FeatureRoute {
  reqId: string;
  feature: string;
  story: string;
  status: 'ADDED' | 'MODIFIED' | 'REMOVED';
  description: string;
  /** The `**Spec:**` block — the body that lands verbatim in the Feature Spec. */
  specBody?: string;
  /** Fallback body for ADDED: `**Description:**` prose + `**Acceptance Criteria:**` as bullets. */
  descriptionBody?: string;
  /** Set when a label outside the template registry cut the landing block short —
   *  the body carried here is incomplete, so the REQ is refused rather than landed
   *  (REQ-SERVICES-081). */
  truncation?: DeltaBlockTruncation;
  /** Bullets the entry's `**Dropped:**` block declares it does not carry into the new body —
   *  the only thing that releases a drop for writing (REQ-SERVICES-083). */
  declaredDrops?: Bullet[];
}

/**
 * A REQ the sync REFUSED to land, rather than corrupting the trust zone. Two
 * authoring errors in the delta-spec, each fixed in the delta-spec and never in the
 * feature spec, both left the feature spec byte-identical and drive the non-zero
 * exit (REQ-CLI-034):
 *
 * - `truncation` — the landing block was cut short by a label the template does not
 *   own (REQ-SERVICES-081): the block is incomplete, so no comparison against the
 *   current body would mean anything.
 * - `unresolved-feature` — a MODIFIED/REMOVED REQ whose `**Feature:**` header names
 *   a feature that does not host that REQ id while the REQ demonstrably lives in
 *   ANOTHER feature (REQ-SERVICES-096): landing it would append a stale duplicate in
 *   the wrong feature. `home` names the feature that actually carries the REQ id. A
 *   REQ that lives in no feature yet is NOT refused — that is a legitimate
 *   create-and-deprecate shape, not a mis-route.
 *
 * Distinct from `PendingConvergence` (body kept because there was nothing to land —
 * normal, expected) and from `DroppedBehavior` (body replaced, some behavior not
 * restated — a judgment call).
 */
export type SpecRefusal =
  | {
      kind: 'truncation';
      feature: string;
      reqId: string;
      /** Which delta-spec block was cut short — the one the author must fix. */
      block: string;
      /** The label that interrupted the block. */
      label: string;
      /** The interrupting line as written, so the author can find the spot. */
      firstSwallowedLine: string;
      swallowedCount: number;
    }
  | {
      kind: 'unresolved-feature';
      feature: string;
      reqId: string;
      /** The feature that actually carries the REQ id (a wrong-feature mis-route). */
      home: string;
    };

/** A REQ whose Feature-Spec body the sync did NOT replace — a human must converge it. */
export interface PendingConvergence {
  feature: string;
  reqId: string;
  reason: string;
}

/**
 * A REQ whose body a landing block DID replace, and the authored behavior that
 * replacement left behind. The opposite situation to `PendingConvergence`: there
 * the body survived and needs converging; here it was superseded and what the
 * new body omits needs confirming. Kept as its own list so neither meaning is
 * overloaded onto the other.
 */
export interface DroppedBehavior {
  feature: string;
  reqId: string;
  /** The existing `WHEN … THEN …` bullets absent from the replacement, as written. */
  bullets: string[];
}

/** Bullets an entry declared as not carried into the new body that were not dropped at all —
 *  the author is describing a body the spec no longer has. Reported, never blocking:
 *  nothing is lost by a declaration that matches nothing. */
export interface StaleDeclaration {
  feature: string;
  reqId: string;
  bullets: string[];
}

/**
 * A feature spec that took graduation edits but carries NO `## Change History`
 * section anywhere — not the mother file, not any registered slice — so the
 * graduation row had nowhere to land. The row is `appendToChangeHistory`'s only
 * provenance write; without a host it would vanish with no trace. Reported loudly
 * but NOT blocking: the REQ bodies still landed, so holding their write over a
 * missing provenance section would discard real behavior to punish an authoring
 * gap. The fix is to restore (or register a slice carrying) the section.
 */
export interface MissingChangeHistory {
  feature: string;
  changeName: string;
  /** The REQ ids whose graduation row could not be recorded. */
  reqIds: string[];
}

export interface SpecSyncResult {
  /** Feature Spec files created or updated. */
  files: string[];
  /** REQs left for the graduation phase; populated under dry-run too. */
  pendingConvergence: PendingConvergence[];
  /** Dropped bullets NOT declared deliberate — the blocking list. A file with any
   *  of these is left byte-identical. Unchanged in meaning for a delta-spec that
   *  declares nothing, which is every delta-spec written before REQ-SERVICES-083. */
  droppedBehavior: DroppedBehavior[];
  /** Dropped bullets the entry declared deliberate — informational, never blocking. */
  acknowledgedDrops: DroppedBehavior[];
  /** Declared bullets that were not actually dropped; informational. */
  staleDeclarations: StaleDeclaration[];
  /** REQs refused because their landing block was truncated; dry-run too. */
  refusedRequirements: SpecRefusal[];
  /** Feature specs with no `## Change History` host for the graduation row —
   *  surfaced loudly, never blocking. Dry-run too. */
  missingChangeHistory: MissingChangeHistory[];
}

// --- Core functions ---

/**
 * Scan .prospec/changes/ for all change directories with metadata.yaml.
 */
export async function scanChanges(cwd: string): Promise<ChangeEntry[]> {
  const changesDir = path.join(cwd, '.prospec', 'changes');

  if (!fs.existsSync(changesDir)) {
    return [];
  }

  let entries: string[];
  try {
    entries = await fs.promises.readdir(changesDir);
  } catch (err) {
    throw new ScanError(changesDir, err instanceof Error ? err.message : String(err));
  }

  const changes: ChangeEntry[] = [];

  for (const entry of entries) {
    const changeDir = path.join(changesDir, entry);
    const metadataPath = path.join(changeDir, 'metadata.yaml');

    // Skip non-directories
    const stat = await fs.promises.stat(changeDir).catch(() => null);
    if (!stat?.isDirectory()) continue;

    // Skip directories without metadata.yaml
    if (!fs.existsSync(metadataPath)) continue;

    // Discovery pass over EVERY change directory — deliberately lenient, like
    // the drift collectors. Enforcing the schema here would let one malformed
    // sibling hide every archivable change.
    try {
      const content = await fs.promises.readFile(metadataPath, 'utf-8');
      const metadata = parseYaml<Record<string, unknown>>(content, metadataPath);
      changes.push({
        name: entry,
        dir: changeDir,
        metadata,
        status: String(metadata.status ?? 'unknown'),
      });
    } catch {
      // Skip changes with unparseable metadata
      continue;
    }
  }

  return changes;
}

/**
 * Filter changes by status.
 */
export function filterByStatus(
  changes: ChangeEntry[],
  status: ChangeStatus = 'verified',
): ChangeEntry[] {
  return changes.filter((c) => c.status === status);
}

/**
 * Compute the .prospec/archive/{YYYY-MM-DD}-{name}/ destination for a change.
 * Single source for the archive-dir naming, shared by moveToArchive and dry-run.
 */
export function archiveDirFor(cwd: string, changeName: string): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(cwd, '.prospec', 'archive', `${today}-${changeName}`);
}

/**
 * Move a change directory to .prospec/archive/{YYYY-MM-DD}-{name}/.
 */
export async function moveToArchive(
  change: ChangeEntry,
  cwd: string,
): Promise<string> {
  const archiveDir = archiveDirFor(cwd, change.name);

  if (fs.existsSync(archiveDir)) {
    throw new WriteError(archiveDir, 'Archive directory already exists');
  }

  await ensureDir(archiveDir);

  // Move all files from change directory to archive. A mid-loop failure must
  // not leave the change split across the source and archive directories, so
  // already-moved files are rolled back (best effort) before rethrowing.
  const files = await fs.promises.readdir(change.dir);
  const moved: Array<{ src: string; dest: string }> = [];
  try {
    for (const file of files) {
      const src = path.join(change.dir, file);
      const dest = path.join(archiveDir, file);
      await fs.promises.rename(src, dest);
      moved.push({ src, dest });
    }
  } catch (err) {
    for (const { src, dest } of moved.reverse()) {
      await fs.promises.rename(dest, src).catch(() => { /* best effort rollback */ });
    }
    await fs.promises.rmdir(archiveDir).catch(() => { /* best effort cleanup */ });
    throw new WriteError(
      archiveDir,
      `archive move failed and was rolled back: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Remove the now-empty source directory
  await fs.promises.rmdir(change.dir);

  return archiveDir;
}

/**
 * Generate summary.md from proposal.md and delta-spec.md.
 * Returns the summary content string and list of affected modules.
 */
export async function generateSummary(
  archiveDir: string,
  changeName: string,
  createdDate: string,
): Promise<{ content: string; affectedModules: string[] }> {
  // Read proposal.md for User Story
  const proposalPath = path.join(archiveDir, 'proposal.md');
  let userStory = 'N/A';
  if (fs.existsSync(proposalPath)) {
    const proposalContent = await fs.promises.readFile(proposalPath, 'utf-8');
    userStory = extractUserStory(proposalContent);
  }

  // Read delta-spec.md for REQ IDs and affected modules
  const deltaSpecPath = path.join(archiveDir, 'delta-spec.md');
  let reqTable = 'No delta-spec.md found.';
  let moduleTable = 'No delta-spec.md found.';
  const affectedModules: string[] = [];

  if (fs.existsSync(deltaSpecPath)) {
    const deltaContent = await fs.promises.readFile(deltaSpecPath, 'utf-8');
    const reqs = extractRequirements(deltaContent);
    const modules = extractAffectedModules(deltaContent);
    affectedModules.push(...modules.map((m) => m.name));

    if (reqs.length > 0) {
      reqTable = '| REQ ID | Status | Description |\n|--------|--------|-------------|\n'
        + reqs.map((r) => `| ${r.id} | ${r.status} | ${r.description} |`).join('\n');
    }

    if (modules.length > 0) {
      moduleTable = '| Module | Impact | Description |\n|--------|--------|-------------|\n'
        + modules.map((m) => `| ${m.name} | ${m.impact} | ${m.description} |`).join('\n');
    }
  }

  // Read tasks.md for completion stats
  const tasksPath = path.join(archiveDir, 'tasks.md');
  let taskStats = 'N/A';
  if (fs.existsSync(tasksPath)) {
    const tasksContent = await fs.promises.readFile(tasksPath, 'utf-8');
    taskStats = calculateTaskStats(tasksContent);
  }

  // Read metadata for quality grade and the external-tracker registration
  const metadataPath = path.join(archiveDir, 'metadata.yaml');
  let qualityGrade = 'Unverified';
  let issue: string | undefined;
  if (fs.existsSync(metadataPath)) {
    const metaContent = await fs.promises.readFile(metadataPath, 'utf-8');
    const meta = parseYaml<Record<string, unknown>>(metaContent, metadataPath);
    if (meta.quality_grade) {
      qualityGrade = String(meta.quality_grade);
    }
    // Through the shared normalizer, never raw: the summary is copied VERBATIM
    // into the committed `_archived-history/` trail, where a value carrying a
    // line break renders a forged `##` heading and a forged
    // `- **Quality Grade**:` row below the real one. It also absorbs the lenient
    // read here (a non-string value reads as nothing registered).
    issue = normalizeIssueRef(meta.issue);
  }

  const today = new Date().toISOString().slice(0, 10);
  const content = `# ${changeName} — Archive Summary

- **Archived**: ${today}
- **Original Created**: ${createdDate}
- **Quality Grade**: ${qualityGrade}
${issue === undefined ? '' : `- **Issue**: ${issue}\n`}
## User Story

${userStory}

## Affected Modules

${moduleTable}

## Requirements

${reqTable}

## Completion

- **Tasks**: ${taskStats}
`;

  return { content, affectedModules };
}

/**
 * Sync delta-spec requirements to Feature Specs in specs/features/.
 * Routes each requirement by its **Feature** field to the correct Feature Spec file.
 * Returns list of created/updated Feature Spec file paths.
 */
/**
 * Read the delta-spec's Feature routes from a change/archive dir.
 * Single source for spec-sync's trigger: `routes.length > 0` is exactly the
 * condition under which syncToFeatureSpecs touches featuresPath (ensureDir),
 * so the dry-run prediction must consult THIS, not the returned file list —
 * an all-unsafe-slug delta-spec writes no spec file yet still creates the dir.
 */
async function readFeatureRoutes(artifactsDir: string): Promise<FeatureRoute[]> {
  const deltaSpecPath = path.join(artifactsDir, 'delta-spec.md');
  if (!fs.existsSync(deltaSpecPath)) return [];
  const deltaContent = await fs.promises.readFile(deltaSpecPath, 'utf-8');
  return extractFeatureRoutes(deltaContent);
}

function determineTargetSlice(route: FeatureRoute, specIndex: SpecIndex): string | null {
  let slice: string | null = null;
  if (route.status === 'MODIFIED' || route.status === 'REMOVED') {
    const req = specIndex.requirements.find((r) => r.id === route.reqId);
    slice = req?.slice ?? null;
  } else if (route.status === 'ADDED') {
    const story = specIndex.stories.find((s) => s.id === route.story);
    slice = story?.slice ?? null;
  }
  return slice;
}

type ChangeHistoryHost = { kind: 'main' } | { kind: 'slice'; name: string } | null;

/**
 * Which file carries the `## Change History` section the graduation row is
 * appended under — the mother file, a registered slice, or none.
 *
 * Mother-first, so a spec that keeps the section where it has always lived writes
 * exactly as before; a spec that has moved it into a slice (to shed weight from an
 * over-budget mother file) routes the row into that slice instead. `null` means no
 * registered file carries the section, so the row has nowhere to land — the caller
 * reports it loudly rather than letting `appendToChangeHistory` drop it silently.
 */
function locateChangeHistoryHost(spec: SpecContent): ChangeHistoryHost {
  const main = typeof spec === 'string' ? spec : spec.main;
  if (hasChangeHistorySection(main)) return { kind: 'main' };
  if (typeof spec === 'string') return null;
  for (const name of Object.keys(spec.slices)) {
    if (hasChangeHistorySection(spec.slices[name]!)) return { kind: 'slice', name };
  }
  return null;
}

export async function syncToFeatureSpecs(
  archiveDir: string,
  featuresPath: string,
  /**
   * The change being archived — it names its own Change History row.
   *
   * Required, not optional-with-a-fallback: the column used to carry a fixed
   * string, which passed every positive assertion while identifying nothing. A
   * default here would let the next caller re-create that silently.
   */
  changeName: string,
  dryRun = false,
): Promise<SpecSyncResult> {
  const routes = await readFeatureRoutes(archiveDir);
  if (routes.length === 0) {
    return {
      files: [],
      pendingConvergence: [],
      droppedBehavior: [],
      acknowledgedDrops: [],
      staleDeclarations: [],
      refusedRequirements: [],
      missingChangeHistory: [],
    };
  }

  if (!dryRun) await ensureDir(featuresPath);

  // The one cross-feature REQ-location index, built once from the trust zone as it
  // stands before this run. Every MODIFIED/REMOVED route is resolved against it
  // through the SAME classifier the `delta-spec-landing-fidelity` check uses, so a
  // mis-pointing `**Feature:**` header is refused here exactly as the check fails it.
  const reqHomes = buildReqHomeIndex(featuresPath);

  // Group routes by feature slug
  const byFeature = new Map<string, FeatureRoute[]>();
  for (const route of routes) {
    const existing = byFeature.get(route.feature) ?? [];
    existing.push(route);
    byFeature.set(route.feature, existing);
  }

  const updatedFiles: string[] = [];
  const pendingConvergence: PendingConvergence[] = [];
  const droppedBehavior: DroppedBehavior[] = [];
  const refusedRequirements: SpecRefusal[] = [];
  const acknowledgedDrops: DroppedBehavior[] = [];
  const staleDeclarations: StaleDeclaration[] = [];
  const missingChangeHistory: MissingChangeHistory[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const [feature, featureRoutes] of byFeature) {
    // The feature slug becomes a filename — a crafted `**Feature:** ../../x`
    // must never escape featuresPath. Same name guard the spec read surfaces use.
    if (!isSafeResourceName(feature)) continue;
    const specFile = path.join(featuresPath, `${feature}.md`);
    const fileExists = fs.existsSync(specFile);

    if (fileExists) {
      const loaded = loadFeatureSpecContent(featuresPath, feature);
      if (!loaded) continue;
      let specContent = loaded.specContent;
      const specIndex = indexSpec(specContent, { includeStruck: true });
      // Tracks whether ANY route actually reached this file. When every route is
      // refused, the frontmatter bump and the Change History row would be the only
      // edits — a file that says "this change touched me" while carrying none of
      // it, which is exactly the false record the refusal exists to prevent.
      let landedAny = false;
      // Per-file worklists. They are held here rather than pushed straight onto the
      // run-level lists because the write decision below depends on them: a file
      // that would lose text is not written at all, and its findings still have to
      // be reported. Deciding after the write would leave the loss on disk.
      const fileRefusals: SpecRefusal[] = [];
      const fileUndeclared: DroppedBehavior[] = [];
      const fileAcknowledged: DroppedBehavior[] = [];
      const fileStale: StaleDeclaration[] = [];
      const filePending: PendingConvergence[] = [];
      const modifiedSlices = new Set<string>();

      for (const route of featureRoutes) {
        // A MODIFIED/REMOVED route whose `**Feature:**` names this feature while the
        // REQ demonstrably lives in ANOTHER feature is refused BEFORE any merge —
        // landing it would fall through to the ADDED append path and write a stale
        // duplicate REQ here (REQ-SERVICES-096). The verdict comes from the shared
        // classifier, so it matches the `delta-spec-landing-fidelity` finding for
        // the same entry. `not-found` (the REQ lives nowhere yet) is NOT a mis-route
        // — a create-and-deprecate REMOVED lands its deprecation record as before.
        if (route.status === 'MODIFIED' || route.status === 'REMOVED') {
          const resolution = classifyRoutingResolution(route.reqId, feature, reqHomes);
          if (resolution.kind === 'wrong-feature') {
            fileRefusals.push({
              kind: 'unresolved-feature',
              feature,
              reqId: route.reqId,
              home: resolution.home,
            });
            continue;
          }
        }
        const targetSlice = determineTargetSlice(route, specIndex);
        let targetContent = targetSlice
          ? (specContent as { main: string; slices: Record<string, string> }).slices[targetSlice]!
          : (typeof specContent === 'string' ? specContent : specContent.main);

        if (route.status === 'REMOVED') {
          landedAny = true;
          targetContent = moveReqToDeprecated(targetContent, route);
          // Deprecation only APPENDS a bullet — the REQ's active section (and its
          // pre-removal body, now describing behavior that no longer exists) stays
          // put. Report it, or the graduation gate passes over dead spec text. The
          // probe reads headings at any level: an h4-only probe reported nothing
          // for a spec whose REQs sit elsewhere, leaving dead text unflagged.
          if (existingReqLevel(targetContent, route.reqId) !== null) {
            filePending.push(pendingFor(route, STALE_DEPRECATED_REASON));
          }
        } else {
          const merged = mergeRequirementInPlace(targetContent, route);
          targetContent = merged.content;
          if (merged.pending) filePending.push(merged.pending);
          if (merged.drops?.undeclared) fileUndeclared.push(merged.drops.undeclared);
          if (merged.drops?.acknowledged) fileAcknowledged.push(merged.drops.acknowledged);
          if (merged.drops?.stale) fileStale.push(merged.drops.stale);
          if (merged.refused) fileRefusals.push(merged.refused);
          else landedAny = true;
        }

        if (targetSlice) {
          (specContent as { main: string; slices: Record<string, string> }).slices[targetSlice] = targetContent;
          modifiedSlices.add(targetSlice);
        } else if (typeof specContent === 'string') {
          specContent = targetContent;
        } else {
          specContent.main = targetContent;
        }
      }

      // THE decision, taken before a byte is written (REQ-CLI-034). A refusal or an
      // undeclared drop means this file would come out of the run holding less
      // authored behavior than it went in with, so it is not written at all —
      // reporting after the write would leave the loss on disk and make the report
      // an obituary rather than a guard.
      //
      // Only the BLOCKING findings survive a hold. `pendingConvergence` describes
      // the file's state AFTER a write that did not happen, and one of its reasons
      // actively instructs a human to strike a REQ body from the trust zone because
      // a deprecation landed — when the file is held, that deprecation exists only
      // in the discarded in-memory copy, so following it would delete authored text
      // for an event that never occurred. The re-run reports it truthfully once the
      // loss is resolved. Same for the two advisory drop lists: they describe writes
      // this run did not perform.
      refusedRequirements.push(...fileRefusals);
      droppedBehavior.push(...fileUndeclared);
      if (fileRefusals.length > 0 || fileUndeclared.length > 0) continue;
      pendingConvergence.push(...filePending);
      acknowledgedDrops.push(...fileAcknowledged);
      staleDeclarations.push(...fileStale);

      // Currently unreachable — every route that fails to land is a refusal, and a
      // refusal already `continue`d above. Kept deliberately, like the fail-closed
      // guard in `computeChangeDigest`: it pins the invariant (a file records a
      // Change History row only when something actually landed in it) against a
      // future path that stops landing a route without refusing it.
      if (!landedAny) continue;
      // Only the routes that landed may claim a Change History row — a no-op today
      // for the same reason, and retained for the same one.
      const landed = featureRoutes.filter((r) => r.truncation === undefined);
      
      // The Change History row follows whichever file carries the section — the
      // mother file, or the slice it was moved into to keep an over-budget mother
      // file within budget. No host anywhere is a loud finding, never a silent
      // drop: `appendToChangeHistory` would return the content untouched.
      const noHost = () =>
        missingChangeHistory.push({ feature, changeName, reqIds: landed.map((r) => r.reqId) });

      if (typeof specContent === 'string') {
        specContent = updateFeatureSpecFrontmatter(specContent, today);
        // A single-file spec has no slices, so `main` is the only possible host.
        if (locateChangeHistoryHost(specContent) === null) noHost();
        else specContent = appendToChangeHistory(specContent, landed, today, changeName);
        if (!dryRun) await atomicWrite(specFile, specContent);
      } else {
        specContent.main = updateFeatureSpecFrontmatter(specContent.main, today);
        const host = locateChangeHistoryHost(specContent);
        if (host === null) {
          noHost();
        } else if (host.kind === 'main') {
          specContent.main = appendToChangeHistory(specContent.main, landed, today, changeName);
        } else {
          // The section lives in a slice — append there and mark it for writing,
          // leaving the mother file's body (only its frontmatter was bumped)
          // byte-identical.
          specContent.slices[host.name] = appendToChangeHistory(
            specContent.slices[host.name]!, landed, today, changeName,
          );
          modifiedSlices.add(host.name);
        }
        if (!dryRun) {
          await atomicWrite(specFile, specContent.main);
          for (const sliceName of modifiedSlices) {
            const resolvedSlice = path.resolve(featuresPath, feature, `${sliceName}.md`);
            await atomicWrite(resolvedSlice, specContent.slices[sliceName]!);
            updatedFiles.push(resolvedSlice);
          }
        } else {
          for (const sliceName of modifiedSlices) {
            updatedFiles.push(path.resolve(featuresPath, feature, `${sliceName}.md`));
          }
        }
      }
    } else {
      // A truncated route is refused on the creation path too — landing a fragment
      // into a brand-new spec is the same loss as landing one into an existing
      // file, minus the chance of noticing it in a diff.
      const refused = featureRoutes.filter((r) => r.truncation !== undefined);
      refusedRequirements.push(
        ...refused.map(
          (r) =>
            ({ kind: 'truncation', feature: r.feature, reqId: r.reqId, ...r.truncation! }) as SpecRefusal,
        ),
      );
      // A MODIFIED/REMOVED route whose REQ demonstrably lives in ANOTHER existing
      // feature is refused rather than fabricated into this brand-new spec
      // (REQ-SERVICES-096, wrong-feature). A REQ that lives nowhere yet is NOT a
      // mis-route — a create-and-deprecate REMOVED, or a first-cut MODIFIED, still
      // lands here, so the create path keeps working exactly as before.
      const misrouted = new Set<FeatureRoute>();
      for (const r of featureRoutes) {
        if (r.truncation !== undefined || (r.status !== 'MODIFIED' && r.status !== 'REMOVED')) continue;
        const resolution = classifyRoutingResolution(r.reqId, feature, reqHomes);
        if (resolution.kind === 'wrong-feature') {
          misrouted.add(r);
          refusedRequirements.push({
            kind: 'unresolved-feature',
            feature,
            reqId: r.reqId,
            home: resolution.home,
          });
        }
      }
      const landable = featureRoutes.filter((r) => r.truncation === undefined && !misrouted.has(r));
      // Every route refused → there is nothing to write. Creating the scaffold
      // anyway would claim the feature is documented when none of it landed.
      if (landable.length === 0) continue;
      const content = createNewFeatureSpec(feature, landable, today, changeName);
      pendingConvergence.push(...landable.filter(bodyless).map((r) => pendingFor(r)));
      if (!dryRun) await atomicWrite(specFile, content);
    }

    updatedFiles.push(specFile);
  }

  return {
    files: updatedFiles,
    pendingConvergence,
    droppedBehavior,
    acknowledgedDrops,
    staleDeclarations,
    refusedRequirements,
    missingChangeHistory,
  };
}

/** One Feature Map entry's identity: the spec it links to and the title shown. */
export interface ProductFeature {
  slug: string;
  title: string;
}

interface FeatureMapEntry {
  title: string;
  /** Verbatim source lines — carrying their own line endings — never re-encoded. */
  descriptionLines: string[];
}

interface FeatureMapEntries {
  bySlug: Map<string, FeatureMapEntry>;
  byTitle: Map<string, FeatureMapEntry>;
}

const FEATURE_MAP_HEADING = 'Feature Map';
const NO_FEATURES_PLACEHOLDER = '_(No active features yet)_';
const TBD_DESCRIPTION = 'TBD — describe this feature and its value in 1-2 sentences.';
/**
 * An entry's machine-owned link line, anchored at BOTH ends: an unanchored match
 * would swallow a cross-reference sentence that merely starts with a link, taking
 * the author's prose with it. Tolerant of the forms a human writes — `./features/`,
 * an ASCII arrow, and all three CommonMark link-title delimiters — because failing
 * to recognize one appends a second link rather than replacing the first.
 */
const FEATURE_LINK_RE =
  /^(?:→|->)\s*\[[^\]]*\]\((?:\.\/)?features\/([^)/\s]+)\.md(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)\s*$/;
const NO_ENTRIES: FeatureMapEntries = { bySlug: new Map(), byTitle: new Map() };

/**
 * List the feature spec files both product.md and feature-map.yaml index — sorted,
 * archived specs excluded, unsafe slugs skipped. ONE copy of the rule: the two
 * indexes must not disagree about the same directory, and a hand-copied filter is
 * exactly how they would drift (PB-006). Unsorted `readdir` order would also make
 * the output differ per filesystem.
 */
async function listFeatureSpecFiles(featuresPath: string): Promise<string[]> {
  return (await fs.promises.readdir(featuresPath))
    .filter(
      (f) =>
        f.endsWith('.md') && !isArchivedSpec(f) && isSafeResourceName(f.slice(0, -'.md'.length)),
    )
    .sort();
}

async function scanActiveFeatures(featuresPath: string): Promise<ProductFeature[]> {
  if (!fs.existsSync(featuresPath)) return [];
  const features: ProductFeature[] = [];
  for (const file of await listFeatureSpecFiles(featuresPath)) {
    const content = await fs.promises.readFile(path.join(featuresPath, file), 'utf-8');
    const frontmatter = parseFeatureSpecFrontmatter(content);
    if (frontmatter === null || frontmatter.status !== 'active') continue;
    const slug = file.slice(0, -'.md'.length);
    // An empty title would render as a bare `### `, which reads back as a heading
    // and turns the next run into an append. The slug is always a usable name.
    features.push({ slug, title: frontmatter.feature.trim() === '' ? slug : frontmatter.feature });
  }
  return features;
}

/**
 * Every h1/h2 in the document, ATX or setext, with the line span the heading itself
 * occupies. A setext underline (`Target Users` over `------------`) IS an h2: reading
 * only `## ` would run the machine-owned region past it and swallow the author's
 * remaining sections. ATX matching is CommonMark-tolerant — up to three leading
 * spaces, any run of spaces after the marker, an optional closing `##` — because a
 * heading this misses is read as absent, and an absent heading grows a duplicate
 * section on every run.
 */
function topLevelHeadings(probe: string[]): Array<{ start: number; contentStart: number; text: string }> {
  const found: Array<{ start: number; contentStart: number; text: string }> = [];
  for (let i = 0; i < probe.length; i++) {
    const line = probe[i] ?? '';
    // The text is OPTIONAL: `##` alone is a valid empty ATX heading, and reading it
    // as ordinary prose swallows every section after it into the machine-owned
    // region. `#hashtag` still does not match — CommonMark needs a space or EOL.
    const atx = /^ {0,3}(#{1,2})(?:[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*)?$/.exec(line);
    if (atx !== null) {
      found.push({ start: i, contentStart: i + 1, text: (atx[2] ?? '').trim() });
      continue;
    }
    // A setext underline applies to the paragraph line above it. Require three or
    // more marks so a lone `-` list bullet or a `--` cannot masquerade as one, and
    // reject an underline over anything that is itself block syntax.
    const previous = probe[i - 1] ?? '';
    if (
      /^ {0,3}(=|-)\1{2,}\s*$/.test(line) &&
      previous.trim() !== '' &&
      !/^ {0,3}(#|>|[-*+]\s|\d+[.)]\s|\||=|-)/.test(previous)
    ) {
      found.push({ start: i - 1, contentStart: i + 1, text: previous.trim() });
    }
  }
  return found;
}

/**
 * The document's real h1/h2s: fenced blocks blanked and the frontmatter masked
 * away, because a `## Feature Map` line in either place is an example or a YAML
 * comment, not structure. ONE view for both readers of it — the splice target and
 * the near-miss scan — so a heading one of them sees can never be invisible to
 * the other (PB-006).
 */
function documentHeadings(probe: string[]): ReturnType<typeof topLevelHeadings> {
  const bodyStart = frontmatterEnd(probe);
  return topLevelHeadings(withoutFencedBlocks(probe).map((l, i) => (i < bodyStart ? '' : l)));
}

/**
 * Half-open range of a section: `contentStart` is the first body line after the
 * heading (which may span two lines when written setext), `end` the next h1/h2 or
 * EOF. Boundaries are read off fence-blanked lines — a `## ` inside a fenced
 * example is not a heading.
 */
function findSectionRange(
  probe: string[],
  headingText: string,
): { start: number; contentStart: number; end: number } | null {
  const headings = documentHeadings(probe);
  const index = headings.findIndex((h) => h.text === headingText);
  const heading = headings[index];
  if (heading === undefined) return null;
  return {
    start: heading.start,
    contentStart: heading.contentStart,
    end: headings[index + 1]?.start ?? probe.length,
  };
}

/**
 * Index the authored entries of a Feature Map region so a re-render can keep the
 * one part of it a human writes: the description. Keyed by slug first (the link
 * is the entry's stable identity) and by title as a fallback, so an entry whose
 * link is missing or malformed still matches by name instead of losing its prose.
 */
function parseFeatureMapEntries(raw: string[], probe: string[]): FeatureMapEntries {
  const masked = withoutFencedBlocks(probe);
  const blocks: Array<{ title: string; body: Array<{ raw: string; masked: string }> }> = [];
  for (let i = 0; i < raw.length; i++) {
    const heading = /^ {0,3}###\s+(.*?)\s*#*\s*$/.exec(masked[i] ?? '');
    if (heading !== null) {
      blocks.push({ title: (heading[1] ?? '').trim(), body: [] });
      continue;
    }
    blocks[blocks.length - 1]?.body.push({ raw: raw[i] ?? '', masked: masked[i] ?? '' });
  }

  const bySlug = new Map<string, FeatureMapEntry>();
  const byTitle = new Map<string, FeatureMapEntry>();
  for (const block of blocks) {
    let slug: string | null = null;
    const descriptionLines: string[] = [];
    for (const line of block.body) {
      // A link inside a fenced example is an illustration, not this entry's link.
      const link = FEATURE_LINK_RE.exec(line.masked.trim());
      if (link?.[1] !== undefined && slug === null) {
        slug = link[1];
        continue;
      }
      descriptionLines.push(line.raw);
    }
    while (descriptionLines[0]?.trim() === '') descriptionLines.shift();
    while (descriptionLines[descriptionLines.length - 1]?.trim() === '') descriptionLines.pop();
    const entry: FeatureMapEntry = { title: block.title, descriptionLines };
    if (slug !== null) bySlug.set(slug, entry);
    byTitle.set(entry.title, entry);
  }
  return { bySlug, byTitle };
}

/**
 * The section body as lines. Authored description lines are passed through
 * VERBATIM (own line ending included); generated lines take `eol`, the document's
 * prevailing ending — so a re-render never re-encodes a byte it did not author.
 */
function renderFeatureMapLines(
  features: ProductFeature[],
  existing: FeatureMapEntries,
  eol: string,
): string[] {
  if (features.length === 0) return [`${NO_FEATURES_PLACEHOLDER}${eol}`];
  const out: string[] = [];
  for (const f of features) {
    if (out.length > 0) out.push(eol);
    const previous = existing.bySlug.get(f.slug) ?? existing.byTitle.get(f.title);
    out.push(`### ${f.title}${eol}`, eol);
    if (previous !== undefined && previous.descriptionLines.length > 0) {
      out.push(...previous.descriptionLines);
    } else {
      out.push(`${TBD_DESCRIPTION}${eol}`);
    }
    out.push(`→ [features/${f.slug}.md](features/${f.slug}.md)${eol}`);
  }
  return out;
}

/**
 * Refresh `last_updated` inside the frontmatter block only — a body line that
 * happens to start with the key is prose, not metadata. An absent key is left
 * absent: prospec seeds the keys it owns at bootstrap and refreshes one of them
 * afterwards; it never adds a key back into a file the author trimmed.
 */
/**
 * Index of the first body line, or 0 when the document has no frontmatter.
 *
 * The closing delimiter is matched like a YAML reader matches it (trailing
 * whitespace, longer rules) rather than by exact string — locking onto a LATER
 * `---` in the body would mask the real headings behind it. And a leading `---`
 * is only frontmatter when the region reads as YAML: a document that merely
 * OPENS with a thematic break must not have its first sections masked away.
 */
function frontmatterEnd(probe: string[]): number {
  if (probe[0] !== '---') return 0;
  const close = probe.findIndex((l, i) => i > 0 && /^-{3,}\s*$/.test(l));
  if (close === -1) return 0;
  const region = probe.slice(1, close).filter((l) => l.trim() !== '');
  const isKey = (l: string): boolean => /^[A-Za-z_][\w.-]*\s*:/.test(l);
  // `#` opens a YAML comment, so a `## Feature Map` line inside real frontmatter
  // is legal and must NOT disqualify it. What disqualifies a region is a line YAML
  // could not hold at all — ordinary prose, which is what a thematic-break-opened
  // markdown document has where a frontmatter would have keys.
  const isYamlish = (l: string): boolean =>
    /^\s*#/.test(l) || isKey(l) || /^\s+\S/.test(l) || /^\s*-\s/.test(l);
  if (region.length === 0 || !region.every(isYamlish) || !region.some(isKey)) return 0;
  return close + 1;
}

function refreshLastUpdated(raw: string[], probe: string[], today: string, eol: string): string[] {
  const close = frontmatterEnd(probe) - 1;
  if (close < 1) return raw;
  const index = probe.findIndex((l, i) => i > 0 && i < close && /^last_updated:/.test(l));
  if (index === -1) return raw;
  const next = [...raw];
  next[index] = `last_updated: ${today}${eol}`;
  return next;
}

/** Why the product.md sync declined to write. Reported, never silent. */
export type ProductSpecDeclineReason =
  | 'missing-features-dir'
  | 'unclosed-fence'
  | 'near-miss-heading';

export interface ProductSpecDecline {
  reason: ProductSpecDeclineReason;
  /** What was found and what resolves it — printed verbatim beside the reason. */
  detail: string;
}

/**
 * Strip the decorations a human adds to a heading — a leading ordinal, a trailing
 * colon, and ONE trailing parenthesized or bracketed suffix — then case-fold.
 *
 * The colon is stripped on BOTH sides of the suffix, so the order an author
 * combines them in (`Feature Map (34):` vs `Feature Map: (34)`) carries no meaning.
 * The suffix is stripped exactly once, deliberately: repeating it until stable
 * would fold `Feature Map (draft) (2024)` in too, and that heading names something
 * the author organized, not the region this sync owns.
 */
function normalizeHeadingText(text: string): string {
  return text
    .trim()
    .replace(/^\d+[.)]\s*/, '')
    .replace(/\s*:$/, '')
    .replace(/\s*[([][^()[\]]*[)\]]$/, '')
    .replace(/\s*:$/, '')
    .trim()
    .toLowerCase();
}

const FEATURE_MAP_HEADING_NORMALIZED = normalizeHeadingText(FEATURE_MAP_HEADING);

/**
 * Would a zero-feature sync erase anything a human wrote in the Feature Map region?
 * That is the only question separating the two `missing-features-dir` states, and it
 * has to be asked of the WHOLE region: `spliceProductSpec` replaces every line
 * between the heading and the next h2, so a map written as a bullet list, a table or
 * plain prose is just as erasable as one written as `### ` entries — counting entries
 * called those files empty and sent their authors to the one destructive remedy.
 *
 * An unclosed fence makes the document unparseable, so it answers YES: of the two
 * answers, the cautious one is the safe guess.
 */
function featureMapRegionHasContent(content: string): boolean {
  const raw = content.split('\n');
  if (hasUnclosedFence(raw)) return true;
  const probe = raw.map(stripTrailingCr);
  const range = findSectionRange(probe, FEATURE_MAP_HEADING);
  // No region at all — the sync would append beside what is there, erasing nothing.
  if (range === null) return false;
  return probe
    .slice(range.contentStart, range.end)
    .some((l) => l.trim() !== '' && l.trim() !== NO_FEATURES_PLACEHOLDER);
}

/**
 * Why the sync would decline to write this product.md, or null when it may write.
 *
 * ONE decision, read by both the real run and the `--dry-run` preview — a second,
 * hand-copied guard is exactly how the two drift into disagreeing about whether a
 * file gets written (PB-006).
 *
 * The near-miss case is a refusal rather than a wider match ON PURPOSE. A heading
 * like `## Feature Map (34 active)` is almost always an author's own curated map;
 * splicing over it would delete that content outright, while appending past it —
 * the old behavior — grows a SECOND feature map that drifts from the first on every
 * run. Refusing leaves the file byte-identical and costs the author one rename.
 */
export function inspectProductSpecSync(
  content: string,
  featuresExist: boolean,
): ProductSpecDecline | null {
  if (!featuresExist) {
    // Two states share this reason and need OPPOSITE advice, so the remedy is
    // chosen from what the file actually holds: creating the directory is the whole
    // fix for a project that has no specs yet, and the one destructive move for a
    // Feature Map whose entries a zero-feature scan would erase.
    return {
      reason: 'missing-features-dir',
      detail: featureMapRegionHasContent(content)
        ? 'the feature specs directory is absent — an unreadable scan source is never the fact "this product has no features". Restore it together with its Feature Specs; creating it EMPTY is not a fix, because the next sync would then read zero features and replace the whole Feature Map region — entries, lists, tables and prose alike — with the no-features placeholder'
        : 'the feature specs directory is absent, and the Feature Map region holds nothing a sync would erase. Create `specs/features/` (or archive a change that routes a `**Feature:**`) and the next run syncs normally',
    };
  }
  const raw = content.split('\n');
  if (hasUnclosedFence(raw)) {
    return {
      reason: 'unclosed-fence',
      detail:
        'product.md has an unclosed code fence — its Feature Map is left untouched until the fence is closed',
    };
  }
  const headings = documentHeadings(raw.map(stripTrailingCr));
  if (headings.some((h) => h.text === FEATURE_MAP_HEADING)) return null;
  const nearMisses = headings.filter(
    (h) => normalizeHeadingText(h.text) === FEATURE_MAP_HEADING_NORMALIZED,
  );
  const first = nearMisses[0];
  if (first === undefined) return null;
  return {
    reason: 'near-miss-heading',
    detail: `product.md has no exact \`## ${FEATURE_MAP_HEADING}\` heading but carries a near-miss one — \`## ${first.text}\` (${nearMisses.length} found). Rename it so curated content keeps a heading of its own, or make it exactly \`## ${FEATURE_MAP_HEADING}\` to hand that section to prospec`,
  };
}

/**
 * Rewrite ONLY the `## Feature Map` section of an authored product.md. Everything
 * else — frontmatter keys the author maintains (`version`, `feature_count`, …),
 * the title, Vision, Target Users, any section they added — survives byte for
 * byte, line endings included. Missing the section entirely, it is appended rather
 * than imposed on the middle of someone's document.
 *
 * Lines are carried raw and matched through a `\r`-stripped probe, so a CRLF or
 * mixed-ending document keeps every ending it had: normalizing the whole file
 * would rewrite every line the splice is supposed to leave alone.
 */
function spliceProductSpec(content: string, features: ProductFeature[], today: string): string {
  const rawInput = content.split('\n');
  const probe = rawInput.map(stripTrailingCr);
  const eol = rawInput.filter((l) => l.endsWith('\r')).length > rawInput.length / 2 ? '\r' : '';

  // Refresh first, on the array the probe indexes. Doing it after the splice made
  // `probe` and the spliced array disagree about every index past the section.
  const raw = refreshLastUpdated(rawInput, probe, today, eol);

  const range = findSectionRange(probe, FEATURE_MAP_HEADING);
  const body = renderFeatureMapLines(
    features,
    range === null
      ? NO_ENTRIES
      : parseFeatureMapEntries(
          raw.slice(range.contentStart, range.end),
          probe.slice(range.contentStart, range.end),
        ),
    eol,
  );

  // The final element is the file terminator (`''` → one trailing newline). Using
  // `eol` there would strand a lone `\r` past the last line ending.
  const tail = range !== null && range.end < raw.length ? [eol, ...raw.slice(range.end)] : [''];
  const spliced =
    range === null
      ? [...trimTrailingBlank(raw), eol, `## ${FEATURE_MAP_HEADING}${eol}`, eol, ...body, '']
      : [...raw.slice(0, range.contentStart), eol, ...body, ...tail];
  return spliced.join('\n');
}

function trimTrailingBlank(lines: string[]): string[] {
  const head = [...lines];
  while (head.length > 0 && head[head.length - 1]?.trim() === '') head.pop();
  return head;
}

/**
 * The skeleton written when no product.md exists — every section
 * `references/product-spec-format.md` requires, with TBD placeholders for what
 * only a human can supply. A contract test pins this section set against that
 * reference, so the shipped format and the generated file cannot diverge again.
 */
export function bootstrapProductSpec(
  projectName: string,
  features: ProductFeature[],
  today: string,
): string {
  return `---
product: ${projectName}
version: TBD
last_updated: ${today}
---

# ${projectName} — TBD

## Vision

TBD — the problem this product solves and its core value proposition (1-2 paragraphs).

## Target Users

| Role | Description | Core Need |
|------|-------------|-----------|
| TBD | TBD | TBD |

## Feature Map

${renderFeatureMapLines(features, NO_ENTRIES, '').join('\n')}

## Core User Stories Summary

TBD — one line per feature summarizing its key User Story.

## Product Principles

TBD — the principles this product is designed around.

## Roadmap Overview

| Phase | Status | Key Capabilities |
|-------|--------|------------------|
| TBD | TBD | TBD |
`;
}

/**
 * Sync product.md's Feature Map from the active Feature Specs.
 *
 * product.md is an authored PRD entry with ONE machine-owned region. An existing
 * file is spliced (see `spliceProductSpec`); only a missing one is generated, and
 * then to the shipped format's full shape. The whole-file rewrite this replaced
 * silently deleted every hand-written section on every archive run.
 */
export async function generateProductSpec(
  featuresPath: string,
  productSpecPath: string,
  projectName: string,
): Promise<{ path: string; declined: ProductSpecDecline | null }> {
  // Every decline path returns the SAME shape as a write: the caller reports the
  // reason instead of discovering, three archives later, that nothing ever synced.
  // Bootstrapping is exempt from all of it — an absent file has nothing to lose.
  const exists = fs.existsSync(productSpecPath);
  if (exists) {
    const authored = await fs.promises.readFile(productSpecPath, 'utf-8');
    const declined = inspectProductSpecSync(authored, fs.existsSync(featuresPath));
    if (declined !== null) return { path: productSpecPath, declined };

    const today = new Date().toISOString().slice(0, 10);
    await ensureDir(path.dirname(productSpecPath));
    await atomicWrite(
      productSpecPath,
      spliceProductSpec(authored, await scanActiveFeatures(featuresPath), today),
    );
    return { path: productSpecPath, declined: null };
  }

  const today = new Date().toISOString().slice(0, 10);
  const content = bootstrapProductSpec(
    projectName,
    await scanActiveFeatures(featuresPath),
    today,
  );
  await ensureDir(path.dirname(productSpecPath));
  await atomicWrite(productSpecPath, content);
  return { path: productSpecPath, declined: null };
}

/**
 * Bootstrap feature-map.yaml (the feature→module index) in the same archive step as
 * generateProductSpec (co-located so they reflect one on-disk state). It scans the
 * active feature specs the way the drift collector does — archived specs excluded,
 * keyed on the filename slug — so the bootstrapped index agrees with what the checks
 * validate. Single automated writer + bootstrap-once: an existing index is never
 * overwritten, so human-curated entries (and req_prefixes) survive re-runs.
 *
 * modules[] is seeded objectively from each feature's module-prefix REQ headings —
 * a typo prefix is not a module, so it is not seeded (it surfaces in the dangling-prefix
 * lint instead), and the seed equals what the self-validating `feature-modules` drift
 * requires, keeping that fail-class check green right after bootstrap. req_prefixes are
 * never auto-filled — that would whitewash typos and spin the dangling-prefix drift; the
 * desync is carried by its warn severity, which humans then curate away.
 *
 * Returns the written path, or null when the index already exists or there is nothing
 * to scan. The same module-map (or Constitution fallback) the drift checks use is passed
 * in, so seeded modules and validated modules are drawn from one source.
 */
export async function syncFeatureMap(
  featuresPath: string,
  featureMapPath: string,
  moduleMap: ModuleMap,
): Promise<string | null> {
  if (fs.existsSync(featureMapPath)) return null; // no-clobber (bootstrap-once)
  if (!fs.existsSync(featuresPath)) return null;
  const moduleNames = new Set(moduleMap.modules.map((m) => m.name.toLowerCase()));
  // Mirror the reader/collector through the SHARED lister: archived specs excluded,
  // and an unsafe slug skipped (loadFeatureMap would drop it on read-back — never
  // emit an entry the reader discards, and never let a slug with YAML-special chars
  // into the index). product.md indexes the same directory through the same call,
  // so the two indexes cannot disagree by construction rather than by coincidence.
  const files = await listFeatureSpecFiles(featuresPath);
  const features: FeatureEntry[] = [];
  for (const file of files) {
    const content = await fs.promises.readFile(path.join(featuresPath, file), 'utf-8');
    const frontmatter = parseFeatureSpecFrontmatter(content);
    if (!frontmatter) continue;
    const modules = new Set<string>();
    for (const line of content.split('\n')) {
      const id = matchReqHeading(line)?.id;
      if (id === undefined) continue;
      const module = reqIdToPrefix(id).toLowerCase();
      if (moduleNames.has(module)) modules.add(module);
    }
    features.push({
      feature: file.slice(0, -'.md'.length),
      modules: [...modules].sort(),
      status: frontmatter.status === 'deprecated' ? 'deprecated' : 'active',
    });
  }
  const content = renderTemplate('knowledge/feature-map.yaml.hbs', { features });
  await ensureDir(path.dirname(featureMapPath));
  await atomicWrite(featureMapPath, content);
  return featureMapPath;
}

/**
 * Main archive execution flow.
 */
export async function execute(options: ArchiveOptions): Promise<ArchiveResult> {
  const cwd = options.cwd ?? process.cwd();
  const targetStatus = options.status ?? 'verified';
  const dryRun = options.dryRun ?? false;

  // 1. Scan all changes
  const allChanges = await scanChanges(cwd);

  // 2. Filter by status
  let candidates = filterByStatus(allChanges, targetStatus);

  // 3. Filter by name if specified — a named target that will not be archived
  // is reported (refused/notFound), never silently filtered out.
  const refused: RefusedChange[] = [];
  const notFound: string[] = [];
  if (options.names && options.names.length > 0) {
    for (const name of options.names) {
      const found = allChanges.find((c) => c.name === name);
      if (!found) {
        // scanChanges silently drops a directory whose metadata.yaml is missing
        // or unparseable — an existing-but-broken target is refused with the
        // real diagnosis, never misreported as nonexistent.
        const changeDir = path.join(cwd, '.prospec', 'changes', name);
        if (fs.existsSync(changeDir) && fs.statSync(changeDir).isDirectory()) {
          refused.push({
            name,
            status: 'unknown',
            reason: 'change directory exists but its metadata.yaml is missing or unparseable',
          });
        } else {
          notFound.push(name);
        }
      } else if (found.status !== targetStatus) {
        refused.push({
          name,
          status: found.status,
          reason: `status is '${found.status}' — only '${targetStatus}' changes can be archived`,
        });
      }
    }
    candidates = candidates.filter((c) => options.names!.includes(c.name));
  }

  const archived: ArchivedChange[] = [];
  const skipped: string[] = [];
  const skippedReasons: Record<string, string> = {};
  const allAffectedModules = new Set<string>();
  const specFiles: string[] = [];
  const planned: PlannedMutation[] = [];
  const pendingConvergence: PendingConvergence[] = [];
  const droppedBehavior: DroppedBehavior[] = [];
  const refusedRequirements: SpecRefusal[] = [];
  const acknowledgedDrops: DroppedBehavior[] = [];
  const staleDeclarations: StaleDeclaration[] = [];
  const missingChangeHistory: MissingChangeHistory[] = [];
  let productSpecDeclined: ProductSpecDecline | null = null;
  let specSyncWouldTouchFeaturesDir = false;

  // Resolve specsPath from config (non-fatal if config is missing)
  // Feature Specs go to specs/features/ subdirectory
  let featuresPath: string | null = null;
  let productSpecPath: string | null = null;
  let knowledgePath: string | null = null;
  let projectName = 'project';
  let configObj: ProspecConfig | null = null;
  let resolvedConfigBytes: string | null = null;
  try {
    resolvedConfigBytes = fs.readFileSync(path.join(cwd, '.prospec.yaml'), 'utf8');
    const config = await readConfig(cwd);
    configObj = config;
    const basePaths = resolveBasePaths(config, cwd);
    featuresPath = path.join(basePaths.specsPath, 'features');
    productSpecPath = path.join(basePaths.specsPath, 'product.md');
    knowledgePath = basePaths.knowledgePath;
    projectName = config.project?.name ?? 'project';
  } catch {
    // Config not available — skip Feature Spec sync
  }

  const allowIncomplete = options.allowIncomplete ?? false;

  for (const change of candidates) {
    try {
      const createdDate = String(change.metadata.created ?? change.metadata.created_at ?? 'unknown');
      let assessment: CurrentDriftAssessment;
      try { assessment = await assessCurrentDrift(cwd); }
      catch (error) {
        refused.push({ name: change.name, status: change.status, reason: `current assessment unavailable: ${error instanceof Error ? error.message : String(error)}` });
        continue;
      }
      const currentMetadata = fs.readFileSync(path.join(change.dir, 'metadata.yaml'), 'utf8');
      if (JSON.stringify(parseYaml(currentMetadata)) !== JSON.stringify(change.metadata)) {
        refused.push({ name: change.name, status: change.status, reason: 'change metadata changed since selection — re-run archive' });
        continue;
      }


      // Entry Gate B — refuse a change the drift report says is not archivable,
      // before PREFLIGHT and before anything moves. --dry-run prints the same
      // refusal (this runs regardless of dryRun).
      const relatedRaw = change.metadata.related_modules;
      const relatedModules = Array.isArray(relatedRaw)
        ? relatedRaw.filter((m): m is string => typeof m === 'string')
        : undefined;
      const knowledgeSynced = await checkKnowledgeSync(
        change.dir,
        { related_modules: relatedModules },
        cwd,
        configObj,
      );
      const gate = evaluateArchiveEntryGate(assessment.report, { knowledgeSynced, allowIncomplete });
      if (gate.blocked) {
        refused.push({ name: change.name, status: change.status, reason: gate.reasons.join('; ') });
        continue;
      }

      // PREFLIGHT — decide before anything moves (REQ-CLI-034).
      //
      // The spec-loss verdict used to be taken after `moveToArchive` had already
      // emptied `.prospec/changes/` and the run had stamped `status: archived`.
      // Holding the write then left the REQ permanently unlandable AND the record
      // claiming the change had graduated: re-running reported `notFound`, and the
      // only way back was hand-moving the bundle and editing metadata — the very
      // manual surgery this workflow forbids. So the sync is tried against the
      // SOURCE directory first, in dry-run, and a change that would lose authored
      // text is left exactly where it is, with its delta-spec still editable and
      // re-running the whole command as its recovery path.
      if (featuresPath) {
        const preflight = await syncToFeatureSpecs(change.dir, featuresPath, change.name, true);
        if (preflight.refusedRequirements.length > 0 || preflight.droppedBehavior.length > 0) {
          refusedRequirements.push(...preflight.refusedRequirements);
          droppedBehavior.push(...preflight.droppedBehavior);
          skipped.push(change.name);
          skippedReasons[change.name] =
            'spec sync would lose authored behavior — nothing was archived; fix the delta-spec and re-run';
          continue;
        }
      }

      const configPath = path.join(cwd, '.prospec.yaml');
      const currentConfigBytes = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : null;
      if (currentConfigBytes !== resolvedConfigBytes) {
        refused.push({ name: change.name, status: change.status, reason: 'configuration changed during archive — retry with stable inputs' });
        continue;
      }
      if (!assessment.recheck() || fs.readFileSync(path.join(change.dir, 'metadata.yaml'), 'utf8') !== currentMetadata) {
        refused.push({ name: change.name, status: change.status, reason: 'archive inputs changed or are unprovable after preflight — nothing was written' });
        continue;
      }

      // Move to archive. Dry-run mirrors moveToArchive: an existing archive
      // directory makes the real run throw → skipped, so predict the same.
      const archiveDir = dryRun ? archiveDirFor(cwd, change.name) : await moveToArchive(change, cwd);
      if (dryRun) {
        if (fs.existsSync(archiveDir)) {
          skipped.push(change.name);
          skippedReasons[change.name] = `archive destination already exists: ${archiveDir}`;
          continue;
        }
        planned.push({
          action: 'move',
          target: archiveDir,
          detail: `move ${change.dir} → ${archiveDir}`,
        });
      }
      // Dry-run reads artifacts from the change dir (nothing was moved)
      const artifactsDir = dryRun ? change.dir : archiveDir;

      // Generate summary
      let summaryGenerated = false;
      try {
        const { content, affectedModules } = await generateSummary(
          artifactsDir,
          change.name,
          createdDate,
        );
        const summaryPath = path.join(archiveDir, 'summary.md');
        if (dryRun) {
          planned.push({
            action: 'write',
            target: summaryPath,
            detail: 'generate summary.md scaffold',
          });
        } else {
          await atomicWrite(summaryPath, content);
        }
        summaryGenerated = true;
        affectedModules.forEach((m) => allAffectedModules.add(m));
      } catch {
        // Summary generation failure is non-fatal
      }

      // Sync requirements to Feature Specs (non-fatal)
      if (featuresPath) {
        try {
          const sync = await syncToFeatureSpecs(artifactsDir, featuresPath, change.name, dryRun);
          const syncedFiles = sync.files;
          specFiles.push(...syncedFiles);
          pendingConvergence.push(...sync.pendingConvergence);
          droppedBehavior.push(...sync.droppedBehavior);
          refusedRequirements.push(...sync.refusedRequirements);
          acknowledgedDrops.push(...sync.acknowledgedDrops);
          staleDeclarations.push(...sync.staleDeclarations);
          missingChangeHistory.push(...sync.missingChangeHistory);
          if (dryRun) {
            for (const specFile of syncedFiles) {
              planned.push({
                action: 'write',
                target: specFile,
                detail: `sync requirements into ${path.basename(specFile)}`,
              });
            }
            // Mirror the real run's ensureDir trigger (routes exist), not its
            // outcome (files written) — see readFeatureRoutes.
            if ((await readFeatureRoutes(artifactsDir)).length > 0) {
              specSyncWouldTouchFeaturesDir = true;
            }
          }
        } catch {
          // Feature Spec sync failure is non-fatal
        }
      }

      // Update metadata to archived. Deliberately NOT schema-validated here:
      // archive is the terminal station and must still absorb records the
      // earlier stations would now reject — a pre-schema change with no
      // `created_at` archives with its summary rendering "unknown" rather than
      // becoming unarchivable. The completeness floor is enforced ahead of this
      // by the archive skill's Entry Gate via the `metadata-completeness` drift
      // check, so validating again here would only convert a reportable gap
      // into a silent skip.
      const metadataPath = path.join(artifactsDir, 'metadata.yaml');
      if (fs.existsSync(metadataPath)) {
        if (dryRun) {
          planned.push({
            action: 'update',
            target: path.join(archiveDir, 'metadata.yaml'),
            detail: 'set status: archived + archived_at',
          });
        } else {
          const metaContent = await fs.promises.readFile(metadataPath, 'utf-8');
          const meta = parseYaml<Record<string, unknown>>(metaContent, metadataPath);
          meta.status = 'archived';
          meta.archived_at = new Date().toISOString().slice(0, 10);
          await atomicWrite(metadataPath, stringifyYaml(meta));
        }
      }

      archived.push({
        name: change.name,
        sourcePath: change.dir,
        archivePath: archiveDir,
        summaryGenerated,
      });
    } catch (err) {
      skipped.push(change.name);
      skippedReasons[change.name] = err instanceof Error ? err.message : String(err);
    }
  }

  // Sync product.md's Feature Map from Feature Specs (non-fatal). Dry-run cannot
  // scan the post-sync spec state (nothing was written), so it predicts the ACTION
  // from the same guards the real run uses, not the bytes. The existence probe IS
  // knowable up front, though — spec-sync never creates product.md — so the preview
  // says which of the two very different writes is coming.
  if (archived.length > 0 && featuresPath && productSpecPath) {
    if (dryRun) {
      // Run generateProductSpec's OWN decision (never a second copy of it) against
      // the state spec-sync WOULD leave on disk: an existing features dir, or the
      // one the real run creates whenever a delta-spec had routes.
      const productExists = fs.existsSync(productSpecPath);
      const featuresWillExist = fs.existsSync(featuresPath) || specSyncWouldTouchFeaturesDir;
      const declined = productExists
        ? inspectProductSpecSync(fs.readFileSync(productSpecPath, 'utf-8'), featuresWillExist)
        : null;
      if (declined !== null) {
        // A refusal is a planned NON-mutation: say it here rather than let the
        // preview imply a write that will not happen.
        planned.push({ action: 'skip', target: productSpecPath, detail: declined.detail });
      } else {
        planned.push({
          action: 'write',
          target: productSpecPath,
          detail: productExists
            ? 'splice the `## Feature Map` section of product.md — frontmatter (except last_updated) and every section outside it are preserved'
            : 'bootstrap product.md from the product-spec-format skeleton (no existing file)',
        });
      }
    } else {
      try {
        productSpecDeclined = (await generateProductSpec(featuresPath, productSpecPath, projectName))
          .declined;
      } catch {
        // Product Spec sync failure is non-fatal — including a read failure on an
        // existing file, which the splice path added as a new throw source
      }
    }
    // feature-map.yaml is the sibling feature→module index — same scan point as
    // product.md, bootstrap-once + no-clobber. Non-fatal, like product.md above.
    if (knowledgePath) {
      const featureMapPath = path.join(knowledgePath, 'feature-map.yaml');
      if (dryRun) {
        // syncFeatureMap's no-clobber probe, against the state spec-sync WOULD
        // leave on disk: an existing dir, or the ensureDir the real run performs
        // whenever a delta-spec had routes (even all-unsafe-slug ones).
        if (!fs.existsSync(featureMapPath) && (fs.existsSync(featuresPath) || specSyncWouldTouchFeaturesDir)) {
          planned.push({
            action: 'write',
            target: featureMapPath,
            detail: 'bootstrap feature-map.yaml (no-clobber)',
          });
        }
      } else {
        try {
          const moduleMap = loadModuleMap(knowledgePath, cwd) ?? constitutionFallbackModuleMap();
          await syncFeatureMap(featuresPath, featureMapPath, moduleMap);
        } catch {
          // feature-map regeneration failure is non-fatal
        }
      }
    }
  }

  return {
    archived,
    skipped,
    skippedReasons,
    affectedModules: [...allAffectedModules],
    specFiles,
    dryRun,
    planned,
    refused,
    notFound,
    pendingConvergence,
    droppedBehavior,
    refusedRequirements,
    acknowledgedDrops,
    staleDeclarations,
    missingChangeHistory,
    productSpecDeclined,
  };
}

// --- Internal helpers ---

function extractUserStory(proposalContent: string): string {
  const lines = proposalContent.split('\n');
  let capturing = false;
  const storyLines: string[] = [];

  for (const line of lines) {
    if (/^##\s+User Story/i.test(line)) {
      capturing = true;
      continue;
    }
    if (capturing && /^##\s/.test(line)) {
      break;
    }
    if (capturing) {
      storyLines.push(line);
    }
  }

  const story = storyLines.join('\n').trim();
  return story || 'N/A';
}

function extractRequirements(deltaContent: string): Array<{ id: string; status: string; description: string }> {
  const reqs: Array<{ id: string; status: string; description: string }> = [];
  const lines = deltaContent.split('\n');

  let currentSection = '';
  for (const line of lines) {
    if (/^##\s+(ADDED|MODIFIED|REMOVED)/i.test(line)) {
      currentSection = line.replace(/^##\s+/, '').trim().toUpperCase();
    }
    // Match REQ IDs in h3 headers: ### REQ-XXX-NNN: description
    const reqMatch = line.match(/^###\s+(REQ-[\w-]+):\s*(.*)/);
    if (reqMatch) {
      reqs.push({
        id: reqMatch[1]!,
        status: currentSection || 'UNKNOWN',
        description: reqMatch[2]!.trim(),
      });
    }
  }

  return reqs;
}

function extractAffectedModules(deltaContent: string): Array<{ name: string; impact: string; description: string }> {
  const modules: Array<{ name: string; impact: string; description: string }> = [];

  // Extract module names from REQ IDs (e.g., REQ-TYPES-010 → types)
  const moduleSet = new Map<string, string>();
  const lines = deltaContent.split('\n');

  for (const line of lines) {
    // lazy module group so multi-segment ids (REQ-API-MIDDLEWARE-001) keep the
    // full module name; [\w]+ stopped at the first '-' and dropped the REQ,
    // diverging from extractRequirements' looser REQ-[\w-]+.
    const reqMatch = line.match(/^###\s+REQ-([\w-]+?)-\d+:\s*(.*)/);
    if (reqMatch) {
      const moduleName = reqMatch[1]!.toLowerCase();
      if (!moduleSet.has(moduleName)) {
        moduleSet.set(moduleName, reqMatch[2]!.trim());
      }
    }
  }

  for (const [name, description] of moduleSet) {
    modules.push({ name, impact: 'Modified', description });
  }

  return modules;
}

function calculateTaskStats(tasksContent: string): string {
  // Completion counts code tasks only; [M]/[V] kind-marked tasks are reported apart.
  // The frozen kind grammar has exactly one executable copy: lib/task-markers.
  let completed = 0;
  let total = 0;
  let kindDone = 0;
  let kindTotal = 0;
  for (const line of tasksContent.split('\n')) {
    const task = parseTaskLine(line);
    if (task === null) continue;
    if (task.kind !== 'code') {
      kindTotal += 1;
      if (task.checked) kindDone += 1;
    } else {
      total += 1;
      if (task.checked) completed += 1;
    }
  }

  if (total === 0 && kindTotal === 0) return 'No tasks found';
  if (total === 0) return `0/0 code, ${kindDone}/${kindTotal} [M]/[V] (not counted)`;

  const pct = Math.round((completed / total) * 100);
  const kindSuffix = kindTotal > 0 ? `, ${kindDone}/${kindTotal} [M]/[V] (not counted)` : '';
  return `${completed}/${total} (${pct}%)${kindSuffix}`;
}

/**
 * Extract Feature routing info from delta-spec.md.
 * Parses **Feature** and **Story** fields under each REQ header.
 */
function extractFeatureRoutes(deltaContent: string): FeatureRoute[] {
  const routes: FeatureRoute[] = [];
  for (const entry of iterateDeltaEntries(deltaContent)) {
    if (!entry.reqId || !entry.feature) continue;
    const spec = extractDeltaBlock(entry.body, 'Spec');
    const descriptionBody = buildDescriptionBody(entry.body);
    const declared = declaredDrops(entry.body);
    // The truncation that matters is the one on whichever block actually lands.
    // For MODIFIED that is always the Spec block; for ADDED without one, the
    // Description/Acceptance-Criteria fallback IS the landing body, so a foreign
    // label cutting THAT short loses trust-zone text just the same. It counts ONLY
    // where the fallback can land — an ADDED entry with no Spec block; for MODIFIED
    // those blocks are change narrative that never reaches the trust zone, so
    // refusing on them would deny the REQ the preserve-body + pendingConvergence
    // path REQ-SERVICES-072 guarantees.
    const truncation =
      spec.truncation ??
      (entry.section === 'ADDED' && spec.content === ''
        ? (extractDeltaBlock(entry.body, 'Description').truncation ??
          extractDeltaBlock(entry.body, 'Acceptance Criteria').truncation)
        : null);
    routes.push({
      reqId: entry.reqId,
      feature: entry.feature,
      story: entry.story,
      status: entry.section as FeatureRoute['status'],
      description: entry.description,
      ...(spec.content === '' ? {} : { specBody: spec.content }),
      ...(descriptionBody === '' ? {} : { descriptionBody }),
      ...(truncation === null ? {} : { truncation }),
      ...(declared.length === 0 ? {} : { declaredDrops: declared }),
    });
  }
  return routes;
}

/**
 * The ADDED fallback body: `**Description:**` prose followed by
 * `**Acceptance Criteria:**` rendered as bullets (a numbered delta-spec list
 * becomes the `-` bullets Feature Specs use). Empty when neither block exists.
 */
function buildDescriptionBody(bodyLines: string[]): string {
  const description = extractDeltaBlock(bodyLines, 'Description').content;
  const criteria = extractDeltaBlock(bodyLines, 'Acceptance Criteria').content;
  const bullets = criteria
    .split('\n')
    .map((l) => l.replace(/^\s*\d+\.\s+/, '- '))
    .filter((l) => l.trim() !== '')
    .join('\n');

  return [description, bullets].filter((part) => part !== '').join('\n');
}

const NO_SPEC_BLOCK_REASON =
  'delta-spec carries no **Spec:** block — the existing body was preserved, converge it by hand';
const NO_BODY_REASON =
  'delta-spec carries neither a **Spec:** block nor Description/Acceptance Criteria — landed as a title only';
const STALE_DEPRECATED_REASON =
  'REQ deprecated, but its active section still carries the pre-removal body — strike or delete it by hand';

/**
 * The body this route lands in the Feature Spec; `''` means "nothing to land".
 *
 * The Description/Acceptance-Criteria fallback is ADDED-only ON PURPOSE: those
 * blocks are change narrative, and letting them land for MODIFIED would overwrite
 * an authored behavior statement with planning prose — the very loss this
 * contract forbids. For MODIFIED, only a `**Spec:**` block replaces a body.
 */
function landingBody(route: FeatureRoute): string {
  const fallback = route.status === 'ADDED' ? route.descriptionBody : undefined;
  return (route.specBody ?? fallback ?? '').trim();
}

function bodyless(route: FeatureRoute): boolean {
  return route.status !== 'REMOVED' && landingBody(route) === '';
}

function pendingFor(route: FeatureRoute, reason = NO_BODY_REASON): PendingConvergence {
  return { feature: route.feature, reqId: route.reqId, reason };
}

/**
 * Behavior the replacement body leaves behind — a SET difference, never a count.
 * The failure this exists to catch replaced three authored bullets with three
 * unrelated ones, so any count-based check would have passed it.
 */
function droppedFor(
  route: FeatureRoute,
  existingBody: string,
  landing: string,
): DropAssessment {
  const sets = assessDrops(existingBody, landing, route.declaredDrops ?? []);
  const behavior = (bullets: Bullet[]): DroppedBehavior | undefined =>
    bullets.length === 0
      ? undefined
      : { feature: route.feature, reqId: route.reqId, bullets: bullets.map((b) => b.text) };
  return {
    undeclared: behavior(sets.undeclared),
    acknowledged: behavior(sets.acknowledged),
    stale:
      sets.stale.length === 0
        ? undefined
        : { feature: route.feature, reqId: route.reqId, bullets: sets.stale.map((b) => b.text) },
  };
}

/** The three-way split of one REQ's drop diff against its declaration. */
interface DropAssessment {
  undeclared?: DroppedBehavior;
  acknowledged?: DroppedBehavior;
  stale?: StaleDeclaration;
}

/** The heading level a REQ id already occupies in this spec, or null when absent. */
function existingReqLevel(content: string, reqId: string): number | null {
  for (const line of content.split('\n')) {
    const heading = matchReqHeading(line);
    if (heading?.id === reqId) return heading.level;
  }
  return null;
}

/**
 * Merge a requirement into an existing Feature Spec (ADDED or MODIFIED).
 *
 * NEVER blanks an authored body. A `**Spec:**` block (or, for ADDED, the
 * Description + Acceptance Criteria fallback) is the ONLY thing that replaces
 * one; with nothing to land, a MODIFIED REQ keeps its existing body and only its
 * title line is refreshed — the REQ is reported back as pending convergence
 * instead of silently losing its WHEN/THEN text.
 *
 * The REQ is found by ID at whatever heading level the spec already uses, and
 * the replacement keeps that level. Matching the literal `#### {id}:` instead
 * sent every non-h4 spec down the ADDED path, which appended a SECOND section
 * with the same id beside the original — two contradicting bodies for one REQ,
 * reported by neither worklist (issue #138).
 */
function mergeRequirementInPlace(
  content: string,
  route: FeatureRoute,
): {
  content: string;
  pending?: PendingConvergence;
  drops?: DropAssessment;
  refused?: SpecRefusal;
} {
  // A truncated landing block is refused BEFORE anything is computed against it
  // (REQ-SERVICES-081). Not even the title line is refreshed: the body carried
  // here is a fragment, so every downstream comparison — the drop diff above all —
  // would be measured against text the author never finished. The content is
  // returned untouched, which is what makes this a refusal rather than a warning.
  if (route.truncation !== undefined) {
    return {
      content,
      refused: { kind: 'truncation', feature: route.feature, reqId: route.reqId, ...route.truncation },
    };
  }
  const body = landingBody(route);
  const specIndex = indexSpec(content, { includeStruck: true });
  const reqs = specIndex.requirements.filter((r) => r.id === route.reqId);

  if (route.status === 'MODIFIED' && reqs.length > 0) {
    const firstReq = reqs[0]!;
    const titleLine = `${'#'.repeat(firstReq.level)} ${route.reqId}: ${route.description}`;
    
    let merged: string;
    let superseded: string[] = [];
    
    if (body !== '') {
      const pre = content.slice(0, firstReq.start);
      const post = content.slice(firstReq.end);
      
      const oldBlock = content.slice(firstReq.start, firstReq.end);
      const oldLines = stripTrailingCr(oldBlock).split('\n');
      superseded = oldLines.slice(1);
      
      merged = pre + titleLine + '\n' + body + '\n' + post;
    } else {
      const oldBlock = content.slice(firstReq.start, firstReq.end);
      const oldLines = stripTrailingCr(oldBlock).split('\n');
      const keptBody = oldLines.slice(1).join('\n');
      
      const pre = content.slice(0, firstReq.start);
      const post = content.slice(firstReq.end);
      
      merged = pre + titleLine + (oldLines.length > 1 ? '\n' + keptBody : '') + post;
    }
    
    const duplicates = reqs.length - 1;
    const duplicatePending =
      duplicates > 0
        ? pendingFor(
            route,
            `${duplicates} further section(s) carry this REQ id — pre-existing duplication left untouched; converge them by hand`,
          )
        : undefined;

    if (body === '') {
      const reason =
        duplicatePending === undefined
          ? NO_SPEC_BLOCK_REASON
          : `${NO_SPEC_BLOCK_REASON}; additionally, ${duplicatePending.reason}`;
      return { content: merged, pending: pendingFor(route, reason) };
    }
    return {
      content: merged,
      ...(duplicatePending === undefined ? {} : { pending: duplicatePending }),
      drops: droppedFor(route, superseded.join('\n'), body),
    };
  }

  // ADDED (or a MODIFIED id this spec does not carry yet): append before Edge
  // Cases or at the end. New REQs land at the format-mandated h4 even in a spec
  // that uses another level — the shared matcher counts the mix correctly.
  const titleLine = `#### ${route.reqId}: ${route.description}`;
  // Anchored to the HEADING, at line start — not to the bare string. A spec
  // routinely quotes its own structure, so `## Edge Cases` also occurs inside
  // prose and inline code spans; a first-substring match lands there instead
  // and splices the new REQ into the middle of another requirement's bullet,
  // truncating it. That corruption is silent — both worklists stay empty and
  // the Change History row is still written — and it reaches the trust zone.
  const insertBefore = /^## Edge Cases[ \t]*$/m;
  const newReq = body === ''
    ? `\n${titleLine}\n\n---\n`
    : `\n${titleLine}\n${body}\n\n---\n`;
  const pending = body === '' ? pendingFor(route) : undefined;

  if (insertBefore.test(content)) {
    // Function replacer: the title and body are untrusted text and may contain
    // `$&`/`$1`/`$$` etc., which a string replacement would expand as special
    // patterns and corrupt the spec. A function returns the literal verbatim.
    return { content: content.replace(insertBefore, (heading) => newReq + '\n' + heading), pending };
  }

  // Fallback: append at end
  return { content: content + newReq, pending };
}

/**
 * Move a requirement to the Deprecated section (REMOVED).
 */
function moveReqToDeprecated(content: string, route: FeatureRoute): string {
  const today = new Date().toISOString().slice(0, 10);
  const deprecatedEntry = `\n- **${route.reqId}**: ${route.description} _(removed ${today})_`;

  // Both anchors below match the HEADING at line start, never the bare string:
  // a spec that quotes its own structure carries `## Deprecated Requirements`
  // in prose and inline code (drift-detection.md does, at :621), and a
  // first-substring match splices the retired entry into that bullet instead —
  // the same silent corruption the ADDED insertion path guards against.
  // Function replacers keep the untrusted route.description literal — see
  // mergeRequirementInPlace.
  const emptySection = /^## Deprecated Requirements\r?\n\r?\n_\(None\)_/m;
  if (emptySection.test(content)) {
    return content.replace(emptySection, () => `## Deprecated Requirements\n${deprecatedEntry}`);
  }

  // Append to existing Deprecated section
  const deprecatedHeading = /^## Deprecated Requirements[ \t]*$/m;
  if (deprecatedHeading.test(content)) {
    return content.replace(deprecatedHeading, (heading) => `${heading}${deprecatedEntry}`);
  }

  // No Deprecated section — append at end
  return content + `\n## Deprecated Requirements\n${deprecatedEntry}\n`;
}

/**
 * Update Feature Spec frontmatter counters.
 */
function updateFeatureSpecFrontmatter(content: string, today: string): string {
  // Update last_updated
  return content.replace(
    /^last_updated:\s*.+$/m,
    `last_updated: ${today}`,
  );
}

/**
 * Append entries to the Change History table.
 */
function appendToChangeHistory(
  content: string,
  routes: FeatureRoute[],
  today: string,
  changeName: string,
): string {
  const refsStr = routes.map((r) => r.reqId).join(', ');
  const impact = routes.map((r) => `${r.status} ${r.reqId}`).join('; ');
  // The name comes from a directory entry, so it is the one cell in this row not
  // generated by us: a `|` or a newline in it would shift every column after it.
  // Escaping goes through the pipe-table engine's own helper, never a local copy.
  const historyRow = `| ${today} | ${escapeTableCell(changeName)} | ${impact} | ${refsStr} |`;

  // Insert before the last line of the Change History table (or at end of section)
  if (content.includes('## Change History')) {
    const lines = content.split('\n');
    const result: string[] = [];
    let inserted = false;

    for (let i = 0; i < lines.length; i++) {
      result.push(lines[i]!);
      // Insert after the table header separator row (|------|...)
      if (
        !inserted
        && lines[i]!.includes('|------')
        && i > 0
        && lines[i - 1]!.includes('| Date')
      ) {
        result.push(historyRow);
        inserted = true;
      }
    }

    if (!inserted) {
      // Fallback: append after Change History heading
      return content + '\n' + historyRow;
    }

    return result.join('\n');
  }

  return content;
}

/**
 * Create a new Feature Spec file from scratch.
 *
 * The REQs are grouped under their `**Story:**` heading rather than listed flat,
 * and the frontmatter counters are then DERIVED from the rendered body by
 * `readSpecCounters` — the same function `archive finalize` and the
 * `spec-counters` check read with. Declaring `story_count` from the route list
 * while the body carried no story heading made every freshly created spec start
 * life with a counter its own body could not confirm: `finalize` refuses to zero
 * such a counter, so the file would have been born permanently unreconcilable
 * and permanently warned about.
 */
function createNewFeatureSpec(
  feature: string,
  routes: FeatureRoute[],
  today: string,
  changeName: string,
): string {
  const reqSection = (r: FeatureRoute): string => {
    const body = landingBody(r);
    const head = `#### ${r.reqId}: ${r.description}`;
    return body === '' ? `${head}\n\n---` : `${head}\n${body}\n\n---`;
  };

  const active = routes.filter((r) => r.status !== 'REMOVED');
  const stories = [...new Set(routes.map((r) => r.story).filter(Boolean))];
  const grouped = stories.map((story) => {
    const reqs = active.filter((r) => r.story === story).map(reqSection);
    return [`### ${storyHeadingText(story)}`, ...reqs].join('\n\n');
  });
  // Storyless REQs come FIRST, directly under the section heading. Appended after
  // the groups they read as belonging to the last story — a false attribution
  // written into the trust zone, and one no counter could reveal.
  const ungrouped = active.filter((r) => r.story === '').map(reqSection);
  const reqSections = [...ungrouped, ...grouped].join('\n\n');

  const deprecatedSection = routes
    .filter((r) => r.status === 'REMOVED')
    .map((r) => `- **${r.reqId}**: ${r.description} _(removed ${today})_`)
    .join('\n');

  const body = specBodyTemplate(
    feature,
    reqSections,
    deprecatedSection,
    today,
    changeName,
    routes.map((r) => r.reqId).join(', '),
  );
  const counters = readSpecCounters(`---\nfeature: ${feature}\n---${body}`);

  return `---
feature: ${feature}
status: active
last_updated: ${today}
story_count: ${counters?.actual.story_count ?? 0}
req_count: ${counters?.actual.req_count ?? 0}
---
${body}`;
}

/**
 * A `**Story:**` label as heading text. The label is delta-spec prose, so a label
 * that happens to read as a REQ heading would DEFINE that REQ in the trust zone —
 * `collectReqDefinitions` would then resolve references to an id nobody wrote a
 * requirement for. Such a label is neutralised into a code span, which keeps the
 * heading readable while the id stops parsing as a definition.
 */
function storyHeadingText(story: string): string {
  return matchReqHeading(`### ${story}`, { includeStruck: true }) === null ? story : `\`${story}\``;
}

/**
 * Everything after a new Feature Spec's frontmatter. Split out so the counters
 * above are derived from the SAME text that ships — a second copy of this
 * template would let the declared counts describe a body nobody rendered.
 */
function specBodyTemplate(
  feature: string,
  reqSections: string,
  deprecatedSection: string,
  today: string,
  changeName: string,
  reqIds: string,
): string {
  return `
# ${feature}

## Who & Why

**Who it serves**: TBD

**Problem it solves**: TBD

**Why it matters**: TBD

## User Stories & Behavior Specifications

${reqSections}

## Edge Cases

_(TBD)_

## Success Criteria

_(TBD)_

## Maintenance Rules

1. **Replace-in-Place**: MODIFIED User Stories and REQs directly replace existing versions
2. **Functional Grouping**: New requirements insert under the corresponding User Story
3. **No Inline Provenance**: Historical attribution only in Change History table
4. **Deprecation over Deletion**: Removed requirements move to Deprecated section

## Deprecated Requirements

${deprecatedSection || '_(None)_'}

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|-------------|
| ${today} | ${escapeTableCell(changeName)} | Created from archive | ${reqIds} |
`;
}

/**
 * Parse Feature Spec frontmatter fields.
 */
function parseFeatureSpecFrontmatter(
  content: string,
): { feature: string; status: string } | null {
  // Normalize CRLF first: a Windows checkout's spec would otherwise fail to parse
  // and be counted as "not a feature spec" by every caller of this function.
  const fmMatch = content.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;

  const fm = fmMatch[1]!;
  // Horizontal whitespace only: `\s*` spans the newline, so a valueless `feature:`
  // silently captured the NEXT key's line and rendered it as the feature's name.
  const featureMatch = fm.match(/^feature:[ \t]*(.*)$/m);
  const statusMatch = fm.match(/^status:[ \t]*(.+)$/m);

  if (!featureMatch) return null;

  return {
    feature: featureMatch[1]!.trim(),
    status: statusMatch?.[1]?.trim() ?? 'active',
  };
}

// --- Finalize (`prospec archive finalize <name>`, issue #107) ---

export interface ArchiveFinalizeOptions {
  name: string;
  cwd?: string;
  dryRun?: boolean;
}

export interface CounterReconciliation {
  file: string;
  from: { story_count: number | null; req_count: number | null };
  to: { story_count: number; req_count: number };
}

/** A reconciliation the recount refused — the file was left byte-identical. */
export interface RefusedReconciliation extends CounterReconciliation {
  reason: string;
}

export interface ArchiveFinalizeResult {
  changeName: string;
  archiveDir: string;
  /** The committed spec-history copy destination. */
  historyPath: string;
  /** Feature specs whose frontmatter counters were corrected. */
  reconciled: CounterReconciliation[];
  /** Feature specs left untouched because the recount refused to zero a counter. */
  refusedReconciliations: RefusedReconciliation[];
  planned: PlannedMutation[];
  dryRun: boolean;
}

/**
 * The POST-JUDGMENT archive write points. `prospec archive` runs BEFORE the
 * skill's judgment work (the Phase 2 summary overwrite and the Phase 3.5 REQ
 * graduation); these two mutations must run AFTER it, or the history copy
 * captures the scaffold and the counters count the pre-graduation text:
 *
 * 1. copy the (overwritten) summary.md to `specs/_archived-history/{dir}.md`
 *    — the committed audit trail (.prospec/archive/ is gitignored);
 * 2. recount every feature spec's frontmatter `story_count` / `req_count` from
 *    its FINAL body via `readSpecCounters` — REQ headings at ANY level outside
 *    Deprecated, stories at `## US-` and `### US-` — EXCEPT a spec whose body
 *    would zero a counter it declares above zero: that one is left untouched and
 *    reported in `refusedReconciliations`.
 *
 * Refuses the whole run while summary.md still lacks the `## Review & Verify`
 * section — the deterministic marker that the scaffold has not been overwritten
 * yet. That refusal and a refused reconciliation are different things: re-running
 * clears the first, never the second.
 */
export async function executeFinalize(
  options: ArchiveFinalizeOptions,
): Promise<ArchiveFinalizeResult> {
  const cwd = options.cwd ?? process.cwd();
  const dryRun = options.dryRun ?? false;

  const archiveRoot = path.join(cwd, '.prospec', 'archive');
  const archiveDirName = findArchiveDirName(archiveRoot, options.name);
  if (!archiveDirName) {
    throw new PrerequisiteError(
      `No archived bundle found for '${options.name}' under .prospec/archive/`,
      'Run `prospec archive <name>` first — finalize is the post-judgment step',
    );
  }
  const archiveDir = path.join(archiveRoot, archiveDirName);
  const summaryPath = path.join(archiveDir, 'summary.md');
  if (!fs.existsSync(summaryPath)) {
    throw new PrerequisiteError(
      `summary.md missing in ${archiveDirName}`,
      'Re-run `prospec archive <name>` to scaffold it, then overwrite it with the Phase 2 summary',
    );
  }
  const summaryContent = fs.readFileSync(summaryPath, 'utf-8');
  if (!/^##\s+Review\s*&\s*Verify/m.test(summaryContent)) {
    throw new PrerequisiteError(
      `summary.md in ${archiveDirName} has no \`## Review & Verify\` section — it still looks like the scaffold`,
      'Finalize runs AFTER the summary is overwritten with the Review & Verify record and REQ graduation is done',
    );
  }

  const config = await readConfig(cwd);
  const { specsPath } = resolveBasePaths(config, cwd);
  const historyDir = path.join(specsPath, '_archived-history');
  const historyPath = path.join(historyDir, `${archiveDirName}.md`);
  const relHistoryPath = path.relative(cwd, historyPath).replace(/\\/g, '/');

  const planned: PlannedMutation[] = [
    {
      action: 'write',
      target: relHistoryPath,
      detail: 'copy the finalized summary.md into the committed spec history',
    },
  ];

  // Counter reconciliation across every active feature spec — recounting from
  // the body is idempotent and also corrects pre-existing drift (PB-004).
  const featuresDir = path.join(specsPath, 'features');
  const reconciled: CounterReconciliation[] = [];
  const refusedReconciliations: RefusedReconciliation[] = [];
  const rewrites: Array<{ absolute: string; content: string }> = [];
  if (fs.existsSync(featuresDir)) {
    for (const entry of fs.readdirSync(featuresDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const feature = entry.name.replace(/\.md$/, '');
      const absolute = path.join(featuresDir, entry.name);
      const loaded = loadFeatureSpecContent(featuresDir, feature);
      if (!loaded) continue;
      const recount = recountFeatureSpecCounters(loaded.specContent);
      if (!recount) continue;
      const relFile = path.relative(cwd, absolute).replace(/\\/g, '/');
      if (recount.refusal !== undefined) {
        // Reported, never written — and reported identically under --dry-run,
        // since the refusal is a fact about the file, not about the run mode.
        refusedReconciliations.push({
          file: relFile,
          from: recount.from,
          to: recount.to,
          reason: recount.refusal,
        });
        continue;
      }
      if (!recount.changed) continue;
      reconciled.push({ file: relFile, from: recount.from, to: recount.to });
      planned.push({
        action: 'update',
        target: relFile,
        detail: `reconcile frontmatter counters (story_count ${recount.from.story_count ?? '—'} → ${recount.to.story_count}, req_count ${recount.from.req_count ?? '—'} → ${recount.to.req_count})`,
      });
      rewrites.push({ absolute, content: recount.content });
    }
  }

  if (!dryRun) {
    await ensureDir(historyDir);
    await atomicWrite(historyPath, summaryContent);
    for (const rewrite of rewrites) {
      await atomicWrite(rewrite.absolute, rewrite.content);
    }
  }

  return {
    changeName: options.name,
    archiveDir: path.relative(cwd, archiveDir).replace(/\\/g, '/'),
    historyPath: relHistoryPath,
    reconciled,
    refusedReconciliations,
    planned,
    dryRun,
  };
}

/** Latest `{YYYY-MM-DD}-{name}` directory for the change (null when none). */
function findArchiveDirName(archiveRoot: string, name: string): string | null {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(archiveRoot, { withFileTypes: true });
  } catch {
    return null;
  }
  const matches = entries
    .filter((e) => e.isDirectory() && new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${escapeRegExp(name)}$`).test(e.name))
    .map((e) => e.name)
    .sort();
  return matches.at(-1) ?? null;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Recount `story_count` / `req_count` from the spec body (via `readSpecCounters`
 * — the same derivation the `spec-counters` drift check reads with) and rewrite
 * the frontmatter values. Returns null when the file has no frontmatter.
 *
 * Refuses before writing when a counter the frontmatter declares above zero
 * would be rewritten to zero: the file comes back byte-identical with a
 * `refusal` reason instead. Zero REQs in a spec that claims ten is a parse gap
 * far more often than a fact, and the previous unconditional write put that
 * wrong number into the trust zone silently — where nothing read it again.
 */
export function recountFeatureSpecCounters(specContent: SpecContent): {
  content: string;
  changed: boolean;
  from: { story_count: number | null; req_count: number | null };
  to: { story_count: number; req_count: number };
  /** Set when the rewrite was refused; `content` is then the input, unchanged. */
  refusal?: string;
} | null {
  const counters = readSpecCounters(specContent);
  if (counters === null) return null;

  const { declared: from, actual: to, frontmatter, frontmatterLength, eol } = counters;
  const content = typeof specContent === 'string' ? specContent : specContent.main;

  const zeroed = (['story_count', 'req_count'] as const).filter(
    (field) => (from[field] ?? 0) > 0 && to[field] === 0,
  );
  if (zeroed.length > 0) {
    return {
      content,
      changed: false,
      from,
      to,
      refusal:
        `${zeroed.join(' and ')} would be rewritten to zero from a declared ` +
        `${zeroed.map((f) => from[f]).join('/')} — refusing to write a count the body cannot confirm`,
    };
  }

  // Rewrites keep the file's own line ending: the counter lines carry a trailing
  // `\r` on a CRLF checkout, and the fences are rebuilt with `eol` — a hardcoded
  // `\n` here turned a CRLF spec into a mixed-ending one the moment tolerating
  // CRLF made such a file reachable at all.
  const setCounter = (text: string, field: 'story_count' | 'req_count', value: number): string =>
    text.replace(
      new RegExp(String.raw`^(${field}:)[ \t]*\d+([ \t]*\r?)$`, 'm'),
      (_m, label: string, trailing: string) => `${label} ${value}${trailing}`,
    );

  let newFrontmatter = frontmatter;
  newFrontmatter = from.story_count !== null
    ? setCounter(newFrontmatter, 'story_count', to.story_count)
    : `${newFrontmatter}${eol}story_count: ${to.story_count}`;
  newFrontmatter = from.req_count !== null
    ? setCounter(newFrontmatter, 'req_count', to.req_count)
    : `${newFrontmatter}${eol}req_count: ${to.req_count}`;

  return {
    content: `---${eol}${newFrontmatter}${eol}---${content.slice(frontmatterLength)}`,
    changed: from.story_count !== to.story_count || from.req_count !== to.req_count,
    from,
    to,
  };
}
