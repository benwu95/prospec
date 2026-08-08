# services

> Business logic — one `execute(options) → Promise<Result>` per command + shared helpers (29 files)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `init.service.ts` / `upgrade.service.ts` | Scaffold config + Constitution + AI Knowledge (per-file skip-if-exists, `.prospec.yaml` last); upgrade records `version`, re-syncs, back-fills missing init docs (never overwrite) + migration report (stale-Language-Policy) |
| `archive.service.ts` | Archive + spec-sync (Feature Spec / product.md / `feature-map.yaml`) — writer contracts in the Spec Sync sub-module; `syncToFeatureSpecs` takes the change name as a REQUIRED arg (both Change History writers name it through `escapeTableCell` — a directory-sourced cell shifts columns); `dryRun` short-circuits every write and returns `planned` |
| `agent-sync.service.ts` | Sync skills + `getSkillReferences` refs + entry configs; triggers; sweep orphans; merge user blocks; per-group capability intersection |
| `knowledge-init` + `raw-scan` / `knowledge-update.service.ts` | Initial scan → raw-scan.md (11-lang manifests + the non-source-directory disclosure the skill overrules the draft map with) + module-map.yaml + skeletons; delta-spec-driven index/module-map refresh (`executeForChange`); README skeleton for NEW modules only (`readmePending` flags the rest) |
| `change-*.service.ts` + `change-resolver.ts` | Scaffold proposal/plan/delta-spec/tasks (forward-only) plus `log`/`status`/`scale`/`progress` bookkeeping; metadata I/O via `lib/change-metadata`; plan/tasks read metadata FIRST and gate on `forbiddenArtifacts(scale)` (progress's missing-tasks hint reads it too) |
| `verify-record` / `review-merge` / `learn` / `validate.service.ts` | Station bookkeeping — S/A/B/C/D grade (S/A appends quality_log AND advances `status: verified` in one write); cumulative review.md table; ledger upsert + scoring + TTL; artifact verdicts |
| `check.service.ts` | Drift-check orchestration — collectors → evaluators → report (stamps `change_digest`); non-check modes (json/init-ci/record-review/record-tests/escaped-defects); every collector goes through a canonical resolver, never a re-derived path |
| `mcp.service.ts` / `status.service.ts` / `spec-show.service.ts` | The read-only surfaces — `src/services/mcp.service.ts` registers 8 resources + 3 tools (full path so `mcp-readme-counts` audits the line); SDD routing and the REQ-scoped Feature Spec read sit beside it. See the Read-only Queries sub-module |

Also: `quickstart` (init + agentSync), `agent-triggers` + `trigger-localization`, `measure`, `print-template`, `config-example`. README/index **content** is skill judgment (`/prospec-knowledge-generate`) — no service generates it.

## Public API

- `execute(options)` per service → typed `Result`
- `executeFinalize` / `executeForChange` / `executeWrite` — archive post-judgment; change-driven knowledge update; trigger write-back
- `resolveChange(...)` — change selector (zero/ambiguous → `PrerequisiteError`; traversal names refused pre-probe)
- `computeUnlocalizedSkills(config)` — fill-missing skill set (agent-sync hint + agent-triggers)
- `syncToFeatureSpecs(...)` → `SpecSyncResult` — `files` + five worklists; `droppedBehavior` (undeclared) and `refusedRequirements` are BLOCKING (the spec is left unwritten and the command exits non-zero), the other three are advisory — see the Spec Sync sub-module
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
- Spec-layer writes (Feature Specs / `product.md` / `feature-map.yaml` / `finalize`) have their own contract — see the Spec Sync sub-module. The short version: they merge or refuse, they never regenerate an authored file.
- metadata.yaml is built + serialized, never templated; status advances forward-only via `isStatusBefore`; metadata I/O ONLY via `lib/change-metadata` (never re-cast `doc.toJS()`). `archive.service` skips it deliberately: the terminal station absorbs pre-schema records earlier stations reject (floor: the archive Entry Gate).
- `updateModuleReadme` is CREATE-ONLY: module knowledge lives in the `prospec:auto` block, so re-rendering from the mechanical scan guts authored content. `updateModuleMap` merges through the yaml Document (comments + untouched descriptions survive) and no-ops when unchanged — never reflows the curated file.
- Refuse before writing, never after (file stays byte-identical): `verify record` self-reads machine dimensions from `prospec-report.json` and REFUSES a stale `change_digest`; `change status` refuses gate-owned targets (`GATE_OWNED_STATUSES`) and backward jumps (error lists the legal forward set); `change plan`/`change tasks` refuse a station the scale's contract closes (`--force` overwrites, never overrides the contract); `agent triggers --write` inserts only MISSING keys, re-validating BEFORE any byte reaches disk.
- `raw-scan.service` classifies through `lib/module-detector`'s exported `isSourceFile`, never its own copy; its disclosure is a fact about the file list, so `--raw-scan-only` reports it without detection. EVERY code-span value goes through `toInlineCodeSpan` (entry point, dependency name AND version, config path, directory, extension): `raw-scan.md` is agent-read, and a manifest value is arbitrary text, not a path.
- check.service keeps every side effect behind a flag (pure path: read-only, byte-reproducible); one change digest serves the review/test provenance collectors, while `collectDeltaSpecProvenance` deliberately takes none — it fingerprints each change's OWN delta-spec, which is the point of it being separate; a collector needing config-derived policy takes it as a REQUIRED argument (`collectKnowledgeSize`'s `additional_core_conventions`) so an omission is a compile error, not a silent behaviour difference; `--record-tests` checks preconditions BEFORE spawning, records the POST-run digest, then merges `test_provenance` into a FRESHLY re-read document (a mid-run edit survives; one that stops validating records nothing).

## Sub-Modules

- [Spec Sync](./spec-sync.md) — archive → Feature Spec / `product.md` / `feature-map.yaml` synchronisation + `finalize`
- [Read-only Queries](./read-only-queries.md) — the MCP server, SDD status routing, and the REQ-scoped Feature Spec read

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
