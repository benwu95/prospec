# pin-windows-kill-semantics

## Background

`add-windows-smoke-ci` 讓 CI 第一次在 Windows 上執行測試，首跑就浮出唯一一條與 shim 無關的失敗：`tests/unit/services/check.service.test.ts:500` 用 `node -e process.kill(process.pid,'SIGTERM')` 當 fixture，把 POSIX 訊號語意寫成跨平台前提。POSIX 的訊號來自 wait status（`WIFSIGNALED`／`WTERMSIG`，與誰發的無關）；Windows 的 wait status 根本沒有訊號，libuv 只在 kill 經 `uv_process_kill` 下達時才有 `exit_signal` 可合成。fixture 是自我 kill，於是 Windows 上無訊號可報、`TerminateProcess` 以 exit code 1 收場，`--record-tests` 據實記錄了一次普通的非零結束——`recorded` 是 `true`，測試卻期望 `false`。

同一件事也讓 REQ-LIB-033 的「timed out or killed → 不寫記錄」在 Windows 上只有 timeout 那一半成立（timeout 的 kill 由 `spawnSync` 自己下，因此連 Windows 都仍回報 `SIGKILL`）。這是一條規格宣稱，不能靠測試改法掩蓋。

## User Stories

### US-1: 把 Windows 的 kill 語意釘成明示事實 [P1]

As a 維護 windows-smoke 觀測期的 prospec 維護者,
I want 該斷言按平台各自斷言真實行為，且 REQ-LIB-033 明載 Windows 的例外,
So that windows-smoke 的 vitest 步驟全綠、觀測期只剩真正未知的失敗，而規格不再帶一條在 Windows 為假的宣稱。

**Acceptance Scenarios:**

- WHEN 該測試在 POSIX 上執行, THEN 維持現有斷言（`recorded === false`、reason 含 `SIGTERM`、metadata 不含 `test_provenance`）
- WHEN 該測試在 Windows 上執行, THEN 斷言真實結果：`recorded === true`、記錄的 exit code 非零、metadata 含 `test_provenance`——並在註解說明這是 fail-closed 而非缺陷
- WHEN 讀 REQ-LIB-033, THEN 「killed → 不寫記錄」收斂為「只有被訊號終止的執行才不寫記錄」，並載明訊號有無是平台形狀（POSIX 由 wait status 取得、接住訊號後正常結束仍會記錄；Windows 只有經 `uv_process_kill` 的 kill 才有訊號），timeout 半邊兩平台皆成立
- WHEN windows-smoke 於 PR 上執行, THEN 該 job 的 vitest 步驟不再有失敗

**Independent Test:** 在 macOS 上 `pnpm exec vitest run tests/unit/services/check.service.test.ts` 全綠（走 POSIX 分支）；windows-smoke 的 CI log 顯示同檔零失敗（走 win32 分支）。

## Edge Cases

- **Windows 上 timeout 仍須維持原行為**：那個 kill 是 `spawnSync` 自己下的，libuv 因此有 `exit_signal` 可合成，Windows 上同時回報 `SIGKILL` 與 `ETIMEDOUT`——「timeout → 不寫記錄」在兩平台皆成立，不可被這次的措辭一併放寬
- **POSIX 上接住訊號的子行程仍會被記錄**：`WIFSIGNALED` 為假時 term_signal 為 0、exit code 存在（vitest／jest 本身就裝 SIGTERM handler），故規格不可寫成「POSIX 上任何 kill 都不寫記錄」
- **不改產品行為**：Windows 上無法區分「被外部殺掉」與「套件真的失敗」（沒有訊號可讀），所以記錄它是唯一誠實選項；本 change 只釘住事實，不引入猜測性偵測

## Functional Requirements

- **FR-001**: `check.service.test.ts` 的 kill 斷言依 `process.platform` 分岔，兩邊都斷言該平台的真實結果，不以 skip 迴避
- **FR-002**: REQ-LIB-033 的 killed 條目加入明示的 Windows exclusion（措辭與既有 grandchildren／relative-entry exclusion 同一風格）
- **FR-003**: 不改動 `lib/test-runner.ts` 或 `check.service.ts` 的執行期行為

## Success Criteria

- **SC-001**: `pnpm test` 在 macOS 全綠；`git diff` 顯示 `src/` 零行為改動
- **SC-002**: windows-smoke 的 vitest 步驟在下一次 PR 執行中零失敗
- **SC-003**: REQ-LIB-033 的 killed 條目含 Windows exclusion 字樣

## Related Modules

- **tests**: `tests/unit/services/check.service.test.ts` 的平台分岔斷言
- **lib**: `lib/test-runner.ts` 的 `runTestCommand` 為該行為的來源（僅補註解，不改邏輯）

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified — INVEST：單一 story、可獨立驗證；TDD：舊斷言在真機為紅已由 run 30543703603 證實，改後 POSIX 分支即刻可驗；Language Policy：本檔為 change artifact，繁中

## UI Scope

**Scope:** none
