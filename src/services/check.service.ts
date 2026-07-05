import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { atomicWrite } from '../lib/fs-utils.js';
import { loadModuleMap } from '../lib/knowledge-reader.js';
import { renderTemplate } from '../lib/template.js';
import { parseYamlDocument, stringifyYamlDocument } from '../lib/yaml-utils.js';
import {
  buildDependencyRules,
  constitutionFallbackModuleMap,
  constitutionFallbackRules,
  runChecks,
} from '../lib/drift-checker.js';
import {
  collectFeatureMapGovernance,
  collectGitTimestamps,
  collectImportEdges,
  collectMarkdownLinks,
  collectReadmeCounts,
  collectReqDefinitions,
  collectReqReferences,
  collectReviewProvenance,
  collectTaskStates,
  computeChangeDigest,
} from '../lib/drift-sources.js';
import { resolveChange } from './change-resolver.js';
import { DRIFT_REPORT_FILENAME, type DriftReport } from '../types/drift-report.js';

export interface CheckOptions {
  cwd?: string;
  /** Write the machine-readable report to prospec-report.json. */
  json?: boolean;
  /** Scaffold .github/workflows/prospec-check.yml instead of running checks. */
  initCi?: boolean;
  /** Record the active change's review baseline (digest) instead of running checks. */
  recordReview?: boolean;
  /** Disambiguate which change `--record-review` targets when several are in flight. */
  change?: string;
}

export interface CheckResult {
  kind: 'report';
  report: DriftReport;
  /** True when any check failed — the CLI maps strict ∧ hasFail to exit 1. */
  hasFail: boolean;
  /** Absolute report path when --json was requested. */
  reportPath?: string;
}

export interface InitCiResult {
  kind: 'init-ci';
  workflowPath: string;
  created: boolean;
}

export interface RecordReviewResult {
  kind: 'record-review';
  /** The change whose review baseline was recorded. */
  change: string;
  /** False when skipped honestly (e.g. not a git repo) — no fake digest written. */
  recorded: boolean;
  reason?: string;
}

export const CI_WORKFLOW_PATH = '.github/workflows/prospec-check.yml';

/**
 * Execute the drift check — thin orchestration only (REQ-SERVICES-027):
 * collectors gather repo facts, the pure evaluators in lib/drift-checker
 * produce the report, and this service handles config resolution and the
 * optional report/workflow writes.
 */
export async function execute(
  options: CheckOptions,
): Promise<CheckResult | InitCiResult | RecordReviewResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);

  if (options.initCi) {
    return initCiWorkflow(cwd, config.tech_stack?.package_manager);
  }

  if (options.recordReview) {
    return recordReviewProvenance(cwd, options.change);
  }

  const paths = resolveBasePaths(config, cwd);
  const featuresDir = path.join(paths.specsPath, 'features');
  const markdownRoots = [paths.specsPath, paths.knowledgePath, paths.baseDir];

  const moduleMap = loadModuleMap(paths.knowledgePath, cwd);
  const attributionMap = moduleMap ?? constitutionFallbackModuleMap();
  const dependencyRules = moduleMap
    ? buildDependencyRules(moduleMap)
    : constitutionFallbackRules();

  // module-map-keyed sources (health, declared-count veracity) share one honest
  // degrade when the map is absent — the constitution fallback is a direction
  // ruleset, not a knowledge claim, so facts for undeclared boundaries would be fabricated.
  const moduleMapMissing = <T extends object>(extra: T) =>
    ({
      available: false as const,
      reason: 'source unavailable: module-map.yaml not found — module boundaries unknown',
      ...extra,
    });

  const report = runChecks({
    reqDefinitions: collectReqDefinitions(featuresDir),
    reqReferences: collectReqReferences(markdownRoots, cwd),
    links: collectMarkdownLinks(markdownRoots, cwd),
    importEdges: collectImportEdges(cwd, attributionMap),
    dependencyRules,
    timestamps: moduleMap
      ? collectGitTimestamps(cwd, moduleMap, paths.knowledgePath)
      : moduleMapMissing({ modules: [] }),
    tasks: collectTaskStates(cwd),
    // feature-map.yaml is the optional index; the collector reports it
    // unavailable when absent, so both governance checks skip (never a fabricated finding).
    featureMapGovernance: collectFeatureMapGovernance(
      featuresDir,
      paths.knowledgePath,
      cwd,
      attributionMap,
    ),
    readmeCounts: moduleMap
      ? collectReadmeCounts(cwd, paths.knowledgePath, moduleMap)
      : moduleMapMissing({ claims: [] }),
    reviewProvenance: collectReviewProvenance(cwd),
    generatedAt: new Date().toISOString(),
  });

  const result: CheckResult = {
    kind: 'report',
    report,
    hasFail: report.summary.fail_count > 0,
  };

  if (options.json) {
    const reportPath = path.resolve(cwd, DRIFT_REPORT_FILENAME);
    await atomicWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    result.reportPath = reportPath;
  }

  return result;
}

/** Render the hardened CI workflow template — rerun-safe, never overwrites. */
async function initCiWorkflow(cwd: string, packageManager?: string): Promise<InitCiResult> {
  const workflowPath = path.resolve(cwd, CI_WORKFLOW_PATH);
  if (existsSync(workflowPath)) {
    return { kind: 'init-ci', workflowPath, created: false };
  }
  const usePnpm = packageManager === 'pnpm';
  const content = renderTemplate('init/prospec-check.yml.hbs', {
    use_pnpm: usePnpm,
    install_cmd: usePnpm ? 'pnpm install --frozen-lockfile' : 'npm ci',
    check_cmd: usePnpm
      ? 'pnpm exec prospec check --strict --json'
      : 'npx prospec check --strict --json',
  });
  await atomicWrite(workflowPath, content);
  return { kind: 'init-ci', workflowPath, created: true };
}

/**
 * Record the active change's review baseline (REQ-SERVICES-062). Run by
 * `/prospec-review` at loop convergence so the digest is code-computed, not
 * hand-derived. Writes `review_provenance` into metadata.yaml with the
 * comment-preserving Document round-trip; a non-git repo yields no digest, so
 * it honestly skips rather than writing a fake baseline.
 */
async function recordReviewProvenance(
  cwd: string,
  explicitChange?: string,
): Promise<RecordReviewResult> {
  // quiet=true keeps `check` non-interactive; with several in-flight changes it
  // errors with "use --change <name>", so --change is the disambiguation path.
  const change = await resolveChange(cwd, explicitChange, true, 'Which change to record the review for?');
  const metadataPath = path.join(cwd, '.prospec', 'changes', change, 'metadata.yaml');
  if (!existsSync(metadataPath)) {
    // resolveChange only guarantees the dir exists — honest skip, no fake baseline.
    return { kind: 'record-review', change, recorded: false, reason: 'metadata.yaml not found' };
  }
  const digest = computeChangeDigest(cwd);
  if (digest === null) {
    return { kind: 'record-review', change, recorded: false, reason: 'not a git repository' };
  }
  const doc = parseYamlDocument(readFileSync(metadataPath, 'utf-8'), metadataPath);
  doc.set('review_provenance', doc.createNode({ digest, date: new Date().toISOString().slice(0, 10) }));
  await atomicWrite(metadataPath, stringifyYamlDocument(doc));
  return { kind: 'record-review', change, recorded: true };
}
