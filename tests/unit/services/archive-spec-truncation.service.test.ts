import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  DELTA_TEMPLATE_FIELDS,
  classifyBlockTerminator,
  extractDeltaBlock,
  syncToFeatureSpecs,
  declaredDrops,
  whenThenBullets,
} from '../../../src/services/archive.service.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

beforeEach(() => {
  vol.reset();
});

/**
 * The block-terminator classifier (REQ-SERVICES-081).
 *
 * Before this existed the boundary was one regex: ANY `**Label:**` line ended a
 * `**Spec:**` block and everything after it was dropped, silently. That collided
 * head-on with the Feature Spec scaffold, whose REQ body is literally a sentence
 * followed by `**Scenarios:**` and its bullets — so a landing block written to the
 * documented shape landed as its first sentence and nothing else.
 *
 * The fix is to tell the template's OWN next field apart from a label that is part
 * of the author's body. The first still terminates; the second is a truncation the
 * caller refuses rather than silently honours.
 */
describe('classifyBlockTerminator (REQ-SERVICES-081)', () => {
  describe('the template registry terminates, exactly as before', () => {
    // Enumerated from the registry rather than hand-listed: a field added to the
    // template without a home here would otherwise start refusing every entry.
    it.each([...DELTA_TEMPLATE_FIELDS])('treats **%s:** as a normal terminator', (field) => {
      const r = classifyBlockTerminator(`**${field}:** whatever`);
      expect(r.kind).toBe('template-field');
    });

    it('carries the label so a caller can report which field ended the block', () => {
      expect(classifyBlockTerminator('**Priority:** High')).toEqual({
        kind: 'template-field',
        label: 'Priority',
      });
    });

    it('matches a template field regardless of case', () => {
      expect(classifyBlockTerminator('**priority:** High').kind).toBe('template-field');
    });
  });

  describe('a label outside the registry is body content, not a boundary', () => {
    it.each([
      ['the Feature Spec scaffold label that caused the incident', '**Scenarios:**'],
      ['its User Story sibling', '**Acceptance Scenarios:**'],
      ['an arbitrary authored label', '**Rollout:** phased'],
    ])('classifies %s as foreign', (_why, line) => {
      const r = classifyBlockTerminator(line);
      expect(r.kind).toBe('foreign-label');
    });

    it('carries the label text for the refusal message', () => {
      expect(classifyBlockTerminator('**Scenarios:**')).toEqual({
        kind: 'foreign-label',
        label: 'Scenarios',
      });
    });
  });

  describe('the non-label boundaries keep their existing meaning', () => {
    it.each([
      ['an h2 heading', '## Edge Cases'],
      ['an h4 heading', '#### REQ-X-001: title'],
    ])('classifies %s as a heading', (_why, line) => {
      expect(classifyBlockTerminator(line).kind).toBe('heading');
    });

    it('classifies an entry-separating rule', () => {
      expect(classifyBlockTerminator('---').kind).toBe('rule');
    });

    it.each([
      ['a WHEN/THEN bullet', '- WHEN x, THEN y'],
      ['plain prose', 'The library filters items by tag.'],
      ['an empty line', ''],
      ['inline emphasis that is not a label', 'text with **bold** inside'],
    ])('classifies %s as no boundary at all', (_why, line) => {
      expect(classifyBlockTerminator(line).kind).toBe('none');
    });
  });

  // The mirror of this change's own defect, recorded in the lessons ledger: the
  // label grammar excludes parentheses, so this LOOKS like a label but never was
  // one — the narrative after it was absorbed INTO the Spec block and landed in the
  // trust zone. Same regex, opposite direction. Reclassifying it as a boundary now
  // would silently change that behaviour, so it is pinned as `none` on purpose.
  it('leaves a parenthesised bold run as no boundary — it was never a label', () => {
    expect(classifyBlockTerminator('**Deviation (recorded at implement time):**').kind).toBe(
      'none',
    );
  });

  it('requires the label to start the line — an indented one is body content', () => {
    expect(classifyBlockTerminator('  **Scenarios:**').kind).toBe('foreign-label');
    expect(classifyBlockTerminator('- **Scenarios:** in a bullet').kind).toBe('none');
  });
});

