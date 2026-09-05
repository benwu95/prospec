import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { execute } from '../../../src/services/archive.service.js';


vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

const live = vi.hoisted(() => ({ report: {} as unknown, recheck: true, unavailable: false, mutateConfig: false }));
vi.mock('../../../src/lib/drift-assessment.js', () => ({
  assessCurrentDrift: vi.fn(async () => {
    if (live.mutateConfig) vol.writeFileSync('/repo/.prospec.yaml', 'version: "1.0"\nproject:\n  name: changed\n');
    if (live.unavailable) throw new Error('cannot collect current inputs');
    return { report: live.report, snapshot: { digest: 'current', clean: true }, recheck: () => live.recheck };
  }),
}));

const CWD = '/repo';
const CHANGE = 'add-widget';
const META = `/repo/.prospec/changes/${CHANGE}/metadata.yaml`;

beforeEach(() => {
  vol.reset();
  live.recheck = true; live.unavailable = false; live.mutateConfig = false;
});

function report(
  checks: Record<string, 'pass' | 'warn' | 'fail' | 'skipped'> = {},
  digest?: string,
): string {
  const list = Object.entries({ 'task-completion': 'pass', 'metadata-completeness': 'pass', 'review-provenance': 'pass', 'test-provenance': 'pass', 'delta-spec-provenance': 'pass', ...checks }).map(([id, status]) =>
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
  live.report = JSON.parse(opts.reportJson ?? report());
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

  it('refuses when inputs change after the current assessment', async () => {
    live.recheck = false;
    seed({ reportJson: report({}, 'OLD') });
    const result = await run();
    expect(result.refused).toHaveLength(1);
    expect(result.refused[0]!.reason).toContain('inputs changed');
  });

  it('refuses when current inputs cannot be collected', async () => {
    seed({ reportJson: null });
    live.unavailable = true;
    const result = await run();
    expect(result.refused).toHaveLength(1);
    expect(result.refused[0]!.reason).toContain('current assessment unavailable');
  });

  it('--allow-incomplete exempts completeness only', async () => {
    // completeness fails, but --allow-incomplete lets it through
    vol.reset();
    live.recheck = true; live.unavailable = false; live.mutateConfig = false;
    seed({ reportJson: report({ 'metadata-completeness': 'fail' }) });
    const allowed = await execute({ cwd: CWD, names: [CHANGE], dryRun: true, allowIncomplete: true });
    expect(allowed.refused).toEqual([]);
    expect(allowed.planned.length).toBeGreaterThan(0);

    // provenance still blocks even with the flag
    vol.reset();
    live.recheck = true; live.unavailable = false; live.mutateConfig = false;
    seed({ reportJson: report({ 'metadata-completeness': 'fail', 'review-provenance': 'fail' }) });
    const blocked = await execute({ cwd: CWD, names: [CHANGE], dryRun: true, allowIncomplete: true });
    expect(blocked.refused).toHaveLength(1);
    expect(blocked.refused[0]!.reason).toContain('review-provenance');
  });
});

it('refuses a config mutation between initial resolution and the current assessment', async () => {
  seed();
  live.mutateConfig = true;
  const result = await execute({ cwd: CWD, names: [CHANGE], dryRun: true });
  expect(result.refused).toEqual([expect.objectContaining({ reason: expect.stringContaining('configuration changed') })]);
});
