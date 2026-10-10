import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrerequisiteError } from '../types/errors.js';
import type { HistoryPaths } from '../types/history.js';
import { HISTORY_POINTER } from '../types/history.js';
import { resolveHistoryPaths } from '../lib/history-paths.js';
import { diagnoseLocalHistory, readHistoryOperation, readHistoryOperations } from '../lib/terminal-transfer.js';
import { excludesAbandonFromYield } from '../lib/abandon-history.js';
import { normalizeStationName, SDD_STATIONS } from '../types/status.js';
import {
  LessonInputSchema,
  LensYieldThresholdsSchema,
  type LessonInput,
  type LensYieldReport,
  type LensYieldThresholds,
} from '../types/station.js';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { atomicWrite, readFileIfExists } from '../lib/fs-utils.js';
import { loadModuleMap, readContained } from '../lib/knowledge-reader.js';
import { todayIso } from '../lib/date-utils.js';
import {
  parseLedger,
  upsertLesson,
  escapedCellsFor,
  scoreLessons,
  renderLedgerDocument,
  expiredPlaybookEntries,
  parsePlaybookEntries,
  selectPlaybookEntries,
  DEFAULT_SCORE_THRESHOLDS,
  type PlaybookCatalogItem,
  type PlaybookEntry,
  type ScoreSuggestion,
  type ScoreThresholds,
  type PlaybookTtl,
  type PlaybookSelectionMode,
  type PlaybookWarning,
} from '../lib/lessons-ledger.js';
import { parseReviewDocument, parseReviewMetrics } from '../lib/review-merge.js';
import {
  calculateLensYield,
  buildLensYieldReport,
  type ChangeReviewEntry,
} from '../lib/lens-yield.js';

/**
 * Scan directory for archived `review.md` files in chronological order.
 */
export async function scanArchivedReviews(
  archiveDir: string,
  extraCorpusDirs: string[] = [],
  cwd: string = process.cwd(),
  historyPaths: HistoryPaths = resolveHistoryPaths(cwd),
): Promise<ChangeReviewEntry[]> {
  const entries: ChangeReviewEntry[] = [];
  const physicalDirectories = new Set<string>();
  const physicalBundles = new Set<string>();
  const searchDirs = Array.from(
    new Set([archiveDir, ...extraCorpusDirs].map((d) => path.resolve(cwd, d))),
  );

  for (const [i, dir] of searchDirs.entries()) {
    // The default archive may legitimately be absent (clean worktree); a corpus
    // the caller named must exist — skipping it silently would print statistics
    // over a corpus that was never read.
    const explicit = i > 0;
    const st = await fs.promises.stat(dir).catch(() => undefined);
    if (!st?.isDirectory()) {
      if (explicit) {
        throw new PrerequisiteError(
          `--corpus is not an existing directory: ${dir}`,
          'Pass a directory of archived changes (each holding a review.md)',
        );
      }
      continue;
    }

    const physical = await fs.promises.realpath(dir);
    if (physicalDirectories.has(physical)) continue;
    physicalDirectories.add(physical);
    const items = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(dir, item.name);
      const isDir =
        item.isDirectory() ||
        (item.isSymbolicLink() &&
          (await fs.promises.stat(full).catch(() => undefined))?.isDirectory() === true);
      if (!isDir) continue;
      const physicalBundle = await fs.promises.realpath(full);
      if (physicalBundles.has(physicalBundle)) continue;
      physicalBundles.add(physicalBundle);
      if (physical === historyPaths.archiveRoot || fs.existsSync(path.join(full, HISTORY_POINTER))) {
        if (physical !== historyPaths.archiveRoot) throw new PrerequisiteError(`Marked history corpus is outside canonical storage: ${full}`, 'Use prospec history paths to locate the canonical archive and its operation lineage');
        readHistoryOperation(historyPaths, 'archive', item.name);
      }
      if (excludesAbandonFromYield(full, dir)) continue;
      const reviewPath = path.join(full, 'review.md');
      if (fs.existsSync(reviewPath)) {
        const content = await fs.promises.readFile(reviewPath, 'utf-8');
        const { rows } = parseReviewDocument(content);
        const { lenses } = parseReviewMetrics(content);
        // Extract date if folder starts with YYYY-MM-DD
        const dateMatch = item.name.match(/^(\d{4}-\d{2}-\d{2})-(.*)$/);
        const date = dateMatch ? dateMatch[1] : undefined;
        const changeName = dateMatch ? dateMatch[2]! : item.name;

        entries.push({
          changeName,
          rows,
          date,
          lensesRun: lenses,
        });
      }
    }
  }

  // Code-point comparison on purpose: ISO dates sort chronologically that way and
  // the order must not depend on the machine's locale — `consecutive_zero_changes`
  // and `last_yield_change` are functions of it.
  const codePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  entries.sort(
    (a, b) => codePoint(a.date ?? '', b.date ?? '') || codePoint(a.changeName, b.changeName),
  );

  return entries;
}

