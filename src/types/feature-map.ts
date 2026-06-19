import { z } from 'zod';

/**
 * FeatureMap schema — validates feature-map.yaml, the feature→module index
 * that complements module-map.yaml. It answers the edge module-map cannot:
 * which modules a feature spans, and which non-module REQ prefixes a feature
 * owns. It deliberately does NOT duplicate paths/keywords/import edges.
 *
 * Semantic validation (feature slug safety via isSafeResourceName, modules[]
 * membership in module-map) lives in the lib loader/collector — types is the
 * leaf module and must never import upward from lib.
 */

export const FEATURE_STATUSES = ['active', 'deprecated'] as const;

const FeatureEntrySchema = z.object({
  // Slug matching specs/features/{feature}.md and its frontmatter `feature:`.
  feature: z.string().min(1),
  // Each entry should be an existing module-map module name (curation guideline,
  // enforced at the drift layer, not here).
  modules: z.array(z.string()),
  // Non-module domain tags this feature owns (e.g. CHNG, SPEC) — lets the
  // dangling-prefix drift resolve REQ prefixes that are not module names.
  req_prefixes: z.array(z.string()).optional(),
  status: z.enum(FEATURE_STATUSES).default('active'),
});

export const FeatureMapSchema = z.object({
  features: z.array(FeatureEntrySchema),
});

export type FeatureStatus = (typeof FEATURE_STATUSES)[number];
export type FeatureMap = z.infer<typeof FeatureMapSchema>;
export type FeatureEntry = z.infer<typeof FeatureEntrySchema>;
