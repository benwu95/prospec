# 變更總結：formalize-knowledge-update-station

將 `prospec-knowledge-update` 正式化為一等 SDD 工作站，並實作知識感知路由（Knowledge-Aware Routing）。

## User Story

身為 Prospec 使用者與 AI 代理人，
我希望 `prospec-knowledge-update` 成為正式的 SDD 工作站並具備知識感知路由能力，
以便在變更進入驗證後能自動判斷模組知識庫是否需要同步，避免在未同步時誤導代理人走向 `archive`，確保 Feature Commit 建立時即包含最新的模組知識。

## 驗收條件

1. `SDD_STATIONS` 包含 `knowledge-update` 於 `verify` 與 `archive` 之間，且 `STATION_SKILLS` 正確對應 `/prospec-knowledge-update`。
2. 當變更處於 `status: verified` 且影響模組之知識庫尚未同步（`!hasKnowledgeSync`）時，`routeChange` 正確路由至 `knowledge-update`，並指出未同步之模組阻擋閘門。
3. 當影響模組之知識庫已完成同步時，`routeChange` 正確路由至 `archive`。
4. `status.service.ts` 的 `collectFacts` 正確根據 `metadata.related_modules` 或 `delta-spec.md` 檢查 `module-map.yaml` 與 git commit 時間戳記計算 `hasKnowledgeSync`。

## 實作工作摘要

- **類型定義 (`types`)**：更新 `SDD_STATIONS`、`STATION_SKILLS` 與 `ChangeRouteFacts`（REQ-TYPES-070）。
- **核心評估器 (`lib`)**：更新 `routeChange` 支援知識感知路由，並匯出 `isStale` 函式（REQ-LIB-035）。
- **服務層 (`services`)**：在 `status.service.ts` 中實作 `checkKnowledgeSync` 輔助函式與事實搜集（REQ-SERVICES-070）。
- **生命週期文件與技能模板**：更新 `_status-lifecycle.md`、`_next-step-handoff.hbs` 與 `prospec-knowledge-update.hbs`。
- **測試與合約驗證**：擴充單元測試、合約測試與全矩陣路由測試，全部 3,911 個測試均通過。

## 任務完成率

- **代碼任務**：13 / 13 (100%)
- **手動任務**：1 / 1
- **驗證任務**：1 / 1
- **整體完成率**：100%

## Review & Verify

- **Code Review**: 0 Criticals, 0 Unresolved Majors (PASS)
- **Verification Grade**: Grade A
- **Quality Log**:
  - `prospec-review`: PASS (2026-08-19)
  - `prospec-verify`: Grade A (2026-08-19)
- **Dimension Adjudication**:
  - 1/5 Task Completion: PASS (machine)
  - 2/5 Delta Spec Compliance: PASS (judgment, fresh context)
  - 3/5 Constitution Full Audit: PASS (8/8 principles, mixed)
  - 4/5 Knowledge ↔ Implementation Consistency: WARN (pre-existing drift outside scope, machine)
  - 5/5 Test Verification: PASS (machine, 155 test files, 3911 tests passing)
  - 6 Design Consistency: not-applicable (UI scope is none)
