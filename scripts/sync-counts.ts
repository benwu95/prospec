import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localTestCountsFor } from './counts/local-source.js';
import { countsFrom, readReport } from './counts/report-source.js';
import { buildTruth, checkFailed, syncCounts, type TestCountResult } from './counts/sync.js';
import type { CountReport } from './counts/types.js';

/**
 * `pnpm counts` — regenerate every factual count in prospec's docs from a
 * single source of truth (a vitest JSON report for test counts, the filesystem
 * for the `.hbs` inventory) and rewrite each whitelisted spot in place.
 * `pnpm counts:check` — dry-run: report drift, write nothing, exit 1 on drift.
 * Without `--from`, test counts come from the report `pnpm test` left while its
 * work-tree stamp still matches, else from one `pnpm test` run under the
 * repository test queue (`counts/local-source.ts`).
 *
 * Repo-internal (scripts/ is not shipped). Kills PB-004 manual re-derivation.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `--from <file>`: bucket the vitest JSON report the caller names, as given —
 * CI names the one `test:coverage` just wrote. This path never judges the report
 * against the work tree, so only `--check` accepts it; the local path judges
 * `pnpm test`'s own stamped report instead.
 */
function reportArg(): string | null {
  const i = process.argv.indexOf('--from');
  if (i === -1) return null;
  return process.argv[i + 1] ?? '';
}

/** Bucket an existing report; skip (with reason) rather than falling back to a spawn. */
function readTestCounts(file: string): TestCountResult {
  if (!file || file.startsWith('--')) return { counts: null, reason: '--from needs a file path' };
  const read = readReport(REPO_ROOT, file);
  return 'reason' in read ? { counts: null, reason: read.reason } : countsFrom(read.report, file);
}

function printReport(report: CountReport, check: boolean): void {
  for (const s of report.skipped) console.warn(`skipped ${s.key}: ${s.reason}`);
  if (report.changes.length === 0) {
    if (check && report.skipped.length > 0) {
      console.log(`\n${report.skipped.length} count source(s) unavailable — cannot verify`);
    } else {
      console.log('factual counts are in sync — nothing to do');
    }
    return;
  }
  const verb = check ? 'DRIFT' : 'fixed';
  for (const c of report.changes) {
    console.log(`  ${verb} ${c.doc}:${c.line} ${c.key}: ${c.from} -> ${c.to}`);
  }
  console.log(
    check
      ? `\n${report.changes.length} count(s) out of sync — run \`pnpm counts\` to fix`
      : `\n${report.changes.length} count(s) fixed across ${report.written.length} file(s)`,
  );
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  const from = reportArg();
  // `--from` is a read-only affordance for a caller that JUST produced the
  // report (CI runs it right after `test:coverage`). It is read as given, never
  // judged against the work tree, so the write mode — which would stamp those
  // numbers into five docs — refuses it outright rather than trusting the name.
  if (from !== null && !check) {
    console.error('--from is only valid with --check; `pnpm counts` reads the stamped local report or runs the suite under the test queue');
    process.exitCode = 1;
    return;
  }
  let tests: TestCountResult;
  if (from !== null) {
    tests = readTestCounts(from);
  } else {
    const outcome = await localTestCountsFor(REPO_ROOT);
    // A stop outcome (busy queue or interrupted run) counts nothing: exit with its code before any doc is touched.
    if (outcome.kind === 'stop') {
      for (const line of outcome.lines) console.error(line);
      process.exitCode = outcome.exitCode;
      return;
    }
    tests = outcome.result;
  }
  const { truth, skipped } = buildTruth(REPO_ROOT, tests);
  const report = await syncCounts({ repoRoot: REPO_ROOT, check, truth, skipped });
  printReport(report, check);
  if (check && checkFailed(report)) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
