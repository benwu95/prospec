/**
 * Repository files that are BUILD OUTPUT rather than authored source.
 *
 * Scope is deliberately narrow: these paths are excluded from the module
 * staleness comparison only (`last_src_commit`, REQ-LIB-015). A generated file
 * carries code but no knowledge a module README could describe, so a commit
 * that only regenerates it must not demand a knowledge update — the resulting
 * WARN has no honest fix, since editing the README to move its timestamp is
 * fabricated content.
 *
 * They stay INSIDE `computeChangeDigest` (REQ-LIB-024): the bundle is shipped
 * code, so changing it must keep invalidating review/test provenance.
 *
 * Each path is repository-root relative and posix-separated, and is the single
 * source shared with the artifact's producer — `scripts/bundle-templates.ts`
 * resolves its own output location from `BUNDLED_TEMPLATES_SOURCE`, so the two
 * cannot drift into hand-copied lists (REQ-LIB-039).
 */
export const BUNDLED_TEMPLATES_SOURCE = 'src/lib/bundled-templates.ts';

export const GENERATED_SOURCE_ARTIFACTS = [BUNDLED_TEMPLATES_SOURCE] as const;
