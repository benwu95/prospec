import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import {
  ProspecConfigSchema,
  DEFAULT_ARTIFACT_LANGUAGE,
  DEFAULT_BASE_DIR,
  DEFAULT_KNOWLEDGE_TOKEN_BUDGET,
  isDefaultArtifactLanguage,
} from '../types/config.js';
import type { ProspecConfig, KnowledgeSizeBudget, TokenBudget } from '../types/config.js';
import { ConfigNotFound, ConfigInvalid, PrerequisiteError } from '../types/errors.js';
import { atomicWrite } from './fs-utils.js';
import { parseYaml, parseYamlDocument, stringifyYamlDocument, mergeIntoDocument } from './yaml-utils.js';
import { resolveProjectTestCommand } from './project-runner.js';
import { collapseWhitespace } from './text-lines.js';

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
 * Returns absolute paths when cwd is provided.
 */
export function resolveBasePaths(config: ProspecConfig, cwd: string): BasePaths {
  const baseDir = config.paths?.base_dir ?? DEFAULT_BASE_DIR;
  const knowledgePath = config.knowledge?.base_path ?? path.join(baseDir, 'ai-knowledge');
  const constitutionPath = path.join(baseDir, 'CONSTITUTION.md');
  const specsPath = path.join(baseDir, 'specs');

  return {
    baseDir: path.resolve(cwd, baseDir),
    knowledgePath: path.resolve(cwd, knowledgePath),
    constitutionPath: path.resolve(cwd, constitutionPath),
    specsPath: path.resolve(cwd, specsPath),
  };
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

/**
 * Assert an executor label against the vocabulary `.prospec.yaml` declares — the ONE
 * rule both provenance writers (`verify record`, `check --record-review`) call, so
 * the two stations cannot drift into different refusals. No-op when the project
 * declares no `executors` (every value stays a free string) or when no executor
 * was supplied; otherwise a trimmed value outside the list is refused with the
 * declared labels listed. prospec knows no model: the labels are the project's own.
 */
export function assertExecutorLabel(config: ProspecConfig, executor: string | undefined): void {
  const declared = config.executors;
  if (declared === undefined || executor === undefined) return;
  const label = normalizeExecutorLabel(executor);
  if (declared.some((d) => normalizeExecutorLabel(d) === label)) return;
  throw new PrerequisiteError(
    `executor "${label}" is not a declared label`,
    `Declared labels (.prospec.yaml executors): ${declared.map(normalizeExecutorLabel).join(', ')}. Use one of them, or omit --executor`,
  );
}

/**
 * The ONE normalization every executor label passes through — at both write paths
 * (so `review_provenance.executor` and a verify dimension's `executor` land as the
 * same bytes for the same input) and at the `learn stats` read path (archive
 * metadata is untrusted: a label carrying a line break must not forge a report
 * line). Whitespace runs, line breaks included, collapse to one space; ends trimmed.
 */
export function normalizeExecutorLabel(value: string): string {
  return collapseWhitespace(value);
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
    const override = tb[key];
    if (override !== undefined) resolved[key] = override;
  }
  return resolved;
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
 * Resolve the config file path from a given directory (default: cwd).
 */
export function resolveConfigPath(cwd?: string): string {
  return path.resolve(cwd ?? process.cwd(), CONFIG_FILENAME);
}

/**
 * Read and validate .prospec.yaml.
 *
 * - Throws ConfigNotFound if file doesn't exist
 * - Throws ConfigInvalid if schema validation fails (missing project.name)
 * - Warns on unknown fields but does not block (passthrough schema)
 */
export async function readConfig(cwd?: string): Promise<ProspecConfig> {
  const configPath = resolveConfigPath(cwd);

  let raw: string;
  try {
    raw = await fs.promises.readFile(configPath, 'utf-8');
  } catch {
    throw new ConfigNotFound(configPath);
  }

  return validateConfig(raw, configPath);
}

/**
 * Validate a raw YAML string as ProspecConfig.
 *
 * Returns the validated config or throws ConfigInvalid.
 */
export function validateConfig(
  rawYaml: string,
  sourcePath?: string,
): ProspecConfig {
  const data = parseYaml(rawYaml, sourcePath);
  const result = ProspecConfigSchema.safeParse(data);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue: z.core.$ZodIssue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join('; ');
    throw new ConfigInvalid(issues);
  }

  return result.data;
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
