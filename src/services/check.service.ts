import { existsSync } from 'node:fs';
import path from 'node:path';
import { readChangeMetadata, writeChangeMetadataDoc } from '../lib/change-metadata.js';
import {
  readConfig,
  resolveBasePaths,
  resolveKnowledgeTokenBudget,
  resolveTestCommand,
} from '../lib/config.js';
import { atomicWrite } from '../lib/fs-utils.js';
import { loadModuleMap } from '../lib/knowledge-reader.js';
import { renderTemplate } from '../lib/template.js';
import { resolveLanguageScope } from '../lib/language-policy.js';
import type { ProspecConfig } from '../types/config.js';
import {
  buildDependencyRules,
  constitutionFallbackModuleMap,
  constitutionFallbackRules,
  runChecks,
} from '../lib/drift-checker.js';
import {
  collectArtifactLanguage,
  collectConstitutionRules,
  collectFeatureMapGovernance,
  collectGitTimestamps,
  collectImportEdges,
  collectKnowledgeSize,
  collectMarkdownLinks,
  collectMcpReadmeCounts,
  collectMetadataCompleteness,
  collectQualityLedger,
  collectReqDefinitions,
  collectSpecCounters,
  collectReqReferences,
  collectReviewProvenance,
  collectTaskStates,
  collectTestProvenance,
  computeChangeDigest,
  isGitWorkTree,
} from '../lib/drift-sources.js';
import { aggregateEscapedDefects } from '../lib/escaped-defects.js';
import { runTestCommand } from '../lib/test-runner.js';
import { resolveChange } from './change-resolver.js';
import { DRIFT_REPORT_FILENAME, type DriftReport } from '../types/drift-report.js';
import {
  ESCAPED_DEFECT_REPORT_FILENAME,
  type EscapedDefectReport,
} from '../types/escaped-defect.js';

export interface CheckOptions {
  cwd?: string;
  /** Write the machine-readable report to prospec-report.json. */
  json?: boolean;
  /** Scaffold .github/workflows/prospec-check.yml instead of running checks. */
  initCi?: boolean;
  /** Record the active change's review baseline (digest) instead of running checks. */
  recordReview?: boolean;
  /** Run the project's test command and record its outcome instead of running checks. */
  recordTests?: boolean;
  /** Aggregate per-gate escaped-defect rate instead of running checks. */
  escapedDefects?: boolean;
  /** Disambiguate which change `--record-review`/`--record-tests` targets when several are in flight. */
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

export interface RecordTestsResult {
  kind: 'record-tests';
  /** The change whose test baseline was recorded. */
  change: string;
  /** False when skipped honestly (no test command, not a git repo, timeout). */
  recorded: boolean;
  reason?: string;
  /** The command that ran, when one did. */
  command?: string;
  /** Its exit code — recorded even when non-zero; a failing suite IS the fact. */
  exitCode?: number | null;
  /** True when the digest changed across the run — an artifact the suite wrote, or
   *  a real edit landing mid-run. Surfaced so the latter is never silently absorbed. */
  treeChangedDuringRun?: boolean;
}

export interface EscapedDefectsResult {
  kind: 'escaped-defects';
  report: EscapedDefectReport;
  /** Absolute report path when --json was requested. */
  reportPath?: string;
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
): Promise<
  CheckResult | InitCiResult | RecordReviewResult | RecordTestsResult | EscapedDefectsResult
> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);

  if (options.initCi) {
    return initCiWorkflow(cwd, config.tech_stack?.package_manager);
  }

  if (options.recordReview) {
    return recordReviewProvenance(cwd, options.change);
  }

  if (options.recordTests) {
    return recordTestProvenance(cwd, config, options.change);
  }

  if (options.escapedDefects) {
    return aggregateEscapedDefectReport(cwd, options.json);
  }

  const paths = resolveBasePaths(config, cwd);
  const featuresDir = path.join(paths.specsPath, 'features');
  const markdownRoots = [paths.specsPath, paths.knowledgePath, paths.baseDir];

  // One digest per run, shared by both provenance collectors: it is the most
  // expensive fact the engine gathers and the two can never disagree within a run.
  const currentDigest = computeChangeDigest(cwd);

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
    mcpReadmeCounts: moduleMap
      ? collectMcpReadmeCounts(cwd, paths.knowledgePath, moduleMap)
      : moduleMapMissing({ claims: [] }),
    reviewProvenance: collectReviewProvenance(cwd, currentDigest),
    metadataCompleteness: collectMetadataCompleteness(cwd),
    knowledgeSize: collectKnowledgeSize(
      cwd,
      paths.baseDir,
      paths.knowledgePath,
      resolveKnowledgeTokenBudget(config),
    ),
    // The resolved command decides whether this check can apply at all — a project
    // with none skips honestly instead of failing a gate it can never satisfy.
    testProvenance: collectTestProvenance(cwd, resolveTestCommand(config, cwd), currentDigest),
    // The Constitution path comes from the canonical resolver, never re-derived here.
    constitutionRules: collectConstitutionRules(paths.constitutionPath, cwd),
    // Scan set comes from the SAME resolver the Constitution rule is generated
    // from, and is a deliberate subset of it — it enforces less than the rule
    // states but can never contradict it.
    artifactLanguage: collectArtifactLanguage(cwd, resolveLanguageScope(config, cwd)),
    // Same resolved features directory the REQ-definition and feature-map
    // collectors read — the counters are a fact about those very files.
    specCounters: collectSpecCounters(featuresDir, cwd),
    generatedAt: new Date().toISOString(),
  });
  // Stamp the code state the verdicts describe — `verify record` refuses a
  // report whose digest no longer matches the tree (freshness guard).
  report.change_digest = currentDigest;

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
    return { kind: 'record-review', change, recorded: false, reason: digestFailureReason(cwd) };
  }
  const { doc } = readChangeMetadata(metadataPath, change);
  doc.set('review_provenance', doc.createNode({ digest, date: new Date().toISOString().slice(0, 10) }));
  await writeChangeMetadataDoc(metadataPath, doc, change);
  return { kind: 'record-review', change, recorded: true };
}

