import { describe, it, expect } from 'vitest';
import {
  declaresEveryStation,
  isUndeclaredStations,
  normalizeStationName,
  ruleAppliesToStation,
  sliceConstitution,
  sliceConstitutionRule,
} from '../../../src/lib/constitution-slice.js';

/** REQ-LIB-093 — the station slice engine. */

// Hand-authored fixture; every expected slice below is spelled out literally so a
// block-boundary defect cannot move the expectation together with the output.
// Line 13 (`--- not a break`), the table row and the fenced `---` must all stay
// inside Plan Rule's block; only the whole-line `---` at 10, 27 and 35 closes one.
const DOC = `# Project Constitution

> Preamble prose.

## Principles

### [MUST] All Rule

**Verify**: stations: all; check: a-check; covers: everything

---
### [MUST] Plan Rule

--- not a break

| Col | Col |
|---|---|
| x | y |

\`\`\`text
---
\`\`\`

#### Sub heading of plan rule

**Verify**: stations: plan

---
### [SHOULD] Review Rule

**Verify**: stations: review, verify
### [MAY] Undeclared Rule

Prose only.

---

<!-- trailing comment inside Principles -->

## Constraints

- keep me
`;

/** DOC without Review Rule's block (its heading through the line before Undeclared Rule). */
const PLAN_SLICE = `# Project Constitution

> Preamble prose.

## Principles

### [MUST] All Rule

**Verify**: stations: all; check: a-check; covers: everything

---
### [MUST] Plan Rule

--- not a break

| Col | Col |
|---|---|
| x | y |

\`\`\`text
---
\`\`\`

#### Sub heading of plan rule

**Verify**: stations: plan

---
### [MAY] Undeclared Rule

Prose only.

---

<!-- trailing comment inside Principles -->

## Constraints

- keep me
`;

/** DOC without Plan Rule's block: its heading through the blank line before the
 *  whole-line `---` that closes it — that `---` itself is a non-rule line and stays. */
const REVIEW_SLICE = `# Project Constitution

> Preamble prose.

## Principles

### [MUST] All Rule

**Verify**: stations: all; check: a-check; covers: everything

---
---
### [SHOULD] Review Rule

**Verify**: stations: review, verify
### [MAY] Undeclared Rule

Prose only.

---

<!-- trailing comment inside Principles -->

## Constraints

- keep me
`;

const lines = (text: string): string[] => text.split('\n');

