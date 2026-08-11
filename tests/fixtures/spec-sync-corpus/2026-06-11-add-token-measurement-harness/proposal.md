# add-token-measurement-harness

## Background

G4「省 70-80% token」目前是未經驗證的行銷數字：codebase 沒有任何 token 量測，也沒有定義 baseline。LLM 無法誠實自報 token 用量，量測必須由 LLM 外部、確定性的程式對 provider API 的真實 `usage` 取數。量測範圍涵蓋 README 支援的四個 agent 對應的三個 provider API：Anthropic（claude）、OpenAI（codex、copilot 的模型來源）、Google Gemini（antigravity）。本 change 是波次 0 Bundle 1 的 Story A——建立量測引擎與使用者可見的報告出口，作為後續 Story B（BL-020 穩定前綴重排）before/after 驗收的唯一誠實資料源。定位為**量測工具，不設硬性門檻、不進 CI**（2026-06-11 範圍修訂，見 `planning/feature-bundles-2026-06-09.md` Bundle 1）。

## User Stories

### US-1: 執行 token 量測產出真實數字 [P1]

As a prospec maintainer,
I want 對版控的代表性 SDD 任務描述執行 benchmark 腳本，對 full-dump / naive-rag / prospec 三種 context 組裝法，自選定的 provider API（Anthropic / OpenAI / Google）取得真實 usage,
So that G4 的節省主張對四個支援 agent 的模型來源都有 LLM 外部、可重複執行的誠實資料源。

**Acceptance Scenarios:**

- WHEN 對 corpus 執行量測腳本（已設定該 provider 的 API key），THEN 產出 `measurement-report.json`，每個 provider 區段含每任務三種組裝法 × cold/warm 的 input / output / cache 讀寫 token 數
- WHEN 指定的 provider 未設定 API key，THEN 該 provider 以明確訊息跳過（或單一 provider 模式下中止），不寫出殘缺數字
- WHEN 任一任務的 context 活引用組裝失敗（如引用的 module README 不存在），THEN 該任務標記為 skipped 並列入報告，不產生估算或捏造數字

**Independent Test:** 設定單一 provider 的 API key 執行腳本，檢查報告存在且該 provider 區段結構完整；對未設 key 的 provider 確認得到明確跳過訊息而非殘缺數字。

### US-2: 檢視節省比與 cache 命中率報告 [P1]

As a prospec user,
I want 執行 `prospec measure` 看到誠實格式的量測報告（input/output 分列、cold/warm、兩個 baseline、cache 命中率）,
So that 我能得知 prospec 實際的 input-token 節省比與 cache 命中率，而非相信行銷口號。

**Acceptance Scenarios:**

- WHEN 已存在 `measurement-report.json` 時執行 `prospec measure`，THEN 顯示兩個 baseline（full-dump / naive-rag）各自的 input-token 節省比、cache 命中率、有效成本，且 input 與 output 分列
- WHEN 報告含 warm 數據，THEN warm 數字帶星號並註明「合成命中，依賴觸發頻率落在 cache TTL 內」
- WHEN `measurement-report.json` 不存在時執行 `prospec measure`，THEN 提示先執行量測腳本，不呼叫 API、不產生任何數字
- WHEN 檢視報告任一處，THEN 不出現任何「未達門檻」式的判定——報告只呈現數字，不設硬性門檻

**Independent Test:** 放入一份固定的 `measurement-report.json` fixture，執行 `prospec measure` 比對輸出含兩 baseline、星號註記與分列欄位；刪除該檔重跑，確認得到指引訊息。

### US-3: 跨次量測的可比性識別 [P2]

As a prospec maintainer,
I want 報告記錄量測當下的 repo 快照識別（git commit）與 corpus 版本,
So that 進行 BL-020 重排 before/after 比較時，能判讀兩份報告是否在可比的快照上量測。

**Acceptance Scenarios:**

- WHEN 產出報告，THEN 報告含 git commit hash 與 corpus 識別欄位
- WHEN `prospec measure` 顯示報告，THEN 標頭呈現快照識別，且 corpus 活引用的特性（數字隨 repo 演進變動屬真實現況）以註記說明

**Independent Test:** 在兩個不同 commit 各跑一次量測，確認兩份報告的快照識別不同且可區分。

## Edge Cases