/** A null digest has two very different causes — misreporting a capture failure
 *  as "not a git repository" sends the developer to the wrong fix (issue #103). */
function digestFailureReason(cwd: string): string {
  return isGitWorkTree(cwd)
    ? 'could not compute the change digest (a git capture failed)'
    : 'not a git repository';
}

/**
 * Run the project's test command and record the outcome (REQ-SERVICES-068). The
 * ONE place `check` executes a project command, and it is flag-gated — the pure
 * check path stays read-only and deterministic, so the report a CI run produces is
 * still reproducible without ever spawning a suite.
 *
 * A non-zero exit code IS recorded: the fact verify must see is "the suite ran and
 * failed", and `evaluateTestProvenance` turns that into the FAIL. Only cases where
 * nothing trustworthy happened (no command, not a git repo, timeout) skip, and they
 * write nothing rather than half a record.
 */
async function recordTestProvenance(
  cwd: string,
  config: ProspecConfig,
  explicitChange?: string,
): Promise<RecordTestsResult> {
  const change = await resolveChange(cwd, explicitChange, true, 'Which change to record the test run for?');
  const metadataPath = path.join(cwd, '.prospec', 'changes', change, 'metadata.yaml');
  if (!existsSync(metadataPath)) {
    return { kind: 'record-tests', change, recorded: false, reason: 'metadata.yaml not found' };
  }
  const command = resolveTestCommand(config, cwd);
  if (command === null) {
    return {
      kind: 'record-tests',
      change,
      recorded: false,
      reason: 'no test command — set tech_stack.test_command in .prospec.yaml',
    };
  }
  // Every precondition is checked BEFORE the suite runs — a 15-minute run that is
  // then discarded (or that dies on a schema error) is the worst possible outcome.
  // The pre-run digest doubles as the git-repo guard; the metadata read here is
  // pure fail-fast validation (it throws on a schema error) — the document it
  // returns is deliberately NOT the one written back.
  const before = computeChangeDigest(cwd);
  if (before === null) {
    return { kind: 'record-tests', change, recorded: false, reason: digestFailureReason(cwd) };
  }
  readChangeMetadata(metadataPath, change);

  const run = runTestCommand(cwd, command);
  if (run.timed_out || run.exit_code === null) {
    return {
      kind: 'record-tests',
      change,
      recorded: false,
      command: run.command,
      reason: run.timed_out
        ? `test run timed out after ${run.timeout_ms} ms`
        : run.signal !== undefined
          ? `test run killed by ${run.signal}`
          : (run.error ?? 'test run produced no exit code'),
    };
  }

  // Record the POST-run digest. A suite that writes an untracked artifact (junit
  // xml, coverage summary, a fresh snapshot) changes the tree it just ran against;
  // recording the pre-run value would make the very next check report "stale" and,
  // whenever the artifact's bytes vary per run, never converge. Hashing after the
  // run is what the check compares against, so it converges in one run.
  const after = computeChangeDigest(cwd);
  if (after === null) {
    return { kind: 'record-tests', change, recorded: false, reason: digestFailureReason(cwd) };
  }
  // Re-read AFTER the run and write into the fresh document: a long suite leaves a
  // wide window in which the metadata may be edited, and writing back the pre-run
  // snapshot would silently clobber that edit (issue #103). If the file no longer
  // validates, record nothing — a stale snapshot must not resurrect itself.
  let doc: ReturnType<typeof readChangeMetadata>['doc'];
  try {
    ({ doc } = readChangeMetadata(metadataPath, change));
  } catch (err) {
    return {
      kind: 'record-tests',
      change,
      recorded: false,
      command: run.command,
      reason:
        'metadata.yaml changed during the run and no longer validates — ' +
        `fix it and re-run (${err instanceof Error ? err.message : String(err)})`,
    };
  }
  doc.set(
    'test_provenance',
    doc.createNode({
      command: run.command,
      exit_code: run.exit_code,
      digest: after,
      date: new Date().toISOString().slice(0, 10),
    }),
  );
  await writeChangeMetadataDoc(metadataPath, doc, change);
  return {
    kind: 'record-tests',
    change,
    recorded: true,
    command: run.command,
    exitCode: run.exit_code,
    // Disclosed, not silently absorbed: the tree changed while the suite ran, so
    // the recorded fingerprint may cover an edit the run never exercised.
    treeChangedDuringRun: before !== after,
  };
}

/**
 * Aggregate per-gate escaped-defect rate from `introduced_by` (REQ-SERVICES-069).
 * A reporting mode, not a check: it grades no current repo state, produces no
 * findings, and never affects `--strict`'s exit code.
 */
async function aggregateEscapedDefectReport(
  cwd: string,
  json?: boolean,
): Promise<EscapedDefectsResult> {
  const report = aggregateEscapedDefects(collectQualityLedger(cwd), new Date().toISOString());
  const result: EscapedDefectsResult = { kind: 'escaped-defects', report };
  if (json) {
    const reportPath = path.resolve(cwd, ESCAPED_DEFECT_REPORT_FILENAME);
    await atomicWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    result.reportPath = reportPath;
  }
  return result;
}
