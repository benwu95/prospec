---
feature: ai-knowledge
status: active
last_updated: 2026-07-05
story_count: 14
req_count: 51
---

# AI Knowledge

## Who & Why

服務使用 Prospec 的開發者與 AI Agent。AI Knowledge 是結構化的專案記憶系統——透過掃描原始碼、AI 驅動的模組文件生成、增量更新機制，讓 AI Agent 快速載入精準的專案上下文，節省 70%+ token 消耗。這是 Prospec 的核心差異化能力。

## User Stories & Behavior Specifications

### US-300: 原始碼掃描與路徑模式 [P0]

身為一名開發者，
我想要 Prospec 根據設定的路徑模式掃描原始碼並產出 raw-scan.md，
以便 AI 能基於完整的原始碼快照來生成模組文件。

**Acceptance Scenarios:**
- WHEN 執行 `prospec knowledge init` THEN 產出 raw-scan.md
- WHEN `.prospec.yaml` 定義 path patterns THEN 只掃描符合模式的檔案

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

### US-301: AI 驅動模組偵測與分類 [P0]

身為一名開發者，
我想要 AI 自動偵測模組邊界或使用預定義的 module-map.yaml，
以便模組切割反映真實的專案架構。

**Acceptance Scenarios:**
- WHEN module-map.yaml 存在 THEN 優先使用預定義分類
- WHEN module-map.yaml 不存在 THEN AI 自動判斷模組邊界
- WHEN 執行 `prospec knowledge init` 且 module-map.yaml 不存在 THEN 依偵測模組產出 module-map.yaml

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

### US-302: 生成模組 README 文件 [P0]

身為一名開發者，
我想要每個模組自動產生結構化的 README.md，
以便 AI Agent 能快速理解模組的職責、API 和關鍵檔案。

**Acceptance Scenarios:**
- WHEN 模組偵測完成 THEN 產生 `ai-knowledge/modules/{name}/README.md`
- WHEN 使用 `--dry-run` THEN 預覽輸出但不寫入檔案
- WHEN README.md 已存在 THEN 使用 ContentMerger 保留使用者自訂區段

#### REQ-KNOW-004: Generate Module README (Recipe-First)
- WHEN module detected, THEN create `{base_dir}/ai-knowledge/modules/{name}/README.md`
- WHEN generating README, THEN follow Recipe-First order: Overview → Key Files → Public API → Dependencies → Modification Guide → Ripple Effects → Pitfalls
- WHEN module directory written, THEN contain only README.md (no api-surface.md or redundant files)
- WHEN README.md already exists, THEN use ContentMerger to preserve user sections

#### REQ-KNOW-006: Dry-run Preview Mode
- WHEN executing `prospec knowledge generate --dry-run`, THEN display file list without creating
- WHEN `--dry-run` specified, THEN show estimated line count per file and L1/L2 token totals

#### REQ-KNOW-010: Recipe-First README Sections
- WHEN generating module README, THEN include `## Modification Guide` listing 2-5 modification scenarios
- WHEN generating module README, THEN include `## Ripple Effects` listing cross-module impacts
- WHEN generating module README, THEN include `## Pitfalls` listing 2-3 common mistakes

#### REQ-KNOW-011: Module README Token Budget
- WHEN generating module README, THEN keep within 100 lines and a ≤400 token budget
- WHEN listing Public API, THEN include only public signatures with a one-line purpose

#### REQ-KNOW-015: Convention Docs as Single Source of Truth
- WHEN generating or updating module READMEs, THEN defer to `ai-knowledge/_module-readme-conventions.md`, `_diagram-conventions.md` and `_status-lifecycle.md` as the single source of truth
- WHEN a convention is defined in those docs, THEN reference them instead of duplicating the rules inline in skill references

#### REQ-KNOW-021: Module README Dependencies Canonical Labels
- WHEN rendering the module-README scaffold or the knowledge-generate skeleton, THEN the Dependencies block uses canonical `**Depends on:**` / `**Used by:**` labels (per `_module-readme-conventions.md`)
- WHEN locking the format, THEN a contract test asserts both labels render

---

### US-303: 模組索引維護 [P0]

身為一名開發者，
我想要根層級 `{base_dir}/index.md` 自動維護所有模組的名稱、關鍵字和描述，
以便 AI Agent 能從索引快速定位相關模組。

**Acceptance Scenarios:**
- WHEN 模組生成完成 THEN `{base_dir}/index.md` 反映所有模組
- WHEN 重新執行 knowledge generate THEN 更新索引而非重建

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

