---
feature: sdd-workflow
status: active
last_updated: 2026-07-04
story_count: 23
req_count: 103
---

# SDD 開發流程

## Who & Why

**服務對象**：使用 Prospec 進行規格驅動開發（Spec-Driven Development）的開發者與團隊。

**解決的問題**：軟體開發中需求散落、規格失真、變更無追蹤、Knowledge 與實作脫節。缺乏結構化流程時，AI Agent 產出品質不穩定，專案隨時間累積技術債卻無從驗證。

**為什麼重要**：SDD Workflow 是 Prospec 的核心價值主張 — 透過 Story → Plan → Tasks → Implement → Verify → Archive 六階段生命週期，讓每一次變更都有完整的規格追蹤、品質閘門和知識沉澱。規格是活的（Living Spec），Knowledge 隨專案演進同步更新，形成正向飛輪。

---

## US-1: 建立變更需求 [P0]

身為一個使用 Prospec 的開發者，
我想要透過 `/prospec-new-story` 建立結構化的變更需求，
以便用 INVEST 格式清楚描述使用者故事、驗收條件和功能需求。

**Acceptance Scenarios:**
- WHEN 執行 `prospec change story {name}` THEN 建立 `.prospec/changes/{name}/` 含 `proposal.md` 和 `metadata.yaml`（status: story）
- WHEN 變更名稱已存在 THEN 提示已存在並終止
- WHEN 描述需求時 THEN 引導撰寫多個獨立 INVEST User Story（含優先級和 WHEN/THEN 驗收場景）

### Behavior Specifications

#### REQ-CHNG-001: Create Change Directory
建立 `.prospec/changes/{name}/` 目錄結構。
- WHEN executes, THEN create directory with `proposal.md` and `metadata.yaml`
- WHEN directory already exists, THEN prompt and exit

#### REQ-CHNG-002: Generate proposal.md
生成含 INVEST User Story 格式的 proposal.md。
- WHEN completes, THEN contains multiple INVEST User Stories + acceptance scenarios
- WHEN `--description` provided, THEN written to Notes section
- WHEN referencing proposal-format, THEN includes Why, User Stories, Edge Cases, FR, SC, Open Questions

#### REQ-CHNG-003: Auto-Identify Related Modules
透過關鍵字比對根層級 `{base_dir}/index.md` 識別相關模組。
- WHEN change name contains module keywords, THEN Related Modules lists matches
- WHEN no match, THEN Related Modules is empty
- WHEN parsing the `{base_dir}/index.md` table, THEN cells are read position-stably and Description comes from the canonical column index (REQ-KNOW-020); non-module rows (e.g. the Progressive Knowledge Loading Strategy table) are skipped by column count

#### REQ-CHNG-004: Change Metadata Lifecycle
透過 metadata.yaml 追蹤狀態，以 `ai-knowledge/_status-lifecycle.md` 為單一真實來源：`story` → `plan` → `tasks` → `implemented` → `verified` → `archived`；`scale: quick`（經使用者確認）允許 `story` → `tasks` 合法跳過 plan。
- WHEN each workflow skill completes, THEN advance status per the canonical lifecycle: new-story → `story`, plan → `plan`, tasks → `tasks`, implement → `implemented`
- WHEN metadata `scale: quick`, THEN `story → tasks` is the single legal skip（不產 plan.md/delta-spec.md；spec 與 knowledge 影響由 archive Entry Gate 以實際 diff 複核）
- WHEN verify reaches grade S/A, THEN status → `verified`; WHEN grade B/C/D, THEN status unchanged (re-run after fixing)
- WHEN archive runs, THEN accept only `verified` changes
- WHEN any workflow skill needs the state machine, THEN point at `_status-lifecycle.md` as the source of truth
- WHEN gating artifacts, THEN Feature Specs are updated ONLY by `/prospec-archive` (Phase 3.5 graduation); `/prospec-verify` gates on Knowledge↔code and does NOT gate on Feature Spec freshness — preventing a verify↔archive deadlock

#### REQ-CHNG-005: Prevent Duplicate Changes
- WHEN change name already exists, THEN prompt and exit

#### REQ-TEMPLATES-032: New-Story Skill INVEST Guidance
`prospec-new-story.hbs` 引導產出 INVEST User Stories。
- WHEN triggered, THEN interview flow guides multiple independent Stories with P0/P1/P2 + WHEN/THEN
- WHEN complete, THEN conform to proposal-format.hbs + execute Knowledge Quality Gate

---

## US-2: 生成實作計劃 [P0]

身為一個使用 Prospec 的開發者，
我想要從 proposal.md 自動生成結構化的實作計劃和規格變更單，
以便清楚知道要改哪些模組、步驟為何、以及每個需求的 REQ ID 追蹤。

**Acceptance Scenarios:**
- WHEN 執行 `/prospec-plan` THEN 讀取 proposal.md + Knowledge 產出 plan.md 和 delta-spec.md
- WHEN delta-spec 生成 THEN 每個需求有 `REQ-{MODULE}-{NUMBER}` 格式 ID
- WHEN 步驟超過 10 個 THEN 建議拆分為多個 Story

### Behavior Specifications

#### REQ-CHNG-006: Load Proposal and Module Context
- WHEN starts, THEN read proposal.md + related module READMEs
- WHEN Constitution exists, THEN inject as context
- WHEN matching feature specs exist, THEN load as Layer 0 context

#### REQ-CHNG-007: Identify Related AI Knowledge Modules
- WHEN proposal marks related modules, THEN read `modules/{module}/README.md`
- WHEN module README missing, THEN skip with warning

#### REQ-CHNG-008: Constitution Injection
- WHEN Constitution exists, THEN Planning Skills auto-execute quick check (>= 3 principles)
- WHEN absent, THEN skip

#### REQ-CHNG-009: Generate plan.md
- WHEN context loaded, THEN includes Overview, Affected Modules, Steps, Risk Assessment
- WHEN steps > 10, THEN suggest splitting Stories
- WHEN MODIFIED requirements, THEN reference Before from feature spec

#### REQ-CHNG-010: Generate delta-spec.md
- WHEN plan generated, THEN delta-spec.md created with ADDED/MODIFIED/REMOVED
- WHEN added, THEN includes Description, Acceptance Criteria, Priority
- WHEN modified, THEN includes Before, After, Reason

#### REQ-TEMPLATES-059: Plan Call Chain and Layering Check
- WHEN prospec-plan produces plan.md, THEN include a Call Chain section (and plan-format.hbs defines it)
- WHEN Plan Phase 6 runs, THEN check the call chain's layering against the Constitution's dependency rule
- WHEN verify dimension 3/5 runs, THEN re-check layering against the Constitution

#### REQ-TEMPLATES-125: Plan Conditional User Story Flow Diagram
`/prospec-plan` 對結構複雜的 user story 於 plan.md（Section 5）產生 Mermaid 行為/決策流程圖，沿用 `_diagram-conventions.md` 慣例，與 Call Chain（REQ-TEMPLATES-059）分工互補。
- WHEN user story 符合 any-of 結構訊號（>=2 分支決策點／>=3 階段狀態轉移或多終止狀態／跨模組·跨角色且順序即理解重點）, THEN plan.md 內嵌一張該 story 行為/決策流程的 Mermaid 圖
- WHEN user story 為單一線性 happy path 或單步驟 CRUD, THEN 不產生流程圖
- WHEN 產生流程圖, THEN 沿用 `_diagram-conventions.md` classDef/節點慣例，且圖區塊不計入 120 行 standard 上限
- WHEN 描述產圖步驟, THEN prospec-plan Phase 4 以 on-demand 讀取 `_diagram-conventions.md`，絕不加入 Startup Loading（快取穩定）

---

## US-3: 智慧 Context 載入 [P1]

身為一個使用 Prospec 的開發者，
我想要 Plan 階段能自動偵測 Brownfield/Greenfield 並調整 context 策略，
以便既有專案利用 Knowledge 產出精準計劃，全新專案引導補償性 context 收集。

**Acceptance Scenarios:**
- WHEN `ai-knowledge/modules/` >= 2 個含 README.md THEN Brownfield Mode + 自動合成 Technical Summary
- WHEN < 2 個模組 THEN Greenfield Mode + 引導補償性 context 收集

### Behavior Specifications

#### REQ-TEMPLATES-033: Plan Skill Feature Spec Loading
- WHEN Startup Loading, THEN read Feature Specs + Product Spec as Layer 0 context + detect Context Mode
- WHEN Brownfield, THEN synthesize Technical Summary (module overview + patterns + constraints)
- WHEN Greenfield, THEN guide compensatory collection + suggest Knowledge generation
- WHEN delta-spec generated, THEN each REQ includes Feature/Story routing fields
- WHEN Phase ends, THEN execute Knowledge Quality Gate

#### REQ-SPEC-012: Delta-Spec Feature Routing Metadata
delta-spec.md 每個 REQ 新增 Feature/Story 路由欄位，指定歸檔時寫入哪個 Feature Spec。
- WHEN ADDED/MODIFIED REQ, THEN includes `**Feature**: {feature-name}` field
- WHEN ADDED/MODIFIED REQ, THEN includes `**Story**: US-{N}` field
- WHEN Plan Skill generates delta-spec, THEN routing fields auto-populated

#### REQ-TEMPLATES-041: Plan Brownfield/Greenfield Detection
- WHEN >= 2 modules with README.md, THEN Brownfield Mode
- WHEN < 2, THEN Greenfield Mode + suggest `prospec knowledge init`

#### REQ-TEMPLATES-042: Plan Technical Summary (Brownfield)
- WHEN Brownfield, THEN plan.md includes module overview table + existing patterns + architecture constraints

#### REQ-TEMPLATES-043: Plan Technical Context (Greenfield)
- WHEN Greenfield, THEN plan.md includes tech stack detection + structure scan + [TBD] markers

#### REQ-TEMPLATES-044: plan-format.hbs Technical Summary Section
- WHEN referenced, THEN includes Brownfield/Greenfield mutually exclusive formats
- WHEN produced, THEN only one format appears
- WHEN referenced, THEN also includes an optional, additive "External Library Usage" subsection (on-demand, untrusted) that does not alter the mutually-exclusive Brownfield/Greenfield formats

---

## US-4: 拆解任務清單 [P0]

身為一個使用 Prospec 的開發者，
我想要將實作計劃自動拆解為按架構層排序的可執行任務清單，
以便逐步實作、追蹤進度、估算工作量。

