import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { vol } from 'memfs';
import { execute } from '../../../src/services/status.service.js';

vi.mock('node:fs', async () => {
  const memfs = await vi.importActual<typeof import('memfs')>('memfs');
  return {
    ...memfs.fs,
    default: memfs.fs,
  };
});

const worktreeDigest = vi.hoisted(() => ({ value: 'digest-now' as string | null, report: null as unknown }));
vi.mock('../../../src/lib/drift-assessment.js', () => ({
  assessCurrentDrift: vi.fn(async () => ({
    report: worktreeDigest.report ?? JSON.parse(vol.readFileSync('/test-project/prospec-report.json', 'utf8') as string),
    snapshot: { digest: worktreeDigest.value, clean: true }, recheck: () => true,
  })),
}));

const PROJECT = {
  '.prospec.yaml': 'project_name: test-project\ntech_stack:\n  language: typescript\n',
  'prospec/CONSTITUTION.md': '# Constitution\n',
  'prospec/index.md': '# Index\n',
};

const reportWithFindings = (count: number, changeDigest: string = 'digest-now'): string =>
  JSON.stringify({
    version: 1,
    snapshot: { fingerprint_version: 'snapshot-v2', scope: 'repository-inputs-v2' },
    generated_at: '2026-08-21T00:00:00Z',
    ...(changeDigest !== undefined ? { change_digest: changeDigest } : {}),
    structural: {
      checks: [{ id: 'knowledge-size', status: 'warn' }],
      findings: Array.from({ length: count }, (_, i) => ({
        check: 'knowledge-size',
        severity: 'warn',
        source_path: `prospec/ai-knowledge/modules/mod-${i}/README.md`,
        detail: 'Over budget',
      })),
    },
    semantic: { status: 'not-checked' },
    summary: { fail_count: 0, warn_count: count, skipped_count: 0 },
  });

