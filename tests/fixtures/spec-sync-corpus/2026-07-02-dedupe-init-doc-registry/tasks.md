# Tasks: dedupe-init-doc-registry

> quick scale——行為逐位元不變，由既有契約測試證明；新斷言依 PB-001 mutation-verify。

## Types

- [x] T1 conventions.ts：`USER_MANAGED_CONVENTION_DOCS` 升級為 `{template, output}` 對（沿用 `CanonicalDoc` 形狀）；`ALL_INITIAL_CONVENTION_DOCS` 與 `INIT_DOC_REGISTRY` 改由其推導；`InitDoc` 增 `context?: 'index'` 並標注 index 項 ~30 lines

## Services

- [x] T2 init.service：index context 選擇改 key off `doc.context`（移除範本路徑字串比對） ~5 lines

## Tests

- [x] T3 unit conventions.test：形狀測試隨新結構調整；新增推導綁定斷言（每個 user-managed 對都以 knowledge root 出現在 registry）＋context 唯一性斷言 ~25 lines
- [x] T4 contract init-doc-registry.test：context 選擇改 key off 欄位；index 渲染結果加 context 衍生標記斷言（knowledge base 路徑） ~15 lines
- [x] T5 [V] 行為不變驗證：全套 `pnpm test` 綠（1821，+3 新斷言）；grep 比對式 `=== 'knowledge/index.md.hbs'` 於 src/+tests/ 為零（proposal Independent Test 措辭已同步精確化——直接渲染參數與 mock 條件非 F3 範疇）；mutation-verify 綁定斷言（registry 側 slice 突變 → 2 測試紅、還原後綠） ~5 lines

## Docs

- [x] T6 feature-map.yaml：`project-setup.modules` 補 `cli`（人工策展，僅插一行） ~2 lines
- [x] T7 [V] `prospec check` 8/8 pass（feature-modules 與 knowledge-health 維持綠；task-completion 於 T6 勾選後轉綠） ~2 lines

## Summary

- **Total Tasks:** 7
- **Parallelizable Tasks:** 0
- **Total Estimated Lines:** ~84 lines
