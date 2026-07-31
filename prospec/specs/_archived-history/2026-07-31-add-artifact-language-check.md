# add-artifact-language-check — Archive Summary

- **Archived**: 2026-07-31
- **Original Created**: 2026-07-30
- **Quality Grade**: A

## User Story

作為在非英文 artifact_language 專案中工作的開發者，
我要 `prospec check` 在變更工件缺少該語言字跡時提出訊號，
以便語言違反在每次 check 就浮現，而不是等到 verify 的人工稽核——甚至畢業後才發現。

第二個 Story：誤報不得侵蝕清單可信度——對「還沒寫內容」與「不該檢查」的檔案保持沉默。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Low | `DRIFT_CHECK_IDS` 附加第 14 個 id ＋ 定義式行為註解 |
| lib | High | 腳本表與 `LATIN_ORTHOGRAPHY` 規則、`scriptPatternFor`／`scriptGapReason`、`collectArtifactLanguage`（containment、safe walk、fence 剝除、四類 unread 記錄）、`evaluateArtifactLanguage`、`ARCHIVE_NATIVE_GLOB` 單一來源 |
| services | Low | `check.service` 以 canonical resolver 串接，內含零語言判定 |
| tests | Medium | evaluator 三結果、collector 範圍與安全性、腳本規則參數化、service 層真實 scope 組合與四條 unread 路徑 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-072 | ADDED | `artifact-language` 為第 14 個凍結 check id |
| REQ-LIB-037 | ADDED | 偵測與其明示的能力邊界 |
| REQ-SERVICES-074 | ADDED | check.service 串接 collector |
| REQ-TESTS-065 | ADDED | 含 skip 路徑的完整覆蓋 |

## Completion

- **Tasks**: 14/14 code tasks（100%）；`[M]` 2、`[V]` 2 皆已完成
- **Acceptance Criteria**: US-1 4/4、US-2 3/3 場景皆有落地證據

## Review & Verify

- **Review**: **5 輪**、25 筆 findings、1 筆刻意保留為提案。3 個 critical 全解。核心事實：**同一缺陷類別連續四輪換形狀**——collector 的目錄走訪 r1 拋 `fs` 錯 → r2 改用 canonical scanner 只是換成拋 `ScanError`（我還寫了不實註解替它背書）→ r3 `catch{continue}` 變成靜默空洞 PASS → r4 補了 containment 與不可讀檔案卻漏掉 symlink 條目與 `DEFAULT_IGNORE` 目錄名。r5 才找到收斂點：**問題不在漏了哪條路徑，而在我把保證寫成了實作結構上無法兌現的全稱形式**。改為定義式（枚舉四個記錄在案的條件，其餘明說與真正缺席無法區分）後即穩定——第六個同族成員被發現時，它落在新宣稱**之內**而非推翻它。
- **Verify**: Grade **A**。Machine ledger 1/5 PASS · 4/5 WARN（`lib` 因生成檔 `bundled-templates.ts` 的時間戳，README 已在同一 commit 同步）· 5/5 PASS。Judgment ledger 2/5 PASS（fresh context，經五輪修正後 UNRESOLVED 歸零）· 3/5 PASS（6/6 條 Constitution 規則，coverage 94.4%）· 維度 6 not-applicable。
- **Quality Log**: review WARN（AL-28 提案未修）、verify grade A。

## Knowledge Update

已同步：`prospec/ai-knowledge/modules/{types,lib,services}/README.md`。

## Notes

- **設計反轉（實作後）**：原設計為嚴重度分層（`_archived-history/**` 記 fail），首次實跑即在本專案回報 9 個 fail——92 份封存摘要中 9 份通篇英文，是真違反而非誤判。改為一律 warn：一個在自己 repo 上第一天就全紅的 check 會被關掉而不是被修，任何中途導入 prospec 的專案亦然。完整理由與三個被否決的替代方案記於 proposal 的「嚴重度分層的取消」節。
- **自我 dogfood**：本 check 上線後立即抓到本專案 9 個真實違反，全在 `_archived-history/**`；而 B 的 dropped-behavior 機制在本變更 archive 時正確地回報為空（本變更無 MODIFIED REQ）。
- 未修提案 AL-28：collector 接受裸 `{language, nativePaths}` 而非 `LanguageScope` 型別，非 `dir/**` 形狀的 scope entry 會解析不到而被當成正當缺席；不可由出貨路徑觸達，且已被 delta-spec 與 per-id 註解明示涵蓋。
