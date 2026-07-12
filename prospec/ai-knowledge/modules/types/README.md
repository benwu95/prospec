# types

> Zod schemas, errors, and frozen registries — the leaf type layer every module imports (14 files)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `change.ts` | `ChangeMetadataSchema`, CHANGE_STATUSES/SCALES, GATE_RESULTS/VERIFY_GRADES, `isStatusBefore` |
| `config.ts` | `ProspecConfigSchema` (`.prospec.yaml`, top-level `.loose()`), `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`/`KnowledgeSizeBudget`/`TokenBudgetSchema`, `KNOWLEDGE_STRATEGIES`, VALID_AGENTS |
| `constitution.ts` | `ConstitutionRule` — RFC-2119 severity + name/description/rationale/check |
| `conventions.ts` | Convention-doc registries — CORE_CONVENTIONS, INIT_DOC_REGISTRY |
| `drift-report.ts` | `DriftReportSchema`, `DRIFT_CHECK_IDS` (11 frozen) |
| `errors.ts` | `ProspecError` base + 13 error subclasses |
| `feature-map.ts` | `FeatureMapSchema` (feature→module index), FEATURE_STATUSES — shape-only |
| `knowledge.ts` | `index.md` column schema (INDEX_TABLE_COLUMNS) + table header/separator helpers |
| `mcp.ts` | `MCP_RESOURCE_URIS` (8, frozen), MCP_TOOL_NAMES, tool I/O zod shapes |
| `measurement.ts` | `MeasurementReportSchema` + offline `SizeReportSchema` |
| `module-map.ts` | `ModuleMapSchema`, `ModuleEntry`, `ModuleRelationships` |
| `skill.ts` | SKILL_DEFINITIONS (17 skills; each ≥3 collision-free trigger baselines), AGENT_CONFIGS (4 agents) |
| `spec.ts` | Feature/Product spec frontmatter schemas |
| `version.ts` | `PROSPEC_VERSION` — running version with process.env / package.json resolution |

## Public API

- `ChangeMetadataSchema` / `isStatusBefore` — change `metadata.yaml` + forward-only status guard
- `ProspecConfigSchema` / `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` — `.prospec.yaml` validation + knowledge-size L1/L2 thresholds
- `SKILL_DEFINITIONS` / `AGENT_CONFIGS` — 17 skills + 4 agents (typed `Record<ValidAgent, ...>`)
- `DriftReportSchema` / `DRIFT_CHECK_IDS` — drift report schema + 11 frozen check ids
- `MeasurementReportSchema` / `SizeReportSchema` — provider-neutral report + offline size report
- `MCP_RESOURCE_URIS` / `SearchModulesInputShape` — 8 frozen URIs + tool I/O shapes
- `INIT_DOC_REGISTRY` / `CORE_CONVENTIONS` / `INDEX_TABLE_COLUMNS` — init-created docs, L0 conventions, `index.md` column schema
- `ProspecError` — base error (code + suggestion, optional `cause`)

## Dependencies

**Depends on:** `zod` only — leaf module, zero internal deps
**Used by:** `lib`, `services`, `cli`, `tests` — imported everywhere

## Modification Guide

1. **Add a schema field** — edit the schema; use `.optional()`/`.default()` so existing YAML keeps validating.
2. **Add an error class** — extend `ProspecError` in `errors.ts` with `code` (UPPER_SNAKE) + `suggestion`.
3. **Add a skill** — append to `SKILL_DEFINITIONS` in `skill.ts`, then bump the count in `skill-format.test.ts`.
4. **Add a drift check id** — append to `DRIFT_CHECK_IDS` in `drift-report.ts` (frozen, additive) → wire it in drift services.
5. **Add an agent** — add to `VALID_AGENTS` in `config.ts`; the typed `AGENT_CONFIGS` map forces a matching entry.

## Ripple Effects

- Imported everywhere: a schema change ripples to every consumer — e.g. config → `lib/config.ts`, errors → `cli/formatters/error-output.ts`, skills → `agent-sync.service.ts`.

## Pitfalls

- `.optional()` → `T | undefined`, `.default()` → `T`; adding a required field breaks existing `.prospec.yaml`.
- `DRIFT_CHECK_IDS`, `MCP_RESOURCE_URIS`, and `drift-report` knowledge_health fields are FROZEN contracts — extend additively only, never reorder/remove.
- `SKILL_DEFINITIONS` / `AGENT_CONFIGS` counts are asserted in contract tests — update the test (and `VALID_AGENTS`) too.
- `feature-map.ts` is shape-only — slug/module-map checks live in the lib loader/collector, not here.
- `INIT_DOC_REGISTRY` is pinned by an init⇄registry equality test; resolve `root: 'knowledge'` via `resolveBasePaths().knowledgePath`.

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
