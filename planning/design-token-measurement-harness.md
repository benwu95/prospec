# 技術設計：Token 量測 Harness（讓 G4 可驗證）

> 對應 `backlog-evaluation-2026-06-07.md` 第二節（G4）與第五節第一波。
> 目的：把 G4「省 70~80% token」從**行銷數字**變成**可驗證**的工程主張。
> 建立日期：2026-06-07 ｜ 適用版本：Prospec v0.1.7+
>
> **範圍修訂（2026-06-11 `/prospec-explore` 收斂）**：harness 定位為**使用者可見的量測工具**——讓使用者得知實際的 input-token 節省比與 cache 命中率。**不設硬性門檻、不進 CI**；corpus 改為**活引用**（版控任務描述、context 即時組裝）；薄 `prospec measure` 納入首發；拆兩 story（A 量測引擎先、B BL-020 重排後）；量測經 provider adapter 支援 **Anthropic / OpenAI / Google** 三個 API，覆蓋 README 四個 agent 的模型來源（claude→Anthropic、codex/copilot→OpenAI、antigravity→Gemini），數字僅同 provider 內可比。詳見 `planning/feature-bundles-2026-06-09.md` Bundle 1「範圍修訂」。本文以下內文已同步改寫。

---

## 一、問題定義

G4 宣稱「比一般 prompt engineering 省 70~80% token」，但：

1. **codebase 全域沒有任何 token 量測**（已驗證 `src/` 無計數碼）。
2. backlog 沒有定義 **baseline**——「省 70-80%」是相對於什麼？
3. 一整批 backlog 項目（BL-026 Dashboard、OPT-A2/A3/C/D4）都想「展示節省的 token」，但**沒有資料源**，只能填估算/捏造數字 → 製造 Böckeler 批評的「false sense of control」。

**因果倒置**：backlog 先排了一堆「展示數字」的項目，卻沒排「產生真實數字」的項目。本 harness 是那些項目唯一的誠實資料源，必須先做。

---

## 二、查證後確立的量測原則（誠信約束）

來自 Anthropic 官方定價頁 + Manus + Chroma + Anthropic advanced tool use 的查證：

| 約束 | 內容 | 對量測的要求 |
|---|---|---|
| **只算 input-token 線** | cache / progressive disclosure **不影響 output/reasoning token** | 報告分開列 `input` vs `output`，G4 數字只宣稱 input 線 |
| **cache 折扣依 provider 而異** | Anthropic read 0.1x、寫入 1.25x(5min)/2x(1h)；OpenAI ~0.5x、Gemini ~0.25x（皆自動 caching、無寫入計量） | pricing 作為計算參數不寫死；報告含 cache 讀寫量，算「有效成本」非「token 數」；數字僅同 provider 內可比 |
| **命中率是最大未知** | prospec 是間歇式 slash 觸發，非 always-on agent；TTL 5min/1h | 報告須含 **cache 命中率**，並標注觸發頻率假設 |
| **baseline 必須明示** | vs「每回合 dump 整個 codebase」=容易贏；vs「已選擇性給 context」=收益小得多 | 跑**兩個 baseline**，分別報告 |

**結論主張的正確措辭**：
> 「在『每回合把整個 codebase + spec 倒進 context』的 baseline 下，prospec 的分層漸進揭露 + KV-cache 穩定前綴可省 70-80% 的 **input-token 成本**；相對於『已會選擇性給 context』的工程師，邊際收益較小。output token 不受影響。」

---

## 三、量測架構

prospec 本身不直接呼叫 Anthropic API（它是 skills + CLI，跑在 Claude Code / 其他 harness 內）。因此量測分兩種模式：

### 模式 A：離線 benchmark（決定性計算、可重複執行）

獨立 benchmark 腳本，對版控的「代表性 SDD 任務描述」（context 即時從 repo 組裝）經 provider adapter 用 Anthropic / OpenAI / Google API 各跑兩種 context 組裝法，直接讀 API 回傳的 `usage`（各家欄位由 adapter 映射至中立 schema）。

```
scripts/measure-tokens.ts
  輸入：tasks corpus（版控的 N 個代表性任務描述，如「為 X 模組加一個 service」；context 活引用、執行時即時組裝）
  對每個 task，組兩種 prompt：
    baseline-full：dump 整個 codebase + 所有 spec（full-dump 稻草人）
    baseline-rag ：一個樸素 RAG / 選擇性 context（公平 baseline）
    prospec      ：L0(_index+_conventions) + L1(相關 module README) + 穩定前綴排序
  各送 provider API（啟用各家 prompt caching：Anthropic 顯式 cache_control、OpenAI/Gemini 自動 prefix caching）
  讀 usage：input / output / cache 讀寫（中立欄位；Anthropic cache_read_input_tokens、OpenAI cached_tokens、Gemini cachedContentTokenCount 由 adapter 映射）
  連送兩次（第二次測 cache 命中）
  輸出 report：每 task 與 baseline 的 input-token 成本比、cache 命中率
```

