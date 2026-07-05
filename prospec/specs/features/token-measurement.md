---
feature: token-measurement
status: active
last_updated: 2026-07-05
story_count: 4
req_count: 12
---

# Token 量測 Harness

## Who & Why

**Target users**: prospec 維護者（執行量測）與所有 agent 的使用者（檢視報告）

**Problem solved**: G4「省 70-80% token」原本是無資料源的行銷宣稱——LLM 無法誠實自報 token 用量，任何「節省」數字都只能估算捏造。

**Why it matters**: 量測由 LLM 外部、確定性的程式對 provider API 真實 `usage` 取數，讓 token 效率主張可驗證、可重現；同時是 BL-020 穩定前綴重排（Story B）before/after 驗收的唯一誠實資料源。定位為量測工具——**不設硬性門檻、不進 CI**。

## User Stories & Behavior Specifications

### US-1: 執行 token 量測產出真實數字 [P1]

As a prospec maintainer,
I want 對版控的代表性 SDD 任務描述執行 benchmark 腳本，對 full-dump / naive-rag / prospec 三種 context 組裝法，自選定的 provider API（Anthropic / OpenAI / Google）取得真實 usage,
So that G4 的節省主張對四個支援 agent 的模型來源都有 LLM 外部、可重複執行的誠實資料源。

**Acceptance Scenarios:**
- WHEN 對 corpus 執行量測腳本（已設定該 provider 的 API key），THEN 產出 `measurement-report.json`，每個 provider 區段含每任務三種組裝法 × cold/warm 的 input / output / cache 讀寫 token 數
- WHEN 指定的 provider 未設定 API key，THEN 該 provider 明確跳過（單 provider 模式下中止），不寫出殘缺數字
- WHEN 任一任務的 context 活引用組裝失敗，THEN 該任務標記 skipped 並列入報告，不產生估算數字

#### REQ-MEASURE-001: 版控任務描述 corpus（活引用組裝）
`tests/fixtures/token-corpus/` 版控 ≥10 個任務描述（frontmatter 標注引用模組），context 於量測時即時從 repo 組裝，corpus 內無預組 context。

#### REQ-MEASURE-002: 三組裝 benchmark runner
**Scenarios:**
- WHEN 量測一個任務，THEN 三種組裝各連送兩次（cold/warm 共用同一份組裝結果），spend 逐呼叫入帳
- WHEN 每 provider 累計費用超過上限（預設 US$10，任務內逐策略檢查），THEN 停止該 provider 並標記 aborted
- WHEN 任務 API 失敗，THEN 標 failed（含原因）續跑，不以估算值填補

#### REQ-MEASURE-003: 確定性成本計算純函式
節省比、cache 命中率、有效成本由 `lib/token-accounting.ts` 純函式計算；pricing（折扣率/寫入倍率）為輸入參數、無寫死常數；naive-rag 計分含字典序 tie-break，相同輸入必得相同輸出。

#### REQ-MEASURE-007: 多 provider 覆蓋
三個 provider adapter（client、caching 啟用、usage 映射、pricing 表、低成本預設 model），覆蓋 claude→Anthropic、codex/copilot→OpenAI、antigravity→Google；`--provider` 可單選或預設量測所有有 key 的 provider；無 cache 寫入計量者 cache_write 記 0。

#### REQ-MEASURE-009: glossary 組裝變體與成本對照
prospec 組裝的 opt-in 變體：啟用時於 STABLE 段尾附加 `_glossary.md`；runner 旗標 `--prospec-glossary`，啟用且未指定 `--report` 時報告另存 `measurement-report.glossary.json`。
**Scenarios:**
- WHEN 變體未啟用, THEN 既有量測行為與報告不變
- WHEN 啟用旗標, THEN prospec 組裝含 `_glossary.md` 且兩 baseline byte-identical 不受影響
- 範圍限定：對照量的是 glossary 的 input-token 成本面；反事實去重收益歸因為 deliberate exclusion（對照組無法誠實構造）

---

### US-2: 檢視節省比與 cache 命中率報告 [P1]

As a prospec user,
I want 執行 `prospec measure` 看到誠實格式的量測報告（input/output 分列、cold/warm、兩個 baseline、cache 命中率）,
So that 我能得知 prospec 實際的 input-token 節省比與 cache 命中率，而非相信行銷口號。

