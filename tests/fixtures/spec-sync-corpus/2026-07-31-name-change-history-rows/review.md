# Review Findings: name-change-history-rows

| ID | Location | Severity | Lens | Status | Summary |
|---|---|---|---|---|---|
| F-1 | src/services/archive.service.ts:1316 | critical | correctness | fixed | threading 只接上「spec 已存在」分支；同一個 if 的 else 分支 createNewFeatureSpec 仍把 Change 欄寫死成 initial-sync（changeName 在 scope 內卻沒傳），使 REQ-SERVICES-075 的「never a fixed placeholder」在信任區成為假敘述。已把 changeName 傳入該分支並補測試。Mutation：改回 initial-sync → 新測試轉紅（killed，原本 566 個測試全綠 survived）。 |
| F-2 | tests/unit/services/archive.service.test.ts:1220 | major | test-quality | fixed | 唯一的正負向斷言長在 appendToChangeHistory 的 EOF fallback 分支上，而 7 份真實 feature spec 全走 in-table 插入分支——只改那條 push 的突變存活。已補「既有 Change History 表格」fixture 的 section-scoped 測試（並斷言既有列逐字未動）。Mutation：in-table 分支改回固定字串 → 轉紅（killed）。 |
| F-3 | src/services/archive.service.ts:650 | major | correctness | fixed | execute() 的接線零覆蓋（傳空字串 609 個測試全綠），且 change.name 直接來自 readdir 未經檢核——含 `\|` 或換行的目錄名會位移表格欄位，是硬寫常數時不存在的新破壞面。已改走 markdown-table 的正典 escapeTableCell（不手刻第二份），並補 execute() 層接線測試與雙分支轉義測試。Mutation：傳空字串 → 轉紅；分別移除兩處 escapeTableCell → 各自轉紅（killed）。 |
| F-4 | tests/unit/services/archive.service.test.ts:1240 | major | test-quality | fixed | 自查發現：第一版轉義測試的 fixture 沒有既存 spec，因此只走 createNewFeatureSpec，appendToChangeHistory 的轉義從未被觸及——移除該處轉義的突變存活（且我第一次跑 M5 時未驗證突變是否套上，得到假綠）。已讓同一個 delta-spec 同時路由到既存 spec 與新 slug，兩條寫入路徑各有專屬 killer。 |
