import { describe, it, expect } from 'vitest';
import {
  parseStationTokens,
  locateConstitutionRules,
  parseConstitutionRules,
  parseVerifyDeclarations,
} from '../../../src/lib/constitution-parser.js';

describe('shared station tokens', () => {
  it('uses the status vocabulary while preserving unknown tokens and mixed all', () => {
    expect(parseStationTokens(' Plan, prospec-new-story BOGUS ')).toEqual(['plan', 'story', 'bogus']);
    expect(parseStationTokens('ALL')).toBe('all');
    expect(parseStationTokens('all, plan')).toEqual(['all', 'plan']);
    expect(parseStationTokens('  ')).toEqual([]);
  });
});

/** REQ-LIB-032 — the machine half of verify's Constitution audit. */

const TAGGED = `# Project Constitution

> Preamble prose mentioning [MUST] inline, which is not a heading.

## Principles

### [MUST] Language Policy

**Description**: Artifacts in one language.

**Verify**: Files under x are in y.

---
### [SHOULD] One-way Dependency Direction

**Description**: Modules import downward only.

**Verify**: Lower layers do not import higher layers.

---
### [MAY] Optional Nicety

**Description**: Nice to have.

## Constraints

### [MUST] Not a principle — outside the section
`;

describe('parseConstitutionRules', () => {
  it('returns one entry per principle heading, with severity and Verify hint', () => {
    const rules = parseConstitutionRules(TAGGED);
    expect(rules.map((r) => [r.name, r.severity, r.has_verify_hint])).toEqual([
      ['Language Policy', 'MUST', true],
      ['One-way Dependency Direction', 'SHOULD', true],
      ['Optional Nicety', 'MAY', false],
    ]);
  });

  it('stops at the next level-2 heading — headings under ## Constraints are not principles', () => {
    const rules = parseConstitutionRules(TAGGED);
    expect(rules.some((r) => r.name.includes('outside the section'))).toBe(false);
  });

  it('anchors each rule at its own 1-based heading line', () => {
    const rules = parseConstitutionRules(TAGGED);
    const lines = TAGGED.split('\n');
    for (const rule of rules) {
      expect(lines[rule.line - 1]).toContain(rule.name);
    }
  });

  it('reports an untagged principle with severity null, keeping it in the inventory', () => {
    const rules = parseConstitutionRules(`## Principles

### Free-text rule

Some prose with no severity tag.
`);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ name: 'Free-text rule', severity: null, has_verify_hint: false });
  });

  it('never guesses a severity from an unknown tag', () => {
    const rules = parseConstitutionRules(`## Principles

### [CRITICAL] Made-up tag
`);
    expect(rules[0]).toMatchObject({ name: '[CRITICAL] Made-up tag', severity: null });
  });

  it('ignores headings inside fenced code blocks (illustrative examples declare nothing)', () => {
    const rules = parseConstitutionRules(`## Principles

### [MUST] Real rule

\`\`\`markdown
### [MUST] Example rule in a fence
**Verify**: not a real hint
\`\`\`

### [SHOULD] Second real rule
`);
    expect(rules.map((r) => r.name)).toEqual(['Real rule', 'Second real rule']);
    // the fenced `**Verify**:` must not attach to the rule that precedes the fence
    expect(rules[0]?.has_verify_hint).toBe(false);
  });

  it('honours CommonMark fence-close rules (a 4-backtick fence wrapping a 3-backtick example)', () => {
    const rules = parseConstitutionRules(`## Principles

\`\`\`\`markdown
### [MUST] Outer example
\`\`\`
### [MUST] Still inside the outer fence
\`\`\`
\`\`\`\`

### [MUST] Only real rule
`);
    expect(rules.map((r) => r.name)).toEqual(['Only real rule']);
  });

  it('returns an empty inventory when there is no ## Principles section', () => {
    expect(parseConstitutionRules('# Doc\n\n## Constraints\n\n### [MUST] x\n')).toEqual([]);
  });

  it('attributes a Verify hint to the rule it follows, not to a later one', () => {
    const rules = parseConstitutionRules(`## Principles

### [MUST] Has hint

**Verify**: something checkable.

### [MUST] Has no hint

Prose only.
`);
    expect(rules.map((r) => r.has_verify_hint)).toEqual([true, false]);
  });

  it('ignores a Verify hint appearing before the first rule heading', () => {
    const rules = parseConstitutionRules(`## Principles

**Verify**: orphan hint belonging to no rule.

### [MUST] First rule
`);
    expect(rules[0]?.has_verify_hint).toBe(false);
  });

  it('parses this repo-shaped Constitution deterministically (same input, same output)', () => {
    expect(parseConstitutionRules(TAGGED)).toEqual(parseConstitutionRules(TAGGED));
  });

  describe('check_id and coverage extraction (REQ-LIB-032)', () => {
    it('extracts check_id and coverage when covers clause is present', () => {
      const doc = `## Principles

### [MUST] Language Policy

**Verify**: check: language-policy-drift; covers: change-artifact and trust-zone language compliance. Further prose here.
`;
      const rules = parseConstitutionRules(doc);
      expect(rules).toHaveLength(1);
      expect(rules[0]?.check_id).toBe('language-policy-drift');
      expect(rules[0]?.coverage).toBe('change-artifact and trust-zone language compliance');
      expect(rules[0]?.has_verify_hint).toBe(true);
    });

    it('extracts check_id without coverage when covers clause is absent', () => {
      const doc = `## Principles

### [MUST] One-way Dependency Direction

**Verify**: check: import-direction. Lower layers do not import higher layers.
`;
      const rules = parseConstitutionRules(doc);
      expect(rules).toHaveLength(1);
      expect(rules[0]?.check_id).toBe('import-direction');
      expect(rules[0]?.coverage).toBeUndefined();
      expect(rules[0]?.has_verify_hint).toBe(true);
    });

    it('omits check_id and coverage when Verify has no check: declaration', () => {
      const doc = `## Principles

### [MUST] Freeform Verify Rule

**Verify**: Manual check only by the reviewer.
`;
      const rules = parseConstitutionRules(doc);
      expect(rules).toHaveLength(1);
      expect(rules[0]?.check_id).toBeUndefined();
      expect(rules[0]?.coverage).toBeUndefined();
      expect(rules[0]?.has_verify_hint).toBe(true);
    });

    it('does not attach check_id or coverage from a hint preceding the first rule', () => {
      const doc = `## Principles

**Verify**: check: import-direction; covers: entire repo.

### [MUST] Real First Rule

**Verify**: Manual check.
`;
      const rules = parseConstitutionRules(doc);
      expect(rules).toHaveLength(1);
      expect(rules[0]?.name).toBe('Real First Rule');
      expect(rules[0]?.check_id).toBeUndefined();
      expect(rules[0]?.coverage).toBeUndefined();
      expect(rules[0]?.has_verify_hint).toBe(true);
    });
  });
});

