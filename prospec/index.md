# AI Knowledge Index

> This file is the entry point for AI assistants, located at `prospec/index.md`.
> Read this first, then load specific module READMEs or load-on-demand conventions as needed.

<!-- prospec:auto-start -->
## Conventions

**Core Conventions (L1)**
These files are NOT auto-loaded. The AI MUST actively read them at the start of a task if not already in context:
- `prospec/ai-knowledge/_conventions.md`
- `prospec/ai-knowledge/_diagram-conventions.md`
- `prospec/ai-knowledge/_glossary.md`
- `prospec/ai-knowledge/_status-lifecycle.md`

**Load-on-Demand Conventions**
Load these specific convention files only when their topics are relevant to the task:
- `prospec/ai-knowledge/_lessons-ledger.md`
- `prospec/ai-knowledge/_module-readme-conventions.md`
- `prospec/ai-knowledge/_playbook.md`

## Modules

| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
| --- | --- | --- | --- | --- | --- | --- |
| **types** | config, schema, errors, skill, change, zod, language, triggers, token-budget, measurement, scale, drift-report, feature-map, mcp, category, conventions, language-scope, station, auto-draft, verify-dimensions, cascade, circuit-breaker, lens-yield, review-status | 型別, 結構描述, type definitions, 錯誤類別, validation, 量測, 複雜度, 漂移報告, MCP 契約, 模組分類 | Active | Zod schemas, error hierarchy, skill definitions, Constitution rule types, the station I/O contracts the cli-first skills speak (review findings, verify dimension registry, lesson upsert, validate kinds), and the canonical index-table column, knowledge-token-budget and escaped-defect report contracts. | Leaf module with zero internal deps — all others import from here | — |
| **lib** | fs, config, template, auto-draft, scanner, merger, yaml, logger, detector, module-detector, module-map, strategy, token-accounting, drift-checker, drift-sources, spec-headings, spec-slices, spec-counters, task-markers, knowledge-reader, change-metadata, feature-map, manifest-parsers, category, language-policy, status-router, markdown-table, delegated-evidence, verify-grade, review-merge, lessons-ledger, artifact-validators, date-utils, review-circuit-breaker, project-runner, lens-yield | 工具, 共用函式, utilities, helpers, 基礎設施, infrastructure, 量測計算, 漂移檢查, 知識讀取 | Active | Shared stateless utilities — config, file I/O, Handlebars rendering, scanning, token accounting, the zero-LLM drift engine (collectors + evaluators), Constitution rule parsing, the flag-gated test runner, escaped-defect aggregation, knowledge readers, multi-language manifest parsers, and the I/O-free station engines (markdown-table, delegated-evidence, verify grade, review-merge, lessons-ledger, artifact validators, review-circuit-breaker, lens-yield). | Foundational infrastructure shared across services, CLI, and benchmark scripts | types |
| **services** | init, knowledge, change, archive, agent-sync, spec-sync, product, feature-map, triggers, language, measure, check, mcp, serve, status, change-log, change-status, change-scale, change-progress, review-merge, verify-record, learn, validate, spec-show, upgrade, cascade, auto-draft | 服務, 業務邏輯, business logic, execute pattern, use case, 量測報告, 漂移檢查, 真相層 | Active | Business logic — one `execute()` service per command — init / quickstart / upgrade, knowledge init + update, change story / plan / tasks / log / status / scale / progress, review merge, verify record, learn, validate, archive + spec-sync + finalize, agent-sync, measure, drift check (record-review / record-tests / escaped-defect / auto-draft modes), auto-draft, and the read-only MCP server. | Isolates business logic from I/O layer, enables testability | types, lib |
| **cli** | commands, formatters, commander, output, preaction, measure, check, strict, mcp, stdio, archive, dry-run, station-commands, finalize, sanitize, auto-draft | 指令, 命令列, command line, 終端, entry point | Active | Thin CLI entry — 18 top-level Commander commands + 29 formatters that parse → call one service → format output; the cli-first station commands each add one command/formatter pair, never logic. | Thin I/O layer: no business logic, delegates to services | types, lib, services |
| **templates** | handlebars, auto-draft, hbs, skills, agent-configs, recipe-first, loading-rules, references, change, stable-prefix, entry-gate, scale, kind, ci-workflow, flywheel, lessons-ledger, feature-map, category, grouping, cli-probe, cli-first | 模板, 範本, handlebars, template engine, resources, 穩定前綴, 知識同步閘門, 複雜度適配, CI 閘門 | Active | Handlebars template library — 17 skills + 7 shared partials, 28 references, 1 agent-config, 5 change, 15 init/knowledge (74 `.hbs` templates) — the source of every generated skill, README, and index; every skill delegates its deterministic steps to the CLI behind the shared `_cli-probe` partial. | Pure resources — no logic, consumed by lib/template.ts | — |
| **tests** | vitest, memfs, unit, integration, contract, e2e, knowledge-format, skill-format, token-corpus, drift, lessons-harvest, mcp-server, in-memory-transport, cli-first, station-commands | 測試, 單元測試, test suite, 驗證, vitest | Active | 4-layer test suite — 170 files, 4,322 tests (unit 3195 + contract 973 + integration 45 + e2e 109). Validates every module — format contracts, the cli-first probe + station-command contracts, the drift engine, token corpus, and the MCP protocol over in-memory transport. | Quality gate — validates all layers with pyramid coverage | types, lib, services, cli, templates |

