# Shared Kernel

> Config, I/O, templates, scanning, detection, drift engine, status routing, knowledge reads, station engines (53 files)
<!-- prospec:module-readme-format 2026-09-01 -->

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `config.ts` | read/writeConfig, resolveBasePaths, resolveKnowledgeTokenBudget, the two language resolvers (`resolveArtifactLanguage` / `resolveTrustZoneLanguage`, each defaulting to English) |
| `project-runner.ts` | Multi-ecosystem test command resolution (`resolveProjectTestCommand`, `detectTestCommand`): declared `test_command` → declared package manager + `scripts.test` → manifest detection (Rust, Python, Go, Node lockfile, Makefile) → honest `null`; the review circuit breaker is a station engine — see the sub-module below |
| `fs-utils.ts` / `yaml-utils.ts` | atomicWrite, ensureDir, readFileIfExists (ENOENT→''); parse/stringifyYaml, escapeYamlScalar, mergeIntoDocument (comment-preserving) |
| `template.ts` / `auto-draft-template.ts` | renderTemplate + helpers/partials; resolveTemplatesDir; reads the generated `bundled-templates.ts` BEFORE the filesystem; `buildAutoDraftProposal` is a pure context builder over `change/auto-draft-proposal.md.hbs` — it collapses report-supplied text to one line, so a multi-line `detail` cannot forge the `## UI Scope` heading `status` parses as a routing fact |
| `change-metadata.ts` | Sole schema-validated read/write entry for change `metadata.yaml` → `{doc, metadata}`; `appendQualityLogEntry` (canonical key order); `normalizeIssueRef` — THE `issue` rule, every sink calls it; `sanitizeChangeSlug` / `deriveFixChangeName` — the `fix-<target>-<check>` naming used by drafting, collapsing path separators and dots so a report's `source_path` can never escape `.prospec/changes/` |
| `scanner.ts` / `module-detector.ts` | scanDir (fast-glob, security excludes), gitTrackedOnly, filterConventions, classifyModulePath; detectModules (auto/architecture/domain/package, source-gated), buildModuleMap |
| `knowledge-reader.ts` / `status-router.ts` | Realpath-contained reads: loadModuleMap/loadFeatureMap/loadFeatureSpecContent/loadModuleKnowledge (README + linked sub-modules), searchModules, stripCellEmphasis; I/O-free SDD station router (`routeChange`) emits bare canonical `STATION_SKILLS` identities and a separate actionable skill-file path |
| `draftable-findings.ts` | `isDraftableFinding` — the ONE predicate deciding whether a drift finding can be drafted into a fix change (excludes the `headroom` pressure tier and anything under `.prospec/`); pure, so the read-only `status` surface shares it with the drafter without importing the change-creation path |
| `knowledge-sync.ts` / `archive-gate.ts` | `checkKnowledgeSync` — the ONE affected-module knowledge-sync derivation (`status` routes on it, `archive` refuses on it); `evaluateArchiveEntryGate` — the pure archive Entry-Gate verdict over the drift report (metadata-completeness / three provenance / knowledge-sync; `--allow-incomplete` exempts completeness only) |
| `spec-headings.ts` / `spec-slices.ts` / `spec-read.ts` | THE feature-spec REQ heading rule, the index over it, the pure REQ-scoped selection, and the one shared read entry both narrow-read surfaces route through — see the sub-module below |
| station engines (9 files) | Pipe tables, the evidence-block grammar, the findings merge, the S/A/B/C/D grade, the ledger, the artifact validators, the module README format engine, the dual-axis review circuit breaker, the lens yield statistics — see the sub-module below |

The drift engine's 7 files are listed in the sub-module below; the station engines' 9 in theirs; the other 19 `.ts` are single-purpose helpers, with invariants in Pitfalls.

## Public API