describe('stations declaration (REQ-LIB-032)', () => {
  const ruleWith = (verify: string) => `## Principles

### [MUST] Declared

**Verify**: ${verify}
`;

  it('reads stations before, between and after the check/covers grammar without losing either', () => {
    for (const verify of [
      'stations: plan, review; check: import-direction; covers: layer hierarchy. Prose.',
      'check: import-direction; stations: plan, review; covers: layer hierarchy. Prose.',
      'check: import-direction; covers: layer hierarchy; stations: plan, review. Prose.',
    ]) {
      const [rule] = parseConstitutionRules(ruleWith(verify));
      expect(rule, verify).toMatchObject({
        stations: ['plan', 'review'],
        check_id: 'import-direction',
        coverage: 'layer hierarchy',
      });
    }
  });

  it('collapses exactly `all` to the literal and keeps a mixed list as an array', () => {
    expect(parseConstitutionRules(ruleWith('stations: all; Prose.'))[0]?.stations).toBe('all');
    expect(parseConstitutionRules(ruleWith('stations: ALL'))[0]?.stations).toBe('all');
    expect(parseConstitutionRules(ruleWith('stations: all, plan'))[0]?.stations).toEqual(['all', 'plan']);
  });

  it('keeps every token when commas are missing or names are capitalised', () => {
    expect(parseConstitutionRules(ruleWith('stations: plan review'))[0]?.stations).toEqual(['plan', 'review']);
    expect(parseConstitutionRules(ruleWith('stations: Plan,Tasks'))[0]?.stations).toEqual(['plan', 'tasks']);
  });

  it('resolves each token as the CLI resolves --station (skill name, prospec- prefix), leaving an unknown token as written', () => {
    expect(parseConstitutionRules(ruleWith('stations: new-story, knowledge-update.'))[0]?.stations).toEqual([
      'story',
      'knowledge-update',
    ]);
    expect(parseConstitutionRules(ruleWith('stations: prospec-plan, Bogus'))[0]?.stations).toEqual(['plan', 'bogus']);
  });

  it('reads the label in any case: `Stations: plan` declares plan', () => {
    expect(parseConstitutionRules(ruleWith('Stations: plan'))[0]?.stations).toEqual(['plan']);
    expect(parseConstitutionRules(ruleWith('STATIONS: all'))[0]?.stations).toBe('all');
  });

  it('ends the stations clause before a check: or covers: keyword, so a comma-separated line keeps its check binding', () => {
    expect(parseVerifyDeclarations('stations: plan, check: import-direction; covers: layering')).toEqual({
      stations: ['plan'],
      check_id: 'import-direction',
      coverage: 'layering',
    });
    expect(parseVerifyDeclarations('stations: plan review check: import-direction')).toEqual({
      stations: ['plan', 'review'],
      check_id: 'import-direction',
    });
  });

  it('reads an undeclared rule as null, never as an empty station list', () => {
    const [rule] = parseConstitutionRules(ruleWith('check: test-provenance; covers: suite'));
    expect(rule?.stations).toBeNull();
    const [noHint] = parseConstitutionRules('## Principles\n\n### [MUST] No hint\n\nProse.\n');
    expect(noHint?.stations).toBeNull();
  });

  it('does not let a covers: clause that follows swallow the declaration, nor a stations: clause swallow covers', () => {
    const decl = parseVerifyDeclarations('check: x-check; covers: a b c; stations: verify');
    expect(decl).toEqual({ check_id: 'x-check', coverage: 'a b c', stations: ['verify'] });
    const word = parseVerifyDeclarations('Workstations: are not a declaration; check: y');
    expect(word.stations).toBeNull();
    expect(word.check_id).toBe('y');
  });

  it('parses a CRLF declaration exactly as its LF form', () => {
    const doc = ruleWith('stations: plan, review');
    expect(parseConstitutionRules(doc.replace(/\n/g, '\r\n'))).toEqual(parseConstitutionRules(doc));
    expect(parseConstitutionRules(doc)[0]?.stations).toEqual(['plan', 'review']);
  });

  it('attaches a Verify hint only while the rule block is open — after the --- that closed it the hint belongs to no rule', () => {
    const doc = '## Principles\n\n### [MUST] A\n\n---\n\n**Verify**: stations: review\n\n### [MUST] B\n\n**Verify**: stations: plan\n';
    const [a, b] = parseConstitutionRules(doc);
    expect(a).toMatchObject({ name: 'A', has_verify_hint: false, stations: null });
    expect(b).toMatchObject({ name: 'B', has_verify_hint: true, stations: ['plan'] });
  });
});

