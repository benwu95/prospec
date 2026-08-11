# Tasks: add-token-measurement-harness

**Input**: Design documents from `.prospec/changes/add-token-measurement-harness/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] Description (~lines)`

- **[P]**: 可並行（不同檔案、無相互依賴）
- **~N lines**: 預估變更行數

---

## Types

- [x] T1 `src/types/measurement.ts`：TokenUsage（中立欄位 input/output/cache_read/cache_write + provider）與 Pricing（cache 折扣率/寫入倍率）Zod schema〔REQ-004〕 ~50 lines
- [x] T2 `src/types/measurement.ts`：TaskMeasurement（ok/skipped/failed + 原因）、ProviderRun（provider/model/pricing/aborted/彙總）、MeasurementReport（corpus 識別 + git commit + runs[]）Zod schema〔REQ-004〕 ~70 lines

## Lib

- [x] T3 [P] `src/lib/token-accounting.ts`：節省比、cache 命中率、有效成本純函式——pricing 作參數、無寫死常數〔REQ-003〕 ~80 lines
- [x] T4 [P] `src/lib/token-accounting.ts`：naive-rag 關鍵字計分與字典序 tie-break 純函式〔REQ-003〕 ~60 lines

## Scripts（runtime 分層之外，僅消費 lib/types）

- [x] T5 provider adapter 介面 + Anthropic adapter（client、顯式 cache_control、usage 映射、pricing 表、預設 model）；3 個 SDK 入 devDependencies + `pnpm measure:tokens` script〔REQ-002, REQ-007〕 ~90 lines
- [x] T6 [P] OpenAI adapter（自動 prefix caching、`cached_tokens` → cache_read、cache_write 記 0）〔REQ-002, REQ-007〕 ~60 lines
- [x] T7 [P] Google Gemini adapter（implicit caching、`cachedContentTokenCount` → cache_read、cache_write 記 0）〔REQ-002, REQ-007〕 ~60 lines
- [x] T8 context 組裝：full-dump / prospec（L0+L1 活引用）/ naive-rag（呼叫 T4 計分）；組裝失敗 → skipped〔REQ-001, REQ-002〕 ~90 lines
- [x] T9 runner 主流程：corpus 載入、provider 迴圈（`--provider` 選擇、無 key 跳過/中止）、×2 連送（cold/warm 同一份組裝）、每 provider 費用上限（US$10 → aborted）、git commit 快照、atomicWrite 報告〔REQ-002〕 ~100 lines

## Services

- [x] T10 `src/services/measure.service.ts`：execute({cwd, reportPath?}) → 讀檔 + Zod 驗證 → MeasureResult；缺檔丟 ProspecError（suggestion 指引先跑 runner）〔REQ-005〕 ~70 lines

## CLI

- [x] T11 `src/cli/commands/measure.ts`：registerMeasureCommand + `index.ts` 註冊〔REQ-005〕 ~40 lines
- [x] T12 `src/cli/formatters/measure-output.ts`：per-provider 區段（provider/model/agent 對應標頭）、兩 baseline 分表、input/output 分列、warm 星號註記、「數字僅同 provider 內可比」、無門檻字樣〔REQ-005, REQ-006〕 ~90 lines

## Tests

- [x] T13 [P] `tests/fixtures/token-corpus/`：10-12 個任務描述（frontmatter：標題/描述/引用模組），六模組各至少 1 個〔REQ-001〕 ~120 lines
- [x] T14 [P] `tests/unit/lib/token-accounting.test.ts`：節省比/命中率/有效成本（pricing 參數化、無常數）、確定性；TDD——先紅後綠伴隨 T3〔REQ-003〕 ~100 lines
- [x] T15 [P] `tests/unit/lib/token-accounting.test.ts`：naive-rag 計分與 tie-break 確定性；伴隨 T4〔REQ-003〕 ~60 lines
- [x] T16 [P] `tests/unit/services/measure.service.test.ts`：memfs 三路徑——正常、缺檔、schema 損毀〔REQ-005〕 ~80 lines
- [x] T17 [P] adapter usage 映射單元測試：三家 response fixture → 中立 TokenUsage（含 cache_write=0）〔REQ-002, REQ-007〕 ~70 lines
- [x] T18 `tests/e2e/cli.test.ts`：measure 指令——report fixture → stdout 斷言（兩 baseline、provider 識別、星號）；缺檔 → stderr 指引〔REQ-005〕 ~60 lines

## Docs

- [x] T19 [P] README measure 章節：G4 措辭限定、agent → provider 對應表（copilot 代理量測註記）、warm 合成命中、同 provider 內可比〔REQ-006〕 ~50 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 19 |
| Parallelizable | 10 |
| Estimated lines | ~1,400 lines |

---

## Notes

- [P] = 不同檔案、無依賴、可並行；T6/T7 依賴 T5 的 adapter 介面定義後即可並行
- TDD：T14/T15 與 T3/T4 成對（test 先紅）；commit 順序 `test:` 先於或伴隨 `feat:`
- 每完成一個 Phase 驗證一次功能；T9 完成後可對單一 provider 試跑驗證報告 schema（T2）
- ~N lines 為估計值，實際依需求微調

## Deviations

- **T5（已記錄偏差）**：provider 呼叫改用 Node 內建 `fetch` 直接打三家 REST API，不安裝 `@anthropic-ai/sdk`/`openai`/`@google/genai` —— 維持零新增 dependency（含 dev），usage 映射與 caching 行為不變。plan.md 已同步。
- **T17 檔案位置**：adapter 映射純函式抽至 `scripts/measure/usage-map.ts`，測試位於 `tests/unit/scripts/usage-map.test.ts`。
