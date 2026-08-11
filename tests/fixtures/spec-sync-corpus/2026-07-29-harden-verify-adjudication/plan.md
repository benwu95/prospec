# Plan: harden-verify-adjudication

## Overview

本變更修復 issue #103 收整的全部缺陷：三條違反 `split-verify-adjudication` 自身 spec 不變量的行為缺陷（已記錄失敗被 collector 抑制、escaped-defects 別名重複計數、grade A WARN 豁免不完備）、headline fail-closed 修正的回歸防護缺口，以及 13 條次要清單（全修）。核心原則沿用 #102 自己確立的裁決哲學：**已記錄的事實先於可用性判定**——判一筆已記錄的失敗不需要可跑的命令，正如 evaluator 層已把「已記錄失敗」排在「狀態未知」之前，本案把同一順序推上 collector 層。

實作策略：collector 不再把「test command 無法解析」當成整個 source 的 `unavailable` early-return，而是照常枚舉 changes、把不可解析降格為 source 上的一個事實欄位，由純 evaluator 排序裁決（recorded failure → FAIL 優先於 resolvability skip）。escaped-defects 的 blamed 集合改以解析後的 canonical change 身分為 key（`passed` 分母既有的 gateSets 身分機制既已正確，對齊之）。模板豁免以封閉列舉改寫並以 mutation-verified 契約測試釘住。其餘為局部一行修與文件／資料修正。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| lib | drift collectors（全部 I/O）＋純 evaluators、markdown-fences、escaped-defects 聚合 | `collectTestProvenance`, `runChecks`, `aggregateEscapedDefects`, `withoutFencedBlocks` | types |
| services | check 編排——digest 算一次注入、`--record-tests`/`--escaped-defects` 非 check 模式 | `check.service.execute()` | types, lib |
| cli | check 旗標與 help 文字、formatter | `registerCheckCommand`, `formatCheckOutput` | types, lib, services |
| types | `drift-report.ts` 註解（`DRIFT_CHECK_IDS` frozen，不動 id） | `DRIFT_CHECK_IDS` | zod |
| templates | `prospec-verify.hbs` 豁免列舉、`config-example.yaml.hbs` | 純資源，經 `renderTemplate` | — |
| tests | 四層——unit（真 temp dir 跑 git suites）＋contract（section-scoped、mutation-verified） | `pnpm test` | 全部 |

### Existing Patterns (from module READMEs)

- **failure-before-staleness ordering**（`drift-checker.ts` test-provenance evaluator）：已記錄失敗的分支排最前且無豁免——US-1 把同一 pattern 套到 collector/evaluator 邊界
- **unavailable → skipped, never vacuous pass**：collector 回 `{available:false, reason}` → evaluator 記 skip——US-1 保留此語意於「無紀錄＋不可解析」情境
- **canonical identity via gateSets**：`passed` 分母已按 change 身分計數——US-2 讓 `escaped` 分子對齊同一機制
- **PB-001 contract assertions**：section-scoped、mutation-verified，禁止全文件 `toContain`——US-3/US-7 的新斷言照此
- **shipped `.hbs` 兩步出貨**：`pnpm bundle` → `npx tsx src/cli/index.ts agent sync`（`pnpm exec prospec` 會解析到全域舊版）

### Architecture Constraints (from Constitution)

- 依賴方向 `cli → services → lib → types`；`markdown-fences` 維持 lib 內單向被 import（constitution-parser／drift-sources → markdown-fences，不可反向）
- TDD：每條行為修正先有在現行行為下轉紅的測試（SC-001／SC-003 的 mutation 證據是本案核心驗收）
- 原子 commit：US 群組各自成 commit，訊息英文、bullet body、無 co-author

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| lib | High | `drift-sources.ts`（US-1 collector 重排、US-4 ls-files fail-closed、US-2 trim）、`drift-checker.ts`（US-1 evaluator 排序、US-5 draft-gated 豁免）、`escaped-defects.ts`（US-2 keying）、`markdown-fences.ts`（US-6 CommonMark） |
| tests | High | ordering／mixed-alias／unborn-HEAD／markdown-fences 新測試；契約測試豁免 pin＋wrap 鬆綁 |
| templates | Medium | `prospec-verify.hbs` 豁免封閉列舉；`config-example.yaml.hbs` shell-free 範例 |
| services | Medium | `check.service.ts`：record 前置檢查的 reason 誠實化（US-4）、寫回前 re-merge（US-8） |
| cli | Low | `commands/check.ts` help 文字按模式寫對輸出檔名 |
| types | Low | `drift-report.ts:57` 註解對齊 evaluator 行為（id 清單本體不動） |