**Acceptance Scenarios:**
- WHEN 執行 `/prospec-tasks` THEN tasks.md 按架構層分組（Types → Lib → Services → CLI → Tests）
- WHEN 任務可並行 THEN 標記 `[P]`
- WHEN 每個任務 THEN 含 `~{lines} lines` 複雜度估算和 checkbox 格式

### Behavior Specifications

#### REQ-CHNG-011: Decompose Plan into Tasks
- WHEN plan.md valid, THEN tasks.md groups by architecture layer
- WHEN parallelizable, THEN mark `[P]`
- WHEN design-spec.md exists, THEN UI tasks annotated for MCP design reading

#### REQ-CHNG-012: Architecture Layer Ordering
排序：Types → Lib → Services → CLI → Tests；僅 templates 變更時用 Templates 分組。

#### REQ-CHNG-013: Estimate Task Complexity
每個任務含 `~{lines} lines` 估算，Summary 含總數。

#### REQ-CHNG-014: Checkbox Task Format
任務以 `- [ ]` 起始，完成標記 `- [x]`；可選 kind 標記 `[M]`（manual）/`[V]`（verification），無標記即 code，與 `[P]` 並存（`[P]` 在前）。定義凍結於 tasks-format reference。

#### REQ-CHNG-015: Task Summary Statistics
tasks.md 末尾含 Summary 區段（total tasks、total lines、parallelizable count）。

#### REQ-CHNG-016: Plan Status Update
- WHEN plan complete, THEN metadata status → `plan`
- WHEN tasks complete, THEN metadata status → `tasks`

---

## US-5: 驗證實作合規性 [P0]

身為一個使用 Prospec 的開發者，
我想要在實作完成後執行全面驗證，確認規格合規性、Constitution 遵循和 Knowledge 一致性，
以便歸檔前確保品質達標。

**Acceptance Scenarios:**
- WHEN 執行 `/prospec-verify` THEN 比對 Feature Spec 需求與 ai-knowledge 描述，並評估 Spec Health
- WHEN 每個需求 THEN 顯示 PASS/WARN/FAIL
- WHEN `ui_scope != none` 且有 design-spec.md THEN 額外執行設計一致性驗證

### Behavior Specifications

#### REQ-TEMPLATES-034: Verify Skill Knowledge↔Implementation Consistency
- WHEN triggered, THEN verify dimension 4/5 grades ONLY pre-existing Knowledge drift（module READMEs vs 本變更未觸及的程式碼）
- WHEN README 描述程式碼沒有的行為（超出本變更落差）或既有模組完全沒有 README, THEN graded WARN/FAIL (remediate via /prospec-knowledge-update or /prospec-knowledge-generate)
- WHEN 本變更 knowledge 落差（delta-spec REQ 未入 README / README 未更新 / 本變更新增模組尚無 README）, THEN informational only — 不計入等級，指向 `/prospec-archive` Entry Gate
- WHEN a permanent Feature Spec lags an un-archived change, THEN informational only (graduates at /prospec-archive) — not drift, does not affect grade
- WHEN an already-archived capability regresses or Feature Spec Health (Density/Freshness/Consistency) degrades, THEN informational signal for the developer, not grade-blocking
- WHEN ui_scope != none + design-spec.md exists, THEN execute design consistency check

#### REQ-TEMPLATES-045: Verify Knowledge Staleness Detection
- WHEN delta-spec MODIFIED but module README not updated, THEN informational note + pointer to the `/prospec-archive` Entry Gate（不計入等級）
- WHEN `prospec check --json` 報告可用, THEN staleness 事實來源為其 `knowledge_health` 區段（git 時間戳，確定性）——verify 引用數據、不重新推導；不可用時退回 LLM 判斷並明示（等級語意不變）

#### REQ-TEMPLATES-063: Verify Grades Constitution by Severity
verify Verification 3/5 依規則 RFC-2119 嚴重度分級回報；grade 語彙維持 PASS/WARN/FAIL（不新增第四狀態）。
- WHEN a principle carries `[MUST]`/`[SHOULD]`/`[MAY]`, THEN map a violation MUST→FAIL, SHOULD→WARN, MAY→informational (does not affect grade)
- WHEN the Constitution is free-text without severity tags, THEN fall back to judgment-based PASS/WARN/FAIL (backward-compatible)

---

## US-6: 歸檔已完成變更 [P0]

身為一個使用 Prospec 的開發者，
我想要透過 `/prospec-archive` 歸檔已完成的變更，
以便 `.prospec/changes/` 保持乾淨，SDD 生命週期正確關閉，累積稽核軌跡。

**Acceptance Scenarios:**
- WHEN 執行 `/prospec-archive` THEN Entry Gate 檢查 verified 狀態與 knowledge 同步，通過後掃描搬至 `.prospec/archive/{date}-{name}/`
- WHEN 歸檔完成 THEN 生成 summary.md（knowledge 同步已於 Entry Gate 強制；service 層保留冪等 safety net）
- WHEN Feature Spec Sync THEN 讀取 delta-spec ADDED/MODIFIED/REMOVED 融入 `specs/features/`（Replace-in-Place）
- WHEN Feature Spec Sync 完成 THEN 自動重新生成 `specs/product.md`
- WHEN 歸檔完成 THEN summary.md（及其 committed `_archived-history` 副本）自帶 `## Review & Verify` 節，使 audit trail 攜帶 review/verify 證據，不隨 gitignored bundle 蒸發

### Behavior Specifications

#### REQ-TYPES-010: ChangeStatus Archived Support
`archived` 為有效的 ChangeStatus 值。

#### REQ-SERVICES-010: Archive Service（spec-history 目的地校正）

#### REQ-TEMPLATES-010: Archive Skill Template（明列 spec-history copy 步驟）

#### REQ-SPEC-013: Product Spec Auto-Generation
歸檔 Feature Spec Sync 完成後，自動從所有 Feature Specs 合成 `specs/product.md`。
- WHEN Feature Spec Sync completes, THEN trigger product.md regeneration
- WHEN regenerating, THEN extract frontmatter from all Feature Specs in features/
- WHEN product.md generated, THEN Feature Map links match current Feature Spec files

#### REQ-TEMPLATES-126: Archive Summary Review & Verify Section
archive-format 於 Completion 與 Knowledge Update 之間定義 `## Review & Verify` 節（quality grade、critical/major 計數＋findings 節選、quality_log digest），使 committed 摘要攜帶原僅存於 gitignored bundle 的 review/verify 證據。
- WHEN 定義格式, THEN §6 置於 Completion 之後、Knowledge Update 之前，列 grade／criticals-majors＋findings 節選／quality_log digest 三類內容
- WHEN 無 review 輪或 quality_log 為空, THEN 據實標示（Unverified／no review round），never fabricate
- WHEN backfilled/reconstructed 條目, THEN 附 `Source` provenance bullet 以區辨重建證據與 live capture

#### REQ-TEMPLATES-127: Archive Phase 2 Writes the Review & Verify Section
prospec-archive Phase 2 從 metadata.yaml `quality_log`／`review.md`／verify 報告彙整並寫入 `## Review & Verify` 節；Phase 2 Gate 檢查其存在；NEVER 禁止產出缺該節的 summary；Phase 3 既有 `_archived-history` 複製使該節隨 summary 落地。
- WHEN Phase 2 產 summary, THEN 從 quality_log/review.md/verify 報告寫入該節（來源缺則據實標示、不捏造）
- WHEN summary 缺 `## Review & Verify` 節, THEN Phase 2 Gate 不通過、NEVER 攔截

#### REQ-TESTS-041: Review & Verify Contract Assertions
`skill-format.test.ts` 以 section-scoped＋負向斷言釘住 archive-format §6 格式節、prospec-archive Phase 2 寫入步驟/Gate/NEVER、promotion-format 的 `_archived-history` 證據指標；fenced-`## ` 截斷感知、mutation-verified。
- WHEN contract runs, THEN 斷言 section-scoped；移除任一目標 token → 轉紅

---

## US-7: 活規格系統 [P0]

身為一個使用 Prospec 的開發者，
我想要 `specs/` 成為隨每次歸檔自動累積的活行為規格，proposal.md 完整表達 User Scenarios 和驗收條件，
以便規格真正成為 SDD 的 Single Source of Truth。

**Acceptance Scenarios:**
- WHEN 建立 Feature Spec THEN 含 Who & Why、User Stories & Behavior Specs（REQ ID + WHEN/THEN）、Edge Cases、Change History
- WHEN Archive 觸發 Feature Spec Sync THEN 融入 User Stories + 依格式新增或更新 requirements（Replace-in-Place）
- WHEN 查看 `specs/` THEN Product-First 架構：`product.md`（PRD 入口）+ `features/`（Feature Specs）

### Behavior Specifications

#### REQ-TEMPLATES-030: Enhanced Proposal Format Reference
`proposal-format.hbs` 含 8+ 區段：Why, User Stories, Acceptance Scenarios, Edge Cases, FR, SC, Related Modules, Notes。
- WHEN writing Story, THEN "As a/I want/So that" + Priority + WHEN/THEN
- WHEN open questions, THEN max 3 items

#### REQ-SPEC-010: Feature Spec Format Template
`feature-spec-format.hbs` 以 User Story 為核心組織單位，REQ ID 降為 Behavior Specifications 子項。
- WHEN creating Feature Spec, THEN structure: frontmatter → Who & Why → User Stories & Behavior Specs → Edge Cases → SC → Maintenance Rules → Deprecated → Change History
- WHEN User Stories section, THEN occupy ≥ 40% of total content
- WHEN Maintenance Rules, THEN define Replace-in-Place, Functional Grouping, No Inline Provenance, Deprecation over Deletion

#### REQ-SPEC-011: Product Spec Format Template
`product-spec-format.hbs`（PRD 入口）含願景、目標使用者、功能地圖、核心 Stories 摘要。
- WHEN product.md, THEN ≤ 80 lines, readable in 2 minutes
- WHEN Feature Map, THEN each item links to corresponding Feature Spec
- WHEN generated, THEN synthesizable from all Feature Spec frontmatter

#### REQ-SPECS-001: specs/ Directory Structure
Product-First 結構：`product.md`（PRD 入口）+ `features/`（Feature Specs）。歷史追溯由 Feature Spec Change History + `.prospec/archive/` 負責。

#### REQ-TEMPLATES-057: Proposal UI Scope Field
UI Scope 可選欄位（full/partial/none），none 時跳過 Design Phase，legacy proposals 不受影響。

