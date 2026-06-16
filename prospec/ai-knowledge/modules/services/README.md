# services

> Business logic layer — services following `execute(options) → Promise<Result>` pattern, plus shared helpers (16 files, ~4,230 lines)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `src/services/quickstart.service.ts` | Quickstart orchestrator — sequences `init` (catch `AlreadyExistsError` → skipped) + `agentSync`, aggregates per-step status and forwards agent-sync hints; deliberately does NOT run `knowledge init` (LLM work belongs to the `/prospec-quickstart` skill); service-orchestrates-service (cf. change-resolver) |
| `src/services/init.service.ts` | Project init — scaffold config (incl. artifact language via --language/prompt/CI default), Constitution with Language Policy rule, AI Knowledge; renders all templates to memory first and writes `.prospec.yaml` LAST as the completion marker (mid-init failure leaves a re-runnable state) |
| `src/services/steering.service.ts` | Architecture discovery — scan, detectModules(strategy), generate module-map.yaml; `buildLayers` excludes the reserved `base_dir` key (artifact root, not a code layer) and falls through to detected modules when it is the only `paths` key; preserves `base_dir` across the config merge so resolution stays on the project's base_dir (else `resolveBasePaths` falls back to `DEFAULT_BASE_DIR`) |
| `src/services/knowledge.service.ts` | Module README + _index.md generation — Recipe-First format, key_exports, ContentMerger |
| `src/services/raw-scan.service.ts` | Deterministic raw-scan.md production — `generateRawScan()` shared core (scan → tech/entry/deps/config/tree → render → atomicWrite; returns scanned `files` so callers reuse one scan) + `execute()` for `prospec knowledge refresh`; writes ONLY raw-scan.md (never curated files). Shared by knowledge-init, the refresh command, and the archive safety net |
| `src/services/knowledge-init.service.ts` | Initial scan → raw-scan.md + module-map.yaml (generated when absent, via buildModuleMap); delegates raw-scan production to `raw-scan.service.generateRawScan` (init behavior unchanged) |
| `src/services/knowledge-update.service.ts` | Incremental knowledge update — parseDeltaSpec() (canonical 3-digit REQ ids; non-canonical ids surfaced via `DeltaSpecResult.malformed` → `KnowledgeUpdateResult.warnings`, not dropped silently), per-module README rebuild |
| `src/services/change-story.service.ts` | Create change proposal — proposal.md via template; metadata.yaml serialized with stringifyYaml (not a template); the `_index.md` module-table parser anchors separator/header detection to cell ROLE (all-dash/colon cells; first cell == "module"), so a data row whose Description contains `---` is not dropped |
| `src/services/change-resolver.ts` | Shared `resolveChange()` helper — selects which change to operate on (explicit / auto / prompt / --quiet error); single metadata read reused by change-plan + change-tasks |
| `src/services/change-plan.service.ts` | Generate plan.md + delta-spec.md scaffold — resolves change via `change-resolver`; refuses to overwrite an existing artifact unless `--force`; advances `metadata.status` forward-only (`isStatusBefore`, never regress); writes metadata via the comment-preserving Document API |
| `src/services/change-tasks.service.ts` | Generate tasks.md scaffold — resolves change via `change-resolver`; refuses to overwrite an existing artifact unless `--force`; advances `metadata.status` forward-only (`isStatusBefore`, never regress); writes metadata via the comment-preserving Document API |
| `src/services/agent-sync.service.ts` | Sync skills + references; synthesizeTriggers() composes frontmatter Triggers (baseline + skill_triggers + non-English hint); getSkillReferences() renders each declaring skill its OWN references (self-contained, no sibling-dir cites — REQ-AGNT-015), now incl. prospec-verify (debug-recovery-format) + prospec-review's 2nd ref (review-lenses-content) vendored MIT heuristics, gated on `skill.hasReferences` (REQ-AGNT-022) |
| `src/services/archive.service.ts` | Archive changes, spec sync to Feature Specs, generate product.md; task stats count code tasks only via `lib/task-markers` (`[M]`/`[V]` reported apart); Feature-Spec spec-sync uses FUNCTION replacers so `$`-sequences (`$&`, `` $` ``, `$$`) in a REQ description are preserved verbatim, not expanded; `**Feature:**` slug is path-contained via `isSafeResourceName` before use as a filename (no traversal); `moveToArchive` rolls back already-moved files on a mid-loop failure (no half-moved state); `ArchiveResult` carries `knowledgeWarnings` forwarded from the auto knowledge-update plus `rawScanRefreshed` from a non-fatal post-archive `generateRawScan` (mirrors the knowledge-update safety net) |
| `src/services/measure.service.ts` | Read + Zod-validate measurement-report.json — read-only, never calls a provider API |
| `src/services/check.service.ts` | Drift check orchestration — collectors → pure evaluators → report; `--json` atomicWrite, `--init-ci` workflow scaffold (rerun-safe); module-map load lives in `lib/knowledge-reader` (clamped paths, invalid map throws) |
| `src/services/mcp.service.ts` | Read-only MCP server — `buildMcpServer()` registers 6 resources + 2 tools (per-request reads via knowledge-reader); the `spec://feature/{name}` resource serves Feature Specs (REQ source of truth, `_archived*` excluded); `search_modules` joins each match's `category` from module-map via `attachModuleCategories`; `execute()` wires stdio transport; diagnostics stderr-only |

## Public API

- `quickstart.execute(options)` — One-command onboarding: init (catch `AlreadyExistsError` → skipped) + agent sync; Result carries per-step `steps`, the `agentSync` result (hints), and `nextStep` (`/prospec-quickstart`)
- `init.execute(options)` — Initialize new Prospec project
- `steering.execute(options)` — Discover architecture, generate module-map
- `knowledge.execute(options)` — Generate module READMEs and _index.md
- `knowledgeUpdate.execute(options)` / `collectAllModules(result, moduleMapPath)` — Incremental delta-spec-driven update (Result carries `warnings` for non-canonical REQ ids surfaced by `parseDeltaSpec`) / merge module-map + delta-spec into the `_index.md` module list
- `resolveChange(cwd, explicit, quiet, promptMessage)` — Resolve target change name (shared by change-plan/change-tasks); zero/ambiguous → `PrerequisiteError`
- `generateRawScan(options)` / `rawScan.execute(options)` — Deterministic raw-scan.md (re)generation core / `prospec knowledge refresh` entry; writes only raw-scan.md, returns scanned `files` for single-scan reuse
- `archive.execute(options)` — Archive verified changes, sync Feature Specs; Result carries `knowledgeWarnings` forwarded from the auto knowledge-update and `rawScanRefreshed` from the non-fatal post-archive raw-scan refresh
- `agentSync.execute(options)` — Deploy skills/entry configs; result carries `warnings` (unknown skill_triggers keys) and `hints` (populate skill_triggers for non-English languages)
- `measure.execute({cwd, reportPath?})` — Load measurement report for display; missing file → PrerequisiteError (run `pnpm measure:tokens`), invalid → MeasurementReportInvalid
- `check.execute({cwd, json?, initCi?})` — Run the drift engine (Result carries `hasFail`; exit-code mapping stays in cli) or scaffold the hardened CI workflow
- `mcp.execute({cwd})` / `buildMcpServer(ctx)` — start the stdio MCP server / assemble it transport-free (tests drive it over InMemoryTransport)

## Dependencies

- **depends_on**: `lib` (config, scanner, template, fs-utils, content-merger, yaml-utils, detector, module-detector), `types` (all schemas, errors)
- **used_by**: `cli` commands (each command calls one service)

## Modification Guide

1. Adding a new service: Create `src/services/{name}.service.ts`, export `execute(options): Promise<Result>`. Add matching CLI command + formatter.
2. Changing a service result type: Update the Result interface → update the CLI formatter that consumes it → update unit test assertions.
3. Changing knowledge output: Modify `knowledge.service.ts` — templateContext keys must match `steering/module-readme.hbs` variables (snake_case).
4. Changing steering: Modify `steering.service.ts` — reads `config.knowledge.strategy` for detectModules().
5. Changing archive: Modify `archive.service.ts` — affects spec sync, product.md, and the Knowledge update trigger. Archive calls knowledge-update internally.
6. Inter-service dependencies: `archive` → `knowledge-update` (post-archive trigger); `knowledge` requires `module-map.yaml`, now generated by `knowledge-init` (or legacy `steering`) — both share `lib/buildModuleMap()`.
7. Changing agent-sync: agents are grouped by `(skillPath, configPath)` and written once; trigger words are synthesized once per skill in `execute()` (agent-independent) and passed as `trigger_words`; the entry config renders `entry.md.hbs` with `artifact_language` + per-skill triggers.

## Ripple Effects

- `knowledge.service.ts` template context changes must match `steering/module-readme.hbs` Handlebars variables
- `module-map.yaml` is produced by `knowledge-init` (when absent) and `steering`, and consumed by knowledge + knowledge-update services
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
- check.service must keep knowledge-health on a REAL module-map (missing map → honest skip, never the constitution fallback — that would fabricate phantom coverage gaps)
- change-plan/change-tasks resolve the change + status through `services/change-resolver` (a sibling service-layer import, NOT `lib`) — the change-selection logic is service policy, so don't re-derive it inline or push it down to `lib`; both read metadata exactly once via the shared helper
- mcp.service: stdout is the JSON-RPC protocol channel — NEVER write diagnostics to it (banner/errors go stderr); resources are per-request reads, never cache; health/listing/dependency answers all flow through `lib/knowledge-reader` so containment and name guards apply on every surface

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
