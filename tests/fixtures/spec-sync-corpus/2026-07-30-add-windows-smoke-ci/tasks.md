# Tasks: add-windows-smoke-ci

**Input**: Design documents from `.prospec/changes/add-windows-smoke-ci/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

---

## Phase 1: Tests First (RED — US-2)

- [x] T1 `tests/unit/lib/test-runner.test.ts`：cwd 有 `mytool.exe`、PATH 只有 `mytool.cmd` → 期望 `spawnable`；反向案例（cwd 只有 `.cmd`）維持 `shim` ~25 lines
- [x] T2 quoted PATH entry 案例：entry 內含真 `.exe` 且他處有同名 `.cmd` → 期望 `spawnable`；quoted entry 內含 `;` 不被切開 ~30 lines
- [x] T3 `defaultExecutableProbe`：`NoDefaultCurrentDirectoryInExePath` 已定義 → `cwd === null`；未定義 → `cwd` 為傳入值（預設 `process.cwd()`）~20 lines
- [x] T4 既有 `ExecutableProbe` literal 與 `winProbe` helper 補 `cwd` 欄位（typecheck 涵蓋 tests） ~15 lines
- [x] T5 [V] 確認 T1-T3 在未改 `lib/test-runner.ts` 前為 RED（逐條記錄失敗訊息） ~0 lines

## Phase 2: Lib (GREEN — US-2)

- [x] T6 `ExecutableProbe` 新增必填 `cwd: string | null` 並更新 doc comment（說明它是 spawn cwd、null 代表不搜尋） ~15 lines
- [x] T7 `defaultExecutableProbe(env, platform, cwd = process.cwd())`：`NoDefaultCurrentDirectoryInExePath` 守衛 → `cwd: null` ~15 lines
- [x] T8 win32 PATH 切分改引號感知（配對引號內 `;` 不切、剝除首尾各一引號字元），POSIX 維持 `:` 切分 ~30 lines
- [x] T9 `classifyExecutable` 兩個 pass 的搜尋目錄改 `[probe.cwd, ...pathDirs]`（僅 bare name），並更新 libuv 引用註解 ~20 lines
- [x] T10 呼叫端貫穿 spawn cwd：`runTestCommand` 預設 probe 用其 `cwd` 參數；`collectTestProvenance`（`lib/drift-sources.ts`）同理 ~10 lines
- [x] T11 [V] 確認 T1-T3 轉綠，且還原 T8／T9 任一處即回紅（mutation pin，PB-001） ~0 lines

## Phase 3: Real-host Adjudication (US-3)

- [x] T12 `describe.runIf(win32)` 內建立暫存目錄並 `copyFileSync(process.execPath, …)` 造唯一命名 `.exe`（beforeAll／afterAll 清理，file 級 `vi.setConfig` 已在檔內） ~25 lines
- [x] T13 真機案例 A：cwd 放該 exe、PATH 無同名 → 斷言 `classifyExecutable` 為 `spawnable` 且 `runTestCommand` 真的取得指定 exit code ~25 lines
- [x] T14 真機案例 B：以 quoted entry 暫時塞入 `process.env.PATH`（測後還原）→ 斷言判定與真 spawn 結果一致 ~30 lines

## Phase 4: CI Evidence (US-1)

- [x] T15 `scripts/windows-smoke-record-tests.ts`：建暫存 git fixture（`.prospec.yaml`、帶 test script 的 `package.json`、一個 `status: implemented` change） ~60 lines
- [x] T16 同腳本：跑 `check --record-tests --change smoke` 與 `check --json`、原樣印出輸出、讀 `prospec-report.json` 斷言 `test-provenance` 非 `fail`（否則非零 exit） ~50 lines
- [x] T17 [V] 在 macOS 上執行該腳本，確認走「成功記錄」分支且斷言通過 ~0 lines
- [x] T18 `.github/workflows/ci.yml` 新增 `windows-smoke` job（`windows-latest`、`continue-on-error: true`、checkout→pnpm→node22→install→build→兩個測試檔→fixture 腳本） ~20 lines
- [x] T19 [V] `git diff` 確認既有 `test`／`comment` job 零改動（SC-004） ~0 lines

## Phase 5: Docs & Ship

- [x] T20 `pnpm counts` 重導測試計數（新增測試改變 index.md／tests README 的事實數字） ~5 lines
- [x] T21 [M] push 分支、開 PR（body 繁中、結尾 `Closes #101`、無 AI footer） ~0 lines
- [x] T22 [M] 觀測 windows-smoke 首跑：確認真機區塊有非零通過數（SC-001）、record-tests 步驟輸出 `test-provenance` 狀態（SC-002） ~0 lines
- [x] T23 [M] 與 shim 無關的 Windows 失敗逐條列舉並各自給結論（修／已知限制／降級），發表於 issue #101 ~0 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 23 |
| Code tasks | 16 |
| Manual `[M]` | 3 (T21, T22, T23) |
| Verification `[V]` | 4 (T5, T11, T17, T19) |
| Estimated lines | ~420 lines |

---

## Notes

- Phase 1→2 為嚴格 TDD 順序：T5 未確認 RED 前不得動 `lib/test-runner.ts`
- Phase 3 的真機案例在 POSIX 上必然 skip，其價值只在 windows-smoke 上兌現；首跑若與模型不符，即為本 change 的裁決結果，須據實處置（改模型或記為已知限制）
- Phase 4 的 fixture 腳本先在 POSIX 跑通再上 Windows，避免把腳本自身的錯誤誤讀成平台差異
- T21-T23 為 `[M]`：CI 只在 PR 上觸發，觀測必然在 commit 之後，而 commit 會讓 review baseline digest 轉 stale——把觀測留在 repo 內當 code task 會使 verify 與 CI 互為前提而死鎖。故失敗清單發表於 issue #101（out-of-repo、無 diff），由此發現的程式修正屬後續 change（issue 正文亦將「全綠後移除 continue-on-error、列入 required checks」列為後續階段）
