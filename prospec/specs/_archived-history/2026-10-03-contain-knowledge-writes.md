# contain-knowledge-writes — Archive Summary

- **Archived**: 2026-10-03
- **Original Created**: 2026-10-02T18:27:41.306Z
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/335

## User Story

As a 在專案中執行 `prospec knowledge update`／`prospec knowledge verify` 的 agent,
I want 寫入 `index.md`、模組 README 與 `module-map.yaml` 之前，寫入目標都先解析到各自 root 內的真實路徑，root 外、不是一般檔、本次要讀卻不可讀、或路徑上有 dangling symlink 時一律在第一次寫入前拒絕,
So that root 外的內容不會流進知識庫，skeleton 不會寫到 root 外，root 內 symlink 的讀取端與寫入端始終是同一個檔案。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | Medium | `knowledge-reader.ts` 新增 `resolveContainedTarget(filePath, root, { read })`：存在目標取 realpath 並以 `isContainedPath` 判定，不存在目標以 root 內最近存在祖先判定（`isLexicallyWithin` 處理 root 尚未建立的情況），路徑上的 dangling symlink 回 `unreadable` 並帶 `danglingLink`，`read: true` 時不可讀回 `no-read-access` |
| services | Medium | `knowledge-update.service.ts`：入口預檢 `module-map.yaml`、`index.md` 與每個處理中的 README（delta 以 `read: true`、manual 以 `read: false`），各 writer 讀寫解析後路徑、回報路徑不變，依 reason 給出不同的 message／remedy；`knowledge-verify.service.ts` 把戳記寫進真實路徑 |
| tests | Medium | lib real-fs、service memfs（含權限）與 e2e 新增 escaped、dangling、不可讀、root 內 symlink、lexical 逃逸等情境；6,909 → 6,950 tests |
| knowledge | Low | lib／services README 各一句；`pnpm counts` 同步測試計數；`lib`、`services`、`tests` 蓋章 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SERVICES-023 | MODIFIED | coordinator 在第一次寫入前以 `resolveContainedTarget` 預檢 `module-map.yaml`、`index.md` 與每個處理中的 README；拒絕時零寫入；三類知識檔讀寫落在真實路徑、保留 root 內 link；dangling root 拒絕並點名該 link；manual 模式不讀既有 README，故不可讀時仍列 README-pending |
| REQ-SERVICES-090 | MODIFIED | `knowledge verify` 把戳記寫進 `module-map.yaml` 解析後的真實檔案，link 保留 |

## Completion

- **Tasks**: 12/12 code tasks（100%）；[V] 6/6（T18 於 feature commit `dfc1e7a2` 後重跑 `knowledge:check` 通過）
- **Acceptance Criteria**: 10/10 凍結情境（最後一次 verify 2/5 無 scenario_findings）

## Review & Verify

- **Review**: 7 輪（fresh-subagent，CLI 依 record-review 重開三個 loop），累計 1 critical／4 major／9 minor。R3-1（critical）為修正 dangling root 時引入的退化：root 外既有祖先未檢查 target 在 root 下，直接呼叫的 writer 會寫到 root 外；經獨立 verifier 確認，以 fail-then-pass pin 修正。R1-1／R1-2／R6-1／R6-2（major）皆為測試缺口，已補測試並 mutation 驗證。minor 中 R1-3／R2-1／R4-1／R4-2／R5-1／R5-2／R6-3 已修；R7-1（目錄無 search 權限時目標讀成不存在，main 既有，已在 Spec 明示限制）與 R7-2（`markModuleDeprecated` write-through 無 pin，無 production 呼叫端）留作 follow-up。每輪修 minor 都產生下一輪 finding，與 lessons 2026-09-27／09-29 的修正迴圈形狀一致。
- **Verify**: 第一次 Grade A（2/5 WARN：凍結情境 US-1.2 的無讀取權限 index.md 先寫出 README 才丟 EACCES）；修根因後重跑 Grade S——1/5、4/5、5/5 machine PASS，2/5（2/2 REQ executable PASS、10 情境無偏差）、3/5（8/8 原則）fresh-subagent PASS，6 not-applicable；`pnpm test` 6,946 passed／4 skipped。
- **Quality Log**: plan verifier WARN（7 條：預檢改取分類資料、dangling 目錄 symlink、US-4.1／US-2.1 bullet、量詞收窄等）；tasks verifier WARN（6 條測試設計）；review 各輪 WARN／PASS 交錯，第 2 輪 close 一次 `log_mismatch: majors expected 2 got 0`（`--majors` 應傳累積數）。
- **Mutation**: 各輪皆以備份＋`diff` 確認套用＋sha256 還原：預檢移除、writer 改回原路徑、祖先分支一律 ok、verify 改回原路徑、dangling 走訪止於 root、lexical 判準改回 `startsWith`、read 旗標翻轉、remedy 分支移除、contained 存在判定，全數 killed。

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/README.md`、`modules/services/README.md`、`modules/tests/README.md`、`module-map.yaml`、`prospec/index.md` 已在 feature commit 同步；`knowledge update --change` 重跑後輸入不變。
- 後續：R7-1（search 權限）、R7-2（`markModuleDeprecated` write-through pin）待開 follow-up issue；#327 的 `knowledge-reader.ts` 註解修正應以本 change 的判準為準。
