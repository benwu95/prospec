# Proposal：根治 updateIndex 保真度——curated index 欄位不再被清空

## Background

`index.md` 的 `prospec:auto` block 有兩個保真度不同的寫者：deterministic 的 `updateIndex` 只產出 Module/Status/Description 三欄骨架（其餘欄位填 `—`），而 LLM curated 的 Keywords/Aliases/Rationale/Depends On 內容住在同一 block 內——任何自動更新都會把 curated 內容清成骨架。`module-map.yaml`（模組宣告的家）已有 name/description/status/keywords/category/depends_on，僅缺 aliases/rationale，且其值可能與 index 分歧。這是「勿自動跑 archive.service.execute()」memory 規則的根本原因；#57 止血後，`/prospec-knowledge-update` 正常路徑仍存在同樣風險。採方案 A（單一真相）：curated 欄位收斂進 module-map.yaml，index.md auto block 完全由其生成，並在 updateIndex 內建 no-clobber 回填，讓既有下游專案零遺失遷移。

## User Stories

### US-1：curated index 欄位收斂為 module-map 單一真相 [P1]

As a 維護 prospec 專案 AI Knowledge 的 agent，
I want `index.md` 的所有欄位（含 Keywords/Aliases/Rationale/Depends On）由 `module-map.yaml` 單一來源生成，
So that 跑 `/prospec-knowledge-update`（或任何 auto-update）都不會清空 curated 欄位，兩個寫者收斂為同一保真度。

**Acceptance Scenarios:**

- WHEN 對含 curated 內容的 `index.md` 跑 `updateIndex`, THEN 生成的 auto block 保留全部 curated 欄位值（不再出現被清成 `—`）
- WHEN `module-map.yaml` 已含各欄位, THEN `updateIndex`、`init`、`knowledge-generate` 生成 index 表時皆自這些欄位取值（同一真相）
- WHEN 新增模組但 module-map 該模組尚無 curated 欄位, THEN 該列 curated 欄位以 `—` 佔位待策展（不虛構）

**Independent Test:**
單元/契約測試：對帶 curated 欄位的 index.md + module-map fixture 跑 `updateIndex`，斷言輸出 auto block 的 Keywords/Aliases/Rationale/Depends On 完整保留；mutation-verify（清空 module-map 對應欄位 → 該欄轉 `—`）。

### US-2：updateIndex 內建 no-clobber 回填遷移 [P1]

As a 既有 prospec 下游專案的維護者，
I want 升級後首次跑 `/prospec-knowledge-update` 時，既有 `index.md` 的 curated 欄位自動回填進 `module-map.yaml`，
So that 我不需手動搬移，且既有 curated 內容零遺失。

**Acceptance Scenarios:**

- WHEN `module-map.yaml` 某模組缺某 curated 欄位（如 aliases/rationale）但既有 index.md 有值, THEN `updateIndex` 先將該值回填進 module-map（bootstrap-once），再生成 index.md
- WHEN `module-map.yaml` 已有該欄位值, THEN 回填絕不覆寫既有值（no-clobber）
- WHEN 既有 index.md 無 curated 值可回填, THEN 該欄維持空/`—`，不虛構

**Independent Test:**
單元測試：module-map 缺 aliases/rationale + index.md 有值 → 跑 updateIndex → 斷言 module-map.yaml 被回填且 index.md 生成正確；再跑一次為 idempotent（no double-write、no-clobber）。

## Edge Cases

- module-map 與 index.md 對同一欄位皆有值且分歧：以 module-map 為準（單一真相），index 生成覆蓋（回填為 bootstrap-once，只在 module-map 缺值時發生）。
- Description/Status/Keywords/Depends On 目前部分已在 module-map：回填只補「module-map 缺、index 有」者，避免用 index 骨架覆寫 module-map 既有 curated。
- 分組（`### {Category}` 子表）輸出：回填/生成需對分組表格仍正確列舉全部模組（沿用 parseIndexModules 的 header-label 解析）。

## Functional Requirements

- **FR-001**：`ModuleEntrySchema` 新增 `aliases`、`rationale`（optional），涵蓋 index 全部 curated 欄位。
- **FR-002**：index 表格生成（updateIndex + init + knowledge-generate 共用的 auto-block 渲染）自 module-map 各欄位取值，不再固定填 `—`。
- **FR-003**：`updateIndex` 生成前執行 no-clobber 回填：既有 index.md curated 值 → module-map 缺值處（bootstrap-once、idempotent）。
- **FR-004**：解析既有 index.md curated 欄位（擴充 `parseIndexModules` 或新 helper 涵蓋 rationale/depends_on）。
- **FR-005**：contract/unit 測試釘住保真與回填（mutation-verified 回歸防護）。

## Success Criteria

- **SC-001**：對含 curated 內容的 index.md 跑 `updateIndex`，curated 欄位完整保留（測試斷言）。
- **SC-002**：既有下游情境（module-map 缺 aliases/rationale）跑一次 updateIndex 後 module-map 被回填、index 生成正確、再跑 idempotent。
- **SC-003**：`pnpm test`/`typecheck`/`lint`/`counts:check` 全綠；`prospec check` 0 fail。

## Related Modules

- **types**：`ModuleEntrySchema` 新增 aliases/rationale 欄位。
- **lib**：index 表格解析（parseIndexModules 擴充）+ no-clobber 回填 helper + module-map 讀寫。
- **services**：`knowledge-update.service` updateIndex 改自 module-map 生成 + 回填；init/knowledge 生成路徑對齊。
- **templates**：`_index-auto-block.hbs` 渲染全部欄位；`module-map.yaml.hbs` 反映新欄位。
- **tests**：contract + unit 保真/回填回歸。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations：TDD（測試同步）、Atomic Commits、Language Policy、依賴方向（types←lib←services←templates 讀取；不新增反向）皆遵守。

## UI Scope

**Scope:** none

## Open Questions

- [ ] 依賴 #57 合併（本變更 stack 於 #57 branch）；#57 merge 後 PR retarget main。
