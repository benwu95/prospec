import { describe, it, expect } from 'vitest';
import {
  MCP_RESOURCE_URIS,
  MCP_TOOL_NAMES,
  SEARCH_MATCH_FIELDS,
  SearchModuleMatchSchema,
  SearchModulesInputSchema,
  SearchModulesResultSchema,
  GetDependencyDirectionInputSchema,
  DependencyDirectionResultSchema,
} from '../../../src/types/mcp.js';

describe('MCP resource URI constants', () => {
  it('exposes the six frozen resource URIs', () => {
    expect(Object.values(MCP_RESOURCE_URIS).sort()).toEqual(
      [
        'knowledge://health',
        'knowledge://index',
        'knowledge://module-map',
        'knowledge://module/{name}',
        'knowledge://playbook',
        'spec://feature/{name}',
      ].sort(),
    );
  });

  it('exposes exactly the two read-only tool names', () => {
    expect([...MCP_TOOL_NAMES]).toEqual(['search_modules', 'get_dependency_direction']);
  });
});

describe('SearchModulesInputSchema', () => {
  it('accepts a non-empty query', () => {
    expect(SearchModulesInputSchema.safeParse({ query: 'drift checker' }).success).toBe(true);
  });

  it('rejects an empty or missing query', () => {
    expect(SearchModulesInputSchema.safeParse({ query: '' }).success).toBe(false);
    expect(SearchModulesInputSchema.safeParse({}).success).toBe(false);
  });
});

describe('SearchModulesResultSchema', () => {
  it('accepts matches with a known matched_field and optional suggestion', () => {
    expect(
      SearchModulesResultSchema.safeParse({
        matches: [{ module: 'lib', matched_field: 'keywords', description: 'utilities' }],
      }).success,
    ).toBe(true);
    expect(
      SearchModulesResultSchema.safeParse({ matches: [], suggestion: 'read knowledge://index' })
        .success,
    ).toBe(true);
  });

  it('rejects an unknown matched_field', () => {
    expect(
      SearchModulesResultSchema.safeParse({
        matches: [{ module: 'lib', matched_field: 'description', description: 'x' }],
      }).success,
    ).toBe(false);
  });

  it('defaults category to [] when omitted, and accepts an ordered list (REQ-TYPES-029)', () => {
    const parsed = SearchModulesResultSchema.safeParse({
      matches: [{ module: 'lib', matched_field: 'keywords', description: 'utilities' }],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.matches[0]?.category).toEqual([]);
    const withCat = SearchModulesResultSchema.safeParse({
      matches: [{ module: 'quiz', matched_field: 'name', description: '', category: ['Quiz', 'Grading'] }],
    });
    expect(withCat.success && withCat.data.matches[0]?.category).toEqual(['Quiz', 'Grading']);
  });
});

describe('search_modules frozen contract (REQ-TYPES-029 AC2)', () => {
  it('keeps SEARCH_MATCH_FIELDS exactly [name, keywords, aliases]', () => {
    expect([...SEARCH_MATCH_FIELDS]).toEqual(['name', 'keywords', 'aliases']);
  });

  it('keeps the frozen match fields and adds only category', () => {
    expect(Object.keys(SearchModuleMatchSchema.shape).sort()).toEqual([
      'category',
      'description',
      'matched_field',
      'module',
    ]);
  });
});

describe('GetDependencyDirectionInputSchema', () => {
  it('requires both from and to', () => {
    expect(GetDependencyDirectionInputSchema.safeParse({ from: 'cli', to: 'types' }).success).toBe(
      true,
    );
    expect(GetDependencyDirectionInputSchema.safeParse({ from: 'cli' }).success).toBe(false);
    expect(GetDependencyDirectionInputSchema.safeParse({ from: '', to: 'types' }).success).toBe(
      false,
    );
  });
});

describe('DependencyDirectionResultSchema', () => {
  it('accepts the frozen result shape', () => {
    expect(
      DependencyDirectionResultSchema.safeParse({
        allowed: true,
        direction: 'cli → types',
        source: 'module-map',
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown source', () => {
    expect(
      DependencyDirectionResultSchema.safeParse({
        allowed: false,
        direction: 'a → b',
        source: 'guesswork',
      }).success,
    ).toBe(false);
  });
});
