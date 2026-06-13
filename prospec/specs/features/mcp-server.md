---
feature: mcp-server
status: active
last_updated: 2026-06-13
story_count: 4
req_count: 8
---

# MCP 真相層（Project Truth Server）

## Who & Why

**Target users**: 使用任意 harness（不限 Claude Code、未裝 prospec skills）的開發者、需要程式化查詢專案真相的 agent 與工具

**Problem solved**: prospec 的知識護城河（`_index.md`、module READMEs、module-map、feature specs、playbook）原本只有裝了 prospec skills 的 agent session 能消費——其他 harness 的 agent、vendor 子代理對專案真相是盲的，知識層價值被綁定在 skill 部署上。

**Why it matters**: `prospec mcp serve` 把知識層解耦成任何 MCP client 都能消費的唯讀真相層，落地「prospec = 餵養任何 harness 的 knowledge 層」定位。誠實邊界：server 全程唯讀（無任何寫入面）、per-request 重讀（永遠新鮮、無 cache）、純加值面（server 不在時 skills 與 CLI 一切照常）、transport 僅 stdio。

## User Stories & Behavior Specifications

### US-1: 啟動唯讀 MCP server 並查詢 Knowledge 真相 [P1]

身為使用任意 harness 的開發者，
我想要以 `prospec mcp serve` 啟動 stdio MCP server，讓 agent 讀取 `knowledge://index`、`knowledge://module/{name}`、`knowledge://module-map`、`knowledge://playbook`，
以便不部署 prospec skills 也能即時取得專案架構真相與已晉升的 team playbook。

**Acceptance Scenarios:**
- WHEN MCP client 連上 server 並列舉 resources，THEN 列表包含 index、module-map、playbook 與 module-map 中每個（名稱可安全成為 URI 參數的）module 的 README resource
- WHEN client 讀取存在的 module，THEN 回傳 README 全文；檔案於運行中變更後再讀，回傳最新內容
- WHEN server 未啟動或未註冊，THEN 既有 skills 與 CLI 行為不受任何影響

#### REQ-MCP-001: `prospec mcp serve [--cwd <path>]` 啟動唯讀 stdio MCP server
CLI 第 11 個指令 `mcp` 的 `serve` 子指令以 stdio transport 啟動唯讀 server，常駐至 client 斷線。`--cwd <path>` 釘住要服務的專案根目錄（預設 `process.cwd()`），讓單一 agent 不論從何處啟動，都能在一處註冊多個不同專案的 server。

**Scenarios:**
- WHEN 在含 `.prospec.yaml` 的專案執行 `prospec mcp serve`，THEN server 啟動；無 config 時回 ConfigNotFound（stderr，與其他指令同一 preAction 路徑）
- WHEN 給定 `--cwd <path>`，THEN config 解析（`.prospec.yaml`、base paths）與 preAction 存在性守衛皆以該 path 為基準、不依賴啟動目錄；該 path 無 config 時 ConfigNotFound 訊息點名該 path
- WHEN serve 期間，THEN stdout 僅承載 MCP JSON-RPC 協定內容；所有診斷/錯誤走 stderr
- WHEN 任何 client 請求，THEN server 無任何可變更檔案的寫入面

#### REQ-MCP-002: Knowledge resources（唯讀、per-request、圍堵）
`knowledge://index`、`knowledge://module/{name}`、`knowledge://module-map`、`knowledge://playbook` 四類唯讀 resources，內容每次請求自檔案系統重讀。

**Scenarios:**
- WHEN resources/list，THEN 含 index、module-map、playbook 與 map 中每個合法名稱 module 的 README resource；list 與 read 共用同一份 `isSafeResourceName` 守門
- WHEN 讀取不存在的 module/檔案，THEN 回 MCP error（resource not found），server 進程不中斷
- WHEN resource 參數含路徑分隔符或 `..`，THEN 一律拒絕
- WHEN 任何 resource 檔案（含 module-map.yaml 及其衍生面：列表、health、依賴查詢）的 realpath 逃出 served root，THEN 一律視同 not found——committed symlink 不得成為 repo 外讀檔或存在性探測的 oracle；root 內 symlink 照常服務

#### REQ-MCP-006: Knowledge read layer（missing→graceful / invalid→loud）
`lib/knowledge-reader` 為 content 讀取層；module-map 載入與路徑 clamp 為 check 與 MCP 的共用實作。

**Scenarios:**
- WHEN module-map.yaml 缺失，THEN 依賴它的 resources/tools 回 unavailable 並附「先跑 `prospec steering`」提示；index/playbook/spec resources 不受影響
- WHEN module-map.yaml 存在但 schema 無效，THEN loud error（與 `prospec check` 一致），絕不靜默降級為空列表
- WHEN map 驅動讀檔，THEN 經 `clampModulePaths` 保護，repo 外路徑被丟棄

#### REQ-MCP-007: Graceful 缺席——server 為純加值面
**Scenarios:**
- WHEN 檢查 `templates/` 與既有 services，THEN 無任何對 mcp server 的引用（結構性保證）
- WHEN server 不可用，THEN 全部既有測試與行為不變

#### REQ-MCP-008: README 雙語功能段與註冊指引
**Scenarios:**
- WHEN 閱讀根 README（中/英），THEN 均含 `prospec mcp serve` 功能段與各 agent 註冊指引
- WHEN 指引宣稱任何行為，THEN 對應已實作行為；未實作處用 deliberate-exclusion 措辭

