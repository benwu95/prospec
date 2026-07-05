---
feature: design-phase
status: active
last_updated: 2026-07-05
story_count: 4
req_count: 10
---

# 設計整合

## Who & Why

**服務對象**：前端開發者、全端開發者、UI/UX 設計師

**解決問題**：AI Agent 實作 UI 時缺乏精確的視覺與互動規格，只能猜測式開發。Design Phase 在 Story 與 Plan 之間加入設計規格產出階段，提供色彩、間距、元件結構、互動狀態等精確依據。

**為什麼重要**：Generate Mode 讓無設計工具的團隊從 proposal 產出結構化規格；Extract Mode 讓有設計工具的團隊反向萃取為 AI 可讀格式。兩種模式確保 AI 不再盲猜 UI。

## User Stories & Behavior Specifications

### US-001: 從 Proposal 產出設計規格 (Generate Mode) [P0]

身為前端開發者，
我希望 Design Phase 能從 proposal 自動產出視覺規格與互動規格，
以便 AI 實作 UI 時有精確的設計依據而非猜測。

**Acceptance Scenarios:**
- WHEN proposal 的 ui_scope 為 full/partial 且無既有設計 THEN 進入 Generate Mode
- WHEN design-spec.md 產出 THEN 包含 Visual Identity、Components、Responsive Strategy
- WHEN interaction-spec.md 產出 THEN 包含 States、Transitions、Flow sequences

#### REQ-DSGN-001: Design Spec 格式
`design-spec-format.hbs` 定義平台無關的視覺設計規格結構。

**Scenarios:**
- WHEN referencing design-spec-format, THEN includes Visual Identity (colors, fonts, spacing), Components (layout, states, tokens), Responsive Strategy (breakpoints)
- WHEN writing design spec, THEN no platform-specific references (use tokens, not hardcoded values)

#### REQ-DSGN-002: Interaction Spec 格式
`interaction-spec-format.hbs` 定義平台無關的互動規格，使用 Interaction DSL draft 語法。

**Scenarios:**
- WHEN referencing interaction-spec-format, THEN includes Screen/Component definitions (States, Transitions), Flow sequences (trigger -> action)
- WHEN DSL syntax used, THEN annotated as draft-1

#### REQ-DSGN-003: prospec-design Skill 雙模式
`prospec-design.hbs` 定義 Design Phase 工作流，支援 Generate 與 Extract 雙模式（Extract 自設計工具反向萃取視覺/互動規格）。input=code 行為層回填已抽離至獨立 skill `prospec-backfill-spec`（行為見 sdd-workflow US-22）。

**Scenarios:**
- WHEN design skill triggered, THEN read proposal.md (ui_scope) and .prospec.yaml (design.platform) to detect mode
- WHEN no design-spec.md and no existing designs, THEN enter Generate Mode (produce design-spec.md + interaction-spec.md)
- WHEN design-spec.md exists or design tool has designs, THEN enter Extract Mode (read via MCP, reverse-produce specs)
- WHEN Extract Mode encounters ambiguous intent, THEN mark [NEEDS CLARIFICATION]
- WHEN Phase 3 executes, THEN use platform adapter from .prospec.yaml
- WHEN Phase 4 verification, THEN verify via screenshot or structural comparison

#### REQ-DSGN-005: Proposal UI Scope 欄位
`proposal-format.hbs` 包含選填的 UI Scope 區段（full/partial/none）。

**Scenarios:**
- WHEN ui_scope is full, THEN complete new screen design needed
- WHEN ui_scope is partial, THEN modifying existing UI components
- WHEN ui_scope is none, THEN pure backend change, skip Design Phase
- WHEN proposal lacks UI Scope, THEN legacy proposals unaffected

### US-002: 從設計工具萃取規格 (Extract Mode) [P1]

身為已使用 Figma 或 pencil.dev 的開發者，
我希望 Design Phase 能從設計工具反向萃取結構化設計規格，
以便 AI 直接讀取精確設計參數進行實作。

**Acceptance Scenarios:**
- WHEN 設計工具已有設計 THEN 自動進入 Extract Mode
- WHEN 遇到模糊設計意圖 THEN 標記 [NEEDS CLARIFICATION]
- WHEN 萃取完成 THEN 產出格式與 Generate Mode 一致的 specs

_(Extract Mode 行為規格已涵蓋在 REQ-DSGN-003)_

### US-003: 平台適配器 [P1]

身為使用不同設計工具的開發者，
我希望 Design Phase 透過平台適配器支援多種設計工具，
以便我能用熟悉的工具與 Prospec 無縫整合。

**Acceptance Scenarios:**
- WHEN `design.platform: pencil` THEN 使用 pencil adapter (MCP)
- WHEN `design.platform: figma` THEN 使用 html-to-figma MCP
- WHEN 未設定 design.platform THEN 預設使用 html adapter

