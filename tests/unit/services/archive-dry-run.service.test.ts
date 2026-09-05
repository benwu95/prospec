import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('../../../src/lib/drift-assessment.js', () => ({
  assessCurrentDrift: vi.fn(async () => ({
    report: { structural: { checks: ['metadata-completeness', 'task-completion', 'review-provenance', 'test-provenance', 'delta-spec-provenance'].map((id) => ({ id, status: 'pass', subjects: ['feat-x'] })), findings: [] } },
    snapshot: { digest: 'fixture', clean: true }, recheck: () => true,
  })),
}));
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execute } from '../../../src/services/archive.service.js';

// Dry-run must share execute()'s real write path (single flag, no parallel
// implementation), so these tests run on real temp dirs — renderTemplate and
// atomicWrite exercise the actual filesystem, like archive-feature-map tests.

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'archive-dry-run-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  const abs = path.join(tmp, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

// A fresh all-passing drift report so archive's mechanized Entry Gate lets the
// candidate through — these tests exercise dry-run mechanics, not the gate. Seeded
// as part of the fixture (before the zero-write snapshot), so it never reads as a
// write execute() performed.
const PASSING_REPORT = JSON.stringify({
  version: 1,
  generated_at: '2026-08-29T00:00:00.000Z',
  structural: { checks: [{ id: 'req-references', status: 'pass' }], findings: [] },
  semantic: { status: 'not-checked' },
  summary: { fail_count: 0, warn_count: 0, skipped_count: 0 },
});

function verifiedChangeFixture(name = 'feat-x'): void {
  write('.prospec.yaml', 'project:\n  name: test-project\npaths:\n  base_dir: prospec\n');
  write('prospec-report.json', PASSING_REPORT);
  // module-map carries last_verified + a README so the Entry Gate's knowledge-sync
  // check passes (git staleness is skipped — tmp is not a git repo).
  write(
    'prospec/ai-knowledge/module-map.yaml',
    'modules:\n  - name: lib\n    paths:\n      - src/lib\n    keywords: []\n    last_verified: 2026-07-01T00:00:00.000Z\n',
  );
  write('prospec/ai-knowledge/modules/lib/README.md', '# lib\n');
  write(
    `.prospec/changes/${name}/metadata.yaml`,
    `name: ${name}\ncreated_at: 2026-07-01T00:00:00.000Z\nstatus: verified\nscale: standard\n`,
  );
  write(
    `.prospec/changes/${name}/proposal.md`,
    '# Proposal\n\n## User Story\n\nAs a dev, I want X, so that Y.\n',
  );
  write(
    `.prospec/changes/${name}/delta-spec.md`,
    '# Delta Spec\n\n## ADDED\n\n### REQ-LIB-001: New helper\n\n**Feature:** alpha\n**Story:** US-1\n\n**Description:**\nDetails.\n\n---\n',
  );
  write(`.prospec/changes/${name}/tasks.md`, '- [x] T1 do it ~5 lines\n');
}

/**
 * Recursive path → content snapshot for zero-write assertions. Directories are
 * recorded too (as `rel/` keys) — an ensureDir that creates an empty directory
 * is a filesystem write the snapshot must surface.
 */
function snapshotDir(root: string): Map<string, string> {
  const snapshot = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const abs = path.join(dir, entry);
      if (statSync(abs).isDirectory()) {
        snapshot.set(`${path.relative(root, abs)}${path.sep}`, '');
        walk(abs);
      } else {
        snapshot.set(path.relative(root, abs), readFileSync(abs, 'utf-8'));
      }
    }
  };
  walk(root);
  return snapshot;
}