#### REQ-REF-001: Reference Format Document Language Neutrality
Reference documents 僅定義結構（英文 headings），不強制內容語言。語言由 Constitution 控制。

---

## US-8: Knowledge 品質閘門 [P1]

身為一個使用 Prospec 的開發者，
我想要每個 SDD 階段都有品質閘門檢查 Knowledge 載入品質，
以便 AI 產出更精準的 artifacts。

**Acceptance Scenarios:**
- WHEN 任何 Planning Skill 完成 THEN 顯示 PASS/WARN/FAIL 品質閘門表格
- WHEN 發現問題 THEN WARN（非阻塞）
- WHEN 各 Skill THEN 檢查項依階段不同（Story: Related Modules, Plan: Context Mode, Tasks: Architecture Layers）

### Behavior Specifications

#### REQ-TEMPLATES-040: Knowledge Quality Gate Table
5 個 Planning Skill 在 Core Workflow 結束時顯示三態閘門表格，各 Skill 檢查項不同。

---

## US-9: 設計階段 [P1]

身為一個使用 Prospec 的開發者，
我想要從 proposal 產出視覺與互動規格（Generate），或從設計工具反向萃取規格（Extract），
以便設計規格成為實作的精確依據。

**Acceptance Scenarios:**
- WHEN 無 design-spec.md 且無設計工具設計 THEN Generate Mode
- WHEN 有 design-spec.md 或設計工具設計 THEN Extract Mode
- WHEN 完成 THEN 產出 design-spec.md + interaction-spec.md
- WHEN 實作 UI 任務 THEN MCP-First 讀取設計精確值

### Behavior Specifications

#### REQ-TEMPLATES-050: Design Spec Format Reference
`design-spec-format.hbs` — 平台無關視覺規格：Visual Identity, Components, Responsive Strategy，使用 tokens 非 hardcoded。

#### REQ-TEMPLATES-051: Interaction Spec Format Reference
`interaction-spec-format.hbs` — Interaction DSL (draft-1)：Screen/Component States, Transitions, Flow sequences。

#### REQ-TEMPLATES-052: prospec-design Skill Template
- WHEN triggered, THEN detect mode via proposal.md (ui_scope) + .prospec.yaml (design.platform)
- WHEN Generate, THEN produce specs from proposal
- WHEN Extract, THEN read via MCP + reverse-produce specs; ambiguous → [NEEDS CLARIFICATION]
- WHEN Phase 4, THEN verify via screenshot or structural comparison

#### REQ-TEMPLATES-053~056: Platform Adapters (pencil / Figma / Penpot / HTML)
4 個平台 adapter 各定義 Design/Implement/Verify 三階段的 MCP 操作指引：
- **pencil**: batch_design(), set_variables(), batch_get(), get_screenshot()
- **Figma**: HTML prototype → html-to-figma MCP, node detail reading, property comparison
- **Penpot**: Penpot API create/export/compare
- **HTML**: prototype/ directory (zero deps), CSS custom properties, DOM comparison

#### REQ-TEMPLATES-058: Implement Skill MCP-First Design Reading
- WHEN UI task, THEN Phase 2 loads design specs + adapter; Phase 3 reads precise values via MCP first
- WHEN no design-spec.md, THEN warn

---

## US-10: 快速前進模式 [P2]

身為一個需求明確的開發者，
我想要一次生成所有 planning artifacts（story → plan → tasks），
以便需求清楚時快速推進，不必逐步觸發三個 skill。

**Acceptance Scenarios:**
- WHEN 執行 `/prospec-ff` THEN 依序執行 story → plan → tasks（`scale: quick`：story → tasks，跳過 plan）
- WHEN 任一階段失敗 THEN 停止並回報進度
- WHEN 全部完成 THEN metadata.yaml status: `tasks`

---

## US-11: Skill 產出自評（Output Contract）[P1]

身為一個使用 Prospec 的開發者，
我想要每個 Skill 執行完都明確告訴我「成功」或「哪裡未達成」，
以便不必逐行檢查 artifact 就能判斷產出品質，並讓後續階段（verify / review / 回饋晉升）有結構化的成功/失敗訊號可消費。

**Acceptance Scenarios:**
- WHEN 任一 Skill 執行完畢 THEN 輸出精簡 Output Summary（達成 N/M + 未達成項 + 整體 PASS/WARN/FAIL）
- WHEN 定義 Success Criteria THEN 每條客觀可判定（檔案/grep/測試/數量），不可機械判定者標 (manual)
- WHEN 移除任一 skill 的 Output Contract 區段 THEN contract test 轉紅

### Behavior Specifications

#### REQ-TEMPLATES-060: Skill Output Contract Section
11 個 skill template 各含 `## Output Contract`（Success Criteria + Failure Conditions），位於 `## NEVER` 之前；deployed SKILL.md 經 agent sync 同步。
- WHEN a skill template renders, THEN it contains `## Output Contract` with `### Success Criteria` + `### Failure Conditions`
- WHEN a non-artifact skill (explore), THEN success is defined by observable outcome, not artifact conditions

#### REQ-TEMPLATES-061: Output Summary and Objective Criteria
每個 skill 結尾輸出統一格式 Output Summary，採 PASS/WARN/FAIL 詞彙；Success Criteria 客觀可判定。
- WHEN a skill finishes, THEN it emits `Met N/M | Unmet: ... | Overall: PASS|WARN|FAIL | Next: ...`
- WHEN 屬 linear-flow skill（plan→tasks→implement→review→verify→archive）, THEN `Next:` 欄承接 status-aware Next-Step Handoff（REQ-TEMPLATES-098）
- WHEN a criterion is not mechanically checkable, THEN it is marked (manual), not faked as PASS

#### REQ-TESTS-001: Output Contract Contract Test
`skill-format.test.ts` 驗證每個 skill 含 Output Contract 區段（heading-scoped 斷言）。
- WHEN the contract test runs, THEN every SKILL_DEFINITIONS skill asserts `### Success Criteria` + `### Failure Conditions`
- WHEN a skill's Output Contract section is removed, THEN its assertion turns red

---

## US-12: Entry/Exit 雙閘門與跨階段品質追溯 [P1]

身為一個使用 Prospec 的開發者，
我想要每個 Skill 啟動時做阻擋式前置條件檢查（Entry Gate）、結束時對 Constitution 三級驗證並把 WARN/FAIL 記入 quality_log（Exit Gate），
以便劣質前置不被帶進下一階段、未解問題能跨 Skill 追溯收斂（越用越準）。

**Acceptance Scenarios:**
- WHEN Skill 啟動而前序 artifact 缺失/不完整或 Constitution 為空 THEN Entry Gate FAIL、阻擋並說明缺什麼
- WHEN Skill 結束 THEN skill-end 摘要含 Constitution 三級結果（消費 BL-031 severity），FAIL 附建議但 advisory 不硬阻擋
- WHEN Exit Gate 產生 WARN/FAIL THEN 記入 `metadata.yaml` quality_log，下一 Skill 的 Entry Gate 讀取並顯示前序未解 WARN

### Behavior Specifications

#### REQ-TYPES-022: quality_log Metadata Field
`ChangeMetadataSchema` 新增 optional `quality_log`（`skill`/`date`/`result`/`warnings[]`），作為 gate 記錄形狀的型別契約。
- WHEN metadata 含 quality_log, THEN schema 接受且 `ChangeMetadata.quality_log` 型別正確
- WHEN metadata 省略 quality_log, THEN 仍通過驗證（向後相容）
- WHEN result 非 PASS/WARN/FAIL, THEN 拒絕（不新增第四狀態）
- 註：metadata.yaml 經 `parseYaml(doc.toJS())` lossless 讀取（非此 schema 在讀取時 `.parse()`）；persist 靠 round-trip，本欄位為型別契約

#### REQ-TEMPLATES-064: Entry Gate (Blocking Preconditions)
new-story / plan / tasks / ff / verify 各含 `## Entry Gate`：階段相稱的前置條件檢查（前序 artifact 完整、Constitution 非空、讀 quality_log 取前序未解 WARN）。Entry FAIL 阻擋並說明；復用既有 status-lifecycle，不新增獨立 audit。
- WHEN 渲染, THEN 5 skill 皆含 `## Entry Gate` 與階段相稱前置 checklist
- WHEN 前置不足（缺 artifact / Constitution 空 / 前序未解 WARN）, THEN Entry Gate FAIL、阻擋並說明
- WHEN 移除任一 skill 的 Entry Gate, THEN 對應 contract test 轉紅

#### REQ-TEMPLATES-065: Exit Gate Folded into Skill-End
在 5 skill 既有 Output Contract 的 skill-end 摘要折入 Exit Gate：比對產出 vs Constitution，消費 BL-031 severity（MUST→FAIL/SHOULD→WARN/MAY→資訊性，grade 維持 PASS/WARN/FAIL），WARN/FAIL 記入 metadata `quality_log`。Exit advisory，不硬阻擋。
- WHEN skill 結束, THEN skill-end 摘要含 Constitution 合規結果（依 severity 分級）
- WHEN 有 WARN/FAIL, THEN 記入 `quality_log`；Exit 不硬阻擋流程
- WHEN Constitution 為自由文字（無 severity）, THEN 退回不分級判讀（向後相容）

#### REQ-TESTS-022: Gate + quality_log Tests
contract test 驗證 5 skill 含 `## Entry Gate` 與 Exit Gate 折入；unit test 驗證 `quality_log` schema（接受/省略/result 三態/lifecycle 含 `implemented`）。
- WHEN contract test 執行, THEN 對 new-story/plan/tasks/ff/verify 斷言 Entry/Exit Gate 存在
- WHEN unit test 執行, THEN quality_log 可省略、result 限 PASS/WARN/FAIL、6 個 lifecycle 狀態（含 implemented）皆通過

---

## US-13: 對抗式 Code Review → Fix 迴圈 [P1]

身為一個使用 Prospec 的開發者，
我想要在 implement 與 verify 之間有一個獨立的對抗式 code review → fix 迴圈，
以便 critical 問題在被評為「可部署」前就被攔下、不必手動回灌 review 結果，且提交歷史天生 review-clean。

**Acceptance Scenarios:**
- WHEN 所有 tasks 完成（status: implemented）THEN 可觸發 `/prospec-review`，由獨立 fresh-context reviewer 審相對 branch base 的整個 change diff
- WHEN review 報 critical THEN 先由獨立 verifier 確認存在性，確認且為 drop-in 才自動修、重跑測試保綠、re-review 至無 critical 或達硬上限(3,cap5)否則升級給人
- WHEN review 報 major THEN 不自動修、降為 WARN 經 `quality_log` 傳 verify（不計 grade）；nit 直接 drop
- WHEN 執行環境不支援 sub-agent THEN 提出選擇（harness reviewer 或單輪 fresh-context），不靜默跳過

