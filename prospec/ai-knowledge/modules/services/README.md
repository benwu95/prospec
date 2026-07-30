# services

> Business logic — one `execute(options) → Promise<Result>` per command + shared helpers (28 files)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `init.service.ts` / `upgrade.service.ts` | Scaffold config + Constitution + AI Knowledge (per-file skip-if-exists, `.prospec.yaml` last); upgrade records `version`, re-syncs, back-fills missing init docs (never overwrite) + migration report (stale-Language-Policy signal) |
| `archive.service.ts` | Archive + spec-sync (Feature Spec / product.md / `feature-map.yaml`, `syncFeatureMap` sole writer); `executeFinalize` = post-judgment history copy + counter recount; `dryRun` short-circuits every write and returns `planned` |
| `agent-sync.service.ts` | Sync skills + `getSkillReferences` refs + entry configs; triggers; sweep orphans; merge user blocks; per-group capability intersection |
| `knowledge-init` + `raw-scan` / `knowledge-update.service.ts` | Initial scan → raw-scan.md (11-lang manifests) + module-map.yaml + skeletons; delta-spec-driven index/module-map refresh (`executeForChange`); README skeleton for NEW modules only (`readmePending` flags the rest) |
| `change-*.service.ts` + `change-resolver.ts` | Scaffold proposal/plan/delta-spec/tasks (forward-only) plus `log`/`status`/`scale`/`progress` bookkeeping; metadata I/O via `lib/change-metadata` |
| `verify-record` / `review-merge` / `learn` / `validate.service.ts` | Station bookkeeping — S/A/B/C/D grade (S/A appends quality_log AND advances `status: verified` in one write); cumulative review.md table; ledger upsert + scoring + TTL; artifact verdicts |
| `check.service.ts` | Drift-check orchestration — collectors → evaluators → report (stamps `change_digest`); non-check modes (json / init-ci / record-review / record-tests / escaped-defects) |
| `mcp.service.ts` | Read-only MCP server — `buildMcpServer()`: 8 resources + 2 tools, per-request reads |
| `status.service.ts` | Read-only SDD routing — scan `.prospec/changes/`, collect per-change facts, route via `lib/status-router`; malformed records become named error entries, never fatal |

Also: `quickstart` (init + agentSync), `agent-triggers` + `trigger-localization`, `measure`, `print-template`, `config-example`. README/index **content** is skill judgment (`/prospec-knowledge-generate`) — no service generates it.

## Public API

- `execute(options)` per service → typed `Result`
- `executeFinalize` / `executeForChange` / `executeWrite` — archive post-judgment; change-driven knowledge update; trigger write-back
- `resolveChange(...)` — change selector (zero/ambiguous → `PrerequisiteError`; traversal names refused pre-probe)
- `computeUnlocalizedSkills(config)` — fill-missing skill set (agent-sync hint + agent-triggers)
- `syncToFeatureSpecs(...)` → `SpecSyncResult` — `files` + `pendingConvergence` (stderr worklist, never fails)
- `recountFeatureSpecCounters(content)` — frontmatter `story_count`/`req_count` from the final body (`## US-`+`### US-`; `#### REQ-` outside Deprecated)

## Dependencies

**Depends on:** `lib` (config, scanner, template, fs-utils, yaml-utils, station engines), `types` (schemas, errors, contracts)
**Used by:** `cli` (each command calls one service), `tests`

## Modification Guide

1. **Add a service** — create `{name}.service.ts` exporting `execute()`; add command + formatter + unit test.
2. **Add a station service** — judgment arrives as structured input (`types/station.ts`); the service does only the deterministic write, the decision lives in a `lib` engine.
3. **Change a Result type** — interface → CLI formatter → unit-test assertions.

## Pitfalls

- Use `atomicWrite()` (never `writeFileSync`) + `ContentMerger` for any file with user sections.
- metadata.yaml is built + serialized, never templated; status advances forward-only via `isStatusBefore`; metadata I/O ONLY via `lib/change-metadata` (never re-cast `doc.toJS()`). `archive.service` skips that validation deliberately — the terminal station must absorb pre-schema records the earlier stations reject (floor: the archive skill's Entry Gate).
- archive: FUNCTION replacers (verbatim `$`), path-contained `**Feature:**` slug, no-clobber `feature-map.yaml`; NO auto knowledge-update (skill + verify prompt own it). `executeFinalize` refuses while summary.md lacks `## Review & Verify` — else the history copy captures the scaffold and the counters predate graduation.
- spec-sync NEVER blanks an authored REQ body — only a `**Spec:**` block replaces one (ADDED may fall back to Description+AC); everything else survives byte-identical and returns in `pendingConvergence` (incl. REMOVED REQs whose active section still stands).
- `updateModuleReadme` is CREATE-ONLY: module knowledge lives in the `prospec:auto` block, so re-rendering from the mechanical scan context guts authored content (why archive was decoupled). `updateModuleMap` merges through the yaml Document (comments + untouched descriptions survive) and no-ops when nothing changed — never reflows the curated file.
- Refuse before writing, never after (the file stays byte-identical): `verify record` self-reads its machine dimensions from `prospec-report.json` and REFUSES a stale `change_digest`; `change status` refuses gate-owned targets (`GATE_OWNED_STATUSES`) and backward jumps (error lists the legal forward set); `agent triggers --write` inserts only MISSING keys, re-validating BEFORE any byte reaches disk.
- `mcp.service` resources are per-request reads, never cached; diagnostics to stderr (stdout is the JSON-RPC channel).
- check.service keeps every side effect behind a flag (the pure path is read-only, byte-reproducible); one change digest serves both provenance collectors; `--record-tests` checks preconditions BEFORE spawning, records the POST-run digest, then merges `test_provenance` into a FRESHLY re-read document (a mid-run edit survives; a file that stops validating records nothing).

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
