import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { execute } from '../../../src/services/verify-record.service.js';
import { assessCurrentDrift } from '../../../src/lib/drift-assessment.js';
import { PrerequisiteError } from '../../../src/types/errors.js';
import type { QualityDimension } from '../../../src/types/change.js';
import { computeAcceptanceDigest } from '../../../src/types/change.js';
import { RELAYED_FIELD_MAX_CHARS } from '../../../src/types/station.js';
import { EVIDENCE_SECTION_MARKER } from '../../../src/lib/delegated-evidence.js';
import type { ConstitutionRuleEntry } from '../../../src/types/drift-report.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

const live = vi.hoisted(() => ({ recheck: true, report: {} as unknown }));
vi.mock('../../../src/lib/drift-assessment.js', () => ({
  assessCurrentDrift: vi.fn(async () => ({ report: live.report, snapshot: { digest: 'current', clean: true }, recheck: () => live.recheck })),
}));

const liveContext = vi.hoisted(() => ({
  recheck: true,
  context: {
    version: 1 as const,
    change_name: 'add-widget',
    scale: 'standard' as const,
    context_id: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    spec: {
      source: '.prospec/changes/add-widget/delta-spec.md',
      content: '',
      digest: 'spec-digest',
      req_ids: ['REQ-WIDGET-001'],
    },
    proposal: {
      source: '.prospec/changes/add-widget/proposal.md',
      digest: 'proposal-digest',
    },
    baseline: {
      status: 'frozen' as const,
      revision: 1,
      digest: 'baseline-digest',
      scenarios: [
        { id: 'US-1-1', story_id: 'US-1', text: 'WHEN click, THEN add', source: 'proposal.md:1' },
      ],
      proposal_mismatch: false,
    },
    test_attempt: {
      status: 'passed' as const,
    },
    snapshot: {
      digest: 'snapshot-digest',
      scope: 'repository-inputs-v2' as const,
    },
  },
}));
vi.mock('../../../src/lib/verification-context.js', () => ({
  assessVerificationContext: vi.fn((cwd: string, changeName: string) => {
    const changeDir = `/repo/.prospec/changes/${changeName}`;
    const deltaPath = `${changeDir}/delta-spec.md`;
    const proposalPath = `${changeDir}/proposal.md`;
    const metadataPath = `${changeDir}/metadata.yaml`;
    const codePath = '/repo/src/index.ts';

    const initialDelta = vol.existsSync(deltaPath) ? Buffer.from(vol.readFileSync(deltaPath)) : null;
    const initialProposal = vol.existsSync(proposalPath) ? Buffer.from(vol.readFileSync(proposalPath)) : null;
    const initialMetadata = vol.existsSync(metadataPath) ? Buffer.from(vol.readFileSync(metadataPath)) : null;
    const initialCode = vol.existsSync(codePath) ? Buffer.from(vol.readFileSync(codePath)) : null;

    return {
      context: liveContext.context,
      recheck: () => {
        if (!liveContext.recheck) return false;
        try {
          if (initialDelta !== null) {
            if (!vol.existsSync(deltaPath)) return false;
            if (!initialDelta.equals(Buffer.from(vol.readFileSync(deltaPath)))) return false;
          } else if (vol.existsSync(deltaPath)) {
            return false;
          }
          if (initialProposal !== null) {
            if (!vol.existsSync(proposalPath)) return false;
            if (!initialProposal.equals(Buffer.from(vol.readFileSync(proposalPath)))) return false;
          } else if (vol.existsSync(proposalPath)) {
            return false;
          }
          if (initialMetadata !== null) {
            if (!vol.existsSync(metadataPath)) return false;
            if (!initialMetadata.equals(Buffer.from(vol.readFileSync(metadataPath)))) return false;
          } else if (vol.existsSync(metadataPath)) {
            return false;
          }
          if (initialCode !== null) {
            if (!vol.existsSync(codePath)) return false;
            if (!initialCode.equals(Buffer.from(vol.readFileSync(codePath)))) return false;
          } else if (vol.existsSync(codePath)) {
            return false;
          }
          return true;
        } catch {
          return false;
        }
      },
    };
  }),
}));

