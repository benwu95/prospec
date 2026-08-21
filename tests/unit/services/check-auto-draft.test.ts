import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  chmodSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execute } from '../../../src/services/check.service.js';

// Delegates to the real service; the flag is the only way to reach the
// drafting-failed branch without corrupting fixtures the check itself reads.
const draftFailure = vi.hoisted(() => ({ message: null as string | null }));
vi.mock('../../../src/services/auto-draft.service.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../src/services/auto-draft.service.js')>();
  return {
    ...actual,
    execute: async (options: Parameters<typeof actual.execute>[0]) => {
      if (draftFailure.message !== null) throw new Error(draftFailure.message);
      return actual.execute(options);
    },
  };
});

describe('check.service --auto-draft integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'check-auto-draft-'));
    write(
      '.prospec.yaml',
      [
        'version: "1.0"',
        'project:',
        '  name: test-project',
        'paths:',
        '  base_dir: prospec',
        'knowledge:',
        '  base_path: prospec/ai-knowledge',
        'tech_stack:',
        '  language: typescript',
        '  package_manager: pnpm',
      ].join('\n'),
    );
    write('prospec/CONSTITUTION.md', '# Constitution\n');
    write(
      'prospec/index.md',
      [
        '# Index',
        '',
        '| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |',
        '|--------|----------|---------|--------|-------------|-----------|------------|',
        '| **services** | services, general, fix, size, knowledge | - | Active | Business logic | - | - |',
        '',
      ].join('\n'),
    );
    write(
      'prospec/ai-knowledge/module-map.yaml',
      [
        'modules:',
        '  - name: services',
        '    paths:',
        '      - src/services/**',
        '    keywords:',
        '      - services',
        '      - logic',
      ].join('\n'),
    );
    // Deliberately over every knowledge-size budget: the fixture must produce a
    // real finding, or every assertion below passes vacuously.
    write(
      'prospec/ai-knowledge/modules/services/README.md',
      `# Services\n\n${'lorem ipsum dolor sit amet '.repeat(2000)}\n`,
    );
    draftFailure.message = null;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function write(relPath: string, content: string): void {
    const abs = path.join(tmpDir, relPath);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }

  const changeDirs = (): string[] => {
    const dir = path.join(tmpDir, '.prospec', 'changes');
    return existsSync(dir) ? readdirSync(dir).sort() : [];
  };

  it('refuses --auto-draft in every mode that returns before the drift run', async () => {
    for (const mode of ['initCi', 'recordReview', 'recordTests', 'escapedDefects'] as const) {
      await expect(execute({ cwd: tmpDir, autoDraft: true, [mode]: true })).rejects.toThrow(
        /cannot be combined/,
      );
    }
    expect(changeDirs()).toEqual([]);
  });

  it('refuses --auto-draft-dry-run on its own, where it would silently do nothing', async () => {
    await expect(execute({ cwd: tmpDir, autoDraftDryRun: true })).rejects.toThrow(
      /no effect without --auto-draft/,
    );
  });

  it('writes a complete change scaffold per drafted finding group', async () => {
    const result = await execute({ cwd: tmpDir, autoDraft: true });

    expect(result.kind).toBe('report');
    if (result.kind !== 'report') return;
    expect(result.autoDraftError).toBeUndefined();
    expect(result.autoDraftResult).toBeDefined();

    const created = result.autoDraftResult!.changes.filter((c) => c.action === 'created');
    expect(created.length).toBeGreaterThan(0);
    expect(result.autoDraftResult!.createdCount).toBe(created.length);
    expect(changeDirs()).toEqual(created.map((c) => c.name).sort());

    // Both artifacts, or the change is unroutable and permanently un-redraftable.
    for (const c of created) {
      expect(existsSync(path.join(tmpDir, c.changeDir, 'metadata.yaml'))).toBe(true);
      expect(existsSync(path.join(tmpDir, c.changeDir, 'proposal.md'))).toBe(true);
    }
  });

  it('writes nothing at all under --auto-draft-dry-run', async () => {
    const result = await execute({ cwd: tmpDir, autoDraft: true, autoDraftDryRun: true });

    expect(result.kind).toBe('report');
    if (result.kind !== 'report') return;
    expect(result.autoDraftResult?.dryRun).toBe(true);
    expect(result.autoDraftResult!.changes.length).toBeGreaterThan(0);
    // Not "no proposal.md" — no directory: a metadata-only leftover is exactly
    // what would suppress every future draft for the same finding.
    expect(changeDirs()).toEqual([]);
  });

  it('is idempotent — a second run skips instead of overwriting a hand-edited proposal', async () => {
    const first = await execute({ cwd: tmpDir, autoDraft: true });
    const dirsAfterFirst = changeDirs();
    expect(dirsAfterFirst.length).toBeGreaterThan(0);

    const proposal = path.join(tmpDir, '.prospec', 'changes', dirsAfterFirst[0]!, 'proposal.md');
    writeFileSync(proposal, 'HAND-WRITTEN');

    const second = await execute({ cwd: tmpDir, autoDraft: true });

    if (first.kind !== 'report' || second.kind !== 'report') throw new Error('expected reports');
    expect(second.autoDraftResult!.createdCount).toBe(0);
    expect(second.autoDraftResult!.skippedCount).toBe(first.autoDraftResult!.createdCount);
    expect(changeDirs()).toEqual(dirsAfterFirst);
    expect(readFileSync(proposal, 'utf-8')).toBe('HAND-WRITTEN');
  });

  it('writes the JSON report and keeps its verdicts when drafting throws', async () => {
    draftFailure.message = 'EACCES: permission denied';

    const result = await execute({ cwd: tmpDir, json: true, autoDraft: true });

    expect(result.kind).toBe('report');
    if (result.kind !== 'report') return;
    // The report is the primary output: a drafting failure must not discard it
    // nor flip the exit code `--strict` derives from `hasFail`.
    expect(result.autoDraftError).toContain('EACCES');
    expect(result.autoDraftResult).toBeUndefined();
    expect(result.reportPath).toBeDefined();
    expect(existsSync(result.reportPath!)).toBe(true);
    // Read the FILE, not the in-memory field: the guarantee is that the report
    // reached disk with its verdicts intact despite the drafting failure.
    const onDisk = JSON.parse(readFileSync(result.reportPath!, 'utf-8'));
    expect(onDisk.structural.findings.length).toBe(result.report.structural.findings.length);
    expect(result.hasFail).toBe(onDisk.summary.fail_count > 0);
  });

  it('reports a write failure per group instead of throwing the whole run away', async () => {
    // A read-only changes directory: every scaffold write fails, while the
    // change directories themselves do not exist (so this is a genuine write
    // failure, not the AlreadyExistsError idempotency path).
    const changes = path.join(tmpDir, '.prospec', 'changes');
    mkdirSync(changes, { recursive: true });
    chmodSync(changes, 0o555);
    try {
      const result = await execute({ cwd: tmpDir, autoDraft: true });

      expect(result.kind).toBe('report');
      if (result.kind !== 'report') return;
      // Handled per group, so the service returned normally — the run is
      // described, not discarded, and `check` never saw an exception.
      expect(result.autoDraftError).toBeUndefined();
      const draft = result.autoDraftResult!;
      expect(draft.changes.length).toBeGreaterThan(0);
      expect(draft.failedCount).toBe(draft.changes.length);
      expect(draft.createdCount).toBe(0);
      expect(draft.changes.every((c) => c.action === 'failed' && c.skipReason)).toBe(true);
      expect(changeDirs()).toEqual([]);
    } finally {
      chmodSync(changes, 0o755);
    }
  });
});
