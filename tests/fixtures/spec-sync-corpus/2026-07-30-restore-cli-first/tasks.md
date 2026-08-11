# Tasks: restore-cli-first

**Input**: Design documents from `.prospec/changes/restore-cli-first/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

---

## Types

- [x] T1 新指令 Result 介面＋輸入 Zod shapes＋`MINIMUM_CLI_VERSION` 常數＋`NewQualityLogEntry` strict 型別（含單元測試）~120 lines
- [x] T2 [P] 錯誤子類 `CliVersionError`／`InvalidTransitionError`（code＋suggestion，含單元測試）~40 lines

## Lib（純引擎，I/O-free，TDD）

- [x] T3 [P] `verify-grade.ts`：S/A/B/C/D 決策表、WARN 預算無豁免類（含決定論單元測試：固定輸入重跑位元一致）~180 lines
- [x] T4 [P] `review-merge.ts`：findings 合併（Location 去重、severity max、跨輪保留；對現存 review.md 欄位相容）~180 lines
- [x] T5 [P] `lessons-ledger.ts`：parse/upsert/score（決定論 key、frequency 遞增、audit 字串；以 promotion-format 為契約、對現存 `_lessons-ledger.md` round-trip 測試）~220 lines
- [x] T6 [P] `artifact-validators.ts`：backfill-draft／promote-scaffold／design-spec／slug 檢查（章節、route-compatible 標頭、NC 計數與位置、`isSafeResourceName`、feature-map 集合差、信任區防護；比率豁免分類與元件萃取不進 lib）~250 lines
- [x] T7 [P] `change-metadata.ts` 補 `appendQualityLog(doc, entry)` helper（含單元測試）~60 lines

## Services ＋ CLI（每項含 service＋command＋formatter＋單元測試）

- [x] T8 `change log` 指令：結構化 quality_log 附加 ~150 lines
- [x] T9 `change status <to>` 指令：forward-only 轉換、違規列合法轉換清單 ~120 lines
- [x] T10 `change progress [--complete <n>]` 指令：勾選＋code-task X/Y＋next task ~150 lines
- [x] T11 `knowledge update` 縮限佈線（先改 service：updateModuleReadme 僅限 README 不存在時建 skeleton、coordinator 對 MODIFIED 跳過 README，unit test pin 既有檔位元不變；再佈線 `--change` 經 change-resolver）＋移除 deprecated `knowledge generate` ~180 lines
- [x] T12 `agent triggers --write`：snapshot→最小就地編輯→回讀驗證→失敗還原 ~140 lines
- [x] T13 `review merge --findings <json>` 指令（合併鍵＝LLM 提供的 finding identity／supersedes）~140 lines
- [x] T14 `verify record` 指令：machine 維度自讀 prospec-report.json＋test_provenance、僅收 judgment 裁決；評分＋dimensions 序列化＋S/A 原子前進 verified ~180 lines
- [x] T15 `learn upsert --lesson <json>` 指令 ~140 lines
- [x] T16 `validate <kind> [path]` 指令（slug/promote 完整判定；backfill/design 結構子集回報）~140 lines
- [x] T17 `archive finalize <name>` 後置子指令：`_archived-history` 複製＋frontmatter 計數對帳（支援 dry-run、scaffold 未覆寫時拒絕）；模組推導唯讀輸出（既有 result.affectedModules）~180 lines

## Templates（每項改完跑 `pnpm bundle`）

- [x] T18 新 partial `_cli-probe.hbs`（探針＋版本下限＋STOP 語義單一來源）＋`entry.md.hbs` 刪 Session Start fallback ~80 lines
- [x] T19 工作流 skill 委派改寫：new-story／plan／tasks／ff／implement（scaffold/status/log/progress 全改指令呼叫，刪手寫 metadata 指示）~300 lines
- [x] T20 知識與設定 skill 改寫：knowledge-update Phase 3 機械部分 → `knowledge update`（README 內容更新明文留 skill）；knowledge-generate 刪解析階梯；quickstart／upgrade 探針改共用 partial＋triggers 寫回改 `--write` ~250 lines
- [x] T21 站點引擎 skill 改寫：review → `review merge`（identity 由 skill 提供）、verify → `verify record`（刪手算決策表與三形態豁免敘述）、learn → `learn upsert` ~300 lines
- [x] T22 [P] design／backfill／promote skill 改寫：結構檢查改 `validate`（比率豁免分類與元件萃取明文留 skill）、promote 刪手寫 metadata 段 ~150 lines
- [x] T23 archive skill 改寫（刪手動 fallback 與解析階梯、殘餘手動項改 `archive finalize` 且固定排在 Phase 3.5 之後）＋`references/metadata-format.hbs` 改「CLI 寫入、skill 讀取」視角 ~150 lines

## Tests（跨層契約與端到端）

- [x] T24 contract 更新：skill-format（探針單一來源、委派措辭 pin、「無 fallback 措辭」負向斷言）、loading baseline、bundled-templates-sync ~300 lines
- [x] T25 e2e：每個新指令的成功與失敗路徑（forward-only 拒絕、驗證失敗還原、dry-run planned）~250 lines
- [x] T26 [M] `pnpm bundle` → `npx tsx src/cli/index.ts agent sync` → `pnpm counts` → `pnpm test` 全綠確認 ~5 lines
- [x] T27 [V] mutation-verify 新增 contract 斷言；新引擎固定輸入重跑位元一致抽查 ~10 lines

## Docs

- [x] T28 README.md＋README.zh-TW.md：cli-first 定位改寫、新指令清單、刪「Skills now create ... directly」（雙語同步）~200 lines
- [x] T29 [P] `planning/backlog.md` 職責矩陣反轉＋標記 #107 對應項 ~40 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 29 |
| Parallelizable | 9 |
| Estimated lines | ~4,415 lines |

---

## Notes

- [P] = different files, no dependencies, can run in parallel
- [M]/[V] mark manual/verification tasks; unmarked tasks are code (see tasks-format reference)
- 依層序執行並分層 atomic commits：Types → Lib → Services/CLI → Templates → Tests → Docs；每層完成即驗證（`pnpm vitest run tests/{unit|contract}/`）
- 任務數 29（>25 指引）與總量 ~4.3k 行是使用者裁決「一次全做」的直接結果；已依 plan Risk 表以分層 commit 與分輪 review 緩解
- ~N lines are estimates; actual numbers may vary with requirements

## Deviations

- T2：`CliVersionError` 不實作——探針比較發生在 skill 模板內（`prospec --version` 對 `{{minimum_cli_version}}`），CLI runtime 無任何 thrower；依 PB-003（claim ⊆ implementation）不做死碼。`InvalidTransitionError` 照做（thrower＝`change status`）。
- **計畫外新增（實作期發現的缺口，REQ-CLI-025 家族，delta-spec 應於 review/graduation 補記）**：(1) `prospec change scale <scale>`——scale 確認發生在 scaffold 之後，原指令集無寫入面；(2) `prospec change story --related-module <m>...`——promote-backfill 的 related_modules 來自 traced code 而非名稱關鍵字，無此旗標則殘留手寫 metadata；(3) `prospec change story --introduced-by <c>`——escaped-defect 註冊原是唯一剩餘的手寫欄位。
- T16 範圍註記（verify 輪後更新）：`coverageGap`（feature-map 集合差）最初只實作於 lib 未接 CLI；verify 2/5 指出這與 REQ-CLI-031 AC2 的宣稱不符，已於 `validate backfill-draft` 接上並以 INFO 回報未被 Feature Spec 覆蓋的 feature（缺檔安靜降級、格式壞掉以 INFO 揭露）。
- 版本地板定案（使用者裁決 2026-07-30）：`MINIMUM_CLI_VERSION = 1.0.0`——下一版直接跳 1.0.0 以明顯區隔「CLI 必裝」的破壞性變更；`package.json` 的 bump 留給發版流程（尚有其他 issue 待修）。地板刻意先行於套件版本：低於 1.0.0 的地板會讓不含這些指令的舊 binary 通過探針。
- T24 契約測試改釘由 subagent 執行：skill-format 603 綠、新增「CLI-first contract」describe（探針單一來源、`{{minimum_cli_version}}` sentinel 注入、四禁語 repo-wide 負向斷言），負向斷言 mutation-verified（兩次注入變紅後還原）。
