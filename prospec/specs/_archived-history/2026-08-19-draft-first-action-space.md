# Change Summary: draft-first-action-space

> 變更已完成並封存於 `.prospec/archive/2026-08-19-draft-first-action-space/`

- **變更名稱**: draft-first-action-space
- **Issue**: https://github.com/benwu95/prospec/issues/182
- **規模**: standard
- **完成日期**: 2026-08-19

## Overview

重構 Prospec 規劃階段為 Type III Action Space 頻譜（Draft / Question / Stay Silent / Notify），將 `prospec-new-story` 轉型為「起草先行（Draft-First）」協議。預設自動推論變更名稱與規模並生成包含 `## Stated Assumptions` 的完整提案，減少不必要的中斷；同時提供 `--interactive` 逃生艙口以支援傳統面談。將非阻塞建議告警（INVEST、知識庫檢查）靜默記錄至 `quality_log`，並簡化各技能的 Next-Step Handoff 提示，消除阻塞式 `(Y/n)` 確認。

## User Story & Acceptance Criteria

### US-1: Draft-First 行動頻譜與 Stated Assumptions
- **角色**: 開發者
- **功能**: 在觸發 `prospec-new-story` 時，預設直接推論變更名稱、規模並生成 `proposal.md`，在 `## Stated Assumptions` 中顯式列出所有自主決策；當歧義過大時單次僅提問一個問題；支援 `--interactive` 互動模式。
- **驗收情境**:
  - WHEN 開發者提供明確需求 THEN 自動推論名稱與規模並生成完整 `proposal.md` 與 `## Stated Assumptions`。
  - WHEN 需求存在嚴重邊界歧義 THEN 單次僅詢問一個核心問題。
  - WHEN 開發者帶有 `--interactive` 旗標 THEN 進入傳統逐步面談與確認流程。

### US-2: Silence-Aware 靜默告警日誌
- **角色**: 開發者
- **功能**: 在 Story 階段將非阻塞之 INVEST 建議與知識庫檢查靜默寫入 `metadata.yaml` 的 `quality_log`，不干擾對話。
- **驗收情境**:
  - WHEN INVEST 檢查或知識庫檢查產生非阻塞建議 THEN 靜默寫入 `quality_log` (WARN) 並順暢推進。

### US-3: Streamlined Next-Step Handoff
- **角色**: 開發者
- **功能**: 在各 SDD 技能結尾提供直接、可執行的下一步斜線指令或 CLI 命令，移除阻塞式 `Run <next-step> now? (Y/n)` 提示。
- **驗收情境**:
  - WHEN 技能完成任務 THEN 輸出摘要並直接給出清晰的下一步指令，無需等待 `(Y/n)` 回覆即可流暢繼續。

## Completed Tasks

- [x] T1 更新 `src/templates/skills/references/proposal-format.hbs` 新增 `## Stated Assumptions` 格式與規範
- [x] T2 重構 `src/templates/skills/prospec-new-story.hbs` 實作 Draft-First 協議、Stated Assumptions、`--interactive` 逃生艙口與 Silence-Aware Advisory 告警策略
- [x] T3 重構 `src/templates/skills/_next-step-handoff.hbs` 移除阻塞式 `(Y/n)` 提問，提供非阻塞下一步指令
- [x] T4 執行 Bundle 與 Agent 同步更新 `bundled-templates.ts` 及 `.agents/skills/`、`.claude/skills/`
- [x] T5 [P] 在 `tests/contract/skill-format.test.ts` 新增與更新 Draft-First、Stated Assumptions、`--interactive` 與交接語法契約測試
- [x] T6 [V] 執行 `pnpm test` 與單元/契約測試驗證
- [x] T7 [V] 執行 `pnpm counts` 與全套 Pre-merge CI 檢查

- **任務完成率**: 100% (7/7 code tasks)

## Graduated Requirements

- `REQ-TEMPLATES-189`: Draft-First Protocol in prospec-new-story Skill
- `REQ-TEMPLATES-190`: Stated Assumptions Section in Proposal Format Reference
- `REQ-TEMPLATES-191`: Streamlined Next-Step Handoff Partial
- `REQ-TESTS-092`: Contract Tests for Draft-First Protocol and Streamlined Handoff

## Review & Verify

- **審查結論**: 0 Critical, 0 Major, Clean Review (APPROVE)
- **驗證評級**: Grade A (result: PASS)
  - 任務完成度 (Task Completion): PASS
  - 規格符合度 (Delta Spec Compliance): PASS
  - 憲法全量稽核 (Constitution Full Audit): PASS
  - 知識庫一致性 (Knowledge Consistency): PASS
  - 測試驗證 (Test Verification): PASS (3,899 tests passed)
  - 介面設計一致性 (Design Consistency): not-applicable
- **品質日誌 (Quality Log)**:
  - 2026-08-19 `prospec-new-story`: PASS
  - 2026-08-19 `prospec-review`: PASS (criticals=0, majors=0)
  - 2026-08-19 `prospec-verify`: PASS (Grade A)
