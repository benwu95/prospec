import * as fs from 'node:fs';
import * as path from 'node:path';
import { inspect } from 'node:util';
import { z } from 'zod';
import { TestPolicySchema, type TestPolicy } from '../types/change.js';
import {
  ProspecConfigSchema,
  DEFAULT_ARTIFACT_LANGUAGE,
  DEFAULT_BASE_DIR,
  isRecord,
  KNOWLEDGE_DIR,
  knowledgeBasePathIssue,
  SPECS_DIR,
  usableBaseDir,
  DEFAULT_KNOWLEDGE_TOKEN_BUDGET,
  DEFAULT_MAX_STATION_RETRIES,
  MAX_TEST_TIMEOUT_MS,
  PAUSE_AT_ENV_VAR,
  PAUSE_AT_NONE,
  PAUSE_STATIONS,
  ALWAYS_ESCALATE_CATEGORIES,
  DEFAULT_ALWAYS_ESCALATE,
  isShippedBudgetField,
  isDefaultArtifactLanguage,
} from '../types/config.js';
import type { AlwaysEscalateCategory, ProspecConfig, KnowledgeSizeBudget, PauseStation, TokenBudget } from '../types/config.js';
import { AlwaysEscalateInvalid, ConfigNotFound, ConfigInvalid, KnowledgePathMigrationRequired, PauseAtInvalid, TestTimeoutInvalid } from '../types/errors.js';
import { atomicWrite } from './fs-utils.js';
import { parseYaml, parseYamlDocument, stringifyYamlDocument, mergeIntoDocument } from './yaml-utils.js';
import { resolveProjectTestCommand } from './project-runner.js';
import { DEFAULT_TEST_TIMEOUT_MS } from './test-runner.js';

const CONFIG_FILENAME = '.prospec.yaml';

export interface BasePaths {
  baseDir: string;
  knowledgePath: string;
  constitutionPath: string;
  specsPath: string;
}

/**
 * Derive all standard Prospec paths from config.
 *
 * Resolution: paths.base_dir → DEFAULT_BASE_DIR. The fallback is the canonical
 * default that `init` always writes, so a config missing `base_dir` resolves the
 * artifact tree to the same root init created — not a divergent legacy location.
 * The Knowledge directory is always `{base_dir}/ai-knowledge`.
 * Returns absolute paths when cwd is provided.
 */
export function resolveBasePaths(config: ProspecConfig, cwd: string): BasePaths {
  const baseDir = config.paths?.base_dir ?? DEFAULT_BASE_DIR;
  const knowledgePath = path.join(baseDir, KNOWLEDGE_DIR);
  const constitutionPath = path.join(baseDir, 'CONSTITUTION.md');
  const specsPath = path.join(baseDir, SPECS_DIR);

  return {
    baseDir: path.resolve(cwd, baseDir),
    knowledgePath: path.resolve(cwd, knowledgePath),
    constitutionPath: path.resolve(cwd, constitutionPath),
    specsPath: path.resolve(cwd, specsPath),
  };
}

type DirectoryChain =
  | { ok: true; existing: string[] }
  | { ok: false; index: number; at: string; reason: 'symlink' | 'not-directory' | 'uninspectable'; error?: NodeJS.ErrnoException };

/**
 * lstat `segments` below `root` one at a time: each existing segment must be an
 * ordinary directory (not a symlink); the walk stops at the first missing one.
 */
function ordinaryDirectoryChain(root: string, segments: string[]): DirectoryChain {
  const existing: string[] = [];
  let at = root;
  for (const [index, segment] of segments.entries()) {
    at = path.join(at, segment);
    let stat;
    try { stat = fs.lstatSync(at); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      return { ok: false, index, at, reason: 'uninspectable', error: error as NodeJS.ErrnoException };
    }
    if (stat.isSymbolicLink()) return { ok: false, index, at, reason: 'symlink' };
    if (!stat.isDirectory()) return { ok: false, index, at, reason: 'not-directory' };
    existing.push(at);
  }
  return { ok: true, existing };
}

/** The artifact directories below `{base_dir}` that must be ordinary directories when they exist. */
const CONFINED_ARTIFACT_DIRS = [SPECS_DIR, KNOWLEDGE_DIR] as const;

/**
 * Refuse a configuration whose `{base_dir}`, `{base_dir}/specs` or
 * `{base_dir}/ai-knowledge` exists below `projectDir` as a symlink or a
 * non-directory, or cannot be inspected. Missing directories are accepted.
 */