#### REQ-KNOW-013: L0-L3 Layered Loading
- WHEN generating `{base_dir}/index.md`, THEN append a `## Progressive Knowledge Loading Strategy` section reflecting L0 (`AGENTS.md`/`CLAUDE.md`, auto-injected) → L1 (root `index.md` + Core Conventions, ≤1,500 tokens total, actively read at task start — NOT auto-loaded) → L2 (module READMEs ≤400 tokens/module + load-on-demand conventions + feature specs) → L3 (source code, unlimited)
- WHEN Skill templates reference Knowledge, THEN their Loading Strategy stays consistent with the L0-L3 definitions

---

### US-310: 增量 Knowledge 更新 [P0]

身為一名使用 Prospec 的開發者，
我想要在變更歸檔時自動增量更新 AI Knowledge，
以便模組文件與程式碼保持同步，無需全量重新生成。

**Acceptance Scenarios:**
- WHEN 變更歸檔完成 THEN 自動觸發增量更新
- WHEN delta-spec.md 存在 THEN 解析 ADDED/MODIFIED/REMOVED 識別受影響模組
- WHEN 更新完成 THEN 回傳 updated/created/deprecated 模組清單

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

#### REQ-SERVICES-032: Feature-Prefix-Aware Module Resolution（Mint Guard）
knowledge-update 解析 delta-spec entry 時，prefix 命中 feature-map `req_prefixes`（feature-prefix、非 module——phantom mint 的真正來源）者，解析為 `feature.modules ∪ relatedModules ∩ known`，絕不把 prefix 當 module 名 mint phantom `modules/<prefix>/`；解析為空集則 skip + push warning。module-prefix REQ 維持原解析（含新模組 `src/<name>/**` fallback）。新增 `relatedModules` option，載入 feature-map。
- WHEN entry prefix 是 feature-map req_prefix 且解析不到任何 known module, THEN skip 該 entry + warning，零檔案系統寫入（不 mint modules/&lt;prefix&gt;/）
- WHEN entry 為 module-prefix REQ, THEN 維持原解析行為不變

---

### US-320: Knowledge-SDD 鏈路品質閘門 [P1]

身為一名使用 Prospec 的開發者，
我想要每個 SDD 階段都有結構化的 Knowledge 載入機制和品質閘門，
以便 AI 產出更精準的 artifacts，Knowledge 價值在 SDD 鏈路中被充分利用。

**Acceptance Scenarios:**
- WHEN Planning Skill 觸發 THEN 顯示 Knowledge Quality Gate 表格
- WHEN Plan 階段偵測到 Brownfield 專案 THEN 產出 Technical Summary
- WHEN Verify 階段執行 THEN 檢查 Spec 與 Knowledge 的 staleness

#### REQ-TEMPLATES-040: Knowledge Quality Gate
- WHEN Planning Skill triggered, THEN display Knowledge Quality Gate table
- WHEN required Knowledge missing, THEN warn but don't block workflow

#### REQ-TEMPLATES-041: Plan Brownfield/Greenfield Detection
- WHEN AI Knowledge modules exist, THEN detect as Brownfield
- WHEN no AI Knowledge modules, THEN detect as Greenfield

#### REQ-TEMPLATES-045: Verify Spec-Knowledge Staleness Detection
- WHEN delta-spec MODIFIED but module README not updated, THEN informational note + pointer to the **verify S/A commit prompt**（於 commit 前折入同步；archive Entry Gate 為 backstop）（不計入等級；與 sdd-workflow 同名 REQ 一致）

---

### US-330: 模組 Knowledge 子模組化 [P1]

身為一名開發者，
我想要過大的模組 README 能把功能獨立的子領域抽取成 sub-module 檔，
以便在維持 README token 預算的同時保留有價值的細節，而非有損裁切。

**Acceptance Scenarios:**
- WHEN 模組 README 超出 ≤100 行/≤400 token 預算且含內容豐富、功能獨立的子領域 THEN 抽取為 `modules/{module}/{sub-module}.md`
- WHEN 抽取 sub-module THEN 主 README 以 `## Sub-Modules` 區段連結
- WHEN 載入模組 README（L2）THEN 一併載入其連結的 sub-modules

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

### US-340: Category 分組的模組索引 [P2]

身為在領域模組多的專案導航 AI Knowledge 的開發者，
我想要 `{base_dir}/index.md` 模組表能依 category 分組為 `### {Category}` 子表、且分類以 `module-map.yaml` 為單一真相，
以便快速依領域定位模組，且不必手工維護重複的分類表。

