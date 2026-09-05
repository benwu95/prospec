/**
 * Measure the startup module-load graph of the unbundled CLI entry
 * (`dist/cli/index.js`) per command, via a `module.registerHooks` load counter
 * run in the child process. Proves REQ-CLI-045: command-irrelevant heavy
 * dependencies stay out of a command's load set, with separate ceilings for
 * registration, ordinary routing and full saved-report assessment.
 *
 * Usage:
 *   npx tsx scripts/measure-startup-modules.ts          # print a table
 *   npx tsx scripts/measure-startup-modules.ts --check  # assert the contract, exit 1 on violation
 *
 * The write-commands (`change log`, `verify record`) are measured against a
 * nonexistent change so their action imports the service but errors before any
 * write — the load graph is captured, the working tree is untouched.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const HOOK = path.resolve(__dirname, 'startup-load-counter.mjs');
const DEFAULT_CLI = path.resolve(REPO_ROOT, 'dist/cli/index.js');

/**
 * node_modules ceilings. The registration-only floor (`--version`) and the
 * drift-engine-free command (`change log`) stay under 200 — the AC-1 target.
 * `status` / `verify record` transitively import the drift engine, which pulls
 * fast-glob's ~70-module tree; they are held under 250 (a >50% cut from the 530
 * baseline) rather than 200, since removing fast-glob from those paths would
 * require converting the drift engine's sync scanning collectors to async.
 */
export const REGISTRATION_MAX = 200;
export const DRIFT_PATH_MAX = 250;
// A recognized saved report requires the full canonical-doc assessment.
// Keep its renderer budget separate from ordinary routing (measured: 274).
export const REPORT_PATH_MAX = 300;
export type StatusScenario = 'no-report' | 'current-report' | 'stale-report' | 'in-flight';

const ALL_HEAVY = ['mcp-sdk', 'inquirer', 'fast-xml-parser', 'smol-toml', 'handlebars'] as const;
type Heavy = (typeof ALL_HEAVY)[number];

/** The four command-irrelevant heavy deps forbidden on every measured path. */
const FORBIDDEN_FOUR: Heavy[] = ['mcp-sdk', 'inquirer', 'fast-xml-parser', 'smol-toml'];

export interface StartupPath {
  label: string;
  args: string[];
  /** heavy deps that must NOT appear in this path's load set */
  forbidden: Heavy[];
  /** node_modules ceiling; undefined = uncapped */
  maxNodeModules?: number;
  /** Isolated status state, independent of the developer's active changes/report. */
  scenario?: StatusScenario;
}

export const STARTUP_PATHS: StartupPath[] = [
  { label: '--version', args: ['--version'], forbidden: [...ALL_HEAVY], maxNodeModules: REGISTRATION_MAX },
  { label: 'status', args: ['status', '--json'], scenario: 'no-report', forbidden: [...ALL_HEAVY], maxNodeModules: DRIFT_PATH_MAX },
  { label: 'status current report', args: ['status', '--json'], scenario: 'current-report', forbidden: FORBIDDEN_FOUR, maxNodeModules: REPORT_PATH_MAX },
  { label: 'status stale report', args: ['status', '--json'], scenario: 'stale-report', forbidden: FORBIDDEN_FOUR, maxNodeModules: REPORT_PATH_MAX },
  { label: 'status in flight', args: ['status', '--json'], scenario: 'in-flight', forbidden: [...ALL_HEAVY], maxNodeModules: DRIFT_PATH_MAX },
  // `check` legitimately renders canonical docs → handlebars is allowed, and it
  // runs the full drift suite so its count is not bounded here.
  { label: 'check', args: ['check'], forbidden: FORBIDDEN_FOUR },
  {
    label: 'change log',
    args: ['change', 'log', '--change', '__prospec_nonexistent__', '--skill', 'prospec-implement', '--result', 'WARN', '--warning', 'startup-measure'],
    forbidden: [...ALL_HEAVY],
    maxNodeModules: REGISTRATION_MAX,
  },
  {
    label: 'verify record',
    args: ['verify', 'record', '--change', '__prospec_nonexistent__', '--dimension', 'tasks-completeness=PASS'],
    forbidden: [...ALL_HEAVY],
    maxNodeModules: DRIFT_PATH_MAX,
  },
];

export interface StartupMeasurement {
  nodeModules: number;
  own: number;
  heavy: Heavy[];
  stdout: string;
  exitCode: number | null;
}

// A measurement is a pure function of (cliPath, args, scenario) against a fixed dist, so
// repeated identical measurements — the contract check and the per-path it.each
// blocks all measure the same paths within one test process — reuse the first
// spawn instead of paying a fresh node startup each time. In the one-shot
// `--check` CLI run every path is measured once, so the cache is never re-hit
// there; it only collapses the test suite's redundant re-spawns.
const measurementCache = new Map<string, StartupMeasurement>();

