import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import fg from 'fast-glob';
import { configDefaults } from 'vitest/config';
import vitestConfig from '../../vitest.config.js';
import { computeChangeState } from '../../src/lib/drift-sources.js';
import { withFixedGitEnv } from '../../src/lib/git-read.js';
import { deriveTestCounts, type VitestJsonReport } from './derive.js';
import type { TestCountResult } from './sync.js';

/**
 * Where a test count comes from (REQ-TESTS-070, REQ-TESTS-150): a vitest JSON
 * report, read as given when `--from` names it, or — without `--from` — the
 * report `pnpm test` left behind, used only while its work-tree stamp still
 * matches the files on disk.
 */

/** The report `pnpm test` writes; `package.json` and the reader name the same path. */
export const LOCAL_REPORT = 'vitest-report.json';

/** The top-level field the stamping reporter adds to vitest's JSON report. */
export const STAMP_FIELD = 'prospecCounts';

export type WorkTreeStamp = { workTreeDigest: string } | { unusable: string };
export type DigestResult = { digest: string } | { reason: string };
export type StampedReport = VitestJsonReport & { [STAMP_FIELD]?: unknown };

/** Read and parse a report; the reasons are the ones `--from` has always printed. */
export function readReport(repoRoot: string, file: string): { report: StampedReport } | { reason: string } {
  const abs = path.resolve(repoRoot, file);
  if (!existsSync(abs)) return { reason: `no vitest report at ${file}` };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(abs, 'utf-8'));
  } catch (err) {
    return { reason: `${file} is not a readable vitest report: ${(err as Error).message}` };
  }
  const malformed = reportShapeProblem(parsed);
  return malformed === null
    ? { report: parsed as StampedReport }
    : { reason: `${file} is not a readable vitest report: ${malformed}` };
}

/** Every field the counts and the stamp judgment read, checked once where the report is read. */
function reportShapeProblem(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'expected a JSON object';
  const results = (value as { testResults?: unknown }).testResults;
  if (results === undefined) return null;
  if (!Array.isArray(results)) return 'testResults is not an array';
  const bad = results.findIndex((r: unknown) => typeof (r as { name?: unknown } | null)?.name !== 'string');
  return bad === -1 ? null : `testResults[${bad}] has no string name`;
}

export function countsFrom(report: VitestJsonReport, file: string): TestCountResult {
  const counts = deriveTestCounts(report);
  return counts !== null ? { counts } : { counts: null, reason: `${file} has no results` };
}

/**
 * The preservation digest — tracked files plus untracked files git does not
 * ignore — under a fixed git environment, so an inherited `GIT_DIR` cannot
 * point it at another repository (as the delegation content facet does).
 */
export function workTreeDigest(root: string): DigestResult {
  try {
    const state = withFixedGitEnv(() => computeChangeState(root, 'preservation'));
    return state.digest !== null ? { digest: state.digest } : { reason: state.reason ?? 'work-tree digest unavailable' };
  } catch (err) {
    return { reason: (err as Error).message };
  }
}

export function stampFor(run: { before: DigestResult; after: DigestResult; reason: string | undefined }): WorkTreeStamp {
  if (!('digest' in run.before)) return { unusable: `work-tree digest unavailable at the run's start: ${run.before.reason}` };
  if (!('digest' in run.after)) return { unusable: `work-tree digest unavailable at the run's end: ${run.after.reason}` };
  if (run.before.digest !== run.after.digest) return { unusable: 'files changed while the run was in progress' };
  if (run.reason === 'interrupted') return { unusable: 'the run was interrupted' };
  return { workTreeDigest: run.before.digest };
}

interface TestFileConfig {
  include?: readonly string[];
  exclude?: readonly string[];
}

const toPosix = (rel: string): string => rel.split(path.sep).join('/');

/**
 * The test files vitest collects with no CLI narrowing, from the config file's
 * include/exclude and the parameters vitest's own glob uses (dot files
 * included), as `/`-separated repo-relative paths.
 */
export function expectedTestFiles(root: string, config: TestFileConfig | undefined = vitestConfig.test): string[] {
  const include = [...(config?.include ?? configDefaults.include)];
  const exclude = [...(config?.exclude ?? configDefaults.exclude)];
  return fg.sync(include, { cwd: root, dot: true, ignore: exclude, onlyFiles: true }).map(toPosix).sort();
}

function readStamp(value: unknown): WorkTreeStamp | null {
  if (typeof value !== 'object' || value === null) return null;
  const stamp = value as Record<string, unknown>;
  if (typeof stamp.workTreeDigest === 'string') return { workTreeDigest: stamp.workTreeDigest };
  if (typeof stamp.unusable === 'string') return { unusable: stamp.unusable };
  return null;
}

/** Why a stamped report cannot stand for the current work tree, or null when it can. */
export function judgeStampedReport(
  report: StampedReport,
  current: DigestResult,
  expected: readonly string[],
  root: string,
  file: string,
): string | null {
  const stamp = readStamp(report[STAMP_FIELD]);
  if (stamp === null) return `${file} carries no work-tree stamp (it was not written by \`pnpm test\`)`;
  if ('unusable' in stamp) return `${file} is unusable: ${stamp.unusable}`;
  if (!('digest' in current)) return `the current work-tree digest is unavailable: ${current.reason}`;
  if (stamp.workTreeDigest !== current.digest) return `files changed since ${file} was written`;
  const ran = new Set((report.testResults ?? []).map((r) => toPosix(path.relative(root, r.name))));
  const want = new Set(expected);
  const missing = [...want].filter((rel) => !ran.has(rel));
  const extra = [...ran].filter((rel) => !want.has(rel));
  if (missing.length > 0) return `${file} does not cover the configured test files (missing ${describe(missing)})`;
  if (extra.length > 0) return `${file} does not cover the configured test files (unexpected ${describe(extra)})`;
  return null;
}

const describe = (paths: string[]): string => (paths.length === 1 ? paths[0]! : `${paths[0]}, +${paths.length - 1} more`);
