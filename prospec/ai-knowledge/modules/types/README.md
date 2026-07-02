# types

> Foundational type system — Zod 4 schemas with runtime validation, error hierarchy, skill/agent definitions, Constitution rule types, change scale levels, token measurement, drift report and MCP server contracts, feature-map index, prospec version + canonical convention-doc constants, plus the canonical index column schema (14 files, 1,048 lines)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `src/types/config.ts` | ProspecConfigSchema (incl. `artifact_language`, `skill_triggers`), DEFAULT_ARTIFACT_LANGUAGE, VALID_AGENTS, `ValidAgent` type; the `version` field now means **the prospec version the project uses** (no separate `prospec_version`; legacy `version: "1.0"` reads as stale, bumped on first `prospec upgrade`) |
| `src/types/version.ts` | `PROSPEC_VERSION` — single source for the running prospec version, read from the package's own package.json via `createRequire`; lives in the leaf `types` (the lint rule forbids `cli → lib`, and `types` is the common layer cli+services can import) |
| `src/types/conventions.ts` | `CORE_CONVENTIONS`, `CANONICAL_CONVENTION_DOCS`, `USER_MANAGED_CONVENTION_DOCS`, `PLACEHOLDER_CONVENTION_DOCS`, `INIT_DOC_REGISTRY` — single source of truth for convention document registries, core (L0) vs load-on-demand (L1) classification, and the root-discriminated (`base`/`knowledge`) list of every curated doc `prospec init` creates (shared by init + the upgrade docs inventory) |
| `src/types/skill.ts` | SKILL_DEFINITIONS (17 skills, English `triggers` baselines; `hasReferences` gates reference deployment — incl. prospec-backfill-spec (extract a draft, BL-039), prospec-promote-backfill (formalize a reviewed draft into the backfill scaffold), and prospec-upgrade (version-upgrade finisher, BL-044); `excludeFromEntryConfig` omits a skill from the always-loaded entry config while still deploying its SKILL.md — prospec-quickstart + prospec-upgrade), AGENT_CONFIGS (`Record<ValidAgent, AgentConfig>`, 4 agents) |
| `src/types/change.ts` | ChangeMetadataSchema (+ quality_log + optional scale), CHANGE_STATUSES, CHANGE_SCALES (`quick`/`standard`/`full`/`backfill`), GATE_RESULTS, QualityLogEntrySchema, `isStatusBefore` (forward-only status guard over CHANGE_STATUSES) |
| `src/types/module-map.ts` | ModuleMapSchema, ModuleEntry (incl. optional ordered `category`, primary-first), ModuleRelationships |
| `src/types/spec.ts` | FeatureSpecFrontmatterSchema, ProductSpecFrontmatterSchema |
| `src/types/errors.ts` | ProspecError base + 13 specialized error classes (incl. MeasurementReportInvalid, DriftReportInvalid, McpResourceNotFound) |
| `src/types/constitution.ts` | ConstitutionRule — RFC-2119 severity (MUST/SHOULD/MAY) + name/description/rationale/check |
| `src/types/measurement.ts` | Provider-neutral TokenUsage/Pricing + MeasurementReport schemas, AGENT_PROVIDER_MAP, DEFAULT_REPORT_FILENAME |
| `src/types/drift-report.ts` | DriftReportSchema for prospec-report.json — structural/semantic layering, 8 frozen check ids (incl. `dangling-prefix`, `feature-modules`, `readme-counts`), skipped-needs-reason rule, frozen knowledge-health field contract |
| `src/types/feature-map.ts` | FeatureMapSchema for `feature-map.yaml` — feature→module index complementing module-map.yaml (which modules a feature spans + non-module REQ prefixes it owns); FEATURE_STATUSES, FeatureMap/FeatureEntry/FeatureStatus types |
| `src/types/mcp.ts` | MCP server contract — `MCP_RESOURCE_URIS` (8 resource URIs; BL-042 appended `featureMap`/`product` append-only, protocol-frozen — never reorder/remove), tool I/O zod schemas (search_modules incl. additive `category` default [], get_dependency_direction) |
| `src/types/knowledge.ts` | Canonical `index.md` column schema — INDEX_TABLE_COLUMNS (7), INDEX_COLUMN, INDEX_TABLE_HEADER/SEPARATOR; single source for every index emitter + parser |

