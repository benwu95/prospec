## Background

目前的 `ai-knowledge/_index.md` 架構缺乏對 prospec skills 與 feature spec 的明確分層定位，導致 AI 代理與開發者載入時機不明確，進而造成 context overhead。將索引提升並切分為 L0 (AGENTS.md) 與 L1-L3 (prospec/index.md) 能有效解決此問題。

## User Stories

### US-1: 建立四層分層索引結構 [P1]

As a AI 代理與開發者,
I want 將 `ai-knowledge/_index.md` 提升至 `prospec/index.md` 並實作 L1~L3 索引與動態掃描過濾機制 (核心預設載入，其餘 load-on-demand)，同時將 L0 指引保留於 `AGENTS.md`/`CLAUDE.md`,
So that 能夠減少 context overhead 並精準控管 Token budget。

**Acceptance Scenarios:**

- WHEN `prospec/index.md` 產生時, THEN 應包含 L1~L3 分層說明，且 L1 Conventions 區分預設載入清單與 load-on-demand 檔案清單。
- WHEN 執行 `prospec-knowledge-generate` 或 `update` 時, THEN 應將內容正確寫入至根目錄的 `prospec/index.md`。
- WHEN 掃描 `ai-knowledge/` 下的 `_*.md` 檔案時, THEN 能依據核心清單過濾出預設載入與非預設載入的檔案。

**Independent Test:**
執行知識生成指令，驗證 `prospec/index.md` 被正確產生，且 `prospec:auto` 區塊內正確區分 Conventions 的預設與非預設清單，檔案路徑均指向正確位置。

## Edge Cases

- 使用者刪除或重新命名預設載入清單中的核心檔案：維持穩定清單，若檔案不存在則呈現或跳過 (不應中斷流程)。
- `ai-knowledge/` 下沒有額外的 `_*.md` 檔案：只渲染核心檔案，load-on-demand 區塊為空。

## Functional Requirements

- **FR-001**: `AGENTS.md` 與 `CLAUDE.md` 的 Notes 需包含 L0 說明，並指引至 `prospec/index.md` 檢視 L1~L3。
- **FR-002**: 將 `ai-knowledge/_index.md` 移至專案根目錄 `prospec/index.md`。
- **FR-003**: 實作動態掃描邏輯，抓取 `ai-knowledge/` 下排除 `_index.md` 的所有 `_*.md` 檔案。
- **FR-004**: 實作過濾機制，區分核心檔案 (`_conventions.md`, `_diagram-conventions.md`, `_glossary.md`, `_playbook.md`, `_status-lifecycle.md`) 與其他非核心檔案。
- **FR-005**: 更新相關 service (`knowledge`, `archive`, `upgrade`) 的讀寫路徑。

## Success Criteria

- **SC-001**: `prospec/index.md` 包含正確分類的 Conventions 檔案清單。
- **SC-002**: 所有掃描與路徑更新相關的 test 執行通過。
- **SC-003**: `AGENTS.md` 與 `CLAUDE.md` 內容包含 L0 的說明，並於 Core Resources 補上 `_diagram-conventions.md`。

## Related Modules

- **templates**: 需修改 `index.md.hbs` 模板與 `AGENTS.md` 相關模板，負責渲染新的架構。
- **services**: 包含 `knowledge`, `archive` 與 `upgrade` 邏輯與路徑更新，負責索引更新業務邏輯。
- **lib**: 提供過濾與掃描的基礎設施，協助分離核心與非核心約定。

## Open Questions

- [ ] 無

## Constitution Check

- [ ] Reviewed against `prospec/CONSTITUTION.md`
- [ ] No violations identified
