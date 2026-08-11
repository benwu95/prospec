# Tasks: enforce-counts-in-ci

**Input**: Design documents from `.prospec/changes/enforce-counts-in-ci/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

> T1-T13 的敘述已於 review 修復輪更新為**實際出貨的設計**（審查揪出「只認 `pnpm run` 拼法」的 critical，以及每個 PR 把套件跑兩遍的成本）。原始設計為文字切分＋腳本名 baseline＋步驟排在 `test:coverage` 之前。

---

## Phase 1: Tests (RED first — TDD [MUST])

- [x] T1 新增 `tests/contract/ci-workflow.test.ts`：以 `yaml`（既有依賴）解析真實 `.github/workflows/ci.yml`，抽出 `test` job 每個 step 的**完整指令**（block scalar 收斂為 `|`），依序與版本控制的 baseline 做相等比對 ~50 lines
- [x] T2 加「閘門不可被中和」斷言：`test` job 本身與每個閘門 step 都不得帶 `if:`／`continue-on-error` ~20 lines
- [x] T3 加負向斷言：`windows-smoke` 的**指令**不含 counts（註解可以提，不誤紅），並在註解寫明理由 ~12 lines
- [x] T4 [V] 在未動 `ci.yml` 前執行該檔測試，記錄轉紅與失敗訊息（RED 證據） ~5 lines

## Phase 2: Wiring

- [x] T5 `scripts/sync-counts.ts` 新增 `--from <file>`：讀既有 vitest JSON 報告、**不做隱式尋找**、讀不到即回報 unavailable（`--check` 因 skip 而 exit 1）；改寫模式拒絕該旗標 ~34 lines
- [x] T5b `tests/unit/scripts/counts-from-report.test.ts`：spawn 測試釘住上述兩條（改寫模式拒絕、讀不到即非零退出），檔案層 30s timeout（PB-010） ~48 lines
- [x] T6 `package.json` 的 `test:coverage` 加 `--reporter=default --reporter=json --outputFile.json=vitest-report.json`；`.gitignore` 收掉該產物 ~3 lines
- [x] T7 `ci.yml` 的 `test` job 在 `test:coverage` 之後插入 `- run: pnpm run counts:check --from vitest-report.json` ~7 lines
- [x] T8 加跨檔一致性斷言：`--from` 的路徑必須等於 `test:coverage` 的 `--outputFile.json` 路徑 ~18 lines
- [x] T9 [V] 實跑 `pnpm test:coverage` 確認報告落地，再跑 `pnpm counts:check --from vitest-report.json` 確認秒回且 in sync；另以不存在路徑確認 fail closed ~5 lines

## Phase 3: Docs & Spec

- [x] T10 雙語 README 的 counts 段落補上 `--from` 用法與其 CI 角色 ~10 lines
- [x] T11 CONTRIBUTING.md 的 Development Workflow 補上 `pnpm counts` / `counts:check`（verify 模板宣稱「本 repo 的生成器在貢獻者文件中具名」，先前不成立） ~8 lines
- [x] T12 [M] 執行 `pnpm counts` 重導計數（新增測試檔改變 contract 計數） ~5 lines

## Phase 4: Gates

- [x] T13 [V] mutation 驗證：13 個 mutation 各自轉紅（刪步驟／前移／`pnpm exec` 拼法／`uses:` 動作／`|| true`／`continue-on-error: true`／`if: false`／block scalar 內行首與**縮排**的套件管理器各一／windows-smoke 加 counts 步驟（單行、block 各一）／`test:coverage` 拿掉 `--reporter=json`／install 閘門被 continue-on-error 中和），6 個 false-red 防護維持綠（windows-smoke 的 counts 註解／動作版號升級／`continue-on-error: false`／`if: success()`／block scalar 內的 shell 註解與引號字串各一），控制組全綠 ~26 lines
- [x] T14 [V] `pnpm typecheck`／`pnpm lint`／`pnpm test`／`pnpm counts:check` 與 `prospec check --strict` 對照基線無新增 FAIL ~5 lines
- [ ] T15 [V] PR 開啟後確認 CI `test` job 實際跑出 counts:check 步驟並通過（SC-003，外部證據） ~2 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 15 |
| Code tasks | 8 |
| Manual `[M]` / Verification `[V]` | 1 / 6 |
| Estimated lines | ~190 lines |

---

## Notes

- Phase 1 必須轉紅後才進 Phase 2 —— TDD 是 Constitution `[MUST]`
- T13 的 13 個 kill 對應 FR-001/002/003；6 個 false-red 防護不是 kill，它們證明斷言不會誤傷合法編輯
- T15 依賴 PR 存在，是本變更唯一無法在本地閉環的驗證