### Behavior Specifications

#### REQ-TYPES-023: Register prospec-review Skill
`SKILL_DEFINITIONS` 新增第 12 skill `prospec-review`（type `Execution`）；`agent-sync` 的 `getSkillReferences` referenceMap 加 `prospec-review → review-format`。無新 metadata schema——review 跨階段訊號走既有 `quality_log`。
- WHEN `prospec agent sync`, THEN deployed 含 `prospec-review/SKILL.md` + `references/review-format.md`
- WHEN registered, THEN `SKILL_DEFINITIONS` 為 12 skill

#### REQ-TEMPLATES-066: Adversarial Review→Fix Loop Skill
`prospec-review` 在 implement→verify 間以 fresh-context reviewer 審 change diff；reviewer 模式 B 預設 / A opt-in；**spec-architecture lens**（delta-spec REQ／依賴方向／conventions／ripple）一律疊加；critical 經獨立 verifier 確認後 drop-in auto-fix，硬上限後升級給人。
- WHEN rendered, THEN 含 Entry Gate / Reviewer Modes / spec-architecture lens / verifier-confirmed critical / 硬上限 / escalation / Output Contract + Exit Gate
- WHEN critical reported, THEN existence-verified 才 auto-fix；architectural/ambiguous → 升級給人
- WHEN findings persist, THEN 落 `review.md`（依 Location 去重、severity 取最高、跨輪 carry-forward）

#### REQ-TEMPLATES-067: Review Severity Contract + review.md Format
`references/review-format.md` 定義嚴重度準則與 review.md 結構。critical = 真實 defect/安全 ＋ 依賴方向違規 ＋ 與 delta-spec REQ 邏輯矛盾（completeness 留 verify）；major = perf/maintainability（不擋、降 WARN 不計 grade）；nit drop。
- WHEN referenced, THEN 含三級準則 + auto-fix 邊界 + review.md 欄位（location/severity/lens/status）+ reviewer-lens 定義

#### REQ-TEMPLATES-068: Unified Commit Boundary After verify(S/A)
commit 邊界統一到「最後一個會要求改 code 的 gate」之後＝verify 達 S/A 後；implement 延後 commit、verify 在 S/A 後**提示使用者** commit（折入 implement+review+verify fixes 為單一 atomic-by-feature commit）、**prospec 不自動 commit**。
- WHEN implement 完成, THEN 不建議即時 commit、導向 review→verify
- WHEN verify S/A, THEN 提示使用者 commit、不自動 commit；review 與 verify 對 layering 各自獨立判定

#### REQ-TESTS-023: prospec-review Contract Tests + Commit-Boundary Assertions
contract 驗證 skill 數 12、`prospec-review` 結構（**section-scoped** 斷言）、implement 延後 commit、verify S/A 後提示 commit。
- WHEN contract runs, THEN 斷言 section-scoped；移除 prospec-review 任一關鍵區段（loop/persistence）會轉紅（mutation-verified）

---

## US-21: 依賴層知識（on-demand Context7）[P3]

身為一個使用 Prospec 的開發者，
我想要在 plan/implement 觸及第三方 library 時，選擇性地從 Context7 MCP（若可用）取得當前 usage 並注入 Technical Summary，
以便實作以正確的 API 用法為基礎，且工作流不耦合外部服務。

**Acceptance Scenarios:**
- WHEN 變更觸及第三方 lib 且 Context7 可用，THEN plan Phase 4 注入 Technical Summary 的 External Library Usage 子節（標 untrusted）
- WHEN task 觸及第三方 lib（含 `scale: quick` 無 plan）且 Context7 可用，THEN implement Phase 3 寫 code 前 on-demand 查詢作參考
- WHEN Context7 不可用／查無結果，THEN 靜默跳過 + 一行 informational（非 WARN/FAIL/gate/阻擋）
- WHEN 步驟存在，THEN 永不進 `[STABLE]` Startup Loading 前綴、輸出不執行、不作任何 gate

#### REQ-TEMPLATES-101: Plan On-Demand Context7 Injection
`prospec-plan` Phase 4 的 optional、in-phase、scope-guarded 步驟——觸及第三方 lib 且 Context7 可用時，resolve-library-id/query-docs 取 snippet 注入 Technical Summary。
- WHEN 觸及第三方 lib 且 Context7 可用, THEN 注入 External Library Usage 子節（untrusted、provider-neutral 短名、非 Startup Loading 項）
- WHEN 無第三方 lib 或無 Context7, THEN 不查詢

#### REQ-TEMPLATES-102: Implement On-Demand Context7 Lookup
`prospec-implement` Phase 3 的 optional、per-task lazy 區塊（比照 For UI tasks 形狀），明示 `scale: quick`（無 plan/Technical Summary）為主要受益路徑。
- WHEN task 觸及第三方 lib 且 Context7 可用, THEN 寫 code 前 on-demand 取 usage 作 untrusted 參考
- WHEN startup, THEN 不批次載入（per-task lazy）

#### REQ-TEMPLATES-103: Dependency-Layer Graceful / Untrusted / Non-Gating Contract
plan/implement 的 Context7 步驟 graceful degradation：不可用/查無即靜默跳過 + 一行 informational，輸出 untrusted、不執行、不作 gate；兩 skill 的 NEVER 載明此契約。
- WHEN Context7 miss/unavailable, THEN skip silently + informational（非 WARN/FAIL/gate/阻擋）
- WHEN snippet 注入, THEN 不執行、不作 verify/review gate

#### REQ-TESTS-027: Dependency-Layer Section-Scoped + Mutation-Verified Contract
`tests/contract/skill-format.test.ts` section-scoped 釘住 REQ-TEMPLATES-101/102/103 之步驟與字樣，mutation-verified；含 negative assertion 確認未新增 `[STABLE]` 項。
- WHEN contract runs, THEN 自 plan/implement 對應區段切片驗證步驟 + graceful/untrusted/non-gating 字樣
- WHEN 移除任一步驟, THEN 對應斷言轉紅；Startup Loading 不含 Context7（negative）

---


#### REQ-TESTS-033: archive spec-history 目的地 contract pin

---

## Edge Cases

- 觸及第三方 lib 但 Context7 不可用：靜默跳過 + 一行 informational（依賴層知識，US-21）
- `scale: quick` 無 plan：依賴層知識僅由 implement Phase 3 hook 提供（US-21）
- Archive 目錄已存在：警告，詢問覆蓋或跳過
- 變更缺少 delta-spec.md：部分摘要歸檔，Spec Sync 跳過
- Knowledge update 失敗：非致命，建議手動更新
- 無 story 就執行 plan：提示先建立 story
- 超過 30 個任務：建議拆分 Story 或合併
- Feature Spec Sync 時 Feature Spec 不存在：建立新檔
- Verify 無 Feature Spec：跳過一致性檢查
- Design Skill 無 design.platform 設定：預設 html adapter
- Extract Mode 模糊設計意圖：標記 [NEEDS CLARIFICATION]
- UI 任務無 design-spec.md：Implement Skill 警告

## Success Criteria

- **SC-001**: 所有 SDD 階段（story → design → plan → tasks → implement → verify → archive）產出格式正確的 artifacts
- **SC-002**: Feature Spec Change History 累積稽核軌跡，product.md 自動反映最新功能地圖
- **SC-003**: 支援 5+ 個並行 change story 而不混淆
- **SC-004**: Prospec 可用於自身開發（self-host），驗證工具實用性

---

## US-14: Knowledge 同步閘門時序重整 [P1]

身為一個使用 prospec 開發的工程師，
我想要 verify 對「本變更 knowledge 落差」只給 informational 提示，並由 archive Entry Gate 作為唯一強制的 knowledge 同步檢查點，
以便 WARN 恢復「真的有問題」的訊號價值，且同步檢查的是所有修正（review fix、FAIL 修正）完成後的最終狀態，不會漏更新。

**Acceptance Scenarios:**
- WHEN 變更已 implement 但受影響模組 README 未反映 delta-spec THEN verify V4 輸出 informational（列受影響模組、指向 archive Entry Gate），不計入 S/A/B/C/D 等級
- WHEN 既有 knowledge 與目前程式碼不符且非本變更造成 THEN V4 仍以 graded WARN/FAIL 回報
- WHEN 歸檔對象 knowledge 未同步 THEN archive Entry Gate FAIL、停止並引導 `/prospec-knowledge-update`；同步後重跑通過
- WHEN 變更不影響任何模組（純 planning/docs）THEN Entry Gate 視為 PASS

### Behavior Specifications

#### REQ-TEMPLATES-083: Archive Knowledge Sync Entry Gate
archive skill 含 `## Entry Gate`，為生命週期唯一強制 knowledge 同步檢查點：(1) status=verified；(2) 受影響模組（delta-spec ADDED/MODIFIED/REMOVED REQ 前綴）knowledge 已同步，REMOVED 行為須自 README 移除。生命週期語意雙檔同步：`_status-lifecycle.md` 與 init 模板 `status-lifecycle.md.hbs`（contract test 鎖定）。
- WHEN rendered, THEN archive SKILL.md 含 Entry Gate（verified + knowledge sync 兩條件）；舊「Knowledge update failure 不可 block archiving」NEVER 文案不再出現（negative assertion）
- WHEN knowledge 未同步, THEN Entry Gate FAIL、停止歸檔並指向 `/prospec-knowledge-update`；無影響模組視為 PASS
- WHEN 移除 Entry Gate 區段或恢復互動 Phase 4 文案, THEN 對應 contract test 轉紅（mutation-verified）

#### REQ-TEMPLATES-120: Archive Entry Gate standard/full Feature-Prefix Fallback
prospec-archive Entry Gate 與 Phase 4：`standard`/`full` 的 delta-spec REQ prefix 命中 feature-map `req_prefixes` 時為 feature-prefix（非 module），改由 `metadata.related_modules` + (`**Feature:**`→feature-map `modules`) 推導受影響模組，與 backfill 同構；module-prefix REQ 維持原推導。修補 feature-prefixed REQ（如 `REQ-MCP-*`）在 standard/full 的 knowledge-sync 落空 + phantom module 風險（BL-043）。
- WHEN standard/full REQ prefix 命中 feature-map req_prefixes, THEN 以 related_modules/feature-map 推導受影響模組、非 prefix-as-module
- WHEN REQ 為 module-prefix, THEN 維持原 prefix→module 推導（向後相容）