- API 呼叫失敗或限流：該任務記為 failed 並列入報告統計，整體執行不中斷；絕不以估算值填補。
- output token 在不同組裝法間差異明顯：誠實列出，不從報告隱藏（G4 主張僅及 input-token 線）。
- corpus 任務描述引用的檔案已被 repo 演進移除：該任務 skipped 並在報告註明原因。
- 只有部分 provider 的 API key：只量測可用的 provider，報告明示缺漏的 provider，不互相填補。
- copilot 無公開可 benchmark 的 API：以其模型來源（OpenAI）量測，文件明示 agent → provider 對應。
- 連送兩次之間 repo 內容改變：同一任務的 cold/warm 必須使用同一次組裝的 context，不重新組裝。
- 報告檔損毀或 schema 不符：`prospec measure` 顯示明確的驗證錯誤，不輸出部分表格。

## Functional Requirements

- **FR-001**: `tests/fixtures/token-corpus/` 版控 ≥10 個代表性 SDD 任務**描述**；僅存任務描述，context 於執行時即時從 repo 組裝（活引用）
- **FR-002**: 量測腳本對每個任務組出 full-dump / naive-rag / prospec 三種 context，呼叫 provider API（啟用該 provider 的 prompt caching 機制）連送兩次（第二次測 cache 命中），記錄完整 usage（input / output / cache 讀寫）
- **FR-008**: 量測支援 Anthropic / OpenAI / Google 三個 provider API，覆蓋 README 四個 agent 的模型來源（claude→Anthropic、codex/copilot→OpenAI、antigravity→Google）；provider 可選擇執行，agent → provider 對應文件化
- **FR-003**: 成本計算為確定性純函式：給定多筆 usage，計算 input-token 節省比、cache 命中率、有效成本（cache read 以 0.1x 計）
- **FR-004**: 量測輸出 `measurement-report.json`，含 corpus 識別、git commit 快照、逐任務明細與彙總
- **FR-005**: `prospec measure` 唯讀讀取 `measurement-report.json` 顯示報告：input/output 分列、cold/warm（warm 帶星號）、兩個 baseline、cache 命中率；不呼叫 API、不燒 token
- **FR-006**: 不設任何節省比/命中率的硬性門檻；不新增任何 CI workflow 或 CI job
- **FR-007**: 報告措辭明示「G4 = vs full-dump baseline 的 input-token 成本」；output token 一律誠實列出

## Success Criteria

- **SC-001**: `tests/fixtures/token-corpus/` 內任務描述數 ≥10（檔案/條目可數）
- **SC-002**: 執行量測腳本後 `measurement-report.json` 存在，且每個已量測 provider 區段含三種組裝法 × cold/warm 的 usage 與 git commit 快照欄位（schema 驗證通過）
- **SC-006**: 三個 provider（Anthropic / OpenAI / Google）在各自設定 API key 下皆能完成量測並產出報告區段（grep 報告含三個 provider 識別）
- **SC-003**: `prospec measure` 輸出可 grep 到兩個 baseline 名稱、節省比、cache 命中率與 warm 星號註記
- **SC-004**: 成本計算純函式的單元測試全數通過，涵蓋節省比、命中率、有效成本三類計算
- **SC-005**: 本 change 的 diff 不含 `.github/workflows/` 變更（grep 驗證）

## Related Modules

- **types**: 新增量測結果的 Zod schema（keywords: zod, schema, token-budget 相符）
- **lib**: 新增確定性成本計算純函式（keywords: 共用函式, 基礎設施 相符）
- **services**: `prospec measure` 的讀取與組裝邏輯落點（execute pattern）
- **cli**: 新增 `measure` 指令與報告 formatter（keywords: commands, formatters, output 相符）
- **tests**: corpus fixtures 與單元測試（keywords: unit, fixtures 相符）

## Open Questions

- [ ] **NEEDS CLARIFICATION**: naive-rag baseline 的「樸素選擇性 context」確定性組裝規則（選檔策略、上限）需在 Plan 階段定義，避免 baseline 可被操縱
- [ ] **NEEDS CLARIFICATION**: corpus 任務的挑選來源與模組覆蓋分布（建議取材自歷史 changes 與六模組的代表性修改任務）
- [ ] **NEEDS CLARIFICATION**: 量測使用的 Anthropic model 與單次全量執行的費用上限

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified
  - 原則 1（變更文件繁中）：本 proposal 以繁體中文撰寫，code/術語維持英文 — PASS
  - 原則 3（INVEST）：三個 Story 各自獨立可測（US-1 腳本、US-2 顯示、US-3 快照識別），P1/P2 分級明確 — PASS
  - 原則 4（TDD）：FR-003 純函式為 TDD 標的；API 呼叫以注入 client 隔離 I/O 後測試 — PASS
  - 依賴方向：types ← lib ← services ← cli 正向；量測腳本置於 runtime 分層之外（`scripts/`）— PASS

## UI Scope

**Scope:** none