**Acceptance Scenarios:**
- WHEN 模組可歸入 ≥2 個有意義的領域分類 THEN `{base_dir}/index.md` 以 `### {Category}` 子標題分組，每子表沿用相同欄位
- WHEN 模組僅為架構分層（如 prospec 自身）THEN 維持單一平表、module-map 不加 category
- WHEN module-map 已有 category THEN 依首位（primary）分組、不重新臆測；缺 category 時 generate 自動推導建議並寫回

#### REQ-TYPES-028: module-map ModuleEntry 有序 category
`ModuleEntrySchema` 新增可選 `category: string[]`（有序，`[0]`＝primary），向後相容（缺省＝平表、`loadModuleMap` 正常載入既有未標 category 的 map）；分類的單一真相來源。

#### REQ-KNOW-018: index.md 依 Category 分組呈現
knowledge-generate/update 在 ≥2 領域分類時於 auto 區以 `### {Category}` 子表分組；每子表欄位一致，`parseIndexModules` 對分組輸出仍正確列舉全部模組。

**Scenarios:**
- WHEN ≥2 領域 THEN 產出 ≥2 個 `### {Category}` 子標題；<2 或純分層 THEN 單一平表
- WHEN 重跑 THEN 分組穩定、`prospec:user` 區保留
- WHEN `parseIndexModules` 解析分組輸出 THEN 回傳模組數＝實際數（重複 header/分隔列被跳過）

#### REQ-KNOW-019: generate 自動推導 category 並持久化
generate 依路徑/keywords/領域語意推導建議 category，經使用者確認後寫入 `module-map.yaml`（bootstrap），之後讀檔為準（已有 category 不重新臆測），使用者可手改覆寫——渲染與真相共用同一 category 值。

---

### US-350: deterministic raw-scan 刷新（init --raw-scan-only）[P1]

身為一名 prospec 專案維護者（或在 SDD 流程尾端執行的 AI agent），
我想要一個只重新產生 raw-scan.md 的 deterministic CLI 操作（`knowledge init --raw-scan-only`），
以便程式碼變動後不重跑完整 init、不動用 LLM 即取得最新結構快照。

**Acceptance Scenarios:**
- WHEN 執行 `prospec knowledge init --raw-scan-only` THEN 依當前原始碼重新產生 raw-scan.md，curated 檔（module-map/index/_conventions）維持 byte-identical（缺檔也不 seed）
- WHEN `--dry-run` THEN 不寫入任何檔案
- WHEN raw-scan.md 不存在 THEN 直接產生（等同首次）

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

### US-351: raw-scan 刷新的生命週期整合 [P2]

身為一名 prospec 使用者，
我想要 raw-scan.md 在流程關鍵點自動保持最新，並在無 prospec CLI 時優雅降級，
以便結構快照不靠人工記憶、且未安裝 prospec 的下游開發者也不會被卡住。

**Acceptance Scenarios:**
- WHEN `/prospec-archive` 流程結束 THEN raw-scan.md 被刷新（archive.service 非致命觸發）
- WHEN `/prospec-knowledge-generate` 啟動 THEN 先刷新 raw-scan 再讀取
- WHEN prospec CLI 不可用 THEN 依 persona 降級（開發者 skills 走 fallback ladder；quickstart 提醒安裝）

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

### US-352: raw-scan 多語言偵測 [P1]

身為一名在非 JS/TS 專案（Python/Go/Rust/Java/C#/Ruby/PHP/C/C++/Swift）上執行 prospec 的開發者，
我想要 raw-scan 確定性地辨識專案的語言、進入點、依賴與設定檔，
以便 Knowledge 生成看到真實技術剖面，而非 JS/TS-only 的視角。

**Acceptance Scenarios:**
- WHEN 專案使用受支援的後端語言 THEN Tech Stack / Entry Points / Dependencies / Config Files 反映該語言（確定性、無網路）
- WHEN manifest 為命令式 DSL（CMakeLists.txt / Package.swift / Gradle / conanfile.py）THEN 依賴留空，交由 `/prospec-knowledge-generate` 讀原始碼
- WHEN 語言未受支援 THEN `.prospec.yaml` 的 `tech_stack` 為權威覆寫；Directory Tree 與 File Stats 永遠有值

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

### US-353: knowledge-update 偵測格式落差並徵詢同意 [P2]

