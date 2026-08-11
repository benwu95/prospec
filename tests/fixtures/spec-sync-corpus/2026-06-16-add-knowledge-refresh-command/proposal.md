# add-knowledge-refresh-command

## Background

`raw-scan.md` 是 `/prospec-knowledge-generate` 的必要輸入，描述專案結構快照（技術棧、entry points、目錄樹、依賴、設定檔、檔案統計）。但它目前**只**在 `prospec knowledge init`（首次設定，掃描 + 建立 skeletons）時產生。程式碼演進後 `raw-scan.md` 會 drift——本專案當前的 `raw-scan.md` 目錄樹仍是 `docs/`、`ralph-sdd/`、`specs/001-*`，與實際的 `prospec/`、`planning/` 結構不符，即為實證。需要一個 deterministic（純依原始碼、不使用 LLM）的 CLI 指令，在 SDD 流程結束後刷新此快照。

## User Stories

### US-1: deterministic 刷新 raw-scan.md 的 CLI 指令 [P1]

As a prospec 專案維護者（或在 SDD 流程尾端執行的 AI agent），
I want 一個只重新產生 `raw-scan.md` 的 CLI 指令，
So that 程式碼變動後能不重跑 `init`、不動用 LLM 即取得最新結構快照，讓後續 `/prospec-knowledge-generate` 看到當前專案結構。

**Acceptance Scenarios:**

- WHEN 執行 `prospec knowledge refresh`，THEN 依當前原始碼重新掃描並覆寫 `raw-scan.md`，且 `module-map.yaml` / `_index.md` / `_conventions.md` 內容維持 byte-identical（不建立、不覆寫）。
- WHEN 執行 `prospec knowledge refresh --dry-run`，THEN 預覽將寫入的檔案但不寫入任何檔案。
- WHEN 執行 `prospec knowledge refresh --depth <n>`，THEN 以指定深度掃描（與 `init` 對齊）。
- WHEN `raw-scan.md` 尚不存在，THEN refresh 直接產生它（等同首次掃描結果）。

**Independent Test:**
在已 `init` 過的專案新增/刪除目錄後執行 `prospec knowledge refresh`，比對 `raw-scan.md` 的 Directory Tree／File Stats 已反映變動，且三個 curated 檔案的 hash 不變。

### US-2: archive 流程尾端自動刷新 raw-scan.md [P2]

As a prospec 使用者，
I want `/prospec-archive` 在流程結束時自動刷新 `raw-scan.md`，
So that 不必記得手動執行，流程結束後結構快照即為最新。

**Acceptance Scenarios:**

- WHEN `/prospec-archive` 成功歸檔且既有 knowledge-update 跑完之後，THEN `archive.service` 自動觸發 raw-scan refresh。
- WHEN raw-scan refresh 在 archive 中失敗，THEN 視為非致命，記錄 warning 但不阻斷歸檔（沿用既有 auto-knowledge-update 模式）。

**Independent Test:**
在含 delta-spec 的已驗證變更上跑 archive，確認回傳結果標示 raw-scan 已刷新，且 `raw-scan.md` 反映歸檔後的檔案狀態。

### US-3: knowledge-generate 起始刷新 raw-scan（消費端保證）[P2]

As a prospec 使用者（執行 `/prospec-knowledge-generate` 重新生成知識者），
I want generate 在讀取 `raw-scan.md` 前先以 deterministic 方式刷新它，
So that 模組 README 永遠依當前真實結構生成，不把 stale 路徑寫進知識庫（直接維護該 skill 既有 NEVER 規則「paths must come from raw-scan.md real data」）。

**Acceptance Scenarios:**

- WHEN `/prospec-knowledge-generate` 啟動，THEN 先執行 `prospec knowledge refresh`（不存在則建立），再讀取 `raw-scan.md`。
- WHEN `prospec` CLI/設定不可用，THEN fallback 至既有 `raw-scan.md` 或提示 `knowledge init`，不靜默前進。
- WHEN raw-scan 已被 refresh，THEN `module-map.yaml` 仍須由 `init` 首次建立（generate 依賴它，bootstrap 分界不變）。

