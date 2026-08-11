# Implementation Plan: add-token-measurement-harness

## Overview

G4「省 70-80% token」缺乏 LLM 外部的誠實資料源。本 change 建立 token 量測 harness：對版控的代表性 SDD 任務描述（context 活引用、執行時即時組裝）呼叫 Anthropic API，量出 full-dump / naive-rag / prospec 三種 context 組裝法的真實 usage，並以 `prospec measure` 讓使用者檢視 input-token 節省比與 cache 命中率。定位為量測工具——不設硬性門檻、不進 CI。

關鍵設計決策（解掉 proposal 三個 Open Questions）：(1) **naive-rag 組裝規則**＝決定性關鍵字重疊計分——任務描述斷詞後對檔案路徑與標題計分，依分數＋路徑字典序 tie-break 選 top 檔案直到 token 上限；計分為純函式放 lib 可單測。(2) **corpus 取材**＝10-12 個任務描述，取材自歷史 changes 與六模組（每模組至少 1 個代表性修改任務），以 YAML frontmatter 標注引用模組。(3) **model 與費用**＝每個 provider 取低成本 tier 為預設（Anthropic: `claude-haiku-4-5`；OpenAI / Google 各取對應低成本 model，集中於 runner 常數表、可參數覆寫——量測標的是 context 大小與 cache 行為，與模型能力無關），統一 `max_tokens` 上限控 output 成本；費用上限為每 provider run 各 US$10（可覆寫），超限即停止並輸出標記 `aborted` 的部分報告。(4) **多 provider 支援**＝量測涵蓋 Anthropic / OpenAI / Google 三個 provider API，覆蓋 README 四個 agent 的模型來源（claude→Anthropic、codex/copilot→OpenAI、antigravity→Google Gemini）；usage schema 欄位語意中立（含 `provider` 欄位），各 provider 的 response 欄位與 caching 機制差異（顯式 `cache_control` vs 自動 prefix caching）封裝於 runner 的 provider adapter；pricing（cache 折扣率/寫入倍率）作為純函式參數不寫死。報告數字僅在**同 provider 內可比**，formatter 與文件明示。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| types | Zod schemas、錯誤階層（leaf） | ProspecError、ChangeMetadataSchema | zod only |
| lib | 無狀態共用函式 | atomicWrite()、readConfig()、scanDir() | types |
| services | 業務邏輯，`execute(options) → Promise<Result>` | 10 個 service execute | types, lib |
| cli | 薄 I/O 層：parse → execute → format | registerXxxCommand()、formatXxxOutput() | types, services |
| tests | 4 層金字塔（unit/contract/integration/e2e） | vitest + memfs | all |

### Existing Patterns (from _conventions.md)
- Service Pattern：每個 service 匯出 `execute(options): Promise<Result>`；新 command 需配 service + formatter + index.ts 註冊 + E2E
- File Write：一律 `atomicWrite()`；錯誤類別繼承 `ProspecError`（code + suggestion）
- 測試：memfs mock fs、AAA、測試檔鏡像來源路徑；E2E spawn 真實 CLI

### Architecture Constraints (from Constitution)
- 依賴方向 `cli → services → lib → types`，禁止反向 import
- TDD：RED → GREEN → REFACTOR，`test:` commit 先於或伴隨 `feat:`
- 原子 commit、Conventional Commits、無 AI 署名

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| types | Medium | 新增 `measurement.ts`：TokenUsage（欄位語意中立 + `provider` 欄位）、TaskMeasurement、MeasurementReport、Baseline、Pricing 的 Zod schema（含 git commit 快照與 corpus 識別欄位） |
| lib | High | 新增 `token-accounting.ts`：節省比、cache 命中率、有效成本（pricing 折扣率/寫入倍率作為參數，函式內無寫死常數）、naive-rag 關鍵字計分——全部確定性純函式 |
| services | Medium | 新增 `measure.service.ts`：讀取並以 Zod 驗證 `measurement-report.json` → MeasureResult |
| cli | Medium | 新增 `commands/measure.ts` + `formatters/measure-output.ts`：唯讀顯示，不呼叫 API |
| tests | High | unit（token-accounting、measure.service）、e2e（measure 指令）、`tests/fixtures/token-corpus/`（≥10 任務描述） |
| scripts（層外） | New | `measure-tokens.ts`：API runner + 三個 provider adapter（client / caching 啟用 / usage mapper / pricing 表）；以 Node 內建 `fetch` 直呼 REST API，零新增 dependency（含 dev） |

