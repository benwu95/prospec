import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { execute } from '../../../src/services/verify-record.service.js';
import { computeChangeDigest } from '../../../src/lib/drift-sources.js';
import { PrerequisiteError } from '../../../src/types/errors.js';
import type { QualityDimension } from '../../../src/types/change.js';
import { RELAYED_FIELD_MAX_CHARS } from '../../../src/types/station.js';
import { EVIDENCE_SECTION_MARKER } from '../../../src/lib/delegated-evidence.js';

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

const judgment = (
  over: Partial<Record<'delta' | 'constitution' | 'design', QualityDimension['result']>> = {},
  gradedBy: QualityDimension['graded_by'] = 'fresh-subagent',
): QualityDimension[] => [
  { name: 'delta-spec-compliance', result: over.delta ?? 'PASS', graded_by: gradedBy },
  { name: 'constitution', result: over.constitution ?? 'PASS', graded_by: gradedBy },
  { name: 'design', result: over.design ?? 'not-applicable', graded_by: gradedBy },
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

  it('proven backfill: an in-session grade on a scale-excluded dimension still caps S at A (review CS-1)', async () => {
    seed({ scale: 'backfill', draft: true });
    const dims: QualityDimension[] = [
      { name: 'delta-spec-compliance', result: 'PASS', graded_by: 'fresh-subagent' },
      { name: 'constitution', result: 'PASS', graded_by: 'in-session' },
      { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
    ];
    const result = await execute({ cwd: CWD, judgmentDimensions: dims, warnings: [], date: '2026-08-22' });
    expect(result.excludedFromGrade).toContain('constitution');
    expect(result.grade).toBe('A');
    expect(result.selfVerifiedCap).toBeDefined();
    expect(result.selfVerifiedCap!.dimensions).toEqual(['constitution']);
    expect(result.warnings).toEqual([]);
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

  it('refuses a judgment verdict missing graded_by — nothing written (flag form)', async () => {
    seed();
    const before = vol.readFileSync(META, 'utf-8') as string;
    // build the exact judgment set but strip graded_by from one dimension
    const dims: QualityDimension[] = judgment().map((d) =>
      d.name === 'constitution' ? { name: d.name, result: d.result } : d,
    );
    let caught: unknown;
    try {
      await execute({ cwd: CWD, judgmentDimensions: dims, warnings: [] });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PrerequisiteError);
    expect((caught as Error).message).toContain('missing graded_by: constitution');
    expect(vol.readFileSync(META, 'utf-8')).toBe(before);
  });

  it('caps the grade at A and reports the self-verification when a judgment dim is graded in-session', async () => {
    seed();
    const result = await execute({
      cwd: CWD,
      judgmentDimensions: judgment({}, 'in-session'),
      warnings: [],
      date: '2026-08-22',
    });
    expect(result.grade).toBe('A');
    expect(result.selfVerifiedCap).toBeDefined();
    expect(result.selfVerifiedCap!.dimensions).toContain('delta-spec-compliance');
    expect(result.selfVerifiedCap!.remedy).toContain('fresh context');
    // S/A still graduates — the cap only blocks S, not graduation
    expect(result.statusAdvanced).toBe(true);
    // the cap is NOT recorded as a budget WARN (it must not push A→B)
    expect(result.warnings).toEqual([]);
    expect(vol.readFileSync(META, 'utf-8')).toContain('graded_by: in-session');
  });

  it('records executor and spend from the run-level flag form', async () => {
    seed();
    const dims = judgment().map((d) => ({ ...d, executor: 'opus-tier fresh subagent', spend: 12000 }));
    await execute({ cwd: CWD, judgmentDimensions: dims, warnings: [], date: '2026-08-22' });
    const written = (vol.readFileSync(META, 'utf-8') as string).replace(/\n\s+/g, ' ');
    expect(written).toContain('executor: opus-tier fresh subagent');
    expect(written).toContain('spend: 12000');
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
  describe('--dimensions carries the verdicts and their evidence', () => {
    const VERIFY = '/repo/.prospec/changes/add-widget/verify.md';
    const DIMS = '/repo/verdicts.json';

    const verdicts = (over: Record<string, unknown>[] = []): unknown[] => [
      { name: 'delta-spec-compliance', result: 'PASS', graded_by: 'fresh-subagent', summary: '16 REQ 全數對上程式碼', repro: 'prospec spec show sdd-workflow --req REQ-LIB-049', evidence: 'REQ-LIB-049 對應 src/lib/delegated-evidence.ts。\n\n每條 AC 逐一核對。' },
      { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
      { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
      ...over,
    ];

    it('records the same quality_log field set as the flag form — evidence never reaches metadata', async () => {
      seed();
      await execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [], date: '2026-08-10' });
      const viaFlags = vol.readFileSync(META, 'utf-8') as string;

      vol.reset();
      vi.mocked(computeChangeDigest).mockReturnValue(null);
      seed();
      vol.writeFileSync(DIMS, JSON.stringify(verdicts()));
      await execute({ cwd: CWD, judgmentDimensions: [], dimensionsPath: DIMS, warnings: [], date: '2026-08-10' });
      const viaFile = vol.readFileSync(META, 'utf-8') as string;

      const keysOf = (yaml: string): string[] =>
        [...yaml.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]!);
      expect(keysOf(viaFile)).toEqual(keysOf(viaFlags));
      expect(viaFile).not.toContain('delegated-evidence.ts');
      expect(viaFile).not.toContain('16 REQ');
    });

    it('writes verify.md with one block per dimension carrying prose', async () => {
      seed();
      vol.writeFileSync(DIMS, JSON.stringify(verdicts()));
      const result = await execute({ cwd: CWD, judgmentDimensions: [], dimensionsPath: DIMS, warnings: [], date: '2026-08-10' });
      expect(result.evidencePath).toBe('.prospec/changes/add-widget/verify.md');
      const written = vol.readFileSync(VERIFY, 'utf-8') as string;
      expect(written).toContain('# Verify Evidence: add-widget');
      expect(written).toContain('## 2026-08-10 — grade S');
      expect(written).toContain('<!-- prospec:evidence delta-spec-compliance -->');
      expect(written).toContain('### delta-spec-compliance — PASS');
      expect(written).toContain('每條 AC 逐一核對。');
      // `constitution` and `design` carry no prose, so they get no block
      expect(written).not.toContain('prospec:evidence constitution');
    });

    it('appends a second dated section rather than overwriting the first', async () => {
      seed();
      vol.writeFileSync(DIMS, JSON.stringify(verdicts()));
      await execute({ cwd: CWD, judgmentDimensions: [], dimensionsPath: DIMS, warnings: [], date: '2026-08-10' });
      vol.writeFileSync(
        DIMS,
        JSON.stringify([
          { name: 'delta-spec-compliance', result: 'WARN', graded_by: 'fresh-subagent', evidence: '第二輪：一條 AC 仍缺證據' },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );
      await execute({ cwd: CWD, judgmentDimensions: [], dimensionsPath: DIMS, warnings: [], date: '2026-08-11' });
      const written = vol.readFileSync(VERIFY, 'utf-8') as string;
      expect(written).toContain('每條 AC 逐一核對。');
      expect(written).toContain('第二輪：一條 AC 仍缺證據');
      expect(written.match(/^## \d{4}-\d{2}-\d{2} — grade/gm)).toHaveLength(2);
    });

    it('writes no verify.md when no dimension carries prose', async () => {
      seed();
      vol.writeFileSync(
        DIMS,
        JSON.stringify([
          { name: 'delta-spec-compliance', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );
      const result = await execute({ cwd: CWD, judgmentDimensions: [], dimensionsPath: DIMS, warnings: [] });
      expect(result.evidencePath).toBeUndefined();
      expect(vol.existsSync(VERIFY)).toBe(false);
    });

    it.each([
      ['a missing file', undefined, /Dimensions file not found/],
      ['invalid JSON', 'not json', /not valid JSON/],
      [
        'a summary past its ceiling',
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'PASS',
            graded_by: 'fresh-subagent',
            summary: 's'.repeat(RELAYED_FIELD_MAX_CHARS.summary + 1),
          },
        ]),
        new RegExp(`summary is ${RELAYED_FIELD_MAX_CHARS.summary + 1} characters`),
      ],
      [
        'a marker inside evidence',
        JSON.stringify([
          { name: 'delta-spec-compliance', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent', evidence: '<!-- prospec:evidence-end -->' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
        /evidence-block grammar/,
      ],
    ] as const)('refuses %s before writing anything', async (_name, body, message) => {
      seed();
      if (body !== undefined) vol.writeFileSync(DIMS, body);
      const before = vol.readFileSync(META, 'utf-8');
      await expect(
        execute({ cwd: CWD, judgmentDimensions: [], dimensionsPath: DIMS, warnings: [] }),
      ).rejects.toThrow(message);
      expect(vol.readFileSync(META, 'utf-8')).toBe(before);
      expect(vol.existsSync(VERIFY)).toBe(false);
    });

    it('marker-delimits each run so quoted evidence cannot forge a dated grade entry', async () => {
      seed();
      vol.writeFileSync(
        DIMS,
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'PASS',
            graded_by: 'fresh-subagent',
            evidence: '引用上一輪的報告：\n\n## 2026-01-01 — grade S\n\n（以上為引文）',
          },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );
      await execute({ cwd: CWD, judgmentDimensions: [], dimensionsPath: DIMS, warnings: [], date: '2026-08-10' });
      const written = vol.readFileSync(VERIFY, 'utf-8') as string;
      // the quotation is preserved verbatim …
      expect(written).toContain('## 2026-01-01 — grade S');
      // … and reads as one run, because the marker is what delimits a run
      expect(written.split(EVIDENCE_SECTION_MARKER)).toHaveLength(2);
    });

    it('records the verdict even when the verify.md write fails — metadata leads', async () => {
      // The ordering property, pinned from the side a test can actually force: a
      // directory where verify.md belongs makes that write fail (EISDIR), and the
      // grade must already be recorded. Writing the artifact first meant the
      // reverse — a dated, graded evidence section for a run with no quality_log
      // entry at all.
      seed();
      vol.mkdirSync(VERIFY, { recursive: true });
      vol.writeFileSync(DIMS, JSON.stringify(verdicts()));
      await expect(
        execute({ cwd: CWD, judgmentDimensions: [], dimensionsPath: DIMS, warnings: [], date: '2026-08-10' }),
      ).rejects.toThrow();
      expect(vol.readFileSync(META, 'utf-8')).toContain('grade: S');
    });

    it('refuses both verdict forms at once', async () => {
      seed();
      vol.writeFileSync(DIMS, JSON.stringify(verdicts()));
      await expect(
        execute({ cwd: CWD, judgmentDimensions: judgment(), dimensionsPath: DIMS, warnings: [] }),
      ).rejects.toThrow(PrerequisiteError);
    });

    it('refuses a file entry missing graded_by at the schema layer — nothing written', async () => {
      seed();
      const before = vol.readFileSync(META, 'utf-8');
      vol.writeFileSync(
        DIMS,
        JSON.stringify([
          { name: 'delta-spec-compliance', result: 'PASS' }, // no graded_by
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );
      await expect(
        execute({ cwd: CWD, judgmentDimensions: [], dimensionsPath: DIMS, warnings: [] }),
      ).rejects.toThrow(/graded_by/);
      expect(vol.readFileSync(META, 'utf-8')).toBe(before);
    });

    it('carries per-entry graded_by / executor / spend from the file form into metadata', async () => {
      seed();
      vol.writeFileSync(
        DIMS,
        JSON.stringify([
          { name: 'delta-spec-compliance', result: 'PASS', graded_by: 'in-session', executor: 'sonnet in-session', spend: 8000 },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );
      const result = await execute({ cwd: CWD, judgmentDimensions: [], dimensionsPath: DIMS, warnings: [], date: '2026-08-22' });
      // one in-session judgment dim → grade capped at A with the self-verify note
      expect(result.grade).toBe('A');
      expect(result.selfVerifiedCap?.dimensions).toContain('delta-spec-compliance');
      const written = (vol.readFileSync(META, 'utf-8') as string).replace(/\n\s+/g, ' ');
      expect(written).toContain('graded_by: in-session');
      expect(written).toContain('executor: sonnet in-session');
      expect(written).toContain('spend: 8000');
    });
  });
});
