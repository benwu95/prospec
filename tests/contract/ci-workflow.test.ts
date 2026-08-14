import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'yaml';

const CI_PATH = path.join(__dirname, '../../.github/workflows/ci.yml');
const PKG_PATH = path.join(__dirname, '../../package.json');

interface WorkflowStep {
  name?: string;
  run?: string;
  uses?: string;
  if?: string;
  'continue-on-error'?: boolean;
  with?: Record<string, unknown>;
}
interface WorkflowJob {
  steps?: WorkflowStep[];
  if?: string;
  'continue-on-error'?: boolean;
}

/**
 * Version-controlled baseline of every step the `test` job runs, in order.
 * Changing this list is the deliberate act of changing what CI executes; a step
 * added or removed without touching it fails, which is the point — `counts:check`
 * shipped as a working, exit-1 checker that no workflow ran, and the counts it
 * guards drifted 22 times before anyone noticed the gate was never wired.
 *
 * Every spelling, not just `pnpm run <script>`: a gate added as `pnpm exec …`,
 * `npx …`, or as a GitHub Action must not slip past a matcher that recognises
 * one shape. Actions appear as `uses:<name>` with the version stripped — a
 * version bump is not a change to WHICH steps run. A multi-line script collapses
 * to `|`; the assertion below keeps a gate from hiding inside one.
 */
const TEST_JOB_STEPS = [
  'uses:actions/checkout',
  'uses:pnpm/action-setup',
  'uses:actions/setup-node',
  'pnpm install --frozen-lockfile',
  'pnpm run lint',
  'pnpm run typecheck',
  'pnpm run build',
  'pnpm run test:coverage',
  'pnpm run counts:check --from vitest-report.json',
  // The deployed-artifact freshness gate. Ordered after the suite for the same
  // reason the counts gate is: both check a property of the tree the earlier
  // steps produced, and neither needs to run before them.
  'pnpm run agents:check',
  // The source→knowledge sync gate: a module whose declared source paths changed
  // must bump its last_verified. Same tree-property shape as the two gates above.
  'pnpm run knowledge:check',
  '|',
  'uses:actions/upload-artifact',
];

/**
 * The command gates — each must be able to fail the job. The install belongs:
 * `--frozen-lockfile` is itself a gate. The `uses:` steps and the reporting
 * block are excluded because two of them legitimately carry `if: always()`.
 */
const GATE_COMMANDS = TEST_JOB_STEPS.filter(
  (c) => c.startsWith('pnpm run ') || c === 'pnpm install --frozen-lockfile',
);

/**
 * A package manager in COMMAND position — first word of a line (at ANY
 * indentation: the block this guards is a `{ … }` group whose every command is
 * indented) or after a shell separator. Naming one mid-line, inside a quoted
 * string or a comment, is prose about the script, not a gate hiding in it.
 */