describe('execute dry-run (REQ-SERVICES-071)', () => {
  it('performs zero filesystem writes and marks the result as dry-run', async () => {
    verifiedChangeFixture();
    const before = snapshotDir(tmp);

    const result = await execute({ cwd: tmp, names: ['feat-x'], dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.planned.length).toBeGreaterThan(0);
    expect(snapshotDir(tmp)).toEqual(before);
  });

  it('reports every planned mutation: move, summary, spec-sync, metadata, product, feature-map', async () => {
    verifiedChangeFixture();

    const result = await execute({ cwd: tmp, names: ['feat-x'], dryRun: true });

    const targets = result.planned.map((p) => p.target);
    const today = new Date().toISOString().slice(0, 10);
    const archiveDir = path.join(tmp, '.prospec', 'archive', `${today}-feat-x`);
    expect(targets).toContain(archiveDir);
    expect(targets).toContain(path.join(archiveDir, 'summary.md'));
    expect(targets).toContain(path.join(tmp, 'prospec', 'specs', 'features', 'alpha.md'));
    expect(targets).toContain(path.join(archiveDir, 'metadata.yaml'));
    expect(targets).toContain(path.join(tmp, 'prospec', 'specs', 'product.md'));
    expect(targets).toContain(path.join(tmp, 'prospec', 'ai-knowledge', 'feature-map.yaml'));
    expect(result.archived).toHaveLength(1);
    expect(result.archived[0]!.archivePath).toBe(archiveDir);
    expect(result.affectedModules).toContain('lib');
  });

  it('dry-run predictions match the subsequent real run (replay equivalence, both directions)', async () => {
    verifiedChangeFixture();

    const dry = await execute({ cwd: tmp, names: ['feat-x'], dryRun: true });
    const before = snapshotDir(tmp);
    const real = await execute({ cwd: tmp, names: ['feat-x'] });
    const after = snapshotDir(tmp);

    expect(real.dryRun).toBe(false);
    expect(real.archived[0]!.archivePath).toBe(dry.archived[0]!.archivePath);
    expect([...real.specFiles].sort()).toEqual([...dry.specFiles].sort());
    expect(real.affectedModules.sort()).toEqual(dry.affectedModules.sort());

    // dry ⊆ real: every dry-run planned target materialized in the real run
    for (const p of dry.planned) {
      expect(existsSync(p.target), `planned target missing after real run: ${p.target}`).toBe(true);
    }
    const meta = readFileSync(path.join(real.archived[0]!.archivePath, 'metadata.yaml'), 'utf-8');
    expect(meta).toContain('status: archived');

    // real ⊆ dry: every path the real run created or changed was predicted —
    // either a planned target itself, a parent dir ensureDir made for one, or
    // content landing inside the planned archive move destination
    const archiveDir = dry.archived[0]!.archivePath;
    const plannedTargets = dry.planned.map((p) => p.target);
    const unpredicted = [...after.keys()]
      .filter((rel) => !before.has(rel) || before.get(rel) !== after.get(rel))
      .map((rel) => path.join(tmp, rel))
      .filter(
        (abs) =>
          !plannedTargets.some((t) => abs === t || t.startsWith(abs)) &&
          !abs.startsWith(archiveDir),
      );
    expect(unpredicted).toEqual([]);
  });

  it('carries droppedBehavior through execute() identically in both modes (REQ-SERVICES-073)', async () => {
    // The detector is unit-tested at the syncToFeatureSpecs layer, but nothing
    // covered execute()'s propagation — a regression there would surface as a
    // silently empty worklist with the whole suite green.
    verifiedChangeFixture();
    write(
      'prospec/specs/features/alpha.md',
      '---\nfeature: alpha\nstatus: active\nlast_updated: 2026-01-01\n---\n\n# alpha\n\n## User Stories\n\n### US-1: existing\n\n#### REQ-LIB-002: Existing behavior\nStatement.\n- WHEN the original condition holds, THEN the original consequence follows\n\n## Edge Cases\n\n- edge\n',
    );
    write(
      '.prospec/changes/feat-x/delta-spec.md',
      '# Delta Spec\n\n## MODIFIED\n\n### REQ-LIB-002: Existing behavior\n\n**Feature:** alpha\n**Story:** US-1\n\n**Spec:**\nRestated.\n- WHEN a brand new condition holds, THEN a brand new consequence follows\n\n---\n',
    );

    const dry = await execute({ cwd: tmp, names: ['feat-x'], dryRun: true });
    const real = await execute({ cwd: tmp, names: ['feat-x'] });

    expect(dry.droppedBehavior).toEqual([
      {
        feature: 'alpha',
        reqId: 'REQ-LIB-002',
        bullets: ['- WHEN the original condition holds, THEN the original consequence follows'],
      },
    ]);
    expect(real.droppedBehavior).toEqual(dry.droppedBehavior);
  });

  it('predicts the feature-map bootstrap even when every feature slug is unsafe (spec-sync writes no file but still creates the dir)', async () => {
    verifiedChangeFixture();
    write(
      '.prospec/changes/feat-x/delta-spec.md',
      '# Delta Spec\n\n## ADDED\n\n### REQ-LIB-001: New helper\n\n**Feature:** user profile\n**Story:** US-1\n\n**Description:**\nDetails.\n\n---\n',
    );

    const dry = await execute({ cwd: tmp, names: ['feat-x'], dryRun: true });

    expect(dry.specFiles).toHaveLength(0);
    const featureMapPath = path.join(tmp, 'prospec', 'ai-knowledge', 'feature-map.yaml');
    expect(dry.planned.map((p) => p.target)).toContain(featureMapPath);

    const real = await execute({ cwd: tmp, names: ['feat-x'] });
    expect(real.specFiles).toHaveLength(0);
    expect(existsSync(featureMapPath)).toBe(true);
  });

  it('distinguishes the product.md bootstrap from the splice, and names what the splice touches', async () => {
    // The old detail said "regenerate product.md from Feature Specs" in both
    // states — the preview never warned that authored content was at stake.
    verifiedChangeFixture();
    const productPath = path.join(tmp, 'prospec', 'specs', 'product.md');

    const bootstrap = await execute({ cwd: tmp, names: ['feat-x'], dryRun: true });
    const bootstrapDetail = bootstrap.planned.find((p) => p.target === productPath)?.detail ?? '';

    write('prospec/specs/product.md', '---\nproduct: test-project\nlast_updated: 2020-01-01\n---\n\n# test-project\n\n## Feature Map\n\n_(No active features yet)_\n');
    const splice = await execute({ cwd: tmp, names: ['feat-x'], dryRun: true });
    const spliceDetail = splice.planned.find((p) => p.target === productPath)?.detail ?? '';

    expect(bootstrapDetail).toMatch(/bootstrap/i);
    expect(spliceDetail).toMatch(/splice/i);
    expect(spliceDetail).toContain('## Feature Map');
    expect(spliceDetail).not.toBe(bootstrapDetail);
  });

  it('keeps a product.md write failure non-fatal — the splice added a read that can throw', async () => {
    // The old generator only WROTE product.md; the splice reads the existing file
    // first (EISDIR/EACCES/vanished symlink), so an unhandled throw here would
    // abort the run after the bundle had already moved.
    verifiedChangeFixture();
    mkdirSync(path.join(tmp, 'prospec', 'specs', 'product.md'), { recursive: true });

    const result = await execute({ cwd: tmp, names: ['feat-x'] });

    expect(result.archived).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
  });

  it('previews the unclosed-fence refusal as a planned non-mutation, and honours it', async () => {
    verifiedChangeFixture();
    const malformed = '---\nproduct: test-project\nlast_updated: 2020-01-01\n---\n\n## Vision\n\n```md\nnever closed\n\n## Feature Map\n\n### alpha\n\nAuthored.\n→ [features/alpha.md](features/alpha.md)\n';
    write('prospec/specs/product.md', malformed);
    const productPath = path.join(tmp, 'prospec', 'specs', 'product.md');

    const dry = await execute({ cwd: tmp, names: ['feat-x'], dryRun: true });
    const entry = dry.planned.find((p) => p.target === productPath);
    expect(entry?.action).toBe('skip');
    expect(entry?.detail).toMatch(/unclosed code fence/i);

    await execute({ cwd: tmp, names: ['feat-x'] });
    expect(readFileSync(productPath, 'utf-8')).toBe(malformed);
  });

  it('previews the near-miss-heading refusal as a planned non-mutation, and honours it', async () => {
    verifiedChangeFixture();
    // The heading a downstream author writes: same words, decorated with a count.
    // Appending past it grows a SECOND feature map that then drifts from the first.
    const authored = '---\nproduct: test-project\nlast_updated: 2020-01-01\n---\n\n## Feature Map (34 active)\n\n### alpha\n\nCurated by hand.\n→ [features/alpha.md](features/alpha.md)\n';
    write('prospec/specs/product.md', authored);
    const productPath = path.join(tmp, 'prospec', 'specs', 'product.md');

    const dry = await execute({ cwd: tmp, names: ['feat-x'], dryRun: true });
    const entries = dry.planned.filter((p) => p.target === productPath);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.action).toBe('skip');
    expect(entries[0]?.detail).toContain('Feature Map (34 active)');

    const real = await execute({ cwd: tmp, names: ['feat-x'] });
    expect(readFileSync(productPath, 'utf-8')).toBe(authored);
    expect(real.productSpecDeclined?.reason).toBe('near-miss-heading');
  });

  it('predicts the missing-features-dir refusal instead of staying silent about it', async () => {
    verifiedChangeFixture();
    write('prospec/specs/product.md', '---\nproduct: test-project\nlast_updated: 2020-01-01\n---\n\n## Feature Map\n\n### alpha\n\nAuthored.\n→ [features/alpha.md](features/alpha.md)\n');
    // a delta-spec with no routes leaves specs/features/ untouched
    write('.prospec/changes/feat-x/delta-spec.md', '# Delta Spec\n\n## ADDED\n\n_No requirements._\n');

    const dry = await execute({ cwd: tmp, names: ['feat-x'], dryRun: true });
    const entries = dry.planned.filter((p) => p.target.endsWith('product.md'));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.action).toBe('skip');

    const before = readFileSync(path.join(tmp, 'prospec', 'specs', 'product.md'), 'utf-8');
    const real = await execute({ cwd: tmp, names: ['feat-x'] });
    expect(readFileSync(path.join(tmp, 'prospec', 'specs', 'product.md'), 'utf-8')).toBe(before);
    expect(real.productSpecDeclined?.reason).toBe('missing-features-dir');
  });

  it('reports no decline when the splice actually runs', async () => {
    verifiedChangeFixture();
    write('prospec/specs/product.md', '---\nproduct: test-project\nlast_updated: 2020-01-01\n---\n\n## Feature Map\n\n_(No active features yet)_\n');

    const real = await execute({ cwd: tmp, names: ['feat-x'] });
    expect(real.productSpecDeclined).toBeNull();
  });

  it('respects feature-map no-clobber in the planned output', async () => {
    verifiedChangeFixture();
    write('prospec/ai-knowledge/feature-map.yaml', 'features:\n  - feature: alpha\n    modules: [lib]\n    status: active\n');

    const result = await execute({ cwd: tmp, names: ['feat-x'], dryRun: true });

    const featureMapPlan = result.planned.filter((p) =>
      p.target.endsWith('feature-map.yaml'),
    );
    expect(featureMapPlan).toHaveLength(0);
  });

  it('mirrors the real-run skip when the archive directory already exists', async () => {
    verifiedChangeFixture();
    const today = new Date().toISOString().slice(0, 10);
    write(path.join('.prospec', 'archive', `${today}-feat-x`, 'placeholder.md'), 'x\n');

    const dry = await execute({ cwd: tmp, names: ['feat-x'], dryRun: true });
    const real = await execute({ cwd: tmp, names: ['feat-x'] });

    expect(dry.skipped).toContain('feat-x');
    expect(dry.archived).toHaveLength(0);
    expect(real.skipped).toContain('feat-x');
    expect(real.archived).toHaveLength(0);
  });
});

