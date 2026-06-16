# AI Knowledge Index

> This index helps AI Agents quickly understand the project structure.
> Read this file first, then load specific module READMEs as needed.

## Modules

<!-- prospec:auto-start -->

| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
|--------|----------|---------|--------|-------------|-----------|------------|
| **types** | config, schema, errors, skill, change, zod, language, triggers, token-budget, measurement, scale, drift-report, mcp, category | 型別, 結構描述, type definitions, 錯誤類別, validation, 量測, 複雜度, 漂移報告, MCP 契約, 模組分類 | Active | Zod 4 schemas (incl. artifact_language/skill_triggers/measurement report/change scale/drift report with frozen knowledge-health contract/MCP resource URIs + tool I/O), error hierarchy, skill definitions with trigger baselines, Constitution rule types, canonical _index column schema; config exports the ValidAgent vocabulary, errors thread an optional cause, TaskMeasurement refines reason; `isStatusBefore` keeps status advances forward-only and `KnowledgeSchema.files` is constrained to `KNOWLEDGE_FILE_TYPES` (11 files, 923 lines) | Leaf module with zero internal deps — all others import from here | — |
| **lib** | fs, config, template, scanner, merger, yaml, logger, detector, module-detector, module-map, strategy, token-accounting, drift-checker, drift-sources, task-markers, knowledge-reader, manifest-parsers, category | 工具, 共用函式, utilities, helpers, 基礎設施, infrastructure, 量測計算, 漂移檢查, 知識讀取 | Active | Shared utilities — config (incl. artifact-language accessors), file I/O, Handlebars (lazy partials), YAML escaping, scanning, Constitution rule sets, deterministic token accounting, zero-LLM drift engine (collectors + pure evaluators), the frozen task-kind parser, the realpath-contained knowledge content read layer, and the shared key-exports derivation; domain detection decouples module name from path glob (real-dir-segment globs), drift link-checks resolve symlinks before reporting existence, import-edge collection scans `**/name/**` domain paths, and `resolveBasePaths` defaults to `DEFAULT_BASE_DIR`, and deterministic multi-language manifest parsing (TOML/XML/go.mod/requirements/composer/vcpkg/conan, no network) (18 files, 3,629 lines) | Foundational infrastructure shared across services, CLI, and benchmark scripts | types |
| **services** | init, steering, knowledge, change, archive, agent-sync, spec-sync, product, triggers, language, measure, check, mcp, serve | 服務, 業務邏輯, business logic, execute pattern, use case, 量測報告, 漂移檢查, 真相層 | Active | Business logic — 14 services with `execute()` pattern, incl. init language selection, the quickstart orchestrator (init + agent-sync, skip-completed), trigger synthesis, Recipe-First knowledge generation, deterministic multi-language raw-scan (11-language manifest detection), measurement-report loading, drift-check orchestration with --init-ci scaffold, and the read-only MCP server (6 resources + 2 tools, per-request reads, stderr-only diagnostics); archive task stats consume lib/task-markers; change-plan/change-tasks share the services/change-resolver helper; archive spec-sync is `$`-pattern-safe with feature-slug path containment + non-atomic-move rollback + forwarded knowledge warnings, change-plan/tasks guard re-runs (`--force`) and advance status forward-only, init writes its config marker last, and steering excludes the reserved `base_dir` layer (15 files, 4,115 lines) | Isolates business logic from I/O layer, enables testability | types, lib |
| **cli** | commands, formatters, commander, output, preaction, measure, check, strict, mcp, stdio | 指令, 命令列, command line, 終端, entry point | Active | CLI entry point — 12 commands + 14 formatters, parse → execute → format (30 files; shared cli/log-level + cli/parse-options + cli/formatters/sanitize helpers); `quickstart` orchestrates init + agent-sync and is registered in INIT_COMMANDS (runs before `.prospec.yaml` exists); `check --strict` maps FAIL to exit 1; `mcp serve` keeps stdout byte-clean (protocol channel, banner → stderr); the shared `sanitizeTerminal` strips C0/C1 from report/error strings on every formatter, and `change plan`/`change tasks` take `--force` | Thin I/O layer: no business logic, delegates to services | types, services |
| **templates** | handlebars, hbs, skills, agent-configs, recipe-first, loading-rules, references, change, stable-prefix, entry-gate, scale, kind, ci-workflow, flywheel, lessons-ledger, category, grouping | 模板, 範本, handlebars, template engine, resources, 穩定前綴, 知識同步閘門, 複雜度適配, CI 閘門 | Active | Handlebars template library — 15 skills + 1 shared partial, 18 references, 1 agent-config, 4 change, 14 init/steering/knowledge (53 `.hbs`, English-only); the prospec-quickstart skill is `excludeFromEntryConfig` (deployed SKILL.md, omitted from the always-loaded entry config); skill Startup Loading is static-first with `[STABLE]/[DYNAMIC]` markers; archive carries the knowledge-sync Entry Gate (BL-038); skills are scale-aware with the task kind schema frozen in tasks-format (BL-004); verify consumes the drift report and a hardened CI workflow template ships with `check --init-ci` (BL-030); learn/archive carry the knowledge flywheel — archive Phase 4.5 auto-harvest into the version-controlled `_lessons-ledger.md`, promotion-format single-sources the harvest format (BL-029); instruction-quality pass — per-phase gates, Phase-1 numbering, status-aware Next-Step Handoff (workflow order), new-session change detection (entry config), implement progress anchoring, empty-Constitution prompt; plan/implement carry the BL-034 optional on-demand Context7 dependency-layer step (untrusted, in-phase, never the stable prefix) | Pure resources — no logic, consumed by lib/template.ts | — |
| **tests** | vitest, memfs, unit, integration, contract, e2e, knowledge-format, skill-format, token-corpus, drift, lessons-harvest, mcp-server, in-memory-transport | 測試, 單元測試, test suite, 驗證, vitest | Active | 4-layer test suite — 55 files, 1,160 tests (unit 594 + contract 509 + integration 17 + e2e 40), incl. token-corpus + startup-loading-baseline + lessons-harvest fixtures; drift/reader tests run on real temp dirs (fast-glob/git bypass memfs); MCP protocol tested over in-memory transport, never a spawned daemon | Quality gate — validates all layers with pyramid coverage | all |

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