const PACKAGE_MANAGER = /(?:^\s*|[|&;(]\s*)(?:pnpm|npx|npm|yarn|bun)\s/m;

const workflow = (): Record<string, WorkflowJob> =>
  (parse(fs.readFileSync(CI_PATH, 'utf-8')) as { jobs?: Record<string, WorkflowJob> }).jobs ?? {};

function job(name: string): WorkflowJob {
  const found = workflow()[name];
  expect(found, `job "${name}" not found in ci.yml`).toBeDefined();
  return found!;
}

/** Every step, in order: an action as `uses:<name>`, a script as its command,
 *  a multi-line script as `|`. */
function steps(j: WorkflowJob): string[] {
  return (j.steps ?? []).map((s) => {
    if (s.uses !== undefined) return `uses:${s.uses.split('@')[0]}`;
    const run = s.run ?? '';
    return run.includes('\n') ? '|' : run.trim();
  });
}

/** Raw `run` bodies, block scalars included — for "must not appear anywhere" checks. */
function runBodies(j: WorkflowJob): string[] {
  return (j.steps ?? []).filter((s) => s.run !== undefined).map((s) => s.run!);
}

describe('ci.yml quality gates (REQ-TESTS-070)', () => {
  it('the test job runs exactly the baseline steps, in order', () => {
    // Ordered on purpose: `counts:check --from` buckets the JSON report
    // `test:coverage` just wrote, so it MUST follow it. Move it earlier and it
    // finds no report, skips, and fails the check — a reorder is as much a
    // change to CI's behaviour as an insertion, so both edit the baseline.
    expect(
      steps(job('test')),
      'CI step list changed — update TEST_JOB_STEPS in the same change, deliberately',
    ).toEqual(TEST_JOB_STEPS);
  });

  it('checks out full history so knowledge:check can resolve its merge-base', () => {
    // knowledge:check runs `git merge-base origin/main HEAD`; a shallow (default
    // depth-1) checkout has no base history and the gate cannot resolve its base.
    // Removing this makes the gate red in CI, so it is a required part of the contract.
    const checkout = (job('test').steps ?? []).find((s) => s.uses?.startsWith('actions/checkout'));
    expect(checkout, 'test job has no actions/checkout step').toBeDefined();
    expect(checkout!.with?.['fetch-depth']).toBe(0);
  });

  it('no gate hides inside a multi-line script', () => {
    // The baseline collapses a block scalar to `|`, so its CONTENT is not
    // compared. That is tolerable only while no block runs a package manager —
    // otherwise a gate (or anything else) could be added there unseen.
    const blocks = runBodies(job('test')).filter((r) => r.includes('\n'));
    expect(blocks.length, 'no multi-line script found — the baseline and the job have diverged').toBe(
      TEST_JOB_STEPS.filter((s) => s === '|').length,
    );
    for (const block of blocks) {
      // Shell comments are prose about the script, not the script — a comment
      // naming npm must not read as running it.
      const code = block
        .split('\n')
        .filter((l) => !/^\s*#/.test(l))
        .join('\n');
      expect(
        code,
        'a multi-line script invokes a package manager — a gate belongs in its own step, where the baseline can see it',
      ).not.toMatch(PACKAGE_MANAGER);
    }
  });

  it('no gate step in the test job can fail without failing the job', () => {
    // A gate that runs but cannot go red is worse than no gate: it reports
    // coverage. `continue-on-error` is live in this very file (windows-smoke), so
    // neutering the counts gate is otherwise a one-line edit nothing would catch.
    // Explicit no-ops (`continue-on-error: false`, `if: success()`) are the
    // default spelled out — they leave the step a full gate and stay green.
    const testJob = job('test');
    expect(testJob['continue-on-error'] ?? false, 'the test job itself must be able to fail').toBe(false);
    expect(testJob.if ?? 'success()', 'the test job must not be conditional').toBe('success()');

    const gateSteps = (testJob.steps ?? []).filter((s) => GATE_COMMANDS.includes(s.run?.trim() ?? ''));
    expect(gateSteps, 'no gate steps matched — the baseline and the workflow have diverged').toHaveLength(
      GATE_COMMANDS.length,
    );
    for (const step of gateSteps) {
      expect(step['continue-on-error'] ?? false, `${step.run} cannot fail the job`).toBe(false);
      expect(step.if ?? 'success()', `${step.run} is conditional`).toBe('success()');
    }
  });

  it('the counts gate reads the report the coverage script writes', () => {
    // Two files must agree on one path, AND the writer must actually emit it:
    // `--outputFile.json` without `--reporter=json` writes nothing, which would
    // leave the gate failing for a filename reason it cannot explain.
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8')) as { scripts: Record<string, string> };
    const coverage = pkg.scripts['test:coverage'] ?? '';
    const written = /--outputFile\.json=(\S+)/.exec(coverage)?.[1];
    const read = /--from (\S+)/.exec(steps(job('test')).find((c) => c.includes('counts:check')) ?? '')?.[1];
    // Scoped claim: this reads the npm script only. Moving the json reporter
    // into vitest.config.ts would work at runtime and red here — update this
    // assertion then; a static check cannot see the config's merged reporters.
    expect(
      coverage,
      'test:coverage does not pass --reporter=json; if the reporter moved to vitest.config, point this assertion there',
    ).toMatch(/--reporter[= ]json/);
    expect(written, 'test:coverage writes no JSON report — the counts gate has no input').toBeDefined();
    expect(read, 'the CI counts step passes no --from').toBeDefined();
    expect(read, 'ci.yml reads a different path than package.json writes').toBe(written);
  });

  it('windows-smoke runs no counts step — counts are platform-independent', () => {
    // Over the run BODIES (block scalars included), not the raw job text: the
    // reason belongs in a YAML comment inside that job, and a prose mention
    // there must not turn this red.
    const bodies = runBodies(job('windows-smoke'));
    expect(bodies.length, 'windows-smoke has no run steps — parse drift').toBeGreaterThan(0);
    expect(bodies.filter((b) => b.includes('counts'))).toEqual([]);
  });
});
