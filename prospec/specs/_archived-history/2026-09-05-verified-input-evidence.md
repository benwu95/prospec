# verified-input-evidence — 封存摘要

- **Archived**: 2026-09-05
- **Original Created**: 2026-09-05
- **Quality Grade**: S
- **Issue**: benwu95/prospec#265
- **Feature Commit**: c9546bd

## User Story

讓 CLI 開發者依實際 repository inputs 判斷審查與測試是否有效，讓維護者以當下 workflow 裁決安全封存，並讓下游透過一次有效驗證遷移舊 evidence。內容等價的 commit 保留證據；真實 input 變更與未認證 attempt 不能借用舊 PASS。

## Affected Modules

| Module | Impact | Description |
|---|---|---|
| types | High | 版本化 snapshot／attempt／assessment 契約。 |
| lib | High | 最終內容 snapshot、即時裁決與觀察一致性、metadata alias 相容。 |
| services | High | check、verify、archive、status 共用即時裁決與寫入前檢查。 |
| cli | Medium | 實際失敗原因、legacy 遷移與內容等價 remedy。 |
| templates | Medium | 最後同步先於 evidence，canonical／generated instructions 一致。 |
| tests | High | 真 Git、跨站、失敗持續性與 mutation regression pins。 |

## Requirements

| REQ ID | Status | Feature／說明 |
|---|---|---|
| REQ-TYPES-095 | ADDED | drift-detection：以 additive fields 保留舊 report 可讀，命名跨層 assessment／receipt，不改 frozen check registry。 |
| REQ-LIB-075 | ADDED | drift-detection：將既有 check collector assembly 抽至唯一 lib owner，gate 用即時裁決與同次觀察 receipt。 |
| REQ-CLI-052 | ADDED | drift-detection：既有 CLI output 清楚區分內容、workflow、legacy 與 capture 原因；雙語文件與生成內容採同一契約。 |
| REQ-TESTS-112 | ADDED | drift-detection：以真 Git／正常 services 或 CLI 證明新 scope、attempt、live gate、migration 與交付閉環。 |
| REQ-LIB-024 | MODIFIED | drift-detection：最終檔案內容決定 identity；特殊路徑完整 capture，Git trace 與效力分離。 |
| REQ-LIB-070 | MODIFIED | drift-detection：共享 snapshot 與 Git facts；保留 ≤6 subprocess 與 timestamp batching 契約。 |
| REQ-LIB-062 | MODIFIED | ai-knowledge：沿用 snapshot scope owner，正確保留特殊路徑並納入必要 inputs。 |
| REQ-LIB-033 | MODIFIED | drift-detection：最新 attempt 控制 PASS；保留真實 failure、不可執行 skip 與跨平台 runner 語意。 |
| REQ-SERVICES-068 | MODIFIED | drift-detection：running 預寫、before/after 比對、attempt-id finalize，fresh metadata merge 保留。 |
| REQ-TESTS-042 | MODIFIED | drift-detection：凍結新內容等價／真實 mutation 分流，保留既有 gate 回歸。 |
| REQ-TESTS-056 | MODIFIED | drift-detection：依新 capture 操作重建 fail-closed pin，保留 runner/Windows/report self-trip 契約。 |
| REQ-TESTS-057 | MODIFIED | sdd-workflow：以合法 output／必要 input 對照固定收斂邊界，其餘 frozen registry/skip 契約保留。 |
| REQ-TYPES-053 | MODIFIED | sdd-workflow：additive version/scope/trace，保留既有合法輸入與 grading context。 |
| REQ-TYPES-066 | MODIFIED | sdd-workflow：保留舊 shape，新增 latest attempt 與新版 passing evidence 的連結。 |
| REQ-SERVICES-062 | MODIFIED | drift-detection：writer 記新 snapshot 與 trace，單次寫入前確認一致性並保留 delta-spec owner。 |
| REQ-CLI-029 | MODIFIED | sdd-workflow：改即時 assessment 與寫入前 receipt；原 judgment API、grade/cap/status/evidence writer 保留。 |
| REQ-SERVICES-100 | MODIFIED | sdd-workflow：從即時 assessment 讀取 gate 並保留前置 refusal 與 backfill 適用性。 |
| REQ-TEMPLATES-131 | MODIFIED | sdd-workflow：引用 current assessment refusal，保留 CLI probe 與既有 station 分工。 |
| REQ-LIB-071 | MODIFIED | sdd-workflow：只以即時裁決進 gate，必要 facts 不可證明拒絕，completeness exception 保留。 |
| REQ-SERVICES-102 | MODIFIED | sdd-workflow：archive 自行 live collect；latest grade 與 workflow inputs 在 gate 前重判，refusal 無寫入。 |
| REQ-SERVICES-070 | MODIFIED | sdd-workflow：共用 assessment 比 deterministic payload；保留 read-only/no-in-flight-signal 與 routing。 |
| REQ-SERVICES-095 | MODIFIED | sdd-workflow：以版本化 identity 與即時 payload 比對區分 unreadable/stale/unprovable。 |
| REQ-TEMPLATES-171 | MODIFIED | drift-detection：內容等價沿用、legacy 重新驗證、workflow stale live 重判，保留三 provenance 與 latest grade。 |
| REQ-TEMPLATES-172 | MODIFIED | drift-detection：同步新 marker 與 sync 順序，保留 audit-scope registry equality 與 copy guard 範圍。 |
| REQ-CHNG-004 | MODIFIED | sdd-workflow：最後 sync 先於最後 evidence，status progression 與 specs archive-only 不變。 |
| REQ-TEMPLATES-129 | MODIFIED | sdd-workflow：前移 sync prevention point；preserve module union、generic count、backfill 與 post-commit gate。 |
| REQ-TEMPLATES-083 | MODIFIED | sdd-workflow：改指最後 evidence 前的 prevention point，unsynced FAIL 與雙份 lifecycle equality 保留。 |
| REQ-TEMPLATES-045 | MODIFIED | sdd-workflow：remedy 指向最後驗證前 sync，採 live machine facts 並維持 grading honesty。 |
| REQ-TEMPLATES-207 | MODIFIED | ai-knowledge：同步既有 US-320 的 remedy，避免跨 Feature 契約矛盾。 |
| REQ-TEMPLATES-034 | MODIFIED | sdd-workflow：導向最後 evidence 前 sync，保留機械 verdict、grade、Spec Health 與 design 行為。 |
| REQ-TEMPLATES-154 | MODIFIED | sdd-workflow：last effective-input sync 後再 tests；report 為展示，gate 自取即時裁決。 |
| REQ-CLI-045 | MODIFIED（交付補記） | standalone-binary：分開驗證一般 routing 與完整 report assessment 的必要依賴。 |

