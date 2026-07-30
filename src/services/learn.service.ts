import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrerequisiteError } from '../types/errors.js';
import { LessonInputSchema, type LessonInput } from '../types/station.js';
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
