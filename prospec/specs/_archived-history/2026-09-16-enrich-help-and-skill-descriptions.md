# enrich-help-and-skill-descriptions — Archive Summary

- **Archived**: 2026-09-16
- **Original Created**: 2026-09-16
- **Quality Grade**: S
- **Issue**: #284

## User Story

讓直呼 CLI／MCP 的 AI agent 能從用途、範例與返回值正確組合呼叫；透過 skill negative scope 與在地化排除短語減少誤路由，並讓使用者理解 metadata 的每 session 成本及表格轉義行為。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | help registry、skill exclusions 與 MCP 輸入範例 |
| lib | High | 共用表格 cell 定義及本輪轉義計數 |
| services | High | 雙設定表寫回、共用 description 渲染與 MCP 描述 |
| cli | Medium | 六命令 help、scaffold 與轉義提示 |
| templates | Medium | finisher 在地化步驟與生成資產同步 |
| tests | High | help、negative scope、雙出口與實際寫入 cell 契約 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-098 | ADDED | 六命令共用型別化 help registry 與轉義文案 |
| REQ-CLI-054 | ADDED | 六命令掛載用途、範例與返回值 |
| REQ-CLI-055 | ADDED | 實際轉義時才顯示提示 |
| REQ-LIB-078 | ADDED | 以本輪實際寫入 cell 計算轉義數 |
| REQ-TESTS-118 | ADDED | help 完備性與表格 round-trip 契約 |
| REQ-TYPES-097 | ADDED | 排除短語 baseline 與設定鍵 |
| REQ-SERVICES-110 | ADDED | 排除短語 scaffold、寫回與雙出口渲染 |
| REQ-TEMPLATES-231 | ADDED | finisher 在地化步驟涵蓋兩張表 |
| REQ-AGNT-043 | ADDED | 雙語 README 說明每 session 成本 |
| REQ-TESTS-117 | ADDED | negative scope、trigger 與空設定契約 |
| REQ-MCP-010 | ADDED | MCP description 範例與結果欄位 |
| REQ-AGNT-031 | MODIFIED | description 單一來源與在地化共用出口 |
| REQ-AGNT-033 | MODIFIED | 移除三個寬泛 trigger |
| REQ-AGNT-036 | MODIFIED | scaffold 同時輸出 trigger 與 exclusion 缺口 |
| REQ-CLI-027 | MODIFIED | 一次驗證與寫回兩張設定表 |
| REQ-SERVICES-066 | MODIFIED | 兩類缺口共用計算來源 |
| REQ-CLI-037 | MODIFIED | review digest 揭露實際轉義 |

## Completion

- **Tasks**: code 22/22（100%）；manual 1/1、verification 2/2，全數勾選。
- **Acceptance Criteria**: 17/17 REQ 通過 verify，涵蓋 5 則 User Story；11 ADDED、6 MODIFIED、0 REMOVED。
- 本案沒有 design-spec.md 或 interaction-spec.md；design 維度為 not-applicable。

## Review & Verify

- **Review**: 4 輪，共 24 筆（1 critical、9 major、14 minor），全部 fixed；最終 0 unresolved critical／major。第 4 輪為實作 session 依 repro 與 fail-then-pass pin 判定，非 fresh 覆審。
- **Findings**: 修正轉義計數誤算被捨棄輸入／unchanged 列、無 id finding 認領順序、MCP 返回欄位及綁專案範例，並補強段落範圍與字面契約。
- **Verify**: 最新 grade S；task-completion、knowledge、tests、delta-spec-compliance、constitution 皆 PASS，design 不適用。既有測試證據為 223 檔、5,182 passed／4 skipped；statements coverage 96.62%。
- **Quality Log**: plan WARN 涵蓋測試漣漪漏列、token 風險、重複文案、排除語意與決策回填；tasks WARN 涵蓋路徑、測試閉合、計數與大小；review 前兩輪 WARN 已修復，後兩輪 PASS；兩次 verify 皆 S，無 WARN／FAIL。
- **Archive Checks**: feature commit 後 knowledge:check 確認 6/6 source-touched 模組；prospec check --strict 為 0 FAIL，knowledge-size 有既有容量／headroom 警告；review/test/delta-spec provenance 均 PASS。

## Knowledge Update

- types：2 條模組 REQ；lib：1；services：2；cli：4；templates：1；tests：2。另有 4 條 AGNT 與 1 條 MCP 功能 REQ，依 feature-map 對應模組複核；六份 README 已於 feature commit 同步。
- **Spec Graduation**: 17 條 REQ 全數落盤，CLI 無 pending／dropped／refused／stale worklist；10 條新增需求歸入 US-43／US-445 獨立切片，MCP 需求歸入既有互動工具 Story。同步既有 localization Story 語意，並限定無本地化排除時才與 baseline description 逐字相等。Product Feature Map 已確認涵蓋全部 active Feature Specs，既有 feature-map.yaml 保留。
- Regression pins：cell 計數與具名／無 id 認領順序保留於 unit tests；help registry、skill description 與 MCP tools/list 的跨表面契約已在 contract suite，無新增永久契約晉升需求。
- **Harvest**: 透過 prospec learn upsert 收集 10 類 finding（7 新增、3 既有 key 增記本 change）；未晉升至 playbook 或 Constitution，manual tasks 無未完成項。
- **Finalization**: raw-scan 已刷新，story／REQ counters 由 archive finalize 校正；封存後 strict check 21/21，0 FAIL、knowledge-size WARN（本次收集使 ledger 容量增加）。