#### REQ-DSGN-004: Platform Adapter -- pencil.dev
**Scenarios:**
- WHEN Design Phase, THEN use batch_design() for components, set_variables() for tokens
- WHEN Implement Phase, THEN use batch_get() + get_screenshot() for precise details
- WHEN Verify Phase, THEN use get_screenshot() + search_all_unique_properties()

#### REQ-DSGN-006: Platform Adapter -- Figma
**Scenarios:**
- WHEN Design Phase, THEN produce HTML prototype, push via html-to-figma MCP
- WHEN Implement Phase, THEN read Figma node details (fills, strokes, auto-layout)
- WHEN Verify Phase, THEN compare Figma node properties with implementation

#### REQ-DSGN-007: Platform Adapter -- Penpot
**Scenarios:**
- WHEN Design Phase, THEN use Penpot API to create components
- WHEN Implement Phase, THEN export designs to readable format
- WHEN Verify Phase, THEN API structural comparison

#### REQ-DSGN-008: Platform Adapter -- HTML
**Scenarios:**
- WHEN Design Phase, THEN produce prototype/ directory (index.html, styles.css, pages)
- WHEN Implement Phase, THEN read CSS custom properties and HTML structure
- WHEN Verify Phase, THEN DOM structure and CSS property comparison

#### REQ-DSGN-009: Implement Skill 設計感知
`prospec-implement.hbs` 在 UI 任務加入設計感知。

**Scenarios:**
- WHEN implementing UI task, THEN load design-spec.md + interaction-spec.md + adapter
- WHEN Phase 3 executes, THEN first read design values via adapter MCP, then implement
- WHEN no design-spec.md, THEN warn (UI task lacks design spec)

---

## US-004: Design 在 SDD lifecycle 的定位 [P2]

身為一個 resume 中斷工作或跑 verify 的 agent，
我想要 design 的 lifecycle 定位明文化，
以便判斷 design 何時介入、何時不適用，而非憑猜測。

**Acceptance Scenarios:**
- WHEN 查閱 `_status-lifecycle.md`，THEN 有明文：design 無 status、僅 `ui_scope != none` 時介入、位於 plan 與 tasks 之間
- WHEN `ui_scope: none`，THEN design 不執行、verify V6 `not-applicable`，lifecycle 與從未 design 者相同

#### REQ-TEMPLATES-138: `_status-lifecycle.md` 明文 design 定位
`_status-lifecycle.md`（＋shipped `init/status-lifecycle.md.hbs`，雙拷貝一致）新增「Stations without a status transition」節，記 design（`ui_scope != none`、plan↔tasks 間、無 status）／review／learn，使 resume 邏輯依 workflow order 定位而非 status。

## Edge Cases

- `.prospec.yaml` 無 `design.platform`：預設 html adapter
- Extract Mode 遇到模糊設計意圖：標記 [NEEDS CLARIFICATION]
- UI 任務但無 design-spec.md：Implement Skill 發出警告
- ui_scope 為 none：跳過 Design Phase
- 舊版 proposal 無 UI Scope：向下相容
- 設計工具 MCP 連線失敗：提示確認 MCP 設定

## Success Criteria

- **SC-1**: Generate Mode 產出的 design-spec.md 包含完整的 Visual Identity、Components、Responsive Strategy
- **SC-2**: Extract Mode 能從 pencil.dev 和 Figma 萃取結構化規格
- **SC-3**: 4 個 adapter 各自涵蓋 Design/Implement/Verify 三階段操作指引
- **SC-4**: UI 任務實作時能透過 adapter MCP 讀取精確設計參數

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
| 2026-02-16 | add-design-phase | Design Phase Generate/Extract 雙模式與 4 個 platform adapter | US-001~003, REQ-DSGN-001~009 |
| 2026-03-02 | v2-product-first | 遷移為 Feature Spec，REQ ID 從 REQ-TEMPLATES-050~058 改為 REQ-DSGN-001~009 | All |
| 2026-06-16 | add-reverse-spec-extraction | REQ-DSGN-003 加 input=code 反向 spec 變體交叉引用（行為實質歸 sdd-workflow US-22，避免 UI feature 語意污染） | REQ-DSGN-003 (MODIFIED) |
| 2026-06-17 | extract-backfill-spec-skill | REQ-DSGN-003 移除 input=code 反向變體交叉引用——能力抽離至獨立 skill prospec-backfill-spec；prospec-design 回歸純 Generate/Extract | REQ-DSGN-003 (MODIFIED) |
| 2026-07-05 | quick-scale-and-ceremony-cleanup | ADDED US-004（design 在 lifecycle 的定位）+ REQ-TEMPLATES-138（`_status-lifecycle.md` + shipped template 明文 design 無 status、ui_scope-gated）（issue #67） | US-004, REQ-TEMPLATES-138 |