## Call Chain

```
prospec check                                        [純 check 路徑——US-1 主鏈]
  → check.service.execute({})
  → computeChangeDigest(cwd)                         [一次，注入兩個 collector；US-4 兩處擷取 fail-closed]
  → collectTestProvenance(cwd, testCommand, digest, probe)
      枚舉 .prospec/changes/**（不再因 command 不可解析 early-return）
      → { available, command_unavailable_reason, changes[] }
  → runChecks(inputs) → evaluateTestProvenance
      per change：recorded exit≠0 → FAIL（最優先，含 backfill）
      → command_unavailable → skip（honest reason）
      → 無紀錄 → FAIL ／ stale → FAIL ／ 相符 → pass
  → formatCheckOutput(report)

prospec check --record-tests                          [US-8 鏈]
  → check.service.recordTestProvenance
  → 前置檢查（command/git/metadata）→ runTestCommand（spawn 全程不持有 doc）
  → 重讀 metadata.yaml（post-run）→ merge test_provenance → atomicWrite
      （metadata 於 run 期間變為不可解析 → 回報失敗，不寫回舊 snapshot）

prospec check --escaped-defects                       [US-2 鏈]
  → check.service.execute({escapedDefects:true})
  → collectQualityLedger（result.trim() 後比對）
  → aggregateEscapedDefects：alias 解析 → canonical 身分
      blamed: Set<canonicalKey>（非原始字串）→ escaped ≤ passed 不變量成立
  → EscapedDefectReportSchema.safeParse → formatter
```

## Implementation Steps

1. **US-1 collector/evaluator 重排（RED→GREEN）**
   - 先寫轉紅測試：fixture 帶 `exit_code: 1` 紀錄＋不可解析 `test_command` → 期望 FAIL（現行回 skipped）
   - `collectTestProvenance`：移除 `testCommand === null`／`unspawnableReason` 兩個 early-return，照常枚舉；source 新增 `command_unavailable_reason: string | null`（git worktree／changesDir 缺失仍為 source-level unavailable——無法枚舉屬真不可用）
   - `evaluateTestProvenance`：per-change 判序改為 recorded-failure → command-unavailable-skip → no-record → stale；backfill 豁免分支位置不變（本已在 failure 之後）
   - `check.service` 注入處與既有測試同步 source 新形狀

2. **US-2 canonical keying＋trim（RED→GREEN）**
   - 轉紅測試：mixed-alias、`passed = 1` fixture → 現行丟 `EscapedDefectReportInvalid`
   - `escaped-defects.ts`：blamed 集合 key 改為 alias 解析結果的 canonical 身分；`drift-sources.ts:1148` `result` 先 `trim()`
   - 決定論斷言（byte-identity 重跑）維持綠

3. **US-4 digest fail-closed 回歸防護**
   - unborn-HEAD fixture 測試（真 temp dir，`git init` 不 commit）命中 `diff === null` 分支
   - `ls-files` 擷取失敗 → return `null`（與 diff 同語意）；配套測試（mock gitCapture 選擇性失敗）
   - `check.service` record 前置檢查的 reason 拆分：非 git repo vs 無法計算 digest

4. **US-5 review-provenance draft-gated**
   - review source 的 change entry 補 `backfill_draft_present`（collector 已有同邏輯可複用）；`drift-checker.ts:343` 改判準；draft-less backfill 轉紅測試

5. **US-6 markdown-fences 契約**
   - 新 `tests/unit/lib/markdown-fences.test.ts`：縮排 fence／inline span／`~~~`／mixed-marker close 四類
   - 修兩個 CommonMark 偏差（4-space 縮排非 fence、含反引號 info string 非 opener）；跑全套件確認 constitution-parser／drift 掃描無回歸，若掃描結果改變以全套件綠為準（proposal Open Question 定案）

