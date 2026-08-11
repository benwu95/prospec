# Tasks: preserve-agent-config-edits

**Input**: `.prospec/changes/preserve-agent-config-edits/` 的 plan.md + delta-spec.md
**Prerequisites**: plan.md, delta-spec.md（scale: full）

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**：同層內彼此獨立、可平行（不同檔、無相互依賴）
- **[M] / [V]**：任務種類——manual / verification；未標記＝code（定義凍結於 tasks-format reference）
- **~N lines**：估計變更行數

---

## Lib

- [x] T1 在 `src/lib/content-merger.ts` 新增 `mergeManagedDoc(generated, existing)` 純函式：三路徑（有 auto 標記→non-greedy regex + function-replacer 就地取代 auto；無標記有內容→既有內容注入 generated 的 user 區塊；空→原樣回傳），重用 `AUTO_START/AUTO_END/USER_START/USER_END` 常數 ~55 lines `(REQ-LIB-014)`

## Templates

- [x] T2 [P] `src/templates/agent-configs/entry.md.hbs`：全部 prospec 內容包進 `auto-start/end`，其後附含 placeholder 的空 `user-start/end` 區塊 ~10 lines `(REQ-TEMPLATES-104)`
- [x] T3 [P] `src/templates/init/agents.md.hbs`：同樣包入 auto 區塊 + 附空 user 區塊 ~8 lines `(REQ-TEMPLATES-104)`

## Services

- [x] T4 [P] `src/services/agent-sync.service.ts` `generateEntryConfig`：render → 讀既有目標檔（`fs.readFile` + try/catch→`''`）→ `mergeManagedDoc` → `atomicWrite`；回傳值不變 ~20 lines `(REQ-AGNT-023, REQ-AGNT-008)`
- [x] T5 [P] `src/services/init.service.ts` 寫入迴圈：`AGENTS.md` 特例化為 read→merge→write 並列入 `createdFiles`；trust-zone / canonical 檔維持 `if (!fileExists) atomicWrite` ~25 lines `(REQ-SETUP-018)`

## Tests

- [x] T6 [P] `tests/unit/lib/content-merger.test.ts`：`mergeManagedDoc` 三路徑 + marker 邊界（user 區塊含 marker 字面字串不誤判）+ `$&`/`$$` 安全 + round-trip 兩次 byte-identical ~90 lines `(REQ-LIB-014)`
- [x] T7 [P] `tests/unit/services/agent-sync.service.test.ts`：brownfield（無標記）遷入 user、有標記只換 auto、兩次 sync byte-identical、shared-standard dedup 不退化（REQ-AGNT-017） ~70 lines `(REQ-AGNT-023, REQ-AGNT-008)`
- [x] T8 [P] `tests/unit/services/init.service.test.ts`：既有 `AGENTS.md` 內容入 user、缺檔則 auto=stub/user 空、trust-zone byte 不變（REQ-SETUP-018 既有 scenarios 續綠）、init→agentSync user 區塊保留 ~70 lines `(REQ-SETUP-018)`
- [x] T9 對齊受影響的既有測試斷言（`init-output` / `agent-sync.service` / 任何斷言 entry config 開頭或無 marker 的 contract/integration 測試） ~30 lines
- [x] T10 [V] 全綠把關：`pnpm test` + `pnpm typecheck` + `pnpm lint`，覆蓋率 ≥ 80% ~5 lines

## Docs

- [x] T11 [P] 評估並（若需要）更新 root `README.md` 對 `init`/`agent sync` 區塊保留行為的描述（解 story/plan 階段 README WARN） ~15 lines

---

## Summary

- **Total Tasks:** 11
- **Parallelizable Tasks:** 8
- **Total Estimated Lines:** ~398 lines

---

## Notes

- 架構層序 `lib → templates → services → tests → docs`；TDD：T6 與 T1 同寫（RED→GREEN），T7/T8 伴隨 T4/T5。
- 模組測試覆蓋：lib→T6、services(agent-sync)→T7、services(init)→T8；templates 無邏輯，透過 T7/T8 斷言其渲染的區塊結構驗證（沿用「模板經消費者測試」慣例）。
- `mergeContent` 不修改（knowledge 流程語意保留），`mergeManagedDoc` 獨立並存。