身為持續演進 prospec 的使用者，
我希望 `/prospec-knowledge-update` 在更新 AI Knowledge 時，若發現既有檔案格式與當前模板/conventions 不符，先徵詢我同意再更新格式，
以便 Knowledge 格式能跟上模板演進，但我的既有內容不被未經同意地改寫。

**Acceptance Scenarios:**
- WHEN knowledge-update 偵測到既有 Knowledge 格式與當前 conventions/模板不符, THEN 列出落差並詢問是否同意更新格式
- WHEN 我不同意格式更新, THEN 僅做內容增量更新、保留既有格式
- WHEN 無格式落差, THEN 照常增量更新、不打擾我

#### REQ-TEMPLATES-122: prospec-knowledge-update 格式落差同意
`templates/skills/prospec-knowledge-update.hbs` 新增格式落差檢查：在更新 Knowledge 前，比對既有 AI Knowledge 檔案（根層級 `index.md` 欄位 schema 對照 `_module-readme-conventions.md` 與 INDEX 欄位規範、module README 結構）是否與當前模板/conventions 格式相符；若偵測到落差，列出落差並詢問使用者是否同意更新格式，同意才改格式（內容增量更新照常）。English-only baseline。

**Scenarios:**
- WHEN knowledge-update 偵測到既有 Knowledge 格式與當前 conventions/模板不符, THEN 列出落差並詢問使用者同意後才更新格式
- WHEN 使用者不同意格式更新, THEN 僅做內容增量更新、保留既有格式
- WHEN 無格式落差, THEN 照常增量更新、不打擾使用者

---


#### REQ-TYPES-031: feature-map.yaml Schema（feature→module 索引）

---


#### REQ-TEMPLATES-113: feature-map.yaml.hbs 知識模板（單一格式權威）

---


#### REQ-SERVICES-029: archive 唯一 writer `syncFeatureMap`（bootstrap-once + no-clobber）

---


#### REQ-TEMPLATES-114: prospec-archive skill feature-map 再生指引

---


#### REQ-TESTS-032: feature-map schema/format/archive writer 測試

---

### US-354: 建立四層分層索引結構 [P1]

身為 AI 代理與開發者,
我想要將 `ai-knowledge/_index.md` 提升至 `prospec/index.md` 並實作 L1~L3 索引與動態掃描過濾機制 (核心須於任務開始時主動讀取，其餘 load-on-demand)，同時將 L0 指引保留於 `AGENTS.md`/`CLAUDE.md`,
以便能夠減少 context overhead 並精準控管 Token budget。

**Acceptance Scenarios:**
- WHEN `prospec/index.md` 產生時, THEN 應包含 L1~L3 分層說明，且 L1 Conventions 區分核心（Core）清單與 load-on-demand 檔案清單。
- WHEN 執行 `prospec-knowledge-generate` 或 `update` 時, THEN 應將內容正確寫入至根目錄的 `prospec/index.md`。
- WHEN 掃描 `ai-knowledge/` 下的 `_*.md` 檔案時, THEN 能依據核心清單過濾出核心與 load-on-demand 的檔案。

#### REQ-KNOW-034: Root Level Index File
- WHEN `prospec knowledge generate` or `update` executes, THEN create or update `prospec/index.md`.
- WHEN generated, THEN the legacy `ai-knowledge/_index.md` is no longer generated.

#### REQ-KNOW-035: Conventions Loading Filtering
- WHEN index file is generated, THEN core files (`_conventions.md`, `_diagram-conventions.md`, `_glossary.md`, `_status-lifecycle.md`) are listed in the Core Conventions (L1) section (actively read at task start, NOT auto-loaded).
- WHEN dynamically scanning `ai-knowledge/` for `_*.md` files, THEN non-core files (incl. `_playbook.md` and `_lessons-ledger.md`) are listed in the Load-on-Demand Conventions (L2) section.
- WHEN a core file is missing, THEN it is gracefully skipped without breaking the generation process.
- WHEN a legacy `ai-knowledge/_index.md` exists, THEN it is always excluded from both lists (back-compat filter; the consent-gated `/prospec-upgrade` handles its migration).

---

## US-360: Knowledge base 語言政策（英文豁免）[P2]

身為一個依 Constitution Language Policy 稽核的 agent，
我想要 AI Knowledge base 明確豁免於 Traditional Chinese 要求、維持英文,
以便英文知識庫不再構成 Language Policy `[MUST]` 違規（verify 不拿專案打自己臉）。

