# slim-knowledge-l1-l2

> 實作 GitHub issue #64「L1/L2 知識層瘦身：index 去重、超標 README 抽取」

## Background

L1/L2 知識層實質超重且層間重複。稽核報告 03（`.tasks/chore/scan-by-fable5/`，2026-07-03）指出：`prospec/index.md` 的 Modules 表 Description 欄逐變更累積技術細節（REQ 編號、函式名、行為描述），與各 README 大幅重疊，直接違反 index.md 自訂的 Principle 2「Each layer must NOT duplicate information available in a lower layer」；6 個 module README 全數超過 `_module-readme-conventions.md` 的 ≤400 tokens / ≤100 lines 預算。實測 index.md 3239 tokens（Description 欄佔 57%），6 README 介於 2138–4861 tokens。前置的 knowledge-size drift check（#63）已合入，size 護欄就位，正是瘦身且防回彈的時機。

## User Stories

### US-1: index.md 瘦身為 routing-only 索引 [P1]

身為讀取 L1 知識做路由的 AI Agent，
我想要 `index.md` 的 Modules 表 Description 欄只保留「往哪看」所需的定位（1-2 句），
以便快速掃描找到相關模組，而非被逐變更累積的實作細節淹沒。

**Acceptance Scenarios:**

- WHEN 讀取 `index.md` 的 Modules 表，THEN 每列 Description 為 routing-only 定位（1-2 句），實作細節改由 Keywords/Aliases/Status/Depends On 欄與 L2 README 承載
- WHEN 縮短某模組定位，THEN 編輯其單一來源 `module-map.yaml` 的 `description` 欄（非直接改 index cell，後者會被再生蓋回）
- WHEN 瘦身後計算 `index.md` 大小，THEN ≤ 1800 tokens（chars/4）

**Independent Test:**
`node dist/cli/index.js check` 的 `knowledge-size` 對 `index.md` 不再 WARN；`prospec/index.md` 與 `module-map.yaml` 的 Description 一致。

### US-2: 校準 L1 per-file token 預算為 1800 [P1]

身為維護 prospec 知識庫的開發者，
我想要把 `knowledge-size` 的 `l1_per_file` 預設由 1500 調整為 1800，
以便讓 WARN 只在真正回彈（如現況 3239）時響，而非在一個已充分自律的 6-模組 index 上誤報（實測 routing-only 後仍約 1562 tokens，1500 對健康 index 偏緊）。

**Acceptance Scenarios:**

- WHEN 讀取 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`，THEN `l1_per_file` 為 1800
- WHEN 未在 `.prospec.yaml` 覆寫預算，THEN L1 檔案以 1800 tokens 為門檻判定 WARN
- WHEN 引用預算數值的文件（`index.md` Progressive Loading 表等）與測試被檢視，THEN 一致反映 1800，無殘留 1500

**Independent Test:**
更新後 `pnpm test` 全綠（含斷言預設值的測試）；`grep` 知識文件無殘留「1,500 tokens per file」字樣。

### US-3: 6 個 module README 綠化至預算內 [P1]

身為讀取 L2 知識做修改的 AI Agent，
我想要每個 module README 都在預算內（`l2_per_module`，經 US-2 校準為 1000 tokens）且 ≤100 lines，
以便載入 README 時只取精簡地圖；若某 README 仍超標且含 content-rich 獨立區塊，才抽為 sub-module 檔。

**Acceptance Scenarios:**

- WHEN 讀取任一 `modules/{name}/README.md`，THEN ≤ 1000 tokens 且 ≤ 100 lines（校準後每模組單檔即達標，本輪未需抽 sub-module）
- WHEN 某 README 超標且含 content-rich 且功能獨立的子區塊，THEN 該區塊抽為 `modules/{name}/{sub}.md` 並在 README 的 `## Sub-Modules` 段連結（不重複回 README）
- WHEN 檢視 sub-module 檔的登錄，THEN 不出現在 `index.md` 與 `module-map.yaml`（sub-module 是 L2 子層，僅經 README 連結發現）

**Independent Test:**
`knowledge-size` check 對全部 6 個 README 不再 WARN；`grep` `index.md`／`module-map.yaml` 無 sub-module 檔名。

## Edge Cases

