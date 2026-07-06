# services

> Business logic — one `execute(options) → Promise<Result>` service per command, plus shared helpers (16 files)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `init.service.ts` | Scaffold config + Constitution + AI Knowledge; per-file skip-if-exists; writes `.prospec.yaml` last |
| `quickstart.service.ts` | Orchestrate init + agentSync (no LLM work) |
| `upgrade.service.ts` | Record `version`, re-sync, back-fill missing init docs (never overwrite), build migration report |
| `agent-sync.service.ts` | Sync skills + references + entry configs; synthesize triggers; sweep orphan skill dirs; merge user blocks |
| `knowledge.service.ts` | Generate module READMEs + root `index.md` (Recipe-First, ContentMerger) |
| `knowledge-init.service.ts` | Initial scan → raw-scan.md + module-map.yaml + skeletons |
| `knowledge-update.service.ts` | Delta-spec-driven incremental README/index update; index table rendered from `module-map.yaml` |
| `raw-scan.service.ts` | Deterministic raw-scan.md — git-tracked scan, 11-language manifest detection |
| `archive.service.ts` | Archive + Feature-Spec spec-sync + product.md + `feature-map.yaml` (`syncFeatureMap` sole writer); runs NO auto knowledge-update |
| `change-story/plan/tasks.service.ts` | Scaffold proposal/plan/delta-spec/tasks; advance status forward-only (`--force` guarded) |
| `change-resolver.ts` | Shared `resolveChange()` — pick the target change (explicit/auto/prompt/quiet) |
| `check.service.ts` | Drift-check orchestration — collectors → evaluators → report; `--json`/`--init-ci`/`--record-review` |
| `measure.service.ts` | Read + Zod-validate the measurement report (read-only; `--offline` size report) |
| `mcp.service.ts` | Read-only MCP server — `buildMcpServer()` registers 8 resources + 2 tools, per-request reads |

## Public API

- `execute(options)` per service (`init`/`quickstart`/`upgrade`/`agentSync`/`knowledge`/`knowledgeUpdate`/`archive`/`check`/`measure`/`mcp`/`change-*`) → typed `Result`
- `resolveChange(cwd, explicit, quiet, msg)` — shared change selector (zero/ambiguous → `PrerequisiteError`)
- `generateRawScan(options)` — deterministic raw-scan core (shared by knowledge-init + upgrade)
- `buildMcpServer(ctx)` — assemble the MCP server transport-free

## Dependencies

**Depends on:** `lib` (config, scanner, template, fs-utils, content-merger, yaml-utils, detector), `types` (schemas, errors)
**Used by:** `cli` (each command calls one service), `tests`

## Modification Guide

1. **Add a service** — create `{name}.service.ts` exporting `execute()`; add matching CLI command + formatter + unit test.
2. **Change a Result type** — update the interface → its CLI formatter → unit-test assertions.
3. **Change knowledge output** — edit `knowledge.service.ts`; context keys must match `module-readme.hbs` variables.
4. **Change archive/spec-sync** — edit `archive.service.ts`; affects Feature Specs, product.md, `feature-map.yaml`.

## Ripple Effects

- A service `Result` type change ripples to its CLI formatter; `archive.service` writes to `specs/` + `feature-map.yaml`, affecting verify and planning.

## Pitfalls

- Always use `atomicWrite()` (never raw `writeFileSync`) and `ContentMerger` for any file with user sections.
- Template context keys have no compile-time validation — a typo yields silent empty output.
- change metadata.yaml is built + `stringifyYaml()`-ed, never templated; status advances forward-only via `isStatusBefore`.
- archive: FUNCTION replacers (verbatim `$`), path-contained `**Feature:**` slug, no-clobber `feature-map.yaml`, and NO auto knowledge-update (owned by the skill + verify prompt).
- `mcp.service` stdout is the JSON-RPC channel — diagnostics to stderr only; resources are per-request reads, never cached.

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