describe('sliceConstitution', () => {
  it('keeps every non-Principles line, the all / station / undeclared rules, and drops only rules naming other stations', () => {
    const r = sliceConstitution(DOC, { station: 'plan' });
    expect(r.kind).toBe('sliced');
    if (r.kind !== 'sliced') return;
    expect(r.text).toBe(PLAN_SLICE);
    expect(r.matched).toEqual([
      { name: 'All Rule', check_id: 'a-check', coverage: 'everything' },
      { name: 'Plan Rule', check_id: null, coverage: null },
    ]);
    expect(r.undeclared).toEqual(['Undeclared Rule']);
    expect(r.excluded).toEqual(['Review Rule']);
  });

  it('never rewrites a line: every output line appears in the input, in order', () => {
    const input = lines(DOC);
    for (const station of ['story', 'plan', 'tasks', 'review', 'verify']) {
      const out = lines(sliceConstitution(DOC, { station }).text);
      let cursor = 0;
      for (const line of out) {
        const at = input.indexOf(line, cursor);
        expect(at, `${station}: ${line}`).toBeGreaterThanOrEqual(0);
        cursor = at + 1;
      }
    }
  });

  it('closes a rule block only on a whole-line ---: a `--- not a break` line, a table row and a fenced --- stay inside it', () => {
    const r = sliceConstitution(DOC, { station: 'review' });
    expect(r.kind).toBe('sliced');
    expect(r.text).toBe(REVIEW_SLICE);
    // the excluded block's interior is gone as a whole …
    expect(r.text).not.toContain('--- not a break');
    expect(r.text).not.toContain('|---|');
    expect(r.text).not.toContain('#### Sub heading of plan rule');
    expect(r.text).not.toContain('**Verify**: stations: plan');
    // … while the whole-line --- that closed it is a non-rule line and survives
    expect(lines(r.text).filter((l) => l === '---')).toHaveLength(3);
  });

  it('keeps a #### heading with the rule above it', () => {
    expect(sliceConstitution(DOC, { station: 'plan' }).text).toContain('#### Sub heading of plan rule');
  });

  it('keeps every undeclared rule in every station slice when the Constitution is only partly declared', () => {
    const partial = `## Principles

### [MUST] Language Policy

**Verify**: stations: all; prose

---
### [MUST] Seeded A

**Verify**: prose

---
### [SHOULD] Seeded B

Prose.
`;
    for (const station of ['story', 'plan', 'tasks', 'review']) {
      const r = sliceConstitution(partial, { station });
      expect(r.kind, station).toBe('sliced');
      if (r.kind !== 'sliced') continue;
      expect(r.text).toBe(partial);
      expect(r.undeclared).toEqual(['Seeded A', 'Seeded B']);
      expect(r.excluded).toEqual([]);
    }
  });

  it('reads a list containing all as every station', () => {
    const mixed = `## Principles

### [MUST] Mixed

**Verify**: stations: all, plan

---
### [MUST] Verify only

**Verify**: stations: verify
`;
    const r = sliceConstitution(mixed, { station: 'review' });
    expect(r.kind).toBe('sliced');
    if (r.kind !== 'sliced') return;
    expect(r.matched.map((m) => m.name)).toEqual(['Mixed']);
    expect(r.excluded).toEqual(['Verify only']);
  });

  it('reads an empty stations list as undeclared: kept in every slice, and alone it is no declaration at all', () => {
    const empty = '## Principles\n\n### [MUST] A\n\n**Verify**: stations: ; check: x\n\n### [MUST] B\n\n**Verify**: stations: verify\n';
    const r = sliceConstitution(empty, { station: 'plan' });
    expect(r.kind).toBe('sliced');
    if (r.kind !== 'sliced') return;
    expect(r.undeclared).toEqual(['A']);
    expect(r.excluded).toEqual(['B']);
    const alone = '## Principles\n\n### [MUST] A\n\n**Verify**: stations: ; check: x\n';
    expect(sliceConstitution(alone, { station: 'plan' })).toEqual({ kind: 'full', reason: 'no-declarations', text: alone });
  });

  it('honours a declaration written with a skill name: `stations: new-story` slices for the story station', () => {
    const doc = '## Principles\n\n### [MUST] A\n\n**Verify**: stations: new-story; x\n\n### [MUST] B\n\n**Verify**: stations: all; y\n';
    const story = sliceConstitution(doc, { station: normalizeStationName('new-story')! });
    expect(story.kind).toBe('sliced');
    if (story.kind !== 'sliced') return;
    expect(story.matched.map((m) => m.name)).toEqual(['A', 'B']);
    expect(story.excluded).toEqual([]);
    const plan = sliceConstitution(doc, { station: 'plan' });
    if (plan.kind !== 'sliced') throw new Error('expected a slice');
    expect(plan.excluded).toEqual(['A']);
  });

  it('treats a **Verify**: line after the --- that closed a rule as a non-rule line: it declares nothing and is always kept', () => {
    const doc = '## Principles\n### [MUST] A\ntext\n---\n**Verify**: stations: review\n### [MUST] B\n**Verify**: stations: plan\n';
    const plan = sliceConstitution(doc, { station: 'plan' });
    expect(plan.kind).toBe('sliced');
    if (plan.kind !== 'sliced') return;
    expect(plan.text).toBe(doc);
    expect(plan.undeclared).toEqual(['A']);
    expect(plan.matched.map((m) => m.name)).toEqual(['B']);
    const review = sliceConstitution(doc, { station: 'review' });
    if (review.kind !== 'sliced') throw new Error('expected a slice');
    // B's block runs to the section end, which is the file end here — the trailing
    // empty split line is part of that block, so no final newline survives
    expect(review.text).toBe('## Principles\n### [MUST] A\ntext\n---\n**Verify**: stations: review');
    expect(review.excluded).toEqual(['B']);
  });

  it('fails open to the input bytes when there is no ## Principles section', () => {
    const doc = '# Doc\n\n## Constraints\n\n### [MUST] x\n\n**Verify**: stations: plan\n';
    expect(sliceConstitution(doc, { station: 'plan' })).toEqual({ kind: 'full', reason: 'no-principles', text: doc });
  });

  it('fails open to the input bytes when no rule declares stations', () => {
    const doc = '## Principles\n\n### [MUST] A\n\n**Verify**: check: x-check\n\n### [SHOULD] B\n';
    expect(sliceConstitution(doc, { station: 'plan' })).toEqual({ kind: 'full', reason: 'no-declarations', text: doc });
  });

  it('fails open to the input bytes when every rule is declared and none names the station or all', () => {
    const doc = '## Principles\n\n### [MUST] A\n\n**Verify**: stations: verify\n\n### [SHOULD] B\n\n**Verify**: stations: review\n';
    const r = sliceConstitution(doc, { station: 'plan' });
    expect(r).toEqual({ kind: 'full', reason: 'no-match', text: doc });
    expect(r.text.length).toBeGreaterThan(0);
  });

  it('keeps a CRLF file line-for-line (the carriage returns travel with their lines)', () => {
    const r = sliceConstitution(DOC.replace(/\n/g, '\r\n'), { station: 'plan' });
    expect(r.kind).toBe('sliced');
    expect(r.text).toBe(PLAN_SLICE.replace(/\n/g, '\r\n'));
  });
});