**Acceptance Scenarios:**
- WHEN verify 對本專案跑 Language Policy 稽核，THEN 英文 `prospec/ai-knowledge/`、`prospec/specs/`、`prospec/index.md` 不判違規（明確豁免）
- WHEN 撰寫 `.prospec/changes/` 變更文件，THEN 仍為 Traditional Chinese（Taiwan）
- WHEN 檢視三方（Constitution／CLAUDE.md/entry.md.hbs／`_lessons-ledger` header），THEN 語言範圍一致，無任一處要求 AI Knowledge 為 zh-TW

#### REQ-TEMPLATES-141: Language Policy 豁免 AI Knowledge base
Constitution Language Policy（Description/Verify/checklist/quality-standards）還原豁免 AI Knowledge base（回 `0d35f85` 前語意）——change artifacts 為 zh-TW，程式碼/commit/Knowledge base 為英文；`entry.md.hbs`（生成 CLAUDE.md/AGENTS.md）範圍收斂為 change artifacts + 明列 Knowledge base 豁免；`_lessons-ledger` header 加 description-language 宣告（ledger 描述可 zh-TW 為明文例外）。INVEST 於同一 Constitution 編修維持 `[MUST]`，僅 Verify 條款改寫使 new-story 稽核為 advisory。

## Edge Cases

- delta-spec.md 不存在：允許手動指定模組進行更新
- 模組 README 有使用者自訂區段：更新時保留 user section
- Knowledge 更新在 archive 期間失敗：non-fatal，建議手動執行
- raw-scan.md 過大（巨型專案）：限制每模組最多 20 個檔案
- module-map.yaml 不存在時執行增量更新：gracefully skip
- 極小型專案（1-2 模組）：模組化可能增加負擔——最低模組數閾值為 2
- 模組切割爭議：自動切割可能不符合維護者認知——user section 允許手動調整

## Success Criteria

- **SC-1**: 增量更新只處理受影響模組，不全量重新生成
- **SC-2**: `{base_dir}/index.md` 和 `module-map.yaml` 與模組目錄保持一致
- **SC-3**: AI Knowledge 節省 70%+ 的 AI 對話 token 消耗
- **SC-4**: Knowledge Quality Gate 覆蓋所有 5 個 Planning Skills
- **SC-5**: 每個模組 README ≤ 100 行且包含 Modification Guide 與 Pitfalls 區塊
- **SC-6**: `{base_dir}/index.md` 模組表格包含 Rationale 欄位

## Maintenance Rules

1. **Replace-in-Place**: MODIFIED 需求直接替換為最新狀態
2. **Functional Grouping**: 新需求插入對應的功能分組
3. **No Inline Provenance**: 歷史追溯只在 Change History 中
4. **Deprecation over Deletion**: 移除的需求搬到 Deprecated 區段

## Deprecated Requirements