describe('named-target refusal reporting (REQ-SERVICES-071)', () => {
  it('reports a named change with non-target status as refused with its status and reason', async () => {
    verifiedChangeFixture('feat-x');
    write('.prospec/changes/feat-y/metadata.yaml', 'name: feat-y\ncreated_at: 2026-07-01T00:00:00.000Z\nstatus: tasks\nscale: quick\n');

    const result = await execute({ cwd: tmp, names: ['feat-y'] });

    expect(result.archived).toHaveLength(0);
    expect(result.refused).toEqual([
      {
        name: 'feat-y',
        status: 'tasks',
        reason: expect.stringContaining('verified'),
      },
    ]);
  });

  it('refuses an existing change whose metadata.yaml is unparseable, never misreporting it as notFound', async () => {
    verifiedChangeFixture('feat-x');
    write('.prospec/changes/feat-broken/metadata.yaml', 'status: [unclosed\n');

    const result = await execute({ cwd: tmp, names: ['feat-broken'] });

    expect(result.notFound).toHaveLength(0);
    expect(result.refused).toEqual([
      {
        name: 'feat-broken',
        status: 'unknown',
        reason: expect.stringContaining('metadata.yaml'),
      },
    ]);
  });

  it('reports a named change that does not exist as notFound', async () => {
    verifiedChangeFixture('feat-x');

    const result = await execute({ cwd: tmp, names: ['nope'] });

    expect(result.notFound).toEqual(['nope']);
    expect(result.refused).toHaveLength(0);
    expect(result.archived).toHaveLength(0);
  });

  it('keeps the unnamed default flow backward-compatible (no refusals, not dry-run)', async () => {
    verifiedChangeFixture('feat-x');

    const result = await execute({ cwd: tmp });

    expect(result.archived).toHaveLength(1);
    expect(result.refused).toEqual([]);
    expect(result.notFound).toEqual([]);
    expect(result.dryRun).toBe(false);
    expect(result.planned).toEqual([]);
  });
});
