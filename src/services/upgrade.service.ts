import { input } from '@inquirer/prompts';
import {
  readConfig,
  writeConfig,
  resolveArtifactLanguage,
  isDefaultArtifactLanguage,
  isArtifactLanguageUnset,
} from '../lib/config.js';
import { fileExists, atomicWrite } from '../lib/fs-utils.js';
import type { ProspecConfig } from '../types/config.js';
import { DEFAULT_ARTIFACT_LANGUAGE } from '../types/config.js';
import { PROSPEC_VERSION } from '../types/version.js';
import { INIT_DOC_REGISTRY } from '../types/conventions.js';
import {
  buildInitDocContexts,
  renderInitDoc,
  resolveInitDocLocation,
} from '../lib/init-docs.js';
import {
  execute as agentSyncExecute,
  type AgentSyncFullResult,
} from './agent-sync.service.js';
import { generateRawScan } from './raw-scan.service.js';
import { SKILL_DEFINITIONS } from '../types/skill.js';

export interface UpgradeOptions {
  cwd?: string;
  /**
   * When true, prompt the user to fill each fired nudge in the terminal (like
   * `prospec init`). The command sets this only for an interactive TTY and never
   * when `--no-interactive` is passed — so the /prospec-upgrade skill and CI,
   * which invoke `prospec upgrade` non-interactively, never block on a prompt.
   */
  interactive?: boolean;
}

/**
 * A reminder that a pre-feature project lacks an optional `.prospec.yaml` field
 * whose default silently picks a behavior the user may not want. The CLI prints
 * `message`; the /prospec-upgrade skill keys off the stable `field` id.
 */
export interface UpgradeNudge {
  /** Stable config-field id (e.g. 'artifact_language') the skill acts on. */
  field: string;
  /** Human-readable reminder, printed verbatim in the migration report. */
  message: string;
}

/**
 * One init-created curated doc's existence status, derived from
 * `INIT_DOC_REGISTRY` — the same single source `init.service` creates from.
 * `prospec upgrade` now back-fills the docs this marks MISSING, so the
 * /prospec-upgrade skill consumes this list to diff PRESENT docs against their
 * template (a consent-gated FORMAT migration) and to enrich docs the CLI just
 * created; a doc still MISSING here (back-fill failed) is the skill's safety-net
 * to offer creating. It never keeps a parallel hardcoded file list.
 */
export interface DocInventoryEntry {
  /** Project-relative doc path (base_dir prefixed), matching init's labels. */
  path: string;
  /** Handlebars template under `src/templates/` the doc is created from. */
  template: string;
  /** Whether the doc exists in this project. */
  present: boolean;
}

export interface UpgradeReport {
  /** prospec version recorded before this upgrade ('unknown' if never stamped). */
  versionFrom: string;
  /** prospec version after this upgrade (the running CLI version). */
  versionTo: string;
  /** Skills with no skill_triggers entry — what /prospec-upgrade localizes (non-English only). */
  missingTriggers: string[];
  /**
   * Config-field nudges that fired for this project — absent curated fields a
   * pre-feature CLI never wrote (see UPGRADE_NUDGE_RULES). The /prospec-upgrade
   * skill offers to fill each. A project that explicitly chose a value is NOT
   * flagged, so a deliberate choice is never nagged.
   */
  nudges: UpgradeNudge[];
  /**
   * Docs inventory — every init-created curated doc with its present/missing
   * status, evaluated AFTER back-fill, so a doc this run created reads present.
   * A doc still MISSING here means its render/write failed (best-effort).
   */
  docs: DocInventoryEntry[];
  /**
   * Docs this run BACK-FILLED — init-created docs that were MISSING and have now
   * been rendered from their template (skip-if-exists; existing docs are never
   * overwritten). Project-relative labels matching the docs inventory. Empty
   * when nothing was missing.
   */
  createdDocs: string[];
}

/** A nudge the user resolved interactively this run (field set to a value). */
export interface ResolvedNudge {
  field: string;
  value: string;
}

export interface UpgradeResult {
  /** Version delta + trigger gaps consumed by the /prospec-upgrade skill. */
  report: UpgradeReport;
  /** The agent-sync result — carries hints (missing triggers) and warnings. */
  agentSync: AgentSyncFullResult;
  /** The slash command the user runs next in their AI agent. */
  nextStep: string;
  /** Nudges the user filled in via interactive prompts this run (empty otherwise). */
  resolvedNudges: ResolvedNudge[];
  /**
   * Whether the deterministic `raw-scan.md` refresh ran (best-effort, non-fatal).
   * Like agent sync, this regenerates a generated artifact to the new prospec
   * version's scanner output; it never touches curated docs.
   */
  rawScanRefreshed: boolean;
}

