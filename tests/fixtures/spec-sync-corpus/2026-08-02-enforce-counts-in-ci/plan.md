# Implementation Plan: enforce-counts-in-ci

## Overview

`pnpm counts:check` 已經是一個會 exit 1 的完整檢查器，缺的只是「誰執行它」。但直接接進 CI 會讓整套測試在同一個 job 跑兩遍（它內部自己 spawn 一次 vitest），所以本變更同時處理根因：`test:coverage` 額外寫出 vitest JSON 報告，`counts:check --from` 改吃它 —— 閘門成本降到近乎零，代價是它必須排在 `test:coverage` 之後。

關鍵設計是**斷言的形狀**：只檢查「`ci.yml` 含有 counts:check」會讓下一道被遺漏的閘門重演同一個失敗（枚舉漂移無人察覺）。因此斷言把 `test` job 的**完整指令清單**抽出來（不只 `pnpm run` 拼法），與版本控制的 baseline 依序逐項比對 —— 新增、移除、重排或改寫任何一步都必須同步改 baseline 才會綠。這是 PB-001 第 2 條（結構斷言優於內容存在性）在 workflow 上的應用。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| tests | 4 層測試金字塔；contract 層驗生成物與倉庫級契約 | vitest + `yaml`（既有依賴）解析 | 全層 |

### Existing Patterns (from _conventions.md)

- contract 測試位於 `tests/contract/`，檔名鏡射受測契約
- 既有先例：`skill-format.test.ts` 已會列舉 `.github/workflows` 目錄並對每個 workflow 做負向斷言（「無 mutation 步驟」），且刻意以「列舉目錄」而非「點名檔案」避免新 workflow 逃逸
- PB-001：斷言須 section-scoped／結構化／負向／mutation-verified

### Architecture Constraints (from Constitution)

- TDD [MUST]：先寫紅的契約斷言，再改 `ci.yml`
- User-Facing Documentation [SHOULD]：`counts:check` 的用法記載於雙語 README 與 CONTRIBUTING.md，本變更改了呼叫方式與 CI 角色，三處同步
- 依賴方向 [SHOULD]：不涉及 —— 無 src 變更

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| tests | Medium | 新增 `tests/contract/ci-workflow.test.ts`：完整指令清單封閉集合＋不可中和＋跨檔路徑一致 |
| （非模組）`scripts/sync-counts.ts` | High | 新增 `--from <file>`：吃既有 vitest 報告，取代自己 spawn 一次 |
| （非模組）`.github/workflows/ci.yml` / `package.json` / `.gitignore` | High | 閘門步驟、報告產出、產物忽略 |
| （非模組）雙語 `README` / `CONTRIBUTING.md` | Low | 記載 `--from` 用法與其 CI 角色 |

## Call Chain

```
PR opened / push to main
  → ci.yml  job: test (ubuntu-latest)
      → pnpm install --frozen-lockfile
      → pnpm run lint                                        [gate 1]
      → pnpm run typecheck                                   [gate 2]
      → pnpm run build                                       [gate 3]
      → pnpm run test:coverage                               [gate 4 — 順帶寫出 vitest-report.json]
      → pnpm run counts:check --from vitest-report.json      [gate 5 ★ 本次新增 — 吃上一步的報告，不重跑]
      → Compose coverage comment / Upload artifact   [if: always()，非閘門]
  → job: comment (needs: test)           [PR 留言，非閘門]
  → job: windows-smoke                   [不加此步 —— 計數與平台無關]
```

層級檢查：本變更不觸及 `cli → services → lib → types` 任一層，無層級風險。

## Implementation Steps

1. **RED：寫契約斷言**
   - 新檔 `tests/contract/ci-workflow.test.ts`，讀真實 `.github/workflows/ci.yml`
   - 抽出 `test` job 每個 step 的**完整指令**（block scalar 收斂為 `|`），與版本控制的 baseline 依序做相等比對
   - 此時 `ci.yml` 尚無 counts:check → 測試必紅

