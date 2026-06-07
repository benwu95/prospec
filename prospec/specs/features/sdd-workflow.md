---
feature: sdd-workflow
status: active
last_updated: 2026-06-08
story_count: 12
req_count: 53
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
透過關鍵字比對 `_index.md` 識別相關模組。
- WHEN change name contains module keywords, THEN Related Modules lists matches
- WHEN no match, THEN Related Modules is empty

#### REQ-CHNG-004: Change Metadata Lifecycle
透過 metadata.yaml 追蹤狀態，以 `ai-knowledge/_status-lifecycle.md` 為單一真實來源：`story` → `plan` → `tasks` → `implemented` → `verified` → `archived`。
- WHEN each workflow skill completes, THEN advance status per the canonical lifecycle: new-story → `story`, plan → `plan`, tasks → `tasks`, implement → `implemented`
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
- WHEN matching capability specs exist, THEN load as Layer 0 context

#### REQ-CHNG-007: Identify Related AI Knowledge Modules
- WHEN proposal marks related modules, THEN read `modules/{module}/README.md`
- WHEN module README missing, THEN skip with warning

#### REQ-CHNG-008: Constitution Injection
- WHEN Constitution exists, THEN Planning Skills auto-execute quick check (>= 3 principles)
- WHEN absent, THEN skip

#### REQ-CHNG-009: Generate plan.md
- WHEN context loaded, THEN includes Overview, Affected Modules, Steps, Risk Assessment
- WHEN steps > 10, THEN suggest splitting Stories
- WHEN MODIFIED requirements, THEN reference Before from capability spec

#### REQ-CHNG-010: Generate delta-spec.md
- WHEN plan generated, THEN delta-spec.md created with ADDED/MODIFIED/REMOVED
- WHEN added, THEN includes Description, Acceptance Criteria, Priority
- WHEN modified, THEN includes Before, After, Reason

#### REQ-TEMPLATES-059: Plan Call Chain and Layering Check
- WHEN prospec-plan produces plan.md, THEN include a Call Chain section (and plan-format.hbs defines it)
- WHEN Plan Phase 6 runs, THEN check the call chain's layering against the Constitution's dependency rule
- WHEN verify dimension 3/5 runs, THEN re-check layering against the Constitution

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
任務以 `- [ ]` 起始，完成標記 `- [x]`。

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
- WHEN triggered, THEN verify dimension 4/5 gates on AI Knowledge (module READMEs) ↔ current code / this change's delta-spec
- WHEN a delta-spec ADDED/MODIFIED REQ's behavior has no description in the affected module README, THEN FAIL (remediate via /prospec-knowledge-update or /prospec-knowledge-generate)
- WHEN implementation changed but module README not updated, THEN WARN + suggest /prospec-knowledge-update
- WHEN a permanent Feature Spec lags an un-archived change, THEN informational only (graduates at /prospec-archive) — not drift, does not affect grade
- WHEN an already-archived capability regresses or Feature Spec Health (Density/Freshness/Consistency) degrades, THEN informational signal for the developer, not grade-blocking
- WHEN ui_scope != none + design-spec.md exists, THEN execute design consistency check

#### REQ-TEMPLATES-045: Verify Knowledge Staleness Detection
- WHEN delta-spec MODIFIED but module README not updated, THEN WARN + suggest `/prospec-knowledge-update`

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
- WHEN 執行 `/prospec-archive` THEN 掃描 verified 變更搬至 `.prospec/archive/{date}-{name}/`
- WHEN 歸檔完成 THEN 生成 summary.md + 自動觸發 knowledge-update
- WHEN Feature Spec Sync THEN 讀取 delta-spec ADDED/MODIFIED/REMOVED 融入 `specs/features/`（Replace-in-Place）
- WHEN Feature Spec Sync 完成 THEN 自動重新生成 `specs/product.md`

### Behavior Specifications

#### REQ-TYPES-010: ChangeStatus Archived Support
`archived` 為有效的 ChangeStatus 值。

#### REQ-SERVICES-010: Archive Service
- WHEN executes, THEN verified changes moved to `.prospec/archive/{date}-{name}/`
- WHEN summary generated, THEN includes User Story, REQ IDs, modules, statistics
- WHEN complete, THEN summary → `specs/history/` + auto-trigger knowledge-update (non-fatal)

#### REQ-TEMPLATES-010: Archive Skill Template
6 階段流程：Scan → Summary → Archive → Feature Spec Sync → Product Spec Regeneration → Knowledge Update。
- WHEN Feature Spec Sync, THEN merge User Stories + delta-spec REQs to specs/features/ via Replace-in-Place (non-fatal on failure)
- WHEN Product Spec Regeneration, THEN synthesize specs/product.md from all Feature Spec frontmatter (non-fatal on failure)
- WHEN Knowledge Update, THEN extract module names from REQ ID prefixes + interactively ask update
- WHEN archiving, THEN also move design-spec.md + interaction-spec.md if exist

#### REQ-SPEC-013: Product Spec Auto-Generation
歸檔 Feature Spec Sync 完成後，自動從所有 Feature Specs 合成 `specs/product.md`。
- WHEN Feature Spec Sync completes, THEN trigger product.md regeneration
- WHEN regenerating, THEN extract frontmatter from all Feature Specs in features/
- WHEN product.md generated, THEN Feature Map links match current Feature Spec files

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
- WHEN 執行 `/prospec-ff` THEN 依序執行 story → plan → tasks
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

## Edge Cases

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

## Deprecated Requirements

#### ~~REQ-TEMPLATES-031: Capability Spec Format Reference~~
**Removed**: 2026-03-02 | **Change**: redesign-spec-architecture
**Reason**: 由 REQ-SPEC-010（Feature Spec Format）取代。Feature Spec 涵蓋 Capability Spec 所有資訊並強化人類可讀性。

---

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|--------------|
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
| 2026-06-07 | add-output-contract | 11 skill 新增 Output Contract（成功/失敗自評）+ contract test | US-11; REQ-TEMPLATES-060/061, REQ-TESTS-001 |
| 2026-06-07 | make-constitution-executable | verify 依 Constitution 嚴重度分級回報 | US-5; REQ-TEMPLATES-063 |
| 2026-06-08 | add-entry-exit-gates | Entry/Exit 雙閘門 + quality_log 跨階段品質追溯 | US-12; REQ-TYPES-022, REQ-TEMPLATES-064/065, REQ-TESTS-022 |