---

### US-2: 查詢規格真相 [P1]

身為在其他 harness 中需要規格依據的開發者，
我想要 agent 透過 `spec://feature/{name}` 列舉與讀取 capability specs，
以便規格（REQ 條文）成為任何 agent 可直接引用的 source of truth。

**Acceptance Scenarios:**
- WHEN client 列舉 spec resources，THEN 只含非 archived specs
- WHEN 請求 archived 或不存在的 spec，THEN 回 resource not found

#### REQ-MCP-003: Spec resources 與 archived 排除單一來源
**Scenarios:**
- WHEN 列舉/讀取 feature specs，THEN `_archived*` 排除規則與 `prospec check`（`collectReqDefinitions`）共用同一實作——兩個真相面不得漂移
- WHEN 讀取 active spec，THEN 回傳全文

---

### US-3: 查詢知識新鮮度 [P2]

身為消費真相層的 agent 操作者，
我想要 `knowledge://health` 回傳各 module 的 staleness 與 coverage，
以便 agent 知道讀到的知識可信度，過期知識不會被當成新鮮真相。

**Acceptance Scenarios:**
- WHEN 讀取 health，THEN 輸出符合 drift-detection 的 `knowledge_health` 凍結契約
- WHEN 環境無 git 歷史（非 git repo / shallow clone），THEN 回明確 unavailable 語意，不偽造數字

#### REQ-MCP-004: health 復用凍結契約
**Scenarios:**
- WHEN 同一 repo 狀態下比對 `prospec check --json` 的 `knowledge_health` 區段，THEN 與 health resource 輸出一致（同一純函式，byte-for-byte）
- WHEN module-map 含不合法（traversal）module 名稱，THEN health 跳過該項、不探測 repo 外路徑（無存在性 oracle）

---

### US-4: 互動查詢 tools [P2]

身為需要結構化答案（而非整份文件）的 agent，
我想要 `search_modules` 與 `get_dependency_direction` 兩個唯讀 tools，
以便低成本回答「這個概念歸哪個模組」「A 可否 import B」。

**Acceptance Scenarios:**
- WHEN 以既有 keyword 呼叫 `search_modules`，THEN 回傳排序後的命中清單（含 description）
- WHEN 詢問兩個 module 的依賴方向，THEN 回傳允許判定並標明來源

#### REQ-MCP-005: search_modules 與 get_dependency_direction
`search_modules` 對 `_index.md` auto block 模組表的 Module/Keywords/Aliases 欄做正規化 term-OR 比對（lowercase、`-`/`_`/空白等價分隔、任一 term 命中即列入），依確定性規則排序（欄位權重 name > keywords > aliases、相異命中 term 數，同分以 module 名 codepoint 序 tie-break）。`get_dependency_direction` 依 module-map `depends_on` 回答，缺 map 時 fallback Constitution 鏈並標明來源。

**Scenarios:**
- WHEN tool 輸入無效，THEN 回 MCP error（isError result），server 存活
- WHEN 查詢 `drift checker`，THEN 與 `drift-checker` 等價命中；同一 term 命中多欄位僅計一次（相異 term 數）
- WHEN 搜尋無命中，THEN 回空陣列（非 error）+ suggestion 指向 `knowledge://index`
- WHEN 排序，THEN 同輸入跨環境結果 byte-identical（不用 locale 排序）
- WHEN 回答依賴方向，THEN `{allowed, direction, source}` 的 `source` 標明 module-map 或 constitution-fallback

## Edge Cases

- module-map 缺失：map 依賴面 graceful unavailable + steering 提示；其餘 resources 照常
- module-map 無效：request-scoped loud error，server 存活
- `_playbook.md`/`_index.md` 不存在：該 resource 回 not found，其餘照常
- committed symlink 外指：視同 not found（每個面一致——raw 讀取、listing、health、依賴查詢）
- 不可信 repo 的 crafted module name（`../../…`）：列表不廣告、health 不探測

## Success Criteria

- **SC-1**: MCP client（in-memory transport contract 測試）可列舉並讀取全部六類 resources
- **SC-2**: 兩個 tools 在 fixture 上回傳契約正確結果（含空結果與錯誤輸入）
- **SC-3**: `templates/` 與既有 services 零 mcp 引用（graceful 結構性成立）
- **SC-4**: health 與 `prospec check --json` 的 `knowledge_health` 同狀態 byte-for-byte 一致
- **SC-5**: README 中英兩版均含 `prospec mcp serve` 功能段

## Maintenance Rules

1. **Replace-in-Place**: MODIFIED User Stories 與 REQs 直接取代既有版本
2. **Functional Grouping**: 新需求插入對應 User Story 之下
3. **No Inline Provenance**: 歷史歸屬只記在 Change History 表
4. **Deprecation over Deletion**: 移除的需求移至 Deprecated 區

## Deprecated Requirements

_(None)_

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|-------------|
| 2026-06-13 | add-mcp-server | 唯讀 MCP server（BL-033 + read layer + OPT-A2 health 消費；兩輪對抗式審查、4 criticals 修復後收斂） | US-1~4; REQ-MCP-001~008 |
| 2026-06-13 | mcp-serve-cwd | `prospec mcp serve --cwd <path>` 釘選專案根目錄；config 解析與 preAction 守衛皆尊重 `--cwd`，支援單一 agent 跨目錄註冊多專案 server | REQ-MCP-001 (MODIFIED) |
