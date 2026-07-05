import { z } from 'zod';

/**
 * ModuleMap schema — validates module-map.yaml
 */

const ModuleRelationshipsSchema = z.object({
  depends_on: z.array(z.string()).optional(),
  used_by: z.array(z.string()).optional(),
});

const ModuleEntrySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  paths: z.array(z.string()),
  keywords: z.array(z.string()),
  // Human-readable localized search aliases (index.md "Aliases" column). Curated
  // here as the single source; index.md is generated from it.
  aliases: z.array(z.string()).optional(),
  // Module-split rationale (index.md "Rationale" column). Curated here.
  rationale: z.string().optional(),
  // Ordered domain categories; element[0] is the primary category that drives
  // index.md grouping. Absent/empty = ungrouped (flat table). Single source of truth.
  category: z.array(z.string()).optional(),
  relationships: ModuleRelationshipsSchema.optional(),
});

export const ModuleMapSchema = z.object({
  modules: z.array(ModuleEntrySchema),
});

export type ModuleMap = z.infer<typeof ModuleMapSchema>;
export type ModuleEntry = z.infer<typeof ModuleEntrySchema>;
export type ModuleRelationships = z.infer<typeof ModuleRelationshipsSchema>;