beforeEach(() => {
  vol.reset();
  live.recheck = true;
  liveContext.recheck = true;
  liveContext.context.context_id = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

const CWD = '/repo';
const META = '/repo/.prospec/changes/add-widget/metadata.yaml';

function report(
  statuses: { tc?: string; kh?: string; tp?: string; rp?: string; cs?: string; lp?: string; id?: string } = {},
  extra: {
    digest?: string | null;
    skipReason?: string;
    subjects?: string[];
    omitSubjects?: boolean;
    failingChange?: string;
    constitution?: { rules: ConstitutionRuleEntry[] };
    extraChecks?: Array<{ id: string; status: string; reason?: string }>;
  } = {},
): string {
  // Change-scoped checks enumerate their subjects (the target by default) and
  // anchor a fail under the target's change dir — the engine's own shape, so the
  // per-change adjudication reads them the way it reads a real report.
  const CHANGE_SCOPED = new Set(['task-completion', 'test-provenance', 'review-provenance']);
  const subjects = extra.subjects ?? ['add-widget'];
  const check = (id: string, status: string) =>
    status === 'skipped'
      ? { id, status, reason: extra.skipReason ?? 'source unavailable', ...(CHANGE_SCOPED.has(id) ? { subjects } : {}) }
      : { id, status, ...(CHANGE_SCOPED.has(id) && !extra.omitSubjects ? { subjects } : {}) };
  const findings = ['task-completion', 'test-provenance', 'review-provenance']
    .filter((id) => ({ 'task-completion': statuses.tc, 'test-provenance': statuses.tp, 'review-provenance': statuses.rp } as Record<string, string | undefined>)[id] === 'fail')
    .map((id) => ({ check: id, severity: 'fail', source_path: `.prospec/changes/${extra.failingChange ?? 'add-widget'}/metadata.yaml`, detail: `${id} fails` }));
  const checks: Array<{ id: string; status: string; reason?: string }> = [
    check('task-completion', statuses.tc ?? 'pass'),
    check('knowledge-health', statuses.kh ?? 'pass'),
    check('test-provenance', statuses.tp ?? 'pass'),
  ];
  // review-provenance / constitution-severity are added ONLY when a test asks for
  // them, so the shared fixtures do not trip Gate A / Gate D1 by default.
  checks.push(check('review-provenance', statuses.rp ?? 'pass'));
  if (statuses.cs !== undefined) checks.push(check('constitution-severity', statuses.cs));
  if (statuses.lp !== undefined) checks.push(check('language-policy-drift', statuses.lp));
  if (statuses.id !== undefined) checks.push(check('import-direction', statuses.id));
  if (extra.extraChecks !== undefined) checks.push(...extra.extraChecks);
  return JSON.stringify({
    version: 1,
    generated_at: '2026-07-30T00:00:00.000Z',
    ...(extra.digest !== undefined ? { change_digest: extra.digest } : {}),
    structural: {
      checks,
      findings,
      ...(extra.constitution !== undefined ? { constitution: extra.constitution } : {}),
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

function seed(opts: { scale?: string; status?: string; reportJson?: string; draft?: boolean; acceptance?: boolean } = {}): void {
  const acceptanceYaml = opts.acceptance
    ? `acceptance:
  version: 1
  current_revision: 1
  revisions:
    - revision: 1
      digest: ${computeAcceptanceDigest([{ id: 'US-1-1', text: 'WHEN click, THEN add' }])}
      captured_at: 2026-09-20T10:00:00.000Z
      captured_status: story
      origin: story
      reason: initial freeze
      scenarios:
        - id: US-1-1
          story_id: US-1
          text: WHEN click, THEN add
          source: proposal.md:5
`
    : '';
  const files: Record<string, string> = {
    [META]: `name: add-widget
created_at: 2026-07-13T09:51:00.000Z
status: ${opts.status ?? 'implemented'}
${opts.scale ? `scale: ${opts.scale}\n` : ''}${acceptanceYaml}`,
    '/repo/prospec-report.json': opts.reportJson ?? report(),
  };
  if (opts.draft) files['/repo/.prospec/changes/add-widget/backfill-draft.md'] = '**Feature:** x\n**Story:** US-1\n';
  vol.fromJSON(files);
  live.report = JSON.parse(opts.reportJson ?? report());
}

describe('verify-record service', () => {
  it.each(['PASS', 'FAIL'] as const)('R277-7 normalizes quick %s to not-applicable in metadata and report', async (result) => {
    seed({ scale: 'quick' });
    const dimsPath = '/repo/dimensions.json';
    vol.writeFileSync(dimsPath, JSON.stringify(judgment({ delta: result }).map((d) => ({ ...d, summary: 'informational quick input' }))));
    const recorded = await execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] });
    expect(recorded.dimensions.find((d) => d.name === 'delta-spec-compliance')?.result).toBe('not-applicable');
    expect(recorded.grade).toBe('S');
    expect(vol.readFileSync('/repo/.prospec/changes/add-widget/verify.md', 'utf8')).toContain('delta-spec-compliance — not-applicable');
  });

  it.each(['standard', 'full', 'backfill'])('R277-8 discloses missing delta-spec for legacy %s payloads', async (scale) => {
    seed({ scale, draft: scale === 'backfill' });
    const recorded = await execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [] });
    expect(recorded.dimensions.find((d) => d.name === 'delta-spec-compliance')?.result).toBe('not-adjudicated');
    expect(recorded.grade).toBe('A');
    expect(recorded.warnings).toHaveLength(1);
    expect(vol.readFileSync('/repo/.prospec/changes/add-widget/verify.md', 'utf8')).toContain('empty requirement set');
  });
  it('grades A with a disclosed missing-delta gap despite all-pass aggregate inputs, and advances to verified', async () => {
    seed();
    const result = await execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [], date: '2026-07-30' });
    expect(result.grade).toBe('A');
    expect(result.result).toBe('PASS');
    expect(result.statusAdvanced).toBe(true);
    const written = vol.readFileSync(META, 'utf-8') as string;
    expect(written).toContain('status: verified');
    expect(written).toContain('grade: A');
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

  it('adjudicates without a saved report', async () => {
    seed();
    vol.unlinkSync('/repo/prospec-report.json');
    await expect(
      execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [] }),
    ).resolves.toMatchObject({ grade: 'A' });
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
    // Both FAILs are excluded; the missing-delta gap still caps the grade at A.
    expect(result.grade).toBe('A');
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
    expect(result.grade).toBe('A');
    expect(vol.readFileSync(META, 'utf-8')).toContain('status: verified');
  });

  it('a grade-excluded skipped check does not consume the WARN budget on a proven backfill (review C6b)', async () => {
    // tests (test-provenance) is skipped AND grade-excluded → no auto warning,
    // Only the missing-delta gap counts; two caller warnings bring the total to three.
    seed({ scale: 'backfill', draft: true, reportJson: report({ tp: 'skipped' }) });
    const clean = await execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [] });
    expect(clean.grade).toBe('A');
    expect(clean.warnings).toEqual([expect.stringContaining('empty requirement set')]);
    seed({ scale: 'backfill', draft: true, reportJson: report({ tp: 'skipped' }) });
    const twoWarns = await execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: ['w1', 'w2'] });
    expect(twoWarns.grade).toBe('B');
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
    expect(result.warnings).toEqual([expect.stringContaining('empty requirement set')]);
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
    expect(result.warnings).toEqual([expect.stringContaining('empty requirement set')]);
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
  it('refuses a changed observation receipt before any write', async () => {
    seed(); live.recheck = false;
    const before = vol.readFileSync(META, 'utf8');
    await expect(execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [] })).rejects.toThrow(/inputs changed or are unprovable/);
    expect(vol.readFileSync(META, 'utf8')).toBe(before);
  });
  it('ignores stale saved reports and uses the current assessment', async () => {
    seed({ reportJson: report({}, { digest: 'old' }) });
    live.report = JSON.parse(report({ tp: 'fail' }));
    const result = await execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [] });
    expect(result.grade).toBe('C');
    expect(assessCurrentDrift).toHaveBeenCalledWith(CWD);
  });
  it('grades from current facts independently of the saved digest', async () => {
    seed({ reportJson: report({}, { digest: 'old' }) });
    expect((await execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [] })).grade).toBe('A');
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
      live.recheck = true;
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
      expect(written).toContain('## 2026-08-10 — grade A');
      expect(written).toContain('<!-- prospec:evidence delta-spec-compliance -->');
      expect(written).toContain('### delta-spec-compliance — not-adjudicated');
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

    it('writes the missing-input gap even when no dimension carries prose', async () => {
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
      expect(result.evidencePath).toBe('.prospec/changes/add-widget/verify.md');
      expect(vol.readFileSync(VERIFY, 'utf8')).toContain('empty requirement set');
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
      expect(vol.readFileSync(META, 'utf-8')).toContain('grade: A');
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

describe('verify-record Gate A — review-provenance', () => {
  it('refuses to record when review-provenance FAILs, before any write', async () => {
    seed({ reportJson: report({ rp: 'fail' }) });
    const err = await execute({
      cwd: CWD,
      judgmentDimensions: judgment(),
      warnings: [],
      date: '2026-08-29',
    }).catch((e) => e);
    expect(err).toBeInstanceOf(PrerequisiteError);
    expect(err.message).toMatch(/review-provenance FAILs/);
    expect(err.suggestion).toContain('prospec-review');
    // refuse-before-write: metadata untouched
    expect(vol.readFileSync(META, 'utf-8') as string).toContain('status: implemented');
  });

  it('records normally when review-provenance is skipped (proven backfill / no review)', async () => {
    seed({ scale: 'backfill', draft: true, reportJson: report({ rp: 'skipped' }) });
    const result = await execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [], date: '2026-08-29' });
    expect(result.grade).toBe('A');
  });

  it('records normally when review-provenance PASSes', async () => {
    seed({ reportJson: report({ rp: 'pass' }) });
    const result = await execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [], date: '2026-08-29' });
    expect(result.grade).toBe('A');
  });

  it('refuses when required current review facts are absent', async () => {
    seed();
    const source = JSON.parse(report());
    source.structural.checks = source.structural.checks.filter((c: { id: string }) => c.id !== 'review-provenance');
    live.report = source;
    await expect(execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [] })).rejects.toThrow(/review-provenance/);
  });
});

