# Command Services

> Business logic — one `execute(options) → Promise<Result>` per command + shared helpers (32 files)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `init.service.ts` / `upgrade.service.ts` | Scaffold config + Constitution + AI Knowledge (per-file skip-if-exists, `.prospec.yaml` last); upgrade records `version`, re-syncs, back-fills missing init docs (never overwrite) + migration report (stale-Language-Policy, canonical docs marker) |
| `cascade.service.ts` | `evaluateCascadeTransition` (autonomous pipeline cascading transitions per scale & verifiers), `generateTastemakerSummary`, `formatTastemakerPresentation` (Tastemaker presentation gate) |
| `archive.service.ts` | Archive + spec-sync (Feature Spec / product.md / `feature-map.yaml`) — writer contracts in the Spec Sync sub-module; `syncToFeatureSpecs` takes the change name as a REQUIRED arg (both Change History writers name it through `escapeTableCell`); `dryRun` short-circuits every write and returns `planned` |
| `agent-sync.service.ts` | Sync skills + `getSkillReferences` refs + entry configs; triggers; sweep orphans; merge user blocks; per-group capability/render-flag merges and complete `invocation_guidance` from every shared-output member (never one member's host syntax) |
| `knowledge-init` + `raw-scan` / `knowledge-update` / `knowledge-verify.service.ts` | Initial scan → raw-scan.md (11-lang manifests + the non-source-directory disclosure the skill overrules the draft map with) + module-map.yaml + skeletons; delta-spec-driven index/module-map refresh (`executeForChange`); README skeleton for NEW modules only (`readmePending` flags the rest). `knowledge-verify` is the SOLE writer of `last_verified` (injected `now`; comment-preserving Document write) — update preserves but never stamps, init leaves a new module's absent; the `knowledge:check` gate and knowledge-health staleness both read it |
| `change-*.service.ts` + `change-resolver.ts` | Scaffold proposal/plan/delta-spec/tasks (forward-only) plus `log`/`status`/`scale`/`progress` bookkeeping; metadata I/O via `lib/change-metadata` (story writes `--issue`; blank=absent); plan/tasks read metadata FIRST and gate on `forbiddenArtifacts(scale)` (progress's missing-tasks hint reads it too) |
| `verify-record` / `review-merge` / `learn` (upsert + yield) / `validate.service.ts` | Station bookkeeping — S/A/B/C/D grade (S/A appends quality_log AND advances `status: verified` in one write) plus the judgment evidence appended to `verify.md` when `--dimensions` carries it; every judgment verdict must declare its grading context (refused before write) and an in-session one caps the grade below S (`selfVerifiedCap` names the remedy); cumulative review.md table plus each finding's evidence block; ledger upsert + scoring + TTL; lens yield analysis (`executeYield` — thresholds from `.prospec.yaml` `learn.lens_thresholds`, corpus = `.prospec/archive` plus `--corpus` dirs; only declared `--lenses` runs count toward retirement); artifact verdicts |
| `auto-draft.service.ts` | Attribute drift findings to a module via `module-map.yaml` (never a guessed path shape), group them by target/check, and delegate each scaffold to `change-story.service` — so its `AlreadyExistsError` is the idempotency signal and an existing change is never overwritten |
| `check.service.ts` | Drift-check orchestration — collectors → evaluators → report (stamps `change_digest`); non-check modes (init-ci/record-review/record-tests/escaped-defects) return before the run (record-review also stamps the reviewer's self-declared grading context into `review_provenance` when supplied — absent otherwise, never blank); `--json` writes the report and `--auto-draft` drafts AFTER it, so drafting can neither discard the report nor move the exit code; every collector goes through a canonical resolver, never a re-derived path |
| `mcp.service.ts` / `status.service.ts` / `spec-show.service.ts` | The read-only surfaces — `src/services/mcp.service.ts` registers 8 resources + 3 tools (full path so `mcp-readme-counts` audits the line); SDD routing and the REQ-scoped Feature Spec read sit beside it. `status.service` also reads `prospec-report.json` when the workspace is clean — through `DriftReportSchema` and a `change_digest` comparison, so an unusable or stale report is reported as that rather than as no drift, and it counts only what `--auto-draft` would draft (`isDraftableFinding`). See the Read-only Queries sub-module |

Also: `quickstart` (init + agentSync), `agent-triggers` + `trigger-localization`, `measure` (local session log parsing + baseline estimation, or projects context budget via `--project-workflow`), `print-template`, `config-example`. README/index **content** is skill judgment (`/prospec-knowledge-generate`) — no service generates it.

## Public API

- `execute(options)` per service → typed `Result`
- `executeYield(options)` — per-lens confirmed yield statistics and retirement recommendations
- `executeFinalize` / `executeForChange` / `executeWrite` — archive post-judgment; change-driven knowledge update; trigger write-back
- `evaluateCascadeTransition` / `generateTastemakerSummary` / `formatTastemakerPresentation` — cascading station evaluation and human sign-off formatting
- `resolveChange(...)` — change selector (zero/ambiguous → `PrerequisiteError`; traversal names refused pre-probe)
- `computeUnlocalizedSkills(config)` — fill-missing skill set (agent-sync hint + agent-triggers)
- `syncToFeatureSpecs(...)` → `SpecSyncResult` — `files` + the worklists; `droppedBehavior` and `refusedRequirements` are BLOCKING (spec left unwritten, non-zero exit), the rest advisory — see the Spec Sync sub-module
- `recountFeatureSpecCounters(content)` — frontmatter counters from the final body, derived by `lib/spec-headings`

## Dependencies

**Depends on:** `lib` (config, scanner, template, fs-utils, yaml-utils, station engines), `types` (schemas, errors, contracts)
**Used by:** `cli` (each command calls one service), `tests`

## Modification Guide

1. **Add a service** — create `{name}.service.ts` exporting `execute()`; add command + formatter + unit test.
2. **Add a station service** — judgment arrives as structured input (`types/station.ts`); the service does only the deterministic write, the decision lives in a `lib` engine.
3. **Change a Result type** — interface → CLI formatter → unit-test assertions.

## Pitfalls

- Use `atomicWrite()` (never `writeFileSync`) + `ContentMerger` for files with user sections.
- Spec writes (Feature Specs / `product.md` / `feature-map.yaml` / `finalize`) follow the Spec Sync contract — merge or refuse, never regenerate authored text; slice-aware via `loadFeatureSpecContent`.
- metadata.yaml is built + serialized, never templated; status advances forward-only; metadata I/O ONLY via `lib/change-metadata`. `archive.service` absorbs pre-schema records at the archive Entry Gate.
- `updateModuleReadme` is CREATE-ONLY: module knowledge lives in `prospec:auto`, so re-rendering from scan guts authored content. `updateModuleMap` merges Document comments/descriptions without clobbering.
- Refuse before writing (file stays byte-identical): `verify record` refuses stale `change_digest`, a judgment verdict missing `graded_by`, a FAIL `review-provenance` (non-backfill), and a judgment dimension graded below its machine counterpart (`constitution` vs `constitution-severity`); `archive` refuses on a stale/missing report, a `metadata-completeness`/provenance FAIL, or unsynced Knowledge (`--allow-incomplete` exempts completeness only) via the pure `lib/archive-gate`; `change status implemented` refuses until code tasks are complete (reuses `change-progress`); `change status` refuses gate-owned targets (`GATE_OWNED_STATUSES`) and backward jumps; `agent triggers --write` inserts only missing keys; evidence stations refuse over-ceiling or multi-line relayed fields before disk write.
- `raw-scan.service` classifies through `lib/module-detector`'s `isSourceFile`. Code-span values pass through `toInlineCodeSpan` to prevent raw newline injection.
- `check.service` keeps side effects behind flags; provenance collectors take required config policies to prevent silent behavior drift; `--record-tests` checks preconditions before spawning, records post-run digest, and merges into freshly re-read document.

## Sub-Modules

- [Spec Sync](./spec-sync.md) — archive → Feature Spec / `product.md` / `feature-map.yaml` synchronisation + `finalize`
- [Read-only Queries](./read-only-queries.md) — the MCP server, SDD status routing, and the REQ-scoped Feature Spec read

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
