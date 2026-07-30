# services

> Business logic — one `execute(options) → Promise<Result>` service per command + shared helpers (29 files)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `init.service.ts` / `upgrade.service.ts` | Scaffold config + Constitution + AI Knowledge (per-file skip-if-exists, `.prospec.yaml` last); upgrade records `version`, re-syncs, back-fills missing init docs (never overwrite) + migration report (stale-Language-Policy signal) |
| `agent-sync.service.ts` | Sync skills + `getSkillReferences` refs + entry configs; triggers; sweep orphans; merge user blocks |
| `knowledge-init` + `raw-scan` / `knowledge-update.service.ts` | Initial scan → raw-scan.md (11-lang manifests) + module-map.yaml + skeletons; delta-spec-driven index/module-map refresh (`executeForChange`); README skeleton for NEW modules only (`readmePending` flags the rest) |
| `archive.service.ts` | Archive + spec-sync to Feature-Spec/product.md/`feature-map.yaml` (`syncFeatureMap` sole writer); `executeFinalize` = post-judgment history copy + counter recount; `dryRun` short-circuits every write point and returns `planned` |
| `change-*.service.ts` + `change-resolver.ts` | Scaffold proposal/plan/delta-spec/tasks (forward-only) plus `log` / `status` / `scale` / `progress` bookkeeping; metadata I/O via `lib/change-metadata` |
| `verify-record` / `review-merge` / `learn` / `validate.service.ts` | Station bookkeeping — S/A/B/C/D grade (S/A appends quality_log AND advances `status: verified` in one write); cumulative review.md table; ledger upsert + scoring + TTL; artifact-structure verdicts |
| `check.service.ts` | Drift-check orchestration — collectors → evaluators → report (stamps `change_digest`); non-check modes (json / init-ci / record-review / record-tests / escaped-defects) |
| `mcp.service.ts` | Read-only MCP server — `buildMcpServer()`: 8 resources + 2 tools, per-request reads |
| `status.service.ts` | Read-only SDD routing — scan `.prospec/changes/`, collect per-change facts, route via `lib/status-router`; malformed records become named error entries, never fatal |

Also: `quickstart.service.ts` (init + agentSync), `agent-triggers.service.ts` + `trigger-localization.ts`, `measure.service.ts`, `print-template.service.ts`, `config-example.service.ts`, `knowledge.service.ts` (whole-base README/index generation, no longer CLI-registered).

## Public API

- `execute(options)` per service → typed `Result` (one per command)
- `executeFinalize` / `executeForChange` / `executeWrite` — archive post-judgment step; change-driven knowledge update; trigger scaffold write-back
- `resolveChange(...)` — shared change selector (zero/ambiguous → `PrerequisiteError`; traversal names refused pre-probe)
- `computeUnlocalizedSkills(config)` — single-source fill-missing skill set (agent-sync hint + agent-triggers)
- `recountFeatureSpecCounters(content)` — frontmatter `story_count`/`req_count` from the final body (`## US-`+`### US-`; `#### REQ-` outside Deprecated)

## Dependencies

**Depends on:** `lib` (config, scanner, template, fs-utils, yaml-utils, station engines), `types` (schemas, errors, station contracts)
**Used by:** `cli` (each command calls one service), `tests`

## Modification Guide

1. **Add a service** — create `{name}.service.ts` exporting `execute()`; add command + formatter + unit test.
2. **Add a station service** — judgment arrives as structured input (`types/station.ts`); the service does only the deterministic write, the decision lives in a `lib` engine.
3. **Change a Result type** — update interface → CLI formatter → unit-test assertions.

## Pitfalls

- Use `atomicWrite()` (never raw `writeFileSync`) + `ContentMerger` for any file with user sections.
- metadata.yaml is built + serialized, never templated; status advances forward-only via `isStatusBefore`; every station does metadata I/O ONLY via `lib/change-metadata` (never re-cast `doc.toJS()`). `archive.service` skips that validation deliberately — the terminal station must absorb pre-schema records the earlier stations reject (its floor is the archive skill's Entry Gate).
- archive: FUNCTION replacers (verbatim `$`), path-contained `**Feature:**` slug, no-clobber `feature-map.yaml`; NO auto knowledge-update (skill + verify prompt own it). `executeFinalize` refuses while summary.md still lacks `## Review & Verify` — else the history copy captures the scaffold and the counters predate graduation.
- `updateModuleReadme` is CREATE-ONLY: module knowledge lives inside the `prospec:auto` block, so re-rendering it from the mechanical scan context guts authored content (why archive was decoupled). `updateModuleMap` merges through the yaml Document (comments + untouched descriptions survive) and no-ops when nothing changed — a pass-through never reflows the curated file.
- Refuse before writing, never after (each leaves the file byte-identical): `verify record` self-reads its machine dimensions from `prospec-report.json` and REFUSES a stale `change_digest` (regenerate after any edit); `change status` refuses gate-owned targets (`GATE_OWNED_STATUSES`) and backward jumps (`InvalidTransitionError` lists the legal forward set); `agent triggers --write` inserts only MISSING keys, re-validating the document BEFORE any byte reaches disk.
- `mcp.service` resources are per-request reads, never cached; diagnostics to stderr (stdout is the JSON-RPC channel).
- check.service keeps every side effect behind a flag (the pure path is read-only, byte-reproducible); the change digest is computed ONCE for both provenance collectors; `--record-tests` verifies every precondition BEFORE spawning, records the POST-run digest, then merges `test_provenance` into a FRESHLY re-read document (a mid-run edit survives; a file that stops validating records nothing).

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