describe('verify-record Gate D1 — judgment may not undercut its machine counterpart', () => {
  it('refuses a PASS constitution when constitution-severity FAILs', async () => {
    seed({ reportJson: report({ cs: 'fail' }) });
    const err = await execute({
      cwd: CWD,
      judgmentDimensions: judgment({ constitution: 'PASS' }),
      warnings: [],
      date: '2026-08-29',
    }).catch((e) => e);
    expect(err).toBeInstanceOf(PrerequisiteError);
    expect(err.message).toMatch(/constitution.*constitution-severity/);
    expect(vol.readFileSync(META, 'utf-8') as string).toContain('status: implemented');
  });

  it('refuses a PASS constitution when constitution-severity WARNs', async () => {
    seed({ reportJson: report({ cs: 'warn' }) });
    const err = await execute({
      cwd: CWD,
      judgmentDimensions: judgment({ constitution: 'PASS' }),
      warnings: [],
      date: '2026-08-29',
    }).catch((e) => e);
    expect(err).toBeInstanceOf(PrerequisiteError);
  });

  it('refuses a not-adjudicated constitution when constitution-severity FAILs', async () => {
    seed({ reportJson: report({ cs: 'fail' }) });
    const err = await execute({
      cwd: CWD,
      judgmentDimensions: judgment({ constitution: 'not-adjudicated' }),
      warnings: [],
      date: '2026-08-29',
    }).catch((e) => e);
    expect(err).toBeInstanceOf(PrerequisiteError);
  });

  it('allows a FAIL judgment when the machine also FAILs (meets the floor)', async () => {
    seed({ reportJson: report({ cs: 'fail' }) });
    const result = await execute({
      cwd: CWD,
      judgmentDimensions: judgment({ constitution: 'FAIL' }),
      warnings: [],
      date: '2026-08-29',
    });
    // a FAIL judgment dimension lowers the grade but is recorded, not refused
    expect(result.grade).not.toBe('S');
  });

  it('allows a stricter judgment than the machine (reverse is legitimate)', async () => {
    seed({ reportJson: report({ cs: 'pass' }) });
    const result = await execute({
      cwd: CWD,
      judgmentDimensions: judgment({ constitution: 'FAIL' }),
      warnings: [],
      date: '2026-08-29',
    });
    expect(result.grade).not.toBe('S'); // recorded, not refused
  });

  it('sets no floor when constitution-severity passes/absent', async () => {
    seed({ reportJson: report({ cs: 'pass' }) });
    const pass = await execute({ cwd: CWD, judgmentDimensions: judgment({ constitution: 'PASS' }), warnings: [], date: '2026-08-29' });
    expect(pass.grade).toBe('A');

    seed(); // constitution-severity absent
    const absent = await execute({ cwd: CWD, judgmentDimensions: judgment({ constitution: 'PASS' }), warnings: [], date: '2026-08-29' });
    expect(absent.grade).toBe('A');
  });
});