export interface LearnYieldOptions {
  cwd?: string;
  consecutiveZeroThreshold?: number;
  minInvocations?: number;
  minYield?: number;
  extraCorpusDirs?: string[];
}

export interface LearnUpsertOptions {
  cwd?: string;
  /** Path to the lesson JSON ({key, description, kind, source_change, impact_modules}). */
  lessonPath: string;
  /** Today's date (YYYY-MM-DD) for TTL expiry; defaults to the system date. */
  today?: string;
}

export interface LearnUpsertResult {
  ledgerPath: string;
  action: 'created' | 'incremented' | 'unchanged';
  warnings: string[];
  /** Auditable score details for every suggest-promote entry after this upsert. */
  suggestions: ScoreSuggestion[];
  /** Playbook entries past their TTL review-by date (needs-review list). */
  expiredPlaybook: PlaybookTtl[];
  /** Cells of the upserted lesson the table engine rewrote (`|` / line break). */
  escapedCells: number;
}

/** `.prospec.yaml` `learn.thresholds` override, falling back to the shipped defaults. */
function resolveThresholds(config: Record<string, unknown>): ScoreThresholds {
  const learn = config.learn;
  if (learn === null || typeof learn !== 'object') return DEFAULT_SCORE_THRESHOLDS;
  const thresholds = (learn as Record<string, unknown>).thresholds;
  if (thresholds === null || typeof thresholds !== 'object') return DEFAULT_SCORE_THRESHOLDS;
  const t = thresholds as Record<string, unknown>;
  return {
    frequency:
      typeof t.frequency === 'number' && t.frequency > 0
        ? t.frequency
        : DEFAULT_SCORE_THRESHOLDS.frequency,
    impact_modules:
      typeof t.impact_modules === 'number' && t.impact_modules > 0
        ? t.impact_modules
        : DEFAULT_SCORE_THRESHOLDS.impact_modules,
  };
}

/**
 * `prospec learn upsert` — the mechanical half of the feedback-promotion
 * pipeline. Semantic matching (assigning the ledger KEY) is the skill's
 * judgment, carried in the input; the keyed upsert, distinct-source frequency
 * increment, explicit scoring rule, and TTL expiry scan are deterministic
 * (lib/lessons-ledger, format truth in the promotion-format reference).
 */
