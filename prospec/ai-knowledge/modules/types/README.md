# Contract Registry

> Zod schemas, errors, frozen registries — the leaf layer every module imports (17 files)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `change.ts` | Change metadata contract — loose read + strict build views (incl. `NewQualityLogEntrySchema`), `BareModuleNameSchema`, `issue`; its registry half (statuses, scales, artifact matrix, gate/grade enums) is in the sub-module |
| `config.ts` | `ProspecConfigSchema` (`.prospec.yaml`, `.loose()`), `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`/`KnowledgeSizeBudget` (7 per-surface thresholds), `KnowledgeSizeKind`, `test_command` |
| `constitution.ts` | `ConstitutionRule` (RFC-2119 severity + name/description/rationale/check); `LanguageScope` (path sets plus BOTH exception directions — `namedExceptions` / `englishExceptions`) |
| `drift-report.ts` | `DriftReportSchema` (+ optional `change_digest` freshness stamp) — its frozen id list and `knowledge_health` shape are in the sub-module |
| `errors.ts` | `ProspecError` base + 16 error subclasses (incl. `InvalidTransitionError`) |
| `knowledge.ts` | `index.md` columns (INDEX_TABLE_COLUMNS) + header/separator helpers — reorderable in one edit, `INDEX_COLUMN` pinned to its order by a contract test |
| `module-map.ts` | `ModuleMapSchema`, `ModuleEntry`, `ModuleRelationships` |
| `station.ts` | Station I/O schemas — `ReviewFindingSchema`, `LessonInputSchema` (its dimension/kind registries are in the sub-module) |

Also: `escaped-defect.ts`, `feature-map.ts`, `measurement.ts`, `spec.ts`, `version.ts` (`PROSPEC_VERSION` + `MINIMUM_CLI_VERSION`).

## Public API

- `ChangeMetadataSchema` / `NewChangeMetadataSchema` / `isStatusBefore` — metadata read (loose) + build (strict) views; lifecycle ordering
- `ProspecConfigSchema` / `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` — `.prospec.yaml` validation + size thresholds
- `DriftReportSchema` / `MeasurementReportSchema` — drift report + offline measurement schemas
- `ReviewFindingSchema` / `LessonInputSchema` — station I/O: reviewer findings, lesson upsert
- `INDEX_TABLE_COLUMNS` — the canonical `index.md` column schema every emitter and parser derives from
- `ProspecError` — base error (code + suggestion, optional `cause`)

## Dependencies

**Depends on:** `zod` only — leaf module, zero internal deps
**Used by:** `lib`, `services`, `cli`, `tests` — imported everywhere

## Modification Guide

1. **Add a schema field** — use `.optional()`/`.default()` so existing YAML still validates.
2. **Add an error class** — extend `ProspecError` with `code` (UPPER_SNAKE) + `suggestion`.
3. **Add or extend a registry** (skill, agent, drift check id, scale, verify dimension, audit scope) — see [Frozen Registries](./frozen-registries.md).
4. **Add an index column** — one edit to `INDEX_TABLE_COLUMNS`; header, separator and `INDEX_COLUMN` indices follow.

## Ripple Effects

- Imported everywhere: a schema change ripples to every consumer — config → `lib/config.ts`, errors → `cli/formatters/error-output.ts`. Registry ripple is in the sub-module.

## Pitfalls

- `.optional()` → `T | undefined`, `.default()` → `T`; a new required field breaks existing `.prospec.yaml`. A budget threshold needs BOTH `TokenBudgetSchema` and `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` — the resolver reads the default's keys, so a schema-only field parses then is ignored (a key-set equality test pins it).
- `ChangeMetadataSchema` is loose at every level (reads never strip unmodeled keys), but `z.infer` of it gains an index signature that kills tsc's excess-property check — build against strict `NewChangeMetadata`, `satisfies` each spread body.
- `ReviewFindingSchema.id` is optional but never decorative: omitting it buys location+lens keying against pre-round rows only, so the schema's doc comment is where that cost is stated for the caller.
- `MINIMUM_CLI_VERSION` (`version.ts`) is the skills' probe floor, NOT the package version — bump it only when a skill starts calling a CLI surface a newer version added, never as a release chore.
- `feature-map.ts` is shape-only — slug/module-map checks live in the lib loader, not here.
- `test_provenance` is deliberately outside the metadata required-field floor.

## Sub-Modules

- [Frozen Registries](./frozen-registries.md) — the closed sets every layer derives from, and what an addition obliges

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