describe('station declaration predicates', () => {
  it('isUndeclaredStations: null, undefined and an empty list are undeclared; all and a named list are not', () => {
    expect(isUndeclaredStations(null)).toBe(true);
    expect(isUndeclaredStations(undefined)).toBe(true);
    expect(isUndeclaredStations([])).toBe(true);
    expect(isUndeclaredStations('all')).toBe(false);
    expect(isUndeclaredStations(['plan'])).toBe(false);
  });

  it('declaresEveryStation: all, or a list containing all', () => {
    expect(declaresEveryStation('all')).toBe(true);
    expect(declaresEveryStation(['all'])).toBe(true);
    expect(declaresEveryStation(['verify', 'all'])).toBe(true);
    expect(declaresEveryStation(['plan'])).toBe(false);
    expect(declaresEveryStation([])).toBe(false);
    expect(declaresEveryStation(null)).toBe(false);
    expect(declaresEveryStation(undefined)).toBe(false);
  });
});

describe('ruleAppliesToStation', () => {
  it('keeps all, a list naming the station or all, an undeclared rule and an empty list; drops a list naming others', () => {
    expect(ruleAppliesToStation('all', 'plan')).toBe(true);
    expect(ruleAppliesToStation(['plan', 'review'], 'plan')).toBe(true);
    expect(ruleAppliesToStation(['all', 'verify'], 'plan')).toBe(true);
    expect(ruleAppliesToStation(null, 'plan')).toBe(true);
    expect(ruleAppliesToStation(undefined, 'plan')).toBe(true);
    expect(ruleAppliesToStation([], 'plan')).toBe(true);
    expect(ruleAppliesToStation(['review', 'verify'], 'plan')).toBe(false);
  });
});

describe('normalizeStationName (re-exported from types/status for the service)', () => {
  it('resolves a skill name to its SDD_STATIONS member and refuses a name outside the vocabulary', () => {
    expect(normalizeStationName('prospec-new-story')).toBe('story');
    expect(normalizeStationName('learn')).toBeNull();
  });
});

describe('sliceConstitutionRule', () => {
  it('returns the named rule block verbatim with its declarations', () => {
    const r = sliceConstitutionRule(DOC, 'All Rule');
    expect(r.kind).toBe('rule');
    if (r.kind !== 'rule') return;
    expect(r.text).toBe(['### [MUST] All Rule', '', '**Verify**: stations: all; check: a-check; covers: everything', ''].join('\n'));
    expect(r.rules).toEqual([{ name: 'All Rule', check_id: 'a-check', coverage: 'everything' }]);
  });

  it('returns the whole block up to the closing --- even when the body has a `--- not a break` line, a table row and a fenced ---', () => {
    const r = sliceConstitutionRule(DOC, 'Plan Rule');
    expect(r.kind).toBe('rule');
    if (r.kind !== 'rule') return;
    expect(r.text).toBe(
      [
        '### [MUST] Plan Rule',
        '',
        '--- not a break',
        '',
        '| Col | Col |',
        '|---|---|',
        '| x | y |',
        '',
        '```text',
        '---',
        '```',
        '',
        '#### Sub heading of plan rule',
        '',
        '**Verify**: stations: plan',
        '',
      ].join('\n'),
    );
  });

  it('returns every rule sharing the exact name, so a duplicate is disclosed', () => {
    const dup = '## Principles\n\n### [MUST] Same\n\nfirst\n\n---\n### [SHOULD] Same\n\nsecond\n';
    const r = sliceConstitutionRule(dup, 'Same');
    expect(r.kind).toBe('rule');
    if (r.kind !== 'rule') return;
    expect(r.rules).toHaveLength(2);
    expect(r.text).toContain('first');
    expect(r.text).toContain('second');
  });

  it('lists the available rule names on a miss', () => {
    expect(sliceConstitutionRule(DOC, 'all rule')).toEqual({
      kind: 'miss',
      available: ['All Rule', 'Plan Rule', 'Review Rule', 'Undeclared Rule'],
    });
  });
});
