# AI Knowledge Index

> This index helps AI Agents quickly understand the project structure.
> Read this file first, then load specific module READMEs as needed.

## Modules

<!-- prospec:auto-start -->

| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
|--------|----------|---------|--------|-------------|-----------|------------|
| **types** | config, schema, errors, skill, change, zod, strategy, spec, token-budget | 型別, 結構描述, type definitions, 錯誤類別, validation | Active | Zod 4 schemas, error hierarchy (11 classes), skill/agent definitions (6 files, 459 lines) | Leaf module with zero internal deps — all others import from here | — |
| **lib** | fs, config, template, scanner, merger, yaml, logger, detector, module-detector, module-map, strategy | 工具, 共用函式, utilities, helpers, 基礎設施, infrastructure | Active | Shared utilities — config, file I/O, Handlebars, scanning, 4-mode module detection (10 files, 1,529 lines) | Foundational infrastructure shared across services and CLI | types |
| **services** | init, steering, knowledge, change, archive, agent-sync, spec-sync, product | 服務, 業務邏輯, business logic, execute pattern, use case | Active | Business logic — 10 services with `execute()` pattern, including Recipe-First knowledge generation (3,429 lines) | Isolates business logic from I/O layer, enables testability | types, lib |
| **cli** | commands, formatters, commander, output, preaction | 指令, 命令列, command line, 終端, entry point | Active | CLI entry point — 8 commands + 9 formatters, parse → execute → format (18 files) | Thin I/O layer: no business logic, delegates to services | types, services |
| **templates** | handlebars, hbs, skills, agent-configs, recipe-first, loading-rules, references, change | 模板, 範本, handlebars, template engine, resources | Active | Handlebars template library — 11 skills, 15 references, 1 agent-config, 5 change, 13 init/steering/knowledge (45 `.hbs` files) | Pure resources — no logic, consumed by lib/template.ts | — |
| **tests** | vitest, memfs, unit, integration, contract, e2e, knowledge-format, skill-format | 測試, 單元測試, test suite, 驗證, vitest | Active | 4-layer test suite — 28 files, 457 tests (unit 226 + contract 199 + integration 15 + e2e 17) | Quality gate — validates all layers with pyramid coverage | all |

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
