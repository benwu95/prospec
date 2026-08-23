import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';
import {
  assessDrops,
  classifyRoutingResolution,
  whenThenBullets,
  declaredDrops,
  extractDeltaBlock,
  iterateDeltaEntries,
} from '../../../src/lib/landing-fidelity.js';
import { collectDeltaSpecLandingFidelity } from '../../../src/lib/drift-sources.js';
import { buildReqHomeIndex } from '../../../src/lib/spec-read.js';
import { syncToFeatureSpecs } from '../../../src/services/archive.service.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs.promises, default: memfs.fs.promises };
});

describe('assessDrops — the single landing-fidelity comparison (issue #202)', () => {
  it('reports a bullet the landing block does not restate as undeclared', () => {
    const sets = assessDrops('- WHEN a, THEN x\n- WHEN b, THEN y', '- WHEN a, THEN x', []);
    expect(sets.undeclared.map((b) => b.text)).toEqual(['- WHEN b, THEN y']);
    expect(sets.acknowledged).toHaveLength(0);
    expect(sets.stale).toHaveLength(0);
  });

  it('moves a declared drop from undeclared to acknowledged', () => {
    const sets = assessDrops(
      '- WHEN a, THEN x\n- WHEN b, THEN y',
      '- WHEN a, THEN x',
      declaredDrops(['**Dropped:**', '- WHEN b, THEN y']),
    );
    expect(sets.undeclared).toHaveLength(0);
    expect(sets.acknowledged.map((b) => b.text)).toEqual(['- WHEN b, THEN y']);
  });

  it('flags a declaration that names a bullet not dropped as stale', () => {
    const sets = assessDrops(
      '- WHEN a, THEN x\n- WHEN b, THEN y',
      '- WHEN a, THEN x\n- WHEN b, THEN y',
      declaredDrops(['**Dropped:**', '- WHEN c, THEN z']),
    );
    expect(sets.undeclared).toHaveLength(0);
    expect(sets.stale.map((b) => b.text)).toEqual(['- WHEN c, THEN z']);
  });

  it('is a SET difference, not a count — equal count, different content still drops', () => {
    const sets = assessDrops('- WHEN a, THEN x', '- WHEN q, THEN r', []);
    expect(sets.undeclared.map((b) => b.text)).toEqual(['- WHEN a, THEN x']);
  });

  it('does not report a bullet that only changed marker or indentation', () => {
    const sets = assessDrops('- WHEN a, THEN x', '* WHEN a, THEN x', []);
    expect(sets.undeclared).toHaveLength(0);
  });

  // The two entries from #185 that this whole change traces back to: a landing
  // block that carried fewer bullets than the trust-zone body while declaring none.
  it('reproduces the #185 shape — 4 undeclared and 1 undeclared', () => {
    const chng004Existing = [
      '- WHEN one, THEN a',
      '- WHEN two, THEN b',
      '- WHEN three, THEN c',
      '- WHEN four, THEN d',
      '- WHEN five, THEN e',
    ].join('\n');
    const chng004Landing = ['- WHEN one, THEN a'].join('\n');
    expect(assessDrops(chng004Existing, chng004Landing, []).undeclared).toHaveLength(4);

    const types070Existing = Array.from({ length: 6 }, (_, i) => `- WHEN q${i}, THEN r${i}`).join('\n');
    const types070Landing = Array.from({ length: 5 }, (_, i) => `- WHEN q${i}, THEN r${i}`).join('\n');
    expect(assessDrops(types070Existing, types070Landing, []).undeclared).toHaveLength(1);
  });
});