#### REQ-SERVICES-033: Archive Auto Knowledge-Update 轉發 related_modules
archive 將 `metadata.related_modules` 帶入 auto knowledge-update（`ArchivedChange.relatedModules` → `executeKnowledgeUpdate`），使 standard/full 的 feature-prefixed REQ 同步到真實模組，而非依 REQ prefix 落空或 mint phantom。
- WHEN standard/full change 含 feature-prefix REQ 且 service 層 auto-update 執行, THEN 以 related_modules 解析受影響模組

#### REQ-TESTS-035: Feature-Prefix 同步端到端與不變量測試
archive wiring 測試斷言 standard + feature-prefix REQ 轉發 `related_modules`；feature-map `mcp-server.modules` 完整性（真檔契約）+ `syncFeatureMap` no-clobber 不縮減 curated 集。
- WHEN archive 對 standard + feature-prefix REQ 執行, THEN executeKnowledgeUpdate 收到 related_modules
- WHEN 既存 feature 跑 syncFeatureMap, THEN curated modules 集不被縮減

---

## US-15: 相稱流程（Scale-Aware Task Contract）[P1]

身為一個使用 prospec SDD 流程的開發者，
我想要變更依複雜度縮放流程重量——story 階段評估 scale（quick/standard/full）經我確認寫入 metadata、quick 跳過 plan、task 帶 kind 標記、各 gate 依 scale 與 kind 誠實降級，
以便小型修正不付出完整規劃儀式的審閱成本，且工程紀律（TDD、對抗式審查、Constitution 稽核）與稽核軌跡不隨 scale 縮減。

**Acceptance Scenarios:**
- WHEN new-story（或 ff）完成需求收集 THEN 依判準表建議 scale 並明示理由，經使用者確認或改選後才寫入 `metadata.scale`；預期影響 spec-covered 行為的變更不得建議 quick
- WHEN `scale: quick` THEN proposal 採精簡形態、跳過 plan（story → tasks）、不載入模組 README；review/verify 的 delta-spec 維度標 `not-applicable`（不偽裝 PASS）
- WHEN tasks 產出任務 THEN 非 code 任務帶 `[M]`/`[V]` 標記；verify/archive 完成率僅計 code task，未勾 `[M]`/`[V]` 不阻擋任何 gate
- WHEN `scale: quick` 的變更歸檔 THEN Entry Gate 以實際 diff 比對 specs/features/（有影響→補 Spec Impact 段落作 graduation key）並以 diff 檔案路徑經 module-map 推導 knowledge gate 受影響模組
- WHEN 既有變更無 `scale` 欄位或 tasks.md 無 kind 標記 THEN 行為與現行完全一致（缺省=standard、無標記=code）

### Behavior Specifications

#### REQ-TYPES-026: ChangeMetadata Scale Field
`ChangeMetadataSchema` 含 optional `scale` 欄位（`CHANGE_SCALES` enum：`quick`/`standard`/`full`），缺省語意為 standard。
- WHEN 解析 metadata, THEN 三合法值通過、非法值被 zod enum 拒絕、無欄位仍 valid（向後相容）

#### REQ-TEMPLATES-084: New-Story Complexity Assessment Phase
new-story Phase 3.5：判準表（觸及模組數／spec-covered 行為／變更性質）+ LLM 建議 + 使用者確認後寫入 `metadata.scale`；quick 確認後 proposal 採精簡形態（單 Story + 2-3 WHEN/THEN，免 FR/SC 枚舉）。
- WHEN 評估, THEN 「預期影響 spec-covered 行為 → 否決 quick（至少 standard）」為硬性判準
- WHEN 未經使用者確認, THEN 不得寫入 scale（NEVER 守則 + contract 斷言鎖定）

#### REQ-TEMPLATES-085: Fast-Forward Quick Path
ff 讀取 `metadata.scale`：quick 跳過 Phase 3（Plan Generation；不產 plan.md/delta-spec.md、不載模組 README），狀態 story → tasks；standard/full 維持三段流程。生命週期雙副本（`_status-lifecycle.md` + init 模板）記載 quick 轉移並以 contract 斷言鎖同步。
- WHEN quick, THEN Output Contract 以「plan 依契約缺席」自評，不誤報 Unmet

#### REQ-TEMPLATES-086: Task Kind Marker Schema (Frozen)
kind 標記語法單一凍結於 tasks-format reference：`[M]` manual、`[V]` verification、無標記=code，與 `[P]` 並存（`[P]` 在前）。其他模板引用不重述（negative assertion 鎖定）。
- WHEN 消費端（tasks/verify/archive/implement）需要定義, THEN 引用 tasks-format「Task Kind Markers」段

#### REQ-TEMPLATES-087: Scale-Tiered Plan Depth
plan 依 scale 三級：quick 於 Entry Gate 拒絕並導向 tasks（不產檔）、standard ≤120 行（缺省）、full 完整架構分析（不受 120 行上限）。plan-format reference 含三級指引。

#### REQ-TEMPLATES-088: Verify Kind-Aware Completion and Quick Dimension Reduction
verify V1 完成率分母僅含 code task（`[M]`/`[V]` 分列為提醒）；`scale: quick` 時 V2 spec-compliance 標 `not-applicable`、不偽裝 PASS、不計入等級；Entry Gate 對 quick 僅要求 proposal + tasks。V1 數據來源在 `prospec check --json` 報告可用時為其 `task-completion` 檢項（同一引擎、不重算），不可用時退回 LLM 計算並明示——分母規則與 quick 縮維不變。

#### REQ-TEMPLATES-089: Archive Quick Spec-Impact Entry Gate
archive Entry Gate 對 `scale: quick`：(1) knowledge gate 受影響模組改由實際 diff 檔案路徑經 `module-map.yaml` 推導（REQ 前綴對缺席 delta-spec 為空集合、會靜默放行）；(2) spec-impact 檢查以 diff 比對 specs/features/——有影響 FAIL 並要求補 proposal 末段 Spec Impact 段落（graduation key），無影響則 summary.md 記錄診斷並跳過 graduation。spec 比對為 LLM 判斷步（不宣稱確定性）；模組推導為確定性路徑對應。

#### REQ-TEMPLATES-090: Review Quick-Path Degradation
review 對 `scale: quick`：Entry Gate artifacts 降為 proposal + tasks；spec-architecture lens 的 delta-spec 比對標 `not-applicable`（依賴方向／conventions／ripple 照審）；diff 疑似觸及 spec-covered 行為時提前警示（早於 archive gate 的互補訊號）。

## US-16: Verify 消費確定性 Drift 引擎 [P1]

身為一名在開發期執行 `/prospec-verify` 的開發者，
我想要 verify 的結構性維度直接執行 `prospec check --json` 並解讀其報告，
以便開發期與 CI 用同一個檢查引擎，結果一致、不重複用 LLM 做機器能做的事。

**Acceptance Scenarios:**
- WHEN `prospec check` 可用，THEN V1 完成率與 V4 staleness 事實來自報告（含 file+line 定位），verify 不以 LLM 重做
- WHEN 指令不可用，THEN verify 明示「drift engine unavailable — falling back to manual checks」後走文件化退回路徑，絕不默默跳過
- WHEN 報告檢項為 `skipped`，THEN verify 呈現 skip 原因、不視為 PASS

#### REQ-TEMPLATES-092: Verify Consumes Check Report
verify Startup Loading 以 [DYNAMIC] 步驟執行 `prospec check --json`；V1/V4 引用報告數據與位置；退回與 skipped≠PASS 規則明文於 NEVER 與 Error Handling（引擎本體見 drift-detection feature spec）。

---

## US-17: Constitution 實質空白偵測提示 [P1]

身為一個採用 prospec 的新專案開發者，
我想要 `/prospec-explore` 與 `/prospec-knowledge-generate` 結束時偵測 Constitution 是否實質空白並提示填寫，
以便 Constitution 成為真實的專案原則，而非讓 verify 合規檢查與 Entry/Exit gate 淪為 no-op。

**Acceptance Scenarios:**
- WHEN explore/knowledge-generate 結束且 Constitution 僅含種入範例規則 + Language Policy（或不存在、僅空行/註解）THEN 結尾輸出提示：實質為空、gate 將失效、引導編輯 `CONSTITUTION.md`
- WHEN 已有至少一條使用者自訂規則 THEN 不輸出提示
- WHEN 提示輸出 THEN 遵循 Constitution Language Policy；advisory 不阻擋

### Behavior Specifications

#### REQ-TEMPLATES-096: Constitution Substantive-Emptiness Prompt
explore + knowledge-generate 模板於結尾偵測 Constitution 實質空白（僅種入範例規則 + Language Policy、不存在、或僅空行/註解）→ 輸出填寫提示。純 skill 指令（agent 自判，不引入 lib/CLI）。
- WHEN 實質空白, THEN 提示「為何需自訂規則 + 編輯步驟」；已有自訂規則則不提示
- WHEN contract runs, THEN 斷言兩模板含偵測提示（`substantively empty` + `seeded example rules`）

## US-18: 統一 Phase 編號 + per-phase gate [P2]

身為一個採用 prospec 的團隊工程師，
我想要所有含 numbered Phase 的 skill 一律 Phase 1 起、每個非收尾 Phase 後有精簡通過 checklist，
以便流程編號可預測、且在每階段就驗證成果，不必等 skill 結束的 Exit Gate。

**Acceptance Scenarios:**
- WHEN 檢視任一 numbered-phase skill THEN Phase 1 起（ff 不再有 Phase 0）；語義性小數（archive 3.5/3.6/4.5、new-story 3.5）與子步驟（design 2a/2b）保留並註明刻意插入
- WHEN 完成某非收尾 Phase THEN 該 Phase 後有 2-3 項可觀察 gate checklist（與 skill 層 Entry/Exit gate 並存）
- WHEN 依 scale 略過 Phase（如 quick 跳 plan）THEN 標記 skipped、不誤判缺漏

### Behavior Specifications

#### REQ-TEMPLATES-097: Phase-1 Start + Per-Phase Gates
8 個 numbered-phase skill 一律 Phase 1 起（修 ff Phase 0）；每非收尾 numbered Phase 後加 2-3 項 gate checklist。語義性小數/子步驟保留並文件化（不整數化以免 cascade 破壞 spec/lifecycle 交叉引用）。單階段 skill 豁免。
- WHEN rendered, THEN ff 無 `Phase 0`；每 numbered-phase skill gate 數 ≥ 非收尾 phase 數（contract 斷言）

