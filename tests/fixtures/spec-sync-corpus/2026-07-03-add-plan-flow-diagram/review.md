# Review: add-plan-flow-diagram

**Rounds:** 1 / cap 3   **Status:** review-clean

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| `plan-format.hbs:155` + `prospec-plan.hbs:101` | major | maintainability/DRY | resolved — cross-file consistency guard added |

## Round 1 — findings（獨立 fresh-context 審查員，mode B 多鏡頭）

### critical：無
REQ-TEMPLATES-125 AC1–AC5 意圖達成、無矛盾。章節重編號（Call Chain=4 → User Story Flow=5 →
Implementation Steps=6 → Risk=7）乾淨，全庫 grep 無任何懸空舊編號引用。依賴方向 N/A（純 Handlebars
資源）。三項驗證：

- **「不在 Startup Loading」負向斷言 SOUND**：`sectionOf('## Startup Loading')` 切片止於 partial 注入的
  `## Progressive Knowledge Loading Strategy`，乾淨涵蓋 items 1–8（唯一會加 stable-prefix step 之處）；
  若把 diagram read 加為 startup 項會落入切片 → 斷言變紅。AC5 滿足。
- **prospec-ff 漣漪非缺陷**：ff bundle 同一 `plan-format.hbs`（agent-sync referenceMap 確認），其 Phase 3
  委派「依 plan-format.md」，Section 5 為自描述條件式指引故仍生效；ff Startup Loading 不載
  `_diagram-conventions.md`，BL-020 以省略成立；且 ff 本就不帶 Context7 on-demand step，非對稱屬既有慣例。
- **計數正確齊備**：1204+574+18+43=1839（+3 contract）；README.md / README.zh-TW.md / index.md /
  tests README 四處一致；唯一殘留 `1836` 在 `specs/_archived-history/…` 之時點封存紀錄，不應回改。
- **security**：純模板文字，無可執行面，無事。

### major（advisory → verify WARN）
- **any-of 複雜度啟發式在兩範本重複**：`plan-format.hbs:155-160`（canonical Section 5）與
  `prospec-plan.hbs:101`（Phase 4 子步驟）皆完整列出門檻（>=2 分支 / >=3 狀態或多終止 / 跨模組序列）與
  「不計入 120 行」宣稱，無跨檔一致性測試釘住，改一處恐漂移（PB-006）。**緩解脈絡**：此完全比照已合併的
  Context7 模式（Phase 4 亦重述 Section 2 的觸發條件）——屬 skill 自包含的刻意設計，非新缺陷。
  **建議**：接受現狀（沿用前例），或選擇性加一條契約斷言釘住兩處門檻一致。依 severity 契約不自動修。
  **決議（使用者指示）**：加一致性契約斷言關閉漂移風險。`skill-format.test.ts` 新增 section-scoped
  斷言，釘住 plan-format Section 5 與 prospec-plan Phase 4 都命名同一組訊號 token（branching / >=2 /
  state transitions / >=3 / terminal states / cross-module / cross-actor）；已 mutation-verify（改一處
  即變紅）。M1 → resolved。（contract 574→575、total 1839→1840，四處計數已同步）

### nit（丟棄，僅列供參）
- `plan-format.hbs:163` Mermaid 範例用 stadium 起始節點 `s(["…"])`，該形狀不在 `_diagram-conventions.md`
  三形狀表（Rectangle/Diamond/Cylinder）；其餘（`flowchart`、diamond `decisionNode`、classDef 逐字相符、
  Yes/No 邊標、僅宣告使用到的 class）皆合規。終止節點未套 successNode/failNode——最小示意片段可接受。
