import { z } from 'zod';

/**
 * MCP server contract — resource URIs and tool I/O schemas (REQ-MCP-002/005)
 *
 * Tool input shapes are raw Zod shapes (not z.object) because the MCP SDK's
 * registerTool() takes a ZodRawShape; the wrapped objects below exist for
 * standalone validation and tests.
 */

export const MCP_SERVER_NAME = 'prospec';

export const MCP_RESOURCE_URIS = {
  index: 'knowledge://index',
  moduleMap: 'knowledge://module-map',
  playbook: 'knowledge://playbook',
  health: 'knowledge://health',
  moduleTemplate: 'knowledge://module/{name}',
  specTemplate: 'spec://feature/{name}',
} as const;

export const MCP_TOOL_NAMES = ['search_modules', 'get_dependency_direction'] as const;

// --- search_modules ---

export const SearchModulesInputShape = {
  query: z.string().min(1).describe('Search terms; `-`, `_` and whitespace are equivalent separators'),
};

export const SearchModulesInputSchema = z.object(SearchModulesInputShape);

export const SEARCH_MATCH_FIELDS = ['name', 'keywords', 'aliases'] as const;

export const SearchModuleMatchSchema = z.object({
  module: z.string().min(1),
  matched_field: z.enum(SEARCH_MATCH_FIELDS),
  description: z.string(),
});

export const SearchModulesResultSchema = z.object({
  matches: z.array(SearchModuleMatchSchema),
  /** Present only when matches is empty — points the caller at knowledge://index. */
  suggestion: z.string().optional(),
});

// --- get_dependency_direction ---

export const GetDependencyDirectionInputShape = {
  from: z.string().min(1).describe('Module that wants to import'),
  to: z.string().min(1).describe('Module being imported'),
};

export const GetDependencyDirectionInputSchema = z.object(GetDependencyDirectionInputShape);

export const DEPENDENCY_DIRECTION_SOURCES = ['module-map', 'constitution-fallback'] as const;

export const DependencyDirectionResultSchema = z.object({
  allowed: z.boolean(),
  direction: z.string().min(1),
  source: z.enum(DEPENDENCY_DIRECTION_SOURCES),
});

export type SearchModulesInput = z.infer<typeof SearchModulesInputSchema>;
export type SearchModuleMatch = z.infer<typeof SearchModuleMatchSchema>;
export type SearchModulesResult = z.infer<typeof SearchModulesResultSchema>;
export type SearchMatchField = (typeof SEARCH_MATCH_FIELDS)[number];
export type GetDependencyDirectionInput = z.infer<typeof GetDependencyDirectionInputSchema>;
export type DependencyDirectionResult = z.infer<typeof DependencyDirectionResultSchema>;
export type DependencyDirectionSource = (typeof DEPENDENCY_DIRECTION_SOURCES)[number];