_(None)_

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|-------------|
| 2026-07-05 | quick-scale-and-ceremony-cleanup | ADDED US-360（Knowledge base 語言政策英文豁免）+ REQ-TEMPLATES-141（Constitution Language Policy 還原豁免 AI Knowledge、entry.md.hbs/ledger 三方對齊）（issue #67） | US-360, REQ-TEMPLATES-141 |
| 2026-07-01 | implement-hierarchical-index | ADDED REQ-KNOW-034, REQ-KNOW-035 | US-354, REQ-KNOW-034~035 |
| 2026-06-19 | archive-sync | ADDED REQ-TYPES-031; ADDED REQ-TEMPLATES-113; ADDED REQ-SERVICES-029; ADDED REQ-TEMPLATES-114; ADDED REQ-TESTS-032 | REQ-TYPES-031, REQ-TEMPLATES-113, REQ-SERVICES-029, REQ-TEMPLATES-114, REQ-TESTS-032 |
| 2026-06-20 | harden-feature-prefixed-req-sync | ADDED REQ-SERVICES-032（knowledge-update feature-prefix-aware resolution + mint guard，BL-043） | REQ-SERVICES-032 |
| 2026-06-22 | fix-init-clobber-add-upgrade | knowledge-update Phase 2.5 格式落差同意（偵測既有 Knowledge 格式落差→徵詢同意才遷移） | US-353; REQ-TEMPLATES-122 (ADDED) |
| 2026-02-04 | mvp-initial | 建立 Knowledge 生成管線 | US-300~303, REQ-KNOW-001~008 |
| 2026-02-04 | knowledge-redesign | AI 驅動模組邊界 | REQ-KNOW-002~005 |
| 2026-02-09 | add-knowledge-update | 增量 delta-spec 驅動更新 | US-310, REQ-SERVICES-020~023 |
| 2026-02-16 | enhance-knowledge-sdd-pipeline | Knowledge-SDD 品質閘門 | US-320, REQ-TEMPLATES-040~045 |
| 2026-03-02 | v2-product-first migration | 遷移至 feature spec 格式 | All |
| 2026-03-02 | optimize-ai-knowledge | Recipe-First 格式重設計 + L0/L1/L2 分層 + 彈性粒度策略 | US-301~303, REQ-KNOW-004~006 (MODIFIED), REQ-KNOW-010~014 (ADDED) |
| 2026-06-04 | skill-alignment (PR #2) | knowledge generate/update 以 convention docs 為單一真實來源 | REQ-KNOW-015 (ADDED) |
| 2026-06-04 | ai-knowledge-sub-modules (PR #3) | Sub-module 抽取/載入/維護 | US-330, REQ-KNOW-016~017, REQ-SERVICES-024 (ADDED) |
| 2026-06-06 | generate-module-map-in-knowledge-init | knowledge init 生成 module-map + detector 尊重 base_dir | US-301, REQ-SERVICES-025, REQ-LIB-011 (ADDED) |
| 2026-06-11 | gate-knowledge-at-archive | Staleness 檢測由 graded WARN 改 informational + archive Entry Gate 指引（同步 sdd-workflow 重複副本） | REQ-TEMPLATES-045 (MODIFIED) |
| 2026-06-13 | group-index-by-category | _index.md 依 category 分組（module-map 為單一真相 + generate 自動推導 bootstrap）；prospec 自身純分層維持平表 | US-340, REQ-KNOW-018/019, REQ-TYPES-028 (ADDED); REQ-KNOW-005, REQ-SERVICES-022 (MODIFIED) |
| 2026-06-14 | centralize-index-column-schema | _index 7 欄 schema 抽成單一共用常數（所有 emitter/parser 衍生）；module README Dependencies canonical 標籤 | REQ-KNOW-020/021 (ADDED); REQ-KNOW-005 (MODIFIED) |
| 2026-06-16 | add-knowledge-refresh-command | deterministic `knowledge refresh` 指令（共用 generateRawScan 核心）+ 生命週期整合（archive/generate 自動刷新）+ persona-aware CLI fallback ladder | US-350/351, REQ-KNOW-022~026 (ADDED) |
| 2026-06-16 | raw-scan-multi-language | raw-scan 後端多語言偵測（Node/Python/Go/Rust/Maven/.NET/PHP 依賴分派 + 後端 Tech Stack/Entry/Config）+ 區塊重排 | US-352, REQ-KNOW-027~030 (ADDED); REQ-KNOW-022 (MODIFIED — raw-scan.md 區塊重排) |
| 2026-06-16 | raw-scan-c-cpp-swift | raw-scan C/C++/Swift 偵測（vcpkg/conan 宣告式解析、Swift/spm、C-vs-C++ 副檔名啟發式；命令式 manifest 交 LLM） | US-352, REQ-KNOW-031~033 (ADDED) |
| 2026-06-16 | collapse-knowledge-refresh-into-init-flag | `knowledge refresh` 指令收斂為 `knowledge init --raw-scan-only` 旗標；移除獨立指令 + raw-scan.service `execute` 委派；skill/raw-scan 模板改呼叫旗標 | US-350/351, REQ-KNOW-022/023/024/025 (MODIFIED) |
| 2026-07-04 | sync-knowledge-at-verify-commit | verify staleness note 指向改為 verify S/A commit prompt（archive Entry Gate 為 backstop）——與 sdd-workflow 同名 REQ 鏡像同步（issue #65 part b） | REQ-TEMPLATES-045 (MODIFIED) |
| 2026-07-05 | remove-archive-auto-knowledge-update | `generateRawScan()` 共用消費者移除 archive safety net（archive.service 不再刷新 raw-scan）；改列 knowledge-init + `prospec upgrade`（issue #57） | REQ-KNOW-023 (MODIFIED) |
| 2026-07-05 | preserve-curated-index-columns | curated index 欄位收斂為 module-map.yaml 單一真相、index.md ## Modules 由其生成；updateIndex 自 module-map 生成 + execute() no-clobber 回填遷移（下游零遺失）；index-table.ts 保真工具（issue #58 根治 #57 止血的 clobber） | US-303; REQ-TYPES-056, REQ-LIB-026, REQ-KNOW-036 (ADDED); REQ-KNOW-008 (MODIFIED) |