describe('landing-fidelity parsers', () => {
  it('whenThenBullets recognises -, *, N. and **WHEN** but not WHENEVER', () => {
    const body = ['- WHEN a, THEN x', '* WHEN b, THEN y', '1. WHEN c, THEN z', '- **WHEN** d, THEN w', '- WHENEVER e'].join('\n');
    expect(whenThenBullets(body)).toHaveLength(4);
  });

  it('declaredDrops parses list items and returns none for prose', () => {
    expect(declaredDrops(['**Dropped:**', '- WHEN a, THEN x'])).toHaveLength(1);
    expect(declaredDrops(['**Dropped:** none — every bullet is carried through'])).toHaveLength(0);
  });

  it('extractDeltaBlock pulls the **Spec:** body and reports a foreign-label truncation', () => {
    const clean = extractDeltaBlock(['**Spec:**', 'The lib does things.', '- WHEN a, THEN x', '', '**Priority:** High'], 'Spec');
    expect(clean.content).toContain('WHEN a, THEN x');
    expect(clean.truncation).toBeNull();

    const cut = extractDeltaBlock(['**Spec:**', 'The lib does things.', '**Scenarios:**', '- WHEN a, THEN x'], 'Spec');
    expect(cut.truncation).not.toBeNull();
  });

  it('iterateDeltaEntries walks section, id, feature and body', () => {
    const entries = iterateDeltaEntries(
      ['## MODIFIED', '', '### REQ-LIB-900: Sample', '', '**Feature:** drift-checks', '**Story:** US-1', '', '**Spec:**', '- WHEN a, THEN x'].join('\n'),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ section: 'MODIFIED', reqId: 'REQ-LIB-900', feature: 'drift-checks' });
  });
});

describe('the drift check and the archive write path share one comparison (REQ-LIB-061)', () => {
  beforeEach(() => vol.reset());

  const FEATURE_SPEC = [
    '---',
    'feature: drift-checks',
    'status: active',
    'last_updated: 2026-01-01',
    'story_count: 1',
    'req_count: 1',
    '---',
    '',
    '# drift-checks',
    '',
    '## User Stories & Behavior Specifications',
    '',
    '### US-1',
    '',
    '#### REQ-LIB-900: Sample',
    'The sample requirement.',
    '- WHEN a, THEN x',
    '- WHEN b, THEN y',
    '- WHEN c, THEN z',
    '',
    '---',
    '',
    '## Change History',
    '',
    '| Date | Change | Impact | Stories/REQs |',
    '|------|--------|--------|-------------|',
    '',
  ].join('\n');

  const DELTA_SPEC = [
    '# Delta',
    '',
    '## MODIFIED',
    '',
    '### REQ-LIB-900: Sample',
    '',
    '**Feature:** drift-checks',
    '**Story:** US-1',
    '',
    '**Before:**',
    'old',
    '',
    '**After:**',
    'new',
    '',
    '**Reason:**',
    'narrows the behavior',
    '',
    '**Spec:**',
    'The sample requirement.',
    '- WHEN a, THEN x',
    '',
    '**Priority:** High',
    '',
    '---',
    '',
  ].join('\n');

  const METADATA = [
    'name: x',
    'created_at: 2026-01-01T00:00:00.000Z',
    'status: implemented',
    'scale: standard',
    '',
  ].join('\n');

  it('archive droppedBehavior and the check collector resolve the identical undeclared set', async () => {
    vol.fromJSON({
      '/repo/prospec/specs/features/drift-checks.md': FEATURE_SPEC,
      '/repo/.prospec/changes/x/delta-spec.md': DELTA_SPEC,
      '/repo/.prospec/changes/x/metadata.yaml': METADATA,
    });

    // Archive write path (dry-run) — its droppedBehavior comes from `droppedFor` → assessDrops.
    const sync = await syncToFeatureSpecs(
      '/repo/.prospec/changes/x',
      '/repo/prospec/specs/features',
      'x',
      true,
    );
    const archiveDropped = sync.droppedBehavior.find((d) => d.reqId === 'REQ-LIB-900');
    const archiveSet = new Set((archiveDropped?.bullets ?? []).map((b) => b.trim()));

    // Drift check path — its collector resolves the same existing body; assessDrops
    // over that resolution must yield the same set (it is the same function).
    const src = collectDeltaSpecLandingFidelity('/repo/prospec/specs/features', '/repo');
    const entry = src.entries.find((e) => e.reqId === 'REQ-LIB-900');
    expect(entry).toBeDefined();
    expect(entry!.existingBody).not.toBeNull();
    const checkSet = new Set(
      assessDrops(entry!.existingBody!, entry!.landing, entry!.declared).undeclared.map((b) => b.text.trim()),
    );

    expect(archiveSet.size).toBe(2);
    expect(checkSet).toEqual(archiveSet);
  });
});