export function checkConfigPathTopology(config: ProspecConfig, projectDir: string): void {
  const issue = configPathTopologyIssue(config.paths?.base_dir ?? DEFAULT_BASE_DIR, projectDir);
  if (issue !== null) throw new ConfigInvalid(issue, 'Fix the directory named above, then run the command again');
}

function configPathTopologyIssue(baseDir: string, projectDir: string): string | null {
  for (const dir of CONFINED_ARTIFACT_DIRS) {
    const segments = [baseDir, dir];
    const chain = ordinaryDirectoryChain(projectDir, segments);
    if (chain.ok) continue;
    const at = JSON.stringify(segments.slice(0, chain.index + 1).join('/'));
    const detail = chain.reason === 'symlink'
      ? `${at} is a symlink — replace it with an ordinary directory`
      : chain.reason === 'not-directory'
        ? `${at} is not a directory — replace it with an ordinary directory, or remove it so prospec can create it`
        : `${at} cannot be inspected (${chain.error?.code ?? 'error'}) — make the directory and its parents readable`;
    return `paths.base_dir: ${detail}`;
  }
  return null;
}

export function resolveTestEvidencePolicy(config: ProspecConfig, cwd: string): TestPolicy | undefined {
  if (config.test_evidence?.exclude_knowledge !== true) return undefined;
  const root = fs.realpathSync.native(cwd);
  const target = resolveBasePaths(config, root).knowledgePath;
  const relative = path.relative(root, target);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Knowledge exclusion must be a strict descendant of the project root');
  }
  const policy = TestPolicySchema.parse({ version: 1, excluded_path: relative.split(path.sep).join('/') });
  if (policy.excluded_path === CONFIG_FILENAME) {
    throw new Error('Knowledge exclusion must not cover .prospec.yaml');
  }
  const segments = relative.split(path.sep);
  const chain = ordinaryDirectoryChain(root, segments);
  if (!chain.ok) {
    if (chain.error) throw chain.error;
    throw new Error(`Knowledge exclusion requires ordinary directory ancestors: ${chain.at}`);
  }
  for (const ancestor of chain.existing) fs.accessSync(ancestor, fs.constants.R_OK | fs.constants.X_OK);
  const last = chain.existing.at(-1);
  const deepest = last === undefined ? root : fs.realpathSync.native(last);
  const resolved = path.join(deepest, ...segments.slice(chain.existing.length));
  return TestPolicySchema.parse({ ...policy, excluded_path: path.relative(root, resolved).split(path.sep).join('/') });
}

/**
 * Resolve the artifact language from config — trims whitespace and treats a
 * missing or blank value (e.g. a hand-edited `artifact_language: ""`) as the
 * default English.
 */
export function resolveArtifactLanguage(config: ProspecConfig): string {
  const raw = (config.artifact_language ?? '').trim();
  return raw || DEFAULT_ARTIFACT_LANGUAGE;
}

/**
 * Resolve the trust-zone language. Absent or blank means English — the behavior
 * every project had before the axis existed. An English spelled differently
 * (`english`, ` English `) is canonicalized to the default constant so the
 * generators that interpolate it keep rendering the exact pre-axis text.
 */
export function resolveTrustZoneLanguage(config: ProspecConfig): string {
  const raw = (config.trust_zone_language ?? '').trim();
  return !raw || isDefaultArtifactLanguage(raw) ? DEFAULT_ARTIFACT_LANGUAGE : raw;
}

