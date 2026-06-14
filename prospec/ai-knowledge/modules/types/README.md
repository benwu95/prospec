# types

> Foundational type system — Zod 4 schemas with runtime validation, error hierarchy, skill/agent definitions, Constitution rule types, change scale levels, token measurement, drift report and MCP server contracts, plus the canonical _index column schema (11 files, 894 lines)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `src/types/config.ts` | ProspecConfigSchema (incl. `artifact_language`, `skill_triggers`), DEFAULT_ARTIFACT_LANGUAGE, VALID_AGENTS |
| `src/types/skill.ts` | SKILL_DEFINITIONS (13 skills, English `triggers` baselines), AGENT_CONFIGS (4 agents) |
| `src/types/change.ts` | ChangeMetadataSchema (+ quality_log + optional scale), CHANGE_STATUSES, CHANGE_SCALES, GATE_RESULTS, QualityLogEntrySchema |
| `src/types/module-map.ts` | ModuleMapSchema, ModuleEntry (incl. optional ordered `category`, primary-first), ModuleRelationships |
| `src/types/spec.ts` | FeatureSpecFrontmatterSchema, ProductSpecFrontmatterSchema |
| `src/types/errors.ts` | ProspecError base + 13 specialized error classes (incl. MeasurementReportInvalid, DriftReportInvalid, McpResourceNotFound) |
| `src/types/constitution.ts` | ConstitutionRule — RFC-2119 severity (MUST/SHOULD/MAY) + name/description/rationale/check |
| `src/types/measurement.ts` | Provider-neutral TokenUsage/Pricing + MeasurementReport schemas, AGENT_PROVIDER_MAP, DEFAULT_REPORT_FILENAME |
| `src/types/drift-report.ts` | DriftReportSchema for prospec-report.json — structural/semantic layering, 5 frozen check ids, skipped-needs-reason rule, frozen knowledge-health field contract |
| `src/types/mcp.ts` | MCP server contract — resource URI constants, tool I/O zod schemas (search_modules incl. additive `category` default [], get_dependency_direction) |
| `src/types/knowledge.ts` | Canonical `_index.md` column schema — INDEX_TABLE_COLUMNS (7), INDEX_COLUMN, INDEX_TABLE_HEADER/SEPARATOR; single source for every index emitter + parser |

## Public API

- `ProspecConfigSchema` — Zod schema validating `.prospec.yaml`; optional `artifact_language` (free-form, absent = English) and `skill_triggers` (skill name → custom trigger words)
- `SKILL_DEFINITIONS` — 13 skill configs: name, English description, `triggers` baseline (rendered into SKILL.md frontmatter), type, references
- `AGENT_CONFIGS` — 4 agent configs (Claude, Antigravity, Copilot, Codex); `{ name, skillPath, configPath }`
- `ChangeMetadataSchema` — Zod schema for change `metadata.yaml`; incl. optional `quality_log` Entry/Exit gate trail (`GATE_RESULTS` = PASS/WARN/FAIL) and optional `scale` (`CHANGE_SCALES` = quick/standard/full; absent = standard, BL-004)
- `ModuleMapSchema` — Zod schema for `module-map.yaml`
- `ProspecError` — Base error class (code + suggestion fields)
- `KNOWLEDGE_STRATEGIES` / `KNOWLEDGE_FILE_TYPES` — knowledge generation const tuples
- `ConstitutionRule` — A Constitution rule carrying an RFC-2119 severity that verify grades against
- `MeasurementReportSchema` — validates measurement-report.json; TokenUsage fields are provider-neutral (provider-specific usage fields map in at the runner's adapter layer)
- `DriftReportSchema` / `DRIFT_CHECK_IDS` — validates prospec-report.json; semantic layer is literally `'not-checked'` (never gradable), `skipped` checks must carry a `reason`
- `MCP_RESOURCE_URIS` / `SearchModulesInputShape` / `DependencyDirectionResultSchema` — MCP resource URIs + tool I/O contracts; input shapes are raw Zod shapes (SDK registerTool takes ZodRawShape), wrapped schemas exist for standalone validation
- `INDEX_TABLE_COLUMNS` / `INDEX_COLUMN` / `INDEX_TABLE_HEADER` / `INDEX_TABLE_SEPARATOR` — canonical `_index.md` module-table column schema; the single source every emitter (init/knowledge render-context injection, knowledge-update) and parser (change-story, knowledge-reader) derives from

## Dependencies

- **depends_on**: `zod` only (leaf module — zero internal dependencies)
- **used_by**: ALL other modules import from here

## Modification Guide

1. Adding a new type: Create in the appropriate file, export. Add Zod schema if runtime validation needed.
2. Adding a new error: Extend `ProspecError` in `errors.ts` with `code` (UPPER_SNAKE) and `suggestion`.
3. Adding a new skill: Add entry to `SKILL_DEFINITIONS` in `skill.ts`, then update contract test count in `skill-format.test.ts`.
4. Changing config schema: Update `ProspecConfigSchema` in `config.ts` — use `.optional()` for new fields to avoid breaking existing configs.

## Ripple Effects

- Config schema changes affect `lib/config.ts` validation and all services reading config
- Error type changes affect `cli/formatters/error-output.ts` dispatch logic
- Skill definition changes affect `agent-sync.service.ts` output and contract test assertions; `triggers` feeds `synthesizeTriggers()` frontmatter composition
- `KNOWLEDGE_FILE_TYPES` / `KNOWLEDGE_STRATEGIES` changes affect knowledge and steering services
- `measurement.ts` schema changes affect `measure.service.ts` validation and the `scripts/measure-tokens.ts` runner (outside runtime layering, consumes types/lib)

## Pitfalls

- Zod `.optional()` vs `.default()` — optional returns `T | undefined`, default returns `T`. Be explicit.
- Adding required fields to schemas breaks existing `.prospec.yaml` — always use `.optional()` or `.default()`
- `SKILL_DEFINITIONS` count is asserted in `skill-format.test.ts` — adding a skill without updating the test count causes contract test failure
- `drift-report.ts` knowledge_health field names are a FROZEN downstream contract (Knowledge Flywheel, MCP server `knowledge://health`) — renaming them is a breaking change, not a refactor
- `mcp.ts` tool result schemas are protocol-frozen (clients consume structuredContent) — `SEARCH_MATCH_FIELDS` / `DEPENDENCY_DIRECTION_SOURCES` literals are contract values, not free strings; extend ONLY additively (e.g. `SearchModuleMatch.category` was added as `default([])`, never reordering/removing existing fields)

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