describe('classifyRoutingResolution — the shared routing verdict (REQ-SPEC-012, issue #211)', () => {
  const homes = new Map<string, Set<string>>([
    ['REQ-LIB-900', new Set(['drift-checks'])],
    ['REQ-DUP-001', new Set(['beta', 'alpha'])],
  ]);

  it('resolves when the declared feature hosts the REQ id', () => {
    expect(classifyRoutingResolution('REQ-LIB-900', 'drift-checks', homes)).toEqual({ kind: 'resolved' });
  });

  it('reports wrong-feature, naming the REQ home, when the declared feature does not host it', () => {
    expect(classifyRoutingResolution('REQ-LIB-900', 'sdd-workflow', homes)).toEqual({
      kind: 'wrong-feature',
      home: 'drift-checks',
    });
  });

  it('reports not-found when no feature defines the REQ id', () => {
    expect(classifyRoutingResolution('REQ-LIB-999', 'drift-checks', homes)).toEqual({ kind: 'not-found' });
  });

  it('picks a stable sorted-first home when an id (pathologically) lives in >1 feature', () => {
    expect(classifyRoutingResolution('REQ-DUP-001', 'gamma', homes)).toEqual({
      kind: 'wrong-feature',
      home: 'alpha',
    });
    // Membership still resolves either carrier.
    expect(classifyRoutingResolution('REQ-DUP-001', 'beta', homes)).toEqual({ kind: 'resolved' });
  });
});

