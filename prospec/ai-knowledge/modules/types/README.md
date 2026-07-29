# types

> Zod schemas, errors, and frozen registries — the leaf type layer every module imports (16 files)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `change.ts` | Change metadata contract — loose read + strict build views, `BareModuleNameSchema`, CHANGE_STATUSES/SCALES, GATE/DIMENSION_RESULTS, VERIFY_GRADES |
| `config.ts` | `ProspecConfigSchema` (`.prospec.yaml`, `.loose()`), `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`/`KnowledgeSizeBudget`, `KNOWLEDGE_STRATEGIES`, VALID_AGENTS, `test_command` |
| `constitution.ts` | `ConstitutionRule` (RFC-2119 severity + name/description/rationale/check); `LanguageScope` |
| `drift-report.ts` | `DriftReportSchema`, `DRIFT_CHECK_IDS` (13 frozen), Constitution rule inventory |
| `errors.ts` | `ProspecError` base + 15 error subclasses |
| `knowledge.ts` | `index.md` columns (INDEX_TABLE_COLUMNS) + header/separator helpers |
| `mcp.ts` | `MCP_RESOURCE_URIS` (8, frozen), MCP_TOOL_NAMES, tool I/O zod shapes |
| `module-map.ts` | `ModuleMapSchema`, `ModuleEntry`, `ModuleRelationships` |
| `skill.ts` | SKILL_DEFINITIONS (17 skills, each ≥3 collision-free triggers), AGENT_CONFIGS (4 agents) |

Also: `conventions.ts` (CORE_CONVENTIONS, INIT_DOC_REGISTRY), `escaped-defect.ts` (per-gate escaped-defect report), `feature-map.ts`, `measurement.ts`, `spec.ts`, `status.ts` (SDD station-routing contract — `SDD_STATIONS` workflow order incl. the no-status design/review stations, `STATION_SKILLS`, `ChangeRouteFacts`/`ChangeRoute`/`StatusReport`), `version.ts`.

## Public API

- `ChangeMetadataSchema` / `NewChangeMetadataSchema` / `isStatusBefore` — metadata read (loose) + build (strict) views
- `ProspecConfigSchema` / `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` — `.prospec.yaml` validation + size thresholds
- `SKILL_DEFINITIONS` / `AGENT_CONFIGS` — 17 skills + 4 agents (typed `Record<ValidAgent, ...>`)
- `DriftReportSchema` / `DRIFT_CHECK_IDS` — drift report schema + 13 frozen check ids
- `MeasurementReportSchema` / `SizeReportSchema` — provider-neutral + offline size report
- `MCP_RESOURCE_URIS` / `SearchModulesInputShape` — 8 frozen URIs, tool I/O shapes
- `INIT_DOC_REGISTRY` / `CORE_CONVENTIONS` / `INDEX_TABLE_COLUMNS` — init docs, L0 conventions, index columns
- `ProspecError` — base error (code + suggestion, optional `cause`)

## Dependencies

**Depends on:** `zod` only — leaf module, zero internal deps
**Used by:** `lib`, `services`, `cli`, `tests` — imported everywhere

## Modification Guide

1. **Add a schema field** — use `.optional()`/`.default()` so existing YAML still validates.
2. **Add an error class** — extend `ProspecError` with `code` (UPPER_SNAKE) + `suggestion`.
3. **Add a skill** — append to `SKILL_DEFINITIONS`, then bump the count in `skill-format.test.ts`.
4. **Add a drift check id** — append to `DRIFT_CHECK_IDS` (frozen, additive) → wire it in drift services.
5. **Add an agent** — add to `VALID_AGENTS`; the typed `AGENT_CONFIGS` map forces a matching entry.

## Ripple Effects

- Imported everywhere: a schema change ripples to every consumer — config → `lib/config.ts`, errors → `cli/formatters/error-output.ts`, skills → `agent-sync.service.ts`.

## Pitfalls

- `.optional()` → `T | undefined`, `.default()` → `T`; a new required field breaks existing `.prospec.yaml`.
- `ChangeMetadataSchema` is loose at every level (reads never strip unmodeled keys), but `z.infer` of a loose schema gains an index signature that kills tsc's excess-property check — build against strict `NewChangeMetadata`, `satisfies` each spread body. `DIMENSION_RESULTS` is likewise wider than the gate three-state (`not-applicable` and `not-adjudicated` are dimension-only).
- `DRIFT_CHECK_IDS`, `MCP_RESOURCE_URIS`, `drift-report` knowledge_health are FROZEN — extend additively, never reorder/remove.
- `SKILL_DEFINITIONS`/`AGENT_CONFIGS` counts are asserted in contract tests — update the test (and `VALID_AGENTS`) too.
- `feature-map.ts` is shape-only — slug/module-map checks live in the lib loader, not here.
- `INIT_DOC_REGISTRY` is pinned by an init⇄registry equality test; resolve `root: 'knowledge'` via `resolveBasePaths()`. `test_provenance` is deliberately outside the metadata required-field floor.

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