- Config/IO/render — `readConfig`/`atomicWrite`/`renderTemplate`/`mergeContent`/`mergeManagedDoc`
- Scan/detect/parse — `scanDir`/`detectModules`/`isSourceFile`/`collectNonSourceDirectories`/`detectTechStack`/`parse*Dependencies()` (malformed-safe)
- Knowledge/metadata — `loadModuleMap`/`searchModules`/`loadFeatureSpecContent`/`loadModuleKnowledge` (README + `## Sub-Modules` files), `readChangeMetadata`/`appendQualityLogEntry` (drift exports: see the sub-module)
- Circuit breaker/runner — `countFlips`/`isOscillating`/`calculateFixInducedRatio`/`ReviewCircuitBreaker` (a station engine), `resolveProjectTestCommand`/`detectTestCommand`
- Token Accounting — `parseAllLogFiles` (JSONL transcript parsing), `calculateCodebaseBaselineTokens` (`git ls-files` based theoretical baseline)
- Station mechanics — `indexSpec`/`selectSpecSlices`/`renderSpecSlices`, and `readSpecSlices` (the one narrow-read entry both surfaces share) (the rest: see the Station Engines sub-module)

## Dependencies

**Depends on:** `types` (ProspecConfig, ModuleMap, errors, measurement schemas)
**Used by:** `services/*`, `cli/*`, `scripts/*` (outside layering)

## Modification Guide

1. **Add a utility** — pure, stateless; `template.ts`'s latches are the sole exception.
2. **Add a Handlebars helper/partial** — register in `template.ts`; `pnpm bundle` to ship it.
3. **Add a drift check, or a generated artifact** — see [Drift Engine](./drift-engine.md).
4. **Change config resolution** — edit `resolveBasePaths()`/`resolveTestCommand()` + callers.
5. **Add a table-bearing doc** — reuse `markdown-table.ts`; own only the header predicate + columns.

## Ripple Effects

- `renderTemplate()`/`atomicWrite()` hit every service + CLI formatter; `knowledge-reader.ts` reaches mcp.service/drift-sources/check.service.

## Pitfalls

- `drift-assessment` owns shared current facts and pre-write rechecks; keep capture identity in `drift-sources` and pure decisions in `drift-checker`.
- `writeChangeMetadataDoc` preserves authored field order when YAML aliases exist, including nested aliases; canonical reordering must not move their anchors or change bindings.

- `mergeContent()` relies on exact markers (typos fail silently) — the auto/user marker strings live once in `content-markers.ts`; `scanDir()` excludes ADD to security defaults; YAML templates MUST run user text through `escapeYamlScalar()`; compose paths with `path.posix.join`.
- `module-detector.ts` admission is a pure 2-source-file gate; `isSourceFile` is the single classifier.
- `markdown-fences.ts` owns markdown parsing and `toInlineCodeSpan` (which collapses line breaks to prevent raw newline header forging).
- `knowledge-reader.ts` owns `readContained` path-traversal safety (`isContainedPath`). Drift-sources imports from it, never the reverse.
- `text-lines.ts` owns line-ending strip for per-line matching (`stripTrailingCr`).
- `landing-fidelity.ts` is the ONE landing-block comparison — `assessDrops` plus the delta-spec block/bullet parsers (`extractDeltaBlock`/`whenThenBullets`/`declaredDrops`/`iterateDeltaEntries`) — and the ONE routing-header verdict, `classifyRoutingResolution` (over the `buildReqHomeIndex` map from `spec-read`). `archive.service`'s fail-closed write and the `delta-spec-landing-fidelity` check both call both; never re-implement the drop diff or the routing verdict (that divergence is the drift the check guards).
- `token-accounting.ts` takes pricing as a parameter; `language-policy.ts` is the single language-scope source.
- Station engines decide, never re-derive policy — grade budgets, ledger refusals, findings identity and evidence round-trip are in [Station Engines](./station-engines.md).

## Sub-Modules

- [Drift Engine](./drift-engine.md) — the zero-LLM collectors + evaluators, the provenance fingerprints, and the check-authoring recipe
- [Spec Reading](./spec-reading.md) — the REQ heading rule, the spec index, and the REQ-scoped read the CLI and MCP share
- [Station Engines](./station-engines.md) — the table/evidence/merge/grade/ledger/validator engines the cli-first stations delegate to

<!-- prospec:auto-end -->

<!-- prospec:user-start -->

<!-- prospec:user-end -->
