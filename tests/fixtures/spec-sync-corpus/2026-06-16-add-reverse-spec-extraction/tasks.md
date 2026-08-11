# Tasks: add-reverse-spec-extraction（BL-032 反向規格萃取）

> **Architecture C（純 Skill）**：本變更只動 `templates`（leaf）+ `tests`，無 Types / Lib / Services / CLI 程式變更，故無對應分層。
> **交付 gate**：OPT-A4 已實作完成，原「本輪只到 plan/delta-spec」的需求 gate 解除，進入 tasks/implement。
> **執行順序（TDD，Constitution P4）**：先寫 Tests 段 T7/T8 契約斷言成 RED，再實作 Templates 段 T1–T6 至 GREEN；T9 mutation-verify 收尾。
> **REQ-ID 畢業**：README narrative 不得引用本變更未畢業的 `REQ-TEMPLATES-104~107` / `REQ-TESTS-028`（archive 才畢業，提前引用會讓 drift `req-references` FAIL）。
> **Dry-run 回饋已套用**（2026-06-15，對 `olfparser/pptx_text_converter.py`）：>50% 分母只計 story-level intent（T3/T7/REQ-105，避免文件富模組誤中止＋contract false-green）、source→field 對照（T1/REQ-104）、AC-from-tests（T2）、角色可自產品名反推（T3/REQ-105）；REQ-107 未覆蓋偵測的 dogfood 驗證待 Phase 2a（olfparser onboard 後）。

## Templates

> 全部編輯同一檔 `src/templates/skills/prospec-design.hbs`（inline 變體，不新增 reference 檔），故彼此無 `[P]`。

- [x] T1 在 Extract Mode 的 mode-detect 增加 `input=code` 反向萃取分支，加入多源 triangulation 讀取指引與明確 source→field 對照（code+tests→behavior+AC、git `feat:`/`fix:` body→*So that*、docs/README→role/value/目標用戶、ai-knowledge→僅 module routing），含「單模組多行為依主題聚類成數個 US」啟發法（REQ-TEMPLATES-104）~50 lines
- [x] T2 新增 `reverse-draft.md` 輸出規格：route-compatible 的 `**Feature:**`/`**Story:**` + US/AC 候選結構，AC 優先自 test 名/斷言推為 WHEN/THEN；輸出僅落 `.prospec/changes/[name]/reverse-draft.md`（REQ-TEMPLATES-104）~30 lines
- [x] T3 新增 intent 護欄指令：story-level intent 欄位（*So that* 價值、目標角色等）推不出即標 `[NEEDS CLARIFICATION]`（含英→繁中翻譯落差從寬標記、禁止捏造）；目標角色可自 git/docs 產品/消費者名反推；`[NEEDS CLARIFICATION]` 比例 > 50% → 中止／建議 forward，分母只計 story-level intent（heuristic 校準 WHY 不計入、值以 behavior AC 記錄）（REQ-TEMPLATES-105）~35 lines
- [x] T4 新增信任區不變式 + 候選 slug 提議指令：永不直寫 `prospec/specs/features/`；候選 slug 以 `[NEEDS CLARIFICATION]` 待人確認且須過 `isSafeResourceName`（拒分隔符/`..`）；明示晉升＝人工轉 delta-spec → verify → archive（唯一寫入者）（REQ-TEMPLATES-106）~30 lines
- [x] T5 新增 WHAT-layer 未覆蓋 module 偵測啟發法：agent 讀 `prospec/specs/features/` + module 清單，列出 code 存在但 REQ 未覆蓋者；已覆蓋者不入列；輸出 informational、不阻擋、不自動觸發（REQ-TEMPLATES-107）~25 lines
- [x] T6 更新 Extract Mode 雙模式框架敘述，交叉引用 `input=code` 反向變體與既有 UI 設計工具萃取並存（MODIFIED REQ-DSGN-003，行為實質歸 sdd-workflow、此處僅交叉引用以守 PB-003）~15 lines

## Tests

> 編輯 `tests/contract/skill-format.test.ts`；沿用既有 section-scoped `sectionOf` helper；守 PB-001（section-scoped + structure-aware + mutation-verified）。

- [x] T7 新增 section-scoped 正向契約斷言，自 prospec-design 反向變體區段切片，釘住：`input=code` 變體、source→field 對照、AC-from-tests、`[NEEDS CLARIFICATION]`/>50% 護欄（含「分母只計 story-level intent」字樣）、永不寫信任區、route-compatible、未覆蓋偵測字樣（REQ-TESTS-028 AC1）~60 lines
- [x] T8 新增負向斷言：prospec-design Startup Loading 未因本變更新增 `[STABLE]` 項，且 `tests/fixtures/startup-loading-baseline.json` 不變（REQ-TESTS-028 AC2、REQ-TEMPLATES-104 AC3）~20 lines
- [x] T9 [V] mutation-verify：逐一移除被釘語意，確認對應斷言轉紅（REQ-TESTS-028 AC3）~10 lines

## Docs / Knowledge

- [x] T10 [P] bump `templates` + `tests` module README narrative 描述反向萃取變體，並校準變動計數（test 數上升；`.hbs` 檔數不變——inline 無新檔）（PB-005）。**注意**：不得引用未畢業的 `REQ-TEMPLATES-104~107`/`REQ-TESTS-028`，待 archive 畢業後再補 ~25 lines
- [x] T11 [P] 更新 root `README.md` `/prospec-design` 條目（line 250 的 Generate/Extract modes 敘述）標註 `input=code` 反向 spec 變體（Constitution P5 [SHOULD]，advisory）~10 lines

## Deploy & Verify

- [x] T12 [M] 執行 `prospec agent sync`，將 prospec-design.hbs 重新部署至 `.claude/skills/`（與其他 agent 目錄）~5 lines
- [x] T13 [V] 執行 `pnpm test`（含 contract `skill-format`）確認新斷言 GREEN、全測試套件通過、baseline 不變 ~5 lines

## Summary

- **Total Tasks:** 13（code 10｜`[M]` 1｜`[V]` 2）
- **Parallelizable Tasks:** 2（T10、T11）
- **Total Estimated Lines:** ~320 lines
