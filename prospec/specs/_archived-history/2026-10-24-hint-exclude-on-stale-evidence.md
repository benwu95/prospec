# hint-exclude-on-stale-evidence — Archive Summary

- **Archived**: 2026-10-24
- **Original Created**: 2026-10-23T17:02:50.512Z
- **Quality Grade**: A
- **Issue**: #407
- **Plan Decision**: plan (graded_by: human)

## User Story

- **US-1 [P0]**：As a 在含本機雜訊檔的工作樹中推進 prospec workflow 的開發者，I want review／test 證據因輸入變動而被拒收時，訊息說明未被 ignore 的未追蹤檔案也算輸入、如何列出它們，以及經我同意後可用 git ignore 排除只存在本機的檔案，So that agent 第一次遇到就能把可疑檔案列給我決定，不必推測原因或反覆重跑測試。

前提：下游專案（匿名）的 session 因另一個 session 持續寫入未被 ignore 的輸出目錄，test 證據反覆過期；agent 只拿到「code changed … or current inputs are unprovable」，自述原因為推測，回報已重跑三次。REQ-CLI-052 已要求說明 tracked／non-ignored 納入規則，過去只落在 CLI reference。開發者否決放寬輸入範圍與逐檔清單，選定在拒收訊息補提示、由人決定要 exclude 哪些檔案。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | Medium | `drift-checker.ts` 新增 `UNTRACKED_INPUTS_HINT` 與 `untrackedInputsHint`／`withoutUntrackedInputsHint`；review stale、test stale、輸入已移動的 unavailable attempt 附提示；`archive-gate.ts` 的 review／test provenance FAIL 附 finding detail，同一拒收只保留一份提示 |
| services | Low | `check.service.ts` record-tests（指令與設定不變、前後 digest 可算且不同，排除 timeout／signal／spawn error）與 record-review（change digest 移動）附提示；`verify-record.service.ts` Gate A 附 finding detail，saved 與 live context 的 snapshot digest 不同時 remedy 附提示 |
| cli | Low | `check-output.ts` 已記錄的失敗 run 在「inputs changed during the run」行印出 reason |
| tests | Medium | drift-checker、archive-gate、check-output、record-tests、record-review、review merge、verify record 的 unit 測試與 evidence-validity integration（未追蹤檔 → 提示 → 加進 `.git/info/exclude` 後證據恢復） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-CLI-052 | MODIFIED | 兩個 digest 皆可算且不同的拒收說明未追蹤檔案計入輸入、列出方式與經人同意的 exclude／`.gitignore` 出口；unprovable、legacy、timeout、signal、spawn error 與只有 delta-spec／config／command 變動時不附（drift-detection US-6） |
| REQ-LIB-071 | MODIFIED | archive 的 review／test provenance FAIL 附 deciding finding detail，提示只出現一次（sdd-workflow US-6） |
| REQ-SERVICES-100 | MODIFIED | verify record 的 review-provenance fail 拒收附 deciding finding detail（sdd-workflow US-24） |

## Completion

- **Tasks**: 16/16 code tasks (100%)；[V] 2/2、[M] 1/1
- **Acceptance Criteria**: 5/5 凍結情境（revision 4）有實作，verify 2/5 無 scenario finding

## Review & Verify

- **Review**: 3 輪（達上限），0 critical／2 major／4 minor，全數 fixed。R1-1 提示條件中「比較對一端不可算」與 spawn error 分支缺否定測試（兩輪補齊四處，各經 mutation 轉紅）；R1-2 exclude 檔位置對 linked worktree 與 submodule 不正確 → 改為在檔案所屬 repository 執行 `git rev-parse --git-path info/exclude`；R1-3 archive 拒收重複提示；R1-4 `change status implemented` 出口缺提示斷言；R2-1 round 1 新增測試讓 `pnpm lint` 失敗；R2-2 提示子句改由單一 helper 產生與去除，最後一處 Knowledge 宣稱於上限後修正、未再經 review 輪次。
- **Verify**: Grade A — machine 1/5、4/5、5/5 PASS；2/5 delta-spec-compliance not-adjudicated（late-capture；三個 REQ 由 fresh-subagent 判 PASS，覆蓋 3/3，獨立 mutation 12 項全紅）；3/5 constitution PASS（8/8 規則）；6 not-applicable；`pnpm test` 8,629 passed／4 skipped（verify grader 於 snapshot 量測）
- **Quality Log**:
  - prospec-plan：verifier r1 FLAWS（REQ-LIB-071 Spec 區塊以標題開頭被解析為空、省略現行 bullet）、r2–r4 WARN；「所有拒收」的列舉每輪被找到新實例，r3 後改以結構判準定義類別；凍結情境 amend 三次（late-capture）；開發者簽核並指示第 4 輪 WARN 於 tasks 處理
  - prospec-tasks：verifier WARN（unavailable attempt 與 Spec 第 4／5 bullet 優先序、T15 缺 submodule 說明等，已補入 tasks T19 與各 task）
  - prospec-review：r1／r2／r3 皆 WARN（見上）
  - prospec-verify：Grade A（warning：acceptance baseline late-capture）

## Follow-ups

- verify record context 過期的提示以括號接在 remedy 中，未經 `untrackedInputsHint`；它不進 archive 的串接，目前不影響「只出現一次」。
- 寫入前的短窗口合併重檢（archive、verify record／context、review merge、change status）不分辨原因，未附提示；delegation 收據的 content digest 拒收屬 issue #383 範圍。