export function measureStartupModules(args: string[], cliPath: string = DEFAULT_CLI, scenario?: StatusScenario): StartupMeasurement {
  const cacheKey = JSON.stringify([cliPath, args, scenario]);
  const cached = measurementCache.get(cacheKey);
  if (cached) return cached;

  // spawnSync returns stderr on both success and non-zero exit (a
  // nonexistent-change path exits 1 by design); the counter prints on exit.
  const fixture = scenario === undefined ? undefined : createStatusFixture(cliPath, scenario);
  let processResult;
  try {
    processResult = spawnSync(process.execPath, ['--import', HOOK, cliPath, ...args], {
      cwd: fixture ?? REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
  } finally {
    if (fixture) rmSync(fixture, { recursive: true, force: true });
  }
  const { stderr, stdout, status: exitCode } = processResult;
  const line = (stderr ?? '')
    .split('\n')
    .reverse()
    .find((l) => l.startsWith('PROSPEC_STARTUP '));
  if (!line) {
    throw new Error(`no PROSPEC_STARTUP line for args [${args.join(' ')}]; stderr:\n${stderr}`);
  }
  const measurement: StartupMeasurement = { ...JSON.parse(line.slice('PROSPEC_STARTUP '.length)), stdout, exitCode };
  measurementCache.set(cacheKey, measurement);
  return measurement;
}

/** Real Git fixtures exercise both sides of the post-archive status branch.
 * Setup runs outside the measured process; it never touches the user's report.
 */
function createStatusFixture(cliPath: string, scenario: StatusScenario): string {
  const cwd = mkdtempSync(path.join(tmpdir(), 'prospec-startup-'));
  const write = (name: string, text: string) => {
    mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true });
    writeFileSync(path.join(cwd, name), text);
  };
  try {
    const git = spawnSync('git', ['init', '-q'], { cwd, encoding: 'utf8' });
    if (git.status !== 0) throw new Error(`startup fixture git init failed: ${git.stderr}`);
    write('.prospec.yaml', 'version: "1.0"\nproject:\n  name: startup-fixture\n');
    write('input.txt', 'before');
    if (scenario !== 'no-report') {
      const check = spawnSync(process.execPath, [cliPath, 'check', '--json'], { cwd, encoding: 'utf8' });
      if (check.status !== 0) throw new Error(`startup fixture check failed: ${check.stderr}`);
    }
    if (scenario === 'stale-report') write('input.txt', 'after');
    if (scenario === 'in-flight') {
      write('.prospec/changes/active/metadata.yaml', 'name: active\ncreated_at: "2026-09-05"\nstatus: story\nscale: quick\n');
    }
    return cwd;
  } catch (error) {
    rmSync(cwd, { recursive: true, force: true });
    throw error;
  }
}

export interface Violation {
  label: string;
  message: string;
}

export function checkStartupContract(cliPath: string = DEFAULT_CLI): {
  rows: Array<StartupPath & StartupMeasurement>;
  violations: Violation[];
} {
  const rows: Array<StartupPath & StartupMeasurement> = [];
  const violations: Violation[] = [];
  for (const p of STARTUP_PATHS) {
    const m = measureStartupModules(p.args, cliPath, p.scenario);
    rows.push({ ...p, ...m });
    if (p.scenario && m.exitCode !== 0) {
      violations.push({ label: p.label, message: `status fixture exited ${m.exitCode}` });
    }
    const leaked = p.forbidden.filter((h) => m.heavy.includes(h));
    if (leaked.length > 0) {
      violations.push({ label: p.label, message: `loads forbidden heavy dep(s): ${leaked.join(', ')}` });
    }
    if (p.maxNodeModules !== undefined && m.nodeModules > p.maxNodeModules) {
      violations.push({ label: p.label, message: `node_modules ${m.nodeModules} > ${p.maxNodeModules}` });
    }
  }
  return { rows, violations };
}

function main(): void {
  const check = process.argv.includes('--check');
  const { rows, violations } = checkStartupContract();
  for (const r of rows) {
    process.stdout.write(
      `${r.label.padEnd(16)} node_modules=${String(r.nodeModules).padStart(4)} own=${String(r.own).padStart(4)} heavy=[${r.heavy.join(',') || 'none'}]\n`,
    );
  }
  if (check) {
    if (violations.length > 0) {
      process.stderr.write('\nSTARTUP CONTRACT VIOLATIONS:\n');
      for (const v of violations) process.stderr.write(`  ✗ ${v.label}: ${v.message}\n`);
      process.exit(1);
    }
    process.stdout.write('\n✓ startup module contract satisfied\n');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
