# types

> Zod schemas, errors, and frozen registries — the leaf type layer every module imports (17 files)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `change.ts` | Change metadata contract — loose read + strict build views (incl. `NewQualityLogEntrySchema`), `BareModuleNameSchema`, CHANGE_STATUSES/SCALES, `SCALE_FORBIDDEN_ARTIFACTS` + `PROVENANCE_AUDITED_STATUSES`/`isProvenanceAudited` (the lifecycle doc's artifact matrix and provenance audit scope, executable), GATE/DIMENSION_RESULTS, VERIFY_GRADES |
| `config.ts` | `ProspecConfigSchema` (`.prospec.yaml`, `.loose()`), `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`/`KnowledgeSizeBudget` (7 per-surface thresholds), `KnowledgeSizeKind`＋`KNOWLEDGE_SIZE_RULES`, `KNOWLEDGE_STRATEGIES`, VALID_AGENTS, `test_command` |
| `constitution.ts` | `ConstitutionRule` (RFC-2119 severity + name/description/rationale/check); `LanguageScope` (path sets plus BOTH exception directions — `namedExceptions` / `englishExceptions`) |
| `drift-report.ts` | `DriftReportSchema` (+ optional `change_digest` freshness stamp), `DRIFT_CHECK_IDS` (16 frozen), Constitution rule inventory; `knowledge_health.modules[]` carries the additive optional `last_sub_module_commit` (omitted, never null-filled) |
| `errors.ts` | `ProspecError` base + 16 error subclasses (incl. `InvalidTransitionError`) |
| `knowledge.ts` | `index.md` columns (INDEX_TABLE_COLUMNS) + header/separator helpers |
| `mcp.ts` | `MCP_RESOURCE_URIS` (8, frozen), MCP_TOOL_NAMES, tool I/O zod shapes |
| `module-map.ts` | `ModuleMapSchema`, `ModuleEntry`, `ModuleRelationships` |
| `skill.ts` | SKILL_DEFINITIONS (17 skills, each ≥3 collision-free triggers), AGENT_CONFIGS (4 agents, each declaring `HarnessCapabilities`), `intersectCapabilities` |
| `station.ts` | Station I/O contracts — `ReviewFindingSchema`, `VERIFY_DIMENSIONS` (+ machine/judgment split), `LessonInputSchema`, `VALIDATE_KINDS` |

Also: `conventions.ts` (CORE_CONVENTIONS, INIT_DOC_REGISTRY), `escaped-defect.ts`, `feature-map.ts`, `measurement.ts`, `spec.ts`, `status.ts` (SDD station-routing contract — `SDD_STATIONS` order incl. the no-status design station and the `promote` backfill entry, `STATION_SKILLS`, `ChangeRoute*`/`StatusReport`), `version.ts` (`PROSPEC_VERSION` + `MINIMUM_CLI_VERSION`).

## Public API

- `ChangeMetadataSchema` / `NewChangeMetadataSchema` / `isStatusBefore` / `forbiddenArtifacts` — metadata read (loose) + build (strict) views; lifecycle order and per-scale artifact contract
- `ProspecConfigSchema` / `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` — `.prospec.yaml` validation + size thresholds
- `SKILL_DEFINITIONS` / `AGENT_CONFIGS` / `intersectCapabilities` — 17 skills + 4 agents (typed `Record<ValidAgent, ...>`); harness capability flags + their conservative AND
- `DriftReportSchema` / `DRIFT_CHECK_IDS` — drift report schema + 16 frozen check ids
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
   **Add a scale** — `CHANGE_SCALES` + its `SCALE_FORBIDDEN_ARTIFACTS` row (`satisfies` forces it) + the lifecycle doc's matrix (both copies).
   **Change what the provenance gates audit** — `PROVENANCE_AUDITED_STATUSES` + the lifecycle doc's audit-scope table (both copies); the evaluators read the registry, never a literal.
5. **Add an agent** — add to `VALID_AGENTS`; the typed `AGENT_CONFIGS` map forces a matching entry, `capabilities` included (survey the vendor docs and record the source inline).
6. **Add a verify dimension** — extend `VERIFY_DIMENSIONS` (`station.ts`) with its `adjudicator`; `MACHINE_/JUDGMENT_DIMENSION_NAMES` derive from it, so never hand-list either set.

## Ripple Effects

- Imported everywhere: a schema change ripples to every consumer — config → `lib/config.ts`, errors → `cli/formatters/error-output.ts`, skills → `agent-sync.service.ts`.

## Pitfalls

- `.optional()` → `T | undefined`, `.default()` → `T`; a new required field breaks existing `.prospec.yaml`. A budget threshold needs BOTH `TokenBudgetSchema` and `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` — the resolver reads the default's keys, so a schema-only field parses then is ignored (a key-set equality test pins it). `KNOWLEDGE_SIZE_RULES` is `satisfies`-closed, so an unruled kind is a compile error.
- `ChangeMetadataSchema` is loose at every level (reads never strip unmodeled keys), but `z.infer` of it gains an index signature that kills tsc's excess-property check — build against strict `NewChangeMetadata`, `satisfies` each spread body. `DIMENSION_RESULTS` is likewise wider than the gate three-state (`not-applicable` and `not-adjudicated` are dimension-only).
- `DRIFT_CHECK_IDS`, `MCP_RESOURCE_URIS`, `drift-report` knowledge_health are FROZEN — extend additively, never reorder/remove. The per-id comments are behavioral claims read as the registry's source of truth — keep them matching the evaluators (every provenance check's backfill exemption is draft-gated; a recorded non-zero exit is never exempt); a stale claim here has twice reopened a closed bypass.
- `SKILL_DEFINITIONS`/`AGENT_CONFIGS` counts are asserted in contract tests — update the test (and `VALID_AGENTS`) too.
- `station.ts` is the judgment↔mechanics boundary: everything it models is LLM input, everything downstream of a successful parse is deterministic. `machine` dimensions are self-sourced by the CLI from `prospec-report.json` — never an agent's relayed verdict; 3/5 is registered `judgment` (machine rule inventory, judged violations). `ReviewFindingSchema.id` is optional but never decorative: omitting it buys location+lens keying against pre-round rows only, so the schema's doc comment is where that cost is stated for the caller.
- `MINIMUM_CLI_VERSION` (`version.ts`) is the skills' probe floor, NOT the package version — bump it only when a skill starts calling a CLI surface a newer version added, never as a release chore.
- `feature-map.ts` is shape-only — slug/module-map checks live in the lib loader, not here.
- `INIT_DOC_REGISTRY` is pinned by an init⇄registry equality test; resolve `root: 'knowledge'` via `resolveBasePaths()`. `test_provenance` is deliberately outside the metadata required-field floor.

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
