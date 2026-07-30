import * as fs from 'node:fs';
import * as path from 'node:path';
import { ensureDir, atomicWrite } from '../lib/fs-utils.js';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { parseYaml, stringifyYaml } from '../lib/yaml-utils.js';
import { parseTaskLine } from '../lib/task-markers.js';
import { isArchivedSpec, isSafeResourceName, loadModuleMap } from '../lib/knowledge-reader.js';
import { ACTIVE_REQ_HEADING, reqIdToPrefix } from '../lib/drift-sources.js';
import { constitutionFallbackModuleMap } from '../lib/drift-checker.js';
import { renderTemplate } from '../lib/template.js';
import type { ChangeStatus } from '../types/change.js';
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
}

export interface PlannedMutation {
  action: 'move' | 'write' | 'update';
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
}

/** A REQ whose Feature-Spec body the sync did NOT replace — a human must converge it. */
export interface PendingConvergence {
  feature: string;
  reqId: string;
  reason: string;
}

export interface SpecSyncResult {
  /** Feature Spec files created or updated. */
  files: string[];
  /** REQs left for the graduation phase; populated under dry-run too. */
  pendingConvergence: PendingConvergence[];
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

  // Read metadata for quality grade
  const metadataPath = path.join(archiveDir, 'metadata.yaml');
  let qualityGrade = 'Unverified';
  if (fs.existsSync(metadataPath)) {
    const metaContent = await fs.promises.readFile(metadataPath, 'utf-8');
    const meta = parseYaml<Record<string, unknown>>(metaContent, metadataPath);
    if (meta.quality_grade) {
      qualityGrade = String(meta.quality_grade);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const content = `# ${changeName} — Archive Summary

- **Archived**: ${today}
- **Original Created**: ${createdDate}
- **Quality Grade**: ${qualityGrade}

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

export async function syncToFeatureSpecs(
  archiveDir: string,
  featuresPath: string,
  dryRun = false,
): Promise<SpecSyncResult> {
  const routes = await readFeatureRoutes(archiveDir);
  if (routes.length === 0) return { files: [], pendingConvergence: [] };

  if (!dryRun) await ensureDir(featuresPath);

  // Group routes by feature slug
  const byFeature = new Map<string, FeatureRoute[]>();
  for (const route of routes) {
    const existing = byFeature.get(route.feature) ?? [];
    existing.push(route);
    byFeature.set(route.feature, existing);
  }

  const updatedFiles: string[] = [];
  const pendingConvergence: PendingConvergence[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const [feature, featureRoutes] of byFeature) {
    // The feature slug becomes a filename — a crafted `**Feature:** ../../x`
    // must never escape featuresPath. Same name guard the spec read surfaces use.
    if (!isSafeResourceName(feature)) continue;
    const specFile = path.join(featuresPath, `${feature}.md`);
    const fileExists = fs.existsSync(specFile);

    if (fileExists) {
      let content = await fs.promises.readFile(specFile, 'utf-8');

      for (const route of featureRoutes) {
        if (route.status === 'REMOVED') {
          content = moveReqToDeprecated(content, route);
          // Deprecation only APPENDS a bullet — the REQ's active section (and its
          // pre-removal body, now describing behavior that no longer exists) stays
          // put. Report it, or the graduation gate passes over dead spec text.
          if (content.includes(`#### ${route.reqId}:`)) {
            pendingConvergence.push(pendingFor(route, STALE_DEPRECATED_REASON));
          }
        } else {
          const merged = mergeRequirementInPlace(content, route);
          content = merged.content;
          if (merged.pending) pendingConvergence.push(merged.pending);
        }
      }

      content = updateFeatureSpecFrontmatter(content, today);
      content = appendToChangeHistory(content, featureRoutes, today);
      if (!dryRun) await atomicWrite(specFile, content);
    } else {
      const content = createNewFeatureSpec(feature, featureRoutes, today);
      pendingConvergence.push(...featureRoutes.filter(bodyless).map((r) => pendingFor(r)));
      if (!dryRun) await atomicWrite(specFile, content);
    }

    updatedFiles.push(specFile);
  }

  return { files: updatedFiles, pendingConvergence };
}

