# services

> Business logic layer — services following `execute(options) → Promise<Result>` pattern, plus shared helpers (16 files, ~4,400 lines)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `src/services/quickstart.service.ts` | Quickstart orchestrator — sequences `init` (catch `AlreadyExistsError` → skipped) + `agentSync`, aggregates per-step status and forwards agent-sync hints; deliberately does NOT run `knowledge init` (LLM work belongs to the `/prospec-quickstart` skill); service-orchestrates-service (cf. change-resolver) |
| `src/services/init.service.ts` | Project init — scaffold config (incl. artifact language via --language/prompt/CI default), Constitution with Language Policy rule, AI Knowledge; renders all templates to memory first and writes `.prospec.yaml` LAST as the completion marker (mid-init failure leaves a re-runnable state); uses a **per-file skip-if-exists guard** — a re-run (e.g. after `.prospec.yaml` was deleted) never clobbers existing curated files (CONSTITUTION/_conventions/_index), rebuilds only missing files, and seeds `version: PROSPEC_VERSION`; AGENTS.md is a `managed` artifact — merged via `mergeManagedDoc` (existing content migrated into the `prospec:user` block, the stub in `prospec:auto`) rather than blanket-skipped, while the curated trust-zone files keep skip-if-exists |
| `src/services/upgrade.service.ts` | Upgrade orchestrator — `execute()` records the prospec `version` in `.prospec.yaml`, runs `agentSync`, and builds a report (version delta + skills missing triggers + config-field nudges from a curated `UPGRADE_NUDGE_RULES` registry — currently `artifact_language` when a pre-feature project never chose one); with `interactive: true` it first prompts to fill each fired nudge (like `init`); best-effort refreshes `raw-scan.md` (`generateRawScan`, non-fatal `rawScanRefreshed`); **writes no curated docs** — the only `ai-knowledge/` write is the regenerable `raw-scan.md` (the `/prospec-upgrade` skill owns curated-doc refresh). Also exports `detectMissingTriggers` and `detectNudges` |
| `src/services/knowledge.service.ts` | Module README + _index.md generation — Recipe-First format, key_exports, ContentMerger; read-or-empty existing-file reads use `lib/fs-utils` `readFileIfExists` (non-ENOENT errors propagate) |
| `src/services/raw-scan.service.ts` | Deterministic raw-scan.md production — `generateRawScan()` shared core (scan **git-tracked files** via `scanDir({gitTrackedOnly:true})`, falling back to the full glob when not a git work tree → tech/entry/deps/config/tree → render → atomicWrite; returns scanned `files` so callers reuse one scan); `collectDependencies` dispatches across 11-language ecosystems (via `lib/manifest-parsers`; Swift/Ruby short-circuit to `[]`, C/C++ gated on `hasCFamilySource`), `detectEntryPoints`/`collectConfigFiles` cover backend conventions; writes ONLY raw-scan.md (never curated files). Shared by knowledge-init (incl. `--raw-scan-only`) and the archive safety net |
| `src/services/knowledge-init.service.ts` | Initial scan → raw-scan.md + module-map.yaml + _index/_conventions skeletons (generated when absent, module-map via buildModuleMap); delegates raw-scan to `raw-scan.service.generateRawScan`; `rawScanOnly` option (`--raw-scan-only`) regenerates raw-scan.md only and skips module detection + skeleton seeding |
| `src/services/knowledge-update.service.ts` | Incremental knowledge update — parseDeltaSpec() (canonical 3-digit REQ ids; non-canonical ids surfaced via `DeltaSpecResult.malformed` → `KnowledgeUpdateResult.warnings`, not dropped silently), per-module README rebuild; BL-043 feature-prefix-aware resolution — a REQ whose prefix is a feature-map `req_prefixes` entry resolves to `feature.modules ∪ relatedModules ∩ known` (new `relatedModules` option) and never mints a phantom `modules/<prefix>/`, module-prefix REQ ids unchanged; the `_index.md` auto-block swap reuses `lib/content-merger` `hasAutoBlock`/`replaceAutoBlock` (single-source matcher) and read-or-empty reads use `readFileIfExists` |
| `src/services/change-story.service.ts` | Create change proposal — proposal.md via template; metadata.yaml serialized with stringifyYaml (not a template); the `_index.md` module-table parser anchors separator/header detection to cell ROLE (all-dash/colon cells; first cell == "module"), so a data row whose Description contains `---` is not dropped |
| `src/services/change-resolver.ts` | Shared `resolveChange()` helper — selects which change to operate on (explicit / auto / prompt / --quiet error); single metadata read reused by change-plan + change-tasks |
| `src/services/change-plan.service.ts` | Generate plan.md + delta-spec.md scaffold — resolves change via `change-resolver`; refuses to overwrite an existing artifact unless `--force`; advances `metadata.status` forward-only (`isStatusBefore`, never regress); writes metadata via the comment-preserving Document API |
| `src/services/change-tasks.service.ts` | Generate tasks.md scaffold — resolves change via `change-resolver`; refuses to overwrite an existing artifact unless `--force`; advances `metadata.status` forward-only (`isStatusBefore`, never regress); writes metadata via the comment-preserving Document API |
| `src/services/agent-sync.service.ts` | Sync skills + references; synthesizeTriggers() composes frontmatter Triggers (baseline + skill_triggers + non-English hint); getSkillReferences() renders each declaring skill its OWN references (self-contained, no sibling-dir cites — REQ-AGNT-015), now incl. prospec-verify (debug-recovery-format) + prospec-review's 2nd ref (review-lenses-content) vendored MIT heuristics + prospec-backfill-spec (feature-boundary-criteria, BL-039), gated on `skill.hasReferences` (REQ-AGNT-022); the non-English trigger hint now **names the skills missing a `skill_triggers` entry** (partial localization), not just all-or-nothing; `generateEntryConfig` now **merges** the entry config (read existing → `mergeManagedDoc` → `atomicWrite`): refreshes only the `prospec:auto` block and preserves the `prospec:user` block, migrating a marker-less hand-written CLAUDE.md/AGENTS.md into the user block instead of overwriting it |
| `src/services/archive.service.ts` | Archive changes, spec sync to Feature Specs, generate product.md; `syncFeatureMap()` is the sole automated writer of `feature-map.yaml` (feature→module index), co-located with `generateProductSpec`: bootstrap-once + no-clobber (never overwrites a curated index), seeds each feature's `modules[]` from its module-prefix REQ headings (typo-safe: non-module prefixes not seeded) but leaves `req_prefixes` empty (never auto-filled), uses the same module-map/Constitution-fallback the drift checks use, non-fatal (try/catch like product.md/raw-scan); task stats count code tasks only via `lib/task-markers` (`[M]`/`[V]` reported apart); Feature-Spec spec-sync uses FUNCTION replacers so `$`-sequences (`$&`, `` $` ``, `$$`) in a REQ description are preserved verbatim, not expanded; `**Feature:**` slug is path-contained via `isSafeResourceName` before use as a filename (no traversal); `moveToArchive` rolls back already-moved files on a mid-loop failure (no half-moved state); `ArchiveResult` carries `knowledgeWarnings` forwarded from the auto knowledge-update plus `rawScanRefreshed` from a non-fatal post-archive `generateRawScan` (mirrors the knowledge-update safety net); the auto knowledge-update is **skipped for `scale: backfill`** (`ArchivedChange.scale` gates it) — feature-slug REQ ids would be misread as module names and mint phantom `modules/<slug>/` READMEs + module-map entries, so backfill module sync stays owned by the archive Entry Gate (`related_modules`/`**Feature:**`→feature-map); for standard/full, `ArchivedChange.relatedModules` (from `metadata.related_modules`) is forwarded to the auto knowledge-update so a feature-prefixed REQ (e.g. REQ-MCP-*) resolves to its real modules instead of minting a phantom (BL-043) |
| `src/services/measure.service.ts` | Read + Zod-validate measurement-report.json — read-only, never calls a provider API |
| `src/services/check.service.ts` | Drift check orchestration — collectors → pure evaluators → report; wires `collectFeatureMapGovernance` and `collectReadmeCounts` (BL-043, via a single `moduleMapMissing` degrade helper shared with timestamps) into the `runChecks` inputs; `--json` atomicWrite, `--init-ci` workflow scaffold (rerun-safe); module-map load lives in `lib/knowledge-reader` (clamped paths, invalid map throws) |
| `src/services/mcp.service.ts` | Read-only MCP server — `buildMcpServer()` registers 8 resources + 2 tools (per-request reads via knowledge-reader); BL-042 added two entry/index resources — `knowledge://feature-map` (raw `application/yaml`, mirrors `knowledge://module-map`; its not-found hint points to `/prospec-archive`, the bootstrap path) and `spec://product` (`text/markdown` PRD entry point, mirrors `knowledge://playbook`), so `McpServerContext` gained a `specsPath` field (product.md read root); the `spec://feature/{name}` resource serves Feature Specs (REQ source of truth, `_archived*` excluded); `search_modules` joins each match's `category` from module-map via `attachModuleCategories`; `execute()` wires stdio transport; diagnostics stderr-only |

