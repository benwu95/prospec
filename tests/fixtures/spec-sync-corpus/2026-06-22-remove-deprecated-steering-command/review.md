# Review: remove-deprecated-steering-command

**Rounds:** 1 / cap 3   **Status:** review-clean

> 對抗式審查：4 個獨立 fresh-context lens（correctness/deletion-completeness、spec-architecture、PB-004 count-completeness、security/ripple，Mode A 平行）對工作目錄 diff（42 檔、+135/−1411）審查並各自 re-derive 事實。**0 critical**、4 major（3 已修、1 by-design）。

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| README.md:642 | major | pb004-counts | **fixed** — services 計數 13→14（re-derived 真值） |
| README.zh-TW.md:615 | major | pb004-counts | **fixed** — services 計數 13→14 |
| prospec/ai-knowledge/module-map.yaml:69 | major | pb004-counts | **fixed** — services 計數 12→14 |
| prospec/specs/features/project-setup.md (Deprecated Requirements) | major | spec-architecture | **resolved-by-design** — 見下 |

## 已修（3 × services 計數）

審查獨立 re-derive `grep -l "export async function execute" src/services/*.ts | wc -l` = **14**。
本變更我誤用 **−1 delta** 套在「既有就已錯」的副本上，把錯誤往下傳（PB-004 正是此教訓：應 re-derive，勿 delta）：

| 副本 | 變更前(已錯) | 我誤改成 | 真值(已修) |
|---|---|---|---|
| `_index.md` services 列 | 15（對：含 steering）| 14 | **14 ✓**（−1 剛好命中真值）|
| `README.md` / `README.zh-TW.md` 結構樹 | 14（錯，應 15）| 13（仍錯）| **14**（已修）|
| `module-map.yaml` 描述 | 13（錯，應 15）| 12（更錯）| **14**（已修）|

修正後四份 services 計數一致＝14，順帶消解了 implement 階段交付審查的 pre-existing 不一致。

## resolved-by-design（Deprecated Requirements 留 `_(None)_`）

審查指出 project-setup.md 的 `## Deprecated Requirements` 仍是 `_(None)_`、未列退役的 REQ-SETUP-008/009/010。
**這是刻意的正確中間狀態**：`archive.service.ts:832` 專門比對 `## Deprecated Requirements\n\n_(None)_` 並以
delta-spec 的 REMOVED routes 取代填入（archive 是 feature spec 的 sole writer）。project-setup.md 正好保有該
marker，archive 會在歸檔時乾淨填入三條退役記錄並補 Change History row。**現在手動填入會**：(a) 與 archive 在歸檔時
再次 append 造成重複；(b) 搶寫 sole-writer。故維持 `_(None)_`。
- 觀察（非本變更缺陷、不修）：archive 的退役格式為 `- **REQ**: desc _(removed date)_`（bullet），與少數既有 spec 的
  手寫 `#### ~~REQ~~ **Removed**/**Reason**` 富格式不一致——屬 archive 工具格式議題，可另開 backlog。

## 其他 lens 結論

- correctness/deletion-completeness：0 finding——無懸空 import/引用，module-readme.hbs 搬移與 24 路徑字串全同步。
- security/ripple：0 finding——`config.paths` 僅 base_dir 被讀、模板路徑解析無 stale、無 secrets/unsafe write。
- spec-architecture（除上述）：依賴方向不破、project-setup headings 與 frontmatter（27 REQ/11 US）一致、
  REQ-MCP-006/REQ-SERVICES-025 in-place 與程式碼一致、delta-spec 正確限定 REMOVED。