/** Whether two resolved language names denote one language (trim + case-insensitive). */
export function sameLanguage(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Re-exported from its canonical home in `types/config` so existing lib/service
// callers keep importing it from here, while cli formatters import it straight
// from `types` (a cli→lib import is forbidden by the layer lint rule).
export { isDefaultArtifactLanguage } from '../types/config.js';

/**
 * Whether `.prospec.yaml` carries no artifact-language choice at all — the
 * `artifact_language` field is absent or blank, as opposed to an explicit value
 * like "English". Distinct from `isDefaultArtifactLanguage`, which collapses
 * "unset" and "explicitly English" into one (both resolve to English).
 *
 * True only for a project that predates the `artifact_language` feature: `prospec
 * init` always writes the field, so its absence means an older CLI scaffolded the
 * project and the user never had the chance to pick a language. `prospec upgrade`
 * uses this to nudge such a project that it can opt into a non-English language.
 */
export function isArtifactLanguageUnset(config: ProspecConfig): boolean {
  return (config.artifact_language ?? '').trim() === '';
}

/**
 * Resolve the knowledge-size budget: `knowledge.token_budget` in .prospec.yaml
 * overrides individual fields; anything unset falls back to
 * DEFAULT_KNOWLEDGE_TOKEN_BUDGET — the single source shared with index.md's
 * declared budgets and the budget numbers rendered into generated skills.
 *
 * The field list is DERIVED from the default rather than hand-written: a threshold
 * added to the schema but forgotten here would accept the config key and silently
 * ignore the override.
 */
export function resolveKnowledgeTokenBudget(config: ProspecConfig): KnowledgeSizeBudget {
  const tb: NonNullable<TokenBudget> = config.knowledge?.token_budget ?? {};
  const resolved: KnowledgeSizeBudget = { ...DEFAULT_KNOWLEDGE_TOKEN_BUDGET };
  for (const key of Object.keys(resolved) as (keyof KnowledgeSizeBudget)[]) {
    // Shipped budgets describe prospec's own skill files: never a project's to set.
    if (isShippedBudgetField(key)) continue;
    const override = tb[key as keyof NonNullable<TokenBudget>];
    if (override !== undefined) resolved[key] = override;
  }
  return resolved;
}

/**
 * Resolve maximum station retries bound (REQ-LIB-082).
 *
 * Missing, <= 0, or non-integer falls back to DEFAULT_MAX_STATION_RETRIES (3).
 * Pure resolver — performs no I/O.
 */
export function resolveMaxStationRetries(config?: ProspecConfig | null): number {
  const value = config?.workflow?.max_station_retries;
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  return DEFAULT_MAX_STATION_RETRIES;
}

/**
 * Resolve the stations a change pauses after (REQ-LIB-086).
 *
 * `PROSPEC_PAUSE_AT`, when set at all (the empty string included), decides alone, and
 * `none` means no pause like the empty string —
 * that is what lets a cloud or scheduled run opt out of a pause committed to
 * `.prospec.yaml`. Otherwise a verified `ai-proposed` Premise pauses at `plan`, and
 * `workflow.pause_at` decides the rest. An invalid value throws rather than resolving
 * to "no pause": a typo must never silently disable a pause.
 * Pure resolver — the environment is a parameter.
 */
export function resolvePauseAt(
  config: Pick<ProspecConfig, 'workflow'> | null | undefined,
  env: Readonly<Record<string, string | undefined>>,
  options: { aiProposedPremise?: boolean } = {},
): PauseStation[] {
  const fromEnv = env[PAUSE_AT_ENV_VAR];
  if (fromEnv !== undefined) {
    if (fromEnv.trim() === PAUSE_AT_NONE) return [];
    return validatePauseStations(fromEnv.split(','), PAUSE_AT_ENV_VAR, fromEnv);
  }
  const stations = configuredPauseStations(config);
  if (options.aiProposedPremise === true && !stations.includes('plan')) stations.push('plan');
  return stations;
}

function configuredPauseStations(config: Pick<ProspecConfig, 'workflow'> | null | undefined): PauseStation[] {
  const fromConfig = config?.workflow?.pause_at;
  if (fromConfig === undefined) return [];
  const source = '.prospec.yaml workflow.pause_at';
  if (!Array.isArray(fromConfig)) {
    throw new PauseAtInvalid(source, JSON.stringify(fromConfig));
  }
  return validatePauseStations(fromConfig, source, JSON.stringify(fromConfig));
}

/**
 * Resolve the decision categories a general delegation never decides (REQ-LIB-102):
 * `workflow.always_escalate`, or every category when the key or the config is absent.
 * An invalid value throws rather than narrowing the set silently.
 */
export function resolveAlwaysEscalate(
  config: Pick<ProspecConfig, 'workflow'> | null | undefined,
): AlwaysEscalateCategory[] {
  const value = config?.workflow?.always_escalate;
  if (value === undefined) return [...DEFAULT_ALWAYS_ESCALATE];
  if (!Array.isArray(value)) throw new AlwaysEscalateInvalid(JSON.stringify(value));
  const categories: AlwaysEscalateCategory[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !(ALWAYS_ESCALATE_CATEGORIES as readonly string[]).includes(entry)) {
      throw new AlwaysEscalateInvalid(JSON.stringify(entry));
    }
    if (!categories.includes(entry as AlwaysEscalateCategory)) categories.push(entry as AlwaysEscalateCategory);
  }
  return categories;
}

