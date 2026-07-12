# AI Knowledge Index

> This file is the entry point for AI assistants, located at `prospec/index.md`.
> Read this first, then load specific module READMEs or load-on-demand conventions (L2) as needed.

<!-- prospec:auto-start -->
## Conventions

**Core Conventions (L1)**
These files are NOT auto-loaded. The AI MUST actively read them at the start of a task if not already in context:
- `prospec/ai-knowledge/_conventions.md`
- `prospec/ai-knowledge/_diagram-conventions.md`
- `prospec/ai-knowledge/_glossary.md`
- `prospec/ai-knowledge/_status-lifecycle.md`

**Load-on-Demand Conventions (L2)**
Load these specific convention files only when their topics are relevant to the task:
- `prospec/ai-knowledge/_lessons-ledger.md`
- `prospec/ai-knowledge/_module-readme-conventions.md`
- `prospec/ai-knowledge/_playbook.md`

## Modules

| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
| --- | --- | --- | --- | --- | --- | --- |
| **types** | config, schema, errors, skill, change, zod, language, triggers, token-budget, measurement, scale, drift-report, feature-map, mcp, category, conventions | 型別, 結構描述, type definitions, 錯誤類別, validation, 量測, 複雜度, 漂移報告, MCP 契約, 模組分類 | Active | Zod schemas, error hierarchy, skill definitions, Constitution rule types, and the canonical index-table column + knowledge-token-budget contracts. Leaf module — every other module imports its types. | Leaf module with zero internal deps — all others import from here | — |
| **lib** | fs, config, template, scanner, merger, yaml, logger, detector, module-detector, module-map, strategy, token-accounting, drift-checker, drift-sources, task-markers, knowledge-reader, feature-map, manifest-parsers, category | 工具, 共用函式, utilities, helpers, 基礎設施, infrastructure, 量測計算, 漂移檢查, 知識讀取 | Active | Shared stateless utilities — config, file I/O, Handlebars rendering, scanning, deterministic token accounting, the zero-LLM drift engine (collectors + evaluators), knowledge readers, and multi-language manifest parsers. | Foundational infrastructure shared across services, CLI, and benchmark scripts | types |
| **services** | init, knowledge, change, archive, agent-sync, spec-sync, product, feature-map, triggers, language, measure, check, mcp, serve | 服務, 業務邏輯, business logic, execute pattern, use case, 量測報告, 漂移檢查, 真相層 | Active | Business logic — one `execute()` service per command — init / quickstart / upgrade, knowledge generate + update, change story / plan / tasks, archive + spec-sync, agent-sync, measure, drift check, and the read-only MCP server. | Isolates business logic from I/O layer, enables testability | types, lib |
| **cli** | commands, formatters, commander, output, preaction, measure, check, strict, mcp, stdio | 指令, 命令列, command line, 終端, entry point | Active | Thin CLI entry — Commander commands + formatters that parse → call one service → format output. No business logic (delegates everything to services). | Thin I/O layer: no business logic, delegates to services | types, lib, services |
| **templates** | handlebars, hbs, skills, agent-configs, recipe-first, loading-rules, references, change, stable-prefix, entry-gate, scale, kind, ci-workflow, flywheel, lessons-ledger, feature-map, category, grouping | 模板, 範本, handlebars, template engine, resources, 穩定前綴, 知識同步閘門, 複雜度適配, CI 閘門 | Active | Handlebars template library — 17 skills + 5 shared partials, 19 references, 1 agent-config, 4 change, 15 init/knowledge (62 `.hbs` templates). Pure resources consumed by lib/template — the source of every generated skill, README, and index. | Pure resources — no logic, consumed by lib/template.ts | — |
| **tests** | vitest, memfs, unit, integration, contract, e2e, knowledge-format, skill-format, token-corpus, drift, lessons-harvest, mcp-server, in-memory-transport | 測試, 單元測試, test suite, 驗證, vitest | Active | 4-layer test suite — 91 files, 2,131 tests (unit 1392 + contract 656 + integration 38 + e2e 45) across unit / contract / integration / e2e. Validates every module — format contracts, the drift engine, token corpus, and the MCP protocol over in-memory transport. | Quality gate — validates all layers with pyramid coverage | types, lib, services, cli, templates |

_Table format: Module | Keywords | Aliases | Status | Description | Rationale | Depends On_

_Optional grouping: when modules fall into ≥2 domain categories, group rows under `### {Category}` sub-headings (each sub-table reuses the columns above; a module appears under its primary category only). Pure architectural-layer projects keep one flat table._
<!-- prospec:auto-end -->

## Project Info

- **Project**: prospec
- **Tech Stack**: typescript
- **Knowledge Base**: `prospec/ai-knowledge`

<!-- prospec:user-start -->
<!-- Add custom project notes here. This section is preserved on regeneration. -->
<!-- prospec:user-end -->

## Progressive Knowledge Loading Strategy

| Layer | Files | When to Load | Token Budget |
|-------|-------|-------------|-------------|
| **L0** | `AGENTS.md` / `CLAUDE.md` | Every conversation (auto-injected via agent config) | Agent-injected — out of `knowledge-size` scope |
| **L1** | `prospec/index.md` + Core Conventions + Context-specific artifacts | At startup (acts as entry point and current task context) | ≤ 1,800 tokens per file (index.md and each core convention) |
| **L2** | `prospec/ai-knowledge/modules/{name}/README.md` + Demand Conventions + `prospec/specs/features/*.md` | When Skill identifies related modules/features from L1 keywords | ≤ 1,000 tokens per module README; also ≤ 100 lines |
| **L3** | Source code files | When Agent needs implementation details | No limit (read on demand) |

> **L1/L2 budgets are machine-enforced** by the `knowledge-size` drift check (`prospec check`). Thresholds come from `.prospec.yaml` `knowledge.token_budget` (the numbers above are the defaults when a field is unset); over-budget files WARN (a pressure signal against silent regrowth, never a build breaker). L0 is agent-injected config, out of the check's scope.

**Principles:**
1. L0 answers "how to use skills" — L1 answers "where to look" and "what to do" — L2 answers "what it does" (Feature Spec) and "how to modify" (Module README) — L3 answers "how to write"
2. Each layer must NOT duplicate information available in a lower layer
3. The README (plus any linked `{sub-module}.md`) is the only knowledge per module — no api-surface.md, dependencies.md, or patterns.md
4. Sub-modules are an L2 sub-layer reached via the README's `## Sub-Modules` links — never listed in `prospec/index.md`