export async function execute(options: LearnUpsertOptions): Promise<LearnUpsertResult> {
  const cwd = options.cwd ?? process.cwd();

  if (!fs.existsSync(options.lessonPath)) {
    throw new PrerequisiteError(
      `Lesson file not found: ${options.lessonPath}`,
      'Write the lesson as JSON ({key, description, kind, source_change, impact_modules}) and pass its path via --lesson',
    );
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(fs.readFileSync(options.lessonPath, 'utf-8'));
  } catch {
    throw new PrerequisiteError(
      `Lesson file is not valid JSON: ${options.lessonPath}`,
      'Emit the lesson as a JSON object ({key, description, kind, source_change, impact_modules})',
    );
  }
  const parsed = LessonInputSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new PrerequisiteError(
      `Lesson failed validation: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
      'A lesson needs key, description, kind (convention|playbook|constitution), and source_change',
    );
  }
  let lesson: LessonInput = parsed.data;

  const config = await readConfig(cwd);
  const { knowledgePath } = resolveBasePaths(config, cwd);

  // impact_modules feeds the `modules≥2` promotion score, so caller-supplied
  // names are resolved against module-map.yaml (REQ-CLI-030): unknown names
  // must not score and are surfaced as warnings; with no map the list is kept
  // but flagged unverifiable.
  const moduleWarnings: string[] = [];
  const moduleMap = loadModuleMap(knowledgePath, cwd);
  if (moduleMap === null) {
    if (lesson.impact_modules.length > 0) {
      moduleWarnings.push(
        'impact_modules could not be verified (module-map.yaml not found) — scoring uses the caller-supplied list as-is',
      );
    }
  } else {
    const known = new Set(moduleMap.modules.map((m) => m.name.toLowerCase()));
    const unknown = lesson.impact_modules.filter((m) => !known.has(m.toLowerCase()));
    if (unknown.length > 0) {
      moduleWarnings.push(
        `impact_modules not in module-map.yaml, dropped from scoring: ${unknown.join(', ')}`,
      );
      lesson = {
        ...lesson,
        impact_modules: lesson.impact_modules.filter((m) => known.has(m.toLowerCase())),
      };
    }
  }

  const ledgerPath = path.join(knowledgePath, '_lessons-ledger.md');
  const ledgerContent = await readFileIfExists(ledgerPath);

  const upserted = upsertLesson(parseLedger(ledgerContent), lesson);
  const scored = scoreLessons(upserted.entries, resolveThresholds(config as Record<string, unknown>));
  await atomicWrite(ledgerPath, renderLedgerDocument(ledgerContent, scored.entries));

  const today = options.today ?? todayIso();
  const playbookContent = await readFileIfExists(path.join(knowledgePath, '_playbook.md'));
  const expiredPlaybook = playbookContent
    ? expiredPlaybookEntries(playbookContent, today)
    : [];

  return {
    ledgerPath: path.relative(cwd, ledgerPath).replace(/\\/g, '/'),
    action: upserted.action,
    warnings: [...upserted.warnings, ...moduleWarnings],
    suggestions: scored.suggestions,
    expiredPlaybook,
    escapedCells: escapedCellsFor(scored.entries, upserted.action, lesson.key),
  };
}

export interface LearnPlaybookOptions {
  cwd?: string;
  /** Module names; each entry may itself be a comma-separated list. */
  modules?: string[];
  /** One entry id (`PB-007`). */
  id?: string;
  /** One SDD station or its skill alias. */
  station?: string;
}

export interface LearnPlaybookResult {
  /** Repo-relative path of the playbook that was (or would have been) read. */
  path: string;
  /** False when `_playbook.md` is absent — an empty catalog, never an error. */
  available: boolean;
  /** `--modules`: every active entry, module matches first. */
  catalog: PlaybookCatalogItem[];
  /** `--id`: the selected entry. */
  entry: PlaybookEntry | null;
  mode: PlaybookSelectionMode | null;
  warnings: PlaybookWarning[];
}

export type { PlaybookCatalogItem, PlaybookEntry } from '../lib/lessons-ledger.js';

/**
 * `prospec learn playbook` — the per-change playbook read (REQ-SERVICES-123):
 * the catalog names every active entry; station declarations or legacy module
 * matches select bodies. Parsing and selection live in lib/lessons-ledger.
 */
export async function executePlaybook(options: LearnPlaybookOptions): Promise<LearnPlaybookResult> {
  const cwd = options.cwd ?? process.cwd();
  const hasModules = options.modules !== undefined;
  const hasId = options.id !== undefined;
  const hasStation = options.station !== undefined;
  if ((hasId && (hasModules || hasStation)) || (!hasId && !hasModules && !hasStation)) {
    throw new PrerequisiteError(
      'choose --modules, --station, --station with --modules, or --id alone',
      'Pass --station <name> [--modules <m,…>], --modules <m,…>, or --id <PB-NNN>',
    );
  }
  if (hasId && options.id?.trim() === '') {
    throw new PrerequisiteError('empty --id', 'Pass an active playbook id such as PB-007');
  }
  const station = hasStation ? normalizeStationName(options.station ?? '') : null;
  if (hasStation && station === null) {
    throw new PrerequisiteError(
      `unknown --station "${options.station}"`,
      `Choose one of: ${SDD_STATIONS.join(', ')}`,
    );
  }
  const modules = options.modules
    ?.flatMap((m) => m.split(','))
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
  if (modules !== undefined && modules.length === 0) {
    throw new PrerequisiteError(
      'no usable module name in --modules',
      'Pass the change\'s related modules, e.g. --modules lib,cli',
    );
  }

  const config = await readConfig(cwd);
  const { knowledgePath } = resolveBasePaths(config, cwd);
  const playbookPath = path.join(knowledgePath, '_playbook.md');
  const relPath = path.relative(cwd, playbookPath).replace(/\\/g, '/');
  // Only ABSENCE is the neutral empty catalog. A playbook that exists but cannot
  // be read, or resolves outside the knowledge directory, must stay loud: this
  // runs unattended at plan/implement Startup Loading, and "no team lessons" is
  // what an agent would act on.
  const read = readContained(playbookPath, knowledgePath);
  if (!read.ok) {
    if (read.reason === 'absent') return { path: relPath, available: false, catalog: [], entry: null, mode: station !== null ? 'station' : hasId ? null : 'modules', warnings: [] };
    throw new PrerequisiteError(
      `playbook ${relPath} exists but is ${read.reason}`,
      read.reason === 'escaped'
        ? 'It resolves outside the knowledge directory — replace the link with a file under it'
        : 'Make it a readable file',
    );
  }

  const entries = parsePlaybookEntries(read.text);
  const selection = selectPlaybookEntries(
    entries,
    hasId ? { id: options.id ?? '' } : station !== null ? { station, ...(modules !== undefined ? { modules } : {}) } : { modules: modules ?? [] },
  );
  if (selection.kind === 'miss') {
    throw new PrerequisiteError(
      `unknown playbook entry "${selection.id}" in ${relPath}`,
      `Active entries: ${entries.filter((e) => !e.retired).map((e) => e.id).join(', ')}`,
    );
  }
  return selection.kind === 'catalog'
    ? { path: relPath, available: true, catalog: selection.catalog, entry: null, mode: selection.mode, warnings: selection.warnings }
    : { path: relPath, available: true, catalog: [], entry: selection.entry, mode: null, warnings: selection.warnings };
}

/**
 * `prospec learn yield` — compute per-lens confirmed yield statistics and retirement recommendations
 * across historical reviews in the change archive.
 */
export async function executeYield(options: LearnYieldOptions = {}): Promise<LensYieldReport> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);

  const learnConfig = config.learn as Record<string, unknown> | undefined;
  if (learnConfig?.lens_thresholds !== undefined) {
    const checkParsed = LensYieldThresholdsSchema.partial().safeParse(learnConfig.lens_thresholds);
    if (!checkParsed.success) {
      throw new PrerequisiteError(
        `Invalid learn.lens_thresholds in .prospec.yaml: ${checkParsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
        'Fix the threshold values in .prospec.yaml under learn.lens_thresholds',
      );
    }
  }

  const cliOverrides = Object.fromEntries(
    Object.entries({
      consecutive_zero_threshold: options.consecutiveZeroThreshold,
      min_invocations: options.minInvocations,
      min_yield: options.minYield,
    }).filter(([, v]) => v !== undefined),
  );

  const rawConfigThresholds =
    typeof learnConfig === 'object' &&
    learnConfig !== null &&
    'lens_thresholds' in learnConfig &&
    typeof learnConfig.lens_thresholds === 'object' &&
    learnConfig.lens_thresholds !== null
      ? (learnConfig.lens_thresholds as Record<string, unknown>)
      : {};

  const parsed = LensYieldThresholdsSchema.safeParse({
    ...rawConfigThresholds,
    ...cliOverrides,
  });
  if (!parsed.success) {
    throw new PrerequisiteError(
      `Invalid threshold options: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
      'Fix the CLI option values or .prospec.yaml under learn.lens_thresholds',
    );
  }
  const thresholds: LensYieldThresholds = parsed.data;

  const historyPaths = resolveHistoryPaths(cwd);
  const diagnostics = diagnoseLocalHistory(historyPaths);
  if (diagnostics.length) throw new PrerequisiteError(diagnostics.map(item => `${item.path}: ${item.reason}`).join('\n'), 'Run prospec history import before calculating yield across shared history');
  const pending = readHistoryOperations(historyPaths).filter(operation => operation.kind === 'archive' && operation.phase !== 'published' && operation.phase !== 'complete');
  if (pending.length) throw new PrerequisiteError(`Incomplete archive publication: ${pending.map(operation => operation.finalDir).join(', ')}`, 'Inspect prospec history paths and reconcile pending operations before calculating yield');
  const corpus = await scanArchivedReviews(historyPaths.archiveRoot, options.extraCorpusDirs, cwd, historyPaths);
  const stats = calculateLensYield(corpus, thresholds);

  return buildLensYieldReport(stats, corpus.length, thresholds);
}