/**
 * `extractDeltaBlock` now reports WHY a block ended, not just what it contained
 * (REQ-SERVICES-081). The content half must stay byte-identical to the old
 * behaviour — every existing archived delta-spec terminates at a template field,
 * so any change there would rewrite history rather than fix a bug.
 */
describe('extractDeltaBlock truncation reporting (REQ-SERVICES-081)', () => {
  const lines = (s: string): string[] => s.split('\n');

  it('returns the content unchanged when the template field ends the block', () => {
    const b = extractDeltaBlock(
      lines('**Spec:**\nThe body.\n- WHEN a, THEN b\n\n**Priority:** High'),
      'Spec',
    );
    expect(b.content).toBe('The body.\n- WHEN a, THEN b');
    expect(b.truncation).toBeNull();
  });

  it('returns empty content and no truncation when the block is absent', () => {
    const b = extractDeltaBlock(lines('**Description:**\nnothing here'), 'Spec');
    expect(b.content).toBe('');
    expect(b.truncation).toBeNull();
  });

  // The incident, reduced: a landing block written to the Feature Spec scaffold.
  it('reports the truncation when a foreign label cuts the block short', () => {
    const b = extractDeltaBlock(
      lines(
        [
          '**Spec:**',
          'The library filters items by tag, owner, date and status.',
          '',
          '**Scenarios:**',
          '- WHEN a tag filter is applied, THEN only tagged items are listed',
          '- WHEN a status filter is applied, THEN archived items are hidden',
          '',
          '**Priority:** High',
        ].join('\n'),
      ),
      'Spec',
    );
    expect(b.content).toBe('The library filters items by tag, owner, date and status.');
    expect(b.truncation).toEqual({
      block: 'Spec',
      label: 'Scenarios',
      firstSwallowedLine: '**Scenarios:**',
      swallowedCount: 2,
    });
  });

  it('counts swallowed CONTENT past a blank run, not counting the bare label line', () => {
    const b = extractDeltaBlock(
      lines('**Spec:**\nbody\n**Notes:**\nline one\n\n\nline two\n**Priority:** Low'),
      'Spec',
    );
    expect(b.truncation?.swallowedCount).toBe(2);
  });

  // A bare label with nothing under it carries no behaviour, so nothing is lost by
  // ending there — reporting it would be a refusal the author cannot act on.
  it('does NOT report a truncation when the foreign label swallows no content', () => {
    const b = extractDeltaBlock(lines('**Spec:**\nbody\n**Scenarios:**\n\n**Priority:** High'), 'Spec');
    expect(b.content).toBe('body');
    expect(b.truncation).toBeNull();
  });

  it.each([
    ['a heading', '**Spec:**\nbody\n## Edge Cases\nmore'],
    ['a rule', '**Spec:**\nbody\n---\nmore'],
  ])('does not report a truncation when %s ends the block (unchanged boundary)', (_why, src) => {
    const b = extractDeltaBlock(lines(src), 'Spec');
    expect(b.content).toBe('body');
    expect(b.truncation).toBeNull();
  });

  it('keeps the inline form working (content on the label line itself)', () => {
    const b = extractDeltaBlock(lines('**Spec:** one-liner body\n**Priority:** High'), 'Spec');
    expect(b.content).toBe('one-liner body');
    expect(b.truncation).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The refusal, observed where it matters: through the real sync, against a real
// (in-memory) feature spec. The assertion that counts is BYTE-IDENTICAL — a
// refusal that still rewrote the title line would be a refusal in name only.
// ---------------------------------------------------------------------------

const FEATURE_SPEC = `---
feature: content-library
status: active
last_updated: 2026-01-01
story_count: 1
req_count: 1
---

# content-library

## User Stories & Behavior Specifications

### US-003: Library browsing [P1]

#### REQ-CONTENT-LIBRARY-013: Library item filtering
The library filters items by tag, owner and date.

**Scenarios:**
- WHEN a tag filter is applied, THEN only items carrying that tag are listed
- WHEN two filters are applied, THEN they intersect
- WHEN no item matches, THEN an empty-state card is shown

---

## Edge Cases

- nothing
`;

const deltaSpec = (specBlock: string): string => `# Delta Spec

## MODIFIED

### REQ-CONTENT-LIBRARY-013: Library item filtering

**Feature:** content-library
**Story:** US-003

**Before:** old
**After:** new
**Reason:** because

**Spec:**
${specBlock}

**Priority:** High

---
`;

describe('syncToFeatureSpecs refuses a truncated landing block (REQ-SERVICES-081)', () => {
  const setup = (specBlock: string): void => {
    vol.reset();
    vol.fromJSON({
      '/f/content-library.md': FEATURE_SPEC,
      '/c/delta-spec.md': deltaSpec(specBlock),
    });
  };

  // Exactly the downstream incident: a landing block written to the Feature Spec
  // scaffold, restating every bullet AND adding a new one. Old behaviour landed
  // the first sentence and destroyed the rest without a word.
  const SCAFFOLD_SHAPED = `The library filters items by tag, owner, date and status.

**Scenarios:**
- WHEN a tag filter is applied, THEN only items carrying that tag are listed
- WHEN two filters are applied, THEN they intersect
- WHEN no item matches, THEN an empty-state card is shown
- WHEN a status filter is applied, THEN archived items are hidden`;

  it('leaves the feature spec byte-identical', async () => {
    setup(SCAFFOLD_SHAPED);
    await syncToFeatureSpecs('/c', '/f', 'my-change', false);
    expect(vol.readFileSync('/f/content-library.md', 'utf-8')).toBe(FEATURE_SPEC);
  });

  it('reports the REQ, the interrupting label and the first swallowed line', async () => {
    setup(SCAFFOLD_SHAPED);
    const r = await syncToFeatureSpecs('/c', '/f', 'my-change', false);
    expect(r.refusedRequirements).toEqual([
      {
        feature: 'content-library',
        reqId: 'REQ-CONTENT-LIBRARY-013',
        block: 'Spec',
        label: 'Scenarios',
        firstSwallowedLine: '**Scenarios:**',
        swallowedCount: 4,
      },
    ]);
  });

  // The bullets are not "dropped" — they were never compared, because the block
  // that would have replaced them was never trusted. Reporting them as drops too
  // would tell the author to restore text that is already safe on disk.
  it('does not also report the untouched bullets as dropped behavior', async () => {
    setup(SCAFFOLD_SHAPED);
    const r = await syncToFeatureSpecs('/c', '/f', 'my-change', false);
    expect(r.droppedBehavior).toEqual([]);
  });

  it('reports the refusal identically under dryRun and writes nothing', async () => {
    setup(SCAFFOLD_SHAPED);
    const r = await syncToFeatureSpecs('/c', '/f', 'my-change', true);
    expect(r.refusedRequirements).toHaveLength(1);
    expect(vol.readFileSync('/f/content-library.md', 'utf-8')).toBe(FEATURE_SPEC);
  });

  // No foreign label, so no refusal — but the block still omits one authored
  // bullet, which is a drop, and an undeclared drop holds the write (REQ-CLI-034).
  // The two guards are distinct and both apply.
  it('does not refuse — but still holds the write — when the block merely drops a bullet', async () => {
    setup(`The library filters items by tag, owner, date and status.
- WHEN a tag filter is applied, THEN only items carrying that tag are listed
- WHEN two filters are applied, THEN they intersect`);
    const r = await syncToFeatureSpecs('/c', '/f', 'my-change', false);
    expect(r.refusedRequirements).toEqual([]);
    expect(r.droppedBehavior[0]?.bullets).toEqual([
      '- WHEN no item matches, THEN an empty-state card is shown',
    ]);
    expect(vol.readFileSync('/f/content-library.md', 'utf-8')).toBe(FEATURE_SPEC);
  });

  it('lands the block once every dropped bullet is declared deliberate', async () => {
    setup(`The library filters items by tag, owner, date and status.
- WHEN a tag filter is applied, THEN only items carrying that tag are listed
- WHEN two filters are applied, THEN they intersect

**Dropped:**
- WHEN no item matches, THEN an empty-state card is shown`);
    const r = await syncToFeatureSpecs('/c', '/f', 'my-change', false);
    expect(r.droppedBehavior).toEqual([]);
    expect(vol.readFileSync('/f/content-library.md', 'utf-8')).toContain(
      'tag, owner, date and status',
    );
  });
});

// ---------------------------------------------------------------------------
// The deliberate-loss declaration (REQ-SERVICES-083). Parsing only — the set
// comparison that consumes it lives in assessSpecLoss.
// ---------------------------------------------------------------------------

describe('declaredDrops (REQ-SERVICES-083)', () => {
  const entry = (dropped: string | null): string[] =>
    [
      '**Spec:**',
      'The resulting body.',
      '- WHEN a, THEN b',
      '',
      ...(dropped === null ? [] : ['**Dropped:**', dropped, '']),
      '**Priority:** High',
    ].join('\n').split('\n');

  it('returns an empty list when the entry carries no declaration', () => {
    expect(declaredDrops(entry(null))).toEqual([]);
  });

  it('parses each declared bullet, keeping the text as written', () => {
    const d = declaredDrops(
      entry('- WHEN no item matches, THEN an empty-state card is shown\n- WHEN two filters are applied, THEN they intersect'),
    );
    expect(d.map((b) => b.text)).toEqual([
      '- WHEN no item matches, THEN an empty-state card is shown',
      '- WHEN two filters are applied, THEN they intersect',
    ]);
  });

  // The declaration is compared against the computed drop set, so it MUST key
  // through the same normalisation — otherwise a correct declaration made from the
  // dry-run output would fail to match and the author could never clear the gate.
  it('keys a declared bullet identically to the same bullet in a body', () => {
    const declared = declaredDrops(entry('-   WHEN   no item matches,  THEN a card is shown'));
    const inBody = whenThenBullets('- WHEN no item matches, THEN a card is shown');
    expect(declared[0]?.key).toBe(inBody[0]?.key);
  });

  it('joins an indented continuation into its bullet, as a body would', () => {
    const d = declaredDrops(entry('- WHEN a happens,\n  THEN b follows'));
    expect(d).toHaveLength(1);
    expect(d[0]?.key).toBe(whenThenBullets('- WHEN a happens, THEN b follows')[0]?.key);
  });

  // Captured rather than dropped on the floor: a declaration that matches nothing
  // is reported as stale, and it can only be reported if it was parsed.
  it('captures a declared line that is not WHEN/THEN shaped', () => {
    const d = declaredDrops(entry('- the old paging behavior'));
    expect(d.map((b) => b.text)).toEqual(['- the old paging behavior']);
  });

  it.each([
    ['an asterisk marker', '* WHEN a, THEN b'],
    ['an ordered marker', '1. WHEN a, THEN b'],
  ])('accepts %s, matching the widened body matcher', (_why, bullet) => {
    expect(declaredDrops(entry(bullet))).toHaveLength(1);
  });

  it('ignores prose in the declaration block that is not a list item', () => {
    const d = declaredDrops(entry('These are deliberate:\n- WHEN a, THEN b'));
    expect(d.map((b) => b.text)).toEqual(['- WHEN a, THEN b']);
  });
});

// ---------------------------------------------------------------------------
// The loss verdict (REQ-CLI-034 + REQ-SERVICES-083). The behaviour under test is
// not "is it reported" — that already worked — but "is the file still intact".
// ---------------------------------------------------------------------------

const TWO_FEATURES = {
  '/f/content-library.md': FEATURE_SPEC,
  '/f/other.md': `---
feature: other
status: active
last_updated: 2026-01-01
---

# other

## User Stories & Behavior Specifications

### US-001: Something [P1]

#### REQ-OTHER-001: A requirement
Old body.
- WHEN x, THEN y

---

## Edge Cases

- nothing
`,
};

const twoFeatureDelta = (libSpec: string, libDropped = ''): string => `# Delta Spec

## MODIFIED

### REQ-CONTENT-LIBRARY-013: Library item filtering

**Feature:** content-library
**Story:** US-003

**Spec:**
${libSpec}
${libDropped}
**Priority:** High

---

### REQ-OTHER-001: A requirement

**Feature:** other
**Story:** US-001

**Spec:**
New body for other.
- WHEN x, THEN y

**Priority:** High

---
`;

describe('spec-loss verdict holds the write back (REQ-CLI-034)', () => {
  const run = async (libSpec: string, libDropped = '', dryRun = false) => {
    vol.reset();
    vol.fromJSON({ ...TWO_FEATURES, '/c/delta-spec.md': twoFeatureDelta(libSpec, libDropped) });
    return syncToFeatureSpecs('/c', '/f', 'my-change', dryRun);
  };

  // Drops every authored bullet without declaring any of them.
  const LOSSY = 'The library filters items by tag and owner.';

  it('does not write a feature spec that would lose an undeclared bullet', async () => {
    const r = await run(LOSSY);
    expect(r.droppedBehavior).toHaveLength(1);
    expect(vol.readFileSync('/f/content-library.md', 'utf-8')).toBe(FEATURE_SPEC);
  });

  // Per feature spec, not per run: holding back an unrelated file would turn one
  // bad landing block into a stalled archive for the whole change.
  it('still writes the OTHER feature spec in the same run', async () => {
    const r = await run(LOSSY);
    const other = vol.readFileSync('/f/other.md', 'utf-8') as string;
    expect(other).toContain('New body for other.');
    expect(r.files).toContain('/f/other.md');
    expect(r.files).not.toContain('/f/content-library.md');
  });

  it('writes normally when every dropped bullet is declared deliberate', async () => {
    const declared = `**Dropped:**
- WHEN a tag filter is applied, THEN only items carrying that tag are listed
- WHEN two filters are applied, THEN they intersect
- WHEN no item matches, THEN an empty-state card is shown
`;
    const r = await run(LOSSY, declared);
    expect(r.droppedBehavior).toEqual([]);
    expect(r.acknowledgedDrops[0]?.bullets).toHaveLength(3);
    expect(vol.readFileSync('/f/content-library.md', 'utf-8')).toContain(
      'The library filters items by tag and owner.',
    );
  });

  it('holds the write and names the gap when the declaration misses one bullet', async () => {
    const partial = `**Dropped:**
- WHEN a tag filter is applied, THEN only items carrying that tag are listed
- WHEN two filters are applied, THEN they intersect
`;
    const r = await run(LOSSY, partial);
    expect(r.droppedBehavior[0]?.bullets).toEqual([
      '- WHEN no item matches, THEN an empty-state card is shown',
    ]);
    expect(vol.readFileSync('/f/content-library.md', 'utf-8')).toBe(FEATURE_SPEC);
  });

  // Declaring something that was not dropped means the author is working from a
  // body the spec no longer has. Worth saying, not worth blocking on.
  it('reports a stale declaration without holding the write back', async () => {
    const stale = `**Dropped:**
- WHEN a tag filter is applied, THEN only items carrying that tag are listed
- WHEN two filters are applied, THEN they intersect
- WHEN no item matches, THEN an empty-state card is shown
- WHEN a behavior that never existed, THEN nothing
`;
    const r = await run(LOSSY, stale);
    expect(r.staleDeclarations[0]?.bullets).toEqual([
      '- WHEN a behavior that never existed, THEN nothing',
    ]);
    expect(r.droppedBehavior).toEqual([]);
    expect(vol.readFileSync('/f/content-library.md', 'utf-8')).not.toBe(FEATURE_SPEC);
  });

  it('reports the identical verdict under dryRun and writes nothing at all', async () => {
    const wet = await run(LOSSY);
    const dry = await run(LOSSY, '', true);
    expect(dry.droppedBehavior).toEqual(wet.droppedBehavior);
    expect(vol.readFileSync('/f/other.md', 'utf-8')).toBe(TWO_FEATURES['/f/other.md']);
  });

  // A declaration is not a way around a broken block: the block is the thing that
  // needs fixing, and no amount of declaring changes that.
  it('does not let a declaration release a truncation refusal', async () => {
    const truncated = `The library filters items by tag and owner.

**Scenarios:**
- WHEN a tag filter is applied, THEN only items carrying that tag are listed
`;
    const declared = `**Dropped:**
- WHEN no item matches, THEN an empty-state card is shown
`;
    const r = await run(truncated, declared);
    expect(r.refusedRequirements).toHaveLength(1);
    expect(vol.readFileSync('/f/content-library.md', 'utf-8')).toBe(FEATURE_SPEC);
  });

  // Registry self-consistency: `Dropped` must be a template field, or the very
  // block that declares a deliberate loss truncates the Spec block above it.
  it('does not let the declaration block truncate the landing block it accompanies', async () => {
    const declared = `**Dropped:**
- WHEN a tag filter is applied, THEN only items carrying that tag are listed
- WHEN two filters are applied, THEN they intersect
- WHEN no item matches, THEN an empty-state card is shown
`;
    const r = await run('The library filters items by tag and owner.', declared);
    expect(r.refusedRequirements).toEqual([]);
  });
});

/**
 * Round-1 review regressions. Each of these shapes reached the trust zone (or was
 * wrongly refused) on the first implementation of this change; every one is here
 * because a reviewer reproduced it, not because it was imagined.
 */
describe('review round-1 regressions (REQ-SERVICES-081 / REQ-SERVICES-073)', () => {
  const lines = (s: string): string[] => s.split('\n');

  // The registry is the guard's whole vocabulary, so it is pinned against a
  // literal rather than derived from itself: `it.each([...DELTA_TEMPLATE_FIELDS])`
  // shrinks its own matrix when a field is deleted and stays green.
  it('pins the template field registry against a version-controlled baseline', () => {
    expect([...DELTA_TEMPLATE_FIELDS]).toEqual([
      'Feature',
      'Story',
      'Before',
      'After',
      'Reason',
      'Description',
      'Acceptance Criteria',
      'Spec',
      'Dropped',
      'Priority',
    ]);
  });

  // F-1: label and behaviour on ONE line. Counting lines scored this 1, slipped it
  // under a `> 1` threshold, and dropped the sentence silently.
  it('refuses when a foreign label carries its content inline on the label line', () => {
    const b = extractDeltaBlock(
      lines('**Spec:**\nThe thing.\n**Scenarios:** WHEN x happens, THEN y follows\n\n**Priority:** High'),
      'Spec',
    );
    expect(b.truncation).toEqual({
      block: 'Spec',
      label: 'Scenarios',
      firstSwallowedLine: '**Scenarios:** WHEN x happens, THEN y follows',
      swallowedCount: 1,
    });
  });

  // F-2: membership alone made the registry a silent-truncation allowlist. The drop
  // diff cannot cover this — the lost bullets are NEW text, absent from the
  // superseded body, so the set difference sees nothing missing.
  it('refuses when a template field REPEATS inside the block it already terminated', () => {
    const b = extractDeltaBlock(
      lines(
        [
          '**Before:**','old','**Reason:**','because','**Spec:**',
          '- WHEN a, THEN b',
          '**Reason:** legacy clients send blanks',
          '- WHEN c, THEN d',
          '- WHEN e, THEN f',
          '','**Priority:** High',
        ].join('\n'),
      ),
      'Spec',
    );
    expect(b.truncation?.label).toBe('Reason');
    expect(b.truncation?.swallowedCount).toBe(3);
  });

  // The false-positive this must NOT create: real archived entries write
  // `**Acceptance Criteria:**` AFTER `**Spec:**`, so a fixed field ORDER refused
  // four legitimate entries in this repo's own archive. First occurrence, not order.
  it('keeps a template field that FIRST occurs after the block as a normal boundary', () => {
    const b = extractDeltaBlock(
      lines(
        ['**Before:**','old','**After:**','new','**Spec:**','body','- WHEN a, THEN b','',
         '**Acceptance Criteria:**','1. x','','**Priority:** High'].join('\n'),
      ),
      'Spec',
    );
    expect(b.truncation).toBeNull();
    expect(b.content).toBe('body\n- WHEN a, THEN b');
  });

  // F-3: `delta-spec-format` MANDATES `- WHEN …` in a landing block, so a project
  // whose spec uses `*` or `1.` compared its own unchanged behaviour against the
  // mandated shape and got a FALSE drop — which, once drops began blocking, became
  // a wall telling the author to restore a bullet that was already there.
  it.each([
    ['an asterisk marker', '* WHEN a happens, THEN b follows'],
    ['an ordered marker', '1. WHEN a happens, THEN b follows'],
    ['bolded keywords', '- **WHEN** a happens, **THEN** b follows'],
  ])('does not report a false drop when the existing spec uses %s', async (_why, existing) => {
    vol.reset();
    vol.fromJSON({
      '/f/content-library.md': FEATURE_SPEC.replace(
        '- WHEN a tag filter is applied, THEN only items carrying that tag are listed',
        existing,
      ).replace('- WHEN two filters are applied, THEN they intersect\n', '')
        .replace('- WHEN no item matches, THEN an empty-state card is shown\n', ''),
      '/c/delta-spec.md': deltaSpec(
        'The library filters items by tag.\n- WHEN a happens, THEN b follows',
      ),
    });
    const r = await syncToFeatureSpecs('/c', '/f', 'my-change', false);
    expect(r.droppedBehavior).toEqual([]);
    expect(r.files).toEqual(['/f/content-library.md']);
  });

  // F-5: for MODIFIED the Description/AC blocks are change narrative that never
  // lands, so a truncation in them must not deny the REQ the preserve-body +
  // pendingConvergence path REQ-SERVICES-072 guarantees.
  it('preserves and reports a MODIFIED entry whose Description is truncated, instead of refusing', async () => {
    vol.reset();
    vol.fromJSON({
      '/f/content-library.md': FEATURE_SPEC,
      '/c/delta-spec.md': `# Delta Spec

## MODIFIED

### REQ-CONTENT-LIBRARY-013: Library item filtering

**Feature:** content-library
**Story:** US-003

**Description:**
tighten the filter

**Scenarios:**
- WHEN a tag filter is applied, THEN only tagged items are listed

**Priority:** High

---
`,
    });
    const r = await syncToFeatureSpecs('/c', '/f', 'my-change', false);
    expect(r.refusedRequirements).toEqual([]);
    expect(r.pendingConvergence).toHaveLength(1);
    expect(r.pendingConvergence[0]!.reqId).toBe('REQ-CONTENT-LIBRARY-013');
    const out = vol.readFileSync('/f/content-library.md', 'utf-8') as string;
    expect(out).toContain('- WHEN no item matches, THEN an empty-state card is shown');
  });
});

// Round-2 regression: the refusal must identify WHICH block was cut short. An
// ADDED entry with no `**Spec:**` block falls back to Description/Acceptance
// Criteria, and the remediation used to point at a block that does not exist.
describe('review round-2 regressions', () => {
  it('names the ADDED fallback block when that is the one truncated', async () => {
    vol.reset();
    vol.fromJSON({
      '/f/content-library.md': FEATURE_SPEC,
      '/c/delta-spec.md': `# Delta Spec

## ADDED

### REQ-CONTENT-LIBRARY-020: A new requirement

**Feature:** content-library
**Story:** US-003

**Description:**
The library exposes saved views.

**Scenarios:**
- WHEN a view is saved, THEN it appears in the sidebar

**Priority:** High

---
`,
    });
    const r = await syncToFeatureSpecs('/c', '/f', 'my-change', false);
    expect(r.refusedRequirements).toHaveLength(1);
    expect(r.refusedRequirements[0]!.block).toBe('Description');
    expect(r.refusedRequirements[0]!.label).toBe('Scenarios');
  });

  // A REMOVED route in a file held back by an undeclared drop must NOT surface a
  // "strike the deprecated body by hand" entry: the deprecation lives only in the
  // discarded in-memory copy, so acting on it would delete authored trust-zone
  // text for an event that never happened.
  it('reports no convergence worklist for a file whose write was held', async () => {
    vol.reset();
    vol.fromJSON({
      '/f/content-library.md': FEATURE_SPEC.replace(
        '---\n\n## Edge Cases',
        '#### REQ-CONTENT-LIBRARY-014: doomed\nOld doomed body.\n\n---\n\n## Edge Cases',
      ),
      '/c/delta-spec.md': `${deltaSpec('A new body that restates nothing.')}
## REMOVED

### REQ-CONTENT-LIBRARY-014: doomed

**Feature:** content-library

**Reason:**
gone

---
`,
    });
    const r = await syncToFeatureSpecs('/c', '/f', 'my-change', false);
    expect(r.droppedBehavior).toHaveLength(1);
    expect(r.pendingConvergence).toEqual([]);
    expect(vol.readFileSync('/f/content-library.md', 'utf-8')).not.toContain('Deprecated');
  });
});