**Acceptance Scenarios:**
- WHEN 已存在報告時執行 `prospec measure`，THEN 以 per-provider 區段顯示兩個 baseline 的節省比、命中率、有效成本（warm 帶星號註記），不呼叫 API
- WHEN 報告檔不存在，THEN stderr 指引先執行量測腳本
- WHEN 報告 schema 不符，THEN 顯示驗證錯誤、不輸出部分表格
- WHEN 檢視任一輸出，THEN 不出現任何「未達門檻」式判定——只呈現數字

#### REQ-MEASURE-005: `prospec measure` 唯讀報告顯示
唯讀讀取 `measurement-report.json`；區段標頭含 provider + model 與對應 agent；含「數字僅同 provider 內可比」註記；零量測任務時省略比較表並明示原因。

#### REQ-MEASURE-006: 誠實邊界約束
不設任何節省比/命中率硬性門檻、不新增 CI workflow；措辭明示「G4 = vs full-dump baseline 的 input-token 成本」、output token 誠實列出、warm 為合成命中、各 provider cache 折扣結構不同、copilot 為模型來源（OpenAI）代理量測。

---

### US-3: 跨次量測的可比性識別 [P2]

As a prospec maintainer,
I want 報告記錄量測當下的 repo 快照識別（git commit）與 corpus 版本,
So that 進行 before/after 比較（如 BL-020 重排）時，能判讀兩份報告是否在可比的快照上量測。

**Acceptance Scenarios:**
- WHEN 產出報告，THEN 含 git commit hash 與 corpus 識別欄位（缺漏即 schema 驗證失敗）
- WHEN `prospec measure` 顯示報告，THEN 標頭呈現快照識別與活引用特性註記

#### REQ-MEASURE-004: 量測報告 schema 與快照識別
`types/measurement.ts` Zod schema：corpus 識別、git commit、per-provider 區段（model/pricing/aborted/逐任務明細與彙總）；TokenUsage 欄位語意中立（provider 專屬欄位由 runner adapter 映射）；可同時容納多個 provider 區段。

#### REQ-MEASURE-008: before/after 對照程序
跨快照對照的操作契約：before 快照 hash 於變更前凍結（必晚於 harness 合併點）、前置條件為 working tree 乾淨（否則 checkout 不還原、兩報告 git_commit 相同）。
**Scenarios:**
- WHEN 執行 before/after 對照, THEN 兩份報告快照識別可區分、provider 與 model 相同
- WHEN 呈現對照, THEN 只引用報告數字、不設門檻；無改善亦如實呈現
- 範圍限定（deliberate exclusion）：harness corpus 量的是 prospec 組裝管線，量不到模板層排序效益（identical 重送下順序不影響結果）；量級驗證需「跨任務部分前綴」量測模式（未來候選）

### US-4: 離線 size 估算 mode（無 API key） [P1]

As a prospec 維護者（無 provider API key 可用）,
I want `prospec measure` 提供離線估算路徑，用 `lib/token-accounting` 計各 assembly 的 size,
So that 無 key 環境也能追蹤 context 組裝規模，不再因 credential 阻塞而零數據。

**Acceptance Scenarios:**
- WHEN 環境無任何 provider API key 執行離線估算，THEN 產出 full-dump / naive-rag / prospec 三策略的 size 報告（input token 估算），全程不呼叫 provider API、不含 cache/cost
- WHEN 離線報告產出，THEN CLI 唯讀顯示 per-strategy size 與 size saving ratio，無任何門檻判定
- WHEN 既有需 API key 的線上量測路徑執行，THEN 行為不變（離線 mode 為新增，不取代）

#### REQ-MEASURE-010: 離線 size 報告 schema
`types/measurement.ts` 新增 `SizeReportSchema`（獨立於 `MeasurementReport`，不含 provider/cache/cost）：`corpus`、`git_commit`、`generated_at`、`estimator`（如 `chars-per-token:4`），每任務每組裝法的 cold input token 估算，及對兩 baseline 的 size saving ratio；`DEFAULT_SIZE_REPORT_FILENAME='size-report.json'`。
**Scenarios:**
- WHEN parse 合法 size 報告，THEN 通過；缺 `corpus`/`git_commit` 即驗證失敗
- WHEN 檢視 `MeasurementReportSchema`，THEN 欄位與行為不變（線上契約不受影響）
- 誠實邊界（deliberate exclusion）：size 報告不含 provider/pricing/cache/門檻欄位（比照 REQ-MEASURE-006）

