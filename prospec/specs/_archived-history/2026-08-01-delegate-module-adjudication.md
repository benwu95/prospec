# delegate-module-adjudication — Archive Summary

- **Archived**: 2026-08-01
- **Original Created**: 2026-08-01T02:55:14.778Z
- **Quality Grade**: A

## User Story

As a 在 docs-as-code／manifest 型專案上第一次 bootstrap 的開發者，以及執行 `/prospec-knowledge-generate` 的 AI agent，
I want raw-scan.md 據實揭露不含原始碼的目錄，且 skill 被明確授權依該證據增刪 `module-map.yaml`，
So that module 邊界的裁決權回到看得懂專案的那一層，偵測器降格為便宜初稿。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `module-detector`：匯出 `isSourceFile`、新增 `collectNonSourceDirectories`（volume-ranked、caps 夾值、預渲染 code span）、移除 `MODULE_INDICATORS` 繞過、統一 trailing-dot 判準；`markdown-fences` 新增 emitter 方向 `toInlineCodeSpan` |
| services | Medium | `raw-scan.service`：注入揭露區塊，並把 entry point／dependency 名／config 路徑三處 code span 插入改走同一 guard |
| templates | Medium | `raw-scan.md.hbs` 新增 `## Directories Without Source Files`；`prospec-knowledge-generate.hbs` Step 3 新增無條件的 module-map 裁決授權 |
| tests | Medium | +519 行；unit（聚合／巢狀／兩層上限／排序鑑別／終端副檔名／trailing-dot／architecture 窄化）、contract（區塊格式、順序無關性、跳脫、skill 授權）、service（接線與跳脫） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-KNOW-038 | ADDED | raw-scan.md 揭露無原始碼目錄：volume 排序、caps 據實揭露、兩半判準與兩條例外路徑、每處 code span 經 `toInlineCodeSpan` |
| REQ-TEMPLATES-170 | ADDED | knowledge-generate 得增刪 module-map 條目（提案→確認→回寫），不以無從判定的 provenance 為條件 |
| REQ-LIB-038 | MODIFIED | 門檻一律 ≥2 個原始碼檔、無名稱豁免；`isSourceFile` 匯出為單一分類真相；拒絕清單只比對終端副檔名 |
| REQ-KNOW-003 | MODIFIED | 分層釐清：界線是「哪一層在做決定」，非「這份檔案是誰寫的」 |

## Completion

- **Tasks**: 16/16 code tasks (100%)；`[M]` 3／`[V]` 4 全數完成
- **Acceptance Criteria**: 2/5 獨立評分 56/57 statements PASS、0 FAIL

## Review & Verify

- **Review**: 6 round(s)，12 critical / 23 major。**critical 全數解決**，其中最重要的一項推翻了 issue #114 自身的驗收條件——`'min'` 並非死條目（`path.extname('foo.min')` 回傳 `.min`），刪除它會讓 `*.min` 建置產物改判為原始碼；另有三項為文案上的假宣稱（「唯一例外是零結果退回」在 curated map 存在時為假、區塊被稱為「每一個無法納入的目錄」、授權建立在磁碟上無從判定的 draft-vs-curated 區分），四項為無法失敗的斷言。**三次出現「修復本身引入新缺陷」**（round 3 的 6 個發現有 5 個源於前兩輪修復），含一次假收斂：對恆真式測試的修復只換了形狀（同一輸入跑純函式兩次必然相等），由獨立 reviewer 揪出後改為斷言順序無關性。**未修的 major**：無——3 個原本 proposed 的（上限排序 ×2、路徑跳脫）於追加輪全部處理；1 個判定為等價變異（帶反引號的副檔名不在拒絕清單上故算原始碼，其目錄永不符合揭露條件，無測試能殺死該變異，判斷已寫入程式與 REQ）。
- **Verify**: Grade A。Machine ledger 1/5 · 4/5 · 5/5 全 PASS（`prospec check` 裁決，非自評）；Judgment ledger 2/5 WARN（fresh context，56/57）· 3/5 PASS（6/6 條 Constitution 規則）· 6 not-applicable。2988 tests 綠、coverage 94.44% statements / 94.82% lines、`prospec check` 14/14 全 PASS。
- **Quality Log**: 9 筆。`prospec-new-story` WARN（INVEST Independent：US-2 對 US-1 的單向順序相依，已於 plan 以實作順序緩解）；6 筆 `prospec-review`（4 WARN／2 PASS）；2 筆 `prospec-verify` PASS。最終 verify 的唯一 WARN 是 REQ-LIB-038 一句**繼承自 379304e** 的錯誤舉例（`views/` 只有 `.md` 的 mvc 專案其實仍回報 `mvc`），已於評分後訂正並雙向實測，但訂正未再經 fresh context 複評，故本維度仍記 WARN 而非 PASS——這是 grade 停在 A 的唯一原因。

## Knowledge Update

已同步（archive Entry Gate 與 Phase 4 皆確認 0 stale）：
- `prospec/ai-knowledge/modules/lib/README.md`
- `prospec/ai-knowledge/modules/services/README.md`
- `prospec/ai-knowledge/modules/templates/README.md`
- `prospec/ai-knowledge/modules/tests/README.md`

## 已知殘留

- 根目錄層級的檔案不屬於任何目錄，永不出現在揭露區塊（已在文案與 REQ 揭露）。
- ~~dependency 的 `version` 欄位以純散文渲染，不在 code span 範圍故未納入本次跳脫~~ → **archive 後、merge 前修正**：實測顯示這一面比原判斷嚴重（惡意 version 可偽造整個 `## Directories Without Source Files` 區塊並排在真區塊之前），且同時暴露 `toInlineCodeSpan` 對 manifest 來源值不足——code span 不能跨空行，而 JSON 字串可含換行。修法為在 helper 內折疊換行（三個 manifest 欄位一次修好）並把 version 納入 guard。
- 根 README 的散文無契約測試釘住——本輪唯一只能靠人看的面。
- issue #114 的兩個方向未納入（`.prospec.yaml` 偵測覆寫、補完拒絕清單），理由記於 proposal Non-Goals 與 `.tasks/**/decisions.md` D-01。
