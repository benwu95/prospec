import { describe, it, expect } from 'vitest';
import { parseConstitutionRules } from '../../../src/lib/constitution-parser.js';

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
