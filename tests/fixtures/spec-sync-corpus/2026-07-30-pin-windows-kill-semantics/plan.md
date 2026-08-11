# Implementation Plan: pin-windows-kill-semantics

## Overview

windows-smoke 首跑的唯一失敗來自一條把 POSIX 訊號語意當成跨平台前提的斷言。真正的修法不是讓它在 Windows 上 skip（那會讓觀測期永遠留一個不確定），而是讓它在兩個平台各自斷言**該平台真實發生的事**，並把 Windows 這半邊寫進 REQ-LIB-033 —— 因為那條規格宣稱本身在 Windows 為假。

策略刻意收到最小：只改測試斷言與規格措辭，`src/` 的執行期行為零改動。真正的軸是「只有被訊號終止的執行才不寫記錄」，而訊號的有無是平台形狀：POSIX 由 wait status 給出（`WIFSIGNALED`／`WTERMSIG`），Windows 的 wait status 沒有訊號、libuv 只在 kill 經 `uv_process_kill` 下達時才有 `exit_signal` 可合成。因此 Windows 上的自我／第三方 kill 無訊號可讀，「被殺」與「套件真的失敗」不可區分，記錄它是唯一誠實選項（fail-closed，不會靜默消失）；引入猜測性偵測會製造一個比現況更糟的假象。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| tests | 4 層 vitest 套件；此處是 `--record-tests` 寫入路徑的服務層測試 | 無 export | 全部 source modules |
| lib | `runTestCommand` 是 kill／timeout 判定的來源 | `runTestCommand`, `TestRunResult` | types |

### Existing Patterns (from module README)

- 平台差異一律以「明示例外」措辭記錄，而非放寬宣稱（`DEFAULT_TEST_TIMEOUT_MS` 的 grandchildren exclusion、candidate 解析的 no-cwd exclusion 皆同一風格）
- git/spawn-bound 測試檔宣告 file 級 `vi.setConfig({ testTimeout: 30_000 })`（PB-010）——本檔已有
- 斷言要編碼「規則」而非「實作巧合」（ledger key `test/assertion-encodes-implementation-not-rule`）

### Architecture Constraints (from Constitution)

- 依賴方向不受影響（不新增 import）
- TDD：舊斷言在 Windows 為紅已由真機 run 30543703603 證實；改後 POSIX 分支即刻可跑
- Atomic Commits：單一 commit（test + spec 措辭同屬一個關注點）

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| tests | Medium | `check.service.test.ts` 的 kill 斷言依平台分岔，兩邊各自斷言真實結果 |
| lib | Low | `runTestCommand` 的 kill 註解補上 Windows 無訊號的事實（不改邏輯） |

## Call Chain

```
prospec check --record-tests           [受測路徑，本 change 不改其行為]
  → check.service.recordTestProvenance(cwd, config, change)
  → runTestCommand(cwd, command)       [lib/test-runner]
      → spawnSync(..., { killSignal: 'SIGKILL', timeout })
      → res.error/res.signal 判定：ETIMEDOUT 或 killSignal → timed_out
        （timeout 的 kill 由 spawnSync 自己下 → 兩平台皆回報訊號）
      → POSIX：被訊號終止（WIFSIGNALED）→ res.signal 非 null → exit_code null → 不寫記錄
        （接住訊號後正常結束 → term_signal 為 0、有 exit code → 照常記錄）
      → win32：wait status 無訊號；未經 uv_process_kill 的 kill 無 exit_signal 可合成
        → TerminateProcess 給 exit code 1 → 記錄（fail-closed）
  → exit_code === null ? { recorded: false, reason } : 寫入 test_provenance
```

## Implementation Steps

1. **平台分岔斷言（US-1 / FR-001）**
   - POSIX 分支維持三條既有斷言（`recorded === false`、reason 含 `SIGTERM`、metadata 不含 `test_provenance`）
   - win32 分支斷言 `recorded === true`、`exitCode` 非零、metadata 含 `test_provenance`
   - 測試名稱改為描述規則而非單一平台的結果，註解說明 Windows 為何是 fail-closed

2. **規格措辭（FR-002）**
   - delta-spec 以 MODIFIED REQ-LIB-033 落地：killed 條目加 Windows exclusion，timeout 半邊明確保留

3. **來源註解（FR-003）**
   - `lib/test-runner.ts` 的 kill 相關註解補一句 Windows 事實，維持「宣稱＝可觀測行為」的一致性；不動任何判定式

4. **驗證**
   - macOS 全套件綠；`git diff --stat src/` 僅註解行
   - 推 PR 後確認 windows-smoke 的 vitest 步驟零失敗（SC-002）

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| win32 分支的預期值猜錯（例如 exit code 為 0 而非非零） | Low（已由原碼消解） | `uv__kill` 是 `TerminateProcess(handle, 1)`，exit code 1 是 libuv 硬寫的，非機率問題；斷言仍只鎖「非零」而不鎖 1（那是實作細節）。真機 run 30543703603 已顯示 `recorded` 為 true |
| 把 timeout 半邊一併放寬 | High | delta-spec 與註解都明示 timeout 的 kill 由 `spawnSync` 自己下、兩平台皆回報訊號；本 change 不觸碰 `isTimeout` |
| 規格措辭把平台差異講錯（本輪已發生兩次：先寫成「Windows 沒有訊號」、再過度修正為「取決於誰下的 kill」） | High | 每一版都以 libuv `unix/process.c`＋`win/process.c` 與 Node `spawn_sync.cc` 原碼逐條核對，且經獨立 verifier 覆核；措辭區分「訊號的有無（平台形狀）」與「訊號的來源（POSIX 不分來源／Windows 僅限 uv_process_kill）」 |
| 分岔斷言掩蓋真實回歸（任一平台的行為改變不再被抓到） | Medium | 兩個分支都是實質斷言、無 skip；POSIX 分支保留原有三條，win32 分支斷言 metadata 實際落地 |