## Call Chain

```
prospec measure（唯讀顯示）
  → cli/commands/measure.ts: registerMeasureCommand → action(options)
  → services/measure.service.ts: execute({cwd, reportPath?})        [讀檔 + Zod 驗證]
  → types/measurement.ts: MeasurementReportSchema.parse(json)       [schema 不符 → ProspecError]
  → cli/formatters/measure-output.ts: formatMeasureOutput(result)   [stdout；錯誤走 handleError → stderr]

scripts/measure-tokens.ts（量測執行，runtime 分層之外）
  → loadCorpus(fixtures/token-corpus/)                              [讀任務描述 + frontmatter]
  → for each provider（--provider 選擇；無 key 即跳過並記錄）
    → assembleContexts(task): full-dump | naive-rag | prospec       [活引用即時組裝；rag 計分呼叫 lib 純函式]
    → providerAdapter.send(context) ×2                               [cold + warm；統一 max_tokens；每 provider 費用上限]
    → providerAdapter.mapUsage(response) → TokenUsage                [provider 欄位 → 中立 schema + provider 標記]
    → lib/token-accounting.ts: computeSavings(usages, adapter.pricing) / hitRate(usages)
  → lib/fs-utils.ts: atomicWrite('measurement-report.json')          [per-provider 區段 + git commit 快照識別]
```

## Implementation Steps

1. **types：量測 schema**
   - 新增 `src/types/measurement.ts`：TokenUsage（欄位語意中立：input/output/cache_read/cache_write + `provider`）、Pricing（折扣率/寫入倍率）、逐任務量測（含 skipped/failed 狀態與原因）、報告層（corpus 識別、git commit、provider + model、aborted 旗標）
   - 全部欄位走 Zod，供 service 端驗證報告檔

2. **lib：token-accounting 純函式（TDD 起點）**
   - 先寫失敗測試：節省比、cache 命中率、有效成本（pricing 作為參數——Anthropic 預設 0.1x read / 1.25x|2x write 由呼叫端傳入）、naive-rag 關鍵字計分與 tie-break
   - 實作至綠燈後重構；不碰 fs、不碰 API——輸入輸出皆為值，函式內無寫死折扣常數

3. **corpus 建置**
   - `tests/fixtures/token-corpus/` 放 10-12 個任務描述（md + YAML frontmatter：標題、描述、引用模組、預期 L1 README）
   - 取材：歷史 changes 的真實任務改寫 + 六模組每模組至少 1 個代表性修改任務

4. **scripts：benchmark runner + provider adapters**
   - `scripts/measure-tokens.ts`：讀 corpus → 每 provider（`--provider` 選擇，預設量測所有有 key 的 provider）→ 三種組裝 → API ×2（各 provider 的 caching 機制：Anthropic 顯式 `cache_control`，OpenAI / Gemini 自動 prefix caching）→ adapter 將 usage map 至中立 TokenUsage → 以該 adapter 的 pricing 表呼叫 accounting → 寫 per-provider 報告區段
   - 三個 provider adapter 各封裝：client 建立、caching 啟用、usage 欄位映射（OpenAI `cached_tokens`、Gemini `cachedContentTokenCount` → `cache_read`；無 cache 寫入計量者 `cache_write` 記 0）、pricing 表、低成本預設 model
   - 防護：指定 provider 無 key 即明確跳過（單 provider 模式則中止不寫檔）；單任務失敗標 failed 續跑；每 provider 費用超限標 aborted 停止該 provider；cold/warm 用同一份組裝結果
   - provider 呼叫以 Node 內建 `fetch` 直打 REST API（零新增 dependency）；新增 `pnpm measure:tokens` script

