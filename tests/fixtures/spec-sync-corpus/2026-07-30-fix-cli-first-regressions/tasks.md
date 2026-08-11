# Tasks: fix-cli-first-regressions

**Input**: Design documents from `.prospec/changes/fix-cli-first-regressions/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

> 三條修復線各自獨立 commit：US-1（T1-T8）、US-2（T9-T13）、US-3（T14-T18）、收尾（T19-T22）。
> 每條線先寫紅燈測試再實作（TDD）。

---

## Services（US-1：spec-sync 非破壞性合併）

- [x] T1 紅燈測試：`archive.service` spec-sync fixture——MODIFIED 缺 `**Spec:**` 時既有 body 必須保留、ADDED 帶 Description/AC 必須落 body（現況全紅）~180 lines
- [x] T2 紅燈測試：body 邊界三案例（REQ 為最後一個 h4 緊接 h2、緊接 `---`、位於檔尾）＋body 含 `$&` 逐字落地 ~120 lines
- [x] T3 `FeatureRoute` 增 `specBody` / `descriptionBody` 欄位；`extractFeatureRoutes` 擷取 h3 以下 body 並解析 `**Spec:**`、`**Description:**`、`**Acceptance Criteria:**` 三區塊 ~120 lines
- [x] T4 `mergeRequirementInPlace` 改為非破壞性：有 Spec 落地全文、MODIFIED 缺 Spec 只換標題行保留 body、ADDED 落 Description＋AC bullets（function replacer 逐字） ~120 lines
- [x] T5 `ArchiveResult` 增 `pendingConvergence: Array<{ feature, reqId, reason }>`，`syncToFeatureSpecs` 回傳並於 dryRun 下同樣產出（不落盤） ~80 lines

## CLI（US-1）

- [x] T6 `formatters/archive-output.ts` 印出 pendingConvergence 清單（`sanitizeTerminal()`、dry-run 同樣列出）＋formatter 單元測試 ~90 lines

## Templates（US-1，每項改完跑 `pnpm bundle`）

- [x] T7 `references/delta-spec-format.hbs`：定義 `**Spec:**` 落地區塊（MODIFIED 必附、ADDED 選附、語言隨目標 Feature Spec、缺少時保留舊 body 並回報）＋`tests/contract/skill-format.test.ts` section-scoped 斷言 ~110 lines
- [x] T8 `skills/prospec-archive.hbs`：graduation 階段以 `pendingConvergence` 為收斂工作清單；`references/archive-format.hbs` 同步一句說明＋contract 斷言 ~80 lines

## Scripts（US-2：counts 單一真相來源，repo-internal）

- [x] T9 紅燈測試：`index.md` auto block 表格 == `collectAllModules` + `buildIndexTable` 重建結果（現況 2,775 vs 2,773 應紅） ~80 lines
- [x] T10 紅燈測試：module-map 跨行 description 的計數可定位改寫，且除數字外位元不變（no reflow） ~90 lines
- [x] T11 `scripts/counts/types.ts` 的 `CountOccurrence` 增 YAML 欄位級目標描述（module + field） ~30 lines
- [x] T12 新增 `scripts/counts/yaml-field.ts`：以 `parseYamlDocument` 定位 scalar node range、建 logical↔raw offset map、只改寫數字 span ~140 lines
- [x] T13 `COUNT_REGISTRY` 為 tests.* 與 templates.hbs.* 補 module-map occurrence；`syncCounts` 依 doc 型別分流改寫器 ~90 lines

## Services / CLI（US-3：移除孤兒 knowledge generate 引擎）

- [x] T14 [V] 逐一 grep 確認 `knowledge/module-readme.hbs`、`index.md.hbs`、`deriveKeyExports`、`buildIndexTemplateContext` 在刪檔後仍有 consumer（有孤兒則於本任務記錄處置） ~10 lines
- [x] T15 刪除 `src/services/knowledge.service.ts`、`src/cli/formatters/knowledge-output.ts` 及 `tests/unit/services/knowledge.service.test.ts`、`tests/unit/cli/knowledge-output.test.ts` ~10 lines
- [x] T16 更新 `tests/contract/knowledge-format.test.ts` 的檔案清單（移除 knowledge.service 條目） ~20 lines
- [x] T17 更新 `prospec/ai-knowledge/modules/services/README.md`、`modules/templates/README.md`：刪 knowledge.service 敘述、改指真正宿主（英文） ~30 lines
- [x] T18 更新 `prospec/index.md` services 列 description（移除 "knowledge generate +"）＋`module-map.yaml` 同欄位同步（來源與生成檔一起改） ~20 lines

## Tests（跨線回歸與 debt ledger）

- [x] T19 新增 debt-ledger 測試：`prospec/specs/features/**` 的 body-less REQ 集合「正好等於」12 個具名 legacy 清單（雙向紅燈） ~90 lines
- [x] T20 [V] mutation-verify 新增的 contract／guard 斷言（刪掉關鍵句或改一個數字即紅） ~15 lines

## Docs & 收尾

- [x] T21 `planning/backlog.md` 移除 BUG-002/003/004 三列（凍結文件不再承載待辦） ~10 lines
- [x] T22 [M] `pnpm bundle` → `pnpm typecheck` → `pnpm lint` → `pnpm test` → `pnpm counts` → `npx tsx src/cli/index.ts check` 全綠確認 ~5 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 22 |
| Code tasks | 19 |
| `[M]`/`[V]` tasks | 3 (T14, T20, T22) |
| Estimated lines | ~1,590 lines |

---

## Notes

- README.md／README.zh-TW.md 不需改：`prospec knowledge generate` 早於 issue #107 從 README 移除（T22 一併複查）
- 12 個 legacy body-less REQ 本輪不補寫（使用者裁決 2026-07-30）；debt ledger 清單即 follow-up 依據
- T18 同時改 `index.md` 與 `module-map.yaml`，正是 US-2 guard test 要求的「來源與生成檔同步」

### 實作期偏離記錄（documented deviations）

- **T8 未改 `references/archive-format.hbs`**：該 reference 全篇是 summary.md 格式，完全沒有 spec-sync 段落，加一句會離題。落地位置改為 `prospec-archive.hbs`（Phase 3.5 步驟 0＋Gate）與 `delta-spec-format.hbs`。delta-spec 的 REQ-TEMPLATES-166 本來就只要求這兩處，未偏離 spec。
- **T14 發現的連帶孤兒**：刪 `knowledge.service.ts` 後，`lib/content-merger.mergeContent()` 失去 src consumer（`hasAutoBlock`／`replaceAutoBlock`／`mergeManagedDoc` 仍在用）。**保留**：`_conventions.md` 的 Content Regeneration Pattern 明文以它為正式作法、REQ-KNOW-004/008 亦以 ContentMerger 描述行為；刪它要動信任區文件與 REQ，超出本 bug 範圍。列為 follow-up 觀察項。
- **archive skill 的 reference 連結改軟指向**：`prospec-archive` 的 reference map 不含 delta-spec-format，硬連結會讓 `[D] dangling` 契約測試轉紅（實測）。改為文字指向「`/prospec-plan` 讀的 delta-spec-format reference」，不重複部署共用 reference。
- **`index.md`／`module-map.yaml` 的 cli formatter 計數 28 → 26**：刪掉 `knowledge-output.ts` 只減 1；原本的 28 是「formatters/ 目錄檔數」（含 `sanitize.ts`），與模組 README 的「26 個 `formatXxxOutput` 模組」定義不一致。統一採 README 定義，兩處同步改為 26。
