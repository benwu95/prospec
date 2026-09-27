import * as path from 'node:path';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { readContainedText } from '../lib/knowledge-reader.js';
import {
  normalizeStationName,
  sliceConstitution,
  sliceConstitutionRule,
  type ConstitutionRuleRef,
  type ConstitutionSliceResult,
} from '../lib/constitution-slice.js';
import { estimateTokens } from '../lib/token-accounting.js';
import { PrerequisiteError } from '../types/errors.js';
import { SDD_STATIONS, type SddStation } from '../types/status.js';

export type { ConstitutionFailOpenReason } from '../lib/constitution-slice.js';

/**
 * `prospec constitution show` — one station's Constitution slice, or one rule
 * (REQ-SERVICES-122). The service reads the file and measures; what the slice
 * holds is decided by `lib/constitution-slice` from the rules' own `stations:`
 * declarations, never here.
 */

export interface ConstitutionShowOptions {
  cwd?: string;
  station?: string;
  rule?: string;
}

interface ShowBase {
  /** Repo-relative path of the Constitution that was read. */
  path: string;
  /** `estimateTokens` of the printed text and of the whole file. */
  tokens: { slice: number; full: number };
}

export type ConstitutionShowResult =
  | (ShowBase & { selector: 'station'; station: SddStation; result: ConstitutionSliceResult })
  | (ShowBase & { selector: 'rule'; text: string; rules: ConstitutionRuleRef[] });

export async function execute(options: ConstitutionShowOptions): Promise<ConstitutionShowResult> {
  const cwd = options.cwd ?? process.cwd();
  const hasStation = options.station !== undefined;
  const hasRule = options.rule !== undefined;
  if (hasStation === hasRule) {
    throw new PrerequisiteError(
      'exactly one of --station or --rule',
      'Pass --station <name> for a station slice, or --rule <name> for one rule',
    );
  }

  const config = await readConfig(cwd);
  const { constitutionPath } = resolveBasePaths(config, cwd);
  const relPath = path.relative(cwd, constitutionPath).replace(/\\/g, '/');
  // Contained against the repository, as the drift collector reads it: a
  // `base_dir` escaping the repo must not turn this command into a file oracle.
  const markdown = readContainedText(constitutionPath, cwd);
  if (markdown === null) {
    throw new PrerequisiteError(
      `Constitution not readable inside the repository: ${relPath}`,
      'Run `prospec init` to seed one, or fix paths.base_dir in .prospec.yaml',
    );
  }
  const full = estimateTokens(markdown);

  if (options.station !== undefined) {
    const station = normalizeStationName(options.station);
    if (station === null) {
      throw new PrerequisiteError(
        `unknown station "${options.station}"`,
        `Valid stations: ${SDD_STATIONS.join(', ')}`,
      );
    }
    const result = sliceConstitution(markdown, { station });
    return { selector: 'station', station, path: relPath, result, tokens: { slice: estimateTokens(result.text), full } };
  }

  const name = options.rule ?? '';
  const result = sliceConstitutionRule(markdown, name);
  if (result.kind === 'miss') {
    throw new PrerequisiteError(
      `no Constitution rule named "${name}" in ${relPath}`,
      result.available.length === 0
        ? 'The Constitution declares no rules under ## Principles'
        : `Available rules: ${result.available.join(', ')}`,
    );
  }
  return {
    selector: 'rule',
    path: relPath,
    text: result.text,
    rules: result.rules,
    tokens: { slice: estimateTokens(result.text), full },
  };
}