describe('routing-header resolution — check fails and archive refuses from one verdict (issue #211)', () => {
  beforeEach(() => vol.reset());

  const spec = (feature: string, reqId: string): string =>
    [
      '---',
      `feature: ${feature}`,
      'status: active',
      'last_updated: 2026-01-01',
      'story_count: 1',
      'req_count: 1',
      '---',
      '',
      `# ${feature}`,
      '',
      '## User Stories & Behavior Specifications',
      '',
      '### US-1',
      '',
      `#### ${reqId}: Sample`,
      'The sample requirement.',
      '- WHEN a, THEN x',
      '',
      '---',
      '',
      '## Change History',
      '',
      '| Date | Change | Impact | Stories/REQs |',
      '|------|--------|--------|-------------|',
      '',
    ].join('\n');

  // REQ-LIB-900 lives in drift-checks, but the delta-spec MODIFIES it while
  // declaring **Feature:** sdd-workflow — the exact #203 misplacement shape.
  const MISROUTED_DELTA = [
    '# Delta',
    '',
    '## MODIFIED',
    '',
    '### REQ-LIB-900: Sample',
    '',
    '**Feature:** sdd-workflow',
    '**Story:** US-1',
    '',
    '**Before:**',
    'old',
    '',
    '**After:**',
    'new',
    '',
    '**Spec:**',
    'The sample requirement.',
    '- WHEN a, THEN x',
    '',
    '**Priority:** High',
    '',
    '---',
    '',
  ].join('\n');

  const METADATA = [
    'name: x',
    'created_at: 2026-01-01T00:00:00.000Z',
    'status: implemented',
    'scale: standard',
    '',
  ].join('\n');

  const seed = (delta: string) =>
    vol.fromJSON({
      '/repo/prospec/specs/features/drift-checks.md': spec('drift-checks', 'REQ-LIB-900'),
      '/repo/prospec/specs/features/sdd-workflow.md': spec('sdd-workflow', 'REQ-SERVICES-900'),
      '/repo/.prospec/changes/x/delta-spec.md': delta,
      '/repo/.prospec/changes/x/metadata.yaml': METADATA,
    });

  it('buildReqHomeIndex maps each REQ id to the feature that defines it', () => {
    seed(MISROUTED_DELTA);
    const homes = buildReqHomeIndex('/repo/prospec/specs/features');
    expect([...(homes.get('REQ-LIB-900') ?? [])]).toEqual(['drift-checks']);
    expect([...(homes.get('REQ-SERVICES-900') ?? [])]).toEqual(['sdd-workflow']);
    expect(homes.has('REQ-LIB-999')).toBe(false);
  });

  it('the check collector attaches a wrong-feature resolution naming the home', () => {
    seed(MISROUTED_DELTA);
    const src = collectDeltaSpecLandingFidelity('/repo/prospec/specs/features', '/repo');
    const entry = src.entries.find((e) => e.reqId === 'REQ-LIB-900');
    expect(entry?.resolution).toEqual({ kind: 'wrong-feature', home: 'drift-checks' });
  });

  it('archive refuses the misrouted REQ instead of appending it to the wrong feature', async () => {
    seed(MISROUTED_DELTA);
    const before = vol.readFileSync('/repo/prospec/specs/features/sdd-workflow.md', 'utf-8');
    const sync = await syncToFeatureSpecs('/repo/.prospec/changes/x', '/repo/prospec/specs/features', 'x', false);
    expect(sync.refusedRequirements).toHaveLength(1);
    const refusal = sync.refusedRequirements[0]!;
    expect(refusal.kind).toBe('unresolved-feature');
    if (refusal.kind !== 'unresolved-feature') throw new Error('expected an unresolved-feature refusal');
    expect(refusal).toMatchObject({ reqId: 'REQ-LIB-900', feature: 'sdd-workflow', home: 'drift-checks' });
    // The wrong feature spec is left byte-identical — no stale duplicate appended.
    expect(vol.readFileSync('/repo/prospec/specs/features/sdd-workflow.md', 'utf-8')).toBe(before);
    expect(vol.readFileSync('/repo/prospec/specs/features/sdd-workflow.md', 'utf-8')).not.toContain('REQ-LIB-900');
  });

  it('a dry run reports the identical refusal and writes nothing', async () => {
    seed(MISROUTED_DELTA);
    const before = vol.readFileSync('/repo/prospec/specs/features/sdd-workflow.md', 'utf-8');
    const sync = await syncToFeatureSpecs('/repo/.prospec/changes/x', '/repo/prospec/specs/features', 'x', true);
    expect(sync.refusedRequirements).toHaveLength(1);
    expect(sync.refusedRequirements[0]).toMatchObject({
      kind: 'unresolved-feature',
      reqId: 'REQ-LIB-900',
      home: 'drift-checks',
    });
    expect(vol.readFileSync('/repo/prospec/specs/features/sdd-workflow.md', 'utf-8')).toBe(before);
  });

  // The create path (declared feature has NO spec file) is a SECOND refusal site:
  // a MODIFIED whose REQ lives in an existing feature must not be fabricated into a
  // brand-new spec. Deleting the `misrouted`-set guard leaves this green otherwise.
  const MISROUTED_TO_NEW_FEATURE = [
    '# Delta',
    '',
    '## MODIFIED',
    '',
    '### REQ-LIB-900: Sample',
    '',
    '**Feature:** brand-new',
    '**Story:** US-1',
    '',
    '**Before:**',
    'old',
    '',
    '**After:**',
    'new',
    '',
    '**Spec:**',
    'The sample requirement.',
    '- WHEN a, THEN x',
    '',
    '**Priority:** High',
    '',
    '---',
    '',
  ].join('\n');

  it('refuses a MODIFIED routed to a NON-existent feature whose REQ lives elsewhere, writing no new spec', async () => {
    seed(MISROUTED_TO_NEW_FEATURE);
    expect(vol.existsSync('/repo/prospec/specs/features/brand-new.md')).toBe(false);
    const sync = await syncToFeatureSpecs('/repo/.prospec/changes/x', '/repo/prospec/specs/features', 'x', false);
    expect(sync.refusedRequirements).toHaveLength(1);
    expect(sync.refusedRequirements[0]).toMatchObject({
      kind: 'unresolved-feature',
      reqId: 'REQ-LIB-900',
      feature: 'brand-new',
      home: 'drift-checks',
    });
    // No brand-new spec is fabricated — the REQ lives in drift-checks.
    expect(vol.existsSync('/repo/prospec/specs/features/brand-new.md')).toBe(false);
  });
});