2. **GREEN：接上 CI 步驟並移除重複跑分**
   - `scripts/sync-counts.ts` 新增 `--from <file>`（讀既有報告、無隱式尋找、讀不到即 skip → `--check` exit 1；改寫模式直接拒絕該旗標）
   - `package.json` 的 `test:coverage` 加 `--reporter=json --outputFile.json=vitest-report.json`；`.gitignore` 收掉該產物（未忽略的新檔會讓 provenance digest 假紅）
   - `ci.yml` 的 `test` job 在 `test:coverage` 之後插入 `- run: pnpm run counts:check --from vitest-report.json`
   - 不動 `windows-smoke` 與 `comment` job

3. **補中和防護與跨檔一致性斷言**
   - 以真正的 YAML 解析（`yaml` 套件，已是既有依賴）取代文字切分：註解縮排、CRLF、`run: |` 區塊內的散文都不再影響判讀
   - 斷言閘門步驟不得帶 `if:`／`continue-on-error`，job 本身亦然（能跑但不會紅的閘門比沒有更糟）
   - 斷言 `--from` 的路徑等於 `test:coverage` 寫出的路徑；斷言 `windows-smoke` 的**指令**不含 counts（註解可以提，不誤紅）

4. **mutation 驗證**
   - 13 個 mutation 各自轉紅（刪步驟／前移／`pnpm exec` 拼法／`uses:` 動作／`|| true`／`continue-on-error: true`／`if: false`／block scalar 內行首與**縮排**的套件管理器各一／windows-smoke 加 counts 步驟（單行、block 各一）／`test:coverage` 拿掉 `--reporter=json`／install 閘門被 continue-on-error 中和），6 個 false-red 防護維持綠（windows-smoke 的 counts 註解／動作版號升級／`continue-on-error: false`／`if: success()`／block scalar 內的 shell 註解與引號字串各一），控制組全綠；每一輪 review 修復後都對**當時出貨的**實作重跑整組（前幾輪的 mutation 記錄對應的是已被取代的實作）
   - 於 review.md 逐一列名施加的 mutation 與轉紅的測試（review-format 的 naming 規則）

5. **文件與規格**
   - README／README.zh-TW 的 counts 段落：新增 `--from` 用法並陳述它在 CI 的角色
   - CONTRIBUTING.md 的 Development Workflow 補上 `pnpm counts` / `counts:check`（verify 模板宣稱「本 repo 的生成器在貢獻者文件中具名」，先前不成立）
   - delta-spec：ADDED REQ-TESTS-070、MODIFIED REQ-TESTS-059 的相關 bullet

6. **閘門**
   - `pnpm typecheck`／`pnpm lint`／`pnpm test`／`pnpm counts:check` 全綠，`prospec check --strict` 對照變更前無新增 FAIL

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 封閉集合 baseline 造成日後新增 CI 步驟時「莫名其妙變紅」 | Medium | 測試訊息直接說明「這是刻意的封閉集合：新增閘門請一併更新 baseline」，並在註解寫明理由 |
| 閘門依賴上一步的產物，路徑漂移即失效 | Medium | 讀不到報告是 skip 而 skip 讓 `--check` exit 1（fail closed）；另加跨檔斷言確保 `--from` 與 `--outputFile.json` 同路徑 |
| 殘留的舊報告讓計數比對用到過期資料 | High | **不做隱式尋找**：沒有 `--from` 就自己重新量測，有 `--from` 就只認呼叫者指名的檔案 |
| YAML 解析寫得太脆（縮排／註解變動即誤紅） | Medium | 改用既有依賴 `yaml` 做真解析，不自己切文字（審查在文字版本上實測出 2-space 註解截斷、CRLF、`run: \|` 內散文三種誤判） |
| 斷言只認 `pnpm run` 拼法，以 `pnpm exec`／`npx` 新增的閘門仍靜默漏接 | High | 比對**完整指令字串**而非腳本名；mutation D3 實測 `pnpm exec depcheck` 會轉紅 |

Knowledge Gate：Brownfield，已讀 tests README、`_conventions.md`、`_playbook.md`（PB-001/003/004/009）與 `sdd-workflow.md` 的 REQ-TESTS-059 —— PASS。