## Public API

- `quickstart.execute(options)` — One-command onboarding: init (catch `AlreadyExistsError` → skipped) + agent sync; Result carries per-step `steps`, the `agentSync` result (hints), and `nextStep` (`/prospec-quickstart`)
- `init.execute(options)` — Initialize new Prospec project (per-file skip-if-exists; re-run never clobbers curated files)
- `upgrade.execute(options)` / `detectMissingTriggers(config, artifactLanguage)` / `detectNudges(config)` — record prospec `version` + run agentSync + best-effort refresh `raw-scan.md` + build a report (writes no curated docs; only the regenerable raw-scan.md); detect which skills lack a `skill_triggers` entry, and which curated config fields are unset (nudges)
- `knowledge.execute(options)` — Generate module READMEs and _index.md
- `knowledgeUpdate.execute(options)` / `collectAllModules(result, moduleMapPath)` — Incremental delta-spec-driven update (options take an optional `relatedModules` to resolve feature-prefixed REQ ids; Result carries `warnings` for non-canonical REQ ids surfaced by `parseDeltaSpec`) / merge module-map + delta-spec into the `_index.md` module list
- `resolveChange(cwd, explicit, quiet, promptMessage)` — Resolve target change name (shared by change-plan/change-tasks); zero/ambiguous → `PrerequisiteError`
- `generateRawScan(options)` — Deterministic raw-scan.md (re)generation core, shared by `knowledge init` (incl. `--raw-scan-only`), the archive safety net, and `prospec upgrade`; scans git-tracked files only (fallback to full glob when no git), writes only raw-scan.md, returns scanned `files` for single-scan reuse
- `archive.execute(options)` — Archive verified changes, sync Feature Specs; Result carries `knowledgeWarnings` forwarded from the auto knowledge-update and `rawScanRefreshed` from the non-fatal post-archive raw-scan refresh
- `agentSync.execute(options)` — Deploy skills/entry configs; result carries `warnings` (unknown skill_triggers keys) and `hints` (populate skill_triggers for non-English languages)
- `measure.execute({cwd, reportPath?})` — Load measurement report for display; missing file → PrerequisiteError (run `pnpm measure:tokens`), invalid → MeasurementReportInvalid
- `check.execute({cwd, json?, initCi?})` — Run the drift engine (Result carries `hasFail`; exit-code mapping stays in cli) or scaffold the hardened CI workflow
- `mcp.execute({cwd})` / `buildMcpServer(ctx)` — start the stdio MCP server / assemble it transport-free (tests drive it over InMemoryTransport)

