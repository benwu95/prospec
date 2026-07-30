import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { execute } from '../../../src/services/verify-record.service.js';
import { computeChangeDigest } from '../../../src/lib/drift-sources.js';
import { PrerequisiteError } from '../../../src/types/errors.js';
import type { QualityDimension } from '../../../src/types/change.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

// The freshness guard's git-backed fingerprint; null (default) = honest skip,
// matching a non-git environment.
vi.mock('../../../src/lib/drift-sources.js', () => ({
  computeChangeDigest: vi.fn((): string | null => null),
}));

beforeEach(() => {
  vol.reset();
  vi.mocked(computeChangeDigest).mockReturnValue(null);
});

const CWD = '/repo';
const META = '/repo/.prospec/changes/add-widget/metadata.yaml';

function report(
  statuses: { tc?: string; kh?: string; tp?: string } = {},
  extra: { digest?: string | null; skipReason?: string } = {},
): string {
  const check = (id: string, status: string) =>
    status === 'skipped'
      ? { id, status, reason: extra.skipReason ?? 'source unavailable' }
      : { id, status };
  return JSON.stringify({
    version: 1,
    generated_at: '2026-07-30T00:00:00.000Z',
    ...(extra.digest !== undefined ? { change_digest: extra.digest } : {}),
    structural: {
      checks: [
        check('task-completion', statuses.tc ?? 'pass'),
        check('knowledge-health', statuses.kh ?? 'pass'),
        check('test-provenance', statuses.tp ?? 'pass'),
      ],
      findings: [],
    },
    semantic: { status: 'not-checked' },
    summary: { fail_count: 0, warn_count: 0, skipped_count: 0 },
  });
}

const judgment = (over: Partial<Record<'delta' | 'constitution' | 'design', QualityDimension['result']>> = {}): QualityDimension[] => [
  { name: 'delta-spec-compliance', result: over.delta ?? 'PASS' },
  { name: 'constitution', result: over.constitution ?? 'PASS' },
  { name: 'design', result: over.design ?? 'not-applicable' },
];

function seed(opts: { scale?: string; status?: string; reportJson?: string; draft?: boolean } = {}): void {
  const files: Record<string, string> = {
    [META]: `name: add-widget
created_at: 2026-07-13T09:51:00.000Z
status: ${opts.status ?? 'implemented'}
${opts.scale ? `scale: ${opts.scale}\n` : ''}`,
    '/repo/prospec-report.json': opts.reportJson ?? report(),
  };
  if (opts.draft) files['/repo/.prospec/changes/add-widget/backfill-draft.md'] = '**Feature:** x\n**Story:** US-1\n';
  vol.fromJSON(files);
}

