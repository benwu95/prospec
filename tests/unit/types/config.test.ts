import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_KNOWLEDGE_TOKEN_BUDGET,
  KNOWLEDGE_SIZE_KINDS,
  KNOWLEDGE_SIZE_RULES,
  ProspecConfigSchema,
  type KnowledgeSizeRule,
} from '../../../src/types/config.js';

describe('DEFAULT_KNOWLEDGE_TOKEN_BUDGET', () => {
  it('is the single source for the knowledge-size thresholds', () => {
    expect(DEFAULT_KNOWLEDGE_TOKEN_BUDGET).toEqual({
      l1_per_file: 1800,
      l2_per_module: 1000,
      readme_max_lines: 100,
      spec_per_file: 5000,
      demand_knowledge_per_file: 10000,
      skill_per_file: 5000,
      reference_per_file: 2500,
      headroom: 0.85,
    });
  });

  // A LITERAL table, not one derived from the rules under test. Asserting only
  // that `rule.tokenKey` is *some* budget key is a tautology: it survives binding
  // a kind to the wrong budget, which is the single thing this registry exists to
  // get right. The same trap applies to `label`, which names the surface a WARN
  // reports. Adding a kind without extending this table fails the count assertion.
  it('binds each kind to its OWN budget field and label', () => {
    const expected: Record<string, { tokenKey: string; lineKey?: string; label: string }> = {
      l1: { tokenKey: 'l1_per_file', label: 'L1 file' },
      l2: { tokenKey: 'l2_per_module', lineKey: 'readme_max_lines', label: 'L2 file' },
      spec: { tokenKey: 'spec_per_file', label: 'Feature Spec' },
      'demand-knowledge': {
        tokenKey: 'demand_knowledge_per_file',
        label: 'load-on-demand knowledge file',
      },
      skill: { tokenKey: 'skill_per_file', label: 'skill instruction file' },
      reference: { tokenKey: 'reference_per_file', label: 'skill reference' },
    };
    expect(Object.keys(expected).sort()).toEqual([...KNOWLEDGE_SIZE_KINDS].sort());
    for (const kind of KNOWLEDGE_SIZE_KINDS) {
      const rule: KnowledgeSizeRule = KNOWLEDGE_SIZE_RULES[kind];
      expect(rule.tokenKey, `${kind}.tokenKey`).toBe(expected[kind]!.tokenKey);
      expect(rule.lineKey, `${kind}.lineKey`).toBe(expected[kind]!.lineKey);
      expect(rule.label, `${kind}.label`).toBe(expected[kind]!.label);
      expect(rule.remedy.length, `${kind}.remedy`).toBeGreaterThan(0);
    }
  });

  it('grades every KnowledgeSizeKind against a field the budget actually declares', () => {
    const budgetKeys = new Set(Object.keys(DEFAULT_KNOWLEDGE_TOKEN_BUDGET));
    for (const kind of KNOWLEDGE_SIZE_KINDS) {
      const rule: KnowledgeSizeRule = KNOWLEDGE_SIZE_RULES[kind];
      expect(budgetKeys, `${kind}.tokenKey`).toContain(rule.tokenKey);
      if (rule.lineKey !== undefined) expect(budgetKeys, `${kind}.lineKey`).toContain(rule.lineKey);
    }
  });

  it('gives each kind a distinct remedy — a shared "please compress" is the unactionable WARN this check exists to avoid', () => {
    const remedies = KNOWLEDGE_SIZE_KINDS.map((k) => KNOWLEDGE_SIZE_RULES[k].remedy);
    expect(new Set(remedies).size).toBe(KNOWLEDGE_SIZE_KINDS.length);
  });

  it('points a load-on-demand knowledge file at prospec-learn\'s Staleness Sweep (issue #135)', () => {
    expect(KNOWLEDGE_SIZE_RULES['demand-knowledge'].remedy).toContain('prospec-learn');
    expect(KNOWLEDGE_SIZE_RULES['demand-knowledge'].remedy).toContain('Staleness Sweep');
  });

  it('grades lines only where a rule declares a lineKey (only L2 has a line cap)', () => {
    const withLines = KNOWLEDGE_SIZE_KINDS.filter((k) => 'lineKey' in KNOWLEDGE_SIZE_RULES[k]);
    expect(withLines).toEqual(['l2']);
  });
});

describe('TokenBudgetSchema (renamed fields)', () => {
  it('accepts the L1/L2-aligned field names', () => {
    const parsed = ProspecConfigSchema.parse({
      project: { name: 't' },
      knowledge: { token_budget: { l1_per_file: 2000, l2_per_module: 500, readme_max_lines: 120 } },
    });
    expect(parsed.knowledge?.token_budget).toEqual({
      l1_per_file: 2000,
      l2_per_module: 500,
      readme_max_lines: 120,
    });
  });

  it('strips the retired l0_max/l1_per_module names (they no longer bind)', () => {
    const parsed = ProspecConfigSchema.parse({
      project: { name: 't' },
      knowledge: { token_budget: { l0_max: 1500, l1_per_module: 400 } as Record<string, number> },
    });
    expect(parsed.knowledge?.token_budget).toEqual({});
  });
});

