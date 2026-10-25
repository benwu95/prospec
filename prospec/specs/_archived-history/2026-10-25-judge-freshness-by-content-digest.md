# judge-freshness-by-content-digest — Archive Summary

- **Archived**: 2026-10-25
- **Original Created**: 2026-10-24T16:51:18.241Z
- **Quality Grade**: A
- **Issue**: #412
- **Plan Decision**: plan (graded_by: human)

## User Story

- **US-1（P0）**：As a 依 `prospec check` 與 archive Entry Gate 判斷 Knowledge 能否信任的開發者，I want 模組在 source 內容與蓋章時記錄的 digest 不同時判為過期、相同時判為新鮮，So that 蓋章後追加或以一般 merge 帶入的修改不再被誤判為新鮮，內容相同的歷史改寫也不會誤判為過期。
- **US-2（P0）**：`prospec knowledge verify` 同時記錄 digest，同一份 commit 在任何 checkout（CI、Windows、不同 git 設定）下算出相同 digest。
- **US-3（P0）**：沒有 digest（BREAKING：一律過期）或無法計算 digest 時有明確、不被當成新鮮的結果。
- **US-4（P1）**：所有消費端共用同一判定，報告帶出 `freshness` 依據，git subprocess 數不隨模組數成長。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | Modified | Knowledge health check (source content digest vs `source_digest`) |
| types | Modified | knowledge_health additive module fields |
| services | Modified | `prospec knowledge verify` stamps `last_verified` and `source_digest` |
| tests | Modified | Real-Git evidence and cross-station regression coverage |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-015 | MODIFIED | Knowledge health check (source content digest vs `source_digest`) |
| REQ-LIB-039 | MODIFIED | Generated-source-artifact registry |
| REQ-LIB-070 | MODIFIED | Single git-fact gather per drift run |
| REQ-LIB-097 | MODIFIED | Shared delta-spec affected-module classifier and union knowledge-sync gate |
| REQ-TYPES-073 | MODIFIED | knowledge_health additive module fields |
| REQ-TYPES-084 | MODIFIED | Module entry carries `last_verified` and `source_digest` |
| REQ-SERVICES-090 | MODIFIED | `prospec knowledge verify` stamps `last_verified` and `source_digest` |
| REQ-TESTS-112 | MODIFIED | Real-Git evidence and cross-station regression coverage |
| REQ-TESTS-142 | MODIFIED | Coverage for Knowledge sync before review |
| REQ-TESTS-067 | MODIFIED | sub-module size and staleness coverage |

## Completion

- **Tasks**: 25/25 (100%), 5/5 [M]/[V] (not counted)
- **Acceptance Criteria**: 驗收基準 revision 7（plan 站補凍結，late-capture），verify 2/5 涵蓋 10/10 REQ

## Review & Verify

- **Review**: 兩個 loop 共 6 輪（皆 fresh-subagent）。第一個 loop 4 輪：R1 兩個經 verifier 確認的 critical 已修並 pin（bookkeeping-only 模組得空集合 digest；生成檔排除撤銷早於永不撤銷排除）；R3 觸發 `fix_induced_threshold_exceeded`，開發者 break-glass 授權第 4 輪，5 項 major 修正。verify 後依開發者決定修 R3-3，第二個 loop R1 再抓到 `git rm --cached` 誤判（critical，確認後修正並 pin），R2 為 0 critical。累計 critical 3 個（全修）、major 7 個；未修：R3-3 殘留（追蹤檔被同名目錄取代，fail-closed）、R5-1 minor（`held()` 吞 EACCES，fail-open）、R3-1 minor（glob 分支 pin），已開 follow-up #415。
- **Verify**: Grade A（兩次皆 A）— tasks／knowledge／tests PASS（6 模組 digest-match；`pnpm test` 8,763 passed／4 skipped，coverage 96.43%），Constitution 8/8 PASS，delta-spec 9/10 PASS、REQ-LIB-015 WARN（R3-3／R5-1），design not-applicable。
- **Quality Log**: plan 站 verifier 七輪（FLAWS×4、WARN×3，break-glass 一次）後簽核；tasks verifier FLAWS→WARN；review WARN（斷路器一次、未修 major 帶入 verify）；verify WARN：2/5 REQ-LIB-015、驗收基準 late-capture。

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/drift-engine.md`（digest 規則與排除判定 pitfall）、`lib/README.md`、`types/README.md`、`types/frozen-registries.md`、`services/README.md`、`tests/README.md`；6 個模組皆已以 `source_digest` 蓋章。

<!-- prospec:escalation-history -->
## Escalation History

Lifetime events: 2. Overrides: 2. Completeness: legacy-partial.

| Ordinal | Station | Trigger | Event | State |
|---|---|---|---|---|
| 1 | prospec-plan | station_retry_limit_exceeded | retry:prospec-plan:8bd8ff0b7bc49ca812fc6756cbab6dd2c66aabda3f3f3616cfe79285255f5178 | not pending |
| 2 | prospec-review | fix_induced_threshold_exceeded | review:3 | not pending |

| Event | Station | Reason | Usage |
|---|---|---|---|
| retry:prospec-plan:8bd8ff0b7bc49ca812fc6756cbab6dd2c66aabda3f3f3616cfe79285255f5178 | prospec-plan | FLAWS 收斂至一項小修（Windows 路徑分隔），授權再一次嘗試 | consumed by prospec-plan:bc24be57176de46a05f18bef1ead01e456e0b34e2169acf4f13a7e6f710ed4c1 |
| review:3 | prospec-review | 0 critical；5 項 major 皆為局部修正（測試 pin、子目錄 spawn、刪除檔歸屬、文件路徑基準），授權第 4 輪 | consumed by prospec-review:0175aec74688bbff199502e391f994799561d3d571b4205b8abc6dd8150e1406 |
<!-- prospec:escalation-history-end -->
