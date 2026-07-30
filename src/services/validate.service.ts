import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PrerequisiteError } from '../types/errors.js';
import type { ValidateKind } from '../types/station.js';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import {
  validateSlug,
  validateBackfillDraft,
  validatePromoteScaffold,
  validateDesignSpec,
  coverageGap,
  type ValidationFinding,
  type BackfillDraftFacts,
  type DesignSpecFacts,
  type TrustZoneProbe,
} from '../lib/artifact-validators.js';
import { readChangeMetadata } from '../lib/change-metadata.js';
import { loadFeatureMap, listFeatureSpecs } from '../lib/knowledge-reader.js';
import { resolveChange } from './change-resolver.js';

export interface ValidateOptions {
  kind: ValidateKind;
  /** slug: the name itself; backfill-draft / design-spec: an explicit file path. */
  target?: string;
  /** Change providing default artifact paths (backfill/promote/design kinds). */
  change?: string;
  cwd?: string;
  quiet?: boolean;
}

export interface ValidateResult {
  kind: ValidateKind;
  target: string;
  ok: boolean;
  findings: ValidationFinding[];
  /** Structural facts for the subset kinds — the skill's judgment inputs. */
  facts?: BackfillDraftFacts | DesignSpecFacts;
}

/**
 * `prospec validate <kind>` — machine verdicts for the artifact checks the
 * skills used to narrate by hand. `slug` / `promote-scaffold` are complete
 * verdicts; `backfill-draft` / `design-spec` report the structural subset
 * (sections, headers, raw NC facts) and the skill applies the semantic rules
 * (>50% denominator + heuristic-WHY exemption, component-set coverage) on top.
 */
export async function execute(options: ValidateOptions): Promise<ValidateResult> {
  const cwd = options.cwd ?? process.cwd();

  if (options.kind === 'slug') {
    if (!options.target) {
      throw new PrerequisiteError(
        'validate slug needs the candidate name as its argument',
        'Example: `prospec validate slug user-profile`',
      );
    }
    const verdict = validateSlug(options.target);
    return { kind: 'slug', target: options.target, ...verdict };
  }

  if (options.kind === 'promote-scaffold') {
    const changeName = await resolveChange(
      cwd,
      options.change ?? options.target,
      options.quiet,
      'Which change is the promotion scaffold?',
    );
    const changeDir = path.join(cwd, '.prospec', 'changes', changeName);
    let metadata: { scale?: string; status?: string; relatedModules?: string[] } | undefined;
    try {
      const read = readChangeMetadata(path.join(changeDir, 'metadata.yaml'), changeName);
      metadata = {
        scale: read.metadata.scale,
        status: read.metadata.status,
        relatedModules: read.metadata.related_modules ?? [],
      };
    } catch {
      metadata = undefined;
    }
    const verdict = validatePromoteScaffold({
      slug: changeName,
      hasBackfillDraft: fs.existsSync(path.join(changeDir, 'backfill-draft.md')),
      hasProposal: fs.existsSync(path.join(changeDir, 'proposal.md')),
      hasPlan: fs.existsSync(path.join(changeDir, 'plan.md')),
      hasTasks: fs.existsSync(path.join(changeDir, 'tasks.md')),
      metadata,
      trustZoneProbe: await collectTrustZoneProbe(cwd),
    });
    return { kind: 'promote-scaffold', target: changeName, ...verdict };
  }

  // backfill-draft / design-spec: explicit path, or the change's default artifact.
  const defaultFile =
    options.kind === 'backfill-draft' ? 'backfill-draft.md' : 'design-spec.md';
  let targetPath = options.target;
  if (!targetPath) {
    const changeName = await resolveChange(
      cwd,
      options.change,
      options.quiet,
      `Which change's ${defaultFile} should be validated?`,
    );
    targetPath = path.join('.prospec', 'changes', changeName, defaultFile);
  }
  const absolute = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);
  if (!fs.existsSync(absolute)) {
    throw new PrerequisiteError(
      `${options.kind} target not found: ${targetPath}`,
      'Pass the artifact path explicitly, or name the change that owns it via --change',
    );
  }
  const content = fs.readFileSync(absolute, 'utf-8');
  const report =
    options.kind === 'backfill-draft'
      ? validateBackfillDraft(content)
      : validateDesignSpec(content);
  const findings = [...report.findings];
  if (options.kind === 'backfill-draft') {
    // WHAT-layer coverage scoping: features the map declares but no Feature
    // Spec covers yet. Both sets are machine-available, so the set difference
    // is the CLI's; which gap to backfill next stays the skill's call.
    findings.push(...(await collectCoverageGapFindings(cwd)));
  }
  return {
    kind: options.kind,
    target: targetPath,
    ok: report.ok,
    findings,
    facts: report.facts,
  };
}

/** `feature-map features − specs/features/*.md` — an INFO signal, never a FAIL. */
async function collectCoverageGapFindings(cwd: string): Promise<ValidationFinding[]> {
  let knowledgePath: string;
  let specsPath: string;
  try {
    const config = await readConfig(cwd);
    const paths = resolveBasePaths(config, cwd);
    knowledgePath = paths.knowledgePath;
    specsPath = paths.specsPath;
  } catch {
    return [];
  }
  let featureMap;
  try {
    featureMap = loadFeatureMap(knowledgePath);
  } catch (err) {
    return [
      {
        level: 'INFO',
        message: `coverage scoping unavailable: ${err instanceof Error ? err.message : String(err)}`,
      },
    ];
  }
  if (featureMap === null) return [];
  const gap = coverageGap(
    featureMap.features.map((f) => f.feature),
    listFeatureSpecs(path.join(specsPath, 'features')),
  );
  return [
    {
      level: 'INFO',
      message:
        gap.length === 0
          ? 'coverage scoping: every feature-map feature has a Feature Spec'
          : `coverage scoping: ${gap.length} feature-map feature(s) without a Feature Spec — ${gap.join(', ')}`,
    },
  ];
}

/**
 * Uncommitted paths under `specs/features/` (the trust zone promotion must
 * never write). A probe that cannot run (unreadable config, git failure —
 * a held index.lock, dubious ownership, git absent) is reported as
 * `unavailable` with its reason, never as an empty dirty list: "could not
 * check" must not silently pass the promote-scaffold trust-zone gate.
 */
async function collectTrustZoneProbe(cwd: string): Promise<TrustZoneProbe> {
  let specsPath: string;
  try {
    const config = await readConfig(cwd);
    specsPath = resolveBasePaths(config, cwd).specsPath;
  } catch (err) {
    return { unavailable: `config unreadable: ${err instanceof Error ? err.message : String(err)}` };
  }
  const featuresDir = path.join(specsPath, 'features');
  const rel = path.relative(cwd, featuresDir);
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--', rel], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return {
      dirty: out
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .map((l) => l.replace(/^\S+\s+/, '')),
    };
  } catch (err) {
    return { unavailable: `git status failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
