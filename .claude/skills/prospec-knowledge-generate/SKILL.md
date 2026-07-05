---
name: prospec-knowledge-generate
description: "Generate AI Knowledge - Read raw-scan.md, analyze project structure, autonomously decide module boundaries, and produce Recipe-First module READMEs and index. Triggers: generate knowledge, analyze project, module split, 產生知識, 知識庫, 分析專案, 模組拆分"
---
<!-- Generated from src/templates/skills/prospec-knowledge-generate.hbs by `prospec agent sync`. Edit the template, not this file — it is overwritten on the next sync. -->

# Prospec Knowledge Generate Skill

## Activation

When triggered, briefly describe:
- That you'll read raw-scan.md to understand the project structure
- You'll autonomously decide module boundaries using the configured granularity strategy
- Each module gets exactly **one README.md** in Recipe-First format (≤100 lines)
- You'll populate prospec/index.md (with the Progressive Knowledge Loading Strategy section) and _conventions.md

## Language Policy

Write generated documents in the language defined by the Constitution's Language Policy rule. Keep code, identifiers, technical terms, and git commit messages in English.
## Startup Loading

1. [STABLE] Read `prospec/ai-knowledge/_conventions.md` — if exists
2. [STABLE] Read `prospec/ai-knowledge/_module-readme-conventions.md` and `prospec/ai-knowledge/_diagram-conventions.md` — the canonical module-README structure and diagram rules to generate against (this skill's Step 4 mirrors `_module-readme-conventions.md`)
3. [STABLE] Read `prospec/CONSTITUTION.md` — if exists
4. [DYNAMIC] Ensure `prospec/ai-knowledge/raw-scan.md` is current, then read it — first run `prospec knowledge init --raw-scan-only` (deterministic, no LLM; creates it if absent) so READMEs generate against the real current structure; if `prospec` is unavailable, see Prerequisite for the fallback ladder. `module-map.yaml` must already exist (init bootstrap)
5. [DYNAMIC] Read `prospec/index.md` — if exists
6. [DYNAMIC] Read `.prospec.yaml` → check `knowledge.strategy` (auto|architecture|domain|package) and `knowledge.token_budget`

## Prerequisite

Run `prospec knowledge init` first to generate `raw-scan.md`, `module-map.yaml`, and empty
scaffolding. On re-runs, Startup Loading keeps `raw-scan.md` current with the code via this
deterministic fallback ladder (no Python/bash, Windows-safe):

1. `prospec knowledge init --raw-scan-only` — global install on PATH.
2. `pnpm exec prospec knowledge init --raw-scan-only` / `npx -y prospec knowledge init --raw-scan-only` — when prospec is a
   project devDependency or fetchable via npx (the common "cloned the repo, no global install" case).
3. No Node toolchain at all → skip the refresh and proceed with the existing `raw-scan.md`, stating
   it may be stale and recommending the user install prospec for an exact scan (Node.js projects: add
   `prospec` to `devDependencies`; other ecosystems: `npm i -g prospec`, which still needs Node on the
   machine). As a last resort the agent MAY derive structure directly from the working tree — mark it
   **approximate, not deterministic**.

`module-map.yaml` is only produced by a full `prospec knowledge init` (bootstrap), never by `--raw-scan-only` — so a
first-ever run still needs the full init.

## Progressive Knowledge Loading Strategy

| Layer | Files | When to Load | Token Budget |
|-------|-------|-------------|-------------|
| **L0** | `AGENTS.md` / `CLAUDE.md` | Every conversation (auto-injected via agent config) | ~500 tokens |
| **L1** | `prospec/index.md` + Core Conventions + Context-specific artifacts | At startup (acts as entry point and current task context) | ≤ 1,500 tokens total |
| **L2** | `prospec/ai-knowledge/modules/{name}/README.md` + Demand Conventions + `prospec/specs/features/*.md` | When Skill identifies related modules/features from L1 keywords | ≤ 400 tokens per module/feature |
| **L3** | Source code files | When Agent needs implementation details | No limit (read on demand) |

**Principles:**
1. L0 answers "how to use skills" — L1 answers "where to look" and "what to do" — L2 answers "what it does" (Feature Spec) and "how to modify" (Module README) — L3 answers "how to write"
2. Each layer must NOT duplicate information available in a lower layer
3. The README (plus any linked `{sub-module}.md`) is the only knowledge per module — no api-surface.md, dependencies.md, or patterns.md
4. Sub-modules are an L2 sub-layer reached via the README's `## Sub-Modules` links — never listed in `prospec/index.md`

**Why budgets matter:** AI agents load L1 on every task. Bloated L1 wastes tokens on irrelevant context. L2 is loaded per-module — concise READMEs mean more modules fit in context.

## Core Workflow

### Step 1: Analyze Project Type

Identify project type from raw-scan.md:

| Indicator | CLI Tool | Backend API | SPA Frontend | Mobile App | Monorepo |
|-----------|----------|-------------|--------------|------------|----------|
| Entry | bin/, CLI entry | server.ts, app.ts | main.ts, App.tsx | App.tsx, main.dart | packages/ |
| Dirs | commands/, cli/ | routes/, controllers/ | components/, pages/ | screens/, navigation/ | packages/, apps/ |
| Framework | commander, yargs | express, fastify, django | react, vue, angular | react-native, flutter | turborepo, nx |
| Config | — | — | vite.config, next.config | app.json, pubspec.yaml | workspace config |

The table is a reference only — actual splitting should follow the project's real structure. A project may be a **hybrid** (e.g., full-stack with both backend API and frontend).

### Step 2: Determine Granularity Strategy

Read `.prospec.yaml` → `knowledge.strategy` and apply:

| Strategy | When to Use | Module = |
|----------|------------|----------|
| `architecture` | CLI tools, libraries with clear layer structure | Top-level `src/` directory (e.g., `commands/`, `lib/`, `services/`) |
| `domain` | Frontend apps, feature-organized projects | Business domain inferred from routes/components/pages naming |
| `package` | Monorepos, multi-package workspaces | Each workspace package (from pnpm-workspace.yaml, turbo.json, etc.) |
| `auto` (default) | Unknown or new projects | Try package → domain → architecture; pick first with ≥2 modules |

**After determining strategy, tell the user:**
> "Detected: [project type] ([framework]). Strategy: [strategy]. Modules: [count] ([list])."

### Step 3: Decide Module Boundaries

Apply the chosen strategy to split the project into modules. Guidelines:

- **Minimum**: 2 modules (even small projects have distinct responsibilities)
- **Maximum**: ~15 modules (more means too fine-grained; consider merging)
- **Merge**: Small directories with <3 files into their parent module
- **Split**: Large modules with >30 files into sub-domains if clear boundaries exist
- Each module must have a clear, distinct responsibility

### Step 4: Create Module README.md (Recipe-First Format)

For each module, generate **exactly one file**: `prospec/ai-knowledge/modules/{module}/README.md`

**Recipe-First structure** (each section concise, total ≤100 lines):

```markdown
# {module_name}

> One-line description of what this module does

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `path/to/file.ts` | Brief purpose |

(Top 10 most important files only)

## Public API

- `functionName()` — what it does (1-line)
- `ClassName` — what it does (1-line)

(Signature + 1-line description. Max 8 entries. Agent reads source (L2) for full API.)

## Dependencies

**Depends on:** `module-a` (why), `module-b` (why)
**Used by:** `module-c`, `module-d`

## Modification Guide

When changing this module:
1. [Step-by-step guidance for common modifications]
2. [What to update together]

## Ripple Effects

Changes here affect:
- [What breaks or needs updating in other modules]

## Pitfalls

- [Common mistakes when modifying this module]
- [Non-obvious constraints or gotchas]

## Sub-Modules

- [Sub Name](./{sub-module}.md) — one-line summary

(Only when this module was split — see "Step 4.5". Omit the section otherwise.)

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
```

**Key principles:**
- **Canonical template**: this Recipe-First structure mirrors `prospec/ai-knowledge/_module-readme-conventions.md` — if the two ever diverge, that file wins. (Section order, `# {ProperName}` title, and the `prospec:auto`/`prospec:user` marker contract are defined there.)
- **No api-surface.md, dependencies.md, or patterns.md** — all information consolidated into README.md (or its sub-module files, see Step 4.5)
- **Modification Guide > API Reference** — tell agents HOW to change, not just WHAT exists
- **Ripple Effects** — prevent agents from making isolated changes that break other modules
- **Pitfalls** — capture tribal knowledge that prevents repeated mistakes

### Step 4.5: Extract Sub-Modules (only when a README would overflow)

If a module's README would exceed the ≤100 line / ≤400 token budget even after reasonable trimming, AND it contains a **content-rich, functionally-independent** sub-area, extract that area into a sub-module file instead of trimming away useful detail (canonical rules: `prospec/ai-knowledge/_module-readme-conventions.md`).

- **Both conditions required** — overflow AND a self-contained sub-area (rich enough for its own Key Files / Public API / Pitfalls, understandable on its own). If only one holds, just trim.
- **Layout**: `prospec/ai-knowledge/modules/{module}/{sub-module}.md` — a sibling of `README.md`, kebab-case, same Recipe-First structure and same budget. A sub-module that still overflows is split again the same way.
- **Link back**: add a `## Sub-Modules` section to the main README listing `[Sub Name](./{sub-module}.md) — one-line`; move the extracted detail into the sub-module file (do not duplicate it back).
- **Not in `prospec/index.md`**: sub-modules are an L2 sub-layer discovered via the main README only — do NOT add them to `prospec/index.md` or `module-map.yaml` (keep L1 lean). If an area deserves an `prospec/index.md` entry, make it a real top-level module instead.

### Step 5: Populate prospec/index.md

> **Single source = `module-map.yaml`.** The curated columns — Keywords, Aliases, Rationale,
> Description, and Depends On (via `relationships.depends_on`) — are curated in
> `prospec/ai-knowledge/module-map.yaml`; `prospec/index.md`'s `prospec:auto` block is
> **generated** from it. Curate these fields in `module-map.yaml`, not by hand-editing the index
> table — `/prospec-knowledge-update` regenerates the auto block from `module-map.yaml` (blanking any
> index-only curated cell). Fill the table below only for a first-pass bootstrap; the values belong in
> `module-map.yaml`.

Fill module table within `prospec:auto-start/end` markers using new format:

```
| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
```

- **Keywords**: exact identifiers an agent would search (file/symbol names, technical terms)
- **Aliases**: synonyms and natural-language terms that should still match this module — include terms in the project's artifact language (per the Constitution's Language Policy) and common synonyms (business logic, use case). Widens keyword-match coverage so L1 loading hits the right module without a semantic search.
- **Rationale**: Why this module exists as a separate unit (1 sentence)
- **Status**: Active / Deprecated / New

