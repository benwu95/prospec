import { existsSync } from 'node:fs';
import path from 'node:path';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { atomicWrite } from '../lib/fs-utils.js';
import { loadModuleMap } from '../lib/knowledge-reader.js';
import { renderTemplate } from '../lib/template.js';
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
  collectTaskStates,
} from '../lib/drift-sources.js';
import { DRIFT_REPORT_FILENAME, type DriftReport } from '../types/drift-report.js';

export interface CheckOptions {
  cwd?: string;
  /** Write the machine-readable report to prospec-report.json. */
  json?: boolean;
  /** Scaffold .github/workflows/prospec-check.yml instead of running checks. */
  initCi?: boolean;
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

export const CI_WORKFLOW_PATH = '.github/workflows/prospec-check.yml';

/**
 * Execute the drift check — thin orchestration only (REQ-SERVICES-027):
 * collectors gather repo facts, the pure evaluators in lib/drift-checker
 * produce the report, and this service handles config resolution and the
 * optional report/workflow writes.
 */
export async function execute(options: CheckOptions): Promise<CheckResult | InitCiResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);

  if (options.initCi) {
    return initCiWorkflow(cwd, config.tech_stack?.package_manager);
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
