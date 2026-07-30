# pin-windows-kill-semantics — Archive Summary

- **Archived**: 2026-07-30
- **Original Created**: 2026-07-30
- **Quality Grade**: A

## User Story

As a 維護 windows-smoke 觀測期的 prospec 維護者,
I want 該 kill 斷言按平台各自斷言真實行為，且 REQ-LIB-033 明載訊號有無的平台形狀,
So that windows-smoke 的 vitest 步驟全綠、觀測期只剩真正未知的失敗，而規格不再帶一條在 Windows 為假的宣稱。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| tests | Medium | `check.service.test.ts` 的 kill 斷言依平台分岔：POSIX 保留原三條、win32 斷言 `recorded === true`／`exitCode` 非零／metadata 含 `test_provenance` |
| lib | Low | `runTestCommand` 的 kill 註解補上平台形狀事實（僅註解，零判定式改動） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-033 | MODIFIED | timeout 與 kill 拆為兩條；kill 條目收斂為「只有被訊號終止的執行才不寫記錄」，並載明 POSIX 由 wait status 取訊號（接住訊號後正常結束仍會記錄）、Windows wait status 無訊號而由 libuv 從 `uv_process_kill` 登記的 `exit_signal` 合成 |

## Completion

- **Tasks**: 3/3 code tasks (100%)；`[V]` 3/3；`[M]` T7（推 PR 觀測）／T8（指定 `continue-on-error` 移除的下一步）
- **Acceptance Criteria**: 3/4 —— SC-002（windows-smoke vitest 步驟零失敗）待本 change 推上 #110 後的 CI 執行證實

## Review & Verify

- **Review**: 2 round(s)，1 critical / 5 major。Critical 與其後續是本 change 最重要的產出：新寫的規格措辭把 Windows kill/timeout 機制**連續講錯兩次**——第一版「Windows 沒有訊號、timeout 靠 ETIMEDOUT 而非訊號」（錯：`spawnSync` 自己下的 timeout kill 在 Windows 仍回報 `SIGKILL`，因為 `uv_process_kill` 會登記 `exit_signal`）；第二版過度修正為「取決於誰下的 kill、與平台無關」（錯：`exit_signal` 是 Windows 專屬欄位，POSIX 由 wait status 的 `WIFSIGNALED`／`WTERMSIG` 給出、與發送者無關）。第三版才同時對齊 libuv `unix/process.c`＋`win/process.c` 與 Node `spawn_sync.cc`。另有 major：POSIX 上「接住訊號後正常結束仍會被記錄」原本被寫成「任何 kill 都不記錄」；status 未推進 `implemented` 導致 `test-provenance` 是豁免而非證據；三條 win32 斷言的唯一執行地點仍帶 `continue-on-error`，無人擁有其移除。
- **Verify**: Grade A；machine ledger task-completion／knowledge／tests 全 PASS（recorded `pnpm test` exit 0），judgment ledger delta-spec-compliance=PASS（fresh context，12 條 bullet 逐條對照 libuv／Node 原碼）、constitution=PASS（6/6 規則）、design=not-applicable；1 WARN：SC-002 待 CI 證實
- **Quality Log**: 見 metadata.yaml（兩輪 review 皆記錄）

## Knowledge Update

- 無 module README 內容變動：`lib` README 的 test-runner 段落描述的是 shim 判定與記錄語意，kill 的平台形狀屬 L3 實作細節，已寫在 `src/lib/test-runner.ts` 註解與 REQ-LIB-033
