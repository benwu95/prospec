import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { execute } from '../../../src/services/archive.service.js';
import { computeChangeDigest } from '../../../src/lib/drift-sources.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

// Partial mock: archive uses several drift-sources exports; only the freshness
// fingerprint is stubbed so a test can drive the stale-report branch. Default
// null = honest skip (no git worktree), matching the other archive tests.
vi.mock('../../../src/lib/drift-sources.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/drift-sources.js')>();
  return { ...actual, computeChangeDigest: vi.fn((): string | null => null) };
});

const CWD = '/repo';
const CHANGE = 'add-widget';
const META = `/repo/.prospec/changes/${CHANGE}/metadata.yaml`;

beforeEach(() => {
  vol.reset();
  vi.mocked(computeChangeDigest).mockReturnValue(null);
});

function report(
  checks: Record<string, 'pass' | 'warn' | 'fail' | 'skipped'> = {},
  digest?: string,
): string {
  const list = Object.entries(checks).map(([id, status]) =>
    status === 'skipped' ? { id, status, reason: 'x' } : { id, status },
  );
  return JSON.stringify({
    version: 1,
    generated_at: '2026-08-29T00:00:00.000Z',
    ...(digest !== undefined ? { change_digest: digest } : {}),
    structural: {
      checks: list.length > 0 ? list : [{ id: 'req-references', status: 'pass' }],
      findings: [],
    },
    semantic: { status: 'not-checked' },
    summary: { fail_count: 0, warn_count: 0, skipped_count: 0 },
  });
}

/** A verified change + optional report / module-map. dryRun keeps it write-free. */
function seed(opts: {
  reportJson?: string | null;
  moduleMap?: string;
  scale?: string;
} = {}): void {
  const files: Record<string, string> = {
    [META]: `name: ${CHANGE}\ncreated_at: 2026-07-01T00:00:00.000Z\nstatus: verified\nscale: ${opts.scale ?? 'standard'}\n`,
    [`/repo/.prospec/changes/${CHANGE}/delta-spec.md`]:
      '# Delta\n\n## ADDED\n\n### REQ-LIB-001: x\n\n**Feature:** alpha\n**Story:** US-1\n\n**Description:**\nd.\n\n---\n',
  };
  if (opts.reportJson !== null) files['/repo/prospec-report.json'] = opts.reportJson ?? report();
  if (opts.moduleMap !== undefined) files['/repo/prospec/ai-knowledge/module-map.yaml'] = opts.moduleMap;
  vol.fromJSON(files);
}

const run = () => execute({ cwd: CWD, names: [CHANGE], dryRun: true });

describe('archive Entry Gate (mechanized)', () => {
  it('archives (plans, in dry-run) when the report passes and Knowledge is synced', async () => {
    seed();
    const result = await run();
    expect(result.refused).toEqual([]);
    expect(result.planned.length).toBeGreaterThan(0);
  });

  it('refuses on metadata-completeness FAIL, naming it', async () => {
    seed({ reportJson: report({ 'metadata-completeness': 'fail' }) });
    const result = await run();
    expect(result.refused).toHaveLength(1);
    expect(result.refused[0]!.reason).toContain('metadata-completeness');
    expect(result.planned).toEqual([]);
  });

  it.each(['review-provenance', 'test-provenance', 'delta-spec-provenance'])(
    'refuses on %s FAIL',
    async (id) => {
      seed({ reportJson: report({ [id]: 'fail' }) });
      const result = await run();
      expect(result.refused).toHaveLength(1);
      expect(result.refused[0]!.reason).toContain(id);
    },
  );

  it('refuses when affected-module Knowledge is not synced', async () => {
    // module-map has the delta-spec's `lib` module but no last_verified → not synced
    seed({
      moduleMap: 'modules:\n  - name: lib\n    paths:\n      - src/lib\n    keywords: []\n',
    });
    const result = await run();
    expect(result.refused).toHaveLength(1);
    expect(result.refused[0]!.reason).toContain('Knowledge');
  });

  it('refuses when the report is stale (digest mismatch)', async () => {
    vi.mocked(computeChangeDigest).mockReturnValue('CURRENT');
    seed({ reportJson: report({}, 'OLD') });
    const result = await run();
    expect(result.refused).toHaveLength(1);
    expect(result.refused[0]!.reason).toContain('stale');
  });

  it('refuses when the report is missing', async () => {
    seed({ reportJson: null });
    const result = await run();
    expect(result.refused).toHaveLength(1);
    expect(result.refused[0]!.reason).toContain('no prospec-report.json');
  });

  it('--allow-incomplete exempts completeness only', async () => {
    // completeness fails, but --allow-incomplete lets it through
    vol.reset();
    vi.mocked(computeChangeDigest).mockReturnValue(null);
    seed({ reportJson: report({ 'metadata-completeness': 'fail' }) });
    const allowed = await execute({ cwd: CWD, names: [CHANGE], dryRun: true, allowIncomplete: true });
    expect(allowed.refused).toEqual([]);
    expect(allowed.planned.length).toBeGreaterThan(0);

    // provenance still blocks even with the flag
    vol.reset();
    vi.mocked(computeChangeDigest).mockReturnValue(null);
    seed({ reportJson: report({ 'metadata-completeness': 'fail', 'review-provenance': 'fail' }) });
    const blocked = await execute({ cwd: CWD, names: [CHANGE], dryRun: true, allowIncomplete: true });
    expect(blocked.refused).toHaveLength(1);
    expect(blocked.refused[0]!.reason).toContain('review-provenance');
  });
});
