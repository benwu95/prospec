# name-change-history-rows — Archive Summary

- **Archived**: 2026-07-31
- **Original Created**: 2026-07-31
- **Quality Grade**: S
- **Scale**: standard · **Commit**: 4c61eec（分支 `feat/extract-knowledge-sub-modules`）

## User Story

As a 讀 feature spec 想知道某條 REQ 何時、由哪個變更改動的人，
I want Change History 的 Change 欄記下該次 archive 的變更名，且 15 列既有的 `archive-sync` 一併回填，
So that 那一欄真的能追溯，而不是十五列一模一樣的佔位字串。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| services | Medium | `syncToFeatureSpecs` 增必填 `changeName` 並往下傳；`appendToChangeHistory` 與 `createNewFeatureSpec` 兩條寫入路徑皆以 `escapeTableCell` 寫入變更名（原本分別硬寫 `archive-sync` / `initial-sync`） |
| tests | Medium | 三個新測試涵蓋 in-table 插入、新建 spec、`execute()` 接線與雙路徑轉義；既有 33 個 call site 補傳變更名 |
| docs（信任區，非模組） | Medium | 7 份 feature spec 共 15 列回填為真實變更名 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SERVICES-075 | ADDED | Change History 列以變更名指認自己，非固定佔位字串 |
| REQ-TESTS-069 | ADDED | 正向 ＋ 負向 ＋ 雙路徑轉義的命名契約 |

## Completion

- **Tasks**: 6/6 code tasks（100%）；`[M]` 1、`[V]` 2 全數完成
- **Acceptance Criteria**: US-1 4/4、US-2 3/3；SC-001~004 全達成

## Review & Verify

- **Review**: 1 輪、4 筆 findings（1 critical / 3 major，全部已修）。critical：threading 只接上「spec 已存在」分支，同一個 `if` 的 else 分支 `createNewFeatureSpec` 仍硬寫 `initial-sync`——`changeName` 在 scope 內卻沒傳，改回該字面後 566 個測試全綠（零覆蓋），會讓 REQ-SERVICES-075 的「never a fixed placeholder」在信任區成為假敘述。major：唯一的正負向斷言長在 EOF fallback 分支上，而 7 份真實 spec 全走 in-table 插入分支（只改那條 push 的突變存活）；`execute()` 接線零覆蓋（傳空字串 609 個測試全綠）且 `change.name` 直接來自 `readdir`，含 `|` 的目錄名會位移表格欄位——改走 `markdown-table` 的正典 `escapeTableCell`，不手刻第二份。第四筆為自查：第一版轉義測試的 fixture 沒有既存 spec，因此只走 `createNewFeatureSpec`，另一條路徑的轉義從未被觸及（且我首次跑該突變時未驗證是否套上，得到假綠）。
- **Verify**: Grade **S**。Machine ledger 1/5·4/5·5/5 全 PASS。Judgment ledger 2/5 PASS（fresh context 以自己的方法重驗 15 列回填：15/15 唯一歸屬、零連帶編輯、列序未動，並自套五個突變全數 killed；另實測同日三個變更各以自己的名稱區分）、3/5 PASS（6/6 條 Constitution；覆蓋率 Lines 94.78%／Branches 89.8%）、維度 6 not-applicable。`prospec check` 14/14 0 warn；測試 2,933（2,929 passed / 4 平台性 skip）。
- **Quality Log**: review PASS；verify PASS、grade S、無 budget-counted WARN。

## Notes

- **回填的歸屬規則**：列的日期硬過濾 `_archived-history/{date}-*.md`，再要求該摘要的 Requirements 表涵蓋該列全部 REQ——15/15 唯一解。只按 REQ 重疊數排序會把 `project-setup.md:664` 誤配到五天前引入那些 REQ 的變更，日期才是判別依據。
- **自我落地證據**：本變更自己 archive 時寫出第一列自動產生且帶真實名稱的紀錄（`sdd-workflow.md`）。
- **既有的 41 列無法以同一規則重推**：那些是更早期人工填寫的列，本來就帶真實變更名，只是舊摘要的 Requirements 表格式不同（或該次 archive 早於 `_archived-history` 慣例）。它們不在本變更的改動範圍內。
- **Phase 3.5 收斂**：三項 `**Spec:**` 無法觸達之處（SC-002 的可指認性、US-6 缺一條場景、兩條 ADDED REQ 落在無關 story 尾端）已於 graduation 逐項處理。

## Knowledge Update

已於 verify S/A commit 提示同步並折進 4c61eec：`prospec/ai-knowledge/modules/services/README.md`（必填 `changeName`、兩條寫入路徑經 `escapeTableCell`）。
