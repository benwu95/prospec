import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatArchiveOutput } from '../../../src/cli/formatters/archive-output.js';
import type { ArchiveResult } from '../../../src/services/archive.service.js';

let logSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function stdout(): string {
  return logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
}

function stderr(): string {
  return stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
}

function emptyResult(overrides: Partial<ArchiveResult> = {}): ArchiveResult {
  return {
    archived: [],
    skipped: [],
    skippedReasons: {},
    affectedModules: [],
    specFiles: [],
    dryRun: false,
    planned: [],
    refused: [],
    notFound: [],
    pendingConvergence: [],
    droppedBehavior: [],
    ...overrides,
  };
}

describe('archive-output', () => {
  it('prints the full planned-mutation list on dry-run', () => {
    formatArchiveOutput(
      emptyResult({
        dryRun: true,
        planned: [
          { action: 'move', target: '/p/.prospec/archive/2026-07-29-feat-x', detail: 'move bundle' },
          { action: 'write', target: '/p/prospec/specs/features/alpha.md', detail: 'sync requirements into alpha.md' },
          { action: 'update', target: '/p/.prospec/archive/2026-07-29-feat-x/metadata.yaml', detail: 'set status: archived + archived_at' },
        ],
        archived: [
          { name: 'feat-x', sourcePath: '/p/.prospec/changes/feat-x', archivePath: '/p/.prospec/archive/2026-07-29-feat-x', summaryGenerated: true },
        ],
      }),
      'normal',
    );
    const text = stdout();
    expect(text).toContain('Dry-run — nothing was written');
    expect(text).toContain('move');
    expect(text).toContain('/p/.prospec/archive/2026-07-29-feat-x');
    expect(text).toContain('alpha.md');
    expect(text).toContain('set status: archived + archived_at');
  });

  it('prints archived changes, spec files, and affected modules on a real run', () => {
    formatArchiveOutput(
      emptyResult({
        archived: [
          { name: 'feat-x', sourcePath: '/p/.prospec/changes/feat-x', archivePath: '/p/.prospec/archive/2026-07-29-feat-x', summaryGenerated: true },
        ],
        specFiles: ['/p/prospec/specs/features/alpha.md'],
        affectedModules: ['lib'],
      }),
      'normal',
    );
    const text = stdout();
    expect(text).toContain('archived feat-x');
    expect(text).toContain('Feature Specs synced:');
    expect(text).toContain('alpha.md');
    expect(text).toContain('lib');
  });

  it('flags a failed summary generation on the archived line', () => {
    formatArchiveOutput(
      emptyResult({
        archived: [
          { name: 'feat-x', sourcePath: '/p', archivePath: '/a', summaryGenerated: false },
        ],
      }),
      'normal',
    );
    expect(stdout()).toContain('summary generation failed');
  });

  it('routes skipped, refused, and not-found targets to stderr, even in quiet mode', () => {
    formatArchiveOutput(
      emptyResult({
        skipped: ['feat-x'],
        skippedReasons: { 'feat-x': 'archive destination already exists: /p/.prospec/archive/2026-07-29-feat-x' },
        refused: [{ name: 'feat-y', status: 'tasks', reason: "status is 'tasks' — only 'verified' changes can be archived" }],
        notFound: ['nope'],
      }),
      'quiet',
    );
    expect(logSpy).not.toHaveBeenCalled();
    const err = stderr();
    expect(err).toContain('skipped feat-x');
    expect(err).toContain('archive destination already exists');
    expect(err).toContain('refused feat-y');
    expect(err).toContain("status is 'tasks'");
    expect(err).toContain('not found nope');
    expect(err).toContain('prospec status');
  });

  it('prints the skip reason from skippedReasons, with a generic fallback', () => {
    formatArchiveOutput(
      emptyResult({
        skipped: ['feat-a', 'feat-b'],
        skippedReasons: { 'feat-a': 'archive move failed and was rolled back: EACCES' },
      }),
      'normal',
    );
    const err = stderr();
    expect(err).toContain('skipped feat-a — archive move failed and was rolled back: EACCES');
    expect(err).toContain('skipped feat-b — archive failed');
    expect(stdout()).not.toContain('skipped');
  });

  it('lists the pending-convergence worklist on stderr, even in quiet mode', () => {
    formatArchiveOutput(
      emptyResult({
        archived: [{ name: 'x', sourcePath: '/p', archivePath: '/a', summaryGenerated: true }],
        pendingConvergence: [
          {
            feature: 'sdd-workflow',
            reqId: 'REQ-SERVICES-010',
            reason: 'delta-spec carries no **Spec:** block — the existing body was preserved, converge it by hand',
          },
        ],
      }),
      'quiet',
    );
    expect(logSpy).not.toHaveBeenCalled();
    const err = stderr();
    expect(err).toContain('1 REQ body/bodies kept their existing text');
    expect(err).toContain('sdd-workflow REQ-SERVICES-010');
    expect(err).toContain('no **Spec:** block');
  });

  it('lists dropped behavior verbatim, one bullet per line', () => {
    formatArchiveOutput(
      emptyResult({
        archived: [{ name: 'x', sourcePath: '/p', archivePath: '/a', summaryGenerated: true }],
        droppedBehavior: [
          {
            feature: 'sdd-workflow',
            reqId: 'REQ-TEMPLATES-066',
            bullets: [
              '- WHEN rendered, THEN it includes Entry Gate / Reviewer Modes',
              '- WHEN a critical is reported, THEN auto-fix only when existence-verified',
            ],
          },
        ],
      }),
      'quiet',
    );
    const err = stderr();
    expect(err).toContain('1 REQ body/bodies dropped authored behavior');
    expect(err).toContain('sdd-workflow REQ-TEMPLATES-066');
    // verbatim text, not a count — the reader must be able to restore it
    expect(err).toContain('- WHEN rendered, THEN it includes Entry Gate / Reviewer Modes');
    expect(err).toContain('- WHEN a critical is reported, THEN auto-fix only when existence-verified');
  });

  it('prints dropped behavior AFTER the pending-convergence worklist', () => {
    // Ordering is part of the requirement (the reader converges kept bodies
    // first, then confirms what replacements omitted) and was code-position
    // evidence only.
    formatArchiveOutput(
      emptyResult({
        archived: [{ name: 'x', sourcePath: '/p', archivePath: '/a', summaryGenerated: true }],
        pendingConvergence: [
          { feature: 'sdd-workflow', reqId: 'REQ-A-001', reason: 'no **Spec:** block' },
        ],
        droppedBehavior: [
          { feature: 'sdd-workflow', reqId: 'REQ-B-002', bullets: ['- WHEN x, THEN y'] },
        ],
      }),
      'quiet',
    );
    const err = stderr();
    expect(err.indexOf('kept their existing text')).toBeGreaterThanOrEqual(0);
    expect(err.indexOf('dropped authored behavior')).toBeGreaterThan(
      err.indexOf('kept their existing text'),
    );
  });

  it('prints no dropped-behavior section when nothing was dropped', () => {
    formatArchiveOutput(
      emptyResult({
        archived: [{ name: 'x', sourcePath: '/p', archivePath: '/a', summaryGenerated: true }],
      }),
      'quiet',
    );
    expect(stderr()).not.toContain('dropped authored behavior');
  });

  it('lists the same REQs and bullets under dry-run, phrased as a preview', () => {
    formatArchiveOutput(
      emptyResult({
        dryRun: true,
        droppedBehavior: [
          { feature: 'sdd-workflow', reqId: 'REQ-CLI-001', bullets: ['- WHEN x, THEN y'] },
        ],
      }),
      'normal',
    );
    const err = stderr();
    expect(err).toContain('would drop');
    // Asserting the verb alone is a false green: the header prints
    // unconditionally, so a dry run could degrade to a bare count while this
    // passed — the exact "a count cannot tell a reader what to restore" failure
    // the requirement exists to prevent. Pin the payload too.
    expect(err).toContain('sdd-workflow REQ-CLI-001');
    expect(err).toContain('- WHEN x, THEN y');
  });

  it('says "would keep" for the dry-run worklist', () => {
    formatArchiveOutput(
      emptyResult({
        dryRun: true,
        pendingConvergence: [
          { feature: 'ai-knowledge', reqId: 'REQ-KNOW-012', reason: 'no body' },
        ],
      }),
      'normal',
    );
    expect(stderr()).toContain('would keep');
    expect(stderr()).toContain('ai-knowledge REQ-KNOW-012');
  });

  it('prints nothing to stdout in quiet mode', () => {
    formatArchiveOutput(
      emptyResult({
        archived: [{ name: 'x', sourcePath: '/p', archivePath: '/a', summaryGenerated: true }],
      }),
      'quiet',
    );
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('sanitizes control characters out of repo-derived strings', () => {
    formatArchiveOutput(
      emptyResult({
        archived: [
          { name: 'evil\u001b[2Jchange', sourcePath: '/p', archivePath: '/adir', summaryGenerated: true },
        ],
        refused: [{ name: 'bad\u0007name', status: 'tasks', reason: 'reasontext' }],
      }),
      'normal',
    );
    const text = stdout() + stderr();
    expect(text).not.toContain('\u001b');
    expect(text).not.toContain('\u0007');
    expect(text).toContain('evil');
    expect(text).toContain('reasontext');
  });
});
