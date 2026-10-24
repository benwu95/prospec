import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';
import {
  assessDrops,
  classifyRoutingResolution,
  whenThenBullets,
  declaredDrops,
  emptyLandingBlock,
  extractDeltaBlock,
  iterateDeltaEntries,
} from '../../../src/lib/landing-fidelity.js';
import { collectDeltaSpecLandingFidelity } from '../../../src/lib/drift-sources.js';
import { evaluateDeltaSpecLandingFidelity } from '../../../src/lib/drift-checker.js';
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

  it('iterateDeltaEntries masks headings inside code fences (REQ-LIB-085)', () => {
    const entries = iterateDeltaEntries(
      [
        '## ADDED',
        '',
        '### REQ-LIB-901: Real entry',
        '**Feature:** drift-checks',
        '```markdown',
        '### REQ-LIB-999: Fenced example',
        '**Feature:** drift-checks',
        '```',
        '',
        '### REQ-LIB-902: Another real entry',
        '**Feature:** drift-checks',
      ].join('\n'),
    );
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.reqId)).toEqual(['REQ-LIB-901', 'REQ-LIB-902']);
    expect(entries[0]!.body.join('\n')).toContain('### REQ-LIB-999: Fenced example');
  });
});

describe('emptyLandingBlock — a **Spec:** label whose block holds no content (issue #409)', () => {
  const entry = (section: string, body: string[]) => {
    const parsed = iterateDeltaEntries(
      [`## ${section}`, '', '### REQ-LIB-900: Sample', '', '**Feature:** drift-checks', '', ...body].join('\n'),
    );
    expect(parsed).toHaveLength(1);
    return parsed[0]!;
  };

  it.each([
    ['a pasted REQ heading', ['**Spec:**', '#### REQ-LIB-900: Sample', 'Body.', '- WHEN a, THEN x'], '#### REQ-LIB-900: Sample'],
    ['a heading after blank lines', ['**Spec:**', '', '', '## Notes', 'Body.'], '## Notes'],
    ['a first-occurrence template field', ['**Spec:**', '**Dropped:**', '- WHEN a, THEN x'], '**Dropped:**'],
    ['a repeated template field with nothing after it', ['**Reason:**', 'why', '**Spec:**', '**Reason:**', '', '---'], '**Reason:**'],
    ['a bare foreign label', ['**Spec:**', '**Scenarios:**', '', '**Priority:** High'], '**Scenarios:**'],
    ['a --- rule', ['**Spec:**', '', '---'], '---'],
  ])('flags a MODIFIED block ended by %s and names that line', (_shape, body, boundary) => {
    expect(emptyLandingBlock(entry('MODIFIED', body))).toEqual({ boundary });
  });

  it('flags a MODIFIED block that runs to the end of the entry with a null boundary', () => {
    expect(emptyLandingBlock(entry('MODIFIED', ['**Before:**', 'old', '', '**Spec:**', '', '']))).toEqual({ boundary: null });
  });

  it('does not flag a MODIFIED entry with no **Spec:** label', () => {
    expect(emptyLandingBlock(entry('MODIFIED', ['**Before:**', 'old', '**After:**', 'new']))).toBeNull();
  });

  it('does not flag a block whose content sits on the label line or under it', () => {
    expect(emptyLandingBlock(entry('MODIFIED', ['**Spec:** The lib does things.']))).toBeNull();
    expect(emptyLandingBlock(entry('MODIFIED', ['**Spec:**', '', 'The lib does things.', '- WHEN a, THEN x']))).toBeNull();
  });

  it('leaves a truncation to the truncation refusal', () => {
    const e = entry('MODIFIED', ['**Spec:**', '**Scenarios:**', '- WHEN a, THEN x']);
    expect(extractDeltaBlock(e.body, 'Spec').truncation).not.toBeNull();
    expect(emptyLandingBlock(e)).toBeNull();
  });

  it.each(['ADDED', 'REMOVED'])('does not flag an empty **Spec:** block in a %s entry', (section) => {
    expect(emptyLandingBlock(entry(section, ['**Spec:**', '#### REQ-LIB-900: Sample', 'Body.']))).toBeNull();
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

  it('struck-only has no existingBody or archive drop/stale assessment', async () => {
    const retired = FEATURE_SPEC.replace('#### REQ-LIB-900: Sample', '#### ~~REQ-LIB-900: Sample~~\n**Removed**: 2026-01-01\n**Reason**: superseded');
    vol.fromJSON({
      '/repo/prospec/specs/features/drift-checks.md': retired,
      '/repo/.prospec/changes/x/delta-spec.md': DELTA_SPEC.replace('**Priority:** High', '**Dropped:**\n- WHEN b, THEN y\n\n**Priority:** High'),
      '/repo/.prospec/changes/x/metadata.yaml': METADATA,
    });
    const facts = collectDeltaSpecLandingFidelity('/repo/prospec/specs/features', '/repo');
    expect(facts.entries).toHaveLength(1);
    expect(facts.entries[0]!.existingBody).toBeNull();
    const result = await syncToFeatureSpecs('/repo/.prospec/changes/x', '/repo/prospec/specs/features', 'x');
    expect(result.droppedBehavior).toEqual([]);
    expect(result.staleDeclarations).toEqual([]);
  });

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

describe('empty **Spec:** block — check fails and archive refuses from one verdict (issue #409)', () => {
  beforeEach(() => vol.reset());

  const FEATURES = '/repo/prospec/specs/features';
  const CHANGE = '/repo/.prospec/changes/x';
  const spec = (feature: string, reqIds: string[], extra: string[] = []): string =>
    [
      '---',
      `feature: ${feature}`,
      'status: active',
      'last_updated: 2026-01-01',
      'story_count: 1',
      `req_count: ${reqIds.length}`,
      '---',
      '',
      `# ${feature}`,
      '',
      '### US-1',
      '',
      ...reqIds.flatMap((id) => [`#### ${id}: Sample`, 'The sample requirement.', '- WHEN a, THEN x', '']),
      ...extra,
      '## Change History',
      '',
      '| Date | Change | Impact | Stories/REQs |',
      '|------|--------|--------|-------------|',
      '',
    ].join('\n');
  const modified = (reqId: string, feature: string, specLines: string[] | null): string[] => [
    `### ${reqId}: Sample`,
    '',
    `**Feature:** ${feature}`,
    '**Story:** US-1',
    '',
    '**Before:**',
    'old',
    '',
    '**After:**',
    'new',
    '',
    ...(specLines === null ? [] : ['**Spec:**', ...specLines, '']),
    '**Priority:** High',
    '',
    '---',
    '',
  ];
  const delta = (...entries: string[][]): string => ['# Delta', '', '## MODIFIED', '', ...entries.flat()].join('\n');
  const PASTED = ['#### REQ-LIB-900: Sample', 'The sample requirement.', '- WHEN a, THEN x'];
  const seed = (deltaContent: string, specs: Record<string, string> = { 'drift-checks': spec('drift-checks', ['REQ-LIB-900']) }) =>
    vol.fromJSON({
      ...Object.fromEntries(Object.entries(specs).map(([f, c]) => [`${FEATURES}/${f}.md`, c])),
      [`${CHANGE}/delta-spec.md`]: deltaContent,
      [`${CHANGE}/metadata.yaml`]: 'name: x\ncreated_at: 2026-01-01T00:00:00.000Z\nstatus: implemented\nscale: standard\n',
    });

  it.each([false, true])('refuses a pasted-heading **Spec:** block and leaves the spec byte-identical (dryRun=%s)', async (dryRun) => {
    seed(delta(modified('REQ-LIB-900', 'drift-checks', PASTED)));
    const before = vol.readFileSync(`${FEATURES}/drift-checks.md`, 'utf-8');
    const sync = await syncToFeatureSpecs(CHANGE, FEATURES, 'x', dryRun);
    expect(sync.refusedRequirements).toEqual([
      { kind: 'empty-spec', feature: 'drift-checks', reqId: 'REQ-LIB-900', boundary: '#### REQ-LIB-900: Sample' },
    ]);
    expect(sync.pendingConvergence).toEqual([]);
    expect(vol.readFileSync(`${FEATURES}/drift-checks.md`, 'utf-8')).toBe(before);
  });

  it('names the line that ended the block, or null when the entry ends first', async () => {
    seed(delta(modified('REQ-LIB-900', 'drift-checks', []).filter((l) => l !== '---')));
    const sync = await syncToFeatureSpecs(CHANGE, FEATURES, 'x', false);
    expect(sync.refusedRequirements).toEqual([
      { kind: 'empty-spec', feature: 'drift-checks', reqId: 'REQ-LIB-900', boundary: '**Priority:** High' },
    ]);
    seed(['# Delta', '', '## MODIFIED', '', '### REQ-LIB-900: Sample', '**Feature:** drift-checks', '', '**Spec:**', ''].join('\n'));
    const atEnd = await syncToFeatureSpecs(CHANGE, FEATURES, 'x', false);
    expect(atEnd.refusedRequirements).toEqual([
      { kind: 'empty-spec', feature: 'drift-checks', reqId: 'REQ-LIB-900', boundary: null },
    ]);
  });

  it('refuses on the creation path too, writing no new spec', async () => {
    seed(delta(modified('REQ-LIB-950', 'brand-new', PASTED)));
    const sync = await syncToFeatureSpecs(CHANGE, FEATURES, 'x', false);
    expect(sync.refusedRequirements).toEqual([
      { kind: 'empty-spec', feature: 'brand-new', reqId: 'REQ-LIB-950', boundary: '#### REQ-LIB-900: Sample' },
    ]);
    expect(vol.existsSync(`${FEATURES}/brand-new.md`)).toBe(false);
  });

  it('keeps preserve-and-report for a MODIFIED entry with no **Spec:** label', async () => {
    seed(delta(modified('REQ-LIB-900', 'drift-checks', null)));
    const sync = await syncToFeatureSpecs(CHANGE, FEATURES, 'x', false);
    expect(sync.refusedRequirements).toEqual([]);
    expect(sync.pendingConvergence.map((p) => p.reqId)).toEqual(['REQ-LIB-900']);
  });

  it('reports a truncation as a truncation, not as an empty block', async () => {
    seed(delta(modified('REQ-LIB-900', 'drift-checks', ['**Scenarios:**', '- WHEN a, THEN x'])));
    const sync = await syncToFeatureSpecs(CHANGE, FEATURES, 'x', false);
    expect(sync.refusedRequirements.map((r) => r.kind)).toEqual(['truncation']);
  });

  it.each([
    ['an existing declared feature', 'sdd-workflow'],
    ['a feature with no spec yet', 'brand-new'],
  ])('reports only the mis-route when the header is mis-routed to %s', async (_where, declared) => {
    seed(delta(modified('REQ-LIB-900', declared, PASTED)), {
      'drift-checks': spec('drift-checks', ['REQ-LIB-900']),
      'sdd-workflow': spec('sdd-workflow', ['REQ-SERVICES-900']),
    });
    const sync = await syncToFeatureSpecs(CHANGE, FEATURES, 'x', false);
    expect(sync.refusedRequirements.map((r) => r.kind)).toEqual(['unresolved-feature']);
    const check = collectDeltaSpecLandingFidelity(FEATURES, '/repo');
    const findings = evaluateDeltaSpecLandingFidelity(check).findings;
    expect(findings).toHaveLength(1);
    expect(findings[0]!.detail).toContain('drift-checks');
  });

  it('reports the unclosed fence instead of the empty block', async () => {
    seed(delta(modified('REQ-LIB-900', 'drift-checks', PASTED)), {
      'drift-checks': spec('drift-checks', ['REQ-LIB-900'], ['~~~md', '']),
    });
    const sync = await syncToFeatureSpecs(CHANGE, FEATURES, 'x', false);
    expect(sync.refusedRequirements.map((r) => r.kind)).toEqual(['unclosed-fence']);
  });

  it('the check collector and archive flag the identical set of empty-block entries', async () => {
    seed(
      delta(
        modified('REQ-LIB-900', 'drift-checks', PASTED),
        modified('REQ-LIB-901', 'drift-checks', ['The sample requirement.', '- WHEN a, THEN x']),
        modified('REQ-LIB-902', 'drift-checks', ['**Dropped:**', '- WHEN a, THEN x']),
        modified('REQ-LIB-903', 'drift-checks', null),
      ),
      { 'drift-checks': spec('drift-checks', ['REQ-LIB-900', 'REQ-LIB-901', 'REQ-LIB-902', 'REQ-LIB-903']) },
    );
    const checked = collectDeltaSpecLandingFidelity(FEATURES, '/repo')
      .entries.filter((e) => e.emptySpec !== null)
      .map((e) => e.reqId);
    const sync = await syncToFeatureSpecs(CHANGE, FEATURES, 'x', true);
    const refused = sync.refusedRequirements.filter((r) => r.kind === 'empty-spec').map((r) => r.reqId);
    expect(checked).toEqual(['REQ-LIB-900', 'REQ-LIB-902']);
    expect(refused).toEqual(checked);
  });
});
