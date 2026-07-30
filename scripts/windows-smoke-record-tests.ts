import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

/**
 * The real-host half of the `test-provenance` gate (REQ-TESTS-062): builds a throwaway
 * git fixture, runs the built CLI's `--record-tests` against it for real, and asserts
 * the resulting check is anything but FAIL.
 *
 * This is the claim no injected probe can make. On Windows the fallback command
 * (`pnpm test`) is a `.cmd` shim Node refuses to spawn shell-free, and the whole point
 * of `skip-unspawnable-test-command` was that such a project reports an honest skip
 * rather than a FAIL no configuration could clear — until this script ran, that had
 * never been executed on Windows. It runs identically on POSIX, where the command is
 * spawnable and the run is recorded instead: same assertion, other branch, so the
 * script is verifiable before it ever reaches a Windows runner.
 *
 * Repo-internal (scripts/ is not shipped); invoked by the `windows-smoke` CI job.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(REPO_ROOT, 'dist', 'cli', 'index.js');
const CHANGE = 'smoke';
const REPORT = 'prospec-report.json';

/** The check this fixture exists to observe; a FAIL here is the regression. */
const CHECK_ID = 'test-provenance';

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

/** A git repo with one commit — an unborn HEAD makes the digest uncomputable, which
 *  would abort `--record-tests` on a precondition instead of exercising the shim. */
function buildFixture(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'prospec-windows-smoke-'));
  const write = (rel: string, body: string): void => {
    const target = path.join(dir, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, body);
  };

  // No tech_stack.test_command on purpose: the fallback `<package_manager> test` is
  // exactly the resolution that lands on a Windows shim.
  write(
    '.prospec.yaml',
    'project:\n  name: windows-smoke-fixture\ntech_stack:\n  language: typescript\n  package_manager: pnpm\n',
  );
  write(
    'package.json',
    `${JSON.stringify(
      // Shell-metacharacter-free on purpose: pnpm runs a script THROUGH a shell, so a
      // `node -e process.exit(0)` would die on the parentheses and record a red run.
      { name: 'windows-smoke-fixture', private: true, scripts: { test: 'node --version' } },
      null,
      2,
    )}\n`,
  );
  // `implemented` is the only status test-provenance judges — anything else is exempt,
  // which would make the fixture pass while proving nothing.
  write(
    `.prospec/changes/${CHANGE}/metadata.yaml`,
    `name: ${CHANGE}\ncreated_at: '2026-07-30T00:00:00.000Z'\nstatus: implemented\nscale: quick\n`,
  );

  git(dir, 'init', '--quiet');
  git(dir, 'config', 'user.email', 'smoke@example.com');
  git(dir, 'config', 'user.name', 'windows smoke');
  git(dir, 'add', '.');
  git(dir, 'commit', '--quiet', '-m', 'fixture');
  return dir;
}

/** Run the built CLI with its output inherited — the CI log is the evidence. */
function runCli(cwd: string, args: string[]): number {
  console.log(`\n$ node ${path.relative(REPO_ROOT, CLI)} ${args.join(' ')}`);
  const res = spawnSync(process.execPath, [CLI, ...args], { cwd, stdio: 'inherit' });
  if (res.error !== undefined) throw res.error;
  return res.status ?? -1;
}

function readCheckStatus(fixture: string): { status: string; reason?: string } {
  const reportPath = path.join(fixture, REPORT);
  if (!existsSync(reportPath)) throw new Error(`${REPORT} was not written to the fixture`);
  // The deterministic checks live under `structural` — the report is layered, and the
  // semantic layer is a separate object.
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
    structural?: { checks?: { id: string; status: string; reason?: string }[] };
  };
  const check = report.structural?.checks?.find((c) => c.id === CHECK_ID);
  if (check === undefined) throw new Error(`the report carries no ${CHECK_ID} check`);
  return { status: check.status, reason: check.reason };
}

function main(): void {
  if (!existsSync(CLI)) {
    console.error(`missing ${CLI} — run \`pnpm run build\` first`);
    process.exit(1);
  }
  const fixture = buildFixture();
  console.log(`platform: ${process.platform}\nfixture:  ${fixture}`);
  try {
    // `check --record-tests` exits 0 on every platform, recorded or not (only `--strict`
    // on the report path sets an exit code), so this number is printed for the log and
    // deliberately NOT judged — the check status read below is the assertion.
    const recordExit = runCli(fixture, ['check', '--record-tests', '--change', CHANGE]);
    console.log(`\n--record-tests exit code: ${recordExit}`);
    runCli(fixture, ['check', '--json']);

    const { status, reason } = readCheckStatus(fixture);
    console.log(`\n${CHECK_ID}: ${status}${reason === undefined ? '' : ` — ${reason}`}`);
    if (status === 'fail') {
      console.error(
        `\nFAIL: ${CHECK_ID} came back \`fail\` on ${process.platform}. A host where the test ` +
          'command cannot be spawned must report an honest skip, never a FAIL no configuration ' +
          'could clear.',
      );
      process.exit(1);
    }
    console.log(`\nOK: ${CHECK_ID} is \`${status}\` — not a FAIL.`);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

main();