6. **US-3 模板豁免封閉列舉**
   - `prospec-verify.hbs`：豁免定義改為列舉「engine-unavailability WARNs」三類（not-adjudicated 機械維度、3/5 missing-inventory、Entry-Gate 降級）；`:287`／`:315` 兩處裸述加註指向
   - 契約測試：豁免定義存在＋每處額度敘述帶指向（mutation：刪除定義即紅）；`pnpm bundle` → `npx tsx src/cli/index.ts agent sync`

7. **US-8 record 寫回 re-merge**
   - `recordTestProvenance`：post-run 重讀 `{doc}`，merge `test_provenance` 後寫回；run 期間 metadata 壞掉 → 記錄失敗不寫回；service 測試以 fake runner 模擬並行編輯

8. **US-7 訊息／文件／資料清單**
   - 一行修：`drift-report.ts:57` 註解、`commands/check.ts` help、`config-example.yaml.hbs` 範例值、timeout reason 帶實際值
   - 文件：`sdd-workflow.md` REQ-TEMPLATES-157 宣稱收斂（archive 時隨 spec-sync 一併落地）、`_archived-history/2026-07-28-split-verify-adjudication.md` 補 REQ-TYPES-034 列
   - 資料：`_lessons-ledger.md` `kind` 封閉集合、`impact_modules` 模組名清理、疊字／全形符號修復（比對 promotion-format 封閉集合；不動 status 欄結論）
   - 測試品質：`skill-format.test.ts:3468` 換行 pin 改為 wrap-independent 斷言

9. **收尾同步**
   - `pnpm counts` 重導計數 → README／index／tests README；`pnpm test`＋`typecheck`＋`lint`＋`prospec check` 全綠；README 雙語同步檢查（本案無 user-facing surface 變更，預期免改）

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| US-1 source 形狀變更波及 check.service 注入與既有 test-provenance 測試 | Medium | 形狀變更集中單一 interface；先跑既有套件標定波及面再動手；evaluator 判序有四象限測試（#102 已建立三個，補第四） |
| US-6 CommonMark 修正改變既有文件掃描結果（新增/消失 finding） | Medium | 全套件為準；若本 repo 文件受影響，於同 commit 修正該文件並在 delta-spec Reason 記錄；trade-off：偏差保留＝縮排區塊致盲整份文件，修正＝一次性掃描結果位移，選後者 |
| 模板措辭改動誤觸 693 條 contract 斷言 | Medium | 先跑 `tests/contract/` 標定；新 pin 全部 section-scoped＋mutation-verify（PB-001） |
| bundle 未同步（`pnpm bundle` 漏跑）致 bundle-sync 契約紅 | Low | 依 templates README 兩步流程；bundle-sync test 即防護 |
| ledger 修正影響 lessons-harvest fixture 測試 | Low | fixture 是合成語料（`tests/fixtures/lessons-harvest/`），真 ledger 修正不觸及；跑 harvest 相關套件確認 |
| US-8 re-merge 引入寫回競態的新語意 | Low | 僅縮小 lost-update 窗口至 read-merge-write 原子段；`atomicWrite` 語意不變；不可解析 → 明確失敗優於靜默覆蓋 |

## Trade-off Notes

- **US-1 選 collector 降格欄位而非 evaluator 前移 I/O**：evaluator 必須維持 I/O-free（lib README 明訂），所以「已記錄事實」必須由 collector 帶出——代價是 source 形狀變更；替代案（collector 內先掃 exit_code 再決定 early-return）會把裁決藏進 I/O 層、違反 collector/evaluator 分離，棄。
- **US-2 選 canonical key 而非 schema 放寬 `max(1)`**：放寬 schema 等於承認灌水數字合法，治標；keying 修根因且讓 `escaped ≤ passed` 不變量真實成立。
- **US-3 選「三類列舉＋統稱」而非只統稱**：只寫「engine-unavailability WARNs」留下歸類判斷空間，逐項點名＋統稱兜底，契約測試可釘住列舉完整性。
