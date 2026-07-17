---
feature: ai-knowledge
status: active
last_updated: 2026-07-09
story_count: 15
req_count: 54
---

# AI Knowledge

## Who & Why

Serves developers and AI Agents using Prospec. AI Knowledge is a structured project-memory system — through source-code scanning, AI-driven module-documentation generation, and an incremental update mechanism, it lets an AI Agent quickly load precise project context and save 70%+ token consumption. This is Prospec's core differentiating capability.

## User Stories & Behavior Specifications

### US-300: Source-Code Scanning and Path Patterns [P0]

As a developer,
I want Prospec to scan source code according to the configured path patterns and produce raw-scan.md,
so that the AI can generate module documentation from a complete source-code snapshot.

**Acceptance Scenarios:**
- WHEN executing `prospec knowledge init` THEN produce raw-scan.md
- WHEN `.prospec.yaml` defines path patterns THEN only scan files matching the patterns

#### REQ-KNOW-001: Read Path Patterns
- WHEN `.prospec.yaml` defines path patterns, THEN only scan files matching patterns
- WHEN no path patterns defined, THEN use default scan rules

#### REQ-KNOW-002: Scan Source Code Files
- WHEN executing `prospec knowledge init`, THEN scan source code and produce raw-scan.md
- WHEN raw-scan.md already exists, THEN overwrite and update

#### REQ-KNOW-007: Sensitive File Exclusion
- WHEN no custom exclusion rules, THEN default exclude `*.env*`, `*credential*`, `*secret*`
- WHEN `.prospec.yaml` defines `exclude` list, THEN use custom exclusion rules

---

### US-301: AI-Driven Module Detection and Classification [P0]

As a developer,
I want the AI to auto-detect module boundaries or use a predefined module-map.yaml,
so that the module split reflects the real project architecture.

**Acceptance Scenarios:**
- WHEN module-map.yaml exists THEN prefer the predefined classification
- WHEN module-map.yaml does not exist THEN the AI auto-determines module boundaries
- WHEN executing `prospec knowledge init` and module-map.yaml does not exist THEN produce module-map.yaml from the detected modules

#### REQ-KNOW-003: Use Module Map for Classification
- WHEN module-map.yaml exists, THEN use predefined classification, preserving `keywords` and `relationships`
- WHEN module-map.yaml doesn't exist, THEN AI auto-determines module boundaries from raw-scan.md

#### REQ-KNOW-014: Flexible Granularity Strategy
- WHEN `.prospec.yaml` sets `knowledge.strategy` (auto/architecture/domain/package), THEN module-detector splits accordingly
- WHEN strategy is `domain`, THEN split modules by business domain
- WHEN strategy is `auto`, THEN try package → domain → architecture and pick the best result

#### REQ-SERVICES-025: Generate Module Map in Knowledge Init
`prospec knowledge init` produces `module-map.yaml` from detected modules after scanning, via the `buildModuleMap` helper.

**Scenarios:**
- WHEN executing `prospec knowledge init` and module-map.yaml does not exist, THEN generate it at the configured knowledge base path
- WHEN module-map.yaml already exists, THEN do not overwrite it (preserve the curated version) and do not list it in outputFiles

#### REQ-LIB-011: Module Map Resolution Honors Base Dir
`detectModules` accepts a `knowledgeBasePath`; `loadExistingModuleMap` resolves `module-map.yaml` under it (relative to cwd or absolute) rather than a hardcoded `docs/ai-knowledge`.

**Scenarios:**
- WHEN a custom knowledge base path is provided, THEN load the existing module-map.yaml from that path
- WHEN no knowledge base path is provided, THEN fall back to legacy `docs/ai-knowledge` (backward compatible)

---

### US-302: Generate Module README Documents [P0]

As a developer,
I want each module to automatically produce a structured README.md,
so that an AI Agent can quickly understand the module's responsibilities, API, and key files.

**Acceptance Scenarios:**
- WHEN module detection completes THEN produce `ai-knowledge/modules/{name}/README.md`
- WHEN using `--dry-run` THEN preview the output but do not write files
- WHEN README.md already exists THEN use ContentMerger to preserve user-customized sections

#### REQ-KNOW-004: Generate Module README (Recipe-First)
- WHEN module detected, THEN create `{base_dir}/ai-knowledge/modules/{name}/README.md`
- WHEN generating README, THEN follow Recipe-First order: Overview → Key Files → Public API → Dependencies → Modification Guide → Ripple Effects → Pitfalls
- WHEN module directory written, THEN contain only README.md (no api-surface.md or redundant files)
- WHEN README.md already exists, THEN use ContentMerger to preserve user sections
- WHEN scanning a module's files for key files (`getModuleInfos` / `updateModuleReadme`), THEN interpret each `module-map.yaml` `paths` entry through `moduleScanPatterns` (REQ-LIB-029): a directory expands to its subtree, a single file scans only itself, a glob passes through verbatim — a bare directory entry no longer matches zero files

#### REQ-KNOW-006: Dry-run Preview Mode
- WHEN executing `prospec knowledge generate --dry-run`, THEN display file list without creating
- WHEN `--dry-run` specified, THEN show estimated line count per file and L1/L2 token totals

#### REQ-KNOW-010: Recipe-First README Sections
- WHEN generating module README, THEN include `## Modification Guide` listing 2-5 modification scenarios
- WHEN generating module README, THEN include `## Ripple Effects` listing cross-module impacts
- WHEN generating module README, THEN include `## Pitfalls` listing 2-3 common mistakes