5. **services：measure.service**
   - `execute({cwd, reportPath?})`：讀 `measurement-report.json` → Zod 驗證 → MeasureResult；檔案不存在丟 `ProspecError`（suggestion 指引先跑 runner）
   - unit tests（memfs）：正常、檔案不存在、schema 損毀三路徑

6. **cli：measure 指令與 formatter**
   - `registerMeasureCommand` + `formatMeasureOutput`：per-provider 區段顯示（標頭含 provider + model 與 agent 對應）、兩 baseline 分表、input/output 分列、warm 帶星號註記、標頭含快照識別、註記「數字僅同 provider 內可比」、無任何門檻判定字樣
   - 註冊於 `cli/index.ts`；E2E 測試（report fixture → 輸出斷言；缺檔 → stderr 指引）

7. **文件與措辭**
   - README 增 measure 章節：G4 措辭明示「vs full-dump baseline 的 input-token 成本」、warm 為合成命中、output 不受影響；agent → provider 對應表（claude→Anthropic、codex/copilot→OpenAI 模型來源、antigravity→Google）；cache 折扣結構各 provider 不同，數字僅同 provider 內可比
   - 報告產出後任何「節省 token」展示僅能引用本 harness 數字

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| API 費用失控（full-dump 每次送整個 codebase × 3 provider） | Medium | 各 provider 低成本 tier 預設 + 統一 max_tokens + 每 provider 費用上限（預設 US$10，超限 aborted）；corpus 控制在 10-12 任務 |
| naive-rag baseline 被質疑「故意做弱」 | Medium | 組裝規則為版控的確定性純函式（可重現、可審查）；報告同列兩 baseline，從不單獨引用 full-dump |
| 活引用 corpus 數字隨 repo 演進漂移被誤讀為退化 | Medium | 報告強制帶 git commit 快照識別；formatter 註記「跨快照數字不可直接比較」 |
| warm 命中率被當成 production 保證 | Low | formatter 固定輸出星號註記與 TTL 前提；G4 措辭僅及 input-token 線 |
| 跨 provider 數字被直接互比（tokenizer 與折扣結構皆不同） | Medium | 報告 per-provider 分區段；formatter 與文件明示「數字僅同 provider 內可比」；節省比於各 provider 區段內自洽計算 |
| OpenAI / Gemini caching 為自動機制，無法顯式控制命中 | Medium | adapter 以「立即連送兩次」誘發 prefix cache；報告標注各 provider 的 caching 機制與 TTL 前提；無法保證命中時誠實呈現低命中率，不作弊 |
| copilot 無公開 benchmark API，僅能以模型來源代理 | Low | 文件明示 agent → provider 對應與「代理量測」性質；不宣稱量測 Copilot harness 本身 |
| scripts 被誤認為第五個 runtime 分層 | Low | scripts 僅單向消費 lib/types（與 cli 同向）；SDK 列 devDependency；文件明示「層外工具」 |
| E2E 因新增指令名/選項變動而脆弱 | Low | 依 cli 模組慣例：E2E 僅測關鍵路徑，格式斷言放 unit/formatter 層 |

## Knowledge Quality Gate

- Context mode: **Brownfield**（6 模組 README）— PASS
- Module Knowledge: types/lib/services/cli/tests README 已載入 — PASS
- Technical Summary: 已合成 — PASS
- Feature Specs: 已檢視 `ai-knowledge.md`（SC-3「節省 70%+ token」即本 harness 的待驗證主張，未來資料源回鏈）與 `product.md` — PASS
