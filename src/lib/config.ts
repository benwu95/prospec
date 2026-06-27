import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { ProspecConfigSchema, DEFAULT_ARTIFACT_LANGUAGE, DEFAULT_BASE_DIR } from '../types/config.js';
import type { ProspecConfig } from '../types/config.js';
import { ConfigNotFound, ConfigInvalid } from '../types/errors.js';
import { atomicWrite } from './fs-utils.js';
import { parseYaml, parseYamlDocument, stringifyYamlDocument, mergeIntoDocument } from './yaml-utils.js';

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
 * Whether the given artifact language is the default English — compared
 * case-insensitively, since the value is free-form user input ("english").
 */
export function isDefaultArtifactLanguage(language: string): boolean {
  return language.trim().toLowerCase() === DEFAULT_ARTIFACT_LANGUAGE.toLowerCase();
}

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