#### REQ-KNOW-011: Module README Token Budget
- WHEN generating module README, THEN keep within 100 lines and a ≤1,000 token budget (`l2_per_module`; calibrated by #64)
- WHEN listing Public API, THEN include only public signatures with a one-line purpose

#### REQ-KNOW-015: Convention Docs as Single Source of Truth
- WHEN generating or updating module READMEs, THEN defer to `ai-knowledge/_module-readme-conventions.md`, `_diagram-conventions.md` and `_status-lifecycle.md` as the single source of truth
- WHEN a convention is defined in those docs, THEN reference them instead of duplicating the rules inline in skill references

#### REQ-KNOW-021: Module README Dependencies Canonical Labels
- WHEN rendering the module-README scaffold or the knowledge-generate skeleton, THEN the Dependencies block uses canonical `**Depends on:**` / `**Used by:**` labels (per `_module-readme-conventions.md`)
- WHEN locking the format, THEN a contract test asserts both labels render

---

### US-303: Module Index Maintenance [P0]

As a developer,
I want the root-level `{base_dir}/index.md` to automatically maintain every module's name, keywords, and description,
so that an AI Agent can quickly locate relevant modules from the index.

**Acceptance Scenarios:**
- WHEN module generation completes THEN `{base_dir}/index.md` reflects all modules
- WHEN re-executing knowledge generate THEN update the index rather than rebuild it

#### REQ-KNOW-005: Update Module Index
- WHEN module generation complete, THEN `{base_dir}/index.md` reflects all modules with dependencies
- WHEN re-executing knowledge generate, THEN update index rather than recreate
- WHEN rendering the index table, THEN use columns Module | Keywords | Aliases | Status | Description | Rationale | Depends On — the header derives from the single canonical column constant (REQ-KNOW-020), never hardcoded per emitter
- WHEN writing `{base_dir}/index.md`, THEN append a `## Progressive Knowledge Loading Strategy` section
- WHEN modules fall into ≥2 domain categories, THEN MAY group the table into `### {Category}` sub-tables (same columns; module listed under its primary category only); pure architectural-layer projects keep one flat table (see US-340)

#### REQ-KNOW-020: Canonical Index-Table Column Schema (Single Source)
- WHEN any `index.md` emitter renders the module table, THEN its columns derive from one shared constant in `types` (names, indices, header, separator) — no per-emitter hardcoded copy
- WHEN a `.hbs` template needs the header, THEN the render service injects it from the constant; static skill-doc examples are locked to it by contract test
- WHEN a consumer parses the table, THEN it reads columns by the canonical index/labels from the same constant

#### REQ-KNOW-008: Index Idempotent Update
- WHEN `{base_dir}/index.md` already exists, THEN update auto section **preserving curated columns** (Keywords/Aliases/Rationale/Depends On generated from `module-map.yaml` as the single source, never blanked to `—`), preserve user section
- WHEN the existing index.md holds curated columns not yet in module-map, THEN no-clobber backfill them into `module-map.yaml` (bootstrap-once) before regenerating
- WHEN module directory already exists, THEN update README.md rather than rebuild

#### REQ-KNOW-012: Module Split Rationale Transparency
- WHEN rendering `{base_dir}/index.md`, THEN each module has a Rationale cell explaining the split decision
- WHEN knowledge.service generates `{base_dir}/index.md`, THEN auto-infer and fill the Rationale

#### REQ-TYPES-056: ModuleEntry Curated Index Columns
`ModuleEntrySchema` carries the curated index columns as optional fields — `aliases` (`string[]`) and `rationale` (`string`), alongside the existing `keywords`/`description`/`relationships.depends_on` — so `module-map.yaml` is the single source every index.md column is generated from.
- WHEN validating an existing module-map.yaml without these fields, THEN it still passes (optional)
- WHEN a new project scaffolds module-map.yaml, THEN the template shows `aliases`/`rationale` for curation

#### REQ-LIB-026: Index-Table Single-Source Helpers
lib provides `buildIndexRow`/`buildIndexTable` (render all 7 columns from module data, positioned by `INDEX_COLUMN`, reorder-safe, `—` for empties), extends `parseIndexModules` to resolve rationale/dependsOn, and provides `backfillCuratedFromIndex` (seed curated content columns index→module-map, no-clobber + idempotent, skipping `relationships.depends_on`).
- WHEN building a row, THEN column order/header derive from the canonical `types` constant (REQ-KNOW-020)
- WHEN backfilling, THEN a non-empty module-map value is never overwritten; a second run makes no change (idempotent)

#### REQ-KNOW-036: updateIndex Generates From module-map + No-Clobber Migration
`knowledge-update` `updateIndex` renders the module table from `module-map.yaml` (curated columns preserved, not blanked to `—`); `execute()` backfills an existing index.md's curated columns into module-map (no-clobber, bootstrap-once) before rebuilding, so downstream projects migrate losslessly on first `/prospec-knowledge-update`.
- WHEN updating an index that holds curated content, THEN the regenerated auto block preserves Keywords/Aliases/Rationale/Description
- WHEN module-map lacks a curated column the index has, THEN it is backfilled before regen; a second run is idempotent
- WHEN a module-map curated column is cleared, THEN the regenerated cell shows `—` (mutation-verifiable)

#### REQ-KNOW-037: index.md Description Column Is Routing-Only
The `index.md` Modules-table `Description` column carries only routing-level positioning (1-2 sentences on what the module is / when to look here), never accumulated implementation detail (REQ ids, function names, per-change behavior) — that lives in L2 (module README + sub-modules), per index.md Principle 2 (no lower-layer duplication).
- WHEN rendering the `Description` cell, THEN it is routing-only; implementation detail lives in the module README/sub-modules and the Keywords/Aliases/Status/Depends On columns
- WHEN curating a module's positioning, THEN edit `module-map.yaml` `description` (the single source); the index cell is regenerated from it (a non-empty module-map value is never overwritten by the index backfill)
- WHEN measuring `index.md`, THEN it stays within the L1 per-file token budget (`knowledge-size` PASS)

#### REQ-KNOW-013: L0-L3 Layered Loading
- WHEN generating `{base_dir}/index.md`, THEN append a `## Progressive Knowledge Loading Strategy` section reflecting L0 (`AGENTS.md`/`CLAUDE.md`, auto-injected) → L1 (root `index.md` + Core Conventions, ≤1,800 tokens per file, actively read at task start — NOT auto-loaded) → L2 (module READMEs ≤1,000 tokens/module + load-on-demand conventions + feature specs) → L3 (source code, unlimited)
- WHEN Skill templates reference Knowledge, THEN their Loading Strategy stays consistent with the L0-L3 definitions
- WHEN the Loading Strategy note names its budget source (skill templates + generated `index.md`), THEN it points to `.prospec.yaml` `knowledge.token_budget` and `prospec check knowledge-size` (downstream-visible / runnable), never the internal `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` symbol

---

### US-310: Incremental Knowledge Update [P0]

As a developer using Prospec,
I want AI Knowledge to be incrementally updated automatically when a change is archived,
so that module documentation stays in sync with the code without a full regeneration.

**Acceptance Scenarios:**
- WHEN a change is archived THEN automatically trigger the incremental update
- WHEN delta-spec.md exists THEN parse ADDED/MODIFIED/REMOVED to identify affected modules
- WHEN the update completes THEN return the list of updated/created/deprecated modules

#### REQ-SERVICES-020: Delta Spec Parser
- WHEN delta-spec.md contains REQ IDs, THEN extract module names from `REQ-{MODULE}-{NNN}` format
- WHEN delta-spec is empty or malformed, THEN return empty structure without error

#### REQ-SERVICES-021: Incremental Module Update
- WHEN module affected by ADDED, THEN create or update module README.md
- WHEN module affected by REMOVED, THEN mark as deprecated (don't delete)
- WHEN updating README.md, THEN use ContentMerger to preserve user sections

#### REQ-SERVICES-022: Index and Module Map Update
- WHEN module updated, THEN `{base_dir}/index.md` reflects latest state
- WHEN new module added, THEN module-map.yaml includes new entry
- WHEN module-map.yaml doesn't exist, THEN gracefully skip
- WHEN updating, THEN preserve each existing module's `category` (do not re-guess); an ADDED module gets an ordered `category` consistent with existing grouping

#### REQ-SERVICES-023: Knowledge Update Coordinator
- WHEN deltaSpecPath provided, THEN auto-parse and identify affected modules
- WHEN manualModules provided, THEN only update specified module READMEs
- WHEN triggered from archive, THEN failure is non-fatal error

#### REQ-SERVICES-032: Feature-Prefix-Aware Module Resolution (Mint Guard)
When knowledge-update parses a delta-spec entry, an entry whose prefix hits the feature-map `req_prefixes` (a feature-prefix, not a module — the real source of phantom minting) resolves to `feature.modules ∪ relatedModules ∩ known`, and never treats the prefix as a module name to mint a phantom `modules/<prefix>/`; if resolution yields the empty set, skip + push a warning. A module-prefix REQ keeps its original resolution (including the new-module `src/<name>/**` fallback). Adds a `relatedModules` option and loads the feature-map.
- WHEN an entry prefix is a feature-map req_prefix and resolves to no known module, THEN skip that entry + warning, with zero filesystem writes (do not mint modules/&lt;prefix&gt;/)
- WHEN an entry is a module-prefix REQ, THEN keep the original resolution behavior unchanged

---

### US-320: Knowledge-SDD Pipeline Quality Gate [P1]

As a developer using Prospec,
I want every SDD phase to have a structured Knowledge-loading mechanism and a quality gate,
so that the AI produces more precise artifacts and Knowledge's value is fully leveraged across the SDD pipeline.

**Acceptance Scenarios:**
- WHEN the Planning Skill is triggered THEN display the Knowledge Quality Gate table
- WHEN the Plan phase detects a Brownfield project THEN produce a Technical Summary
- WHEN the Verify phase runs THEN check the staleness of Spec against Knowledge

#### REQ-TEMPLATES-040: Knowledge Quality Gate
- WHEN Planning Skill triggered, THEN display Knowledge Quality Gate table
- WHEN required Knowledge missing, THEN warn but don't block workflow

#### REQ-TEMPLATES-041: Plan Brownfield/Greenfield Detection
- WHEN AI Knowledge modules exist, THEN detect as Brownfield
- WHEN no AI Knowledge modules, THEN detect as Greenfield

#### REQ-TEMPLATES-045: Verify Spec-Knowledge Staleness Detection
- WHEN delta-spec MODIFIED but module README not updated, THEN informational note + pointer to the **verify S/A commit prompt** (fold the sync in before commit; the archive Entry Gate is the backstop) (does not count toward the grade; consistent with the same-named REQ in sdd-workflow)

---

### US-330: Module Knowledge Sub-Modularization [P1]

As a developer,
I want an oversized module README to be able to extract a functionally-independent sub-area into a sub-module file,
so that valuable detail is preserved while staying within the README token budget, rather than lossy trimming.

**Acceptance Scenarios:**
- WHEN a module README exceeds the ≤100 line / ≤400 token budget and contains a content-rich, functionally-independent sub-area THEN extract it to `modules/{module}/{sub-module}.md`
- WHEN extracting a sub-module THEN the main README links it via a `## Sub-Modules` section
- WHEN loading a module README (L2) THEN also load its linked sub-modules

#### REQ-KNOW-016: Sub-Module Extraction over Lossy Trimming
- WHEN a module README would exceed its ≤100 line / ≤400 token budget and contains a content-rich, functionally-independent sub-area, THEN extract it to `modules/{module}/{sub-module}.md` instead of trimming away detail
- WHEN extraction happens, THEN the main README links each sub-module from a `## Sub-Modules` section
- WHEN knowledge-generate runs, THEN Step 4.5 performs extraction and emits a skeleton `## Sub-Modules` section

#### REQ-KNOW-017: Sub-Module Loading and Index Exclusion
- WHEN loading a module README (L2), THEN also load the `{sub-module}.md` files it links
- WHEN building `{base_dir}/index.md`, THEN never list sub-modules so L1 stays a lean top-level map; sub-modules are discovered only through `## Sub-Modules` links
- WHEN the `{base_dir}/index.md` Progressive Knowledge Loading Strategy renders, THEN L2 covers README + linked sub-modules

#### REQ-SERVICES-024: Sub-Module Maintenance on Update
- WHEN knowledge-update scans a module, THEN read its linked sub-modules
- WHEN a MODIFIED requirement enriches a module, THEN maintain or extract sub-modules instead of cramming detail back into the README

---

### US-340: Category-Grouped Module Index [P2]

As a developer navigating AI Knowledge in a project with many domain modules,
I want the `{base_dir}/index.md` module table to group by category into `### {Category}` sub-tables, with the classification single-sourced from `module-map.yaml`,
so that I can quickly locate modules by domain without manually maintaining a duplicated classification table.

**Acceptance Scenarios:**
- WHEN modules fall into ≥2 meaningful domain categories THEN `{base_dir}/index.md` groups them under `### {Category}` sub-headings, each sub-table keeping the same columns
- WHEN modules are only architectural layers (such as prospec itself) THEN keep a single flat table and do not add category to module-map
- WHEN module-map already has category THEN group by the first (primary) one without re-guessing; when category is missing, generate auto-infers a suggestion and writes it back

#### REQ-TYPES-028: module-map ModuleEntry Ordered category
`ModuleEntrySchema` adds an optional `category: string[]` (ordered, `[0]` = primary), backward-compatible (absent = flat table; `loadModuleMap` still loads existing maps without category); the single source of truth for classification.

#### REQ-KNOW-018: index.md Presentation Grouped by Category
knowledge-generate/update groups the auto section into `### {Category}` sub-tables when there are ≥2 domain categories; each sub-table has consistent columns, and `parseIndexModules` still correctly enumerates all modules from the grouped output.

**Scenarios:**
- WHEN ≥2 domains THEN produce ≥2 `### {Category}` sub-headings; <2 or purely layered THEN a single flat table
- WHEN re-run THEN grouping is stable and the `prospec:user` section is preserved
- WHEN `parseIndexModules` parses the grouped output THEN the returned module count = the actual count (duplicate header/separator rows are skipped)

#### REQ-KNOW-019: generate Auto-Infers category and Persists It
generate infers a suggested category from path/keywords/domain semantics, writes it to `module-map.yaml` after user confirmation (bootstrap), and thereafter treats the file as authoritative (an existing category is not re-guessed); the user may manually override it — rendering and the source of truth share the same category value.

---

### US-350: Deterministic raw-scan Refresh (init --raw-scan-only) [P1]

As a prospec project maintainer (or an AI agent running at the tail of the SDD flow),
I want a deterministic CLI operation that only regenerates raw-scan.md (`knowledge init --raw-scan-only`),
so that after code changes I can obtain the latest structure snapshot without re-running a full init and without invoking an LLM.

**Acceptance Scenarios:**
- WHEN executing `prospec knowledge init --raw-scan-only` THEN regenerate raw-scan.md from the current source code, with curated files (module-map/index/_conventions) staying byte-identical (not seeded even when absent)
- WHEN `--dry-run` THEN write no files
- WHEN raw-scan.md does not exist THEN produce it directly (same as the first run)

#### REQ-KNOW-022: Deterministic Raw-Scan-Only Regeneration
- WHEN executing `prospec knowledge init --raw-scan-only`, THEN regenerate raw-scan.md from current code without an LLM
- WHEN `--raw-scan-only` runs, THEN module-map.yaml / `{base_dir}/index.md` / _conventions.md stay byte-identical (never created or overwritten — incl. the absent case)
- WHEN `--dry-run` / `--depth <n>` given with `--raw-scan-only`, THEN preview-only / honor depth
- WHEN raw-scan.md is absent, THEN create it
- WHEN the surface evolves, THEN the standalone `prospec knowledge refresh` command is removed (folded into the flag)

#### REQ-KNOW-023: Single Shared Raw-Scan Core
- WHEN producing raw-scan.md from any entry point, THEN go through one `generateRawScan()` shared by knowledge-init (incl. `--raw-scan-only`) and `prospec upgrade` (the refresh-command `execute` delegate removed; archive no longer a consumer)
- WHEN init delegates to the shared core, THEN its external behavior (outputs, dry-run, counts) is unchanged
- WHEN layering code, THEN dependency direction stays cli → services → lib → types

---

### US-351: Lifecycle Integration of raw-scan Refresh [P2]

As a prospec user,
I want raw-scan.md to stay automatically up to date at key points in the flow, and to degrade gracefully when the prospec CLI is unavailable,
so that the structure snapshot does not rely on human memory and downstream developers without prospec installed are not blocked.

**Acceptance Scenarios:**
- WHEN the `/prospec-archive` flow finishes THEN raw-scan.md is refreshed (archive.service non-fatal trigger)
- WHEN `/prospec-knowledge-generate` starts up THEN refresh raw-scan before reading it
- WHEN the prospec CLI is unavailable THEN degrade per persona (developer skills take the fallback ladder; quickstart prompts to install)

#### REQ-KNOW-024: Archive Auto-Refresh (Non-Fatal)
- WHEN archive succeeds and the knowledge-update loop completes, THEN archive.service triggers `generateRawScan` and reports `rawScanRefreshed`
- WHEN the refresh throws, THEN it is non-fatal (archiving still succeeds)
- WHEN the `/prospec-archive` skill runs, THEN Phase 4 documents the `prospec knowledge init --raw-scan-only` step (operative driver for the LLM-driven flow)

#### REQ-KNOW-025: Generate-Time Refresh + Precondition
- WHEN `/prospec-knowledge-generate` Startup Loading runs, THEN it refreshes raw-scan (creating it if absent) before reading it, so READMEs generate against the real current structure
- WHEN rewording the precondition, THEN raw-scan.md stays the read input and the first backtick token of the loading item, so the startup-loading baseline needs no regeneration
- WHEN module-map.yaml is absent, THEN init bootstrap is still required

#### REQ-KNOW-026: Persona-Aware CLI Fallback
- WHEN a developer skill (knowledge-generate / archive) cannot reach `prospec` on PATH, THEN fall back `pnpm exec` / `npx` → degrade to the existing raw-scan (or an approximate working-tree scan), never silently
- WHEN the adopter skill (quickstart) cannot reach the CLI, THEN stop and prompt to install prospec (no npx fallback)
- WHEN recommending a devDependency install, THEN condition it on Node.js projects (other ecosystems get a global-install recommendation)

---

### US-352: raw-scan Multi-Language Detection [P1]

As a developer running prospec on a non-JS/TS project (Python/Go/Rust/Java/C#/Ruby/PHP/C/C++/Swift),
I want raw-scan to deterministically identify the project's language, entry points, dependencies, and config files,
so that Knowledge generation sees the real technical profile rather than a JS/TS-only view.

**Acceptance Scenarios:**
- WHEN the project uses a supported backend language THEN Tech Stack / Entry Points / Dependencies / Config Files reflect that language (deterministic, network-free)
- WHEN the manifest is an imperative DSL (CMakeLists.txt / Package.swift / Gradle / conanfile.py) THEN leave dependencies empty and defer to `/prospec-knowledge-generate` reading the source code
- WHEN the language is unsupported THEN `.prospec.yaml`'s `tech_stack` is the authoritative override; Directory Tree and File Stats always have values

#### REQ-KNOW-027: Multi-Ecosystem Dependency Parsing
- WHEN a primary manifest exists, THEN collectDependencies dispatches by ecosystem (Node/Python/Go/Rust/Maven/.NET/PHP) via the deterministic lib/manifest-parsers
- WHEN a manifest is malformed, THEN parsing returns `[]` (never throws); the scan stays network-free

#### REQ-KNOW-028: Backend Tech-Stack Detection
- WHEN go.mod/Cargo.toml/pom.xml/build.gradle/*.csproj/Gemfile/composer.json is present, THEN language + package_manager are detected
- WHEN `.prospec.yaml` tech_stack is set, THEN it stays authoritative over auto-detection

#### REQ-KNOW-029: Backend Entry-Point Detection
- WHEN backend entry conventions exist (main.go, src/main.rs, __main__.py, csproj OutputType=Exe, …), THEN they are listed; existing JS/TS + package.json behavior is unchanged

#### REQ-KNOW-030: Backend Config-File Patterns
- WHEN backend build/manifest files exist (pom.xml, build.gradle(.kts), *.csproj, Gemfile, composer.json, …), THEN they are listed as config files

#### REQ-KNOW-031: C/C++/Swift Structure Detection
- WHEN C/C++/Swift build/manifest files or entry points exist, THEN they are listed in Config Files and Entry Points (depth-agnostic patterns)

#### REQ-KNOW-032: Declarative C/C++ Dependency Parsing
- WHEN vcpkg.json or conanfile.txt is present with C-family source evidence, THEN its dependencies are listed; imperative CMake/Package.swift/conanfile.py are left to the LLM

#### REQ-KNOW-033: Swift + C/C++ Tech-Stack Detection
- WHEN Package.swift exists THEN swift/spm; WHEN a C-family build file + source extension exist THEN c/c++ via the extension heuristic (a bare Makefile is excluded), package_manager from the manifest
- WHEN detection and dependency collection both run, THEN Swift is ranked before C/C++ in each so the two sections never disagree

---

### US-353: knowledge-update Detects Format Drift and Asks for Consent [P2]

As a user continuously evolving prospec,
I want `/prospec-knowledge-update`, when updating AI Knowledge, to ask for my consent before updating the format if it finds existing file formats that do not match the current templates/conventions,
so that the Knowledge format can keep up with template evolution while my existing content is not rewritten without consent.

**Acceptance Scenarios:**
- WHEN knowledge-update detects that the existing Knowledge format does not match the current conventions/templates, THEN list the drift and ask whether to consent to updating the format
- WHEN I do not consent to the format update, THEN only perform the content incremental update and preserve the existing format
- WHEN there is no format drift, THEN perform the incremental update as usual without bothering me

#### REQ-TEMPLATES-122: prospec-knowledge-update Format-Drift Consent
`templates/skills/prospec-knowledge-update.hbs` adds a format-drift check: before updating Knowledge, compare whether the existing AI Knowledge files (the root-level `index.md` column schema against `_module-readme-conventions.md` and the INDEX column spec, and the module README structure) match the current template/conventions format; if drift is detected, list the drift and ask the user whether to consent to updating the format, changing the format only on consent (the content incremental update proceeds as usual). English-only baseline.

**Scenarios:**
- WHEN knowledge-update detects that the existing Knowledge format does not match the current conventions/templates, THEN list the drift and update the format only after the user consents
- WHEN the user does not consent to the format update, THEN only perform the content incremental update and preserve the existing format
- WHEN there is no format drift, THEN perform the incremental update as usual without bothering the user

---


#### REQ-TYPES-031: feature-map.yaml Schema (feature→module index)

---


#### REQ-TEMPLATES-113: feature-map.yaml.hbs Knowledge Template (single format authority)

---


#### REQ-SERVICES-029: archive Sole writer `syncFeatureMap` (bootstrap-once + no-clobber)

---


#### REQ-TEMPLATES-114: prospec-archive skill feature-map Regeneration Guidance

---


#### REQ-TESTS-032: feature-map schema/format/archive writer Tests

---

### US-354: Establish a Four-Layer Tiered Index Structure [P1]

As an AI agent and developer,
I want to promote `ai-knowledge/_index.md` to `prospec/index.md` and implement an L1~L3 index with a dynamic scan-filtering mechanism (core files must be actively read at task start, the rest load-on-demand), while keeping the L0 guidance in `AGENTS.md`/`CLAUDE.md`,
so that context overhead is reduced and the Token budget is precisely controlled.

**Acceptance Scenarios:**
- WHEN `prospec/index.md` is generated, THEN it should include the L1~L3 tier descriptions, and the L1 Conventions should distinguish the Core list from the load-on-demand file list.
- WHEN executing `prospec-knowledge-generate` or `update`, THEN the content should be written correctly to the root-level `prospec/index.md`.
- WHEN scanning `_*.md` files under `ai-knowledge/`, THEN it can filter out core versus load-on-demand files based on the core list.

#### REQ-KNOW-034: Root Level Index File
- WHEN `prospec knowledge generate` or `update` executes, THEN create or update `prospec/index.md`.
- WHEN generated, THEN the legacy `ai-knowledge/_index.md` is no longer generated.

#### REQ-KNOW-035: Conventions Loading Filtering
- WHEN index file is generated, THEN core files (`_conventions.md`, `_diagram-conventions.md`, `_glossary.md`, `_status-lifecycle.md`) are listed in the Core Conventions (L1) section (actively read at task start, NOT auto-loaded).
- WHEN dynamically scanning `ai-knowledge/` for `_*.md` files, THEN non-core files (incl. `_playbook.md` and `_lessons-ledger.md`) are listed in the Load-on-Demand Conventions (L2) section.
- WHEN a core file is missing, THEN it is gracefully skipped without breaking the generation process.
- WHEN a legacy `ai-knowledge/_index.md` exists, THEN it is always excluded from both lists (back-compat filter; the consent-gated `/prospec-upgrade` handles its migration).

---

## US-360: Knowledge base Language Policy (English Exemption) [P2]

As an agent auditing per the Constitution Language Policy,
I want the AI Knowledge base to be explicitly exempt from the Traditional Chinese requirement and stay in English,
so that the English knowledge base no longer constitutes a Language Policy `[MUST]` violation (verify does not turn the project against itself).

**Acceptance Scenarios:**
- WHEN verify runs the Language Policy audit on this project, THEN the English `prospec/ai-knowledge/`, `prospec/specs/`, and `prospec/index.md` are not judged as violations (explicitly exempt)
- WHEN writing `.prospec/changes/` change artifacts, THEN they remain Traditional Chinese (Taiwan)
- WHEN reviewing the three parties (Constitution / CLAUDE.md/entry.md.hbs / `_lessons-ledger` header), THEN the language scope is consistent, with no place requiring AI Knowledge to be zh-TW

#### REQ-TEMPLATES-141: Language Policy Exempts the AI Knowledge base
The Constitution Language Policy (Description/Verify/checklist/quality-standards) restores the AI Knowledge base exemption (reverting to the pre-`0d35f85` semantics) — change artifacts are zh-TW, while code/commit/Knowledge base are English; `entry.md.hbs` (which generates CLAUDE.md/AGENTS.md) narrows its scope to change artifacts + explicitly lists the Knowledge base exemption; the `_lessons-ledger` header adds a description-language declaration (the ledger description may be zh-TW as an explicit exception). INVEST stays `[MUST]` in the same Constitution edit; only the Verify clause is reworded so the new-story audit is advisory.

### US-361: module-map `paths` Consistently Supports Files and Folders [P1]

As a developer who maintains `module-map.yaml` and relies on drift and knowledge,
I want file entries, folder entries, and glob entries in `paths` to be interpreted consistently across all callers,
so that a single file can be assigned to a module different from its containing folder, and drift and knowledge produce consistent, trustworthy results.

**Acceptance Scenarios:**
- WHEN a `paths` entry points to a folder that exists on disk, THEN scanning callers include every file in its subtree
- WHEN a `paths` entry points to a single file that exists on disk, THEN scanning callers include only that file itself
- WHEN a `paths` entry is a glob (`**/x/**`, `dir/**`) or a nonexistent/outside-repo path, THEN pass it through verbatim or fall back to literal-prefix, respectively (existing glob usage is unaffected)

#### REQ-LIB-029: module-map `paths` Entry Classifier (file/dir/glob)
lib provides a single stat-based classifier `classifyModulePath(rawPath, cwd)` (returns `glob | file | dir | missing`) + `moduleScanPatterns(paths, cwd)` as the single source of truth for "how a `paths` entry is scanned"; the drift (REQ-LIB-014) and knowledge (REQ-KNOW-004) scanning sides share this classification semantics.

**Scenarios:**
- WHEN an entry contains `*`, THEN classify it as `glob` and keep it verbatim (do not touch disk)
- WHEN an entry is a directory on disk → `dir` (maps to the subtree `${p}/**`), a file → `file` (maps to `${p}`)
- WHEN an entry does not exist or escapes the repo after resolution, THEN `missing`, falling back to literal-prefix (does not throw, does not change the rule set; the same containment guard as `clampModulePaths`)

#### REQ-TESTS-050: file/dir/glob Path-Consistency Tests
Uses fixtures to cover the classifier's four states and the consistent behavior of the two scanning callers (drift import-edge, knowledge README scan) toward file/folder/glob entries.

**Scenarios:**
- WHEN running the scanner unit tests, THEN cover `classifyModulePath`'s four states and the `moduleScanPatterns` mapping (including outside-repo → missing)
- WHEN running the drift tests, THEN a module containing only a file entry reports `available` and its file import is scanned; glob-entry behavior is unchanged
- WHEN running the knowledge tests, THEN a folder entry → non-empty keyFiles, a file entry → only that file (both mutation-verified)

## Edge Cases

- delta-spec.md does not exist: allow manually specifying modules to update
- module README has a user-customized section: preserve the user section on update
- Knowledge update fails during archive: non-fatal, recommend running it manually
- raw-scan.md is too large (huge project): limit each module to at most 20 files
- running an incremental update when module-map.yaml does not exist: gracefully skip
- very small project (1-2 modules): modularization may add overhead — the minimum module-count threshold is 2
- module-split disputes: automatic splitting may not match the maintainer's mental model — the user section allows manual adjustment

## Success Criteria

- **SC-1**: The incremental update processes only affected modules, not a full regeneration
- **SC-2**: `{base_dir}/index.md` and `module-map.yaml` stay consistent with the module directories
- **SC-3**: AI Knowledge saves 70%+ of AI-conversation token consumption
- **SC-4**: The Knowledge Quality Gate covers all 5 Planning Skills
- **SC-5**: Each module README is ≤ 100 lines and includes the Modification Guide and Pitfalls sections
- **SC-6**: The `{base_dir}/index.md` module table includes a Rationale column

## Maintenance Rules

1. **Replace-in-Place**: A MODIFIED requirement is replaced directly with its latest state
2. **Functional Grouping**: A new requirement is inserted into the corresponding functional group
3. **No Inline Provenance**: Historical provenance lives only in the Change History
4. **Deprecation over Deletion**: A removed requirement is moved to the Deprecated section

## Deprecated Requirements

_(None)_

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|-------------|
| 2026-07-05 | quick-scale-and-ceremony-cleanup | ADDED US-360 (Knowledge base language policy English exemption) + REQ-TEMPLATES-141 (Constitution Language Policy restores the AI Knowledge exemption; three-way alignment of entry.md.hbs/ledger) (issue #67) | US-360, REQ-TEMPLATES-141 |
| 2026-07-01 | implement-hierarchical-index | ADDED REQ-KNOW-034, REQ-KNOW-035 | US-354, REQ-KNOW-034~035 |
| 2026-06-19 | archive-sync | ADDED REQ-TYPES-031; ADDED REQ-TEMPLATES-113; ADDED REQ-SERVICES-029; ADDED REQ-TEMPLATES-114; ADDED REQ-TESTS-032 | REQ-TYPES-031, REQ-TEMPLATES-113, REQ-SERVICES-029, REQ-TEMPLATES-114, REQ-TESTS-032 |
| 2026-06-20 | harden-feature-prefixed-req-sync | ADDED REQ-SERVICES-032 (knowledge-update feature-prefix-aware resolution + mint guard, BL-043) | REQ-SERVICES-032 |
| 2026-06-22 | fix-init-clobber-add-upgrade | knowledge-update Phase 2.5 format-drift consent (detect existing Knowledge format drift → migrate only after consent) | US-353; REQ-TEMPLATES-122 (ADDED) |
| 2026-02-04 | mvp-initial | Establish the Knowledge generation pipeline | US-300~303, REQ-KNOW-001~008 |
| 2026-02-04 | knowledge-redesign | AI-driven module boundaries | REQ-KNOW-002~005 |
| 2026-02-09 | add-knowledge-update | Incremental delta-spec-driven update | US-310, REQ-SERVICES-020~023 |
| 2026-02-16 | enhance-knowledge-sdd-pipeline | Knowledge-SDD quality gate | US-320, REQ-TEMPLATES-040~045 |
| 2026-03-02 | v2-product-first migration | Migrate to the feature spec format | All |
| 2026-03-02 | optimize-ai-knowledge | Recipe-First format redesign + L0/L1/L2 tiering + flexible granularity strategy | US-301~303, REQ-KNOW-004~006 (MODIFIED), REQ-KNOW-010~014 (ADDED) |
| 2026-06-04 | skill-alignment (PR #2) | knowledge generate/update treats convention docs as the single source of truth | REQ-KNOW-015 (ADDED) |
| 2026-06-04 | ai-knowledge-sub-modules (PR #3) | Sub-module extraction/loading/maintenance | US-330, REQ-KNOW-016~017, REQ-SERVICES-024 (ADDED) |
| 2026-06-06 | generate-module-map-in-knowledge-init | knowledge init generates module-map + detector honors base_dir | US-301, REQ-SERVICES-025, REQ-LIB-011 (ADDED) |
| 2026-06-11 | gate-knowledge-at-archive | Staleness detection changed from a graded WARN to informational + archive Entry Gate guidance (syncs the duplicate copy in sdd-workflow) | REQ-TEMPLATES-045 (MODIFIED) |
| 2026-06-13 | group-index-by-category | _index.md grouped by category (module-map as the single source + generate auto-inferred bootstrap); prospec itself, being purely layered, keeps a flat table | US-340, REQ-KNOW-018/019, REQ-TYPES-028 (ADDED); REQ-KNOW-005, REQ-SERVICES-022 (MODIFIED) |
| 2026-06-14 | centralize-index-column-schema | The _index 7-column schema extracted into a single shared constant (all emitters/parsers derive from it); module README Dependencies canonical labels | REQ-KNOW-020/021 (ADDED); REQ-KNOW-005 (MODIFIED) |
| 2026-06-16 | add-knowledge-refresh-command | deterministic `knowledge refresh` command (shares the generateRawScan core) + lifecycle integration (archive/generate auto-refresh) + persona-aware CLI fallback ladder | US-350/351, REQ-KNOW-022~026 (ADDED) |
| 2026-06-16 | raw-scan-multi-language | raw-scan backend multi-language detection (Node/Python/Go/Rust/Maven/.NET/PHP dependency dispatch + backend Tech Stack/Entry/Config) + block reordering | US-352, REQ-KNOW-027~030 (ADDED); REQ-KNOW-022 (MODIFIED — raw-scan.md block reordering) |
| 2026-06-16 | raw-scan-c-cpp-swift | raw-scan C/C++/Swift detection (vcpkg/conan declarative parsing, Swift/spm, C-vs-C++ extension heuristic; imperative manifests deferred to the LLM) | US-352, REQ-KNOW-031~033 (ADDED) |
| 2026-06-16 | collapse-knowledge-refresh-into-init-flag | The `knowledge refresh` command collapsed into the `knowledge init --raw-scan-only` flag; removed the standalone command + the raw-scan.service `execute` delegate; skill/raw-scan templates switched to calling the flag | US-350/351, REQ-KNOW-022/023/024/025 (MODIFIED) |
| 2026-07-04 | sync-knowledge-at-verify-commit | The verify staleness note's pointer changed to the verify S/A commit prompt (the archive Entry Gate is the backstop) — mirror-synced with the same-named REQ in sdd-workflow (issue #65 part b) | REQ-TEMPLATES-045 (MODIFIED) |
| 2026-07-05 | remove-archive-auto-knowledge-update | The `generateRawScan()` shared consumers drop the archive safety net (archive.service no longer refreshes raw-scan); relisted as knowledge-init + `prospec upgrade` (issue #57) | REQ-KNOW-023 (MODIFIED) |
| 2026-07-05 | preserve-curated-index-columns | Curated index columns consolidated into module-map.yaml as the single source, with index.md ## Modules generated from it; updateIndex generates from module-map + execute() no-clobber backfill migration (zero downstream loss); index-table.ts fidelity tooling (issue #58 fully fixes the clobber that #57 stopgapped) | US-303; REQ-TYPES-056, REQ-LIB-026, REQ-KNOW-036 (ADDED); REQ-KNOW-008 (MODIFIED) |
| 2026-07-06 | slim-knowledge-l1-l2 | ADDED REQ-KNOW-037 (index Description routing-only, single-source module-map); MODIFIED REQ-KNOW-011 (README budget ≤400→≤1000), REQ-KNOW-013 (L1 ≤1,800 per file, L2 ≤1,000, total→per-file semantic alignment) (issue #64) | US-303; REQ-KNOW-037 (ADDED); REQ-KNOW-011, REQ-KNOW-013 (MODIFIED) |
| 2026-07-06 | inject-resolved-knowledge-budgets | MODIFIED REQ-KNOW-013 (the Loading Strategy budget-source note points to `.prospec.yaml` `knowledge.token_budget` + `prospec check knowledge-size`, no longer naming `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`) | REQ-KNOW-013 (MODIFIED) |
| 2026-07-09 | support-file-module-paths | ADDED US-361 + REQ-LIB-029 (module-map `paths` stat-based file/dir/glob classifier + `moduleScanPatterns`), REQ-TESTS-050 (cross-caller consistency tests); MODIFIED REQ-KNOW-004 (README scan interprets paths via `moduleScanPatterns`, fixing bare folders scanning 0 files) | US-361, REQ-LIB-029, REQ-TESTS-050 (ADDED); REQ-KNOW-004 (MODIFIED) |
| 2026-07-17 | translate-feature-specs-to-english | Translated spec to English (Language Policy); no requirement changes. | — |