describe('verify-record — per-change adjudication (REQ-TEMPLATES-131 / issue #266)', () => {
  it("a sibling change's failing tests and missing review do not grade this change", async () => {
    seed({ reportJson: report({ tp: 'fail', rp: 'fail' }, { subjects: ['add-widget', 'other'], failingChange: 'other' }) });
    const result = await execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [] });
    expect(result.grade).toBe('A');
    expect(result.dimensions.find((d) => d.name === 'tests')?.result).toBe('PASS');
  });

  it('refuses Gate A as unprovable when the engine never enumerated this change', async () => {
    seed({ reportJson: report({}, { subjects: ['other'] }) });
    await expect(execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [] })).rejects.toThrow(/unprovable/);
    expect(vol.readFileSync(META, 'utf-8')).toContain('status: implemented');
  });

  it('refuses Gate A on a legacy report without subjects, and grades machine dims not-adjudicated for a proven backfill on such a report', async () => {
    seed({ reportJson: report({}, { omitSubjects: true }) });
    await expect(execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [] })).rejects.toThrow(/enumerated no subjects/);
    seed({ scale: 'backfill', draft: true, reportJson: report({}, { omitSubjects: true }) });
    const result = await execute({ cwd: CWD, judgmentDimensions: judgment(), warnings: [] });
    expect(result.dimensions.find((d) => d.name === 'tests')?.result).toBe('not-adjudicated');
  });
});