#### REQ-TESTS-026: Instruction-Quality Contract Assertions
`skill-format.test.ts` 斷言鎖定本 feature 全部模板結構（Phase 編號、per-phase gate、Constitution 偵測提示、status-aware handoff、session 偵測、implement progress）；移除任一即轉紅（+19 斷言）。
- WHEN contract runs, THEN US-17~20 對應斷言全綠

## US-19: status-aware Next-Step Handoff + 新 session 偵測 [P2]

身為一個迭代開發中的 prospec 開發者，
我想要 6 個 linear-flow skill 結尾依 SDD workflow order 建議下一步並詢問執行，且新 session 啟動時偵測 `.prospec/changes/` 進行中變更，
以便流程連續、不因 session 中斷而走錯或重做。

**Acceptance Scenarios:**
- WHEN plan/tasks/implement/review/verify/archive 結束 THEN 依 SDD workflow order（review/learn 無 status 節點，故依序非僅依 status）建議下一步 + 詢問「Run <next-step> now? (Y/n)」；Y→agent 觸發、n→停留；絕不靜默 auto-run
- WHEN 階段為 terminal（archived）THEN 指向定期 `/prospec-learn`；grade B/C/D 不前進則指向修正步而非下一 skill
- WHEN 新 session 啟動且存在 status≠archived 變更 THEN entry config 提示其名稱、status 與接續步

### Behavior Specifications

#### REQ-TEMPLATES-098: Status-Aware Next-Step Handoff
plan/tasks/implement/review/verify/archive 結尾含依 SDD workflow order 的 Next-Step Handoff + `(Y/n)`；Y 由 agent 觸發下一步、n 停留；含 terminal/非進展分支。承接 REQ-TEMPLATES-061 的 `Next:` 欄。
- WHEN rendered, THEN 六 skill 含 `Next-Step Handoff` + `(Y/n)` + `_status-lifecycle.md`（contract 斷言）

#### REQ-TEMPLATES-099: New-Session In-Progress Change Detection
agent entry config 於 session 啟動偵測 `.prospec/changes/` status≠archived 變更並提示接續步（依 workflow order）。
- WHEN rendered, THEN entry config 含 `Session Start` + `.prospec/changes/` 偵測

## US-20: implement progress 錨定 [P3]

身為一個以 implement 進行長實作的開發者，
我想要每完成一個 task 後輸出 `Progress X/Y | Goal | Next`，
以便 50+ tool call 後仍能定位進度、避免目標漂移。

**Acceptance Scenarios:**
- WHEN implement 完成一個 task（勾選 checkbox）THEN 輸出 `Progress X/Y | Goal: <proposal 一句> | Next: <下一 task>`；分母僅計 code task
- WHEN 全部 code task 完成 THEN 輸出 `Progress Y/Y (Complete)` 並指向 `/prospec-review`

### Behavior Specifications

#### REQ-TEMPLATES-100: Implement Progress Anchoring
prospec-implement 每 task 完成 checkpoint 後輸出三段式 `Progress/Goal/Next`（分母僅 code task）。ff 不適用（無逐 task 迴圈）。
- WHEN rendered, THEN implement 含 `Progress X/Y` + `Progress Y/Y (Complete)`（contract 斷言）

---

## US-22: 回填規格萃取（brownfield WHAT-layer 補全）[P2]

身為一個 brownfield 專案開發者，
我想要對既有但無 Feature Spec 覆蓋的 code 以 **feature 縱切片**為單位反向萃取出 route-compatible 的 Feature Spec 草稿（intent 推不出處標 `[NEEDS CLARIFICATION]`）並指出 WHAT-layer 未覆蓋的 feature/能力，
以便不必等 N 個 forward change 累積就有 WHAT-layer 覆蓋，且不污染信任區。

**Acceptance Scenarios:**
- WHEN 對某 feature 縱切片觸發 `/prospec-backfill-spec` 且來源有足夠行為線索 THEN 跨「貢獻該 feature 的 module」收斂、於 `.prospec/changes/[name]/backfill-draft.md` 產出 route-compatible 草稿（`**Feature:**`/`**Story:**` + US/AC 候選）
- WHEN intent 欄位（*So that* 價值／目標角色）無法從來源推斷 THEN 標 `[NEEDS CLARIFICATION]`、不捏造；story-level `[NEEDS CLARIFICATION]` 比例 > 50% THEN 中止／建議改走 forward
- WHEN 跨模組事件流／outbound 整合邊的 emitter 與 handler/sink 兩端皆 trace 到具體 callsite THEN 升為一等 AC；僅解析到一端者標 `[NEEDS CLARIFICATION]`/Deferred（絕不斷言 handler 未解析的跨模組流）
- WHEN 萃取完成 THEN 信任區 `specs/features/` 0 寫入（草稿僅落 change 目錄）
- WHEN 偵測 WHAT-layer 覆蓋 THEN 列出 code 存在但無 Feature Spec REQ 覆蓋的 feature/能力（informational、不阻擋、不自動觸發）

### Behavior Specifications

#### REQ-TEMPLATES-104: prospec-backfill-spec 回填萃取（取材單位 = feature 縱切片）
獨立 skill `prospec-backfill-spec.hbs` 執行回填萃取：多源 triangulation 依 source→field 對照填欄（code+tests→behavior+AC、git body→*So that*、docs/README→role/value/目標用戶、ai-knowledge→module routing），以 **feature 縱切片**為取材單位、兩段式 gather-by-module（各 module 行為清冊，降為中間素材）→ cluster-by-feature（產物）：枚舉行為 across 貢獻該 feature 的所有 module、再聚類成該 feature 的 US 並明列 deferred，產出 route-compatible 草稿至 `.prospec/changes/[name]/backfill-draft.md`。
- WHEN 觸發 prospec-backfill-spec, THEN 依 source→field 對照、以 feature 縱切片為單位產出 route-compatible 草稿（`**Feature:**`/`**Story:**` + US/AC）
- WHEN 一 feature 橫跨多 module, THEN 兩段式 gather→cluster、枚舉 across 貢獻 module 再聚類、明列 deferred（coverage 須可見、不得靜默部分覆蓋）
- WHEN 陳述可數事實（enum/format/mapping 數量、跨模組流）, THEN 對來源核實，未核實寫 `~N` 或標 `[NEEDS CLARIFICATION]`

#### REQ-TEMPLATES-105: 回填萃取 intent 護欄（[NEEDS CLARIFICATION] + >50% story-level）
推不出的 story-level intent（*So that*／目標角色）標 `[NEEDS CLARIFICATION]`、不捏造；目標角色可自 git/docs 產品/消費者名反推；比例 > 50% 中止／建議 forward，分母只計 story-level intent（heuristic 校準 WHY 以 behavior AC 記錄其值、不計入中止分母）。feature 縱切片較寬（story 數較多、intent 來源較雜：多 commit／多 README），須避免「行為齊全但少數 intent 不可推得」誤觸 abort——沿用 heuristic-WHY 豁免為先例。
- WHEN intent 推不出, THEN 標 `[NEEDS CLARIFICATION]`、禁止捏造（含英→繁中翻譯落差從寬標記）
- WHEN `[NEEDS CLARIFICATION]` 比例 > 50%（分母只計 story-level intent）, THEN 中止或建議改走 forward

#### REQ-TEMPLATES-106: 信任區不變式 + 候選 slug 提議
回填萃取永不寫入 `specs/features/`（archive 維持唯一寫入者）；候選 feature slug 提議但不自決，以 `[NEEDS CLARIFICATION]` 請人確認且須過 `isSafeResourceName`；晉升為人工轉 delta-spec → verify → archive（無第二寫入者）。
- WHEN 產出草稿, THEN 永不直寫信任區；候選 slug 標 `[NEEDS CLARIFICATION]` 且 `isSafeResourceName`-valid
- WHEN 晉升, THEN 人工轉 delta-spec 走既有 forward archive 路徑

#### REQ-TEMPLATES-107: WHAT-layer 未覆蓋 feature 偵測（scoping）
agent 讀 `specs/features/`，列出 code 存在但無 REQ 覆蓋的 **feature/能力**（cross-module 行為切片）作為萃取範圍依據——以未覆蓋 feature 為單位，非 module（module 已覆蓋 ≠ feature 已覆蓋）；已覆蓋者不入列。覆蓋來源：有 `feature-map.yaml`（BL-040）時為決定性 set-difference；無時以既有 slug 盤點 + module-map 推導切片參與，prose 判定。
- WHEN 偵測覆蓋, THEN 列未覆蓋 feature（informational、不阻擋、不自動觸發萃取）
- WHEN feature 已被既有 Feature Spec REQ 覆蓋, THEN 不入列（避免重複萃取）

#### REQ-TESTS-028: 回填 skill section-scoped + mutation-verified 契約斷言
`tests/contract/skill-format.test.ts` section-scoped 釘住 `prospec-backfill-spec` 字樣（source→field、>50% story-level 分母、信任區 never-write、route-compatible `backfill-draft.md`、未覆蓋偵測、completeness/count-fidelity），mutation-verified；含 negative assertion 確認 `prospec-design` 不再含反向變體（input=code/Phase 2b-code/reverse-draft 皆無），且 backfill 內容未進新 skill 的 Startup Loading 穩定前綴。
- WHEN contract runs, THEN 自 prospec-backfill-spec 區段切片驗證上述字樣
- WHEN 移除任一被釘語意, THEN 對應斷言轉紅；prospec-design 不含反向變體、backfill 不在新 skill Startup Loading 穩定前綴（negative）

#### REQ-TEMPLATES-108: prospec-backfill-spec 獨立 Lifecycle skill（hasReferences:true）
獨立 Lifecycle skill `prospec-backfill-spec`（type=Lifecycle、**hasReferences:true** — feature 邊界判準外置 `references/feature-boundary-criteria.hbs`、Phase 2 短 pointer 載入，連帶 `agent-sync` getSkillReferences 條目，否則 flag 翻了仍渲染零 reference），承接 brownfield WHAT-layer 回填能力；triggers 含 backfill/補規格/回填規格/反向萃取/從程式碼產規格；列入 entry config，prospec-design 為純 Generate/Extract。
- WHEN 使用者以 backfill/brownfield 類語句觸發, THEN 喚起 `/prospec-backfill-spec`（無須 input=code 參數）
- WHEN sync 部署, THEN 渲染並部署 `feature-boundary-criteria.md`（`skill.ts` hasReferences:true + `agent-sync` getSkillReferences 條目缺一則 reference 永不部署）