**Category grouping (optional, judgment-gated):**

When the modules fall into **≥2 meaningful domain categories** (e.g. by feature area), group the
table into `### {Category}` sub-tables instead of one flat table — each sub-table reuses the SAME
column layout above. When modules are only architectural layers (types/lib/services/cli) with no
domain split, keep ONE flat table — do not force grouping.

- **Derive** each module's category from its paths, keywords, and purpose. Record it in
  `module-map.yaml` as an ordered `category: [primary, …secondary]` list — the single source of
  truth. Propose it, confirm with the user, then write it back; on later runs read category from
  `module-map.yaml` and never re-guess a module that already has one.
- **Primary first**: a module appears under its primary (`category[0]`) `### {Category}` heading
  **exactly once** — never list it under two headings (the index must stay duplicate-free). Secondary
  categories live only in `module-map.yaml` (surfaced by the MCP `search_modules` join), not in `prospec/index.md`.
- Keep the whole L1 within budget regardless of grouping (≤ 1,500 tokens).


### Step 6: Populate _conventions.md

Naming conventions, project-specific patterns, directory conventions, import ordering rules.

### Step 7: Quality Check

- Each module has clear responsibility boundaries
- No circular dependencies between modules
- **Each module README (and each sub-module) ≤ 100 lines** — if it overflows, first extract a content-rich, independent sub-area (Step 4.5); only trim when there is no such sub-area
- Every extracted sub-module is linked from its parent README's `## Sub-Modules` section and is NOT listed in `prospec/index.md`
- README contains all Recipe-First sections (Key Files, Public API, Dependencies, Modification Guide, Ripple Effects, Pitfalls)
- prospec/index.md has Aliases + Rationale columns
- If grouped, every `### {Category}` sub-table reuses the identical column layout (keeps the index machine-parseable) and each module is listed under its primary category only
- **L1 total (prospec/index.md + _conventions.md) ≤ 1,500 tokens** (estimate ~4 chars/token)
- All `prospec:user-start/end` content preserved
- Strategy matches project structure (auto resolved correctly)