## Dependencies

- **depends_on**: `lib` (config, scanner, template, fs-utils, content-merger, yaml-utils, detector, manifest-parsers, module-detector), `types` (all schemas, errors)
- **used_by**: `cli` commands (each command calls one service)

## Modification Guide

1. Adding a new service: Create `src/services/{name}.service.ts`, export `execute(options): Promise<Result>`. Add matching CLI command + formatter.
2. Changing a service result type: Update the Result interface → update the CLI formatter that consumes it → update unit test assertions.
3. Changing knowledge output: Modify `knowledge.service.ts` — templateContext keys must match `knowledge/module-readme.hbs` variables (snake_case).
4. Changing archive: Modify `archive.service.ts` — affects spec sync, product.md, `feature-map.yaml` (via `syncFeatureMap`), and the Knowledge update trigger. Archive calls knowledge-update internally.
5. Inter-service dependencies: `archive` → `knowledge-update` (post-archive trigger); `knowledge` requires `module-map.yaml`, now generated by `knowledge-init` via `lib/buildModuleMap()`.
6. Changing agent-sync: agents are grouped by `(skillPath, configPath)` and written once; trigger words are synthesized once per skill in `execute()` (agent-independent) and passed as `trigger_words`; the entry config renders `entry.md.hbs` with `artifact_language` + per-skill triggers.

