# Spec Sync

> Sub-module of [services](./README.md) — how `archive.service` writes the spec layer: Feature Specs, `product.md`, `feature-map.yaml`, and the post-judgment `finalize` pass.

## Key Files

| File | Purpose |
|------|---------|
| `archive.service.ts` → `syncToFeatureSpecs` | Merges delta-spec ADDED/MODIFIED/REMOVED into `specs/features/*.md` (Replace-in-Place) and appends the Change History row |
| `archive.service.ts` → `generateProductSpec` | Syncs `product.md`'s `## Feature Map` — the file's ONLY machine-owned region |
| `archive.service.ts` → `syncFeatureMap` | Bootstraps `feature-map.yaml` once (no-clobber); shares `listFeatureSpecFiles` with product.md so the two indexes cannot disagree |
| `archive.service.ts` → `executeFinalize` | Post-judgment: `_archived-history` copy + frontmatter counter reconciliation |

## Public API

- `syncToFeatureSpecs(...)` → `SpecSyncResult` — `files` + the `pendingConvergence` / `droppedBehavior` worklists
- `generateProductSpec(featuresPath, productSpecPath, projectName)` → written path
- `bootstrapProductSpec(projectName, features, today)` → the skeleton string (pinned against the shipped `product-spec-format` reference by a contract test)
- `syncFeatureMap(featuresPath, featureMapPath, moduleMap)` → path or `null` when it declines
- `executeFinalize(options)` / `recountFeatureSpecCounters(content)`

## Pitfalls

- **Never blanks an authored REQ body** — only a `**Spec:**` block replaces one (ADDED may fall back to Description+AC); everything else survives byte-identical and returns in `pendingConvergence` (incl. REMOVED REQs whose active section stands). Not blanking ≠ not losing: when a block DOES replace a body, the `WHEN/THEN` bullets it omits return in `droppedBehavior` — a SET difference, never a count.
- **`product.md` is AUTHORED with ONE machine-owned region.** `generateProductSpec` splices `## Feature Map` (each entry's authored description carried forward, title + link refreshed) and updates `last_updated`; every other byte survives. Only a MISSING file is bootstrapped, and then to the full shipped format. The whole-file rewrite this replaced silently deleted every hand-written section on every archive run.
- **Refuse rather than guess when the read is unreliable**: an unclosed code fence anywhere in `product.md` (masking would hide the tail, ignoring it would let a fenced `## ` cut the section short — dry-run plans a `skip`), or an absent `specs/features/` (an unreadable scan source is never the fact "this product has no features").
- **Line endings and headings are where the splice loses data.** Matching runs on a `\r`-stripped probe while raw lines are re-emitted, so a CRLF or mixed-ending file keeps every ending it had. Section boundaries count setext (`text` over `---`) and empty ATX (`##`) headings but NOT a bare `###` run; the frontmatter is excluded from the scan (a `#` line inside it is a YAML comment). A heading read as absent appends a duplicate section on EVERY run.
- FUNCTION replacers (verbatim `$`), path-contained `**Feature:**` slug, no-clobber `feature-map.yaml`; NO auto knowledge-update (the skill + verify prompt own it).
- `executeFinalize` refuses while `summary.md` lacks `## Review & Verify` — else the history copy captures the scaffold and counters predate graduation. Its recount refuses to zero a declared counter (a parse gap, not a fact) and reports it.