/**
 * Execute the upgrade workflow (zero-LLM, deterministic):
 *
 * 1. Record the running prospec version in `.prospec.yaml` `version`.
 * 2. On an interactive terminal, prompt the user to fill each fired config-field
 *    nudge (like `prospec init`); the answers patch the config before it is written.
 * 3. Persist via a comment-preserving in-place merge (comments/formatting kept).
 * 4. Re-run agent sync (zone-1 generated files; reflects any just-set language).
 * 5. Refresh the deterministic `raw-scan.md` (best-effort) so the project-structure
 *    snapshot reflects the new version's scanner. `--raw-scan-only` semantics: it
 *    writes ONLY raw-scan.md.
 * 6. Back-fill any MISSING init-created doc by rendering its template (the same
 *    deterministic render `prospec init` uses, shared via lib/init-docs) —
 *    skip-if-exists, so an existing doc is never overwritten. This closes the gap
 *    where an already-initialized project could not obtain a newly-added init doc
 *    (`prospec init` is blocked once `.prospec.yaml` exists).
 * 7. Build a report (version delta, skills missing triggers, remaining nudges,
 *    docs inventory + the docs just created) for the `/prospec-upgrade` skill,
 *    which handles the consent-gated work the CLI cannot: ENRICHING a created doc
 *    (e.g. index.md's real module table / a legacy _index.md migration) and
 *    migrating an existing doc's FORMAT.
 *
 * It only ever CREATES a missing registry doc (CONSTITUTION, index, README, the
 * convention docs); it never overwrites or reformats an existing one — that needs
 * consent and is the skill's job. The `ai-knowledge/` writes are the deterministic
 * `raw-scan.md` refresh (step 5) and any missing curated doc it back-fills (step 6).
 */
export async function execute(options: UpgradeOptions): Promise<UpgradeResult> {
  const cwd = options.cwd ?? process.cwd();

  // 1. Read config — throws ConfigNotFound on an uninitialized project, the same
  //    guard every post-init command relies on (upgrade is not in INIT_COMMANDS).
  const config = await readConfig(cwd);

  // 2. Record the running prospec version.
  const versionFrom = config.version ?? 'unknown';
  config.version = PROSPEC_VERSION;

  // 3. Interactively resolve nudges (only when the command opted in for a TTY).
  //    Each fired rule prompts the user; the answer patches the config in place.
  //    Skipped entirely when non-interactive, so the skill/CI never block here.
  const resolvedNudges: ResolvedNudge[] = [];
  if (options.interactive) {
    for (const rule of UPGRADE_NUDGE_RULES) {
      if (!rule.isUnset(config)) continue;
      const patch = await rule.prompt();
      if (!patch) continue;
      Object.assign(config, patch);
      resolvedNudges.push({
        field: rule.field,
        value: String((patch as Record<string, unknown>)[rule.field] ?? ''),
      });
    }
  }

  // 4. Persist (writeConfig merges in place, keeping comments) AFTER prompting,
  //    so a just-set language lands in the same write as the version bump.
  await writeConfig(config, cwd);

  // 5. Re-sync agent config (zone-1 generated files + trigger hints/warnings).
  const agentSync = await agentSyncExecute({ cwd });

  // 5b. Refresh the deterministic raw-scan.md (no LLM) so the project-structure
  //     snapshot reflects the new version's scanner — mirrors the archive safety
  //     net. Non-fatal: a scan failure must never block the upgrade, and it writes
  //     ONLY raw-scan.md (never a curated doc).
  let rawScanRefreshed = false;
  try {
    await generateRawScan({ cwd });
    rawScanRefreshed = true;
  } catch {
    // Raw-scan refresh failure is non-fatal — the version bump + agent sync stand.
  }

  // 5c. Back-fill any init-created doc this project is missing (e.g. one a newer
  //     prospec added). Deterministic render, skip-if-exists — never overwrites
  //     authored content; a newly-added doc lands without re-running `prospec
  //     init` (blocked once `.prospec.yaml` exists). The docs inventory in the
  //     report below is built AFTER this, so it reflects the post-creation state.
  const createdDocs = await createMissingDocs(config, cwd);

  // 6. Build the report from the POST-prompt config: a language set in step 3 now
  //    resolves here, so missingTriggers/nudges reflect what is still outstanding
  //    (e.g. a freshly-set non-English language surfaces every skill's triggers).
  const artifactLanguage = resolveArtifactLanguage(config);
  const report: UpgradeReport = {
    versionFrom,
    versionTo: PROSPEC_VERSION,
    missingTriggers: detectMissingTriggers(config, artifactLanguage),
    nudges: detectNudges(config),
    docs: buildDocsInventory(config, cwd),
    createdDocs,
  };

  return {
    report,
    agentSync,
    nextStep: '/prospec-upgrade',
    resolvedNudges,
    rawScanRefreshed,
  };
}

