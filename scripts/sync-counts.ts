import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { deriveTestCounts } from './counts/derive.js';
import { buildTruth, checkFailed, syncCounts, type TestCountResult } from './counts/sync.js';
import type { CountReport } from './counts/types.js';

/**
 * `pnpm counts` — regenerate every factual count in prospec's docs from a
 * single source of truth (vitest for test counts, the filesystem for the `.hbs`
 * inventory) and rewrite each whitelisted spot in place.
 * `pnpm counts:check` — dry-run: report drift, write nothing, exit 1 on drift.
 *
 * Repo-internal (scripts/ is not shipped). Kills PB-004 manual re-derivation.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Run the suite once and bucket its counts; skip (with reason) if unavailable. */
function gatherTestCounts(): TestCountResult {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'prospec-counts-'));
  const out = path.join(dir, 'vitest.json');
  try {
    try {
      execSync(`npx vitest run --reporter=json --outputFile=${out}`, {
        cwd: REPO_ROOT,
        stdio: 'inherit',
      });
    } catch {
      // vitest exits non-zero when tests fail; the JSON report is still written,
      // and the test *count* stays a valid fact — fall through and parse it.
    }
    if (!existsSync(out)) return { counts: null, reason: 'vitest produced no JSON report' };
    const counts = deriveTestCounts(JSON.parse(readFileSync(out, 'utf-8')));
    return counts !== null ? { counts } : { counts: null, reason: 'vitest report had no results' };
  } catch (err) {
    return { counts: null, reason: `vitest run failed: ${(err as Error).message}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
  const { truth, skipped } = buildTruth(REPO_ROOT, gatherTestCounts());
  const report = await syncCounts({ repoRoot: REPO_ROOT, check, truth, skipped });
  printReport(report, check);
  if (check && checkFailed(report)) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
