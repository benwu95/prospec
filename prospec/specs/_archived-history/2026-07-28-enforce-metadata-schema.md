# enforce-metadata-schema — Archive Summary

- **Archived**: 2026-07-28
- **Original Created**: 2026-07-28
- **Quality Grade**: A
- **Commit**: `9f267e0`

## User Story

作為使用 prospec SDD 流程的開發者，
我要 metadata.yaml 的結構錯誤在讀取當下就被指名回報、寫入點也保證產出合法，
以便失效不再被延後到下游站點靜默誤讀，且驗證只把關、不改寫我的檔案。

（US-1 讀取點攔截、US-2 寫入點保證、US-3 不破壞 lossless，皆 P1）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `MetadataValidationError`；`related_modules` 收緊為 bare name；`DIMENSION_RESULTS` 納入 `not-applicable`；schema 全層 loose + 嚴格建構視圖 `NewChangeMetadataSchema` |
| lib | High | 新增 `change-metadata.ts`——metadata.yaml 的唯一驗證讀寫入口；`stripCellEmphasis` 抽為 index.md Module 欄的單一剝除來源 |
| services | High | change-story／change-plan／change-tasks／`check --record-review` 四站遷移；`matchRelatedModules` 修正；archive 刻意維持寬鬆 |
| templates | Low | `prospec-verify.hbs` 與 `metadata-format` reference 對齊 dimension 四值詞彙 |
| tests | Medium | 驗證失敗、lossless 回歸、真實形狀契約、整合流程、渲染層 contract |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-064 | ADDED | Metadata 驗證錯誤型別、bare module name 約束、dimension 詞彙與 loose/strict 雙視圖 |
| REQ-LIB-031 | ADDED | metadata.yaml 讀寫的單一驗證入口 |
| REQ-SERVICES-067 | ADDED | 四處無檢查 cast 的讀寫點遷移至共用 helper |
| REQ-TESTS-055 | ADDED | 契約的驗證、lossless 與真實形狀回歸測試 |
| REQ-CHNG-003 | MODIFIED | Auto-Identify Related Modules——改用共用 `stripCellEmphasis` 取得 bare 模組名 |

## Completion

- **Tasks**: 15/15 code tasks（100%）；另有 `[M]`×1、`[V]`×4 全數完成
- **Acceptance Criteria**: 25/26 條達成（1 條為斷言強度未達字面，見下）

> 註：`tasks.md` 的 Summary 表記為「Code 14 / [V] 5」，是 tasks 階段寫下後未隨 T11 縮小範圍回改的筆誤；實算為 Code 15 / [V] 4。依歸檔不修改產物的規則保留原文，此處記錄實算值。

## Review & Verify

- **Review**: 5 round(s)，1 critical / 9 major — 全數修畢，最終 round review-clean。critical 為 `REQ-TESTS-055` Description 記載了不存在的測試（規範性語句與 shipped test 相斥，經獨立驗證者 `[confirmed]`）。**9 個 major 中有 5 個是修正過程自身引入**：偏離記錄算術不成立、孤兒 JSDoc、`.loose()` 反噬 tsc excess-property 檢查、`.loose()` 僅及頂層、`satisfies` 前的 spread 落差。
- **Verify**: Grade A —— 1/5 PASS、2/5 WARN、3/5 PASS、4/5 WARN、5/5 PASS、6 not-applicable；`pnpm test` 96 files / 2,247 tests 全綠，覆蓋率 95.8%（`change-metadata.ts` 100%）；`prospec check` 11/11 PASS。
- **Quality Log**: 2 筆 review WARN（早期輪次未解 majors，最終輪 PASS 歸零）+ verify 的 2 筆 WARN —— (a) 2/5：`REQ-TESTS-055` AC1 只有 `status` 測試同時斷言 change 名稱與欄位路徑，另兩者僅斷言路徑；(b) 4/5：既有漂移，lib README 宣告「(21 files)」而變更前實為 23（已於 commit 前的知識同步一併更正為 24）。

## Knowledge Update

已於 verify S/A commit prompt 完成並折入同一個 commit：

- `prospec/ai-knowledge/modules/{types,lib,services,tests}/README.md`
- `prospec/ai-knowledge/module-map.yaml`（lib 新增 `change-metadata` routing keyword）+ `prospec/index.md`

同步時撞到 L2 token 預算天花板——三個 README 變更前即為 991/998/995（上限 1000）。依慣例把 Key Files 收斂回「top ~10」並壓縮冗述後回到預算內（types 983、lib 1000、services 996、tests 995）。**lib 已達容量上限，下次成長應依慣例抽出 drift engine 為 sub-module，而非再行刪減。**

## Follow-ups

- `_module-readme-conventions.md` 將 `## Ripple Effects` 標為選填（⬜），但 `tests/contract/knowledge-format.test.ts:88` 強制要求其存在——慣例與契約測試不一致，不屬本變更範圍。
- `.prospec/archive/` 內 14 筆歷史 metadata 不符收緊後的 schema（grade 寫進 `result` 9、`warnings` 為字串 2、缺 `name`/`created_at` 1、`related_modules` 帶強調 4）。producer 皆已修正、資料不在驗證路徑上、且為 gitignored 本機狀態，故本變更未動。
- 模組原始檔數不在 `pnpm counts` 白名單內，是手維護數字（4/5 那個既有漂移的根因）。
