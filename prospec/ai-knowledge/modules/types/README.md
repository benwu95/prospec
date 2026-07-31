# types

> Zod schemas, errors, and frozen registries — the leaf type layer every module imports (17 files)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `change.ts` | Change metadata contract — loose read + strict build views (incl. `NewQualityLogEntrySchema`), `BareModuleNameSchema`, CHANGE_STATUSES/SCALES, GATE/DIMENSION_RESULTS, VERIFY_GRADES |
| `config.ts` | `ProspecConfigSchema` (`.prospec.yaml`, `.loose()`), `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`/`KnowledgeSizeBudget`, `KNOWLEDGE_STRATEGIES`, VALID_AGENTS, `test_command` |
| `constitution.ts` | `ConstitutionRule` (RFC-2119 severity + name/description/rationale/check); `LanguageScope` (path sets plus BOTH exception directions — `namedExceptions` / `englishExceptions`) |
| `drift-report.ts` | `DriftReportSchema` (+ optional `change_digest` freshness stamp), `DRIFT_CHECK_IDS` (14 frozen), Constitution rule inventory; `knowledge_health.modules[]` carries the additive optional `last_sub_module_commit` (omitted, never null-filled) |
| `errors.ts` | `ProspecError` base + 16 error subclasses (incl. `InvalidTransitionError`) |
| `knowledge.ts` | `index.md` columns (INDEX_TABLE_COLUMNS) + header/separator helpers |
| `mcp.ts` | `MCP_RESOURCE_URIS` (8, frozen), MCP_TOOL_NAMES, tool I/O zod shapes |
| `module-map.ts` | `ModuleMapSchema`, `ModuleEntry`, `ModuleRelationships` |
| `skill.ts` | SKILL_DEFINITIONS (17 skills, each ≥3 collision-free triggers), AGENT_CONFIGS (4 agents, each declaring `HarnessCapabilities`), `intersectCapabilities` |
| `station.ts` | Station I/O contracts — `ReviewFindingSchema`, `VERIFY_DIMENSIONS` (+ machine/judgment split), `LessonInputSchema`, `VALIDATE_KINDS` |

Also: `conventions.ts` (CORE_CONVENTIONS, INIT_DOC_REGISTRY), `escaped-defect.ts` (per-gate escaped-defect report), `feature-map.ts`, `measurement.ts`, `spec.ts`, `status.ts` (SDD station-routing contract — `SDD_STATIONS` order incl. the no-status design/review stations, `STATION_SKILLS`, `ChangeRoute*`/`StatusReport`), `version.ts` (`PROSPEC_VERSION` + `MINIMUM_CLI_VERSION`, the skills' CLI probe floor).

## Public API

- `ChangeMetadataSchema` / `NewChangeMetadataSchema` / `isStatusBefore` — metadata read (loose) + build (strict) views
- `ProspecConfigSchema` / `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` — `.prospec.yaml` validation + size thresholds
- `SKILL_DEFINITIONS` / `AGENT_CONFIGS` / `intersectCapabilities` — 17 skills + 4 agents (typed `Record<ValidAgent, ...>`); harness capability flags + their conservative AND
- `DriftReportSchema` / `DRIFT_CHECK_IDS` — drift report schema + 14 frozen check ids
- `ReviewFindingSchema` / `VERIFY_DIMENSIONS` / `LessonInputSchema` / `VALIDATE_KINDS` — station I/O: reviewer findings, the 5+1 dimension registry, lesson upsert, validate kinds
- `MeasurementReportSchema` / `MCP_RESOURCE_URIS` — offline size/measure reports; 8 frozen URIs + tool I/O shapes
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
5. **Add an agent** — add to `VALID_AGENTS`; the typed `AGENT_CONFIGS` map forces a matching entry, `capabilities` included (survey the vendor docs and record the source inline).
6. **Add a verify dimension** — extend `VERIFY_DIMENSIONS` (`station.ts`) with its `adjudicator`; `MACHINE_/JUDGMENT_DIMENSION_NAMES` derive from it, so never hand-list either set.

## Ripple Effects

- Imported everywhere: a schema change ripples to every consumer — config → `lib/config.ts`, errors → `cli/formatters/error-output.ts`, skills → `agent-sync.service.ts`.

## Pitfalls

- `.optional()` → `T | undefined`, `.default()` → `T`; a new required field breaks existing `.prospec.yaml`.
- `ChangeMetadataSchema` is loose at every level (reads never strip unmodeled keys), but `z.infer` of it gains an index signature that kills tsc's excess-property check — build against strict `NewChangeMetadata`, `satisfies` each spread body. `DIMENSION_RESULTS` is likewise wider than the gate three-state (`not-applicable` and `not-adjudicated` are dimension-only).
- `DRIFT_CHECK_IDS`, `MCP_RESOURCE_URIS`, `drift-report` knowledge_health are FROZEN — extend additively, never reorder/remove. The per-id comments are behavioral claims read as the registry's source of truth — keep them matching the evaluators (both provenance checks' backfill exemptions are draft-gated; a recorded non-zero exit is never exempt); a stale claim here has twice reopened a closed bypass.
- `SKILL_DEFINITIONS`/`AGENT_CONFIGS` counts are asserted in contract tests — update the test (and `VALID_AGENTS`) too.
- `station.ts` is the judgment↔mechanics boundary: everything it models is LLM input, everything downstream of a successful parse is deterministic. `machine` dimensions are self-sourced by the CLI from `prospec-report.json` — never an agent's relayed verdict; 3/5 is registered `judgment` (machine rule inventory, judged violations).
- `MINIMUM_CLI_VERSION` (`version.ts`) is the skills' probe floor, NOT the package version — bump it only when a skill starts calling a CLI surface a newer version added, never as a release chore.
- `feature-map.ts` is shape-only — slug/module-map checks live in the lib loader, not here.
- `INIT_DOC_REGISTRY` is pinned by an init⇄registry equality test; resolve `root: 'knowledge'` via `resolveBasePaths()`. `test_provenance` is deliberately outside the metadata required-field floor.

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
