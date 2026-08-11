# Proposal: Reorganize Layered Index

## Background

目前專案進入點與 `_index.md` 缺乏明確的 L0~L3 分層索引與載入時機說明，造成 AI 助理載入脈絡時缺乏規範；同時，`_index.md` 的 Conventions、Project Info、How to Use、Loading Rules 位於 `prospec:auto` 區塊之外，使得自動化維護（如 `prospec upgrade` 與自訂規則檔案新增）難以自動列入，需要透過重整結構來解決。

## User Stories

### US-1: 定義與呈現 L0 至 L3 分層索引 [P1]

As a 專案開發人員與 AI Agent,
I want 在 `CLAUDE.md` / `AGENTS.md` 與 `_index.md` 清楚查閱 L0 至 L3 的分層結構、對應檔案與載入時機,
So that AI Agent 能在不同階段載入合適的檔案脈絡，節省 Token 並避免資訊混亂。

**Acceptance Scenarios:**

- WHEN 執行 `prospec agent sync` 重新整理代理設定，THEN 產生的 `CLAUDE.md` 與 `AGENTS.md` 必須包含 `Layered Index (分層索引)` 區塊，列出 L0 (Skills), L1 (Index & Conventions), L2 (Modules & Specs), L3 (Source Code) 及其加載時機。
- WHEN 開發人員檢視 `L3` 的描述，THEN 其說明與索引應保持語言中立與通用描述，避免硬編碼特定語言的副檔名（如 `.ts`）。

**Independent Test:**
- 檢查產生的 `CLAUDE.md` / `AGENTS.md` 是否具備分層索引區塊，且包含 L0~L3 的定義與時機說明。

### US-2: 自動化動態 Conventions 掃描載入 [P1]

As a 專案開發人員與 AI Agent,
I want Prospec 工具能動態掃描並登錄 `ai-knowledge/` 中的所有規範檔案,
So that 當有新增或升級規範檔案時，`_index.md` 的 Conventions 清單會自動同步，AI Agent 也能動態識別與載入。

**Acceptance Scenarios:**

- WHEN 執行 `prospec knowledge generate` 或 `prospec knowledge update`，THEN 程式碼必須動態掃描 `ai-knowledge/` 下所有以 `_` 開頭、以 `.md` 結尾的檔案（排除 `_index.md`），並依檔名排序。
- WHEN 掃描到自訂規範檔案，THEN 優先使用預設說明，若無則讀取檔案內第一個 `>` 區塊作為描述字串。如果檔案為空或無 blockquote，則安全回退為 `custom convention file`。
- WHEN AI Agent 執行任一 Prospec skill，THEN 其 `Startup Loading` 指引應包含讀取 `_index.md` 的 Conventions 清單以按需動態載入合適檔案的步驟。

**Independent Test:**
- 手動在 `ai-knowledge/` 新增 `_custom-test.md` 並加入 blockquote，執行 `prospec knowledge update` 後，檢查 `_index.md` 是否自動列出該檔案及其描述。

### US-3: 擴展 `_index.md` 的自動更新區塊 [P1]

As a 專案開發人員,
I want `_index.md` 的 Project Info, How to Use, Loading Rules, Conventions 全部落在 `prospec:auto` 區塊內,
So that 所有通用資訊都能在 generate 與 update 時被完整覆寫與同步，避免與使用者區塊混淆。

**Acceptance Scenarios:**

- WHEN 初始化或更新知識庫，THEN 產生的 `_index.md` 整個自動化資訊區塊都必須包夾在 `<!-- prospec:auto-start -->` 與 `<!-- prospec:auto-end -->` 之間。
- WHEN 執行 `prospec knowledge update` 增量更新，THEN 系統必須重新建構包含 Modules、Project Info、How to Use、Conventions、Loading Rules 的完整自動化區塊，不可丟失非 Module 表格的內容。

**Independent Test:**
- 執行 `prospec knowledge update`，確認產生的 `_index.md` 的 auto 區塊包含完整的 5 個區段。

## Edge Cases

- **空白或無區塊描述的規範檔案**：若 `_*.md` 檔案完全空白或不含 `>` 引用行，`listConventions` 必須正常執行且回傳 `custom convention file` 描述，不得拋出異常或中斷程序。
- **重複更新與合併冪等性**：多次執行 `agent sync` 或 `knowledge update` 必須保證 `prospec:auto` 區塊外的使用者自訂編輯區塊（`<!-- prospec:user-start -->`）毫無丟失且內容正確合併。

## Functional Requirements

- **FR-001**：在 `src/lib/knowledge-reader.ts` 中實作 `listConventions(knowledgePath)` 與 `formatConventionsList(conventions)` 函數，動態檢索 `_*.md` (排除 `_index.md`) 的檔名與 blockquote 說明。
- **FR-002**：調整 `src/templates/agent-configs/entry.md.hbs`，將 `Core Resources` 替換為 `Layered Index (分層索引)` 區塊，呈現 L0 至 L3 結構與時機。
- **FR-003**：調整 `src/templates/knowledge/index.md.hbs` 與 `src/templates/init/index.md.hbs`，將 Project Info, How to Use, Loading Rules, Conventions 全數移入 `prospec:auto` 區塊，並引入 `{{conventions_list}}`。
- **FR-004**：更新 `src/services/knowledge.service.ts`、`src/services/knowledge-update.service.ts`、`src/services/init.service.ts`，調用 dynamic Conventions 掃描功能，確保寫入 `_index.md` 的 auto 區塊完整無缺。
- **FR-005**：修改所有 Prospec skill 範本檔案（如 `prospec-plan.hbs`、`prospec-implement.hbs` 等），在其 `Startup Loading` 與 Progressive Loading 部分加入檢索並動態加載合適規範檔案的明確指引。

## Success Criteria

- **SC-001**：執行 `prospec knowledge update` 後，產生的 `_index.md` 的 `prospec:auto` 區塊包含完整的 `Modules`, `Project Info`, `How to Use`, `Conventions`, `Loading Rules` 區段，且 `Conventions` 動態列出所有 `_*.md` 檔案及其描述。
- **SC-002**：執行 `prospec agent sync` 後，`CLAUDE.md` / `AGENTS.md` 包含 `Layered Index` 區段完整呈現 L0~L3 結構與時機，且 `L3` 的描述維持通用。
- **SC-003**：測試套件 `pnpm test` 全數通過，無 Regression，涵蓋新邏輯的單元測試且覆蓋率保持在 80% 以上。

## Related Modules

- **templates**：核心範本變更。
- **lib**：實作 `listConventions` 動態掃描邏輯。
- **services**：更新 init, agent-sync, knowledge, knowledge-update 核心邏輯。
- **tests**：單元測試與整合測試。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- **Language Policy**: PASS。所有變更規約（proposal.md）皆以繁體中文（台灣）撰寫，程式碼識別碼與技術名詞保持英文。
- **Atomic Commits by Feature**: PASS。本功能所有變更將在完成時進行獨立的原子提交。
- **Test-Driven Development**: PASS。實作時將確保覆蓋率 $\ge 80\%$ 且撰寫足夠測試。
- **One-way Dependency Direction**: PASS。`lib` 層作為底層提供動態 Conventions 清單功能，由 `services` 層呼叫，無反向或循環依賴。

## UI Scope

**Scope:** none
