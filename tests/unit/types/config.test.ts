import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_KNOWLEDGE_TOKEN_BUDGET,
  KNOWLEDGE_SIZE_KINDS,
  KNOWLEDGE_SIZE_RULES,
  ProspecConfigSchema,
  SHIPPED_BUDGET_FIELDS,
  baseDirIssue,
  isNormalizedProjectPath,
  isShippedBudgetField,
  knowledgeBasePathIssue,
  type KnowledgeSizeRule,
} from '../../../src/types/config.js';
import { TestPolicySchema } from '../../../src/types/change.js';

describe('DEFAULT_KNOWLEDGE_TOKEN_BUDGET', () => {
  it('is the single source for the knowledge-size thresholds', () => {
    expect(DEFAULT_KNOWLEDGE_TOKEN_BUDGET).toEqual({
      l1_per_file: 1800,
      l2_per_module: 1000,
      readme_max_lines: 100,
      spec_per_file: 5000,
      demand_knowledge_per_file: 10000,
      skill_per_file: 12500,
      reference_per_file: 4000,
      headroom: 0.85,
    });
  });

  // The two shipped budgets describe the SKILL.md / reference files prospec itself
  // ships, so their only correct value is the one prospec authored them against.
  // Pinning the set by LITERAL: widening or shrinking it is a design decision.
  it('names exactly the two shipped budgets a project cannot override', () => {
    expect([...SHIPPED_BUDGET_FIELDS].sort()).toEqual(['reference_per_file', 'skill_per_file']);
    for (const key of SHIPPED_BUDGET_FIELDS) expect(isShippedBudgetField(key)).toBe(true);
    expect(isShippedBudgetField('l1_per_file')).toBe(false);
    expect(isShippedBudgetField('headroom')).toBe(false);
  });

  it('schema keys plus SHIPPED_BUDGET_FIELDS cover DEFAULT_KNOWLEDGE_TOKEN_BUDGET exactly', () => {
    const schemaKeys = Object.keys(
      (ProspecConfigSchema.shape.knowledge.unwrap().shape.token_budget.unwrap() as {
        shape: Record<string, unknown>;
      }).shape,
    );
    for (const shipped of SHIPPED_BUDGET_FIELDS) expect(schemaKeys).not.toContain(shipped);
    expect([...schemaKeys, ...SHIPPED_BUDGET_FIELDS].sort()).toEqual(
      Object.keys(DEFAULT_KNOWLEDGE_TOKEN_BUDGET).sort(),
    );
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

  it('carries no Skill row — the shipped budgets are not a project setting and have no table row', () => {
    expect(rowOf('Skill')).toBe('');
    expect(index).not.toMatch(/tokens per skill|tokens per reference/);
  });

  // The four assertions above are hand-written per row, so a budget added to the
  // code with no row of its own would be pinned by nothing. This closes that gap.
  it('declares a row for EVERY per-project budget field — a new threshold cannot ship undeclared', () => {
    const declared = new Set<string>();
    const rows: Array<[string, (keyof typeof DEFAULT_KNOWLEDGE_TOKEN_BUDGET)[]]> = [
      ['L1', ['l1_per_file']],
      ['L2', ['l2_per_module', 'readme_max_lines']],
      ['Spec', ['spec_per_file']],
      ['Demand', ['demand_knowledge_per_file']],
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
    // Every per-project threshold has a row; the shipped fields deliberately do not.
    expect([...declared].sort()).toEqual(
      Object.keys(DEFAULT_KNOWLEDGE_TOKEN_BUDGET)
        .filter((k) => k !== 'headroom' && !isShippedBudgetField(k))
        .sort(),
    );
  });
});


describe('test evidence policy configuration', () => {
  const config = { project: { name: 'example' } };

  it('keeps the policy absent by default and accepts explicit booleans', () => {
    expect(ProspecConfigSchema.parse(config)).not.toHaveProperty('test_evidence');
    for (const exclude_knowledge of [true, false]) {
      expect(ProspecConfigSchema.parse({ ...config, test_evidence: { exclude_knowledge } }).test_evidence)
        .toEqual({ exclude_knowledge });
    }
  });

  it.each(['true', 1, null, [], {}])('rejects nonboolean exclusion %j', (exclude_knowledge) => {
    expect(ProspecConfigSchema.safeParse({ ...config, test_evidence: { exclude_knowledge } }).success).toBe(false);
  });
});

describe('project-local artifact path rules', () => {
  const parse = (extra: Record<string, unknown>) =>
    ProspecConfigSchema.safeParse({ project: { name: 'p' }, ...extra });
  const issuePaths = (extra: Record<string, unknown>): string[] => {
    const result = parse(extra);
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
  };

  describe('isNormalizedProjectPath', () => {
    it.each(['prospec', 'prospec/ai-knowledge', 'a/b/c', '.hidden', 'my spec'])('accepts %j', (value) => {
      expect(isNormalizedProjectPath(value)).toBe(true);
    });
    it.each(['', '.', '..', './prospec', 'prospec/', 'prospec//kb', 'a/../b', '/abs', 'C:', 'C:foo', 'C:/x', 'a\\b', '\\\\server\\share', 'a\0b'])(
      'rejects %j', (value) => {
        expect(isNormalizedProjectPath(value)).toBe(false);
      });
  });

  describe('baseDirIssue', () => {
    it.each(['prospec', 'my-spec'])('accepts %j', (value) => {
      expect(baseDirIssue(value)).toBeNull();
    });
    it.each(['.', './', '', '..', '../outside', 'docs/prospec', 'prospec/', '/abs/prospec', 'C:\\x', 'C:/x', 'C:', '\\\\server\\share'])(
      'rejects %j with a fix hint', (value) => {
        expect(baseDirIssue(value)).toMatch(/single directory name/);
      });
  });

  describe('knowledgeBasePathIssue', () => {
    it('quotes both paths in the refusal', () => {
      expect(knowledgeBasePathIssue('docs/kb', 'prospec')).toContain('always "prospec/ai-knowledge", got "docs/kb"; move its Knowledge files into "prospec/ai-knowledge"');
    });
    it('accepts only the fixed Knowledge directory', () => {
      expect(knowledgeBasePathIssue('prospec/ai-knowledge', 'prospec')).toBeNull();
      expect(knowledgeBasePathIssue('docs/ai-knowledge', 'docs')).toBeNull();
    });
    it.each(['prospec/kb', 'ai-knowledge', 'docs/kb', './prospec/ai-knowledge', 'prospec/ai-knowledge/', 'Prospec/ai-knowledge', 'prospec/a/b', '/abs/prospec/ai-knowledge'])(
      'rejects %j and says to delete the field', (value) => {
        expect(knowledgeBasePathIssue(value, 'prospec')).toMatch(/no longer configurable.*prospec\/ai-knowledge.*delete the field/);
      });
  });

  it('accepts the defaults and the deprecated knowledge.base_path equal to the default', () => {
    expect(parse({}).success).toBe(true);
    expect(parse({ paths: { base_dir: 'my-spec' } }).success).toBe(true);
    expect(parse({ knowledge: { base_path: 'prospec/ai-knowledge' } }).success).toBe(true);
    expect(parse({ paths: { base_dir: 'my-spec' }, knowledge: { base_path: 'my-spec/ai-knowledge' } }).success).toBe(true);
  });

  it.each(['.', './', '', '..', '../outside', 'docs/prospec', 'prospec/', '/abs', 'C:\\x'])(
    'names paths.base_dir for %j', (base_dir) => {
      expect(issuePaths({ paths: { base_dir } })).toEqual(['paths.base_dir']);
    });

  it.each(['prospec/kb', 'ai-knowledge', 'docs/kb', 'prospec/../kb', '/abs/kb'])('names knowledge.base_path for %j', (base_path) => {
    expect(issuePaths({ knowledge: { base_path } })).toEqual(['knowledge.base_path']);
  });

  it('judges knowledge.base_path against the configured base_dir', () => {
    expect(issuePaths({ paths: { base_dir: 'docs' }, knowledge: { base_path: 'prospec/ai-knowledge' } })).toEqual(['knowledge.base_path']);
    expect(issuePaths({ paths: { base_dir: 'docs' }, knowledge: { base_path: 'docs/ai-knowledge' } })).toEqual([]);
    expect(issuePaths({ paths: { base_dir: 'docs' }, knowledge: { base_path: 'docs/kb' } })).toEqual(['knowledge.base_path']);
  });

  it('does not judge knowledge.base_path against an out-of-range base_dir', () => {
    expect(issuePaths({ paths: { base_dir: 'docs/prospec' }, knowledge: { base_path: 'docs/prospec/ai-knowledge' } })).toEqual(['paths.base_dir']);
  });

  it('reports path rule violations alongside unrelated schema errors', () => {
    const result = ProspecConfigSchema.safeParse({ project: {}, paths: { base_dir: '.' }, knowledge: { base_path: 'prospec/kb' } });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.')).sort()).toEqual(['paths.base_dir', 'project.name']);
    const knowledge = ProspecConfigSchema.safeParse({ project: {}, knowledge: { base_path: 'docs/kb' } });
    expect(knowledge.error?.issues.map((issue) => issue.path.join('.')).sort()).toEqual(['knowledge.base_path', 'project.name']);
  });

  it('does not judge knowledge.base_path when paths itself is malformed', () => {
    expect(issuePaths({ paths: 'docs', knowledge: { base_path: 'docs/kb' } })).toEqual(['paths']);
  });

  it('reports only the type error when a path is not a string', () => {
    expect(issuePaths({ paths: { base_dir: 1 } })).toEqual(['paths.base_dir']);
  });

  it('keeps the test-evidence exclusion path on the same predicate and message', () => {
    expect(TestPolicySchema.safeParse({ version: 1, excluded_path: 'prospec/ai-knowledge' }).success).toBe(true);
    const refused = TestPolicySchema.safeParse({ version: 1, excluded_path: 'C:/x' });
    expect(refused.success).toBe(false);
    expect(refused.error?.issues[0]?.message).toBe('must be a normalized project-relative directory');
  });

  it('keeps .shape reachable for the config-example contract', () => {
    expect(Object.keys(ProspecConfigSchema.shape)).toContain('paths');
  });
});