## Ripple Effects

- `knowledge.service.ts` template context changes must match `knowledge/module-readme.hbs` Handlebars variables
- `module-map.yaml` is produced by `knowledge-init` (when absent), and consumed by knowledge + knowledge-update services
- `archive.service.ts` writes to `specs/features/` and `specs/product.md` — changes affect verify and planning skills
- non-canonical REQ ids flow `parseDeltaSpec` → `DeltaSpecResult.malformed` → `KnowledgeUpdateResult.warnings` → `ArchiveResult.knowledgeWarnings` — touching any link in this chain affects what archive surfaces
- Service result type changes require corresponding CLI formatter updates

## Pitfalls

- Always use `atomicWrite()` — direct `fs.writeFileSync` risks partial writes on crash
- `ContentMerger` must be used for any file with user sections — skipping it silently overwrites user notes
- `knowledge.service.ts` requires `module-map.yaml` to exist — now satisfied by `knowledge init` (rerun-safe: only written when absent); throws `PrerequisiteError` if still missing
- Template context keys have no compile-time validation — typos produce empty output silently
- change metadata.yaml is NOT rendered from a template — build the object and `stringifyYaml()` it (correct-by-construction escaping); frontmatter trigger words go through `escapeYamlScalar()`
- archive's Feature-Spec spec-sync must use FUNCTION replacers, not string replacements — a REQ description containing `$&`/`` $` ``/`$$` would otherwise be regex-expanded instead of inserted verbatim
- change-plan/change-tasks advance `metadata.status` forward-only via `isStatusBefore` — never write a status that regresses the lifecycle, and route the write through the comment-preserving Document API (don't re-serialize and drop comments)
- archive's auto knowledge-update safety net no-ops when delta-spec.md is absent (the quick path) — the skill-level archive Entry Gate (diff-path module derivation) is the mandatory checkpoint there
- `feature-map.yaml` is no-clobber: `syncFeatureMap` is the ONLY automated writer and must never overwrite a human-curated index (silent data loss) — it bootstraps once when absent, seeds `modules[]` from module-prefix REQs only, and never auto-fills `req_prefixes` (auto-filling would whitewash typos and churn the dangling-prefix drift)
- check.service must keep knowledge-health on a REAL module-map (missing map → honest skip, never the constitution fallback — that would fabricate phantom coverage gaps)
- change-plan/change-tasks resolve the change + status through `services/change-resolver` (a sibling service-layer import, NOT `lib`) — the change-selection logic is service policy, so don't re-derive it inline or push it down to `lib`; both read metadata exactly once via the shared helper
- mcp.service: stdout is the JSON-RPC protocol channel — NEVER write diagnostics to it (banner/errors go stderr); resources are per-request reads, never cache; health/listing/dependency answers all flow through `lib/knowledge-reader` so containment and name guards apply on every surface

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