#### REQ-MEASURE-011: harness 離線 size 產出（無 API key）
`scripts/measure-tokens.ts` `--offline`：跳過所有 provider adapter，複用 API-free 的 `measure/assemble.ts` 組裝三策略、以 `estimateTokens`（char/4 heuristic）計 size，產出 `size-report.json`；既有無 key 硬退訊息追加 `--offline` 指引。
**Scenarios:**
- WHEN 清空所有 provider env 變數後 `--offline`，THEN 全程不呼叫 provider API，產出含三策略估算的非空 `size-report.json`
- WHEN 離線輸出，THEN 明示「keyless size estimate；cache/cost 需 API key」
- WHEN 有 key 的線上路徑，THEN 行為不變

#### REQ-MEASURE-012: `prospec measure --offline` 唯讀 size 顯示
`prospec measure --offline` 唯讀讀取 `size-report.json`（`measure.service` offline 分支、`SizeReportSchema` 驗證），formatter 呈現 per-strategy size 與 size saving ratio；不呼叫 API、不含 cache/cost 欄、不做門檻判定；缺報告檔以 `PrerequisiteError` 指引先跑 `pnpm measure:tokens --offline`。
**Scenarios:**
- WHEN 存在 `size-report.json`，THEN 顯示 size 表、不呼叫 API
- WHEN 報告缺失，THEN 指引離線產出指令；schema 不符 → 顯示驗證錯誤、不輸出部分表格
- WHEN 檢視輸出，THEN 不出現任何「未達門檻」式判定（僅呈現數字）

---

## Edge Cases

- 只有部分 provider 的 API key：只量測可用者，報告明示缺漏，不互相填補
- API 限流/失敗：該任務 failed 並計入統計，整體續跑；spend 逐呼叫入帳故失敗路徑不漏計
- 跨任務 cache 污染：每任務 context 帶唯一前綴，task N>1 的 cold 仍真冷
- 小型組裝低於 provider 最小可 cache 前綴（如 haiku 4,096 tokens）：誠實記錄 0% 命中
- CRLF checkout / frontmatter 於 EOF：corpus 解析容錯，不致整跑中斷

## Success Criteria

- **SC-1**: corpus 任務描述 ≥10 且覆蓋六模組（實際 12）
- **SC-2**: 報告經 schema 驗證，含三組裝 × cold/warm usage 與快照欄位
- **SC-3**: `prospec measure` 輸出含兩 baseline、節省比、命中率、warm 星號
- **SC-4**: accounting 純函式單元測試全綠（pricing 參數化、確定性）
- **SC-5**: change diff 不含 `.github/workflows/` 變更
- **SC-6**: 三 provider 在各自 API key 下皆能完成量測（待首次真實執行驗收）

## Maintenance Rules

1. **Replace-in-Place**: MODIFIED User Stories 與 REQs 直接取代現有版本
2. **Functional Grouping**: 新需求插入對應 User Story 之下
3. **No Inline Provenance**: 歷史出處只記在 Change History 表
4. **Deprecation over Deletion**: 移除的需求移至 Deprecated 區段

## Deprecated Requirements

_(None)_

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|-------------|
| 2026-06-11 | add-token-measurement-harness | 新 Feature：多 provider token 量測 harness + 唯讀報告 CLI | US-1~3, REQ-MEASURE-001~007 |
| 2026-06-11 | reorder-stable-prefix-loading | before/after 對照程序（含歸因 deliberate-exclusion 邊界）+ glossary 組裝變體 | REQ-MEASURE-008~009 (ADDED) |
| 2026-07-05 | unlock-measurement | 離線 size 估算 mode：無 API key 也能追蹤 context 組裝規模（SizeReportSchema 獨立於 MeasurementReport、harness `--offline` 產 size-report.json、`prospec measure --offline` 唯讀顯示、誠實邊界無門檻；LiteLLM 評估後不採用，沿用 char/4 heuristic）（issue #61） | US-4; REQ-MEASURE-010~012 (ADDED) |
