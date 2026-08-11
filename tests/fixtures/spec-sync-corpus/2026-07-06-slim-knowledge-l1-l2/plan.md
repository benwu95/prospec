# Implementation Plan: slim-knowledge-l1-l2

## Overview

實作 issue #64 L1/L2 知識層瘦身。策略：**結構性根治 + 護欄校準**。根因是 index.md Description 欄與 module README 逐變更累積 L2/L3 級細節，違反自訂 Principle 2。做法分三軸：(1) 把 index Description 的單一來源 `module-map.yaml` `description` 欄壓成 routing-only；(2) 誠實校準 `l1_per_file` 1500→1800（實測健康 6-模組 index 結構性下限約 1562，1500 偏緊）；(3) 6 個 module README 依既有 convention 抽 sub-module / trim 到 ≤400 tokens + ≤100 lines。不改任何量測/渲染邏輯（collector/evaluator/index-table/knowledge-update 皆不動），僅改 DEFAULT 常數值、被量測的知識檔內容、文件字樣與相關測試斷言。防回彈交由 #63 的 knowledge-size WARN 護欄。

## Technical Summary (Brownfield)

- **量測範圍（不變）**：`collectKnowledgeSize` 只讀 index.md + 4 個 `CORE_CONVENTIONS`（L1）+ 各 `modules/*/README.md`（L2）；**sub-module `.md` 與 feature spec 不在量測範圍**——把 README 內容抽到 `modules/{name}/{sub}.md` 即把 tokens 移出被量測檔（約定認可作法，`_module-readme-conventions.md` §Sub-Modules）。
- **index Description 單一來源**：`module-map.yaml` `description` → `buildIndexTable`（`lib/index-table`）→ index.md auto-block。手改 index cell 會被再生蓋回；`backfillCuratedFromIndex` 只填 module-map 空欄、不覆蓋非空值。故持久瘦身須改 module-map，並同步手改 index.md 現值。
- **預算單一來源**：`DEFAULT_KNOWLEDGE_TOKEN_BUDGET`（`src/types/config.ts`，REQ-TYPES-061）為閾值與 index.md 宣告值的唯一權威。REQ-TESTS-048 的 single-source 測試動態讀 index.md Progressive Loading 表數值斷言 == DEFAULT——**改預設值必須同步改 index.md 宣告字樣**，否則該測試 FAIL。
- **sub-module 無程式支援**：純 convention/LLM 驅動，無 scanner/drift 驗證。抽取時須保留 README 的 cross-cutting 段（Dependencies/Modification Guide/Pitfalls 概覽），僅移出獨立且龐大的 Key Files/Public API 明細。

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| types | Medium | `DEFAULT_KNOWLEDGE_TOKEN_BUDGET.l1_per_file` 1500→1800（僅值，schema 不動） |
| lib | Low | 不改邏輯；`index-table`/`token-accounting`/`drift-*` 僅為受影響行為的量測來源 |
| services | Low | 不改邏輯；`knowledge`/`knowledge-update` 為 index/README 再生路徑（再生後仍須維持瘦身） |
| templates | Low | `index.md.hbs`/knowledge skills 若硬編 1500 budget 字樣則同步（多為動態注入，待查） |
| tests | Medium | 斷言 l1_per_file==1500 的測試改 1800；single-source 測試（動態讀）值自動對齊 |
| 知識庫（非 src） | High | `module-map.yaml` descriptions、`index.md`、6 README + 新 sub-module 檔、`_status-lifecycle.md`（視情況） |

## Call Chain（預算校準路徑，僅值變動）

```
.prospec.yaml? ─▶ resolveKnowledgeTokenBudget(config)        [services/check.service]
                    └─ DEFAULT_KNOWLEDGE_TOKEN_BUDGET 逐欄 ??  [types/config.ts]  ← 改 l1_per_file 1500→1800
                 ─▶ collectKnowledgeSize(cwd, baseDir, kPath, budget)  [lib/drift-sources]  (不改)
                 ─▶ evaluateKnowledgeSize(items, budget)              [lib/drift-checker]   (不改，門檻隨 budget)
single-source test ─▶ 讀 index.md Progressive Loading 宣告值 == DEFAULT  [tests/REQ-TESTS-048]  ← index.md 宣告字樣須同步改 1800
```

## Implementation Steps

1. **預算校準（US-2）** — 改 `src/types/config.ts` `DEFAULT_KNOWLEDGE_TOKEN_BUDGET.l1_per_file` 1500→1800。`grep` 全 repo（src/tests/templates/知識文件）殘留 `1500`/`1,500` budget 字樣，逐一評估更新。
2. **對齊測試（US-2）** — 更新斷言 l1_per_file==1500 的測試為 1800；確認 REQ-TESTS-048 single-source 測試的 index.md 值抽取仍成立。`pnpm build && pnpm test` 綠。
3. **index.md 宣告字樣（US-2）** — 改 index.md Progressive Loading 表「≤ 1,500 tokens per file」→「≤ 1,800 tokens per file」（single-source 測試依賴此）。
4. **index Description 瘦身（US-1）** — 逐模組把 `module-map.yaml` `description` 壓成 routing-only（1-2 句定位 + counts 對齊事實），同步手改 index.md auto-block Description cell 使兩者一致。`knowledge-size` 對 index.md 轉 PASS。
5. **README 綠化（US-3）** — 逐一 services/lib/templates/tests/types/cli：把龐大且獨立的 Key Files/Public API 明細抽為 `modules/{name}/{sub}.md`，README 保留概覽 + `## Sub-Modules` 連結；trim 至 ≤400 tokens + ≤100 lines。確認 sub-module 未入 index/module-map。
6. **驗證收斂** — `node dist/cli/index.js check` 全 11 check（knowledge-size PASS 或僅 `_status-lifecycle` 視 trim 決定）；`pnpm counts:check` 無 drift；`pnpm test` 綠。
7. **（條件）`_status-lifecycle.md` trim** — 若能在不損 canonical 生命週期表/轉移語意下壓進 1800，順帶 trim 讓 knowledge-size 完全 PASS；否則保留並記錄它非本輪瘦身檔。

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 改預設值漏改 index.md 宣告 → REQ-TESTS-048 single-source 測試 FAIL | High | Step 2/3 綁定：改 config 同時改 index.md 宣告字樣，`pnpm test` 把關 |
| index Description 瘦身把 module-map 舊 counts（82/1985）帶回 index | Medium | Step 4 對齊事實值；`pnpm counts:check` 驗證 |
| README 抽 sub-module 過度 → 地圖失去導覽 | Medium | 保留 Dependencies/Modification Guide/Pitfalls 概覽，只移獨立明細；review 階段檢查 |
| sub-module 誤列入 index/module-map（無程式驗證） | Medium | Step 5 收尾 `grep` 檢查；review lens 覆核 |
| 依賴方向：本輪僅改 types 常數值 + 知識檔，無跨層新依賴 | Low | 維持 `cli→services→lib→types`；不新增 import |
