import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { execute as check } from '../../src/services/check.service.js';
import { execute as verify } from '../../src/services/verify-record.service.js';
import { execute as status } from '../../src/services/status.service.js';
import { execute as archive } from '../../src/services/archive.service.js';
import type { QualityDimension } from '../../src/types/change.js';
import type { DriftFinding } from '../../src/types/drift-report.js';

/**
 * Per-change gates and failed re-verify routing over real Git and the normal
 * services (issue #266, REQ-TESTS-113): the fixture holds two verified changes,
 * A with current review/test evidence and B with none, and asks the gates about
 * each — never about "the repository".
 */
vi.setConfig({ testTimeout: 60_000 });

let root: string;
const write = (name: string, text: string) => {
  mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  writeFileSync(path.join(root, name), text);
};
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
const judgment = (fail: string[] = []): QualityDimension[] =>
  ['delta-spec-compliance', 'constitution', 'design'].map((name) => ({
    name,
    result: fail.includes(name) ? 'FAIL' : name === 'design' ? 'not-applicable' : 'PASS',
    graded_by: 'fresh-subagent',
  }));
const record = (change: string, fail: string[] = []) =>
  verify({ cwd: root, change, quiet: true, judgmentDimensions: judgment(fail), warnings: [] });
const bytes = (): Record<string, string> =>
  Object.fromEntries(
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && !path.join(e.parentPath, e.name).includes(`${path.sep}.git${path.sep}`))
      .map((e) => [path.relative(root, path.join(e.parentPath, e.name)), readFileSync(path.join(e.parentPath, e.name)).toString('base64')]),
  );
const seedChange = (name: string, extra: Record<string, string> = {}) => {
  write(`.prospec/changes/${name}/metadata.yaml`, `name: ${name}\ncreated_at: "2026-09-05"\nstatus: implemented\nscale: full\n`);
  write(`.prospec/changes/${name}/delta-spec.md`, '# Delta Spec\n\n## ADDED\n');
  write(`.prospec/changes/${name}/tasks.md`, '- [x] T1 Implement fixture behavior\n');
  for (const [file, text] of Object.entries(extra)) write(`.prospec/changes/${name}/${file}`, text);
};

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'workflow-contracts-'));
  git('init', '-q');
  git('config', 'user.name', 'test');
  git('config', 'user.email', 'test@example.com');
  write('.prospec.yaml', `version: "1.0"\nproject:\n  name: fixture\ntech_stack:\n  test_command: ${process.execPath} suite.cjs\n`);
  write('suite.cjs', 'process.exit(0);');
  write('prospec/CONSTITUTION.md', '# Constitution\n\n## Principles\n\n### [MUST] Tests\n\n**Description**: Test the behavior.\n\n**Verify**: Tests pass.\n');
  seedChange('a');
  seedChange('b');
  git('add', '.');
  git('commit', '-qm', 'fixture');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('per-change gates (REQ-LIB-071, REQ-SERVICES-102, REQ-TEMPLATES-131)', () => {
  it("B's missing review and tests never block A's verify or archive, while B stays blocked and check still reports B", async () => {
    await check({ cwd: root, change: 'a', recordReview: true });
    await check({ cwd: root, change: 'a', recordTests: true });

    // verify record: A records (grade A — the fixture's WARN budget); B is refused at Gate A
    expect((await record('a')).grade).toBe('A');
    await expect(record('b')).rejects.toThrow(/review-provenance/);

    // The issue's scenario: B ALSO verified (an earlier S/A on record) but with no
    // current evidence — the shape that used to refuse A at archive.
    write(
      '.prospec/changes/b/metadata.yaml',
      'name: b\ncreated_at: "2026-09-05"\nstatus: verified\nscale: full\nquality_log:\n  - skill: prospec-verify\n    date: 2026-09-05\n    result: PASS\n    warnings: []\n    grade: A\n',
    );

    // repo-wide check still names B's gaps
    const checked = await check({ cwd: root });
    if (!('report' in checked) || !('structural' in checked.report)) throw new Error('check did not return a drift report');
    const findings: DriftFinding[] = checked.report.structural.findings;
    const bFindings = findings.filter((f) => f.source_path.startsWith('.prospec/changes/b/'));
    expect(bFindings.map((f) => f.check).sort()).toEqual(expect.arrayContaining(['review-provenance', 'test-provenance']));
    expect(findings.some((f) => f.source_path.startsWith('.prospec/changes/a/'))).toBe(false);

    // archive: A is not refused for B's sake (dry-run — the fixture has no feature specs to land)
    const dryA = await archive({ cwd: root, names: ['a'], dryRun: true });
    expect(dryA.refused).toEqual([]);
    const before = bytes();
    const dryB = await archive({ cwd: root, names: ['b'], dryRun: true });
    expect(dryB.refused).toHaveLength(1);
    expect(dryB.refused[0]!.reason).toContain('REVIEW_STALE');
    expect(dryB.refused[0]!.reason).toContain('TESTS_STALE');
    expect(bytes()).toEqual(before);
  });

  it('a proven backfill (no tasks.md by contract) is not refused for task-completion; an unproven one is', async () => {
    write('.prospec/changes/bf/metadata.yaml', 'name: bf\ncreated_at: "2026-09-05"\nstatus: implemented\nscale: backfill\n');
    write('.prospec/changes/bf/delta-spec.md', '# Delta Spec\n\n## ADDED\n');
    write('.prospec/changes/bf/backfill-draft.md', '**Feature:** legacy\n**Story:** US-1\n');
    git('add', '.');
    git('commit', '-qm', 'backfill');
    expect((await record('bf')).grade).toBe('A');
    const proven = await archive({ cwd: root, names: ['bf'], dryRun: true });
    expect(proven.refused).toEqual([]);

    rmSync(path.join(root, '.prospec/changes/bf/backfill-draft.md'));
    const unproven = await archive({ cwd: root, names: ['bf'], dryRun: true });
    expect(unproven.refused).toHaveLength(1);
    expect(unproven.refused[0]!.reason).toContain('CHECK_UNPROVABLE');
    expect(unproven.refused[0]!.reason).toMatch(/backfill-draft\.md/);
  });
});

describe('failed re-verify routing (REQ-LIB-035, REQ-SERVICES-070)', () => {
  it('a verified change re-verified to C is routed back to verify with the stable code, not to archive', async () => {
    await check({ cwd: root, change: 'a', recordReview: true });
    await check({ cwd: root, change: 'a', recordTests: true });
    expect((await record('a')).grade).toBe('A');
    let report = await status({ cwd: root });
    const routeA = () => report.changes.find((c) => c.name === 'a')!;
    expect(routeA().status).toBe('verified');
    expect(['knowledge-update', 'archive']).toContain(routeA().next);

    expect((await record('a', ['delta-spec-compliance'])).grade).toBe('C');
    report = await status({ cwd: root });
    expect(routeA().status).toBe('verified');
    expect(routeA().next).toBe('verify');
    expect(routeA().code).toBe('VERIFY_GRADE_BELOW_BAR');
    expect(routeA().reasons.join(' ')).toContain('re-run prospec-verify');
    const refused = await archive({ cwd: root, names: ['a'], dryRun: true });
    expect(refused.refused).toHaveLength(1);
  });
});