// Literal block extents: the slice engine masks lines by these numbers, so the
// boundary rules are pinned here as data rather than re-derived from the parser.
describe('locateConstitutionRules block extents', () => {
  const DOC = [
    /* 0 */ '# C',
    /* 1 */ '',
    /* 2 */ '## Principles',
    /* 3 */ '',
    /* 4 */ '### [MUST] A',
    /* 5 */ '',
    /* 6 */ '**Verify**: stations: all',
    /* 7 */ '',
    /* 8 */ '---',
    /* 9 */ '### [MUST] B',
    /* 10 */ '--- not a break',
    /* 11 */ '|---|---|',
    /* 12 */ '```text',
    /* 13 */ '---',
    /* 14 */ '```',
    /* 15 */ '**Verify**: stations: plan',
    /* 16 */ '',
    /* 17 */ '---',
    /* 18 */ '',
    /* 19 */ 'trailing prose',
    /* 20 */ '### [MAY] C',
    /* 21 */ 'body',
    /* 22 */ '## Constraints',
    /* 23 */ '### not a principle',
  ].join('\n');

  it('runs each block from its heading to the whole-line --- (exclusive), the next ###, or the section end', () => {
    const layout = locateConstitutionRules(DOC);
    expect(layout.principles).toEqual({ start: 2, end: 22 });
    expect(layout.rules.map((r) => [r.entry.name, r.start, r.end])).toEqual([
      ['A', 4, 8],
      ['B', 9, 17],
      ['C', 20, 22],
    ]);
    // the `--- not a break`, table-row and fenced `---` lines did not close B: its
    // Verify line after them still attached
    expect(layout.rules[1]?.entry.stations).toEqual(['plan']);
  });
});

// The line-ending family (issue #140). Every pattern here is `$`-anchored on a
// `split('\n')` line, and they survive CRLF only because each ends in `\s*` (which
// matches `\r`) — the severity tag is read from `RULE_HEADING`'s capture, already
// `\r`-free by the time `SEVERITY_TAGGED` sees it. That chain is what this pins:
// tighten either pattern to `[ \t]*$` and a Windows checkout silently parses zero
// rules, which verify's Constitution audit would read as "no rules to grade".
describe('parseConstitutionRules line endings', () => {
  it('parses a CRLF Constitution exactly as its LF form', () => {
    const lf = parseConstitutionRules(TAGGED);
    const crlf = parseConstitutionRules(TAGGED.replace(/\n/g, '\r\n'));
    expect(crlf).toEqual(lf);
    // Anti-vacuity: equality is worthless if neither side parsed a rule, and the
    // severity must survive — that is the field the audit grades by.
    expect(lf.length).toBeGreaterThan(0);
    expect(lf.map((r) => r.severity)).toContain('MUST');
  });
});