#### REQ-TEMPLATES-109: Pass-2 tracing 操作化 + 三條 Phase 1 Gate + 跨切片去重
skill 載明可執行的 gated tracing 程序（非僅換名詞）：枚舉 entry points 具名 heuristics（CLI 指令註冊、exported service method、route/handler decorator、async/排程進入點）；逐跳追呼叫鏈 `entry → controller/use-case → domain → emitted events → handler → outbound 整合邊`，每條 traced edge cite `file:line`（無法 cite 者不得入 AC）；Phase 1 Gate 擴為三條 checkbox（枚舉／每條行為恰好歸一 feature slice 或明確 Deferred／count-fidelity）；跨切片去重——共用基礎設施的行為歸入領域意圖最直接擁有它的 slice，另一 slice 以引用提及、不重複計為 AC。
- WHEN 追切片呼叫鏈, THEN 每條 traced edge cite `file:line`；無法 cite 者不得寫入 AC
- WHEN 一行為被兩 slice 觸及, THEN 歸入領域意圖最直接擁有它的 slice、另一 slice 引用不重複計

#### REQ-TEMPLATES-110: 跨模組事件流/outbound 為一等 AC 來源（conditioned on grounding）
跨模組事件流（emitted event → handler 回呼）與 outbound 整合邊列為一等 AC 來源（端到端 entry → domain → events → 下游）——module-first 最大盲區；升 AC 前提：emitter 與 handler/sink 兩端皆 trace 到具體 callsite。count-fidelity 延伸涵蓋 integration edge。
- WHEN 兩端皆 trace 到 callsite, THEN 升為一等 AC
- WHEN 僅解析到一端, THEN 記 `[NEEDS CLARIFICATION]` 候選邊或 Deferred；絕不斷言 handler 未解析的跨模組流存在

#### REQ-TEMPLATES-111: feature 邊界判準 reference（外置 + 軟訊號和解）
新增 `references/feature-boundary-criteria.hbs`（統攝原則：feature 邊界＝一個 actor 對某領域物件生命週期的連貫意圖；CRUD 動詞/code layer/檔案長度皆非邊界），Phase 2 短 pointer 載入：三拆分訊號（獨立生命週期／無共用 US／actor+trigger 皆不相交）+ read/query 歸屬（預設併入領域 feature 的 view US；跨領域 search/report 或對外 consumer 才自成 feature）+ 與 `feature-spec-format`（300 行/40%）和解為軟訊號（觸發重新檢視，三訊號為綁定裁定）。
- WHEN 決定 feature 邊界或 read/query 歸屬, THEN 載入 `feature-boundary-criteria.md` 短 pointer、套用三訊號 + read/query 規則
- WHEN 行數超 300/US 佔比 < 40%, THEN 觸發重新檢視（軟訊號），最終以三拆分訊號裁定、不自動拆

#### REQ-TEMPLATES-112: 基礎設施 module 非 feature 目標（NEVER）
基礎設施 module（序列化、persistence、event-bus、組裝根之類）不作為 feature 目標；其行為以 REQ 形式掛在「消費它的 feature」之下，絕不自成 feature slice。橫切治理議題改走 `/prospec-learn` 晉升路徑，不在本層發明新規格。
- WHEN 遇基礎設施 module, THEN 不立為 feature slice、行為掛在消費它的 feature 之下
- WHEN 遇橫切治理議題, THEN 走 `/prospec-learn`，不發明新規格層

#### REQ-TESTS-030: feature-first contract pin + hasReferences 連帶（mutation-verified）
`tests/contract/skill-format.test.ts` + `tests/integration/skill-generation.test.ts` 同 commit 同步：ADD feature-first section-scoped pin（`vertical slice`／`contributing modules`／Phase 4 `uncovered feature`／integration-edge grounding），既有存活 pin 保留子字串；has-references 清單加入 `prospec-backfill-spec`、self-contained 清單移除之；`referenceFiles` 斷言 23→24；mutation-verified。
- WHEN contract runs, THEN feature-first 語意自 prospec-backfill-spec 區段切片驗證、`referenceFiles`=24
- WHEN 移除任一被釘語意, THEN 對應斷言轉紅

---

## US-23: brownfield backfill 規格端到端 graduate（scale: backfill）[P2]

身為一個在 brownfield 專案補規格的開發者，
我想要把已審閱的 backfill 草稿以**輕量** scale 端到端 graduate（promote → verify → archive），verify 改評 spec-fidelity、既有程式碼品質落差視為既有技術債而非本次缺陷，
以便忠實反映既有程式碼的 backfill 規格不被「為新程式碼設計的品質 gate」擋死，而能誠實畢業進信任區。

**Acceptance Scenarios:**
- WHEN `/prospec-promote-backfill` 對齊好的 `backfill-draft.md` THEN 產出**輕量** scaffold（proposal + delta-spec + metadata：`scale: backfill`/`status: implemented`/`related_modules`），**無 plan/tasks**
- WHEN verify 處理 `scale: backfill` 變更 THEN 2/5 spec-fidelity 為主 graded（每條 REQ AC 的 `file:line` 須成立）、既有程式碼品質 `[MUST]` 違規降 informational、1/5 task-completion `not-applicable`
- WHEN 既有測試實際 fail（非缺測試）THEN 仍判真實 FAIL；品質降級僅在 `backfill-draft.md` provenance 存在時套用（marker 自證不可信）
- WHEN archive 處理 `scale: backfill` THEN 接受 graduate、受影響模組由 `related_modules`/`**Feature:**`→feature-map 推導、跳過 REQ-prefix auto knowledge-update、Phase 3.5 沿用 delta-spec graduate

### Behavior Specifications

#### REQ-TEMPLATES-115: verify scale: backfill spec-fidelity 評分契約
`prospec-verify` 辨識 `metadata.scale: backfill`，Verification 2/5（delta-spec compliance）升為主要 graded 維度，驗證每條 REQ 的 AC 是否忠實對應既有程式碼。Entry Gate 例外只要 proposal + delta-spec（無 plan/tasks）；grade S/A 代表「spec 忠實反映程式碼」，沿用既有 `verified` gate。
- WHEN `scale: backfill`, THEN 2/5 為 graded 主軸；AC 的 `file:line` 成立→PASS、不成立→FAIL、缺證據→WARN/FAIL（不得空 PASS）
- WHEN Entry Gate 檢查 artifacts, THEN backfill 只要 proposal + delta-spec、1/5 task-completion `not-applicable`

#### REQ-TEMPLATES-116: 既有違規降 informational + 測試分流 + provenance 綁定
3/5 把既有程式碼品質類 `[MUST]` 違規（缺測試/覆蓋/層級，非本次引入）記為 informational 技術債、不壓 grade；5/5 缺測試→informational、既有測試 fail→真實 FAIL。降級僅在 verify Entry Gate 確認 `backfill-draft.md` 存在（provenance）時套用，否則以 standard 契約評分——防 `scale: backfill` 成為新程式碼品質 gate 的 bypass。
- WHEN `scale: backfill` 且 provenance 成立, THEN 既有品質 `[MUST]` 違規→informational、缺測試→informational
- WHEN `backfill-draft.md` 缺席, THEN 以 standard 契約評 3/5、5/5 + WARN（marker 可手改、自證不可信）

#### REQ-TEMPLATES-117: archive 接受 backfill + 模組推導切換 + Phase 3.5 graduate
`prospec-archive` 接受 `scale: backfill` graduate；受影響模組在此 scale 由 `metadata.related_modules` +（`**Feature:**`→`feature-map.yaml` modules）推導，非 REQ-id 前綴（feature-slug REQ-id 不對應模組）；Phase 2 tasks-completion skip（無 tasks.md）；Phase 3.5 沿用 delta-spec graduate（REQ + Story，由 `**Feature**` 路由）。
- WHEN archive `scale: backfill`, THEN Entry Gate/Phase 4 用 `related_modules`/Feature→feature-map 推導模組；feature 未進 feature-map→fallback `related_modules`
- WHEN graduate, THEN Phase 3.5 沿用 delta-spec 路徑；Phase 2 對 backfill skip tasks 完成率

#### REQ-TEMPLATES-118: /prospec-promote-backfill skill（輕量 scaffold）
新 Lifecycle skill `prospec-promote-backfill.hbs`，把已審閱 `backfill-draft.md` 定型化為 proposal + delta-spec + metadata（`scale: backfill`/`status: implemented`/`related_modules` 取自 draft traced `file:line`）。`backfill` 是像 `quick` 的輕量 scale——**不產 plan.md/tasks.md**（產之是只為過 gate 的 hollow make-work）。Entry Gate 拒絕未解 `[NEEDS CLARIFICATION]`；never 寫信任區。
- WHEN 觸發 promote, THEN 產 proposal + delta-spec + metadata、無 plan/tasks、直接入 `status: implemented`
- WHEN draft 有未解 `[NEEDS CLARIFICATION]`, THEN 拒絕展開、送回 review gate

#### REQ-TEMPLATES-119: lifecycle/scale 文件記錄 backfill 入口
`_status-lifecycle.md`（ai-knowledge + init template 雙寫）記錄 `scale: backfill`：promote skill 是 lifecycle **入口**，直接設 `status: implemented`（brownfield code 已存在），再走 `verified → archived`；`prospec-new-story` scale 表標註 backfill 為 promotion-time scale（非 new-story 提議）；delta-spec template/format 註記 feature-slug REQ-id 用法。
- WHEN 讀 lifecycle 文件, THEN 兩份副本皆描述 backfill 入口（contract test 鎖模板副本同步）
- WHEN new-story 評估 scale, THEN backfill 不列為 new-story 選項

#### REQ-SERVICES-031: archive.service 對 backfill 跳過 REQ-prefix auto knowledge-update
`archive.service.ts` 的 auto knowledge-update safety net 對 `scale: backfill` 跳過（`ArchivedChange.scale` 把關）。backfill delta-spec 用 feature-slug REQ-id，REQ-prefix 推導會誤判為模組名、寫出幽靈 `modules/<slug>/README.md` 與 module-map 條目；backfill 模組同步由 skill 層 Entry Gate（`related_modules`/Feature→feature-map）負責。
- WHEN archive `scale: backfill`, THEN 不呼叫 `executeKnowledgeUpdate`、不產生幽靈模組
- WHEN regression test 執行, THEN 斷言 backfill 變更未觸發 auto knowledge-update

