import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  chmodSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { execute, CI_WORKFLOW_PATH } from '../../../src/services/check.service.js';
import { resolveLanguageScope } from '../../../src/lib/language-policy.js';
import { languagePolicyRule } from '../../../src/lib/constitution-rules.js';
import type { ProspecConfig } from '../../../src/types/config.js';
import { parseYaml } from '../../../src/lib/yaml-utils.js';
import {
  DriftReportSchema,
  DRIFT_CHECK_IDS,
  DRIFT_REPORT_FILENAME,
} from '../../../src/types/drift-report.js';

// check.service drives fast-glob + git collectors — real temp dirs, like scanner.test.ts.

// Each test here spawns real `git` (and, in the record paths, the project's test
// command) against a temp repo — 1-2s per test idle, several times that under full
// parallel-suite contention. vitest's 5s default then times out load-dependently,
// which is intolerable for THIS change specifically: `--record-tests` stamps the
// suite's exit code into `test_provenance`, so a flaky suite makes the
// `test-provenance` verdict non-deterministic. Same precedent as tests/e2e/cli.test.ts.
// 90s, not 30s: the `--record-tests` cases run the project's real test command in
// a child process. 30s held for a bare `pnpm test` but not when the suite is
// itself nested inside another node process — which is what
// `prospec check --record-tests` does, so the one run whose result is RECORDED was
// the likeliest to time out. A genuinely hung test still fails here, just later.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

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
  // Same class of gap as the spec-counters wiring below: the collector's own unit
  // test proves a promoted convention is graded `l1`, but nothing proved the
  // SERVICE hands it the list — replacing the argument with a literal `[]` left
  // all 3,287 tests green. `additional_core_conventions` is what index.md lists
  // under "Core Conventions (L1)", so mis-wiring it grades that file against
  // 10,000 instead of 1,800: a budget silently exempting the file its own index.md
  // declares.
  it('wires additional_core_conventions into the knowledge-size collector (REQ-SERVICES-065)', async () => {
    write('prospec/index.md', 'A'.repeat(40));
    write('prospec/ai-knowledge/_conventions.md', 'C'.repeat(40));
    // 8,000 tokens: over l1_per_file (1,800) but under demand_knowledge_per_file
    // (10,000), so the two kinds give opposite verdicts on the same file.
    write('prospec/ai-knowledge/_team-style.md', 'T'.repeat(32_000));
    write('.prospec.yaml', [
      'project:',
      '  name: t',
      'knowledge:',
      '  additional_core_conventions:',
      '    - _team-style.md',
    ].join('\n'));

    const result = await execute({ cwd: tmpDir });
    if (result.kind !== 'report') throw new Error('expected report');
    const finding = result.report.structural.findings.find(
      (f) => f.check === 'knowledge-size' && f.source_path.endsWith('_team-style.md'),
    );
    expect(finding, 'a promoted convention over l1_per_file must warn').toBeDefined();
    expect(finding!.detail).toContain('l1_per_file');
    expect(finding!.detail).not.toContain('demand_knowledge_per_file');
  });

  // Exactly the gap above, one collector over: the staleness exclusion moved from
  // a hardcoded constant to project config, but every test for it calls the
  // collector directly and passes the list by hand. Hardcoding `[]` at BOTH
  // service call sites — the whole feature inert — left all 3,762 tests green.
  it('wires knowledge.generated_artifacts into the git-timestamp collector (REQ-LIB-039)', async () => {
    const git = (args: string[], date?: string) =>
      execFileSync('git', args, {
        cwd: tmpDir,
        stdio: 'pipe',
        encoding: 'utf-8',
        env: date
          ? { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
          : process.env,
      });
    const declare = (generated: string[]) =>
      write(
        '.prospec.yaml',
        [
          'project:',
          '  name: t',
          'knowledge:',
          '  base_path: prospec/ai-knowledge',
          ...(generated.length > 0
            ? ['  generated_artifacts:', ...generated.map((g) => `    - ${g}`)]
            : []),
        ].join('\n'),
      );
    const libIsStale = async (): Promise<boolean | undefined> => {
      const result = await execute({ cwd: tmpDir });
      if (result.kind !== 'report') throw new Error('expected report');
      return result.report.structural.knowledge_health?.modules.find((m) => m.name === 'lib')
        ?.stale;
    };

    write('prospec/index.md', 'index\n');
    write(
      'prospec/ai-knowledge/module-map.yaml',
      // last_verified @06-11 confirms the authored 06-10 source; the exclusion under
      // test keeps last_src_commit at 06-10, so the module is not stale (REQ-LIB-015).
      'modules:\n  - name: lib\n    paths:\n      - "src/lib"\n    keywords:\n      - lib\n    last_verified: "2026-06-11T00:00:00+00:00"\n',
    );
    write('prospec/ai-knowledge/modules/lib/README.md', '# lib\n');
    git(['init', '-q']);
    git(['config', 'user.email', 'test@test.dev']);
    git(['config', 'user.name', 'test']);
    write('src/lib/authored.ts', 'export const a = 1;\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'authored'], '2026-06-10T00:00:00+00:00');

    // Build output regenerated AFTER the README — the case the exclusion exists
    // for, since no README edit could honestly clear the resulting WARN.
    write('src/lib/generated.ts', 'export const g = 1;\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'regenerate'], '2026-06-12T00:00:00+00:00');

    declare(['src/lib/generated.ts']);
    expect(await libIsStale(), 'a declared generated artifact must not make the module stale').toBe(
      false,
    );

    // Same repository, same commits — only the configuration changes. Both
    // directions are asserted so the service cannot pass a constant and pass.
    declare([]);
    expect(await libIsStale(), 'with nothing declared that commit counts as source').toBe(true);
  });

  // Nothing pinned this wiring: pointing the collector at a non-existent
  // directory left the entire suite green, and `spec-counters` would have skipped
  // in every real project forever. The check's own unit tests call the evaluator
  // directly and never reach check.service.
  it('wires spec-counters to the resolved features directory (REQ-SERVICES-077)', async () => {
    write(
      'prospec/specs/features/a.md',
      [
        '---',
        'feature: a',
        'status: active',
        'story_count: 4',
        'req_count: 9',
        '---',
        '',
        '### US-1: one story, not four',
        '',
        '#### REQ-A-001: one REQ, not nine',
      ].join('\n'),
    );

    const result = await execute({ cwd: tmpDir });
    if (result.kind !== 'report') throw new Error('expected report');
    const outcome = result.report.structural.checks.find((c) => c.id === 'spec-counters');
    expect(outcome?.status).toBe('warn');
    const findings = result.report.structural.findings.filter((f) => f.check === 'spec-counters');
    expect(findings.map((f) => f.source_path)).toEqual([
      'prospec/specs/features/a.md',
      'prospec/specs/features/a.md',
    ]);
    expect(findings.map((f) => f.detail).join('\n')).toMatch(/story_count 4.*1/s);
    expect(findings.map((f) => f.detail).join('\n')).toMatch(/req_count 9.*1/s);
  });

  it('reads the OVERRIDDEN specs path, never a re-derived one', async () => {
    write(
      '.prospec.yaml',
      [
        'version: "1.0"',
        'project:',
        '  name: t',
        'paths:',
        '  base_dir: docs-base',
        'knowledge:',
        '  base_path: docs-base/ai-knowledge',
      ].join('\n'),
    );
    write(
      'docs-base/specs/features/a.md',
      ['---', 'feature: a', 'status: active', 'story_count: 3', 'req_count: 0', '---', '', '# a'].join('\n'),
    );

    const result = await execute({ cwd: tmpDir });
    if (result.kind !== 'report') throw new Error('expected report');
    const findings = result.report.structural.findings.filter((f) => f.check === 'spec-counters');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.source_path).toBe('docs-base/specs/features/a.md');
  });

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

  it('marks unavailable sources as skipped — never PASS (every registered check, FR-007)', async () => {
    // no specs, no knowledge, no module paths, no .prospec/changes, no git repo,
    // no feature-map.yaml, no CONSTITUTION.md
    const result = await execute({ cwd: tmpDir });
    if (result.kind !== 'report') throw new Error('expected report');
    for (const check of result.report.structural.checks) {
      expect(check.status, `check ${check.id} must skip in an empty project`).toBe('skipped');
      // Every skip explains itself; most say the source is unavailable, but
      // artifact-language skips for a different reason (its language name is
      // absent from the script table), and a blanket phrase assertion would
      // force it to lie about why.
      expect(check.reason ?? '', `check ${check.id} must state why it skipped`).not.toBe('');
    }
    const artifactLanguage = result.report.structural.checks.find(
      (c) => c.id === 'artifact-language',
    );
    expect(artifactLanguage?.reason).toContain('not in the script table');
    expect(result.report.summary.skipped_count).toBe(DRIFT_CHECK_IDS.length);
    expect(result.report.structural.checks).toHaveLength(DRIFT_CHECK_IDS.length);
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

  it('records review_provenance.graded_by when --graded-by is supplied', async () => {
    initGitChange();
    await execute({ cwd: tmpDir, recordReview: true, gradedBy: 'in-session' });
    const meta = readFileSync(path.join(tmpDir, '.prospec/changes/c1/metadata.yaml'), 'utf-8');
    // structural, not substring: the field must sit INSIDE review_provenance —
    // a mutation writing it to the document root would satisfy a whole-file
    // toContain (review TQ-4)
    const parsed = parseYaml<{ review_provenance?: { graded_by?: string } }>(meta);
    expect(parsed.review_provenance?.graded_by).toBe('in-session');
  });

  it('omits review_provenance.graded_by when --graded-by is absent (backward-compatible)', async () => {
    initGitChange();
    await execute({ cwd: tmpDir, recordReview: true });
    const meta = readFileSync(path.join(tmpDir, '.prospec/changes/c1/metadata.yaml'), 'utf-8');
    const parsed = parseYaml<{ review_provenance?: Record<string, unknown> }>(meta);
    expect(parsed.review_provenance).toBeDefined();
    expect(parsed.review_provenance).not.toHaveProperty('graded_by');
    expect(meta).not.toContain('graded_by:');
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

  // --- delta-spec provenance (REQ-SERVICES-082 / REQ-LIB-045) ---------------
  const deltaSpecCheck = (r: Awaited<ReturnType<typeof execute>>) => {
    if (r.kind !== 'report') throw new Error('expected report');
    return r.report.structural.checks.find((c) => c.id === 'delta-spec-provenance');
  };

  it('--record-review stamps BOTH baselines in one write', async () => {
    initGitChange();
    write('.prospec/changes/c1/delta-spec.md', '**Spec:**\nbody\n');
    const rec = await execute({ cwd: tmpDir, recordReview: true });
    if (rec.kind !== 'record-review') throw new Error('expected record-review');
    expect(rec.recorded).toBe(true);
    expect(rec.deltaSpecSkipped).toBeUndefined();
    const meta = readFileSync(path.join(tmpDir, '.prospec/changes/c1/metadata.yaml'), 'utf-8');
    expect(meta).toContain('review_provenance:');
    expect(meta).toContain('delta_spec_provenance:');
    expect(deltaSpecCheck(await execute({ cwd: tmpDir }))?.status).toBe('pass');
  });

  // The failure the whole check exists for: review corrected a REQ, the landing
  // block was updated afterwards (or not at all), and archive would graduate text
  // no review round ever saw. Note that editing ONLY the delta-spec leaves
  // review-provenance green — that is precisely the blind spot being closed.
  it('goes stale when the delta-spec changes after the baseline, while review-provenance stays green', async () => {
    initGitChange();
    write('.prospec/changes/c1/delta-spec.md', '**Spec:**\npre-review body\n');
    await execute({ cwd: tmpDir, recordReview: true });
    write('.prospec/changes/c1/delta-spec.md', '**Spec:**\ncorrected body\n');
    const after = await execute({ cwd: tmpDir });
    expect(deltaSpecCheck(after)?.status).toBe('fail');
    expect(provenance(after)?.status).toBe('pass');
  });

  it('fails an audited change that carries a delta-spec but no recorded baseline', async () => {
    initGitChange();
    write('.prospec/changes/c1/delta-spec.md', '**Spec:**\nbody\n');
    expect(deltaSpecCheck(await execute({ cwd: tmpDir }))?.status).toBe('fail');
  });

  it('passes a change with no delta-spec, and says so when recording', async () => {
    initGitChange('quick');
    const rec = await execute({ cwd: tmpDir, recordReview: true });
    if (rec.kind !== 'record-review') throw new Error('expected record-review');
    expect(rec.recorded).toBe(true);
    expect(rec.deltaSpecSkipped).toBe(true);
    const meta = readFileSync(path.join(tmpDir, '.prospec/changes/c1/metadata.yaml'), 'utf-8');
    expect(meta).not.toContain('delta_spec_provenance:');
    expect(deltaSpecCheck(await execute({ cwd: tmpDir }))?.status).toBe('pass');
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

describe('check.service artifact-language wiring (REQ-SERVICES-074)', () => {
  const withLanguage = (language: string): void => {
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
        `artifact_language: ${language}`,
      ].join('\n'),
    );
  };

  it('composes the REAL resolved language scope with the collector', async () => {
    // The only test that proves the scan set comes from resolveLanguageScope.
    // Without it, replacing the resolver call with a literal `{nativePaths: []}`
    // reduces the check to a permanent no-op with every other test still green.
    withLanguage('Traditional Chinese (Taiwan)');
    write('.prospec/changes/demo/proposal.md', 'English only prose, no native script.\n');
    write('prospec/specs/_archived-history/2026-01-01-demo.md', '這份帶有中文。\n');

    const result = await execute({ cwd: tmpDir });
    if (result.kind !== 'report') throw new Error('expected report');
    const check = result.report.structural.checks.find((c) => c.id === 'artifact-language');
    expect(check?.status).toBe('warn');
    const findings = result.report.structural.findings.filter(
      (f) => f.check === 'artifact-language',
    );
    // Both scope entries were walked: the English one is reported, the file
    // carrying the script is not — a hardcoded empty scope reports neither.
    expect(findings.map((f) => f.source_path)).toEqual(['.prospec/changes/demo/proposal.md']);
    expect(findings[0]!.severity).toBe('warn');
  });

  // REQ-SERVICES-106: the language-policy-drift collector is wired from the SAME
  // resolved scope and compared against the rule init would seed today.
  it('compares the Constitution against the rule rendered for the resolved scope (language-policy-drift)', async () => {
    withLanguage('Traditional Chinese (Taiwan)');
    const config = {
      project: { name: 't' },
      paths: { base_dir: 'prospec' },
      knowledge: { base_path: 'prospec/ai-knowledge' },
      artifact_language: 'Traditional Chinese (Taiwan)',
    } as ProspecConfig;
    const expected = languagePolicyRule(resolveLanguageScope(config, tmpDir)).description;
    write(
      'prospec/CONSTITUTION.md',
      `# C\n\n## Principles\n\n### [MUST] Language Policy\n\n**Description**: ${expected}\n\n**Rationale**: r.\n\n---\n`,
    );

    const inSync = await execute({ cwd: tmpDir });
    if (inSync.kind !== 'report') throw new Error('expected report');
    expect(inSync.report.structural.checks.map((c) => c.id)).toContain('language-policy-drift');
    expect(inSync.report.structural.checks.find((c) => c.id === 'language-policy-drift')?.status).toBe('pass');

    // Change the trust-zone language under the same Constitution: the expected
    // Description changes with the scope, so the unchanged file is now diverged.
    write(
      '.prospec.yaml',
      [
        'project:',
        '  name: t',
        'paths:',
        '  base_dir: prospec',
        'knowledge:',
        '  base_path: prospec/ai-knowledge',
        'artifact_language: Traditional Chinese (Taiwan)',
        'trust_zone_language: Traditional Chinese (Taiwan)',
      ].join('\n'),
    );
    const diverged = await execute({ cwd: tmpDir });
    if (diverged.kind !== 'report') throw new Error('expected report');
    expect(diverged.report.structural.checks.find((c) => c.id === 'language-policy-drift')?.status).toBe('warn');
    const findings = diverged.report.structural.findings.filter((f) => f.check === 'language-policy-drift');
    expect(findings.map((f) => f.source_path)).toEqual(['prospec/CONSTITUTION.md']);
    expect(findings[0]!.detail).toContain('trust zone: Traditional Chinese (Taiwan)');
  });

  it('never scans the gitignored archive copy, though the resolved scope names it', async () => {
    withLanguage('Traditional Chinese (Taiwan)');
    write('.prospec/archive/2026-01-01-old/summary.md', 'English only prose.\n');
    write('.prospec/changes/demo/plan.md', '中文計畫。\n');

    const result = await execute({ cwd: tmpDir });
    if (result.kind !== 'report') throw new Error('expected report');
    expect(
      result.report.structural.findings.filter((f) => f.check === 'artifact-language'),
    ).toEqual([]);
  });

  it('skips honestly for a Latin-script artifact language, never a vacuous pass', async () => {
    withLanguage('Spanish');
    write('.prospec/changes/demo/proposal.md', 'Prosa en espanol sin escritura detectable.\n');

    const result = await execute({ cwd: tmpDir });
    if (result.kind !== 'report') throw new Error('expected report');
    const check = result.report.structural.checks.find((c) => c.id === 'artifact-language');
    expect(check?.status).toBe('skipped');
    expect(check?.reason).toContain('not in the script table');
  });

  it('survives a dangling symlink instead of taking every other check down', async () => {
    // A dangling symlink used to throw ENOENT straight out of the collector,
    // killing the whole run — 13 unrelated verdicts lost to one bad link.
    withLanguage('Traditional Chinese (Taiwan)');
    write('.prospec/changes/demo/proposal.md', '中文提案。\n');
    symlinkSync(
      path.join(tmpDir, '.prospec/changes/demo/missing-target.md'),
      path.join(tmpDir, '.prospec/changes/demo/dangling.md'),
    );

    const result = await execute({ cwd: tmpDir });
    if (result.kind !== 'report') throw new Error('expected report');
    expect(result.report.structural.checks).toHaveLength(DRIFT_CHECK_IDS.length);
  });

  it('survives an UNREADABLE directory — the scanner raises, the collector must not', async () => {
    // Distinct from the dangling link above, which is readable-as-absent. This
    // is the case the first fix missed: `scanDirSync` re-raises EACCES as
    // ScanError, so swapping the raw walk for it only changed which exception
    // killed the run.
    withLanguage('Traditional Chinese (Taiwan)');
    write('.prospec/changes/demo/proposal.md', '中文提案。\n');
    const locked = path.join(tmpDir, '.prospec/changes/demo/locked');
    mkdirSync(locked, { recursive: true });
    writeFileSync(path.join(locked, 'x.md'), 'English only.\n');
    chmodSync(locked, 0o000);
    try {
      const result = await execute({ cwd: tmpDir });
      if (result.kind !== 'report') throw new Error('expected report');
      expect(result.report.structural.checks).toHaveLength(DRIFT_CHECK_IDS.length);
    } finally {
      chmodSync(locked, 0o755);
    }
  });

  it('reports UNCHECKED for a scope that escapes the repo, not clean', async () => {
    // Containment refusal is a design exclusion, but refusing is not the same
    // as finding it clean — this path used to `continue` and report `pass`.
    write(
      '.prospec.yaml',
      [
        'version: "1.0"',
        'project:',
        '  name: t',
        'paths:',
        '  base_dir: ../outside',
        'artifact_language: Traditional Chinese (Taiwan)',
      ].join('\n'),
    );
    const result = await execute({ cwd: tmpDir });
    if (result.kind !== 'report') throw new Error('expected report');
    const check = result.report.structural.checks.find((c) => c.id === 'artifact-language');
    expect(check?.status).toBe('skipped');
    expect(check?.reason).toContain('outside the repository');
  });

  // chmod(0o000) does not remove read access on Windows, so this fixture cannot
  // be constructed there — the file stays readable, the scan succeeds, and the
  // check honestly reports `warn` for the English-only prose it did read. The
  // collector's other three unread paths (escaping root, symlink out of tree,
  // scanner throw) are exercised cross-platform by the siblings above; only the
  // unreadable-file condition is POSIX-only to set up.
  it.skipIf(process.platform === 'win32')('reports UNCHECKED when an in-scope file cannot be read', async () => {
    write(
      '.prospec.yaml',
      [
        'version: "1.0"',
        'project:',
        '  name: t',
        'paths:',
        '  base_dir: prospec',
        'artifact_language: Traditional Chinese (Taiwan)',
      ].join('\n'),
    );
    write('.prospec/changes/demo/proposal.md', '中文提案。\n');
    const locked = path.join(tmpDir, '.prospec/changes/demo/locked.md');
    writeFileSync(locked, 'English only.\n');
    chmodSync(locked, 0o000);
    try {
      const result = await execute({ cwd: tmpDir });
      if (result.kind !== 'report') throw new Error('expected report');
      const check = result.report.structural.checks.find((c) => c.id === 'artifact-language');
      expect(check?.status).toBe('skipped');
      expect(check?.reason).toContain('locked.md');
    } finally {
      chmodSync(locked, 0o644);
    }
  });

  it('survives a scope prefix that resolves to a FILE, not a directory', async () => {
    // `existsContained` returns true for a file, so the root guard does not stop
    // this one — only the try/catch does.
    withLanguage('Traditional Chinese (Taiwan)');
    mkdirSync(path.join(tmpDir, 'prospec/specs'), { recursive: true });
    writeFileSync(path.join(tmpDir, 'prospec/specs/_archived-history'), 'not a directory\n');
    write('.prospec/changes/demo/proposal.md', '中文提案。\n');

    const result = await execute({ cwd: tmpDir });
    if (result.kind !== 'report') throw new Error('expected report');
    expect(result.report.structural.checks).toHaveLength(DRIFT_CHECK_IDS.length);
    // …and the not-a-directory root is reported unchecked, not clean
    const check = result.report.structural.checks.find((c) => c.id === 'artifact-language');
    expect(check?.status).toBe('skipped');
  });
});

describe('check.service artifact-language honesty (REQ-LIB-037)', () => {
  // Same POSIX-only precondition as the unreadable-file case above: on Windows
  // chmod cannot revoke read access on a directory, so the scan succeeds.
  it.skipIf(process.platform === 'win32')('reports UNCHECKED, not clean, when a scope root cannot be scanned', async () => {
    // Three rounds of this defect: throw an fs error, throw a ScanError, then
    // silently report clean. A vacuous pass is the worst of the three — it says
    // "verified" about a file nothing opened.
    write(
      '.prospec.yaml',
      [
        'version: "1.0"',
        'project:',
        '  name: t',
        'paths:',
        '  base_dir: prospec',
        'artifact_language: Traditional Chinese (Taiwan)',
      ].join('\n'),
    );
    const locked = path.join(tmpDir, '.prospec/changes/demo/locked');
    mkdirSync(locked, { recursive: true });
    writeFileSync(path.join(locked, 'violating.md'), 'English only prose.\n');
    chmodSync(locked, 0o000);
    try {
      const result = await execute({ cwd: tmpDir });
      if (result.kind !== 'report') throw new Error('expected report');
      const check = result.report.structural.checks.find((c) => c.id === 'artifact-language');
      expect(check?.status).toBe('skipped');
      expect(check?.reason).toContain('could not read');
      expect(check?.reason).toContain('rather than clean');
    } finally {
      chmodSync(locked, 0o755);
    }
  });
});
