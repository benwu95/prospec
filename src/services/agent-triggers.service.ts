import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  readConfig,
  resolveArtifactLanguage,
  isDefaultArtifactLanguage,
} from '../lib/config.js';
import { atomicWrite } from '../lib/fs-utils.js';
import {
  parseYaml,
  parseYamlDocument,
  stringifyYamlDocument,
} from '../lib/yaml-utils.js';
import { ProspecConfigSchema } from '../types/config.js';
import { SKILL_DEFINITIONS } from '../types/skill.js';
import { ConfigInvalid, PrerequisiteError } from '../types/errors.js';
import {
  computeUnlocalizedSkills,
  type UnlocalizedSkill,
} from './trigger-localization.js';

export interface AgentTriggersOptions {
  /** Working directory (defaults to process.cwd()). */
  cwd?: string;
}

export interface AgentTriggersResult {
  /** Resolved artifact language (English when `.prospec.yaml` sets none). */
  artifactLanguage: string;
  /** Whether the artifact language is the default English (no localization needed). */
  isEnglish: boolean;
  /** Skills still lacking a native-language `skill_triggers` entry, with English baselines. */
  missing: UnlocalizedSkill[];
}

/**
 * Compute the trigger-localization scaffold data for `prospec agent triggers`:
 * the fill-missing skill set (baselines sourced from SKILL_DEFINITIONS, never
 * reverse-derived from a deployed SKILL.md) plus the resolved artifact language.
 *
 * The CLI formatter turns a non-empty gap under a non-English language into a
 * paste-ready `skill_triggers:` YAML scaffold; English or an already-complete
 * project renders an informational message instead of a misleading scaffold.
 */
export async function execute(
  options: AgentTriggersOptions,
): Promise<AgentTriggersResult> {
  const config = await readConfig(options.cwd);
  const artifactLanguage = resolveArtifactLanguage(config);
  return {
    artifactLanguage,
    isEnglish: isDefaultArtifactLanguage(artifactLanguage),
    missing: computeUnlocalizedSkills(config),
  };
}

// --- write-back mode (`prospec agent triggers --write <file>`) ---

export interface AgentTriggersWriteOptions {
  cwd?: string;
  /** Path to the translated scaffold (a `skill_triggers:` YAML mapping). */
  from: string;
}

export interface AgentTriggersWriteResult {
  /** Skills whose triggers were inserted this run. */
  written: string[];
  /** Skills skipped because a non-empty entry already exists (never overwritten). */
  skippedExisting: string[];
  configPath: string;
}

/**
 * Fill-missing write-back of a translated `skill_triggers` scaffold into
 * `.prospec.yaml` — the mechanical half of trigger localization (translation
 * itself is the skill's judgment, supplied via the input file).
 *
 * Minimal in-place edit: only MISSING keys are inserted; existing entries,
 * comments, and field order are untouched (yaml Document surgery). The mutated
 * document is re-validated against `ProspecConfigSchema` BEFORE any byte
 * reaches disk — a failed validation leaves the file exactly as it was, which
 * is the snapshot/restore guarantee without a restore step.
 */
export async function executeWrite(
  options: AgentTriggersWriteOptions,
): Promise<AgentTriggersWriteResult> {
  const cwd = options.cwd ?? process.cwd();
  const configPath = path.join(cwd, '.prospec.yaml');

  if (!fs.existsSync(options.from)) {
    throw new PrerequisiteError(
      `Scaffold file not found: ${options.from}`,
      'Run `prospec agent triggers` first, translate the emitted scaffold, and pass that file',
    );
  }
  const rawInput = parseYaml<unknown>(fs.readFileSync(options.from, 'utf-8'), options.from);
  const triggers = extractTriggersMapping(rawInput, options.from);

  const knownSkills = new Set(SKILL_DEFINITIONS.map((s) => s.name));
  const unknown = Object.keys(triggers).filter((k) => !knownSkills.has(k));
  if (unknown.length > 0) {
    throw new PrerequisiteError(
      `Unknown skill name(s) in scaffold: ${unknown.join(', ')}`,
      'skill_triggers keys must match shipped skill names (see `prospec agent triggers` output)',
    );
  }

  const config = await readConfig(cwd);
  const existing = config.skill_triggers ?? {};
  const doc = parseYamlDocument(fs.readFileSync(configPath, 'utf-8'), configPath);

  const written: string[] = [];
  const skippedExisting: string[] = [];
  for (const [skill, words] of Object.entries(triggers)) {
    if ((existing[skill] ?? []).length > 0) {
      skippedExisting.push(skill);
      continue;
    }
    doc.setIn(['skill_triggers', skill], doc.createNode(words));
    written.push(skill);
  }

  if (written.length > 0) {
    const serialized = stringifyYamlDocument(doc);
    const readBack = ProspecConfigSchema.safeParse(parseYaml(serialized, configPath));
    if (!readBack.success) {
      throw new ConfigInvalid(
        `write-back would corrupt .prospec.yaml — nothing written (${readBack.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')})`,
      );
    }
    await atomicWrite(configPath, serialized);
  }

  return { written, skippedExisting, configPath: '.prospec.yaml' };
}

/** Accept the scaffold either wrapped (`skill_triggers: {…}`) or as a bare mapping. */
function extractTriggersMapping(
  input: unknown,
  fromPath: string,
): Record<string, string[]> {
  const candidate =
    input !== null &&
    typeof input === 'object' &&
    'skill_triggers' in (input as Record<string, unknown>)
      ? (input as Record<string, unknown>).skill_triggers
      : input;
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new PrerequisiteError(
      `Scaffold ${fromPath} is not a skill_triggers mapping`,
      'Expected `skill_triggers:` followed by `<skill-name>: [word, …]` entries',
    );
  }
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      value.some((w) => typeof w !== 'string' || w.trim() === '')
    ) {
      throw new PrerequisiteError(
        `Scaffold entry '${key}' must be a non-empty array of non-empty strings`,
        'Translate the English baselines into the artifact language — do not leave placeholders',
      );
    }
    result[key] = value as string[];
  }
  return result;
}