## Public API

- `ProspecConfigSchema` — Zod schema validating `.prospec.yaml`; optional `artifact_language` (free-form, absent = English) and `skill_triggers` (skill name → custom trigger words); `version` = the prospec version the project uses
- `PROSPEC_VERSION` — single source for the running prospec version (read from the package's own package.json); consumed by cli `.version()` and `upgrade.service`
- `CORE_CONVENTIONS` / `CANONICAL_CONVENTION_DOCS` / `INIT_DOC_REGISTRY` — single source for the core (L0) / canonical convention-doc lists and the full init-created curated-doc registry (`{template, root, output}`, canonical docs derived not duplicated) that init creates from and the upgrade report inventories against
- `SKILL_DEFINITIONS` — 17 skill configs: name, English description, `triggers` baseline (rendered into SKILL.md frontmatter), type, references, optional `excludeFromEntryConfig`
- `ValidAgent` — `(typeof VALID_AGENTS)[number]`; the canonical supported-agent vocabulary
- `AGENT_CONFIGS` — 4 agent configs in canonical order (Claude, Codex, Copilot, Antigravity, matching `VALID_AGENTS` — which drives the zod enum error message); typed `Record<ValidAgent, AgentConfig>` so adding/removing a `VALID_AGENTS` member is a compile error until the map is updated
- `ChangeMetadataSchema` — Zod schema for change `metadata.yaml`; incl. optional `quality_log` Entry/Exit gate trail (`GATE_RESULTS` = PASS/WARN/FAIL) and optional `scale` (`CHANGE_SCALES` = quick/standard/full/backfill; absent = standard, BL-004; `backfill` is a promotion-time scale set by `/prospec-promote-backfill`)
- `ModuleMapSchema` — Zod schema for `module-map.yaml`
- `ProspecError` — Base error class (code + suggestion fields); accepts an optional `{ cause }` forwarded to `Error` (ModuleDetectionError also threads `cause`, preserving the underlying failure)
- `KNOWLEDGE_STRATEGIES` / `KNOWLEDGE_FILE_TYPES` — knowledge generation const tuples; `KnowledgeSchema.files` is `z.array(z.enum(KNOWLEDGE_FILE_TYPES)).optional()`, so the tuple is enforced by the schema (not just a documentation const)
- `isStatusBefore(current, target)` — true when `current` precedes `target` in `CHANGE_STATUSES`; keeps status advances forward-only so re-running a planning command never regresses a change's status
- `ConstitutionRule` — A Constitution rule carrying an RFC-2119 severity that verify grades against
- `MeasurementReportSchema` — validates measurement-report.json; TokenUsage fields are provider-neutral (provider-specific usage fields map in at the runner's adapter layer); `TaskMeasurementSchema.refine()` requires a non-empty `reason` when status is skipped/failed (honesty invariant, mirrors DriftCheckResultSchema)
- `DriftReportSchema` / `DRIFT_CHECK_IDS` — validates prospec-report.json; `DRIFT_CHECK_IDS` now lists 8 ids (added `dangling-prefix`, `feature-modules`, `readme-counts`); semantic layer is literally `'not-checked'` (never gradable), `skipped` checks must carry a `reason`
- `FeatureMapSchema` / `FEATURE_STATUSES` — Zod schema for `feature-map.yaml` (the feature→module index); only structural shape (slug safety + module-map membership are deferred to the lib loader/collector), `FeatureEntry.status` defaults to `active`
- `MCP_RESOURCE_URIS` / `SearchModulesInputShape` / `DependencyDirectionResultSchema` — MCP resource URIs + tool I/O contracts; input shapes are raw Zod shapes (SDK registerTool takes ZodRawShape), wrapped schemas exist for standalone validation
- `INDEX_TABLE_COLUMNS` / `INDEX_COLUMN` / `INDEX_TABLE_HEADER` / `INDEX_TABLE_SEPARATOR` — canonical `index.md` module-table column schema; the single source every emitter (init/knowledge render-context injection, knowledge-update) and parser (change-story, knowledge-reader) derives from

## Dependencies

- **depends_on**: `zod` only (leaf module — zero internal dependencies)
- **used_by**: ALL other modules import from here

## Modification Guide

1. Adding a new type: Create in the appropriate file, export. Add Zod schema if runtime validation needed.
2. Adding a new error: Extend `ProspecError` in `errors.ts` with `code` (UPPER_SNAKE) and `suggestion`.
3. Adding a new skill: Add entry to `SKILL_DEFINITIONS` in `skill.ts`, then update contract test count in `skill-format.test.ts`.
4. Changing config schema: Update `ProspecConfigSchema` in `config.ts` — use `.optional()` for new fields to avoid breaking existing configs.
5. Adding a feature-map field: Edit `FeatureMapSchema`/`FeatureEntrySchema` in `feature-map.ts` — keep it structural only; push semantic checks (slug safety, module membership) to the lib loader/collector.
6. Adding a drift check id: Append to `DRIFT_CHECK_IDS` in `drift-report.ts` (frozen, additive only) → wire the new id in the drift services layer.

## Ripple Effects

- Config schema changes affect `lib/config.ts` validation and all services reading config
- Error type changes affect `cli/formatters/error-output.ts` dispatch logic
- Skill definition changes affect `agent-sync.service.ts` output and contract test assertions; `triggers` feeds `synthesizeTriggers()` frontmatter composition
- `KNOWLEDGE_FILE_TYPES` / `KNOWLEDGE_STRATEGIES` changes affect the knowledge and knowledge-init services
- `measurement.ts` schema changes affect `measure.service.ts` validation and the `scripts/measure-tokens.ts` runner (outside runtime layering, consumes types/lib)

## Pitfalls

- Zod `.optional()` vs `.default()` — optional returns `T | undefined`, default returns `T`. Be explicit.
- Adding required fields to schemas breaks existing `.prospec.yaml` — always use `.optional()` or `.default()`
- `SKILL_DEFINITIONS` count is asserted in `skill-format.test.ts` — adding a skill without updating the test count causes contract test failure
- `AGENT_CONFIGS` is `Record<ValidAgent, AgentConfig>` — `VALID_AGENTS` is the single source; adding an agent there forces a matching map entry (compile error otherwise), so don't duplicate the agent list anywhere
- `drift-report.ts` knowledge_health field names are a FROZEN downstream contract (Knowledge Flywheel, MCP server `knowledge://health`) — renaming them is a breaking change, not a refactor
- `mcp.ts` tool result schemas are protocol-frozen (clients consume structuredContent) — `SEARCH_MATCH_FIELDS` / `DEPENDENCY_DIRECTION_SOURCES` literals are contract values, not free strings; extend ONLY additively (e.g. `SearchModuleMatch.category` was added as `default([])`, never reordering/removing existing fields)
- `feature-map.ts` is intentionally shape-only — types is a leaf importing only `zod`, so the schema CANNOT call `isSafeResourceName` or check `modules[]` against module-map; that semantic validation lives in the lib loader/collector. Don't try to enforce it here.
- `INIT_DOC_REGISTRY` is pinned by an init⇄registry bidirectional equality contract test — adding an init doc to one side only turns it red. Consumers resolve `root: 'knowledge'` entries via `resolveBasePaths().knowledgePath`, NEVER by joining `base_dir + 'ai-knowledge'` (a relocated `knowledge.base_path` would misreport every knowledge doc as missing)

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