#### REQ-TESTS-034: backfill 模式 contract 斷言（mutation-verified）
`tests/contract/skill-format.test.ts` section-scoped 斷言：verify fidelity 主軸/既有違規降 informational/測試分流/Entry Gate 例外 + provenance/1-5 N/A、archive 接受 + 模組推導 + Phase 2 skip + Phase 3.5 arm + auto-update skip、review Entry Gate 例外、promote 輕量 scaffold（無 plan/tasks）、`SKILL_DEFINITIONS` count 16；`archive.service.test.ts` backfill skip regression。全部 mutation-verified（PB-001）。
- WHEN contract runs, THEN 上述每行為各有 section-scoped 斷言
- WHEN 移除/改壞任一被釘語意或行為, THEN 對應斷言轉紅

---

## Deprecated Requirements

#### ~~REQ-TEMPLATES-031: Capability Spec Format Reference~~
**Removed**: 2026-03-02 | **Change**: redesign-spec-architecture
**Reason**: 由 REQ-SPEC-010（Feature Spec Format）取代。Feature Spec 涵蓋 Capability Spec 所有資訊並強化人類可讀性。

---

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|--------------|
| 2026-06-19 | archive-sync | MODIFIED REQ-SERVICES-010; MODIFIED REQ-TEMPLATES-010; ADDED REQ-TESTS-033 | REQ-SERVICES-010, REQ-TEMPLATES-010, REQ-TESTS-033 |
| 2026-02-04 | mvp-initial | 建立變更管理核心流程 | US-1, US-2, US-4; REQ-CHNG-001~016 |
| 2026-02-09 | add-archive-system | 新增歸檔生命週期階段 | US-6; REQ-TYPES-010, REQ-SERVICES-010, REQ-TEMPLATES-010 |
| 2026-02-15 | redesign-spec-system | INVEST proposal、capability spec、Spec Sync、一致性驗證 | US-5, US-7; REQ-TEMPLATES-030~034, REQ-SPECS-001 |
| 2026-02-16 | enhance-knowledge-sdd-pipeline | Quality Gate、Brownfield/Greenfield、Technical Summary | US-3, US-8; REQ-TEMPLATES-040~045 |
| 2026-02-16 | add-design-phase | Design Phase 雙模式、4 平台 adapter、UI Scope | US-9; REQ-TEMPLATES-050~058 |
| 2026-03-01 | remove-skill-language-directives | Reference format 語言中立性 | US-7; REQ-REF-001 |
| 2026-03-02 | v2-product-first migration | 重組為 product-first feature spec | All |
| 2026-03-02 | redesign-spec-architecture | Product-First 架構：Feature Spec Sync、Product Spec 自動生成、Spec Health、Feature/Story 路由、deprecated Capability Spec Format | US-3,5,6,7; REQ-SPEC-010~013, REQ-TEMPLATES-010/033/034, REQ-SPECS-001; -REQ-TEMPLATES-031 |
| 2026-06-04 | skill-alignment (PR #2) | Canonical status lifecycle 全鏈強制 + Plan Call Chain/分層檢查 | REQ-CHNG-004 (MODIFIED), REQ-TEMPLATES-059 (ADDED) |
| 2026-06-06 | decouple-verify-from-feature-spec | verify 4/5 改為 Knowledge↔code 一致性、解除 verify↔archive 死結；lifecycle 載明 artifact ownership | REQ-TEMPLATES-034 (MODIFIED), REQ-CHNG-004 (MODIFIED) |
| 2026-06-14 | centralize-index-column-schema | related-module 解析改用 canonical 欄位常數（position-stable、Description 取自正確欄、跳過非模組列） | REQ-CHNG-003 (MODIFIED) |
| 2026-06-07 | add-output-contract | 11 skill 新增 Output Contract（成功/失敗自評）+ contract test | US-11; REQ-TEMPLATES-060/061, REQ-TESTS-001 |
| 2026-06-07 | make-constitution-executable | verify 依 Constitution 嚴重度分級回報 | US-5; REQ-TEMPLATES-063 |
| 2026-06-08 | add-entry-exit-gates | Entry/Exit 雙閘門 + quality_log 跨階段品質追溯 | US-12; REQ-TYPES-022, REQ-TEMPLATES-064/065, REQ-TESTS-022 |
| 2026-06-08 | add-review-fix-loop | implement↔verify 間對抗式 review→fix 迴圈 + commit 邊界移至 verify(S/A) 後 | US-13; REQ-TYPES-023, REQ-TEMPLATES-066/067/068, REQ-TESTS-023 |
| 2026-06-11 | gate-knowledge-at-archive | verify V4 降級本變更落差為 informational；archive Entry Gate 成為唯一強制 knowledge 同步檢查點（BL-038 方向 B） | US-14; REQ-TEMPLATES-083 (ADDED), REQ-TEMPLATES-034/045/010 (MODIFIED) |
| 2026-06-12 | add-scale-adapter | 相稱流程：scale（quick/standard/full）流程縮放 + task kind schema 凍結 + quick 雙 backstop（BL-004 + OPT-B3/B5/B6） | US-15; REQ-TYPES-026, REQ-TEMPLATES-084~090 (ADDED), REQ-CHNG-004/014, REQ-TEMPLATES-010, REQ-SERVICES-010 (MODIFIED) |
| 2026-06-12 | add-drift-checker | verify V1/V4 改消費 `prospec check --json` 確定性報告（明示退回、skipped≠PASS）；引擎本體 graduate 至 drift-detection feature | US-16; REQ-TEMPLATES-092 (ADDED), REQ-TEMPLATES-045/088 (MODIFIED) |
| 2026-06-13 | enhance-skill-instructions | skill 指令品質 pass：Constitution 空白提示、Phase-1 + per-phase gate（ff 重編號）、status-aware handoff + 新 session 偵測、implement progress 錨定（OPT B1/D1/A1/D5；D9 延 icebox） | US-17~20; REQ-TEMPLATES-096~100 (ADDED), REQ-TEMPLATES-061/085 (MODIFIED), REQ-TESTS-026 (ADDED) |
| 2026-06-15 | add-dependency-knowledge | plan/implement 加 optional on-demand Context7 依賴層知識（觸及第三方 lib 才查、注入 Technical Summary、graceful/untrusted/non-gating、永不進 stable prefix）（BL-034） | US-21; REQ-TEMPLATES-101/102/103 (ADDED), REQ-TESTS-027 (ADDED), REQ-TEMPLATES-044 (MODIFIED) |
| 2026-06-15 | complete-capability-to-feature-migration | capability→feature 術語遷移收尾：移除孤兒 capability-spec-format.hbs（完成 REQ-TEMPLATES-031 實作層移除）、修正 new-story 失效載入路徑 specs/capabilities/→specs/features/、archive/implement 殘留用語對齊 Feature Spec | REQ-CHNG-006/009 (MODIFIED); REQ-TEMPLATES-031 (REMOVED 實作層收尾) |
| 2026-06-16 | add-reverse-spec-extraction | brownfield WHAT-layer 反向規格萃取：prospec-design Extract Mode input=code 變體（triangulation→route-compatible 草稿、>50% story-level 護欄、信任區 never-write、未覆蓋偵測、completeness/count-fidelity）；MODIFIED REQ-DSGN-003 交叉引用（BL-032） | US-22; REQ-TEMPLATES-104~107, REQ-TESTS-028 (ADDED); REQ-DSGN-003 (MODIFIED, design-phase) |
| 2026-06-17 | extract-backfill-spec-skill | input=code 反向變體抽離為獨立 Lifecycle skill `prospec-backfill-spec`（命名 reverse→backfill、reverse-draft.md→backfill-draft.md）；prospec-design 回歸純 Generate/Extract；contract REQ-TESTS-028 retarget + negative | US-22; REQ-TEMPLATES-108 (ADDED); REQ-TEMPLATES-104~107, REQ-TESTS-028 (MODIFIED); REQ-DSGN-003 (MODIFIED, design-phase) |
| 2026-06-19 | feature-first-backfill | backfill 取材/覆蓋掃描單位 module→feature 縱切片（兩段式 gather→cluster、Pass-2 tracing cite `file:line`、跨模組 integration-edge 一等 AC gated on 兩端 grounding、Phase 4 未覆蓋 feature、基礎設施非 feature NEVER、feature-boundary-criteria reference 外置 hasReferences:true）（BL-039） | US-22; REQ-TEMPLATES-109~112, REQ-TESTS-030 (ADDED); REQ-TEMPLATES-104/105/107/108 + US-22 AC (MODIFIED) |
| 2026-06-19 | backfill-promotion-path | `scale: backfill`（第 4 個 CHANGE_SCALES 值，輕量 scale）+ `/prospec-promote-backfill` skill 讓 brownfield backfill 規格端到端 graduate：promote 產輕量 scaffold（proposal+delta-spec+metadata，無 plan/tasks）；verify 評 spec-fidelity、既有品質 MUST 降 informational（provenance-gated）、1/5 N/A；archive 接受、related_modules/Feature→feature-map 推導、跳過 REQ-prefix auto knowledge-update | US-23; REQ-TEMPLATES-115~119, REQ-SERVICES-031, REQ-TESTS-034 (ADDED) |
| 2026-06-20 | harden-feature-prefixed-req-sync | archive standard/full 對 feature-prefixed REQ 改由 related_modules/feature-map 推導（Entry Gate + service auto-update 一致），修 knowledge-sync 落空 + phantom module 風險（BL-043） | US-14; REQ-TEMPLATES-120, REQ-SERVICES-033, REQ-TESTS-035 (ADDED) |
| 2026-07-03 | add-plan-flow-diagram | /prospec-plan 對複雜 user story 產生 Mermaid 行為流程圖（any-of 結構訊號、沿用 _diagram-conventions.md、不計入 120 行上限、on-demand 讀取不進 Startup Loading）；契約測試含跨檔一致性守衛（issue #47） | US-2; REQ-TEMPLATES-125 (ADDED) |
| 2026-07-04 | carry-review-verify-evidence | archive 摘要攜帶 review/verify 證據：archive-format §6 `## Review & Verify` 節（grade／criticals-majors／quality_log digest、no-fabrication、backfilled 附 Source）、prospec-archive Phase 2 寫入＋Gate＋NEVER、契約 section-scoped 釘住（issue #56）| US-6; REQ-TEMPLATES-126/127, REQ-TESTS-041 (ADDED) |
