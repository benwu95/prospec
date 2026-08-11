# report-dropped-req-bullets

## Background

`archive` 的機械 Feature Spec sync 對 MODIFIED REQ 的契約是：帶 `**Spec:**` 區塊就**整段取代**既有 body。契約本身正確，但它把「新 body 是否涵蓋仍成立的舊行為」完全交給作者，而作者的自然寫法是「描述本次 delta」——兩者一衝突，信任區就永久少一段行為，且整個流程不會有任何訊號。

`add-harness-capability-flags` 實測踩中：REQ-TEMPLATES-066 的 mode B/A、spec-architecture lens、hard cap 與 REQ-TEMPLATES-155 的 `scale: quick` not-applicable 規則全被覆蓋，Phase 3.5 逐 REQ 對照 `git show HEAD:` 才發現。ledger `archive/mechanical-merge-drops-req-body` 已累積 freq=3，且本次是**新變體**（作者側，非 CLI 側）。

關鍵是**數量偵測無效**：該案舊 3 條 bullet、新 3 條 bullet，數量相同而集合完全不同。

## User Stories

### US-1: 機械合併回報被丟棄的既有行為 [P1]

As a 執行 `/prospec-archive` 的開發者,
I want spec-sync 在 `**Spec:**` 取代既有 body 時，列出舊 body 中不存在於新 body 的 `WHEN/THEN` bullet,
So that 信任區的行為遺失在畢業當下就被看見，而不是靠人記得去 diff `git show HEAD:`。

**Acceptance Scenarios:**

- WHEN MODIFIED REQ 的 `**Spec:**` 區塊取代既有 body，且舊 body 有 bullet 不在新 body 中，THEN 該 REQ 與被丟棄的 bullet 逐條出現在 archive 的回報中
- WHEN 新 body 涵蓋全部既有 bullet（可含新增），THEN 不產生任何丟棄回報
- WHEN 舊 body 與新 body 的 bullet **數量相同但內容不同**，THEN 仍完整回報差集——偵測依據是集合，不是數量
- WHEN 以 `--dry-run` 執行，THEN 丟棄回報與實際執行一致，且不寫入任何檔案

**Independent Test:**
以一份既有 feature spec 與一個帶 `**Spec:**` 的 MODIFIED route 呼叫 spec-sync，斷言回報包含被移除的那條 bullet；再以涵蓋全部舊 bullet 的 route 斷言回報為空。

### US-2: 畢業階段逐條確認丟棄的刻意性 [P1]

As a 執行畢業判斷的 AI 或人,
I want `/prospec-archive` Phase 3.5 的 gate 要求逐條確認每個被丟棄的 bullet 是刻意的,
So that 回報不會淪為沒人讀的輸出，而是必須被處理的工作清單。

**Acceptance Scenarios:**

- WHEN archive 回報了被丟棄的 bullet，THEN Phase 3.5 Gate 有一項要求逐條確認其刻意性，未確認即不得通過
- WHEN 回報為空，THEN 該 gate 項目自動滿足，不增加任何儀式

**Independent Test:**
契約測試斷言 `prospec-archive.hbs` 的 Phase 3.5 Gate 區段含該項目，且刪除後測試變紅。

## Edge Cases

- **既有 body 無 bullet**（只有敘述段落）：無 bullet 可比對，不回報；敘述段落的丟失不在本次偵測範圍，於 delta-spec 明示為刻意排除
- **bullet 僅措辭潤飾**：視為丟棄並回報——由人確認，寧可多問一次也不要靜默遺失
- **ADDED REQ**：不適用（沒有既有 body 可丟棄）
- **REMOVED REQ**：不適用（走 deprecate 路徑，已有既有回報）
- **同一 REQ 同時丟棄多條**：逐條列出，不折疊成計數

## Functional Requirements

- **FR-001**: `mergeRequirementInPlace` 在取代 body 時擷取被跳過的舊 body，抽出其 `WHEN/THEN` bullet
- **FR-002**: 以**集合差集**（正規化空白後逐字比對）判定丟棄，不使用數量
- **FR-003**: 丟棄結果以獨立欄位回報，不覆載既有 `pendingConvergence` 的語意（後者意為「body 被保留、待人工收斂」）
- **FR-004**: CLI formatter 輸出該回報，`--dry-run` 與實際執行一致
- **FR-005**: `/prospec-archive` Phase 3.5 Gate 新增逐條確認項目

## Success Criteria

- **SC-001**: 以 `add-harness-capability-flags` 的真實 before/after body 為 fixture，回報恰好列出被丟棄的既有 bullet
- **SC-002**: 舊新 bullet 數量相同但內容不同的 fixture 仍完整回報（釘住「非數量」判定）
- **SC-003**: `pendingConvergence` 的既有語意與計數不受影響
- **SC-004**: `pnpm test` 全綠，新斷言逐類 mutation 驗證

## Related Modules

- **services**: `archive.service.ts` 的 `mergeRequirementInPlace` 與 `SpecSyncResult` 契約
- **cli**: `formatters/archive-output.ts` 輸出新回報
- **templates**: `prospec-archive.hbs` 的 Phase 3.5 Gate
- **tests**: services 單元測試與 skill-format 契約測試

## Open Questions

- [ ] 僅措辭潤飾也回報是否過吵——先採「寧可多問」，若實務證明噪音過高再引入相似度門檻
_無未決問題（知識預算壓力已由下方的申報式放寬處理）。_

## Knowledge Budget Widening (declared per REQ-TYPES-069)

`services/README.md` 已連續三個變更卡在上限，每加一條不變式就得壓縮既有內容換空間——PB-011 描述的「檔案已滿」狀態。本變更依 REQ-TYPES-069 的 declared-not-silent 路徑處理，逐項申報：

- **數字**：`.prospec.yaml` `knowledge.token_budget` 由 `l1_per_file: 2000` / `l2_per_module: 1500` 調高為 **`l1_per_file: 2500`** / **`l2_per_module: 1800`**（`readme_max_lines` 不變）。**出貨預設完全未動**——`DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 仍為 1800／1000／100，`init` 種子亦然，下游專案不受影響。
- **PASS 的來源**：`knowledge-size` 的綠燈來自**放寬預算**，不是知識庫變小。事實相反：本變更先為了塞進舊上限壓縮了 `services/README.md` 的 13 處措辭與 provenance 括號，預算調高後**全數還原**，該檔現為 1557 tokens（舊上限 1500）。
- **為何不選瘦身**：可壓縮的都已壓過。剩下的每一句都是實測踩過的不變式（`updateModuleReadme` 為何 CREATE-ONLY、refuse-before-write 的三個站點、FUNCTION replacer 的理由），刪任何一條都是降低知識密度而非提高密度——PB-011 明列這是最該避免的解法。抽 sub-module 是另一個合法選項，但那會把 pitfalls 拆到 L2 次層、增加一次跳轉，對一個仍在單檔可讀範圍內的模組不划算。
- **現況**：調整後六個 module README 落在 1282–1557（上限 1800），五個 L1 檔落在 491–1996（上限 2500），`prospec check` 的 `knowledge-size` 為 PASS 且 0 warn。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified — 變更工件繁中、trust zone 英文；TDD 先寫測試；依賴方向 `cli → services` 不變；README 未描述此內部回報，無 user-facing 缺口

## UI Scope

**Scope:** none