describe('single-source: index.md declares the DEFAULT budget numbers', () => {
  // index.md's progressive-loading table declares the SHIPPED DEFAULTS, which is what
  // this pins — a project may then override them per field in `.prospec.yaml` (this repo
  // does), and the table says so in the sentence below it. What must never drift is the
  // declared defaults vs DEFAULT_KNOWLEDGE_TOKEN_BUDGET. Reads the repo's own index.md.
  const index = readFileSync(path.resolve(process.cwd(), 'prospec', 'index.md'), 'utf-8');
  const rowOf = (layer: string): string =>
    index.split('\n').find((l) => l.includes(`**${layer}**`)) ?? '';
  const num = (s: string): number => Number(s.replace(/,/g, ''));

  it('L1 row declares l1_per_file tokens', () => {
    const m = /≤\s*([\d,]+)\s*tokens per file/.exec(rowOf('L1'));
    expect(m, 'L1 row must declare "≤ N tokens per file"').not.toBeNull();
    expect(num(m![1]!)).toBe(DEFAULT_KNOWLEDGE_TOKEN_BUDGET.l1_per_file);
  });

  it('L2 row declares l2_per_module tokens and readme_max_lines', () => {
    const row = rowOf('L2');
    const tokens = /≤\s*([\d,]+)\s*tokens per module/.exec(row);
    const lines = /≤\s*([\d,]+)\s*lines/.exec(row);
    expect(tokens, 'L2 row must declare "≤ N tokens per module"').not.toBeNull();
    expect(lines, 'L2 row must declare "≤ N lines"').not.toBeNull();
    expect(num(tokens![1]!)).toBe(DEFAULT_KNOWLEDGE_TOKEN_BUDGET.l2_per_module);
    expect(num(lines![1]!)).toBe(DEFAULT_KNOWLEDGE_TOKEN_BUDGET.readme_max_lines);
  });

  it('Spec row declares spec_per_file tokens', () => {
    const m = /≤\s*([\d,]+)\s*tokens per spec file/.exec(rowOf('Spec'));
    expect(m, 'Spec row must declare "≤ N tokens per spec file"').not.toBeNull();
    expect(num(m![1]!)).toBe(DEFAULT_KNOWLEDGE_TOKEN_BUDGET.spec_per_file);
  });

  it('Demand row declares demand_knowledge_per_file tokens', () => {
    const m = /≤\s*([\d,]+)\s*tokens per file/.exec(rowOf('Demand'));
    expect(m, 'Demand row must declare "≤ N tokens per file"').not.toBeNull();
    expect(num(m![1]!)).toBe(DEFAULT_KNOWLEDGE_TOKEN_BUDGET.demand_knowledge_per_file);
  });

  it('Skill row declares skill_per_file and reference_per_file tokens', () => {
    const row = rowOf('Skill');
    const skill = /≤\s*([\d,]+)\s*tokens per skill/.exec(row);
    const reference = /≤\s*([\d,]+)\s*tokens per reference/.exec(row);
    expect(skill, 'Skill row must declare "≤ N tokens per skill"').not.toBeNull();
    expect(reference, 'Skill row must declare "≤ N tokens per reference"').not.toBeNull();
    expect(num(skill![1]!)).toBe(DEFAULT_KNOWLEDGE_TOKEN_BUDGET.skill_per_file);
    expect(num(reference![1]!)).toBe(DEFAULT_KNOWLEDGE_TOKEN_BUDGET.reference_per_file);
  });

  // The four assertions above are hand-written per row, so a budget added to the
  // code with no row of its own would be pinned by nothing. This closes that gap.
  it('declares a row for EVERY budget field — a new threshold cannot ship undeclared', () => {
    const declared = new Set<string>();
    const rows: Array<[string, (keyof typeof DEFAULT_KNOWLEDGE_TOKEN_BUDGET)[]]> = [
      ['L1', ['l1_per_file']],
      ['L2', ['l2_per_module', 'readme_max_lines']],
      ['Spec', ['spec_per_file']],
      ['Demand', ['demand_knowledge_per_file']],
      ['Skill', ['skill_per_file', 'reference_per_file']],
    ];
    for (const [layer, fields] of rows) {
      const row = rowOf(layer);
      expect(row, `index.md must carry a **${layer}** row`).not.toBe('');
      for (const field of fields) {
        const value = DEFAULT_KNOWLEDGE_TOKEN_BUDGET[field];
        const formatted = value.toLocaleString('en-US');
        expect(
          row.includes(String(value)) || row.includes(formatted),
          `**${layer}** row must state ${field} = ${value}`,
        ).toBe(true);
        declared.add(field);
      }
    }
    expect([...declared].sort()).toEqual(
      Object.keys(DEFAULT_KNOWLEDGE_TOKEN_BUDGET)
        .filter((k) => k !== 'headroom')
        .sort(),
    );
  });
});

describe('executors vocabulary (REQ-TYPES-025)', () => {
  it('validates without the field and keeps every executor value a free string', () => {
    const parsed = ProspecConfigSchema.parse({ project: { name: 't' } });
    expect(parsed.executors).toBeUndefined();
  });

  it('accepts a non-empty list of non-empty labels', () => {
    const parsed = ProspecConfigSchema.parse({ project: { name: 't' }, executors: ['judge', 'drafter'] });
    expect(parsed.executors).toEqual(['judge', 'drafter']);
  });

  it('refuses an empty array (it would refuse every executor) and an empty label', () => {
    expect(ProspecConfigSchema.safeParse({ project: { name: 't' }, executors: [] }).success).toBe(false);
    expect(ProspecConfigSchema.safeParse({ project: { name: 't' }, executors: ['judge', ''] }).success).toBe(false);
    expect(ProspecConfigSchema.safeParse({ project: { name: 't' }, executors: 'judge' }).success).toBe(false);
  });
});
