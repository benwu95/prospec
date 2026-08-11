# Delta Spec: add-token-measurement-harness

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)

## ADDED

### REQ-MEASURE-001: 版控任務描述 corpus（活引用組裝）

**Feature:** token-measurement
**Story:** US-1

**Description:**
`tests/fixtures/token-corpus/` 版控 ≥10 個代表性 SDD 任務描述（YAML frontmatter 標注引用模組）；僅存描述，context 於量測時即時從 repo 組裝。

**Acceptance Criteria:**
1. 任務描述數 ≥10，取材覆蓋六模組（每模組至少 1 個）
2. 每個任務描述含 frontmatter：標題、描述、引用模組
3. corpus 內不存在預先組裝的 context 內容

**Priority:** High

---

### REQ-MEASURE-002: 三組裝 benchmark runner

**Feature:** token-measurement
**Story:** US-1

**Description:**
`scripts/measure-tokens.ts` 對每個任務組出 full-dump / naive-rag / prospec 三種 context，經 provider adapter 呼叫 Anthropic / OpenAI / Google API（啟用各自的 prompt caching 機制）連送兩次，記錄中立化 usage。覆蓋 README 四個 agent 的模型來源（claude→Anthropic、codex/copilot→OpenAI、antigravity→Google）。naive-rag 為決定性關鍵字計分組裝。

**Acceptance Criteria:**
1. 報告的每個已量測 provider 區段含三種組裝 × cold/warm 的 input/output/cache 讀寫 tokens
2. 三個 provider 在各自設定 API key 下皆能完成量測；指定 provider 無 key 時明確跳過（單 provider 模式則中止不寫檔），不寫出殘缺數字
3. 單一任務組裝失敗標 skipped、API 失敗標 failed（含原因），整體續跑且不以估算值填補
4. 每 provider 累計費用超過上限（預設 US$10）時停止該 provider 並標記 aborted
5. 同一任務的 cold/warm 使用同一次組裝的 context
6. 各 provider adapter 封裝 caching 啟用、usage 欄位映射與 pricing 表；無 cache 寫入計量的 provider 其 cache_write 記 0

**Priority:** High

---

### REQ-MEASURE-003: 確定性成本計算純函式

**Feature:** token-measurement
**Story:** US-1

**Description:**
`lib/token-accounting.ts` 純函式：給定多筆 usage 與 pricing（cache 折扣率/寫入倍率）計算 input-token 節省比、cache 命中率、有效成本；含 naive-rag 關鍵字計分與 tie-break。

**Acceptance Criteria:**
1. 節省比、命中率、有效成本三類計算各有單元測試且全綠
2. 函式不觸及 fs 與網路——輸入輸出皆為值
3. 相同輸入必得相同輸出（含計分 tie-break 的字典序保證）
4. pricing 為輸入參數，函式內無寫死折扣常數（Anthropic 0.1x read / 1.25x|2x write 由呼叫端傳入）

**Priority:** High

---

### REQ-MEASURE-004: 量測報告 schema 與快照識別

**Feature:** token-measurement
**Story:** US-3

**Description:**
`types/measurement.ts` 定義 `measurement-report.json` 的 Zod schema：corpus 識別、git commit 快照、per-provider 區段（provider + model + pricing + aborted 旗標 + 逐任務明細與彙總）。TokenUsage 欄位語意中立（input/output/cache_read/cache_write），provider 特定的 response 欄位於 runner adapter 層 map 入。

**Acceptance Criteria:**
1. 報告經 schema 驗證通過；缺少快照、corpus 識別或 provider 欄位即驗證失敗
2. 兩個不同 commit 產出的報告，其快照識別可區分
3. TokenUsage schema 不含任何 provider 專屬欄位名（如 `cache_read_input_tokens`、`cached_tokens`）——各家欄位由 adapter 映射
4. 報告可同時容納多個 provider 區段，各區段獨立標注 model 與 pricing

**Priority:** Medium

---

### REQ-MEASURE-005: `prospec measure` 唯讀報告顯示

**Feature:** token-measurement
**Story:** US-2

**Description:**
新增 `prospec measure` 指令：唯讀讀取 `measurement-report.json`，以 per-provider 區段顯示兩個 baseline 的節省比、cache 命中率、有效成本，input/output 分列、cold/warm 分列（warm 帶星號註記）、區段標頭含 provider + model 與對應 agent、報告標頭含快照識別。不呼叫 API。

**Acceptance Criteria:**
1. 輸出可 grep 到 full-dump 與 naive-rag 兩個 baseline 名稱、節省比、命中率、warm 星號註記，以及各已量測 provider 的識別
2. 報告檔不存在時 stderr 指引先執行量測腳本，process 不呼叫 API
3. 報告 schema 不符時顯示驗證錯誤，不輸出部分表格
4. 輸出不含任何「未達門檻」式判定字樣
5. 多 provider 報告分區段顯示，含「數字僅同 provider 內可比」註記

**Priority:** High

---

### REQ-MEASURE-006: 誠實邊界約束（無門檻、無 CI、措辭限定）

**Feature:** token-measurement
**Story:** US-2

**Description:**
本 change 不設任何節省比/命中率硬性門檻、不新增 CI workflow/job；對外措辭明示「G4 = vs full-dump baseline 的 input-token 成本」，output token 一律誠實列出；各 provider 的 cache 機制與折扣結構不同，數字僅同 provider 內可比；copilot 為模型來源（OpenAI）代理量測，不宣稱量測 Copilot harness 本身。

**Acceptance Criteria:**
1. change diff 不含 `.github/workflows/` 變更
2. 文件與 formatter 輸出含 G4 措辭限定與 warm 合成命中註記
3. codebase 內「節省 token」的展示僅引用本 harness 產出的數字
4. 文件含 agent → provider 對應表（claude→Anthropic、codex/copilot→OpenAI、antigravity→Google），並明示「數字僅同 provider 內可比」與 copilot 代理量測性質

**Priority:** Medium

---

### REQ-MEASURE-007: 多 provider 覆蓋

**Feature:** token-measurement
**Story:** US-1

**Description:**
量測支援 Anthropic / OpenAI / Google 三個 provider API，完整覆蓋 README 宣稱支援的四個 agent（claude、codex、antigravity、copilot）的模型來源；provider 可由參數選擇執行。

**Acceptance Criteria:**
1. 三個 provider 各有 adapter（client、caching 啟用、usage 映射、pricing 表、低成本預設 model）
2. `--provider` 參數可單選或預設量測所有有 key 的 provider
3. README 的 agent → provider 對應表與三個 provider 的量測說明一致

**Priority:** Medium

---

## MODIFIED

_No modifications in this change._

## REMOVED

_No removals in this change._