export interface WorkflowFallback {
  setting: Pick<ProspecConfig, 'workflow'> | null;
  /** Why the pause is assumed rather than read (the file exists but is unreadable or
   *  not YAML), for the caller to disclose; null when the setting was read or is absent. */
  assumedBecause: string | null;
}

/**
 * The workflow settings alone (`pause_at`, `always_escalate`), from a `.prospec.yaml` that
 * failed validation: a schema error in an unrelated field must not silently disable a
 * committed pause or narrow the escalation categories. An absent file has no setting. A
 * file that exists but cannot be read, or is not YAML at all, cannot prove the pause off,
 * so it resolves to every pause station (fail closed) and says why; `PROSPEC_PAUSE_AT`
 * still decides alone, and the categories keep their default.
 */
export async function readWorkflowFallback(cwd?: string): Promise<WorkflowFallback> {
  const assumed = (assumedBecause: string): WorkflowFallback => ({
    setting: { workflow: { pause_at: [...PAUSE_STATIONS] } },
    assumedBecause,
  });
  let raw: string;
  try {
    raw = await fs.promises.readFile(resolveConfigPath(cwd), 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'ENOENT' ? { setting: null, assumedBecause: null } : assumed(`cannot be read (${code ?? 'error'})`);
  }
  let data: { workflow?: { pause_at?: unknown; always_escalate?: unknown } } | null;
  try {
    data = parseYaml(raw);
  } catch {
    return assumed('is not parseable YAML');
  }
  const pauseAt = data?.workflow?.pause_at;
  const alwaysEscalate = data?.workflow?.always_escalate;
  if (pauseAt === undefined && alwaysEscalate === undefined) return { setting: null, assumedBecause: null };
  return {
    setting: {
      workflow: {
        ...(pauseAt === undefined ? {} : { pause_at: pauseAt }),
        ...(alwaysEscalate === undefined ? {} : { always_escalate: alwaysEscalate }),
      },
    },
    assumedBecause: null,
  };
}

function validatePauseStations(entries: readonly unknown[], source: string, raw: string): PauseStation[] {
  const stations: PauseStation[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'string') throw new PauseAtInvalid(source, raw);
    const name = entry.trim();
    if (name === '') continue;
    if (!(PAUSE_STATIONS as readonly string[]).includes(name)) {
      throw new PauseAtInvalid(source, name);
    }
    if (!stations.includes(name as PauseStation)) stations.push(name as PauseStation);
  }
  return stations;
}

/**
 * Resolve the project's test command for `check --record-tests` (REQ-LIB-033).
 *
 * `tech_stack.test_command` wins; otherwise package.json test script falls back
 * to `<package_manager> test` (npm when unset), or auto-detects ecosystem manifests
 * (pytest, cargo test, go test, make test). A project with none returns null.
 */
export function resolveTestCommand(config: ProspecConfig, cwd: string): string | null {
  return resolveProjectTestCommand(config, cwd);
}

/**
 * Resolve the wall-clock cap for `check --record-tests` (REQ-TYPES-116):
 * `tech_stack.test_timeout_ms`, or DEFAULT_TEST_TIMEOUT_MS when the key is absent.
 * An invalid value throws rather than falling back, so a typo never silently
 * restores the cap the setting was meant to lift.
 */
export function resolveTestTimeoutMs(config: ProspecConfig): number {
  const value = config.tech_stack?.test_timeout_ms;
  if (value === undefined) return DEFAULT_TEST_TIMEOUT_MS;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_TEST_TIMEOUT_MS) {
    return value;
  }
  // inspect, not JSON.stringify: YAML `.nan`/`.inf` would print as null and a self-referencing
  // alias would throw a TypeError instead of naming the key.
  throw new TestTimeoutInvalid(inspect(value, { breakLength: Infinity }));
}

/**
 * Resolve the config file path from a given directory (default: cwd).
 */
export function resolveConfigPath(cwd?: string): string {
  return path.resolve(cwd ?? process.cwd(), CONFIG_FILENAME);
}

