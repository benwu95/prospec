import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_KNOWLEDGE_TOKEN_BUDGET,
  ProspecConfigSchema,
} from '../../../src/types/config.js';

describe('DEFAULT_KNOWLEDGE_TOKEN_BUDGET', () => {
  it('is the single source for the knowledge-size thresholds', () => {
    expect(DEFAULT_KNOWLEDGE_TOKEN_BUDGET).toEqual({
      l1_per_file: 1500,
      l2_per_module: 400,
      readme_max_lines: 100,
    });
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
  // The knowledge-size check enforces DEFAULT_KNOWLEDGE_TOKEN_BUDGET; index.md's
  // progressive-loading table must declare the same numbers, or the honest-boundary
  // contract has drifted. This reads the repo's own index.md (vitest cwd = repo root).
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
});
