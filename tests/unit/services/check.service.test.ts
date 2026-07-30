import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { execute, CI_WORKFLOW_PATH } from '../../../src/services/check.service.js';
import { DriftReportSchema, DRIFT_REPORT_FILENAME } from '../../../src/types/drift-report.js';

// check.service drives fast-glob + git collectors — real temp dirs, like scanner.test.ts.

// Each test here spawns real `git` (and, in the record paths, the project's test
// command) against a temp repo — 1-2s per test idle, several times that under full
// parallel-suite contention. vitest's 5s default then times out load-dependently,
// which is intolerable for THIS change specifically: `--record-tests` stamps the
// suite's exit code into `test_provenance`, so a flaky suite makes the
// `test-provenance` verdict non-deterministic. Same precedent as tests/e2e/cli.test.ts.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'check-service-'));
  write(
    '.prospec.yaml',
    [
      'version: "1.0"',
      'project:',
      '  name: t',
      'paths:',
      '  base_dir: prospec',
      'knowledge:',
      '  base_path: prospec/ai-knowledge',
      'tech_stack:',
      '  language: typescript',
      '  package_manager: pnpm',
    ].join('\n'),
  );
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function write(relPath: string, content: string): void {
  const abs = path.join(tmpDir, relPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

describe('check.service execute', () => {
  it('produces a schema-valid report and writes it with --json', async () => {
    write('prospec/specs/features/a.md', '#### REQ-A-001: Thing\nsee REQ-A-001\n');
    const result = await execute({ cwd: tmpDir, json: true });
    expect(result.kind).toBe('report');
    if (result.kind !== 'report') return;
    expect(result.hasFail).toBe(false);
    expect(result.reportPath).toBe(path.resolve(tmpDir, DRIFT_REPORT_FILENAME));
    const onDisk = JSON.parse(readFileSync(result.reportPath!, 'utf-8'));
    expect(DriftReportSchema.safeParse(onDisk).success).toBe(true);
  });

  it('marks unavailable sources as skipped — never PASS (all thirteen checks, FR-007)', async () => {
    // no specs, no knowledge, no module paths, no .prospec/changes, no git repo,
    // no feature-map.yaml, no CONSTITUTION.md
    const result = await execute({ cwd: tmpDir });
    if (result.kind !== 'report') throw new Error('expected report');
    for (const check of result.report.structural.checks) {
      expect(check.status, `check ${check.id} must skip in an empty project`).toBe('skipped');
      expect(check.reason ?? '').toContain('source unavailable');
    }
    expect(result.report.summary.skipped_count).toBe(13);
    expect(result.report.structural.checks).toHaveLength(13);
    expect(result.hasFail).toBe(false);
    // no facts → no inventory section at all (absent, not empty-and-passing)
    expect(result.report.structural.constitution).toBeUndefined();
  });

  it('warns via knowledge-size on an over-budget module README (SC-001/SC-002)', async () => {
    write('prospec/index.md', '# small index\n'); // well within L1 budget
    write('prospec/ai-knowledge/modules/big/README.md', 'x'.repeat(4400)); // ~1100 tokens > 1000
    const result = await execute({ cwd: tmpDir });
    if (result.kind !== 'report') throw new Error('expected report');
    const size = result.report.structural.checks.find((c) => c.id === 'knowledge-size');
    expect(size?.status).toBe('warn');
    const finding = result.report.structural.findings.find(
      (f) => f.check === 'knowledge-size' && f.source_path.endsWith('big/README.md'),
    );
    expect(finding?.severity).toBe('warn');
    expect(finding?.detail).toContain('token budget');
  });

  it('runs feature-map governance when feature-map.yaml is present (wired into the report)', async () => {
    write(
      'prospec/ai-knowledge/module-map.yaml',
      'modules:\n  - name: lib\n    paths: [src/lib]\n    keywords: []\n  - name: types\n    paths: [src/types]\n    keywords: []\n',
    );
    write('prospec/specs/features/alpha.md', '---\nfeature: alpha\nstatus: active\n---\n#### REQ-LIB-001: A\n#### REQ-TYPES-002: B\n');
    // alpha declares only [lib], but owns REQ-TYPES-002 → feature→module edge violated (fail)
    write('prospec/ai-knowledge/feature-map.yaml', 'features:\n  - feature: alpha\n    modules: [lib]\n    status: active\n');
    const result = await execute({ cwd: tmpDir });
    if (result.kind !== 'report') throw new Error('expected report');
    expect(result.report.structural.checks.find((c) => c.id === 'feature-modules')?.status).toBe('fail');
    expect(result.report.structural.checks.find((c) => c.id === 'dangling-prefix')?.status).toBe('pass');
    expect(result.hasFail).toBe(true);
    expect(
      result.report.structural.findings.find((f) => f.check === 'feature-modules')?.detail,
    ).toContain('types');
  });

  it('fails loud when feature-map.yaml is present but schema-invalid', async () => {
    write('prospec/specs/features/alpha.md', '#### REQ-LIB-001: A\n');
    write('prospec/ai-knowledge/feature-map.yaml', 'features:\n  - feature: alpha\n    status: bogus\n');
    await expect(execute({ cwd: tmpDir })).rejects.toMatchObject({ code: 'MODULE_DETECTION_ERROR' });
  });

  it('reports hasFail on a dangling REQ reference', async () => {
    write('prospec/specs/features/a.md', '#### REQ-A-001: Thing\n');
    write('prospec/index.md', 'mentions REQ-GONE-007\n');
    const result = await execute({ cwd: tmpDir });
    if (result.kind !== 'report') throw new Error('expected report');
    expect(result.hasFail).toBe(true);
    const finding = result.report.structural.findings.find((f) => f.check === 'req-references');
    expect(finding?.detail).toContain('REQ-GONE-007');
  });

  it('skips knowledge-health when module-map.yaml is missing — no phantom modules', async () => {
    write('prospec/specs/features/a.md', '#### REQ-A-001: Thing\n');
    write('src/cli/x.ts', '');
    const result = await execute({ cwd: tmpDir });
    if (result.kind !== 'report') throw new Error('expected report');
    const health = result.report.structural.checks.find((c) => c.id === 'knowledge-health');
    expect(health?.status).toBe('skipped');
    expect(health?.reason).toContain('module boundaries unknown');
    expect(result.report.structural.knowledge_health).toBeUndefined();
    // constitution fallback still CHECKS import direction (proposal edge-case semantics)
    const direction = result.report.structural.checks.find((c) => c.id === 'import-direction');
    expect(direction?.status).toBe('pass');
  });

  it('fails loudly on a schema-invalid module-map instead of silently swapping rulesets', async () => {
    write('prospec/specs/features/a.md', '#### REQ-A-001: Thing\n');
    write('prospec/ai-knowledge/module-map.yaml', 'modules:\n  - nome: typo\n');
    await expect(execute({ cwd: tmpDir })).rejects.toMatchObject({
      code: 'MODULE_DETECTION_ERROR',
    });
  });

  it('clamps module-map paths that escape the repo (never scanned or read)', async () => {
    write('prospec/specs/features/a.md', '#### REQ-A-001: Thing\n');
    write(
      'prospec/ai-knowledge/module-map.yaml',
      ['modules:', '  - name: evil', '    paths:', '      - ../../', '    keywords: []'].join('\n'),
    );
    const result = await execute({ cwd: tmpDir });
    if (result.kind !== 'report') throw new Error('expected report');
    // all of the module's paths were clamped away → no module path exists → honest skip
    const direction = result.report.structural.checks.find((c) => c.id === 'import-direction');
    expect(direction?.status).toBe('skipped');
    expect(result.hasFail).toBe(false);
  });

  it('does not write a report without --json', async () => {
    write('prospec/specs/features/a.md', '#### REQ-A-001: Thing\n');
    const result = await execute({ cwd: tmpDir });
    if (result.kind !== 'report') throw new Error('expected report');
    expect(result.reportPath).toBeUndefined();
    expect(existsSync(path.join(tmpDir, DRIFT_REPORT_FILENAME))).toBe(false);
  });
});

describe('check.service review-provenance', () => {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' });
  function initGitChange(scale = 'standard'): void {
    git('init', '-q');
    git('config', 'user.email', 'test@test.dev');
    git('config', 'user.name', 'test');
    write('src/lib/x.ts', 'export const a = 1;\n');
    write(
      '.prospec/changes/c1/metadata.yaml',
      `name: c1\ncreated_at: 2026-07-13T09:51:00.000Z\nstatus: implemented\nscale: ${scale}\n`,
    );
    git('add', '.');
    git('commit', '-q', '-m', 'init');
  }
  const provenance = (r: Awaited<ReturnType<typeof execute>>) => {
    if (r.kind !== 'report') throw new Error('expected report');
    return r.report.structural.checks.find((c) => c.id === 'review-provenance');
  };

  it('fails when an implemented change has no recorded review', async () => {
    initGitChange();
    const result = await execute({ cwd: tmpDir });
    expect(provenance(result)?.status).toBe('fail');
    if (result.kind === 'report') expect(result.hasFail).toBe(true);
  });

  it('--record-review writes the baseline and clears the gate', async () => {
    initGitChange();
    const rec = await execute({ cwd: tmpDir, recordReview: true });
    expect(rec.kind).toBe('record-review');
    if (rec.kind !== 'record-review') return;
    expect(rec.recorded).toBe(true);
    const meta = readFileSync(path.join(tmpDir, '.prospec/changes/c1/metadata.yaml'), 'utf-8');
    expect(meta).toContain('review_provenance:');
    expect(meta).toMatch(/digest:/);
    expect(provenance(await execute({ cwd: tmpDir }))?.status).toBe('pass');
  });

  it('goes stale when code changes after the recorded review', async () => {
    initGitChange();
    await execute({ cwd: tmpDir, recordReview: true });
    write('src/lib/x.ts', 'export const a = 2;\n'); // edit after review
    expect(provenance(await execute({ cwd: tmpDir }))?.status).toBe('fail');
  });

  it('exempts a PROVEN backfill (backfill-draft.md present) from the review gate', async () => {
    initGitChange('backfill');
    write('.prospec/changes/c1/backfill-draft.md', '# draft\n');
    expect(provenance(await execute({ cwd: tmpDir }))?.status).toBe('pass');
  });

  // Aligned with test-provenance by #103: `scale` alone is hand-editable.
  it('grants no review exemption to an unproven backfill (no backfill-draft.md)', async () => {
    initGitChange('backfill');
    expect(provenance(await execute({ cwd: tmpDir }))?.status).toBe('fail');
  });
});

describe('check.service metadata-completeness', () => {
  const completeness = (r: Awaited<ReturnType<typeof execute>>) => {
    if (r.kind !== 'report') throw new Error('expected report');
    return r.report.structural.checks.find((c) => c.id === 'metadata-completeness');
  };

  it('fails a change whose metadata omits required fields', async () => {
    write('.prospec/changes/c1/metadata.yaml', 'status: implemented\nscale: quick\n');
    const result = await execute({ cwd: tmpDir });
    expect(completeness(result)?.status).toBe('fail');
    if (result.kind === 'report') expect(result.hasFail).toBe(true);
  });

  it('passes when every change carries the required fields', async () => {
    write(
      '.prospec/changes/c1/metadata.yaml',
      'name: c1\ncreated_at: "2026-07-05"\nstatus: implemented\nscale: full\n',
    );
    expect(completeness(await execute({ cwd: tmpDir }))?.status).toBe('pass');
  });
});

describe('check.service --init-ci', () => {
  it('scaffolds the hardened workflow with the project package manager', async () => {
    const result = await execute({ cwd: tmpDir, initCi: true });
    expect(result.kind).toBe('init-ci');
    if (result.kind !== 'init-ci') return;
    expect(result.created).toBe(true);
    const content = readFileSync(path.join(tmpDir, CI_WORKFLOW_PATH), 'utf-8');
    expect(content).toContain('pnpm exec prospec check --strict --json');
    expect(content).toContain('permissions:');
    expect(content).toContain('fetch-depth: 0');
    // every third-party action pinned to a full commit SHA
    for (const uses of content.match(/uses: .*/g) ?? []) {
      expect(uses).toMatch(/@[0-9a-f]{40} # v\d/);
    }
    // the strict-gate step pipes through tee — without an explicit bash shell
    // (pipefail), tee's exit 0 would mask the gate's exit 1
    const gateStep = content.slice(content.indexOf('Run prospec check (strict gate)'));
    const shellLine = gateStep.split('\n').find((l) => l.includes('shell:'));
    expect(shellLine?.trim()).toBe('shell: bash');
    // comment body must be an indented code block (unescapable), never a fence
    const composeStep = content.slice(content.indexOf('Compose comment body'));
    expect(composeStep).toContain("sed 's/^/    /'");
    expect(composeStep).toContain('head -c 60000');
    expect(composeStep).not.toContain('```');
  });

  it('is rerun-safe — never overwrites an existing workflow', async () => {
    await execute({ cwd: tmpDir, initCi: true });
    const workflowAbs = path.join(tmpDir, CI_WORKFLOW_PATH);
    writeFileSync(workflowAbs, 'user-edited\n');
    const second = await execute({ cwd: tmpDir, initCi: true });
    if (second.kind !== 'init-ci') throw new Error('expected init-ci');
    expect(second.created).toBe(false);
    expect(readFileSync(workflowAbs, 'utf-8')).toBe('user-edited\n');
  });

  it('falls back to npx commands for non-pnpm projects', async () => {
    write('.prospec.yaml', 'version: "1.0"\nproject:\n  name: t\n');
    const result = await execute({ cwd: tmpDir, initCi: true });
    if (result.kind !== 'init-ci') throw new Error('expected init-ci');
    const content = readFileSync(path.join(tmpDir, CI_WORKFLOW_PATH), 'utf-8');
    expect(content).toContain('npx prospec check --strict --json');
    expect(content).toContain('npm ci');
    expect(content).not.toContain('pnpm/action-setup');
  });
});

describe('test-provenance gate + --record-tests (REQ-SERVICES-068)', () => {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' });
  const NODE = process.execPath;

  function initGitChange(scale = 'standard', extraMetadata = ''): void {
    git('init', '-q');
    git('config', 'user.email', 'test@test.dev');
    git('config', 'user.name', 'test');
    write('src/lib/x.ts', 'export const a = 1;\n');
    write(
      '.prospec/changes/c1/metadata.yaml',
      `# leading comment must survive the write\nname: c1\ncreated_at: 2026-07-13T09:51:00.000Z\n` +
        `status: implemented\nscale: ${scale}\nunmodelled_key: keep-me\n${extraMetadata}`,
    );
    git('add', '.');
    git('commit', '-q', '-m', 'init');
  }

  const testCheck = (r: Awaited<ReturnType<typeof execute>>) => {
    if (r.kind !== 'report') throw new Error('expected report');
    return r.report.structural.checks.find((c) => c.id === 'test-provenance');
  };

  /** Point the project's test command at a trivial node invocation. */
  function setTestCommand(exitCode: number): void {
    setTestCommandArgv(`${NODE} -e process.exit(${exitCode})`);
  }

  function setTestCommandArgv(command: string): void {
    write(
      '.prospec.yaml',
      [
        'version: "1.0"',
        'project:',
        '  name: t',
        'paths:',
        '  base_dir: prospec',
        'tech_stack:',
        '  language: typescript',
        '  package_manager: pnpm',
        `  test_command: ${command}`,
      ].join('\n'),
    );
  }

  it('fails when an implemented change has no recorded test run', async () => {
    initGitChange();
    setTestCommand(0);
    const result = await execute({ cwd: tmpDir });
    expect(testCheck(result)?.status).toBe('fail');
    if (result.kind === 'report') expect(result.hasFail).toBe(true);
  });

  it('--record-tests writes the baseline and clears the gate, preserving comments and unknown keys', async () => {
    initGitChange();
    setTestCommand(0);
    const rec = await execute({ cwd: tmpDir, recordTests: true });
    expect(rec.kind).toBe('record-tests');
    if (rec.kind !== 'record-tests') return;
    expect(rec).toMatchObject({ change: 'c1', recorded: true, exitCode: 0 });

    const raw = readFileSync(path.join(tmpDir, '.prospec/changes/c1/metadata.yaml'), 'utf-8');
    expect(raw).toContain('# leading comment must survive the write');
    expect(raw).toContain('unmodelled_key: keep-me');
    expect(raw).toContain('test_provenance:');
    expect(raw).toContain('exit_code: 0');

    expect(testCheck(await execute({ cwd: tmpDir }))?.status).toBe('pass');
  });

  it('records a failing suite as a fact — the check turns it into the FAIL', async () => {
    initGitChange();
    setTestCommand(3);
    const rec = await execute({ cwd: tmpDir, recordTests: true });
    if (rec.kind !== 'record-tests') throw new Error('expected record-tests');
    expect(rec).toMatchObject({ recorded: true, exitCode: 3 });
    const result = await execute({ cwd: tmpDir });
    expect(testCheck(result)?.status).toBe('fail');
    const finding = (result.kind === 'report' ? result.report.structural.findings : []).find(
      (f) => f.check === 'test-provenance',
    );
    expect(finding?.detail).toContain('failing test run');
  });

  it('goes stale when code changes after the recorded run', async () => {
    initGitChange();
    setTestCommand(0);
    await execute({ cwd: tmpDir, recordTests: true });
    write('src/lib/x.ts', 'export const a = 2;\n');
    const result = await execute({ cwd: tmpDir });
    expect(testCheck(result)?.status).toBe('fail');
    const finding = (result.kind === 'report' ? result.report.structural.findings : []).find(
      (f) => f.check === 'test-provenance',
    );
    expect(finding?.detail).toContain('stale test run');
  });

  it('skips honestly (no record written) when no test command is configured', async () => {
    initGitChange();
    const rec = await execute({ cwd: tmpDir, recordTests: true });
    if (rec.kind !== 'record-tests') throw new Error('expected record-tests');
    expect(rec.recorded).toBe(false);
    expect(rec.reason).toContain('no test command');
    expect(readFileSync(path.join(tmpDir, '.prospec/changes/c1/metadata.yaml'), 'utf-8')).not.toContain(
      'test_provenance',
    );
  });

  it('exempts a PROVEN backfill (backfill-draft.md present)', async () => {
    initGitChange('backfill');
    setTestCommand(0);
    write('.prospec/changes/c1/backfill-draft.md', '# draft\n');
    expect(testCheck(await execute({ cwd: tmpDir }))?.status).toBe('pass');
  });

  it('grants no relaxation to an unproven backfill — `scale` alone is hand-editable', async () => {
    initGitChange('backfill');
    setTestCommand(0);
    expect(testCheck(await execute({ cwd: tmpDir }))?.status).toBe('fail');
  });

  it('skips honestly when the project has no resolvable test command', async () => {
    initGitChange();
    // .prospec.yaml declares no test_command and the fixture has no package.json,
    // so the check must SKIP with the fix named — not FAIL a gate it can never pass.
    const result = await execute({ cwd: tmpDir });
    const check = testCheck(result);
    expect(check?.status).toBe('skipped');
    expect(check?.reason).toContain('no test command configured');
    // a skipped check contributes no finding — never a fabricated pass either
    const findings = result.kind === 'report' ? result.report.structural.findings : [];
    expect(findings.filter((f) => f.check === 'test-provenance')).toHaveLength(0);
  });

  it('converges in one run when the suite writes an untracked artifact', async () => {
    initGitChange();
    // A suite emitting junit.xml / coverage output changes the tree it just ran
    // against; recording the pre-run digest would report "stale" forever.
    write('emit.cjs', "require('fs').writeFileSync('junit.xml', String(Date.now()));\n");
    setTestCommandArgv(`${NODE} emit.cjs`);
    const rec = await execute({ cwd: tmpDir, recordTests: true });
    if (rec.kind !== 'record-tests') throw new Error('expected record-tests');
    expect(rec.recorded).toBe(true);
    expect(testCheck(await execute({ cwd: tmpDir }))?.status).toBe('pass');
  });

  // A long suite leaves a wide window; writing back the pre-run snapshot would
  // silently clobber any edit that landed during the run (issue #103).
  it('preserves a metadata edit that lands while the suite is running', async () => {
    initGitChange();
    write(
      'edit-meta.cjs',
      "require('fs').appendFileSync('.prospec/changes/c1/metadata.yaml', 'description: edited-mid-run\\n');\n",
    );
    setTestCommandArgv(`${NODE} edit-meta.cjs`);
    const rec = await execute({ cwd: tmpDir, recordTests: true });
    if (rec.kind !== 'record-tests') throw new Error('expected record-tests');
    expect(rec.recorded).toBe(true);
    const raw = readFileSync(path.join(tmpDir, '.prospec/changes/c1/metadata.yaml'), 'utf-8');
    expect(raw).toContain('description: edited-mid-run');
    expect(raw).toContain('test_provenance:');
  });

  it('records nothing when metadata stops validating during the run — the stale snapshot must not resurrect', async () => {
    initGitChange();
    write(
      'corrupt-meta.cjs',
      "require('fs').writeFileSync('.prospec/changes/c1/metadata.yaml', 'name: [unclosed\\n');\n",
    );
    setTestCommandArgv(`${NODE} corrupt-meta.cjs`);
    const rec = await execute({ cwd: tmpDir, recordTests: true });
    if (rec.kind !== 'record-tests') throw new Error('expected record-tests');
    expect(rec.recorded).toBe(false);
    expect(rec.reason).toContain('no longer validates');
    // the corrupted content is still there — untouched, not overwritten
    const raw = readFileSync(path.join(tmpDir, '.prospec/changes/c1/metadata.yaml'), 'utf-8');
    expect(raw).toBe('name: [unclosed\n');
  });

  // A null digest inside a real repo is a capture failure, not "not a git
  // repository" — the wrong reason sends the developer to the wrong fix (#103).
  it('names a digest failure honestly when the directory IS a git repository', async () => {
    git('init', '-q'); // unborn HEAD: work tree yes, `git diff HEAD` fails
    write(
      '.prospec/changes/c1/metadata.yaml',
      'name: c1\ncreated_at: 2026-07-13T09:51:00.000Z\nstatus: implemented\nscale: standard\n',
    );
    setTestCommand(0);
    const rec = await execute({ cwd: tmpDir, recordTests: true });
    if (rec.kind !== 'record-tests') throw new Error('expected record-tests');
    expect(rec.recorded).toBe(false);
    expect(rec.reason).toContain('could not compute the change digest');
    expect(rec.reason).not.toContain('not a git repository');
  });

  // A killed run is reported as whatever the platform can actually observe — asserted
  // per platform rather than as one cross-platform rule, because a single assertion here
  // encoded a POSIX premise and stayed green until CI first ran on Windows.
  it('reports a killed run as the platform actually ends it', async () => {
    initGitChange();
    setTestCommandArgv(`${NODE} -e process.kill(process.pid,'SIGTERM')`);
    const rec = await execute({ cwd: tmpDir, recordTests: true });
    if (rec.kind !== 'record-tests') throw new Error('expected record-tests');
    const metadata = (): string =>
      readFileSync(path.join(tmpDir, '.prospec/changes/c1/metadata.yaml'), 'utf-8');
    if (process.platform === 'win32') {
      // Windows carries no signal in the wait status: libuv synthesizes one from an
      // `exit_signal` it sets only for a kill issued through `uv_process_kill`, and this
      // fixture kills ITSELF, so none is reported. `TerminateProcess` ends the child with
      // exit code 1 — indistinguishable from a suite that failed on its own, so recording
      // it is the honest outcome: fail-closed, never silently absent. Asserted as non-zero
      // rather than as 1, which is libuv's own choice of exit code.
      expect(rec.recorded).toBe(true);
      expect(rec.exitCode).not.toBe(0);
      expect(metadata()).toContain('test_provenance');
      return;
    }
    // POSIX: the terminating signal leaves no exit code, so nothing is recorded.
    expect(rec.recorded).toBe(false);
    expect(rec.reason).toContain('SIGTERM');
    expect(metadata()).not.toContain('test_provenance');
  });

  it('never spawns the suite on the pure check path (read-only)', async () => {
    initGitChange();
    write('spy.cjs', "require('fs').writeFileSync('SUITE_RAN', 'x');\n");
    setTestCommandArgv(`${NODE} spy.cjs`);
    await execute({ cwd: tmpDir });
    expect(existsSync(path.join(tmpDir, 'SUITE_RAN'))).toBe(false);
  });

  it('leaves no record when metadata.yaml is absent, without running the suite', async () => {
    initGitChange();
    write('spy2.cjs', "require('fs').writeFileSync('SUITE_RAN2', 'x');\n");
    setTestCommandArgv(`${NODE} spy2.cjs`);
    rmSync(path.join(tmpDir, '.prospec/changes/c1/metadata.yaml'));
    const rec = await execute({ cwd: tmpDir, recordTests: true });
    if (rec.kind !== 'record-tests') throw new Error('expected record-tests');
    expect(rec.recorded).toBe(false);
    expect(rec.reason).toContain('metadata.yaml not found');
    expect(existsSync(path.join(tmpDir, 'SUITE_RAN2'))).toBe(false);
  });
});

describe('--escaped-defects aggregation (REQ-SERVICES-069)', () => {
  it('reports no samples honestly when nothing registers introduced_by', async () => {
    write('.prospec/changes/c1/metadata.yaml', 'name: c1\nstatus: tasks\nscale: standard\n');
    const r = await execute({ cwd: tmpDir, escapedDefects: true });
    expect(r.kind).toBe('escaped-defects');
    if (r.kind !== 'escaped-defects') return;
    expect(r.report.sample_count).toBe(0);
    expect(r.report.gates).toEqual([]);
    expect(r.reportPath).toBeUndefined(); // no --json → no file written
  });

  it('computes per-gate rate across changes + archive and writes the report with --json', async () => {
    write(
      '.prospec/archive/2026-07-05-offender/metadata.yaml',
      'name: offender\nstatus: archived\nscale: standard\nquality_log:\n' +
        '  - skill: prospec-verify\n    date: "2026-07-05"\n    result: PASS\n    grade: S\n',
    );
    write(
      '.prospec/changes/fix/metadata.yaml',
      'name: fix\nstatus: implemented\nscale: quick\nintroduced_by: offender\n',
    );
    const r = await execute({ cwd: tmpDir, escapedDefects: true, json: true });
    if (r.kind !== 'escaped-defects') throw new Error('expected escaped-defects');
    expect(r.report.sample_count).toBe(1);
    expect(r.report.gates).toEqual([
      { gate: 'prospec-verify', passed: 1, escaped: 1, escaped_rate: 1 },
    ]);
    expect(r.report.archive_available).toBe(true);
    expect(existsSync(r.reportPath!)).toBe(true);
    const onDisk = JSON.parse(readFileSync(r.reportPath!, 'utf-8'));
    expect(onDisk.samples[0]).toMatchObject({ fix_change: 'fix', introduced_by: 'offender' });
  });

  it('surfaces an unresolved introduced_by and flags an absent archive', async () => {
    write(
      '.prospec/changes/fix/metadata.yaml',
      'name: fix\nstatus: implemented\nscale: quick\nintroduced_by: never-existed\n',
    );
    const r = await execute({ cwd: tmpDir, escapedDefects: true });
    if (r.kind !== 'escaped-defects') throw new Error('expected escaped-defects');
    expect(r.report.unresolved_references).toHaveLength(1);
    expect(r.report.archive_available).toBe(false);
    expect(r.report.sample_count).toBe(0);
  });
});
