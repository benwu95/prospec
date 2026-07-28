# services

> Business logic — one `execute(options) → Promise<Result>` service per command, plus shared helpers (20 files)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `init.service.ts` | Scaffold config + Constitution + AI Knowledge; per-file skip-if-exists; writes `.prospec.yaml` last |
| `quickstart.service.ts` | Orchestrate init + agentSync (no LLM work) |
| `upgrade.service.ts` | Record `version`, re-sync, back-fill missing init docs (never overwrite), build migration report (+ stale-Language-Policy signal) |
| `agent-sync.service.ts` | Sync skills + `getSkillReferences` refs + entry configs; triggers; sweep orphans; merge user blocks |
| `knowledge.service.ts` | Generate module READMEs + root `index.md` (Recipe-First, ContentMerger) |
| `knowledge-init.service.ts` + `raw-scan.service.ts` | Initial scan → raw-scan.md (11-lang manifests) + module-map.yaml + skeletons |
| `knowledge-update.service.ts` | Delta-spec-driven incremental README/index update; index table rendered from `module-map.yaml` |
| `archive.service.ts` | Archive + spec-sync to Feature-Spec/product.md/`feature-map.yaml` (`syncFeatureMap` sole writer) |
| `change-*.service.ts` + `change-resolver.ts` | Scaffold proposal/plan/delta-spec/tasks (forward-only); metadata I/O via `lib/change-metadata` |
| `check.service.ts` | Drift-check orchestration — collectors → evaluators → report; `--json`, `--init-ci`, `--record-review` |
| `mcp.service.ts` | Read-only MCP server — `buildMcpServer()`: 8 resources + 2 tools, per-request reads |

Also: `agent-triggers.service.ts` + `trigger-localization.ts` (fill-missing trigger scaffold), `config-example.service.ts`.

## Public API

- `execute(options)` per service (`init`/`quickstart`/`upgrade`/`agentSync`/`knowledge*`/`archive`/`check`/`measure`/`mcp`/`change-*`) → typed `Result`
- `computeUnlocalizedSkills(config)` — single-source fill-missing skill set (agent-sync hint + agent-triggers)
- `resolveChange(cwd, explicit, quiet, msg)` — shared change selector (zero/ambiguous → `PrerequisiteError`)
- `generateRawScan(options)` — deterministic raw-scan core (shared by knowledge-init + upgrade)
- `buildMcpServer(ctx)` — assemble the MCP server transport-free

## Dependencies

**Depends on:** `lib` (config, scanner, template, fs-utils, content-merger, yaml-utils), `types` (schemas, errors)
**Used by:** `cli` (each command calls one service), `tests`

## Modification Guide

1. **Add a service** — create `{name}.service.ts` exporting `execute()`; add command + formatter + unit test.
2. **Change a Result type** — update interface → CLI formatter → unit-test assertions.
3. **Change knowledge output** — edit `knowledge.service.ts` (keys must match `module-readme.hbs` variables).
4. **Change archive/spec-sync** — edit `archive.service.ts` (affects Feature Specs, product.md, `feature-map.yaml`).

## Ripple Effects

- A service `Result` type change ripples to its CLI formatter; `archive.service` writes `specs/` + `feature-map.yaml`, affecting verify and planning.

## Pitfalls

- Always use `atomicWrite()` (never raw `writeFileSync`) and `ContentMerger` for any file with user sections.
- change metadata.yaml is built + serialized, never templated; status advances forward-only via `isStatusBefore`. change-story/plan/tasks + `check --record-review` do metadata I/O ONLY via `lib/change-metadata` — never re-cast `doc.toJS()`. `archive.service` skips that validation on purpose: as the terminal station it must absorb pre-schema records the earlier stations now reject (its floor is the archive skill's Entry Gate).
- archive: FUNCTION replacers (verbatim `$`), path-contained `**Feature:**` slug, no-clobber `feature-map.yaml`; NO auto knowledge-update (owned by the skill + verify prompt).
- `mcp.service` stdout is the JSON-RPC channel — diagnostics to stderr only; resources are per-request reads, never cached.

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