describe('verify-record service', () => {
  it('grades S from an all-pass report + all-pass judgment, and advances to verified', async () => {
    seed();
    const result = await execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [], date: '2026-07-30' });
    expect(result.grade).toBe('S');
    expect(result.result).toBe('PASS');
    expect(result.statusAdvanced).toBe(true);
    const written = vol.readFileSync(META, 'utf-8') as string;
    expect(written).toContain('status: verified');
    expect(written).toContain('grade: S');
    expect(written).toContain('adjudicator: machine');
  });

  it('self-sources machine dims — a failing test-provenance caps the grade at C, status unchanged', async () => {
    seed({ reportJson: report({ tp: 'fail' }) });
    const result = await execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [] });
    expect(result.grade).toBe('C');
    expect(result.statusAdvanced).toBe(false);
    expect(vol.readFileSync(META, 'utf-8')).toContain('status: implemented');
  });

  it('a skipped machine check lands as not-adjudicated and consumes the WARN budget (no exemption class)', async () => {
    seed({ reportJson: report({ kh: 'skipped' }) });
    const result = await execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: ['w1', 'w2'] });
    // 1 not-adjudicated dim (its warning is spelled out by the service) + 2
    // caller warnings = 3 budget-counted warns → B
    expect(result.grade).toBe('B');
    expect(result.result).toBe('WARN');
    expect(result.warnings.join(' ')).toContain('knowledge: not-adjudicated');
  });

  it('refuses to run without the report, pointing at prospec check', async () => {
    seed();
    vol.unlinkSync('/repo/prospec-report.json');
    await expect(
      execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [] }),
    ).rejects.toThrow(/prospec-report\.json not found/);
  });

  it('refuses a judgment set that is missing a dimension or relays a machine one', async () => {
    seed();
    await expect(
      execute({ cwd: CWD, judgmentDimensions: judgment().slice(0, 2), warnings: [] }),
    ).rejects.toThrow(PrerequisiteError);
    let caught: unknown;
    try {
      await execute({
        cwd: CWD,
        judgmentDimensions: [...judgment(), { name: 'tests', result: 'PASS' }],
        warnings: [],
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PrerequisiteError);
    expect((caught as PrerequisiteError).suggestion).toContain(
      'Machine dimensions are read from the report',
    );
  });

  it('proven backfill excludes constitution + tests from the grade but still records them', async () => {
    seed({ scale: 'backfill', draft: true, reportJson: report({ tp: 'fail' }) });
    const result = await execute({
      cwd: CWD,
      judgmentDimensions: judgment({ constitution: 'FAIL' }),
      warnings: [],
    });
    expect(result.excludedFromGrade).toEqual(['constitution', 'tests']);
    // both FAILs are grade-excluded → S on the remaining inputs
    expect(result.grade).toBe('S');
    const written = vol.readFileSync(META, 'utf-8') as string;
    expect(written).toContain('name: tests');
    expect(written).toContain('name: constitution');
  });

  it('proven backfill records 1/5 task-completion as not-applicable — never the repo-wide check verdict (review C6a)', async () => {
    // The repo-wide task-completion check can FAIL because a SIBLING change
    // has unchecked tasks; a backfill change has no tasks.md by contract.
    seed({ scale: 'backfill', draft: true, reportJson: report({ tc: 'fail' }) });
    const result = await execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [] });
    const taskDim = result.dimensions.find((d) => d.name === 'task-completion')!;
    expect(taskDim.result).toBe('not-applicable');
    expect(result.grade).toBe('S');
    expect(vol.readFileSync(META, 'utf-8')).toContain('status: verified');
  });

  it('a grade-excluded skipped check does not consume the WARN budget on a proven backfill (review C6b)', async () => {
    // tests (test-provenance) is skipped AND grade-excluded → no auto warning,
    // S stays reachable; two caller warnings still land at A.
    seed({ scale: 'backfill', draft: true, reportJson: report({ tp: 'skipped' }) });
    const clean = await execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [] });
    expect(clean.grade).toBe('S');
    expect(clean.warnings).toEqual([]);
    seed({ scale: 'backfill', draft: true, reportJson: report({ tp: 'skipped' }) });
    const twoWarns = await execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: ['w1', 'w2'] });
    expect(twoWarns.grade).toBe('A');
  });

  it('unproven scale:backfill grades as standard and records the honesty WARN', async () => {
    seed({ scale: 'backfill', reportJson: report({ tp: 'fail' }) });
    const result = await execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [] });
    expect(result.excludedFromGrade).toEqual([]);
    expect(result.grade).toBe('C');
    expect(result.warnings.join(' ')).toContain('graded as standard');
  });

  it("embeds the skipped check's own reason verbatim in the recorded warning", async () => {
    seed({
      reportJson: report(
        { kh: 'skipped' },
        { skipReason: 'module-map.yaml not found — module boundaries unknown' },
      ),
    });
    const result = await execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [] });
    const warning = result.warnings.find((w) => w.startsWith('knowledge: not-adjudicated'))!;
    expect(warning).toContain('(module-map.yaml not found — module boundaries unknown)');
    // and it lands in the recorded quality_log ledger, not only in the result
    // (unwrap YAML's line folding before matching)
    const written = (vol.readFileSync(META, 'utf-8') as string).replace(/\n\s+/g, ' ');
    expect(written).toContain('module-map.yaml not found — module boundaries unknown');
  });
});

describe('report freshness guard', () => {
  it('refuses a report whose digest predates the current code state — nothing written', async () => {
    seed({ reportJson: report({}, { digest: 'digest-at-report-time' }) });
    vi.mocked(computeChangeDigest).mockReturnValue('digest-after-later-edits');
    const before = vol.readFileSync(META, 'utf-8') as string;
    let caught: unknown;
    try {
      await execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [] });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PrerequisiteError);
    expect((caught as PrerequisiteError).suggestion).toContain('prospec check --json');
    expect(vol.readFileSync(META, 'utf-8')).toBe(before);
  });

  it('refuses a report carrying no digest while the tree is fingerprintable', async () => {
    seed();
    vi.mocked(computeChangeDigest).mockReturnValue('current-digest');
    await expect(
      execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [] }),
    ).rejects.toThrow(/does not match the current code state/);
  });

  it('still grades from a fresh report whose digest matches', async () => {
    seed({ reportJson: report({}, { digest: 'same-digest' }) });
    vi.mocked(computeChangeDigest).mockReturnValue('same-digest');
    const result = await execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [] });
    expect(result.grade).toBe('S');
    expect(vol.readFileSync(META, 'utf-8')).toContain('status: verified');
  });
});
