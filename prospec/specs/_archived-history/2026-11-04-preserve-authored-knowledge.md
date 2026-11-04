# preserve-authored-knowledge — Archive Summary

- **Archived**: 2026-11-04
- **Original Created**: 2026-11-04
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/445
- **Plan Decision**: option-a (graded_by: human)

## User Story

維護 authored Knowledge 的開發者需要 regeneration 保留明確清空、Module Map metadata 與 index 靜態內容，讓 derived 導航反映儲存的值，且在 migration 失敗時保留唯一原值。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | absent-only backfill、schema-bounded YAML reconciliation 與 opt-in HTML comment masking |
| services | High | 三個 map writer、migration refusal 保留 index、補建缺少的載入指引 |
| templates | Medium | source L3 conventions 與共用 Loading Strategy partial |
| tests | High | writer／完整流程 regressions、metadata 與 no-op 獨立 assertions |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-110 | ADDED | Module Map schema 邊界、metadata/style 與 no-op 保留 |
| REQ-LIB-026 | MODIFIED | 只 backfill undefined curated 欄位 |
| REQ-KNOW-036 | MODIFIED | map 為單一來源，migration 失敗保留 index |
| REQ-KNOW-008 | MODIFIED | explicit-empty authoritative 與 index 冪等 |
| REQ-KNOW-012 | MODIFIED | rationale 清空渲染為 — |
| REQ-KNOW-005 | MODIFIED | 保留 authored static，缺少實際章節才補建 |
| REQ-KNOW-013 | MODIFIED | 保留既有載入節，source detail 為 L3 |
| REQ-SERVICES-022 | MODIFIED | add/remove 與 migration 共用 writer |
| REQ-SERVICES-090 | MODIFIED | 保持 skip/digest 語意並套用 changed-write 邊界 |

## Completion

- **Tasks**: 18/18 code tasks（100%）；T17/T18 為最終驗證提醒，非未完成實作。
- **Acceptance Criteria**: 9/9 current REQs 逐項 executable/document audit PASS；整體 delta-spec-compliance 因 late-capture 為 not-adjudicated。
- **Tests**: Node 24.20.0／Vitest 4.0.18，344/344 files，9,488 passed＋4 skipped／9,492，0 failed。新增 HTML-comment regressions 7 service＋2 lib；disable-html-option mutation 4/7 RED。

## Review & Verify

- **Review**: 5 rounds，累積 6 critical／0 major；目前 0 unresolved。前兩輪 alias traversal/key findings 已修復，schema re-scope 後不再承諾任意 unknown YAML；recursive no-op、migration failure 與 HTML-comment heading 各有 regression 證據。最終 fresh full-lens round 5 PASS，獨立 7 files／284 tests PASS。
- **Verify**: Grade A；machine tasks／Knowledge／tests／review provenance PASS，Constitution 8/8 PASS，design not-applicable。Current REQs 9/9 PASS；acceptance revision 2 在 implemented 階段修訂，整體 delta-spec-compliance 保留 not-adjudicated 與 late-capture 限制。
- **Quality Log**: plan 的 malformed Markdown WARN 已揭露且不擴充 parser／repair 範圍；tasks 初次 FAIL 將 [V] 混入 mutation，修訂後 PASS。Review round 3 觸發 review:3 熔斷；開發者收斂 schema 範圍並授權一次新 review，CLI 留存 1 event／1 override，已消耗且無 pending escalation。Re-scope 的 stamp/refusal 措辭 WARN 已修訂並通過；round 4 的 HTML-comment finding 依確認的最小修正解決。完整歷史保留在 archive bundle。
- **Checks**: lint／typecheck／build／counts:check／agents:check PASS；strict check 0 FAIL／1 knowledge-size WARN；feature commit 8c49de91 後 committed-range Knowledge gate 4/4 source-touched modules confirmed。

## Knowledge Update

lib／services／templates／tests README 已同步；全 6 modules source digests match。Archive 已核對 9/9 merged REQs，REQ-LIB-110 置於 US-310；ai-knowledge counters 為 16 stories／75 REQs。Product Feature Map 保留 authored 內容並涵蓋 10 個 active features，feature-map.yaml 未被覆寫。raw-scan 已刷新（1,920 files）。

## Scope & Limitations

Module Map 是 Prospec-owned schema。Unknown／型別不符資料的 changed write 拒收並保留原檔，不 strip 或轉型；成功 skip/no-op 不新增 schema 寫入要求。Changed writes 允許 whitespace／wrapping 正規化，no-op 才保證 byte identity。HTML comment／fence 只影響 canonical H2 的偵測 view，不新增完整 Markdown parser 或 malformed 文件修復。

<!-- prospec:escalation-history -->
## Escalation History

Lifetime events: 1. Overrides: 1. Completeness: complete.

| Ordinal | Station | Trigger | Event | State |
|---|---|---|---|---|
| 1 | prospec-review | fix_induced_threshold_exceeded | review:3 | not pending |

| Event | Station | Reason | Usage |
|---|---|---|---|
| review:3 | prospec-review | 已明確收斂為 Prospec schema 已知欄位，移除通用 unknown YAML 保留機制，驗證簡化後實作；開發者明示授權一次 review。 | consumed by prospec-review:604c71eb8401c84a18b1e3a686f0258920ae1e8c4dac1ad388f80cd783631052 |
<!-- prospec:escalation-history-end -->

## Lessons Harvest

已以 CLI upsert 記錄 [V] task 純確認、修正本身需完整 review、comment/fence 文字邊界、no-op 前不得 whole-value serialization、migration publication 相依；沿既有 canonical keys 去重。Schema ownership 的開發者更正已另記錄。未自動晉升 playbook／Constitution；local scanner/service regressions 留在 unit／integration，不擴張為目錄列舉契約。