/**
 * Read and validate .prospec.yaml.
 *
 * - Throws ConfigNotFound if file doesn't exist
 * - Throws ConfigInvalid if schema validation fails (missing project.name, an
 *   out-of-range paths.base_dir, a knowledge.base_path other than the fixed
 *   Knowledge directory) or an artifact directory beside
 *   the file is a symlink or not a directory
 * - Warns on unknown fields but does not block (passthrough schema)
 */
export interface ReadConfigOptions {
  /**
   * `prospec upgrade` only: set a `knowledge.base_path` other than the fixed
   * Knowledge directory aside, validate everything else, then throw
   * `KnowledgePathMigrationRequired` instead of `ConfigInvalid` for it.
   */
  deferKnowledgeBasePath?: boolean;
}

export async function readConfig(cwd?: string, options: ReadConfigOptions = {}): Promise<ProspecConfig> {
  const configPath = resolveConfigPath(cwd);

  let raw: string;
  try {
    raw = await fs.promises.readFile(configPath, 'utf-8');
  } catch {
    throw new ConfigNotFound(configPath);
  }

  return validateConfig(raw, configPath, options);
}

/**
 * Validate a raw YAML string as ProspecConfig.
 *
 * Returns the validated config or throws ConfigInvalid. Given `sourcePath`, it
 * also checks the path topology (`checkConfigPathTopology`) against the
 * directory holding that file; without it only the schema is checked.
 */
export function validateConfig(
  rawYaml: string,
  sourcePath?: string,
  options: ReadConfigOptions = {},
): ProspecConfig {
  const parsed = parseYaml(rawYaml, sourcePath);
  const deferred = options.deferKnowledgeBasePath === true ? deferredKnowledgeBasePath(parsed) : undefined;
  const data = deferred === undefined ? parsed : withoutKnowledgeBasePath(parsed);
  const result = ProspecConfigSchema.safeParse(data);

  if (!result.success) {
    const issues = result.error.issues.map((issue: z.core.$ZodIssue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    });
    // Reported in the same error, so a directory violation does not wait for the
    // unrelated fields to be fixed first.
    const baseDir = usableBaseDir(data);
    const topology = sourcePath !== undefined && baseDir !== undefined
      ? configPathTopologyIssue(baseDir, path.dirname(sourcePath))
      : null;
    if (topology !== null) issues.push(topology);
    throw new ConfigInvalid(issues.join('; '));
  }

  if (sourcePath !== undefined) checkConfigPathTopology(result.data, path.dirname(sourcePath));
  if (deferred !== undefined) throw new KnowledgePathMigrationRequired(deferred.configured, deferred.fixed);
  return result.data;
}

/** A string `knowledge.base_path` naming another directory than the fixed one under a usable base_dir. */
function deferredKnowledgeBasePath(data: unknown): { configured: string; fixed: string } | undefined {
  const baseDir = usableBaseDir(data);
  if (baseDir === undefined || !isRecord(data) || !isRecord(data.knowledge)) return undefined;
  const configured = data.knowledge.base_path;
  if (typeof configured !== 'string' || knowledgeBasePathIssue(configured, baseDir) === null) return undefined;
  return { configured, fixed: `${baseDir}/${KNOWLEDGE_DIR}` };
}

function withoutKnowledgeBasePath(data: unknown): unknown {
  if (!isRecord(data) || !isRecord(data.knowledge)) return data;
  const knowledge = { ...data.knowledge };
  delete knowledge.base_path;
  return { ...data, knowledge };
}

/**
 * Write config to .prospec.yaml using atomic write.
 *
 * If the file already exists, the config is merged into the existing Document in
 * place: only changed values are rewritten, so user comments and formatting on
 * untouched lines survive (e.g. `prospec upgrade` bumping just `version`).
 * Otherwise writes a fresh YAML file.
 */
export async function writeConfig(
  config: ProspecConfig,
  cwd?: string,
): Promise<void> {
  const configPath = resolveConfigPath(cwd);

  let output: string;

  try {
    const existing = await fs.promises.readFile(configPath, 'utf-8');
    // Merge into the existing Document in place so comments/formatting survive.
    const doc = parseYamlDocument(existing, configPath);
    mergeIntoDocument(doc, config as unknown as Record<string, unknown>);
    output = stringifyYamlDocument(doc);
  } catch {
    // File doesn't exist or can't be read — write fresh
    const { stringify } = await import('yaml');
    output = stringify(config);
  }

  await atomicWrite(configPath, output);
}