**Independent Test:**
渲染 `prospec-knowledge-generate.hbs`，Startup Loading 含 `prospec knowledge refresh`；skill-format contract（item-set / markers / MANDATORY）全綠。

## Edge Cases

- `raw-scan.md` 不存在：直接產生（非錯誤）。
- `.prospec.yaml` 不存在：沿用 `index.ts` preAction guard → `ConfigNotFound`（`refresh` 不在 INIT_COMMANDS）。
- archive 自動刷新失敗：非致命，warning，不影響歸檔結果。
- 使用者未安裝 prospec（直接用 committed skills）：generate/archive 走 fallback ladder（`pnpm exec`/`npx` → 降級）；quickstart 停止並提醒安裝。
- 非-Node.js 專案（Python/Go…）：不建議「列 devDependency」（無 package.json），改建議全域安裝 prospec。

## Functional Requirements

- **FR-001**: 新增 `prospec knowledge refresh` 子指令，僅重新掃描並覆寫 `raw-scan.md`。
- **FR-002**: refresh 不得建立或覆寫 `module-map.yaml` / `_index.md` / `_conventions.md`。
- **FR-003**: 將 `raw-scan.md` 產生邏輯抽成單一共用函式，`init` 與 `refresh` 共用；`init` 對外行為不變。
- **FR-004**: refresh 支援 `--depth` 與 `--dry-run`，flag 行為與 `init` 對齊。
- **FR-005**: `archive.service` 於 knowledge-update 之後自動、非致命觸發 raw-scan refresh；`/prospec-archive` skill 文件說明此步驟。
- **FR-006**: 全程 deterministic，不呼叫任何 LLM / provider API。
- **FR-007**: 更新根目錄 `README.md`（與 `README.zh-TW.md`）反映新指令。
- **FR-008**: `/prospec-knowledge-generate` 起始先 deterministic 刷新 raw-scan，並重構前置條件（「raw-scan must exist else init」→「先 refresh，不存在則建立；`module-map.yaml` 仍由 `init` bootstrap」）。
- **FR-009**: skill 觸發 refresh 採 persona-aware CLI-availability 策略——開發者 persona（generate/archive）走 `prospec` → `pnpm exec`/`npx` → 降級的 fallback ladder；採用者 persona（quickstart）CLI 不可用時停止並提醒安裝。devDependency 建議條件化於 Node.js 專案（非-Node 改建議全域安裝）。

## Success Criteria

- **SC-001**: `prospec knowledge refresh` 執行後 `raw-scan.md` 反映當前檔案；三個 curated 檔案 byte-identical。
- **SC-002**: `--dry-run` 不寫入任何檔案。
- **SC-003**: 既有 `knowledge-init` 測試全數通過（init 行為不變）。
- **SC-004**: refresh 新增 unit + e2e 測試；專案 coverage ≥ 80%。
- **SC-005**: 含 delta-spec 的 archive 執行後 `raw-scan.md` 被刷新。
- **SC-006**: 渲染後的 `prospec-knowledge-generate` Startup Loading 含 `prospec knowledge refresh`；`startup-loading-baseline` item-set 不變、skill-format contract 全綠。

## Related Modules

- **services**: 抽出共用 raw-scan 產生函式、新增 refresh service、archive.service 串接。
- **cli**: 新增 `knowledge refresh` 指令與 formatter。
- **templates**: `/prospec-archive` skill 模板補上自動刷新說明。
- **tests**: refresh service unit 測試 + e2e；knowledge-init 回歸。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] 文件以繁體中文撰寫；程式與 commit 以英文（P1）
- [x] TDD：測試先行（P4）
- [x] 依賴方向 `cli → services → lib → types`，無逆向（Constraint）
- [x] user-facing 指令新增 → 同步更新根目錄 README（P5, SHOULD）
- [x] No violations identified

## UI Scope

**Scope:** none