/**
 * Existence status of every init-created curated doc, derived from
 * `INIT_DOC_REGISTRY` via the shared `resolveInitDocLocation` (base docs under
 * `paths.base_dir`, knowledge docs under the resolved `knowledge.base_path`, so
 * a project that relocated its knowledge base is checked at its ACTUAL doc
 * locations, never misreported as missing at the default path). A pure existence
 * probe: `createMissingDocs` calls it before creation (to find what to write)
 * and the report is built from it after (so it reflects the post-creation state).
 */
export function buildDocsInventory(
  config: ProspecConfig,
  cwd: string,
): DocInventoryEntry[] {
  return INIT_DOC_REGISTRY.map((doc) => {
    const { absPath, label } = resolveInitDocLocation(doc, config, cwd);
    return {
      path: label,
      template: doc.template,
      present: fileExists(absPath),
    };
  });
}

/**
 * Back-fill every registry doc marked MISSING by rendering its template — the
 * same deterministic render `prospec init` uses (shared via lib/init-docs), so
 * an already-initialized project gets a newly-added init doc without re-running
 * `prospec init` (which the `.prospec.yaml` gate blocks). NEVER overwrites an
 * existing doc: creation is skip-if-exists, so authored content is untouched
 * (migrating an existing doc's FORMAT stays the consent-gated skill's job). A
 * per-doc render/write failure is non-fatal (best-effort, like the raw-scan
 * refresh) so it never aborts the version bump + agent sync that already landed
 * — the doc simply stays MISSING and is reported. Returns the created labels.
 */
export async function createMissingDocs(
  config: ProspecConfig,
  cwd: string,
): Promise<string[]> {
  const anyMissing = buildDocsInventory(config, cwd).some((doc) => !doc.present);
  if (!anyMissing) return [];

  const contexts = buildInitDocContexts(config, cwd);
  const created: string[] = [];
  for (const doc of INIT_DOC_REGISTRY) {
    const { absPath, label } = resolveInitDocLocation(doc, config, cwd);
    if (fileExists(absPath)) continue;
    try {
      await atomicWrite(absPath, renderInitDoc(doc, contexts));
      created.push(label);
    } catch {
      // Best-effort: a single doc's render/write failure leaves it MISSING and
      // reported; it must not abort the upgrade (version + agent sync stand).
    }
  }
  return created;
}

/**
 * Skills with no `skill_triggers` entry — what `/prospec-upgrade` localizes for a
 * non-English project. English projects use the English baseline, so nothing is
 * "missing"; the concept applies only to a non-default artifact language.
 */
export function detectMissingTriggers(
  config: ProspecConfig,
  artifactLanguage: string,
): string[] {
  if (isDefaultArtifactLanguage(artifactLanguage)) return [];
  const localized = config.skill_triggers ?? {};
  return SKILL_DEFINITIONS.filter((s) => {
    const entry = localized[s.name];
    return !entry || entry.length === 0;
  }).map((s) => s.name);
}

interface NudgeRule extends UpgradeNudge {
  /** Whether this field is unset for the given config (fires the nudge). */
  isUnset: (config: ProspecConfig) => boolean;
  /**
   * Interactive resolution (terminal prompt — fill a value, or Y/N for a boolean
   * field). Returns a partial config to merge, or null if the user declined.
   * Called only in interactive mode.
   */
  prompt: () => Promise<Partial<ProspecConfig> | null>;
}

/**
 * Curated registry of optional `.prospec.yaml` fields worth nudging about on
 * upgrade when a pre-feature project lacks them. This is intentionally a CURATED
 * list, NOT "every absent field": most optional fields have sensible defaults
 * (`paths.base_dir`, `knowledge.*`, `exclude`) or are a hard error when missing
 * (`agents` → agent sync throws), so only a field whose default silently picks a
 * behavior the user may not want belongs here. Adding a future nudge is one entry
 * — the report, formatter, interactive prompt, and skill all iterate it.
 */
const UPGRADE_NUDGE_RULES: readonly NudgeRule[] = [
  {
    field: 'artifact_language',
    isUnset: isArtifactLanguageUnset,
    message:
      'no artifact_language set — AI-generated docs default to English. To author them in another language, set artifact_language in .prospec.yaml (then skill triggers can be localized).',
    // Mirrors `prospec init`'s language prompt: a text input defaulting to English.
    // Accepting the default writes `English` (the nudge self-terminates); typing
    // another language records it (triggers then localize via /prospec-upgrade).
    prompt: async () => {
      const language =
        (
          await input({
            message: 'Primary language for AI-generated documents:',
            default: DEFAULT_ARTIFACT_LANGUAGE,
          })
        ).trim() || DEFAULT_ARTIFACT_LANGUAGE;
      return { artifact_language: language };
    },
  },
];

/**
 * The nudges that fire for this config — one per curated field the project lacks.
 * Empty for a project that explicitly chose every curated field.
 */
export function detectNudges(config: ProspecConfig): UpgradeNudge[] {
  return UPGRADE_NUDGE_RULES.filter((rule) => rule.isUnset(config)).map(
    ({ field, message }) => ({ field, message }),
  );
}
