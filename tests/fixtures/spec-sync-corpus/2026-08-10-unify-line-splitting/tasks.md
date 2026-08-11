# unify-line-splitting — Tasks

> 順序刻意先測後改（TDD）：T5～T7 在 T1～T3 之前應為紅。

## Lib

- [x] T1 新增 `src/lib/text-lines.ts`：`stripTrailingCr(line)` —— 只剝行尾單一 `\r` ~15 lines
- [x] T2 `task-markers.ts`：`parseTaskLine` 以 `stripTrailingCr(line)` 的視圖比對 `CHECKBOX` ~5 lines
- [x] T3 `lessons-ledger.ts`：`expiredPlaybookEntries` 的 `### ` 條目定位改走 primitive（body 行仍原樣收集）~5 lines
- [x] T4 `markdown-fences.ts:100`：行內 `endsWith('\r')` 三元式改呼叫 primitive（行為不變，去重複）~3 lines

## Tests

- [x] T5 [P] `tests/unit/lib/text-lines.test.ts`：行尾單一 `\r`、行中 `\r` 保留、無 `\r`、空字串、lone `\r` 不視為換行 ~50 lines
- [x] T6 [P] `task-markers.test.ts`：同一份 tasks.md 的 LF/CRLF 差分 —— 任務數、`checked`、`kind`、`text` 逐項相等 ~40 lines
- [x] T7 [P] `lessons-ledger.test.ts`：`expiredPlaybookEntries` 的 LF/CRLF 差分，含 RETIRED 排除與 UN-RETIRED 保留兩條既有語意 ~45 lines
- [x] T8 [V] `markdown-fences.test.ts`：確認 T4 收斂後既有 CRLF fence 斷言仍綠（純驗證，零落地）~0 lines
- [x] T9 `status.service` 測試：CRLF 的 tasks.md 讀出的 code task 數與 LF 版相同 ~30 lines
- [x] T10 `archive.service` 測試：CRLF 的 tasks.md 的 task stats（completed/total、kind 分項）與 LF 版相同 ~30 lines
- [x] T11 `change-progress.service` 測試：CRLF tasks.md 勾選一項後，除該行外每行行尾位元組不變 ~40 lines
- [x] T12 端到端：CRLF 的變更工件（tasks.md ＋ metadata.yaml）跑 `prospec status`／`prospec check`，結論與 LF 版一致 ~50 lines

## Docs

- [x] T13 `prospec/ai-knowledge/modules/lib/README.md`：Key Files 列入 `text-lines.ts`、Pitfalls 記載「比對視圖 vs 位元組保真」的界線，檔案數 39 → 40 ~15 lines

## Review Round Fixes

- [x] T18 收斂剩餘手抄本：`spec-headings.ts` 的私有 `stripCarriageReturn`、`delegated-evidence.ts` 的私有 `withoutCr`、`archive.service.ts:912/958/984` 三處內嵌（review F-1）~20 lines
- [x] T19 D 類差分斷言：`markdown-table`（`findTable`／`splitTableRow`／`isSeparatorRow`）與 `parseConstitutionRules` 各一組（review F-3）~45 lines
- [x] T20 `archive.service` 兩個決策點的 CRLF 斷言：near-miss 拒寫、missing-features-dir 的建議分支（review F-3 第二輪）~45 lines
- [x] T21 收窄過寬宣稱並訂正歸因：REQ-LIB-051 `**Spec:**`／`text-lines.ts` 檔頭／lib README／plan Existing Patterns；`core.autocrlf` 改歸因 Git for Windows 安裝程式（review F-2、F-4）~30 lines
- [x] T22 回填工件：plan 的裁決表與定位點行號、tasks.md 本節、Affected Modules 的 services 列（review F-5、F-6）~25 lines

## Verification

- [x] T14 [V] 確認本變更無 README-documented surface 變動（無新指令／旗標／工作流程），故雙語 root README 不需改 ~5 lines
- [x] T15 [V] mutation：把 `stripTrailingCr` 改為恆等函式，確認 T6／T7／T9／T10／T11 轉紅後復原 ~10 lines
- [x] T16 [M] 執行 `pnpm counts` 重導測試計數（新增測試檔會改動機器擁有的計數）~5 lines
- [x] T17 [M] 執行 `pnpm lint`／`typecheck`／`test`／`counts:check`／`agents:check`／`prospec check --strict`，全數 exit 0 ~5 lines
- [x] T23 [V] mutation：M1（`documentHeadings(raw)`）、M2（`probe = raw`）與 `\s*$`→`[ \t]*$`（`markdown-table`／`constitution-parser`）各自轉紅後復原 ~10 lines

## Summary

- **Total Tasks:** 23
- **Code Tasks:** 17
- **Parallelizable Tasks:** 3
- **Total Estimated Lines:** ~528 lines
