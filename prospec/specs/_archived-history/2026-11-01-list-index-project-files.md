# list-index-project-files — Archive Summary

- **Archived**: 2026-11-01
- **Original Created**: 2026-11-01
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/425
- **Plan Decision**: option-b (graded_by: human)

## User Story

作為依賴 AI Knowledge 與 drift 檢查的開發者，我要 raw-scan、README 骨架與 import 掃描依 git index 選取檔案，讓已追蹤與 staged 原始碼被納入，本機快取與 untracked 檔案不再混入。

## Affected Modules

| Module | Impact | Description |
|---|---|---|
| types | Low | 更新 module paths 契約註解，schema 不變 |
| lib | High | 獨立 project-files 核心與 Git／inventory adapters，共用既有 pathspec／ancestor helpers |
| services | Medium | raw-scan 與骨架接入 index 列檔，保留失敗與安全輸出契約 |
| cli | Low | depth 改指 Directory Tree 顯示深度 |
| templates | Low | 同步 display 欄位、exclude 範例與診斷 reference |
| tests | High | 真實 Git 矩陣、lazy exclusion、不可用來源與文件契約；同步雙語公開文件 |

## Requirements

| REQ ID | Status | Description |
|---|---|---|
| REQ-KNOW-002 | MODIFIED | raw-scan 依 index 成員與 work-tree 檢查列檔 |
| REQ-KNOW-007 | MODIFIED | 三個消費端共用 module-path 排除規則 |
| REQ-KNOW-004 | MODIFIED | 骨架 Key Files 與 Public API 安全輸出 |
| REQ-KNOW-022 | MODIFIED | depth 只限制 Directory Tree |
| REQ-KNOW-038 | MODIFIED | 非原始碼目錄與 CR／LF 樹狀輸出 |
| REQ-LIB-038 | MODIFIED | detector 沿用同一份 index 檔案清單 |
| REQ-LIB-014 | MODIFIED | import 掃描改讀 inventory 的 index 成員，歸屬不變 |
| REQ-LIB-070 | MODIFIED | 排除 glob 每 run 惰性列出一次，非 log Git 上限 6 |
| REQ-LIB-037 | MODIFIED | artifact filesystem 走訪移除 DEFAULT_IGNORE |
| REQ-LIB-107 | MODIFIED | exclude 拒收診斷不依賴可讀 module map |
| REQ-SETUP-026 | MODIFIED | 雙語入口、設定、CLI 與升級遷移說明 |
| REQ-TESTS-050 | MODIFIED | 真實 Git file／folder／glob 選取測試 |
| REQ-LIB-029 | REMOVED | 移除 stat-based classifier 與 glob 專案列舉 |

## Completion

- **Tasks**: code 19/19（100%），verification 4/4；T024 是跨站 archive manual reminder，歷史 checkbox 保留於封存前狀態。
- **Acceptance Criteria**: frozen revision 1 的 18 個 scenarios 無語意偏離，13/13 REQ PASS；未 amend baseline。
- **Corpus**: dd7b591e 固定語料 1449/1449 edge tuples 相同；raw-scan 1752→1908，156 個新增均為 tracked dot paths；六模組集合、三項 markdown findings 與 conventions 順序皆相同。
- **Git reads**: 同語料 assessment 非 log 5 次（上限 6）、lazy exclusion 1 次；temporary recording 0 次。

## Review & Verify

- **Review**: 4 rounds，累積 1 critical／1 major，皆 fixed，未解決 0；LF／CR fixture 已加 Windows guard，六處 onboarding commit-first 舊說法已收斂。兩項 guard-removal 與兩項 stage-instruction-removal mutations 均轉紅。
- **Verify**: A；machine tasks／knowledge／tests PASS，fresh judgment delta-spec PASS、Constitution WARN、design not-applicable。完整 suite 339 files、9112 passed／9116 total、4 Windows-only skipped、0 failed；statements 96.58%、lines 97.94%。
- **Quality Log**: plan r1／r2 的 classifier 措辭、bare probe、固定語料與全稱 WARN 均修正，B plan／tasks verifier PASS；review 的平台 fixture 與平行文件 WARN 均閉合。一次 delegate 在啟動前因 README 200 行契約失敗而結束，修正後重新委派；未偽造 verdict。
- **Evidence limits**: re-entry 的兩份 review receipts 均通過 ticket policy；前一 merge 消耗兩份 receipts，後一 merge 明示 not covered，保留 CLI 的該紀錄。macOS 本機結果不代表 Node 22／Windows／遠端 CI 已執行。
- **Post-commit**: feature commit `ad54a2c6` 後 knowledge:check 實際驗證 6/6 source-touched modules PASS，補齊 verify 當時空 committed range 的證據缺口；grade A 與原 WARN 歷史保持不改寫。

- **Harvest**: CLI 累積 5 項規則（4 項既有、1 項新平台 fixture 規則）；未自動晉升。平台 registration pin 保持 service-local，公開文件契約沿用既有 contract test。

## Knowledge Sync

types、lib、services、cli、templates、tests 六模組已同步並蓋章，source digests 相符。封存同步 Feature Specs，並收斂 US-361 的舊 file／folder／glob story prose；raw-scan 由 CLI 重新產生。

## Deliberate Boundaries

`exclude` 改採 module-path 規則是 breaking change。import 的歸屬／specifier parsing 不變；digest、snapshot 成員與 inventory reader 收斂留給 #430。直接 index adapter 逐筆略過非 UTF-8 名稱並去重 unmerged paths，import inventory 原有整份拒收規則維持不變。