describe('status.service drift signal', () => {
  const cwd = '/test-project';

  beforeEach(() => {
    vol.reset();
    vol.fromJSON(PROJECT, cwd);
    worktreeDigest.value = 'digest-now'; worktreeDigest.report = null;
  });

  afterEach(() => {
    vol.reset();
  });

  it('reports the finding count and the drafting command when the report is usable', async () => {
    vol.fromJSON({ ...PROJECT, 'prospec-report.json': reportWithFindings(2) }, cwd);

    const report = await execute({ cwd });

    expect(report.clean).toBe(true);
    expect(report.drift).toEqual({
      state: 'findings',
      count: 2,
      recommendation: 'prospec check --auto-draft',
    });
  });

  it('reports a malformed report as unusable rather than as no drift', async () => {
    vol.fromJSON({ ...PROJECT, 'prospec-report.json': '{ not json' }, cwd);

    const report = await execute({ cwd });

    expect(report.drift).toEqual({
      state: 'unusable',
      reason: 'unreadable',
      recommendation: 'prospec check --json',
    });
  });

  it('reports an off-schema report as unusable — a parsed shape is not a valid one', async () => {
    vol.fromJSON({ ...PROJECT, 'prospec-report.json': '{"version":1}' }, cwd);

    const report = await execute({ cwd });

    expect(report.drift?.state).toBe('unusable');
  });

  it('reports a report generated against different code as stale', async () => {
    worktreeDigest.value = 'digest-now';
    vol.fromJSON({ ...PROJECT, 'prospec-report.json': reportWithFindings(2, 'digest-then') }, cwd);

    const report = await execute({ cwd });

    expect(report.drift).toEqual({
      state: 'unusable',
      reason: 'stale',
      recommendation: 'prospec check --json',
    });
  });

  it('trusts a report whose digest matches the working tree', async () => {
    worktreeDigest.value = 'digest-now';
    vol.fromJSON({ ...PROJECT, 'prospec-report.json': reportWithFindings(2, 'digest-now') }, cwd);

    const report = await execute({ cwd });

    expect(report.drift?.state).toBe('findings');
  });

  it('calls an undigested report unprovable, never stale', async () => {
    worktreeDigest.value = 'digest-now';
    // An older engine wrote no `change_digest` at all: its freshness was never
    // measured, which is not the same as measured and wrong.
    const old = JSON.parse(reportWithFindings(2)); delete old.change_digest;
    vol.fromJSON({ ...PROJECT, 'prospec-report.json': JSON.stringify(old) }, cwd);

    const report = await execute({ cwd });

    expect(report.drift).toEqual({
      state: 'unusable',
      reason: 'unprovable',
      recommendation: 'prospec check --json',
    });
  });

  it('reports unprovable when current inputs cannot be captured', async () => {
    worktreeDigest.value = null;
    vol.fromJSON({ ...PROJECT, 'prospec-report.json': reportWithFindings(1, 'digest-then') }, cwd);

    const report = await execute({ cwd });

    expect(report.drift).toMatchObject({ state: 'unusable', reason: 'unprovable' });
  });

  it('counts only findings `--auto-draft` would actually draft', async () => {
    const mixed = JSON.parse(reportWithFindings(1));
    mixed.structural.findings.push(
      {
        check: 'review-provenance',
        severity: 'fail',
        source_path: '.prospec/changes/some-change/metadata.yaml',
        detail: 'no review recorded',
      },
      {
        check: 'knowledge-size',
        severity: 'warn',
        source_path: 'prospec/ai-knowledge/modules/x/README.md',
        detail: 'approaching budget',
        knowledge_size: {
          surface: 'module README',
          budget_key: 'readme_max_tokens',
          budget: 1000,
          actual: 900,
          unit: 'tokens',
          tier: 'headroom',
        },
      },
    );
    vol.fromJSON({ ...PROJECT, 'prospec-report.json': JSON.stringify(mixed) }, cwd);

    const report = await execute({ cwd });

    // Three findings on file; only the one that can be drafted is counted.
    expect(report.drift).toEqual({
      state: 'findings',
      count: 1,
      recommendation: 'prospec check --auto-draft',
    });
  });

  it('stays silent when the report is absent or carries no findings', async () => {
    const absent = await execute({ cwd });
    expect(absent.drift).toBeUndefined();

    vol.fromJSON({ ...PROJECT, 'prospec-report.json': reportWithFindings(0) }, cwd);
    const empty = await execute({ cwd });
    expect(empty.drift).toBeUndefined();
  });

  it('stays silent while any change is in progress — the nudge is for a clear desk', async () => {
    vol.fromJSON(
      {
        ...PROJECT,
        'prospec-report.json': reportWithFindings(3),
        '.prospec/changes/some-change/metadata.yaml':
          'name: some-change\ncreated_at: 2026-08-21T00:00:00Z\nstatus: story\nscale: quick\n',
        '.prospec/changes/some-change/proposal.md': '# Proposal\n',
      },
      cwd,
    );

    const report = await execute({ cwd });

    expect(report.clean).toBe(false);
    expect(report.drift).toBeUndefined();
  });

  it('gives a `fix-`-named change no special routing — the prefix is not a provenance mark', async () => {
    vol.fromJSON(
      {
        ...PROJECT,
        '.prospec/changes/fix-cli-first-regressions/metadata.yaml':
          'name: fix-cli-first-regressions\ncreated_at: 2026-08-21T00:00:00Z\nstatus: story\nscale: quick\n',
        '.prospec/changes/fix-cli-first-regressions/proposal.md': '# Proposal\n',
      },
      cwd,
    );

    const report = await execute({ cwd });
    const change = report.changes[0]!;

    expect(change.name).toBe('fix-cli-first-regressions');
    // The `fix-` prefix must buy nothing: this change routes exactly like any
    // other at the same station, with no extra field and no altered next step.
    const plain = { ...change, name: 'ordinary-change' };
    vol.fromJSON(
      {
        ...PROJECT,
        '.prospec/changes/ordinary-change/metadata.yaml':
          'name: ordinary-change\ncreated_at: 2026-08-21T00:00:00Z\nstatus: story\nscale: quick\n',
        '.prospec/changes/ordinary-change/proposal.md': '# Proposal\n',
      },
      cwd,
    );
    const other = (await execute({ cwd })).changes.find((c) => c.name === 'ordinary-change')!;
    expect({ ...other, name: 'ordinary-change' }).toEqual(plain);
  });
});

it('refuses stale workflow conclusions even when content digest matches', async () => {
  const cwd = '/test-project';
  vol.fromJSON({ ...PROJECT, 'prospec-report.json': reportWithFindings(1) }, cwd);
  worktreeDigest.value = 'digest-now'; worktreeDigest.report = JSON.parse(reportWithFindings(2));
  expect((await execute({ cwd })).drift).toMatchObject({ state: 'unusable', reason: 'stale' });
});
