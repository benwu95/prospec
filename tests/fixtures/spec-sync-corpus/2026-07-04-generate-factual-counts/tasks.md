# Tasks: generate-factual-counts

> `scale: quick` — 從 proposal.md 直接拆解（無 plan/delta-spec）。工具住 `scripts/counts/`（非知識模組），層級改編為 Scripts → Tests → Docs，依相依順序：純函式（rewrite/derive）先、registry 資料、entry 編排、守衛測試、最後 dogfood。對齊 `scripts/measure/` 先例。TDD：純函式與 registry 先寫失敗測試。

## Scripts

- [x] 建 `scripts/counts/types.ts` — 工具內部型別：`CountReport`（changes/written/skipped）、`CountChange`（doc/key/line/from/to）、`SkippedSource`、registry entry（`key`、`source` discriminated union〔`test-suite` | `fs-glob`〕、`occurrences[{doc, anchor, format}]`，`format ∈ {plain, comma}`〔badge 的 %20 由 anchor context 處理，數字本身 plain，不需 url-encoded〕）~35 lines
- [x] 建 `scripts/counts/rewrite.ts` — 純 `applyCounts(content, resolved, doc)`：用 `d` flag 取 capture group 精確 span、只改被圈數字、依 `format` 渲染（plain／千分位逗號，deterministic ASCII 非 toLocaleString）、回傳 `{content, changes[]}`；緊鎖 anchor 含周邊字面 context、白名單外與未命中不動；冪等。含 `resolveOccurrences`（skip source 缺失的 key）~90 lines
- [x] 建 `scripts/counts/derive.ts` — `deriveTestCounts`（純：吃已解析 vitest json，逐檔 assertionResults bucket by `tests/<layer>/` → total + per-layer + files；空 report 回 null）＋ `deriveInventory`（fs-glob `src/templates/**/*.hbs` 及 skills/partials/references/agent-config/change/init-knowledge 分類）~80 lines
- [x] 建 `scripts/counts/registry.ts` — COUNT_REGISTRY 白名單：測試計數（total/unit/contract/integration/e2e/files）× README×2＋index tests 列＋tests 模組 README；`.hbs` 總數 × README×2＋index＋templates 模組 README；6 個模板子計數 × index templates 列（唯一句子、緊鎖 anchor）。`_lessons-ledger.md`／`_archived-history/`／`.prospec/changes/` **不列入**。含 `REGISTRY_DOCS` ~130 lines
- [x] 建 `scripts/counts/sync.ts` + `scripts/sync-counts.ts` — `syncCounts`（吃 truth+skipped，per-doc apply/write、可注入 write）、`buildTruth`（inventory＋test 合併、算 skipped）；entry 解析 `--check`、spawn `vitest run --reporter=json` 取真相、`--check ∧ drift → exit 1`、印摘要 ~145 lines
- [x] 於 `package.json` `scripts` 加入 `"counts"` 與 `"counts:check"` ~2 lines
- [x] （條件）評估後**不需要** — anchor 夠緊、白名單 docs 內計數 token 無需 fenced 處理，故未匯出 `withoutFencedBlocks`，lib 零改動（related_modules 相應收斂為 tests）

## Tests

- [x] [P] `tests/unit/scripts/counts-rewrite.test.ts` — `applyCounts`：anchored-only 改寫、format 渲染、同行其他數字/散文不變、冪等；`renderCount`；`resolveOccurrences` skip（9 tests）~130 lines
- [x] [P] `tests/unit/scripts/counts-derive.test.ts` — `deriveTestCounts` bucket/total/files、非層檔入 total 不入 layer、Windows 路徑、空 report→null；`deriveInventory` 暫存目錄 fs-glob（5 tests）~90 lines
- [x] `tests/unit/scripts/counts-registry.test.ts` — 每個 anchor 恰一 capture group、歷史路徑免疫、REGISTRY_DOCS dedup、**每個 occurrence anchor 在真實 doc 命中 ≥1 行且捕獲數字**（39 dynamic cases）~55 lines
- [x] `tests/unit/scripts/counts-sync.test.ts` — 端到端（暫存 doc＋注入 truth）：寫入正確化、歷史行免疫、report 正確、冪等、缺檔不 throw、`--check` 不寫且回報、同步後 check 零漂移、honest skip 不觸及測試計數（8 tests）~140 lines
- [x] [V] mutation-verify：破壞 badge anchor → registry 完整性案例轉紅、還原後 39 全過（已實證，見實作記錄）

## Docs

- [x] 於 `README.md` + `README.zh-TW.md` Testing 段記錄 `pnpm counts`（寫回）與 `pnpm counts:check`（唯讀、CI、drift→exit 1）用法
- [x] [M] dogfood：`pnpm counts` 同步本變更自身計數（14 處：total 1865→1926、unit 1204→1265、files 78→82 across 4 檔），`pnpm counts:check` → exit 0

## Summary

- **Total Tasks:** 14（code 11、[M] 1、[V] 1、條件 1）
- **Parallelizable Tasks:** 2
- **Total Estimated Lines:** ~703 lines
