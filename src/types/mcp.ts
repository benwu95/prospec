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
  // Append-only: clients consume a frozen URI set — never reorder/remove.
  featureMap: 'knowledge://feature-map',
  product: 'spec://product',
} as const;

// Append-only, like the URI set above: clients consume a frozen tool list.
export const MCP_TOOL_NAMES = [
  'search_modules',
  'get_dependency_direction',
  'get_spec_requirements',
] as const;

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
  // Additive (default []): ordered category list joined from module-map.yaml.
  // Never reorder or remove the frozen fields above — clients consume structuredContent.
  category: z.array(z.string()).default([]),
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

// --- get_spec_requirements ---

/**
 * The REQ-scoped feature-spec read (REQ-TYPES-079). It is a TOOL rather than a
 * query on `spec://feature/{name}`: the SDK's URI-template matcher compiles a
 * `{?req,story}` expansion into a MANDATORY `\?req=…` pattern, so adding one
 * would stop the plain whole-spec read from matching its own template.
 */
export const GetSpecRequirementsInputShape = {
  feature: z.string().min(1).describe('Feature slug — the spec filename without `.md`'),
  req: z
    .array(z.string().min(1))
    .optional()
    .describe('REQ ids to quote; an entry may be a comma-separated list'),
  story: z
    .array(z.string().min(1))
    .optional()
    .describe('Story ids (`US-1`) to quote whole; same comma tolerance'),
};

export const GetSpecRequirementsInputSchema = z.object(GetSpecRequirementsInputShape);

export const SpecSliceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['requirement', 'story']),
  /** Owning story heading — null for a story slice or a retired requirement. */
  story: z.string().nullable(),
  deprecated: z.boolean(),
  text: z.string(),
});

export const SpecRequirementsResultSchema = z.object({
  feature: z.string().min(1),
  slices: z.array(SpecSliceSchema),
  /** Selectors that matched nothing — an unmatched id is a fact, not an absence. */
  misses: z.array(z.string()),
});

export type SearchModulesInput = z.infer<typeof SearchModulesInputSchema>;
export type SearchModuleMatch = z.infer<typeof SearchModuleMatchSchema>;
export type SearchModulesResult = z.infer<typeof SearchModulesResultSchema>;
export type SearchMatchField = (typeof SEARCH_MATCH_FIELDS)[number];
export type GetDependencyDirectionInput = z.infer<typeof GetDependencyDirectionInputSchema>;
export type GetSpecRequirementsInput = z.infer<typeof GetSpecRequirementsInputSchema>;
export type SpecRequirementsResult = z.infer<typeof SpecRequirementsResultSchema>;
export type DependencyDirectionResult = z.infer<typeof DependencyDirectionResultSchema>;
export type DependencyDirectionSource = (typeof DEPENDENCY_DIRECTION_SOURCES)[number];