/**
 * Generate product.md by scanning all Feature Specs' frontmatter.
 * Synthesizes a product overview with feature map and P0 stories summary.
 */
export async function generateProductSpec(
  featuresPath: string,
  productSpecPath: string,
  projectName: string,
): Promise<string> {
  const features: Array<{ slug: string; title: string; status: string }> = [];

  if (fs.existsSync(featuresPath)) {
    const files = await fs.promises.readdir(featuresPath);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const filePath = path.join(featuresPath, file);
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const frontmatter = parseFeatureSpecFrontmatter(content);
      if (frontmatter) {
        features.push({
          slug: file.replace(/\.md$/, ''),
          title: frontmatter.feature,
          status: frontmatter.status,
        });
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const featureMap = features
    .filter((f) => f.status === 'active')
    .map((f) => `### ${f.title}\n→ [features/${f.slug}.md](features/${f.slug}.md)`)
    .join('\n\n');

  const content = `---
product: ${projectName}
last_updated: ${today}
---

# ${projectName}

## Feature Map

${featureMap || '_(No active features yet)_'}
`;

  await ensureDir(path.dirname(productSpecPath));
  await atomicWrite(productSpecPath, content);
  return productSpecPath;
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
  // Mirror the reader/collector: archived specs excluded, and an unsafe slug is
  // skipped (loadFeatureMap would drop it on read-back — never emit an entry the
  // reader discards, and never let a slug with YAML-special chars into the index).
  const files = (await fs.promises.readdir(featuresPath))
    .filter((f) => f.endsWith('.md') && !isArchivedSpec(f) && isSafeResourceName(f.slice(0, -'.md'.length)))
    .sort();
  const features: FeatureEntry[] = [];
  for (const file of files) {
    const content = await fs.promises.readFile(path.join(featuresPath, file), 'utf-8');
    const frontmatter = parseFeatureSpecFrontmatter(content);
    if (!frontmatter) continue;
    const modules = new Set<string>();
    for (const line of content.split('\n')) {
      const id = ACTIVE_REQ_HEADING.exec(line)?.[1];
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
  let specSyncWouldTouchFeaturesDir = false;

  // Resolve specsPath from config (non-fatal if config is missing)
  // Feature Specs go to specs/features/ subdirectory
  let featuresPath: string | null = null;
  let productSpecPath: string | null = null;
  let knowledgePath: string | null = null;
  let projectName = 'project';
  try {
    const config = await readConfig(cwd);
    const basePaths = resolveBasePaths(config, cwd);
    featuresPath = path.join(basePaths.specsPath, 'features');
    productSpecPath = path.join(basePaths.specsPath, 'product.md');
    knowledgePath = basePaths.knowledgePath;
    projectName = config.project?.name ?? 'project';
  } catch {
    // Config not available — skip Feature Spec sync
  }

  for (const change of candidates) {
    try {
      const createdDate = String(change.metadata.created ?? change.metadata.created_at ?? 'unknown');

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
          const sync = await syncToFeatureSpecs(artifactsDir, featuresPath, dryRun);
          const syncedFiles = sync.files;
          specFiles.push(...syncedFiles);
          pendingConvergence.push(...sync.pendingConvergence);
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

  // Regenerate product.md from Feature Specs (non-fatal). Dry-run cannot scan
  // the post-sync spec state (nothing was written), so it predicts the ACTION
  // from the same guards the real run uses, not the bytes.
  if (archived.length > 0 && featuresPath && productSpecPath) {
    if (dryRun) {
      planned.push({
        action: 'write',
        target: productSpecPath,
        detail: 'regenerate product.md from Feature Specs',
      });
    } else {
      try {
        await generateProductSpec(featuresPath, productSpecPath, projectName);
      } catch {
        // Product Spec regeneration failure is non-fatal
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
  const lines = deltaContent.split('\n');

  let currentSection = '';
  let currentReqId = '';
  let currentDescription = '';
  let currentFeature = '';
  let currentStory = '';
  let currentBody: string[] = [];

  const pushCurrent = () => {
    if (currentReqId && currentFeature) {
      const specBody = extractDeltaBlock(currentBody, 'Spec');
      routes.push({
        reqId: currentReqId,
        feature: currentFeature,
        story: currentStory,
        status: currentSection as FeatureRoute['status'],
        description: currentDescription,
        ...(specBody === '' ? {} : { specBody }),
        ...(buildDescriptionBody(currentBody) === ''
          ? {}
          : { descriptionBody: buildDescriptionBody(currentBody) }),
      });
    }
  };

  for (const line of lines) {
    const sectionMatch = line.match(/^##\s+(ADDED|MODIFIED|REMOVED)/i);
    if (sectionMatch) {
      pushCurrent();
      currentSection = sectionMatch[1]!.toUpperCase();
      currentReqId = '';
      currentFeature = '';
      currentStory = '';
      currentBody = [];
      continue;
    }

    const reqMatch = line.match(/^###\s+(REQ-[\w-]+):\s*(.*)/);
    if (reqMatch) {
      pushCurrent();
      currentReqId = reqMatch[1]!;
      currentDescription = reqMatch[2]!.trim();
      currentFeature = '';
      currentStory = '';
      currentBody = [];
      continue;
    }

    const featureMatch = line.match(/^\*\*Feature:\*\*\s*(.+)/);
    if (featureMatch) {
      currentFeature = featureMatch[1]!.trim();
      continue;
    }

    const storyMatch = line.match(/^\*\*Story:\*\*\s*(.+)/);
    if (storyMatch) {
      currentStory = storyMatch[1]!.trim();
      continue;
    }

    currentBody.push(line);
  }

  pushCurrent();
  return routes;
}

/** A `**Label:**` line — the boundary between delta-spec blocks. */
const DELTA_BLOCK_LABEL = /^\*\*[A-Za-z][\w \-/]*:\*\*/;

/** Any ATX heading — a block never swallows one (see extractDeltaBlock). */
const ATX_HEADING = /^#{1,6}\s/;

/**
 * Content of one `**Label:**` block: the remainder of the label line plus every
 * following line up to the next label, a heading, an entry-separating `---`, or
 * the end. Returns `''` when the block is absent — the caller decides what that
 * means.
 *
 * The heading boundary matters because this text lands in the trust zone: a
 * delta-spec whose last block is `**Spec:**` followed by any heading (a
 * traceability table, a closing note, an unfilled `### REQ-[MODULE]-001`
 * template line) would otherwise land that foreign section inside the REQ body —
 * where a later sync can no longer remove it, since the injected heading becomes
 * the in-place replacement's own stop boundary.
 */
function extractDeltaBlock(bodyLines: string[], label: string): string {
  const labelRe = new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.*)$`);
  const start = bodyLines.findIndex((l) => labelRe.test(l.trim()));
  if (start === -1) return '';

  const first = bodyLines[start]!.trim().match(labelRe)![1]!.trim();
  const collected = first === '' ? [] : [first];
  for (let i = start + 1; i < bodyLines.length; i++) {
    const line = bodyLines[i]!;
    if (DELTA_BLOCK_LABEL.test(line.trim()) || line.trim() === '---' || ATX_HEADING.test(line)) {
      break;
    }
    collected.push(line);
  }
  return collected.join('\n').trim();
}

/**
 * The ADDED fallback body: `**Description:**` prose followed by
 * `**Acceptance Criteria:**` rendered as bullets (a numbered delta-spec list
 * becomes the `-` bullets Feature Specs use). Empty when neither block exists.
 */
function buildDescriptionBody(bodyLines: string[]): string {
  const description = extractDeltaBlock(bodyLines, 'Description');
  const criteria = extractDeltaBlock(bodyLines, 'Acceptance Criteria');
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
 * Merge a requirement into an existing Feature Spec (ADDED or MODIFIED).
 *
 * NEVER blanks an authored body. A `**Spec:**` block (or, for ADDED, the
 * Description + Acceptance Criteria fallback) is the ONLY thing that replaces
 * one; with nothing to land, a MODIFIED REQ keeps its existing body and only its
 * title line is refreshed — the REQ is reported back as pending convergence
 * instead of silently losing its WHEN/THEN text.
 */
function mergeRequirementInPlace(
  content: string,
  route: FeatureRoute,
): { content: string; pending?: PendingConvergence } {
  const reqHeader = `#### ${route.reqId}:`;
  const titleLine = `#### ${route.reqId}: ${route.description}`;
  const body = landingBody(route);

  if (route.status === 'MODIFIED' && content.includes(reqHeader)) {
    // Replace existing REQ section (from header to next h4 or h3 or section end)
    const lines = content.split('\n');
    const result: string[] = [];
    let skipping = false;

    for (const line of lines) {
      if (line.startsWith(reqHeader)) {
        result.push(titleLine);
        // With a landing body the old one is superseded; without, keep it.
        if (body !== '') {
          result.push(...body.split('\n'));
          result.push('');
          skipping = true;
        }
        continue;
      }
      // Stop skipping at the next section boundary — ANY heading (h2 included,
      // e.g. ## Edge Cases / ## Change History) or a `---` rule. Without the h2
      // case, a REQ that is the last h4 before an h2 ate everything to EOF.
      if (skipping && (/^#{2,4}\s/.test(line) || line.trim() === '---')) {
        skipping = false;
      }
      if (!skipping) {
        result.push(line);
      }
    }

    const merged = result.join('\n');
    return body === ''
      ? { content: merged, pending: pendingFor(route, NO_SPEC_BLOCK_REASON) }
      : { content: merged };
  }

  // ADDED: append before Edge Cases or at end of User Stories section
  const insertBefore = '## Edge Cases';
  const newReq = body === ''
    ? `\n${titleLine}\n\n---\n`
    : `\n${titleLine}\n${body}\n\n---\n`;
  const pending = body === '' ? pendingFor(route) : undefined;

  if (content.includes(insertBefore)) {
    // Function replacer: the title and body are untrusted text and may contain
    // `$&`/`$1`/`$$` etc., which a string replacement would expand as special
    // patterns and corrupt the spec. A function returns the literal verbatim.
    return { content: content.replace(insertBefore, () => newReq + '\n' + insertBefore), pending };
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

  // Replace _(None)_ placeholder if present. Function replacers keep the
  // untrusted route.description literal — see mergeRequirementInPlace.
  if (content.includes('## Deprecated Requirements\n\n_(None)_')) {
    return content.replace(
      '## Deprecated Requirements\n\n_(None)_',
      () => `## Deprecated Requirements\n${deprecatedEntry}`,
    );
  }

  // Append to existing Deprecated section
  if (content.includes('## Deprecated Requirements')) {
    return content.replace(
      '## Deprecated Requirements',
      () => `## Deprecated Requirements${deprecatedEntry}`,
    );
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
): string {
  const refsStr = routes.map((r) => r.reqId).join(', ');
  const impact = routes.map((r) => `${r.status} ${r.reqId}`).join('; ');
  const historyRow = `| ${today} | archive-sync | ${impact} | ${refsStr} |`;

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
 */
function createNewFeatureSpec(
  feature: string,
  routes: FeatureRoute[],
  today: string,
): string {
  const stories = [...new Set(routes.map((r) => r.story).filter(Boolean))];
  const reqSections = routes
    .filter((r) => r.status !== 'REMOVED')
    .map((r) => {
      const body = landingBody(r);
      const head = `#### ${r.reqId}: ${r.description}`;
      return body === '' ? `${head}\n\n---` : `${head}\n${body}\n\n---`;
    })
    .join('\n\n');

  const deprecatedSection = routes
    .filter((r) => r.status === 'REMOVED')
    .map((r) => `- **${r.reqId}**: ${r.description} _(removed ${today})_`)
    .join('\n');

  return `---
feature: ${feature}
status: active
last_updated: ${today}
story_count: ${stories.length}
req_count: ${routes.filter((r) => r.status !== 'REMOVED').length}
---

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
| ${today} | initial-sync | Created from archive | ${routes.map((r) => r.reqId).join(', ')} |
`;
}

/**
 * Parse Feature Spec frontmatter fields.
 */
function parseFeatureSpecFrontmatter(
  content: string,
): { feature: string; status: string } | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;

  const fm = fmMatch[1]!;
  const featureMatch = fm.match(/^feature:\s*(.+)$/m);
  const statusMatch = fm.match(/^status:\s*(.+)$/m);

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

export interface ArchiveFinalizeResult {
  changeName: string;
  archiveDir: string;
  /** The committed spec-history copy destination. */
  historyPath: string;
  /** Feature specs whose frontmatter counters were corrected. */
  reconciled: CounterReconciliation[];
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
 * 2. recount every feature spec's frontmatter `story_count` / `req_count`
 *    from its FINAL body (`### US-` headings; `#### REQ-` outside Deprecated).
 *
 * Refuses while summary.md still lacks the `## Review & Verify` section — the
 * deterministic marker that the scaffold has not been overwritten yet.
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
  const rewrites: Array<{ absolute: string; content: string }> = [];
  if (fs.existsSync(featuresDir)) {
    for (const entry of fs.readdirSync(featuresDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const absolute = path.join(featuresDir, entry.name);
      const content = fs.readFileSync(absolute, 'utf-8');
      const recount = recountFeatureSpecCounters(content);
      if (!recount || !recount.changed) continue;
      const relFile = path.relative(cwd, absolute).replace(/\\/g, '/');
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
 * Recount `story_count` (`### US-` headings) and `req_count` (`#### REQ-`
 * headings outside the `## Deprecated Requirements` section) from the spec
 * body and rewrite the frontmatter values. Returns null when the file has no
 * frontmatter counters to reconcile.
 */
export function recountFeatureSpecCounters(content: string): {
  content: string;
  changed: boolean;
  from: { story_count: number | null; req_count: number | null };
  to: { story_count: number; req_count: number };
} | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;

  let storyCount = 0;
  let reqCount = 0;
  let inDeprecated = false;
  for (const line of content.slice(fmMatch[0].length).split('\n')) {
    const h2 = /^##\s+(.+)$/.exec(line);
    if (h2) {
      const title = h2[1]!.trim();
      inDeprecated = /^deprecated requirements/i.test(title);
      // Real feature specs carry stories at BOTH heading levels — sdd-workflow
      // is all `## US-`, mcp-server all `### US-`, drift-detection mixed. Every
      // current frontmatter counter equals the h2+h3 union.
      if (/^US-/.test(title)) storyCount++;
      continue;
    }
    if (/^###\s+US-/.test(line)) storyCount++;
    if (!inDeprecated && /^####\s+REQ-/.test(line)) reqCount++;
  }

  const fromStory = /^story_count:\s*(\d+)\s*$/m.exec(fmMatch[1]!);
  const fromReq = /^req_count:\s*(\d+)\s*$/m.exec(fmMatch[1]!);
  const from = {
    story_count: fromStory ? Number.parseInt(fromStory[1]!, 10) : null,
    req_count: fromReq ? Number.parseInt(fromReq[1]!, 10) : null,
  };

  let newFrontmatter = fmMatch[1]!;
  newFrontmatter = fromStory
    ? newFrontmatter.replace(/^story_count:\s*\d+\s*$/m, `story_count: ${storyCount}`)
    : `${newFrontmatter}\nstory_count: ${storyCount}`;
  newFrontmatter = fromReq
    ? newFrontmatter.replace(/^req_count:\s*\d+\s*$/m, `req_count: ${reqCount}`)
    : `${newFrontmatter}\nreq_count: ${reqCount}`;

  const changed = from.story_count !== storyCount || from.req_count !== reqCount;
  return {
    content: `---\n${newFrontmatter}\n---${content.slice(fmMatch[0].length)}`,
    changed,
    from,
    to: { story_count: storyCount, req_count: reqCount },
  };
}