- **`_status-lifecycle.md`（L1 core convention，1907 tokens）超標**：1800 預算下仍微超。它是 canonical 生命週期定義，trim 須不損表格/轉移語意。視 trim 乾淨度決定是否順帶壓進 1800（讓 knowledge-size 完全 PASS）；不強求，它非本輪主要「瘦身檔」。
- **`module-map.yaml` counts 較舊**（82 files/1985 tests vs index 的 85/2079）：瘦身 description 時對齊事實，避免把舊 counts 帶回 index；由 `pnpm counts:check` 把關。
- **sub-module 抽取須保留 README 的 cross-cutting 段**（Dependencies / Modification Guide / Pitfalls 概覽），只把獨立的 content-rich 區塊（多為龐大的 Key Files / Public API 明細）移出，避免地圖失去導覽功能。
- **無程式強制 sub-module 約定**：sub-module 純 convention/LLM 驅動，knowledge-size 不量測 sub-module 檔，也無 drift 檢查其未列入 index。防回彈全靠 knowledge-size 對 README 的 WARN 護欄。

## Functional Requirements

- **FR-001**: `index.md` Modules 表 Description 欄縮至 routing-only 定位（1-2 句/模組）；實作細節下放 L2 README。
- **FR-002**: `module-map.yaml` 的 `description` 欄同步瘦身為 routing-only（index Description 的單一來源），counts 對齊事實。
- **FR-003**: `DEFAULT_KNOWLEDGE_TOKEN_BUDGET.l1_per_file` 由 1500 改為 1800（`src/types/config.ts`）。
- **FR-004**: 更新所有引用舊值 1500 的處（`index.md` Progressive Loading 表、其他知識文件、斷言該預設的測試）為 1800。
- **FR-005**: 6 個 module README（types/lib/services/cli/templates/tests）皆 ≤1000 tokens（`l2_per_module`，US-2 校準值）且 ≤100 lines；超標且獨立的區塊才抽為 `modules/{name}/{sub}.md` 並在 `## Sub-Modules` 連結（本輪校準後皆單檔達標，未需抽取）。
- **FR-006**: 抽出的 sub-module 不列入 `index.md` 與 `module-map.yaml`。

## Success Criteria

- **SC-001**: `index.md` ≤ 1800 tokens；`knowledge-size` 對 `index.md` PASS。
- **SC-002**: 6 個 module README 各 ≤1000 tokens（`l2_per_module` 校準值）且 ≤100 lines；`knowledge-size` 對全部 README PASS。
- **SC-003**: `knowledge-size` check 對 index.md + 6 README 不再 WARN。
- **SC-004**: drift 其餘 10 個 check（req-references / file-paths / knowledge-health 等）全綠——瘦身不破壞引用。
- **SC-005**: `pnpm test` 全綠、`pnpm counts:check` 無 drift。

## Related Modules

- **types**: `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 定義於 `src/types/config.ts`（FR-003）。
- **lib**: `knowledge-size` collector/evaluator、`index-table`、`token-accounting` 為預算量測與 index 渲染來源（本輪不改邏輯，僅改預設值與被量測的知識檔）。
- **services**: `knowledge`/`knowledge-update` 為 index/README 再生邏輯（本輪不改邏輯，相關於再生後仍需維持瘦身）。
- **templates**: `index.md.hbs`／`module-readme.hbs`／knowledge skills 內的預算字樣與抽取指示。
- **tests**: 斷言 budget 預設 1500 的測試需改為 1800。
- 知識庫本身（`index.md`、6 個 module README、`module-map.yaml`、`_status-lifecycle.md`）為主要編輯對象。

## Open Questions

- 無。範圍已於 story 前與使用者確認：Scope 2（`sdd-workflow.md` 按 phase 拆多檔）本輪 descope（feature spec 不在 knowledge-size scope，且與 spec-sync「一 feature 一檔」模型衝突）。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] Language Policy：變更文件（本 proposal 等）以繁中撰寫；知識庫（index.md/README/module-map）維持英文（豁免）。
- [x] Atomic Commits：預期分批 commit（budget 校準／index 瘦身／各 README 抽取），互不混雜。
- [x] TDD：US-2 的預設值變更伴隨測試更新；US-1/US-3 為知識庫文件重構（無新公開函式，以 drift check 與 token 計數驗證）。
- [x] No violations identified。

## UI Scope

**Scope:** none
