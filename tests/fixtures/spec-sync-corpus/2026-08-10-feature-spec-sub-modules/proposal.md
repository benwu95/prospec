# feature-spec-sub-modules

## Background

目前專案內的 feature spec 檔案會隨已歸檔的變更單調成長，對於累積多個故事的特徵檔（如 sdd-workflow.md），其長度會大幅超出載入預算並影響 agent 上下文開銷。本變更旨在為 feature spec 實作類似 module 的 sub-module 拆分機制，允許按 story 群組抽出 `{feature}/{slice}.md`，藉此將單一檔案長度控制在合理的知識預算內。

## User Stories

### US-1: 將過長的 Feature Spec 拆分成切片 [P1]

As an AI Agent or Developer,
I want 能夠在不破壞 REQ ID 與關聯的前提下，將 feature spec 拆分成多個 slice，
So that 載入知識的 token 花費可以減少，提高 agent 執行效率並降低成本。

**Acceptance Scenarios:**

- WHEN 一個特徵檔過長需要拆分, THEN 可以透過建立 `specs/features/{feature}/{slice}.md` 並在主檔中保留連結路由來完成。
- WHEN archive skill 讀取 `sdd-workflow.md` 時, THEN 只有當前觸及的切片 (slice) 會被載入。
- WHEN 進行 graduation 判斷或查找 req-references 時, THEN 現有的 REQ id 能無縫對應至正確的切片而不需要變更 id。

**Independent Test:**
建立一個虛擬的超大 feature spec 並拆分至 `tests/fixtures` 中，透過模擬 archive/spec-sync 載入來驗證僅有目標切片被載入且 REQ 解析正確。

## Edge Cases

- 找不到目標 REQ 所在的切片：應能報錯或回退至主檔查詢。
- 新增 REQ：在 archive 時如何決定寫入哪一個切片，或者預設追加到主檔。

## Functional Requirements

- **FR-001**: Feature spec 支援透過類似 Markdown 連結或特定語法，路由到子切片 `{feature}/{slice}.md`。
- **FR-002**: `lib` 的 `knowledge-reader` 與 `manifest-parsers` (或者負責 spec 解析的模組) 需要支援解析這些切片，並將 REQ 的尋址映射正確建立。
- **FR-003**: `archive` service (Phase 3.5 graduation 及其他 spec 讀取點) 應該改為僅載入變更觸及的 REQ 所屬的 spec 內容/切片。

## Success Criteria

- **SC-001**: 拆分 `sdd-workflow.md` 後，主檔 size 降到與 L2 (約 1800~5000 tokens) 預算同級。
- **SC-002**: 針對既有發生的 archive (如 #138 變更的 16 條 REQ)，新的窄讀取機制能讓 context 載入量大幅下降 (遠小於整檔 69k tokens)。
- **SC-003**: 專案的 CLI/check 流程（如 knowledge-size 等）不因拆分而拋出解析錯誤。

## Related Modules

- **lib**: 實作零 LLM 的漂移引擎、knowledge readers 以及 REQ 的解析邏輯，需要擴展以支援解析 `{feature}/{slice}.md`。
- **services**: 包含 `archive`, `spec-sync`, `spec-show` 等業務邏輯，需調整其從 `lib` 取得及寫入 REQ 的方式，落實僅讀取涉及的切片。
- **cli**: 若有提供 `spec show` 之類的讀取入口，可能也需反映切片尋址功能。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified (INVEST check passed)

## UI Scope

**Scope:** none
