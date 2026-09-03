import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrerequisiteError } from '../types/errors.js';
import {
  LessonInputSchema,
  LensYieldThresholdsSchema,
  type LessonInput,
  type LensYieldReport,
  type LensYieldThresholds,
} from '../types/station.js';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { atomicWrite, readFileIfExists } from '../lib/fs-utils.js';
import { loadModuleMap } from '../lib/knowledge-reader.js';
import { todayIso } from '../lib/date-utils.js';
import {
  parseLedger,
  upsertLesson,
  scoreLessons,
  renderLedgerDocument,
  expiredPlaybookEntries,
  DEFAULT_SCORE_THRESHOLDS,
  type ScoreSuggestion,
  type ScoreThresholds,
  type PlaybookTtl,
} from '../lib/lessons-ledger.js';
import { parseReviewDocument, parseReviewMetrics } from '../lib/review-merge.js';
import {
  calculateLensYield,
  buildLensYieldReport,
  type ChangeReviewEntry,
} from '../lib/lens-yield.js';

/** One archived change directory as enumerated from the archive (or a `--corpus`). */
export interface ArchivedChangeDir {
  dirPath: string;
  changeName: string;
  /** Present when the directory name starts with `YYYY-MM-DD-`. */
  date?: string;
}

/**
 * Enumerate archived change directories — the ONE listing both `learn yield` and
 * `learn stats` read, so `--corpus` semantics cannot drift between them: dirs are
 * deduplicated and resolved against `cwd`; the default archive may legitimately be
 * absent (clean worktree) while a corpus the caller named must exist — skipping it
 * silently would print statistics over a corpus that was never read; symlinked
 * directories count; the change name and date come from the `YYYY-MM-DD-<name>`
 * directory name. Order is the readdir order per search dir — callers sort.
 */
export async function listArchivedChangeDirs(
  archiveDir: string,
  extraCorpusDirs: string[] = [],
  cwd: string = process.cwd(),
): Promise<ArchivedChangeDir[]> {
  const dirs: ArchivedChangeDir[] = [];
  const searchDirs = Array.from(
    new Set([archiveDir, ...extraCorpusDirs].map((d) => path.resolve(cwd, d))),
  );

  for (const [i, dir] of searchDirs.entries()) {
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

    const items = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(dir, item.name);
      const isDir =
        item.isDirectory() ||
        (item.isSymbolicLink() &&
          (await fs.promises.stat(full).catch(() => undefined))?.isDirectory() === true);
      if (!isDir) continue;
      const dateMatch = item.name.match(/^(\d{4}-\d{2}-\d{2})-(.*)$/);
      dirs.push({
        dirPath: full,
        changeName: dateMatch ? dateMatch[2]! : item.name,
        ...(dateMatch ? { date: dateMatch[1]! } : {}),
      });
    }
  }
  return dirs;
}

/**
 * Scan directory for archived `review.md` files in chronological order.
 */
export async function scanArchivedReviews(
  archiveDir: string,
  extraCorpusDirs: string[] = [],
  cwd: string = process.cwd(),
): Promise<ChangeReviewEntry[]> {
  const entries: ChangeReviewEntry[] = [];
  for (const { dirPath, changeName, date } of await listArchivedChangeDirs(archiveDir, extraCorpusDirs, cwd)) {
    const reviewPath = path.join(dirPath, 'review.md');
    if (!fs.existsSync(reviewPath)) continue;
    const content = await fs.promises.readFile(reviewPath, 'utf-8');
    const { rows } = parseReviewDocument(content);
    const { lenses } = parseReviewMetrics(content);
    entries.push({ changeName, rows, date, lensesRun: lenses });
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
  };
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

  const archiveDir = path.join(cwd, '.prospec', 'archive');
  const corpus = await scanArchivedReviews(archiveDir, options.extraCorpusDirs, cwd);
  const stats = calculateLensYield(corpus, thresholds);

  return buildLensYieldReport(stats, corpus.length, thresholds);
}