_Table format: Module | Keywords | Aliases | Status | Description | Rationale | Depends On_

_Optional grouping: when modules have categories and fall into ≥2 primary domain categories, they are automatically grouped under `### {Category}` sub-headings (each sub-table reuses the columns above; a module appears under its primary category only). Projects without categories keep one flat table._
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
| **L2** | `prospec/ai-knowledge/modules/{name}/README.md` (+ each linked `{sub-module}.md`) | When Skill identifies related modules from L1 keywords | ≤ 1,000 tokens per module file — README and each linked sub-module alike; also ≤ 100 lines |
| **Spec** | `prospec/specs/features/**/*.md` + `prospec/specs/product.md` | When Skill identifies related features (verify/archive read the specs a change touches) | ≤ 5,000 tokens per spec file — a slice under `features/{feature}/` is measured alike |
| **Demand** | `_lessons-ledger.md`, `_playbook.md`, `_module-readme-conventions.md` | When their topic is relevant — read in slices, never whole | ≤ 10,000 tokens per file |
| **Skill** | deployed `SKILL.md` and its `references/*.md` | Injected per station by the harness | ≤ 5,000 tokens per skill, ≤ 2,500 tokens per reference — measured only where this project holds the skill template sources |
| **L3** | Source code files | When Agent needs implementation details | No limit (read on demand) |

> **Every budget above is machine-enforced** by the `knowledge-size` drift check (`prospec check`). The numbers are the **shipped defaults**; the operative thresholds come from `.prospec.yaml` `knowledge.token_budget`, which **this project currently overrides to `l1_per_file: 2500` / `l2_per_module: 2000` / `demand_knowledge_per_file: 20000`** (the other four unchanged). The Demand override is deliberate and was raised, not earned: the lessons ledger's structural floor has risen to ~16,038 tokens as its `personal` rows grew to 94 (~9,336 tokens) — rows the promotion format's own rule forbids compressing — and a full Staleness Sweep of all 132 rows found no genuinely-retirable entries, so the shipped 10,000 (and the earlier 15,000) sat below a floor no Sweep could clear — that PASS comes from widening the budget, never from the knowledge getting smaller. Over-budget files WARN (a pressure signal against silent regrowth, never a build breaker), and each finding names the convergence path for its surface — slice a Spec, run `/prospec-learn`'s Staleness Sweep on a Demand file, extract a sub-module from an L2 file. L0 is agent-injected config, out of the check's scope.

**Principles:**
1. L0 answers "how to use skills" — L1 answers "where to look" and "what to do" — L2 answers "what it does" (Feature Spec) and "how to modify" (Module README) — L3 answers "how to write"
2. Each layer must NOT duplicate information available in a lower layer
3. The README (plus any linked `{sub-module}.md`) is the only knowledge per module — no api-surface.md, dependencies.md, or patterns.md
4. Sub-modules are an L2 sub-layer reached via the README's `## Sub-Modules` links — never listed in `prospec/index.md`
