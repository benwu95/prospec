# Spec Sync

> Sub-module of [Command Services](./README.md) — how `archive.service` writes the spec layer: Feature Specs, `product.md`, `feature-map.yaml`, and the post-judgment `finalize` pass.

## Key Files

| File | Purpose |
|------|---------|
| `archive.service.ts` → `syncToFeatureSpecs` | Merges delta-spec ADDED/MODIFIED/REMOVED into `specs/features/*.md` (Replace-in-Place) and appends the Change History row |
| `archive.service.ts` → `generateProductSpec` | Syncs `product.md`'s `## Feature Map` — the file's ONLY machine-owned region |
| `archive.service.ts` → `syncFeatureMap` | Bootstraps `feature-map.yaml` once (no-clobber); shares `listFeatureSpecFiles` with product.md so the two indexes cannot disagree |
| `archive.service.ts` → `executeFinalize` | Post-judgment: `_archived-history` copy + frontmatter counter reconciliation |

## Public API

- `syncToFeatureSpecs(...)` → `SpecSyncResult` — `files` + five worklists: `pendingConvergence`, `droppedBehavior` (undeclared, BLOCKING), `acknowledgedDrops`, `staleDeclarations`, `refusedRequirements` (BLOCKING)
- `classifyBlockTerminator` / `extractDeltaBlock` / `declaredDrops` / `whenThenBullets` — the I/O-free parsers the guards are built from
- `generateProductSpec(featuresPath, productSpecPath, projectName)` → `{ path, declined }` — `declined` names why nothing was written
- `inspectProductSpecSync(content, featuresExist)` → the decline reason or `null` — the ONE decision the real run and `--dry-run` both read
- `bootstrapProductSpec(projectName, features, today)` → the skeleton string (pinned against the shipped `product-spec-format` reference by a contract test)
- `syncFeatureMap(featuresPath, featureMapPath, moduleMap)` → path or `null` when it declines
- `executeFinalize(options)` / `recountFeatureSpecCounters(content)`

## Pitfalls

- **Never blanks an authored REQ body** — only a `**Spec:**` block replaces one (ADDED may fall back to Description+AC); everything else survives byte-identical and returns in `pendingConvergence` (incl. REMOVED REQs whose active section stands). Not blanking ≠ not losing: when a block DOES replace a body, the `WHEN/THEN` bullets it omits return in `droppedBehavior` — a SET difference, never a count, over `-`/`*`/`N.` markers with optional `**WHEN**` emphasis (a continuation must still be INDENTED, or an unindented table row merges into the bullet and invents a drop).
- **Loss HOLDS THE WRITE, and the verdict is taken before any `atomicWrite`.** Both worklists were advisory once: the report printed, the spec was written anyway, and the author needed a manual snapshot to recover. Now a feature spec with an undeclared drop or a refused REQ is left byte-identical and the command exits non-zero — per feature spec, so an unrelated spec in the same run still syncs. Deliberate removal is released only by listing the bullet under `**Dropped:**` in the delta-spec entry (set-compared through the same `normalizeBullet` key); a declaration matching nothing is a `staleDeclaration`, reported and non-blocking.
- **A block cut short by a foreign label is REFUSED, never landed short.** `classifyBlockTerminator` splits terminators into the delta-spec template's own fields (`DELTA_TEMPLATE_FIELDS`, which MUST include `Dropped` or a declaration truncates the block it accompanies) and everything else. `**Scenarios:**` — the label the Feature Spec scaffold itself shows — is the second kind, and used to cut a correctly-written landing block down to its opening sentence with no signal. A `**Dropped:**` declaration does not release a refusal: the block is what is broken. Note the mirror shape, still deliberate: the label grammar excludes parentheses, so `**Deviation (recorded at implement time):**` is not a boundary at all.
- **`product.md` is AUTHORED with ONE machine-owned region.** `generateProductSpec` splices `## Feature Map` (each entry's authored description carried forward, title + link refreshed) and updates `last_updated`; every other byte survives. Only a MISSING file is bootstrapped, and then to the full shipped format. The whole-file rewrite this replaced silently deleted every hand-written section on every archive run.
- **Refuse rather than guess, and always REPORT the refusal.** Three states decline: an unclosed code fence (masking would hide the tail, ignoring it would let a fenced `## ` cut the section short), an absent `specs/features/` (an unreadable scan source is never the fact "this product has no features"), and a near-miss `## Feature Map` heading — a decorated variant (`## Feature Map (34 active)`) that exact matching misses, where appending grew a SECOND feature map and splicing would have deleted the author's curated one. `inspectProductSpecSync` is the single decision; the real run reports it on stderr and dry-run plans a `skip`, so the two can never disagree about whether a file is written.
- **Line endings and headings are where the splice loses data.** Matching runs on a `\r`-stripped probe (`lib/text-lines`' `stripTrailingCr` — the one implementation of that strip, never a local copy) while raw lines are re-emitted, so a CRLF or mixed-ending file keeps every ending it had. All three probes here are load-bearing: the ATX pattern uses `[ \t]*$`, which does not admit `\r`, so dropping a strip makes the near-miss refusal and the populated-map advice silently wrong on a Windows checkout. Section boundaries count setext (`text` over `---`) and empty ATX (`##`) headings but NOT a bare `###` run; the frontmatter is excluded from the scan (a `#` line inside it is a YAML comment). A heading read as absent appends a duplicate section on EVERY run.
- FUNCTION replacers (verbatim `$`), path-contained `**Feature:**` slug, no-clobber `feature-map.yaml`; NO auto knowledge-update (the skill + verify prompt own it).
- `executeFinalize` refuses while `summary.md` lacks `## Review & Verify` — else the history copy captures the scaffold and counters predate graduation. Its recount refuses to zero a declared counter (a parse gap, not a fact) and reports it.
