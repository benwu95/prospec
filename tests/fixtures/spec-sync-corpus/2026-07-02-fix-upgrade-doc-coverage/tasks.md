# Tasks: fix-upgrade-doc-coverage

> RED → GREEN：每個 feat 任務由對應測試任務先行或同 commit（Constitution TDD）。

## Types

- [x] T1 conventions.ts 新增 `INIT_DOC_REGISTRY`（7 份 curated 文件：base_dir 相對路徑 + 範本名；排除 AGENTS.md 與 specs/.gitkeep） ~35 lines

## Services

- [x] T2 init.service curated 文件清單改由 `INIT_DOC_REGISTRY` 推導（per-file skip-if-exists 與寫入順序不變） ~30 lines
- [x] T3 upgrade.service 新增 `buildDocsInventory()`（registry × resolveBasePaths × existsSync），`UpgradeReport` 增 `docs` 欄位；不新增任何寫入 ~35 lines

## CLI

- [x] T4 upgrade-output.ts 新增 docs inventory 區段（固定可解析行格式：逐檔 present/missing；missing > 0 時提示 `/prospec-upgrade`） ~30 lines

## Templates

- [x] T5 prospec-upgrade.hbs Step 2 改寫：消費 report inventory（present → diff＋逐檔同意；missing → 同意後自範本建立）、保留 legacy `_index.md` 遷移與範本不可得 graceful skip、report 無 docs 區段 → 停止並提示重跑 `prospec upgrade` ~60 lines

## Tests

- [x] T6 [P] unit：`INIT_DOC_REGISTRY` 形狀測試（恰 7 項、路徑與範本名非空、純資料） ~30 lines
- [x] T7 contract：等式測試——memfs 跑 `init.execute` 後實際建立的 curated 文件集合 == registry 推導集合（雙向集合比較；registry 範本名皆可 `renderTemplate()` 渲染） ~60 lines
  - 註：等式（雙向）落在 unit 層 `init.service.test.ts`（沿用既有 memfs＋mock 佈局）；「範本可渲染」落在 contract 層新檔 `init-doc-registry.test.ts`（真 renderTemplate）。REQ-TESTS-036 三條 AC 全數覆蓋，僅檔案配置與任務原文不同
- [x] T8 [V] mutation-verify：自 registry 暫移除任一項，T7 須轉紅 ~10 lines
  - 註：雙向皆驗——registry 缺項 → 形狀測試紅；init 私加 ROGUE.md → 等式測試紅；還原後全綠
- [x] T9 [P] unit：upgrade.service inventory——缺 `_glossary.md` fixture → marked missing、全存在 → 全 present；既有「CURATED doc byte 不變」斷言維持綠 ~50 lines
- [x] T10 [P] unit：upgrade-output docs 區段格式（present/missing 行、missing 提示、quiet 模式） ~30 lines
- [x] T11 contract：skill-format prospec-upgrade section-scoped 斷言更新——驗證 Step 2 消費 inventory、負向斷言無寫死文件清單、版本錯位 fallback 存在 ~40 lines
- [x] T12 [V] mutation-verify：反轉 T11 新斷言目標（如在範本塞回寫死清單），測試須轉紅 ~10 lines
  - 註：首輪發現 false-green（fallback 句也含 `Docs inventory:`），已強化為釘住指令句；兩向 mutation 皆紅後還原全綠
- [x] T13 integration：upgrade-flow 增 docs inventory 端到端斷言（缺檔 fixture → report 標記 missing） ~30 lines
- [x] T14 e2e：cli.test.ts upgrade report 輸出含 docs 區段（行格式鎖定） ~25 lines

## Docs

- [x] T15 更新根層級 README.md：upgrade CLI report 描述、`/prospec-upgrade` skill 段落、指令表 ~20 lines
  - 註：依 PB-004 同步 README.zh-TW.md 同段落，並重新推導測試計數（1748 → 1817，含 badge 與 4 層分項；unit 1189／contract 568／integration 17／e2e 43）
- [x] T16 [M] 執行 `prospec agent sync` 重新部署 skill 鏡像 ~5 lines
- [x] T17 [V] 全套測試 `pnpm test` 綠燈、coverage ≥ 80% ~5 lines
  - 註：76 檔 1817 tests 全綠；coverage all-files 96.56%

## Summary

- **Total Tasks:** 17
- **Parallelizable Tasks:** 3
- **Total Estimated Lines:** ~505 lines
