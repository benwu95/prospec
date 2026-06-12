# AI Knowledge Index

> This index helps AI Agents quickly understand the project structure.
> Read this file first, then load specific module READMEs as needed.

## Modules

<!-- prospec:auto-start -->

| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
|--------|----------|---------|--------|-------------|-----------|------------|
| **types** | config, schema, errors, skill, change, zod, language, triggers, token-budget, measurement, scale, drift-report, mcp | 型別, 結構描述, type definitions, 錯誤類別, validation, 量測, 複雜度, 漂移報告, MCP 契約 | Active | Zod 4 schemas (incl. artifact_language/skill_triggers/measurement report/change scale/drift report with frozen knowledge-health contract/MCP resource URIs + tool I/O), error hierarchy, skill definitions with trigger baselines, Constitution rule types (10 files, 845 lines) | Leaf module with zero internal deps — all others import from here | — |
| **lib** | fs, config, template, scanner, merger, yaml, logger, detector, module-detector, module-map, strategy, token-accounting, drift-checker, drift-sources, task-markers, knowledge-reader | 工具, 共用函式, utilities, helpers, 基礎設施, infrastructure, 量測計算, 漂移檢查, 知識讀取 | Active | Shared utilities — config (incl. artifact-language accessors), file I/O, Handlebars (lazy partials), YAML escaping, scanning, Constitution rule sets, deterministic token accounting, zero-LLM drift engine (collectors + pure evaluators), the frozen task-kind parser, and the realpath-contained knowledge content read layer (16 files, 2,852 lines) | Foundational infrastructure shared across services, CLI, and benchmark scripts | types |
| **services** | init, steering, knowledge, change, archive, agent-sync, spec-sync, product, triggers, language, measure, check, mcp, serve | 服務, 業務邏輯, business logic, execute pattern, use case, 量測報告, 漂移檢查, 真相層 | Active | Business logic — 13 services with `execute()` pattern, incl. init language selection, trigger synthesis, Recipe-First knowledge generation, measurement-report loading, drift-check orchestration with --init-ci scaffold, and the read-only MCP server (6 resources + 2 tools, per-request reads, stderr-only diagnostics); archive task stats consume lib/task-markers (4,014 lines) | Isolates business logic from I/O layer, enables testability | types, lib |
| **cli** | commands, formatters, commander, output, preaction, measure, check, strict, mcp, stdio | 指令, 命令列, command line, 終端, entry point | Active | CLI entry point — 11 commands + 12 formatters, parse → execute → format (25 files); `check --strict` maps FAIL to exit 1; `mcp serve` keeps stdout byte-clean (protocol channel, banner → stderr) | Thin I/O layer: no business logic, delegates to services | types, services |
| **templates** | handlebars, hbs, skills, agent-configs, recipe-first, loading-rules, references, change, stable-prefix, entry-gate, scale, kind, ci-workflow, flywheel, lessons-ledger | 模板, 範本, handlebars, template engine, resources, 穩定前綴, 知識同步閘門, 複雜度適配, CI 閘門 | Active | Handlebars template library — 13 skills + 1 shared partial, 17 references, 1 agent-config, 4 change, 14 init/steering/knowledge (50 `.hbs`, English-only); skill Startup Loading is static-first with `[STABLE]/[DYNAMIC]` markers; archive carries the knowledge-sync Entry Gate (BL-038); skills are scale-aware with the task kind schema frozen in tasks-format (BL-004); verify consumes the drift report and a hardened CI workflow template ships with `check --init-ci` (BL-030); learn/archive carry the knowledge flywheel — archive Phase 4.5 auto-harvest into the version-controlled `_lessons-ledger.md`, promotion-format single-sources the harvest format (BL-029) | Pure resources — no logic, consumed by lib/template.ts | — |
| **tests** | vitest, memfs, unit, integration, contract, e2e, knowledge-format, skill-format, token-corpus, drift, lessons-harvest, mcp-server, in-memory-transport | 測試, 單元測試, test suite, 驗證, vitest | Active | 4-layer test suite — 44 files, 909 tests (unit 433 + contract 426 + integration 15 + e2e 35), incl. token-corpus + startup-loading-baseline + lessons-harvest fixtures; drift/reader tests run on real temp dirs (fast-glob/git bypass memfs); MCP protocol tested over in-memory transport, never a spawned daemon | Quality gate — validates all layers with pyramid coverage | all |

## Dependency Graph

```
templates ─┐
types ─────┤
           ├── lib ──── services ──── cli
tests (validates all)
```

<!-- prospec:auto-end -->

## Project Info

- **Language**: typescript
- **Knowledge Base**: `prospec/ai-knowledge/`
- **Constitution**: `prospec/CONSTITUTION.md`

## How to Use

1. Start by reading this index to identify related modules
2. Load the specific module's `README.md` for APIs, modification guides, and pitfalls
3. Check `_conventions.md` for coding patterns and standards
4. Consult `CONSTITUTION.md` for architectural constraints
5. Use `module-map.yaml` for dependency relationships

## Conventions

- `_conventions.md` — coding patterns, naming, architecture, dependency direction
- `_glossary.md` — shared term definitions across Skills (load on demand; Skills cite this instead of re-explaining concepts)
- `_playbook.md` — team lessons promoted by `/prospec-learn` (human-approved); plan/implement load **relevant** entries on demand (progressive disclosure)
- `_lessons-ledger.md` — accumulating, version-controlled lessons ledger auto-fed by `/prospec-archive` Phase 4.5 and refreshed by `/prospec-learn` Collect; load on demand (learn/archive only), not L0
- `_module-readme-conventions.md` — canonical structure for module READMEs (what `/prospec-knowledge-generate` and `/prospec-knowledge-update` produce against)
- `_diagram-conventions.md` — Mermaid diagram conventions for supplementary flow docs
- `_status-lifecycle.md` — the `story → … → archived` change status lifecycle every skill follows

## Loading Rules

| Layer | Content | When to Load | Budget |
|-------|---------|-------------|--------|
| **L0** | `_index.md` + `_conventions.md` | Every conversation (auto-injected via agent config) | ≤ 1,500 tokens total |
| **L1** | `modules/{name}/README.md` (+ any `{sub-module}.md` it links) | When Skill identifies related modules from L0 keywords | ≤ 400 tokens per module |
| **L2** | Source code files | When Agent needs implementation details | No limit (read on demand) |

**Principles:**
1. L0 answers "where to look" — L1 answers "how to modify" — L2 answers "how to write"
2. Each layer must NOT duplicate information available in a lower layer
3. The README (plus any linked `{sub-module}.md`) is the only knowledge per module — no api-surface.md, dependencies.md, or patterns.md
4. Sub-modules are an L1 sub-layer reached via the README's `## Sub-Modules` links — never listed in `_index.md`
