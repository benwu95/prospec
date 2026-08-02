# enforce-counts-in-ci — Archive Summary

- **Archived**: 2026-08-02
- **Original Created**: 2026-08-02T06:33:26.690Z
- **Quality Grade**: S
- **Introduced by**: generate-factual-counts · **Commit**: `241ce69` · **Base**: rebased onto `fix/restrict-identity-fallback`

## User Story

作為送出 PR 的貢獻者，我要 CI 在事實計數落後時直接讓 job 轉紅，這樣維持它們為真就不必仰賴「有人記得在最後一次編輯後重跑生成器」；同時我要一個契約斷言釘住「CI 必須跑哪些閘門」—— `counts:check` 從未被接上，正是枚舉漂移無人察覺的失敗形狀。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| tests | Medium | 新增 `tests/contract/ci-workflow.test.ts`（閘門清單封閉集合／不可中和／block scalar 不藏閘門／讀寫路徑一致）與 `tests/unit/scripts/counts-from-report.test.ts`（`--from` 的兩條契約） |
| （非模組）`scripts/sync-counts.ts` | High | 新增 `--from <file>`：吃既有 vitest 報告取代自己 spawn；無隱式尋找；改寫模式拒絕該旗標 |
| （非模組）`ci.yml` / `package.json` / `.gitignore` | High | 閘門步驟、報告產出、產物忽略 |
| （非模組）雙語 README / CONTRIBUTING / verify 模板 | Low | 記載 `--from` 與其 CI 角色；出貨模板停止斷言本 repo 的事實 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TESTS-070 | ADDED | CI 強制事實計數契約（畢業於新設的 US-31） |
| REQ-TESTS-059 | MODIFIED | 把無執行者的「counts:check passes」宣稱改為指向 REQ-TESTS-070 |

## Completion

- **Tasks**: 10/10 code (100%)、1/1 `[M]`、5/6 `[V]`（T15 為 PR 開啟後的外部證據，刻意留空）
- **Acceptance Criteria**: US-1 3/3、US-2 2/2；FR-001..005 全數滿足；SC-001/002 綠，SC-003 待 PR

## Review & Verify

- **Review**: 5 round(s)、2 critical / 13 major / 20 minor（35 列全部 fixed）。第 1 輪的 critical 是「封閉集合只認 `pnpm run` 拼法」——
  同檔的 windows-smoke 早就用 `pnpm exec`，等於閘門枚舉根本不封閉。**第 2-4 輪的每一項都是前一輪修復自己引入的**
  （`uses:` 動作再逃逸、block scalar 藏閘門、顯式 no-op 誤紅、`--reporter=json` 未檢、`--from` 無新鮮度概念、mutation 計數連錯三次）。
  最終 mutation 記錄對**當時出貨的實作**重跑：13 kills 全紅、6 個 false-red 防護全綠、控制組綠。
- **Verify**: Grade S — 機器面 1/5 task-completion · 4/5 knowledge-health · 5/5 test-provenance 皆 PASS（`prospec check` 14/14）；
  判斷面 2/5 PASS（fresh context，第三次評分才通過）· 3/5 PASS（6/6 條 Constitution 規則）· 6 not-applicable。
  測試 139 檔 3005 passed / 4 skipped，exit 0。
- **2/5 抓到四輪 review 沒抓到的 critical**：第 4 輪為了消除誤紅把套件管理器的錨點鎖在第 0 欄，但它守的 block 是 `{ … }` 群組、
  每行指令都有縮排 —— 照周圍縮排寫的 `pnpm run depcheck` 完全不會轉紅。review 問的是「這個斷言擋得住什麼」，
  2/5 問的是「即將原樣畢業進信任區的那句話是不是真的」，後者才試出了那個唯一的書寫方式。
- **Quality Log**: 5 筆 `prospec-review` WARN（逐輪計數見 metadata.yaml）、其餘站點 PASS、verify 無 budget-counted WARN。

## Knowledge Update

已折進同一個 commit：`modules/tests/README.md`（計數）、`modules/templates/README.md`（新增「出貨模板不得斷言本 repo 的事實」）、
`index.md`／`module-map.yaml`／雙語 README（`pnpm counts`）。

**誠實揭露**：commit 後 `knowledge-health` 對 `lib` 報 stale WARN。該 commit 裡唯一的 lib 檔是 `src/lib/bundled-templates.ts` ——
因改了 `prospec-verify.hbs` 而重生的生成檔，lib 的行為與其 README 描述皆未改變，因此沒有任何據實的 README 編輯可做。
依 PB-005／PB-011 不為移動時間戳而假造內容；`prospec check --strict` 退出碼為 0，不擋 CI 亦不擋 archive gate。
既有帳本鍵 `knowledge/generated-file-trips-module-stale` 於 harvest 遞增。

## Dogfood Note

本變更原本從 main 切出，帶著**未修復的** review-merge 引擎（issue #116 的修復在 PR #118，尚未合入）。
於是 review 帳本自己被那個缺陷咬了一口：G-10／G-13／G-20 各自被同 `(location, lens)` 的前一列吞掉，25 列只剩 22 列。
依使用者指示 rebase 到 `fix/restrict-identity-fallback` 後，以**真正的 CLI** 重跑同一份輸入，25 列 ID 全在 ——
這是該修復在真實工作流上的驗收證據，也是「用還沒修好的工具去修工具」的具體代價。