describe('verify-record — constitution audit integration (REQ-SERVICES-113)', () => {
  const constitutionReport = (extraOpts: { lpStatus?: string; csStatus?: string; extraRules?: ConstitutionRuleEntry[] } = {}) =>
    report(
      { cs: extraOpts.csStatus ?? 'pass', lp: extraOpts.lpStatus ?? 'pass' },
      {
        constitution: {
          rules: [
            {
              name: 'Language Policy',
              severity: 'MUST',
              has_verify_hint: true,
              line: 10,
              check_id: 'language-policy-drift',
              coverage: 'change artifacts only',
            },
            {
              name: 'INVEST Criteria',
              severity: 'MUST',
              has_verify_hint: true,
              line: 20,
            },
            ...(extraOpts.extraRules ?? []),
          ],
        },
      },
    );

  it('incorporates constitution_rules, accepts valid statements, and advances status', async () => {
    seed({ reportJson: constitutionReport() });
    const dimsPath = '/repo/dimensions.json';
    vol.writeFileSync(
      dimsPath,
      JSON.stringify([
        { name: 'delta-spec-compliance', result: 'PASS', graded_by: 'fresh-subagent' },
        {
          name: 'constitution',
          result: 'PASS',
          graded_by: 'fresh-subagent',
          constitution_rules: [
            { name: 'Language Policy', result: 'PASS', statement: 'Follows conventions' },
            { name: 'INVEST Criteria', result: 'PASS', statement: 'Follows INVEST' },
          ],
        },
        { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
      ]),
    );

    const result = await execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] });
    expect(result.grade).toBe('A');
    expect(result.statusAdvanced).toBe(true);
  });

  it('refuses before write when grader entry flips machine verdict', async () => {
    seed({ reportJson: constitutionReport() });
    const dimsPath = '/repo/dimensions.json';
    vol.writeFileSync(
      dimsPath,
      JSON.stringify([
        { name: 'delta-spec-compliance', result: 'PASS', graded_by: 'fresh-subagent' },
        {
          name: 'constitution',
          result: 'PASS',
          graded_by: 'fresh-subagent',
          constitution_rules: [
            // Machine verdict is PASS; grader tries to flip to FAIL
            { name: 'Language Policy', result: 'FAIL', statement: 'Violation' },
            { name: 'INVEST Criteria', result: 'PASS', statement: 'Follows INVEST' },
          ],
        },
        { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
      ]),
    );

    await expect(
      execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] }),
    ).rejects.toThrow(PrerequisiteError);
    // Metadata remains implemented, not verified
    expect(vol.readFileSync(META, 'utf-8')).toContain('status: implemented');
  });

  it('refuses before write naming a required rule whose statement is missing', async () => {
    // Required: Language Policy (has covers) + INVEST Criteria (no check_id)
    seed({ reportJson: constitutionReport() });
    const dimsPath = '/repo/dimensions.json';
    vol.writeFileSync(
      dimsPath,
      JSON.stringify([
        { name: 'delta-spec-compliance', result: 'PASS', graded_by: 'fresh-subagent' },
        {
          name: 'constitution',
          result: 'PASS',
          graded_by: 'fresh-subagent',
          constitution_rules: [
            // Language Policy carries no statement — it is a required rule
            { name: 'Language Policy', result: 'PASS' },
            { name: 'INVEST Criteria', result: 'PASS', statement: 'Follows INVEST' },
          ],
        },
        { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
      ]),
    );

    await expect(
      execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] }),
    ).rejects.toThrow(/missing a grader statement.*Language Policy/i);
    expect(vol.readFileSync(META, 'utf-8')).toContain('status: implemented');
  });

  it('refuses the flag form with an actionable message when the Constitution declares checks (F-6)', async () => {
    // Flag form (--dimension constitution=PASS) has no constitution_rules channel,
    // so a Constitution that declares checks cannot be graded through it.
    seed({ reportJson: constitutionReport() });
    let caught: unknown;
    try {
      await execute({
        cwd: CWD,
        judgmentDimensions: judgment({ constitution: 'PASS' }),
        warnings: [],
        date: '2026-08-29',
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PrerequisiteError);
    // Names the missing rules AND points to the --dimensions file form
    expect((caught as PrerequisiteError).suggestion).toMatch(/--dimensions file form/);
    expect((caught as Error).message).toMatch(/Language Policy/);
    expect(vol.readFileSync(META, 'utf-8')).toContain('status: implemented');
  });

  it('accepts a legacy payload carrying score and ignores score', async () => {
    seed({ reportJson: constitutionReport() });
    const dimsPath = '/repo/dimensions.json';
    vol.writeFileSync(
      dimsPath,
      JSON.stringify([
        { name: 'delta-spec-compliance', result: 'PASS', graded_by: 'fresh-subagent', score: 5 },
        {
          name: 'constitution',
          result: 'PASS',
          graded_by: 'fresh-subagent',
          score: 4,
          constitution_rules: [
            { name: 'Language Policy', result: 'PASS', statement: 'Good' },
            { name: 'INVEST Criteria', result: 'PASS', statement: 'Good' },
          ],
        },
        { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent', score: 5 },
      ]),
    );

    const result = await execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] });
    expect(result.grade).toBe('A');
    expect(result.statusAdvanced).toBe(true);
  });

  it('runs original backward-compat path when Constitution declares no check:', async () => {
    // Constitution with no check_id declared
    const noCheckReport = report(
      {},
      {
        constitution: {
          rules: [
            { name: 'Rule 1', severity: 'MUST', has_verify_hint: false, line: 10 },
            { name: 'Rule 2', severity: 'SHOULD', has_verify_hint: false, line: 20 },
          ],
        },
      },
    );
    seed({ reportJson: noCheckReport });
    const result = await execute({
      cwd: CWD,
      judgmentDimensions: judgment(),
      warnings: [],
      date: '2026-08-29',
    });
    expect(result.grade).toBe('A');
    expect(result.statusAdvanced).toBe(true);
  });

  it('floors constitution dimension when machine sub-ledger reports FAIL or WARN', async () => {
    // Language policy fails
    seed({ reportJson: constitutionReport({ lpStatus: 'fail' }) });
    const dimsPath = '/repo/dimensions.json';
    vol.writeFileSync(
      dimsPath,
      JSON.stringify([
        { name: 'delta-spec-compliance', result: 'PASS', graded_by: 'fresh-subagent' },
        {
          name: 'constitution',
          result: 'PASS', // Grader says PASS, but machine ledger is FAIL
          graded_by: 'fresh-subagent',
          constitution_rules: [
            { name: 'Language Policy', result: 'FAIL', statement: 'Failed' },
            { name: 'INVEST Criteria', result: 'PASS', statement: 'Good' },
          ],
        },
        { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
      ]),
    );

    await expect(
      execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] }),
    ).rejects.toThrow(/cannot be more lenient than a machine/);
  });

  describe('verification context and per-REQ requirement judgments (T10, T11, T22)', () => {
    const DELTA_FILE = '/repo/.prospec/changes/add-widget/delta-spec.md';
    const CONTEXT_FILE = '/repo/.prospec/changes/add-widget/verify-context.json';
    const sampleDeltaSpec = `# Delta Spec
## ADDED
### REQ-WIDGET-001: First feature
**Feature:** widget
**Story:** US-1
**Description:** First
**Spec:**
Spec details.
- WHEN click, THEN add
`;

    it('refuses when context_id is supplied but saved verify-context.json is missing', async () => {
      seed();
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(
        dimsPath,
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'PASS',
            graded_by: 'fresh-subagent',
            context_id: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
            items: [{ req_id: 'REQ-WIDGET-001', result: 'PASS', evidence_kind: 'document', evidence: 'test passed' }],
          },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );

      await expect(
        execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] }),
      ).rejects.toThrow(/Saved verification context not found/);
    });

    it('refuses when saved verify-context.json context_id does not match supplied context_id', async () => {
      seed();
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      vol.writeFileSync(
        CONTEXT_FILE,
        JSON.stringify({ context_id: '9999999999abcdef0123456789abcdef0123456789abcdef0123456789abcdef' }),
      );
      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(
        dimsPath,
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'PASS',
            graded_by: 'fresh-subagent',
            context_id: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
            items: [{ req_id: 'REQ-WIDGET-001', result: 'PASS', evidence_kind: 'document', evidence: 'test passed' }],
          },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );

      await expect(
        execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] }),
      ).rejects.toThrow(/Saved verification context ID mismatch/);
    });

    it('refuses when live context assessment produces different context_id than supplied context_id (drift)', async () => {
      seed();
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      vol.writeFileSync(
        CONTEXT_FILE,
        JSON.stringify(liveContext.context),
      );
      liveContext.context.context_id = 'different111111110123456789abcdef0123456789abcdef0123456789abcdef';

      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(
        dimsPath,
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'PASS',
            graded_by: 'fresh-subagent',
            context_id: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
            items: [{ req_id: 'REQ-WIDGET-001', result: 'PASS', evidence_kind: 'document', evidence: 'test passed' }],
          },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );

      await expect(
        execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] }),
      ).rejects.toThrow(/Verification context is stale or changed since grading/);
    });

    it('refuses when live context assessment recheck fails', async () => {
      seed();
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      vol.writeFileSync(
        CONTEXT_FILE,
        JSON.stringify(liveContext.context),
      );
      liveContext.recheck = false;

      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(
        dimsPath,
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'PASS',
            graded_by: 'fresh-subagent',
            context_id: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
            items: [{ req_id: 'REQ-WIDGET-001', result: 'PASS', evidence_kind: 'document', evidence: 'test passed' }],
          },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );

      await expect(
        execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] }),
      ).rejects.toThrow(/verification inputs changed or are unprovable/);
    });

    it('refuses when item evidence contains evidence marker', async () => {
      seed();
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(
        dimsPath,
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'PASS',
            graded_by: 'fresh-subagent',
            items: [{ req_id: 'REQ-WIDGET-001', result: 'PASS', evidence_kind: 'document', evidence: '<!-- prospec:evidence forged --> test' }],
          },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );

      await expect(
        execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] }),
      ).rejects.toThrow(/carries `<!-- prospec:evidence`/);
    });

    it('refuses when scenario finding contains evidence marker', async () => {
      seed();
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(
        dimsPath,
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'PASS',
            graded_by: 'fresh-subagent',
            scenario_findings: [
              {
                scenario_id: 'US-1-1',
                spec_location: 'delta-spec.md:5',
                result: 'FAIL',
                summary: '<!-- prospec:evidence --> unsafe summary',
                evidence: 'finding evidence',
              },
            ],
          },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );

      await expect(
        execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] }),
      ).rejects.toThrow(/carries `<!-- prospec:evidence`/);
    });

    it('refuses when scenario_findings are supplied but change has no acceptance baseline revisions', async () => {
      seed();
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(
        dimsPath,
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'FAIL',
            graded_by: 'fresh-subagent',
            scenario_findings: [
              {
                scenario_id: 'US-1-1',
                spec_location: 'delta-spec.md:5',
                result: 'FAIL',
                summary: 'finding summary',
                evidence: 'finding evidence',
              },
            ],
          },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );

      await expect(
        execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] }),
      ).rejects.toThrow(/scenario_findings supplied but change has no acceptance baseline revisions/);
    });

    it('refuses when scenario finding references an unknown scenario_id', async () => {
      seed({ acceptance: true });
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(
        dimsPath,
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'FAIL',
            graded_by: 'fresh-subagent',
            scenario_findings: [
              {
                scenario_id: 'UNKNOWN-99',
                spec_location: 'delta-spec.md:5',
                result: 'FAIL',
                summary: 'bad scenario',
                evidence: 'finding evidence',
              },
            ],
          },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );

      await expect(
        execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] }),
      ).rejects.toThrow(/unknown scenario_id "UNKNOWN-99"/);
    });

    it('refuses when supplied aggregate PASS is less strict than item FAIL floor', async () => {
      seed();
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(
        dimsPath,
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'PASS', // supplied PASS but item FAIL
            graded_by: 'fresh-subagent',
            items: [{ req_id: 'REQ-WIDGET-001', result: 'FAIL', evidence_kind: 'executable', evidence: 'test failed', repro: 'pnpm test' }],
          },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );

      await expect(
        execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] }),
      ).rejects.toThrow(/less strict than item\/finding floor FAIL/);
    });

    it('writes verify.md with requirements table and missing rows even without prose', async () => {
      seed();
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(
        dimsPath,
        JSON.stringify([
          { name: 'delta-spec-compliance', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );

      const result = await execute({
        cwd: CWD,
        dimensionsPath: dimsPath,
        judgmentDimensions: [],
        warnings: [],
        date: '2026-09-20',
      });

      expect(result.evidencePath).toBe('.prospec/changes/add-widget/verify.md');
      expect(vol.existsSync('/repo/.prospec/changes/add-widget/verify.md')).toBe(true);
      const verifyContent = vol.readFileSync('/repo/.prospec/changes/add-widget/verify.md', 'utf8') as string;
      expect(verifyContent).toContain('REQ-WIDGET-001');
      expect(verifyContent).toContain('not-adjudicated');
      expect(result.grade).toBe('A'); // normalized from PASS to not-adjudicated because REQs are missing
      expect(result.warnings.some((w) => w.includes('missing requirement judgments'))).toBe(true);
      expect(verifyContent).toContain('### delta-spec-compliance — not-adjudicated');
      expect(verifyContent).toContain('acceptance baseline is missing');
      expect(verifyContent).toContain('verification context projection is missing');
    });

    it('R277-4 refuses edited projection content that retains its original context_id', async () => {
      seed();
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      const saved = structuredClone(liveContext.context);
      saved.spec.content = 'Tampered specification';
      vol.writeFileSync(CONTEXT_FILE, JSON.stringify(saved));
      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(dimsPath, JSON.stringify([
        { name: 'delta-spec-compliance', result: 'PASS', graded_by: 'fresh-subagent', context_id: saved.context_id },
        { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
        { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
      ]));
      const before = vol.readFileSync(META, 'utf8');
      await expect(execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] })).rejects.toThrow(/context.*integrity/i);
      expect(vol.readFileSync(META, 'utf8')).toBe(before);
      expect(vol.existsSync('/repo/.prospec/changes/add-widget/verify.md')).toBe(false);
    });

    it('R277-4 rechecks the saved projection immediately before metadata writes', async () => {
      seed();
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      vol.writeFileSync(CONTEXT_FILE, JSON.stringify(liveContext.context));
      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(dimsPath, JSON.stringify([
        { name: 'delta-spec-compliance', result: 'PASS', graded_by: 'fresh-subagent', context_id: liveContext.context.context_id },
        { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
        { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
      ]));
      vi.mocked(assessCurrentDrift).mockImplementationOnce(async () => {
        vol.writeFileSync(CONTEXT_FILE, '{}');
        return { report: live.report, recheck: () => true } as Awaited<ReturnType<typeof assessCurrentDrift>>;
      });
      const before = vol.readFileSync(META, 'utf8');
      await expect(execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] })).rejects.toThrow(/verification inputs changed/);
      expect(vol.readFileSync(META, 'utf8')).toBe(before);
      expect(vol.existsSync('/repo/.prospec/changes/add-widget/verify.md')).toBe(false);
    });

    it('rechecks acceptance baseline in metadata immediately before metadata writes: refuses, zero-write, external change intact', async () => {
      seed({ acceptance: true });
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      vol.writeFileSync(CONTEXT_FILE, JSON.stringify(liveContext.context));
      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(dimsPath, JSON.stringify([
        { name: 'delta-spec-compliance', result: 'PASS', graded_by: 'fresh-subagent', context_id: liveContext.context.context_id },
        { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
        { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
      ]));
      let mutatedMeta = '';
      vi.mocked(assessCurrentDrift).mockImplementationOnce(async () => {
        const currentMeta = vol.readFileSync(META, 'utf8') as string;
        mutatedMeta = currentMeta.replace('WHEN click, THEN add', 'WHEN click, THEN modified action');
        vol.writeFileSync(META, mutatedMeta);
        return { report: live.report, recheck: () => true } as Awaited<ReturnType<typeof assessCurrentDrift>>;
      });
      await expect(execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] })).rejects.toThrow(/verification inputs changed/);
      expect(vol.readFileSync(META, 'utf8')).toBe(mutatedMeta);
      expect(vol.existsSync('/repo/.prospec/changes/add-widget/verify.md')).toBe(false);
    });

    it('rechecks delta-spec immediately before metadata writes: refuses, zero-write, external change intact', async () => {
      seed();
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      vol.writeFileSync(CONTEXT_FILE, JSON.stringify(liveContext.context));
      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(dimsPath, JSON.stringify([
        { name: 'delta-spec-compliance', result: 'PASS', graded_by: 'fresh-subagent', context_id: liveContext.context.context_id },
        { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
        { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
      ]));
      const mutatedSpec = sampleDeltaSpec + '\n### REQ-WIDGET-002: Added during drift assessment\n';
      const beforeMeta = vol.readFileSync(META, 'utf8');
      vi.mocked(assessCurrentDrift).mockImplementationOnce(async () => {
        vol.writeFileSync(DELTA_FILE, mutatedSpec);
        return { report: live.report, recheck: () => true } as Awaited<ReturnType<typeof assessCurrentDrift>>;
      });
      await expect(execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] })).rejects.toThrow(/verification inputs changed/);
      expect(vol.readFileSync(DELTA_FILE, 'utf8')).toBe(mutatedSpec);
      expect(vol.readFileSync(META, 'utf8')).toBe(beforeMeta);
      expect(vol.existsSync('/repo/.prospec/changes/add-widget/verify.md')).toBe(false);
    });

    it('rechecks proposal immediately before metadata writes: refuses, zero-write, external change intact', async () => {
      seed();
      const PROPOSAL_FILE = '/repo/.prospec/changes/add-widget/proposal.md';
      const originalProposal = '# Proposal: Add Widget\n## User Stories\n### US-1: Widget\n**Acceptance Scenarios:**\n- WHEN click, THEN add\n';
      vol.writeFileSync(PROPOSAL_FILE, originalProposal);
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      vol.writeFileSync(CONTEXT_FILE, JSON.stringify(liveContext.context));
      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(dimsPath, JSON.stringify([
        { name: 'delta-spec-compliance', result: 'PASS', graded_by: 'fresh-subagent', context_id: liveContext.context.context_id },
        { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
        { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
      ]));
      const mutatedProposal = originalProposal + '\n### US-2: Second Story during drift\n';
      const beforeMeta = vol.readFileSync(META, 'utf8');
      vi.mocked(assessCurrentDrift).mockImplementationOnce(async () => {
        vol.writeFileSync(PROPOSAL_FILE, mutatedProposal);
        return { report: live.report, recheck: () => true } as Awaited<ReturnType<typeof assessCurrentDrift>>;
      });
      await expect(execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] })).rejects.toThrow(/verification inputs changed/);
      expect(vol.readFileSync(PROPOSAL_FILE, 'utf8')).toBe(mutatedProposal);
      expect(vol.readFileSync(META, 'utf8')).toBe(beforeMeta);
      expect(vol.existsSync('/repo/.prospec/changes/add-widget/verify.md')).toBe(false);
    });

    it('rechecks test_attempt in metadata immediately before metadata writes: refuses, zero-write, external change intact', async () => {
      seed();
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      vol.writeFileSync(CONTEXT_FILE, JSON.stringify(liveContext.context));
      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(dimsPath, JSON.stringify([
        { name: 'delta-spec-compliance', result: 'PASS', graded_by: 'fresh-subagent', context_id: liveContext.context.context_id },
        { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
        { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
      ]));
      let mutatedMeta = '';
      vi.mocked(assessCurrentDrift).mockImplementationOnce(async () => {
        const currentMeta = vol.readFileSync(META, 'utf8') as string;
        mutatedMeta = currentMeta + '\ntest_attempt:\n  id: attempt-mutated-prewrite\n  outcome: failed\n  exit_code: 1\n  command: pnpm test\n';
        vol.writeFileSync(META, mutatedMeta);
        return { report: live.report, recheck: () => true } as Awaited<ReturnType<typeof assessCurrentDrift>>;
      });
      await expect(execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] })).rejects.toThrow(/verification inputs changed/);
      expect(vol.readFileSync(META, 'utf8')).toBe(mutatedMeta);
      expect(vol.existsSync('/repo/.prospec/changes/add-widget/verify.md')).toBe(false);
    });

    it('rechecks code snapshot immediately before metadata writes: refuses, zero-write, external change intact', async () => {
      seed();
      vol.mkdirSync('/repo/src', { recursive: true });
      vol.writeFileSync('/repo/src/index.ts', 'export const init = 1;\n');
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      vol.writeFileSync(CONTEXT_FILE, JSON.stringify(liveContext.context));
      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(dimsPath, JSON.stringify([
        { name: 'delta-spec-compliance', result: 'PASS', graded_by: 'fresh-subagent', context_id: liveContext.context.context_id },
        { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
        { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
      ]));
      const beforeMeta = vol.readFileSync(META, 'utf8');
      const mutatedCode = 'export const init = 99;\nexport const mutatedPrewrite = true;\n';
      vi.mocked(assessCurrentDrift).mockImplementationOnce(async () => {
        vol.writeFileSync('/repo/src/index.ts', mutatedCode);
        return { report: live.report, recheck: () => live.recheck } as Awaited<ReturnType<typeof assessCurrentDrift>>;
      });
      await expect(execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] })).rejects.toThrow(/verification inputs changed/);
      expect(vol.readFileSync('/repo/src/index.ts', 'utf8')).toBe(mutatedCode);
      expect(vol.readFileSync(META, 'utf8')).toBe(beforeMeta);
      expect(vol.existsSync('/repo/.prospec/changes/add-widget/verify.md')).toBe(false);
    });

    it('refuses when scenario finding references an unknown REQ id in affected_req_ids', async () => {
      seed({ acceptance: true });
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(
        dimsPath,
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'FAIL',
            graded_by: 'fresh-subagent',
            scenario_findings: [
              {
                scenario_id: 'US-1-1',
                affected_req_ids: ['REQ-UNKNOWN-999'],
                spec_location: 'delta-spec.md:5',
                result: 'FAIL',
                summary: 'affected unknown req',
                evidence: 'finding evidence',
              },
            ],
          },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );

      await expect(
        execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] }),
      ).rejects.toThrow(/unknown REQ id "REQ-UNKNOWN-999" in scenario_finding "US-1-1"/);
    });

    describe.each(['item', 'empty-set finding'] as const)('R277-17 WARN floor from %s', (source) => {
      it.each(['PASS', 'WARN', 'FAIL', 'not-applicable', 'not-adjudicated'] as const)('checks aggregate %s against the complete verdict domain', async (aggregate) => {
        seed({ acceptance: true });
        vol.writeFileSync(DELTA_FILE, source === 'item' ? sampleDeltaSpec : '## ADDED\n');
        const reportPath = '/repo/.prospec/changes/add-widget/verify.md';
        vol.writeFileSync(reportPath, 'existing evidence\n');
        const before = vol.readFileSync(META, 'utf8');
        const dimsPath = '/repo/dimensions.json';
        vol.writeFileSync(dimsPath, JSON.stringify([
          { name: 'delta-spec-compliance', result: aggregate, graded_by: 'fresh-subagent',
            items: source === 'item' ? [{ req_id: 'REQ-WIDGET-001', result: 'WARN', evidence_kind: 'document', evidence: 'Partial fulfillment' }] : [],
            scenario_findings: source === 'item' ? [] : [{ scenario_id: 'US-1-1', affected_req_ids: [], spec_location: 'delta-spec.md:1', result: 'WARN', summary: 'Scenario omitted', evidence: 'No corresponding requirement' }],
          },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]));
        const record = () => execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] });
        if (aggregate === 'WARN' || aggregate === 'FAIL') {
          expect((await record()).dimensions.find((d) => d.name === 'delta-spec-compliance')?.result).toBe(aggregate);
        } else {
          await expect(record()).rejects.toThrow(/less strict than item\/finding floor WARN/);
          expect(vol.readFileSync(META, 'utf8')).toBe(before);
          expect(vol.readFileSync(reportPath, 'utf8')).toBe('existing evidence\n');
        }
      });
    });

    it.each([['PASS', 'FAIL'], ['PASS', 'WARN'], ['WARN', 'FAIL']] as const)('R277-16 refuses empty-REQ aggregate %s against finding %s without writes', async (aggregate, finding) => {
      seed({ acceptance: true });
      vol.writeFileSync(DELTA_FILE, '## ADDED\n');
      const reportPath = '/repo/.prospec/changes/add-widget/verify.md';
      vol.writeFileSync(reportPath, 'existing evidence\n');
      const before = vol.readFileSync(META, 'utf8');
      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(dimsPath, JSON.stringify([
        { name: 'delta-spec-compliance', result: aggregate, graded_by: 'fresh-subagent', items: [], scenario_findings: [
          { scenario_id: 'US-1-1', affected_req_ids: [], spec_location: 'delta-spec.md:1', result: finding, summary: 'Scenario omitted', evidence: 'Original acceptance scenario has no requirement' },
        ] },
        { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
        { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
      ]));
      await expect(execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] })).rejects.toThrow(/less strict than item\/finding floor/);
      expect(vol.readFileSync(META, 'utf8')).toBe(before);
      expect(vol.readFileSync(reportPath, 'utf8')).toBe('existing evidence\n');
    });

    it('refuses when supplied aggregate PASS is less strict than finding WARN floor', async () => {
      seed({ acceptance: true });
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(
        dimsPath,
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'PASS',
            graded_by: 'fresh-subagent',
            items: [{ req_id: 'REQ-WIDGET-001', result: 'PASS', evidence_kind: 'document', evidence: 'passed' }],
            scenario_findings: [
              {
                scenario_id: 'US-1-1',
                spec_location: 'delta-spec.md:5',
                result: 'WARN',
                summary: 'minor deviation',
                evidence: 'finding evidence',
              },
            ],
          },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );

      await expect(
        execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] }),
      ).rejects.toThrow(/less strict than item\/finding floor WARN/);
    });

    it('populates lightweight context_id, baseline_revision, and coverage_summary in quality_log', async () => {
      seed({ acceptance: true });
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      vol.writeFileSync(
        CONTEXT_FILE,
        JSON.stringify(liveContext.context),
      );
      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(
        dimsPath,
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'PASS',
            graded_by: 'fresh-subagent',
            context_id: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
            items: [{ req_id: 'REQ-WIDGET-001', result: 'PASS', evidence_kind: 'document', evidence: 'test passed' }],
          },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );

      const result = await execute({
        cwd: CWD,
        dimensionsPath: dimsPath,
        judgmentDimensions: [],
        warnings: [],
        date: '2026-09-20',
      });

      expect(result.grade).toBe('S');
      const metaContent = vol.readFileSync(META, 'utf8') as string;
      expect(metaContent).toContain('context_id: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
      expect(metaContent).toContain('baseline_revision: 1');
      expect(metaContent).toContain('coverage_summary: 1/1');
    });

    it('does not write verify.md when the authoritative metadata.yaml write fails', async () => {
      seed();
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      const verifyPath = '/repo/.prospec/changes/add-widget/verify.md';
      expect(vol.existsSync(verifyPath)).toBe(false);

      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(
        dimsPath,
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'PASS',
            graded_by: 'fresh-subagent',
            items: [{ req_id: 'REQ-WIDGET-001', result: 'PASS', evidence_kind: 'document', evidence: 'test passed' }],
          },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );

      const changeMeta = await import('../../../src/lib/change-metadata.js');
      const spy = vi.spyOn(changeMeta, 'writeChangeMetadataDoc').mockRejectedValueOnce(new Error('Simulated metadata disk failure'));

      try {
        await expect(
          execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] }),
        ).rejects.toThrow(/Simulated metadata disk failure/);

        expect(vol.existsSync(verifyPath)).toBe(false);
      } finally {
        spy.mockRestore();
      }
    });

    it('honestly reports partial failure when metadata write succeeds but verify.md write fails', async () => {
      seed();
      vol.writeFileSync(DELTA_FILE, sampleDeltaSpec);
      vol.mkdirSync('/repo/.prospec/changes/add-widget/verify.md', { recursive: true });
      const dimsPath = '/repo/dimensions.json';
      vol.writeFileSync(
        dimsPath,
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'PASS',
            graded_by: 'fresh-subagent',
            items: [{ req_id: 'REQ-WIDGET-001', result: 'PASS', evidence_kind: 'document', evidence: 'test passed' }],
          },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );

      await expect(
        execute({ cwd: CWD, dimensionsPath: dimsPath, judgmentDimensions: [], warnings: [] }),
      ).rejects.toThrow(/metadata\.yaml was updated with grade .*, but writing verify\.md failed/);
    });
  });
});
