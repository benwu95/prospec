import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { execute, CI_WORKFLOW_PATH, resolveKnowledgeTokenBudget } from '../../../src/services/check.service.js';
import { DriftReportSchema, DRIFT_REPORT_FILENAME } from '../../../src/types/drift-report.js';
import { DEFAULT_KNOWLEDGE_TOKEN_BUDGET, type ProspecConfig } from '../../../src/types/config.js';

// check.service drives fast-glob + git collectors — real temp dirs, like scanner.test.ts.

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

describe('resolveKnowledgeTokenBudget', () => {
  it('falls back to DEFAULT_KNOWLEDGE_TOKEN_BUDGET when knowledge.token_budget is unset', () => {
    const budget = resolveKnowledgeTokenBudget({ project: { name: 't' } } as ProspecConfig);
    expect(budget).toEqual({
      l1_per_file: DEFAULT_KNOWLEDGE_TOKEN_BUDGET.l1_per_file,
      l2_per_module: DEFAULT_KNOWLEDGE_TOKEN_BUDGET.l2_per_module,
      readme_max_lines: DEFAULT_KNOWLEDGE_TOKEN_BUDGET.readme_max_lines,
    });
  });

  it('overrides only the fields set in knowledge.token_budget, keeping defaults for the rest', () => {
    const budget = resolveKnowledgeTokenBudget({
      project: { name: 't' },
      knowledge: { token_budget: { l1_per_file: 9999 } },
    } as ProspecConfig);
    expect(budget.l1_per_file).toBe(9999);
    expect(budget.l2_per_module).toBe(DEFAULT_KNOWLEDGE_TOKEN_BUDGET.l2_per_module);
    expect(budget.readme_max_lines).toBe(DEFAULT_KNOWLEDGE_TOKEN_BUDGET.readme_max_lines);
  });
});

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

  it('marks unavailable sources as skipped — never PASS (all eleven checks, FR-007)', async () => {
    // no specs, no knowledge, no module paths, no .prospec/changes, no git repo, no feature-map.yaml
    const result = await execute({ cwd: tmpDir });
    if (result.kind !== 'report') throw new Error('expected report');
    for (const check of result.report.structural.checks) {
      expect(check.status, `check ${check.id} must skip in an empty project`).toBe('skipped');
      expect(check.reason ?? '').toContain('source unavailable');
    }
    expect(result.report.summary.skipped_count).toBe(11);
    expect(result.hasFail).toBe(false);
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
    write('.prospec/changes/c1/metadata.yaml', `name: c1\nstatus: implemented\nscale: ${scale}\n`);
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

  it('exempts scale: backfill (no review required)', async () => {
    initGitChange('backfill');
    expect(provenance(await execute({ cwd: tmpDir }))?.status).toBe('pass');
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