### Step 8: Constitution Emptiness Check

After Knowledge is generated, read `prospec/CONSTITUTION.md`. If it is absent, contains only blank
lines or comments, or holds only the
seeded example rules and the Language Policy (no project-authored rules), it is
**substantively empty** — tell the user that `/prospec-verify` and the Entry/Exit gates stay no-ops
until real principles exist, and point them to edit `prospec/CONSTITUTION.md`. Advisory — do not block.

## Output Contract

> After running, self-assess and emit a concise Output Summary. Every Success Criterion must be objectively checkable (file existence / grep / test result / count) — no subjective adjectives.

### Success Criteria
- [ ] each module has exactly one Recipe-First README
- [ ] prospec/index.md has the module table + Progressive Knowledge Loading Strategy section
- [ ] L1 total <= 1,500 tokens
- [ ] >= 2 modules

### Failure Conditions
- ran without raw-scan.md
- produced api-surface.md / dependencies.md / patterns.md

### Output Summary
Emit one line: `Met N/M | Unmet: <items> | Overall: PASS|WARN|FAIL | Next: <one-line>`

## NEVER

- **NEVER** overwrite content between `prospec:user-start/end` markers — these are user notes, always preserve
- **NEVER** start without raw-scan.md — Startup Loading runs `prospec knowledge init --raw-scan-only` to (re)generate it (CLI fallback ladder in Prerequisite); only if no `raw-scan.md` exists AND no runtime can produce one, stop and prompt `prospec knowledge init`
- **NEVER** create circular module dependencies — module dependency graph must be a DAG
- **NEVER** put all files in a single module — even small projects need 2-3 responsibility modules minimum
- **NEVER** ignore Tech Stack info from raw-scan.md — it affects module splitting strategy
- **NEVER** write outdated file paths in READMEs — all paths must come from raw-scan.md real data
- **NEVER** generate api-surface.md, dependencies.md, or patterns.md — all info goes in README.md only
- **NEVER** exceed 100 lines per module README or sub-module — when it overflows, extract an independent sub-area to `{module}/{sub-module}.md` (Step 4.5) before resorting to lossy trimming; agent uses L2 (source) for details
- **NEVER** list sub-modules in `prospec/index.md` or `module-map.yaml` — they are an L2 sub-layer reached only via the parent README's `## Sub-Modules` links
- **NEVER** duplicate source code in README — use function signatures and 1-line descriptions; the README is a map, not a copy

## Error Handling

| Scenario | Action |
|----------|--------|
| raw-scan.md stale or missing | Refresh via the Prerequisite CLI ladder (`prospec knowledge init --raw-scan-only` → `pnpm exec`/`npx` → degrade); `module-map.yaml` absent → `prospec knowledge init` |
| No runtime can run prospec (no Node) | Proceed with existing `raw-scan.md` (state it may be stale) or an approximate working-tree scan; recommend installing prospec — never proceed silently |
| raw-scan.md incomplete | List missing sections, suggest re-running `prospec knowledge init --raw-scan-only` (or full init) or manual completion |
| Module README already exists | Only overwrite auto sections, preserve user sections |
| Strategy produces <2 modules | Fall back to `architecture` strategy |
| Module README exceeds 100 lines | If a content-rich, independent sub-area exists → extract a sub-module (Step 4.5) and link it; otherwise trim Key Files and Public API, keeping Modification Guide and Pitfalls intact |
| Ambiguous project type | Ask user to clarify, or treat as hybrid |
