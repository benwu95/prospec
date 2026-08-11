# enforce-sub-module-budget

## Background

`_module-readme-conventions.md` 宣稱 sub-module 檔「same budget as a README」，但 `collectKnowledgeSize`
（`src/lib/drift-sources.ts:598-609`）的 L2 只量 `modules/<name>/README.md`。因此「抽出 sub-module」會
把知識移出 knowledge-size 的視線，WARN 消失的原因是量不到而不是變小——一句沒有機器兌現的話。
同時 templates README 已在 1797/1800（`l2_per_module` 已從出貨預設 1000 被上調到 1800），是 PB-011
的第三度：下一個要記錄的真實不變式就會再觸發 WARN，而 PB-011 的偏好順序已用完前兩項。

## User Stories

### US-1: sub-module 檔納入 knowledge-size 量測 [P1]

As a 維護 prospec 知識庫的擁有者與每個讀 L2 的 AI agent，
I want `knowledge-size` 對 `modules/<name>/` 下每個 sub-module `.md` 套用與 README 相同的 token 與行數預算，
So that 抽取 sub-module 是真的把知識切小，而不是把它移出 gate 視線。

**Acceptance Scenarios:**

- WHEN 某模組目錄含一個 tokens 超過 `l2_per_module` 的 sub-module `.md`，THEN `knowledge-size` 對該檔回報 warn finding，訊息形狀與 README 超標一致
- WHEN sub-module 檔在預算內，THEN 不產生 finding，且 README 自身的判定不受影響
- WHEN 模組目錄下只有 README，THEN 輸出與現況逐位元相同（無新 item、無新 finding）
- WHEN 目錄項目為子目錄、非 `.md` 檔，或名稱未通過 `isSafeResourceName`，THEN 略過該項，不量測且不拋錯

**Independent Test:**
以真實暫存目錄建立「README 在預算內 ＋ 一個超預算 sub-module」，直接呼叫 `collectKnowledgeSize`
與 `evaluateKnowledgeSize`，斷言 items 含兩筆 `l2`、findings 恰含 sub-module 那一筆。

### US-2: 抽出第一份 sub-module——templates 的 skill 撰寫契約 [P1]

As a 要新增或修改 prospec skill 的開發者，
I want skill 的撰寫與部署契約獨立成 `modules/templates/skill-authoring.md`，由 templates README 的 `## Sub-Modules` 連結，
So that templates README 離開預算上緣，而 skill 契約的細節不因裁剪而流失。

**Acceptance Scenarios:**

- WHEN 抽取完成，THEN `prospec/ai-knowledge/modules/templates/skill-authoring.md` 存在，且 README 於 auto block 內以 `## Sub-Modules` 連到它
- WHEN 比對兩檔，THEN 每條被搬移的規則只出現在 sub-module 檔，README 不留副本
- WHEN 執行 `prospec check`，THEN README 與新 sub-module 的 `knowledge-size` 皆 PASS，整體 14/14、0 warn
- WHEN 檢視 `prospec/index.md` 與 `module-map.yaml`，THEN 兩者皆無 sub-module 條目（L1 維持 top-level 地圖）

**Independent Test:**
`prospec check --json` 的 `knowledge_size.items` 同時含 templates README 與 `skill-authoring.md` 兩筆
`l2` 且皆在預算內；`file-paths` 對 `## Sub-Modules` 的相對連結為 PASS。

### US-3: sub-module 的 staleness 訊號 [P2]

As a 只更新了 sub-module 檔的維護者，
I want knowledge-health 的 staleness 以「README 與其 sub-module 的最新 commit」為準，且報告內含可重現該判定的欄位，
So that 更新 sub-module 後模組不再永久回報 stale——一個假紅會訓練人忽略整個 check。

**Acceptance Scenarios:**