> 此模式是 G4 的**誠實資料源**：使用者執行後得到當下快照的真實量測報告。corpus 活引用意味數字隨 repo 演進變動——這屬真實現況，正是要呈現的東西；同一次快照內三種組裝法的相對比值（節省比、cache 命中率）仍可比，BL-020 的 before/after 在同快照各量一次即成立。**不設硬性門檻、不進 CI**（2026-06-11 範圍修訂）；未來若需守門，可基於同一份 report 補上標記 `@benchmark` 的選擇性 job（不進每 PR 主流程，避免燒 token，呼應 BL-030 risk）。

### 模式 B：線上 instrumentation（可選，低優先）

當 prospec 跑在 Claude Code 內時，harness 已回報 usage。可在 archive 時選擇性記錄該 change 整輪的 token 用量（若 harness 暴露），寫進 `metadata.yaml` 的 `quality_metrics`（對齊 OPT-C）。**但這依賴 harness 暴露 usage、非決定性，僅作趨勢參考，不作 G4 的權威數字。**

---

## 四、落地架構（對齊 types→lib→services→cli 分層）

| 層 | 新增 | 職責 |
|---|---|---|
| **types** | `types/measurement.ts` | `TokenUsage`、`MeasurementResult`、`Baseline` 的 Zod schema |
| **lib** | `lib/token-accounting.ts` | 純函式：給定多筆 usage → 算 input-line 成本、cache 命中率、節省比（**確定性、可單元測試**） |
| **scripts** | `scripts/measure-tokens.ts` | 模式 A benchmark runner + 三個 provider adapter（呼叫 Anthropic / OpenAI / Google API，需對應 key），產出 `measurement-report.json` |
| **fixtures** | `tests/fixtures/token-corpus/` | 版控的代表性任務**描述**（context 活引用、執行時即時組裝） |
| **cli** | `prospec measure` | 薄指令：唯讀讀 `measurement-report.json` 顯示報告（不呼叫 API、不燒 token），依 parse → execute → format 慣例經 services |

**Skills-First 取捨**：成本計算是**確定性運算** → 放 lib（純函式、可單元測試）。API 呼叫是**外部 I/O + 需 key** → 放 scripts（不進主 CLI，避免讓一般使用者誤觸發燒 token）；主 CLI 只放唯讀顯示的 `prospec measure`——feature 價值是「使用者可見」，報告呈現是使用者觸點。

---

## 五、報告格式（給人看的誠實版本）

```
## Token Measurement Report (corpus: sdd-tasks-v1, N=12)

Baseline: full-dump (entire codebase + all specs per turn)
| Metric                    | full-dump | prospec | saving |
|---------------------------|----------:|--------:|-------:|
| input tokens (cold)       |   142,000 |  18,400 |  87.0% |
| input cost (cold, $)      |     0.426 |   0.055 |  87.1% |
| cache hit rate (2nd call) |        0% |    91%  |    —   |
| effective input cost (warm)|    0.426 |   0.011 |  97.4% |  ← 0.1x cache read
| output tokens             |    34,000 |  33,500 |   1.5% |  ← 不受影響，誠實列出

Baseline: naive-rag (selective context)
| input tokens (cold)       |    41,000 |  18,400 |  55.1% |  ← 公平 baseline，收益較小

⚠️ G4 主張僅適用 input-token 線；output 不受影響。warm 數字依賴觸發頻率落在 cache TTL 內。
```

---

## 六、驗收標準

- [ ] `lib/token-accounting.ts` 純函式 + 單元測試（給定 usage → 正確算節省比/命中率）
- [ ] `tests/fixtures/token-corpus/` 版控 ≥10 個代表性 SDD 任務**描述**（context 活引用組裝）
- [ ] `scripts/measure-tokens.ts` 對 full-dump / naive-rag / prospec 三種組裝各跑出 usage
- [ ] 三個 provider（Anthropic / OpenAI / Google）在各自 key 下皆可量測，覆蓋四個 agent 的模型來源；報告 per-provider 分區段
- [ ] 報告**同時**列 input 與 output、cold 與 warm（warm 帶星號）、cache 命中率、兩個 baseline
- [ ] `prospec measure` 唯讀顯示上述報告（不呼叫 API），呈現完整度即驗收重點
- [ ] 文件明示「G4 = vs full-dump baseline 的 input-token 成本」措辭
- [ ] **不設任何節省比/命中率的硬性門檻、不進 CI**（2026-06-11 範圍修訂；CI `@benchmark` job 移出範圍，未來需要時基於同一份 report 補上）
- [ ] BL-026/OPT-A2/A3/C/D4 的任何「節省 token」展示，資料源**只能**來自本 harness，禁止估算捏造

---

## 七、與其他 backlog 的關係

- **解鎖**：BL-020（KV-cache）——重排穩定前綴後，本 harness 量測命中率證明它有效，否則只是「重排了但沒人知道有沒有用」。
- **守門**：BL-026 Knowledge Dashboard、OPT-A2/A3/C/D4——這些「展示數字」項目在本 harness 之前一律 CUT/BUILD-LATER，否則是捏造數字溫床。
- **保護**：BL-030 Drift CI——用本 harness 判定「LLM-in-CI 路徑」是否反噬 token（會），佐證 BL-030 必走決定性引擎路徑。
