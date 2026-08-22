import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';
import {
  assessDrops,
  whenThenBullets,
  declaredDrops,
  extractDeltaBlock,
  iterateDeltaEntries,
} from '../../../src/lib/landing-fidelity.js';
import { collectDeltaSpecLandingFidelity } from '../../../src/lib/drift-sources.js';
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