## Completion

- **Code Tasks**: 27/27（100%）；manual 1/1、verification 2/2；全部 30/30。
- **Acceptance Criteria**: 8/8；原31 REQ（4 ADDED／27 MODIFIED）全部通過，另完成 REQ-CLI-045 交付收斂；UI Scope none。

## Review & Verify

- **Review（verify 前）**: 6 輪、8 lenses；5 個不同 critical 全修復，其中 membership 另修一個 sibling；最後 0 unresolved critical／2 major advisory。已修 snapshot membership、nested-project paths、timestamp trace、command capture timing、YAML alias ordering。
- **Verify**: 最終 S；machine task-completion／knowledge／tests PASS；fresh-subagent delta-spec-compliance／constitution PASS（8/8 rules）；design not-applicable。首次 C 的 unavailable／diagnostic 契約問題已修並複驗至 S，未覆寫失敗歷史。
- **Tests（verify 時）**: 194 files、4816 passed／5 platform skipped；coverage statements 96.54%、branches 90.77%、functions 98.04%、lines 97.65%。lint、typecheck、build、counts、134 generated artifacts 與 strict check 均 exit 0。
- **Quality Log**: plan FAIL（durable non-zero）與 tasks FAIL（generated parity 依賴）皆已修後 PASS；verify C 已修後兩次 S；review WARN 保留 F-265-5 大量刪除逐檔 Git status 成本、F-265-6 guidance tests 強度建議。
- **封存後檢查**: F-265-8 已由獨立 reviewer 確認 fixed；startup 改以四種真 Git 狀態分開驗證，普通路徑仍 ≤250／禁 Handlebars，完整 report assessment 為 ≤300；實測 230／274，兩個 mutation killed。startup 修復後全套 4827 passed／5 skipped（4832 total）。
- **CI 跨平台收斂**: 首輪 CI Linux 全套與 Windows smoke 通過，counts 因 macOS 額外略過非法 UTF-8 filename 測試而失敗。以真 Git index 在 macOS／Linux 驗證同一拒絕行為，保留 Linux worktree 案例；獨立複核 0 新 critical／major。本機最終 4828 passed／4 skipped；coverage 96.55%／90.79%／98.04%／97.65%，lint／typecheck／counts 通過。
- **Known Limits**: strict 保留 knowledge-size WARN；snapshot 僅涵蓋已觀察邊界，不保證 transient change-and-restore 或最後 recheck 後的外部改動；#266／#267 不在本次範圍。

## Knowledge & Graduation

- types／lib／services／cli／templates／tests 六模組同步已隨 feature commit 提交；post-commit knowledge:check 實際涵蓋 commit range 並全數通過。
- 31 REQ 依 delta 路由落入 drift-detection／sdd-workflow／ai-knowledge；16 REQ 的 28 個舊 bullets 已明列 Dropped，均為改寫或替代語意。
- 封存時另收斂五處 Story-level context／AC，同步 Product Feature Map、finalize counters 與永久歷史，並刷新 raw-scan；REQ-CLI-052 歸入 US-6，另釐清 YAML alias 排序與現行測試 WARN 契約。
- Knowledge 對照：types 3、lib 6、services 6、cli 2、templates 9、tests 4 項直接 REQ，另有 CHNG-004 共用 lifecycle；harvest 7 筆（2 筆再證／5 筆新列），另記錄1筆交付責任的使用者修正，未晉升規則。metadata／snapshot／attempt pins 保留 unit/integration；跨模板 guidance family 留待 prospec-learn 評估 contract 強化。