- WHEN 模組原始碼較舊、只有 sub-module 檔被更新，THEN 該模組不再回報 stale
- WHEN 讀取 `prospec-report.json`，THEN 可從欄位重現該判定（`knowledge_health` 為凍結契約，只做加法擴充）
- WHEN 模組沒有任何 sub-module，THEN 判定與欄位輸出與現況相同

**Independent Test:**
在暫存 git repo 建立 module 原始碼 commit → README commit → 只改 sub-module 的 commit，斷言
`collectKnowledgeHealth` 對該模組不再 stale，且新欄位反映用來比較的時間戳。

## Edge Cases

- sub-module 檔名不安全（`../` 等）：沿用 modules 目錄走訪既有的 `isSafeResourceName` guard，略過而非變成存在性 oracle
- README 缺席但有 sub-module：sub-module 仍被量測；README 缺席由 knowledge-health 的 `readme_exists` 負責報
- 知識庫不存在：維持 `{available:false, reason}`，永不假 PASS
- Windows：新 item 的 `source_path` 一律 posix 正規化，沿用既有 `replace(/\\/g,'/')` 契約
- sub-module 自身超預算：慣例要求再切一層；本變更只回報，不自動處理

## Functional Requirements

- **FR-001**: `collectKnowledgeSize` 列舉 `modules/<name>/` 下每個 `.md`（README 與 sub-module），以 `l2` kind 產出 item
- **FR-002**: `evaluateKnowledgeSize` 對 sub-module item 套用 `l2_per_module` 與 `readme_max_lines`，finding 形狀與 README 一致
- **FR-003**: 抽出 `modules/templates/skill-authoring.md`，README 新增 `## Sub-Modules` 連結；被搬移內容不重複
- **FR-004**: `index.md` 與 `module-map.yaml` 不新增 sub-module 條目
- **FR-005**: knowledge-health staleness 取 README 與 sub-module 的最新 commit，並以 additive 欄位讓判定可從報告重現
- **FR-006**: `mcp-readme-counts` 與 MCP `knowledge://module/{name}` 維持 README-only，理由記入 delta-spec：本變更未搬動任何 MCP 計數宣稱，且 `MCP_RESOURCE_URIS` 為 append-only 凍結集合，擴充自成一個 story
- **FR-007**: 正典 `_module-readme-conventions.md` 與出貨模板 `init/module-readme-conventions.md.hbs` 改為明示 sub-module 預算由 `knowledge-size` 機器強制；併同校正 `specs/features/ai-knowledge.md` 中已過期的 ≤400 token 敘述

## Success Criteria

- **SC-001**: US-1 的四個場景各有 unit 測試（含略過路徑），新斷言經 mutation-verify
- **SC-002**: `prospec check` 14/14、0 warn；蓄意讓 `modules/templates/skill-authoring.md` 超標時 `knowledge-size` 對該檔發 warn（報告無 `knowledge_size` 區塊，size 只產生 findings，故以 finding 為觀測點）
- **SC-003**: templates README 自 1797 tokens 降至 ≤1500；`skill-authoring.md` ≤1800
- **SC-004**: `grep` 驗證被搬移的規則字串在 README 0 命中、在 sub-module 各 1 命中
- **SC-005**: `pnpm test` / `pnpm typecheck` / `pnpm lint` 全綠；`pnpm counts:check` 同步

## Related Modules

- **lib**: `drift-sources.ts` 的 knowledge-size 與 knowledge-health collector（FR-001/005）
- **types**: `drift-report.ts` 的 `knowledge_health` additive 欄位（FR-005）
- **tests**: collector/evaluator 的 unit 覆蓋與略過路徑（SC-001）
- **templates**: 出貨的 `init/module-readme-conventions.md.hbs` 措辭（FR-007）

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified — 變更工件為繁體中文（台灣）、信任區與 commit message 為英文（Language Policy）；測試先於實作（TDD）；`lib` 不上引 `services`（One-way Dependency）；`prospec check` 的 check 清單未新增 id，root README 的使用者可見面若無變動則 README-current 不觸發

## UI Scope

**Scope:** none
