# Tasks: stop-silent-spec-body-loss

> **TDD 與順序約束**：每個 code 任務與其對應的 Tests 任務同一 commit 落地（測試先寫）。
> 順序依賴：T6～T9（US-1）與 T10～T11（US-2／US-3 的宣告與判定）必須早於 T14～T15（阻擋）——
> 阻擋只有在報告可信之後才安全。T1～T5、T17 一路獨立於上述鏈，可先行。

## Types

- [x] T1 `types/drift-report.ts` 追加 `delta-spec-provenance` 為第 16 個 frozen check id（additive-only，既有 15 個順序不動）~15 lines
- [x] T2 `types/change.ts` 新增 `delta_spec_provenance` 欄位與 schema；沿用既有 `PROVENANCE_AUDITED_STATUSES` ~25 lines

## Lib

- [x] T3 `drift-sources.ts` 新增 `computeDeltaSpecDigest(changeDir)`——只雜湊該變更的 `delta-spec.md`，capture 失敗 fail-closed 回 null（不得塌成常數）~45 lines
- [x] T4 `drift-sources.ts` 新增 `collectDeltaSpecProvenance(cwd)`——枚舉 `.prospec/changes/*` 的 status／已記錄指紋／現行指紋；無 delta-spec 回 `{available:false, reason}` ~55 lines
- [x] T5 `drift-checker.ts` 新增純函式 `evaluateDeltaSpecProvenance` 並在 `runChecks` 分派（缺分派為編譯錯誤）~60 lines

## Services

- [x] T6 `archive.service.ts` 新增樣板欄位登記表常數（含本變更新增的 `Dropped`）與 `classifyBlockTerminator`——樣板欄位／疑似 body 內容／heading／rule 四分類 ~45 lines
- [x] T7 `extractDeltaBlock` 回傳值擴充為「內容 ＋ 截斷事實（label 文字、起始行、被吞行數）」；被吞內容為空時不視為截斷 ~45 lines
- [x] T8 `mergeRequirementInPlace` 在截斷成立時不落地該 REQ 並回傳 refusal 項；`---`／ATX heading 既有邊界語意不變 ~50 lines
- [x] T9 `whenThenBullets` 條列標記放寬到 `-`／`*`／`N.` 並容許 `WHEN` 帶粗體強調；續行仍要求縮排 ~35 lines
- [x] T10 `declaredDrops`——解析 entry 的 `**Dropped:**` 區塊，以 `normalizeBullet` 為鍵建立宣告集合 ~35 lines
- [x] T11 `assessSpecLoss`——在任何 `atomicWrite` 之前以「計算集合 \ 宣告集合」判定流失；有流失的 feature spec 不寫入、其餘照常寫入；宣告多出的條目回報陳舊；截斷拒絕不受宣告釋放 ~75 lines
- [x] T12 `check.service.ts` 注入 `collectDeltaSpecProvenance`；`--record-review` 在寫 `review_provenance` 的同一次 Document 寫入中一併寫 `delta_spec_provenance` ~45 lines

## CLI

- [x] T13 `formatters/archive-output.ts` 新增 refusal 與陳舊宣告的區塊渲染（label ＋ 首行被吞內容，走 `sanitizeTerminal`）~40 lines
- [x] T14 `formatters/archive-output.ts` 把未宣告的 `droppedBehavior` 與 refusal 由 WARNING-class 改為 blocking-class ~20 lines
- [x] T15 `commands/archive.ts` 把流失納入 `unhonored` → `process.exitCode = 1`；dry-run 亦然 ~20 lines

## Templates

- [x] T16 `references/delta-spec-format.hbs` 敘明分類邊界與拒絕行為（取代現行「NOT landed, silently」），並定義 `**Dropped:**` 宣告區塊的位置與集合比對語意 ~45 lines
- [x] T17 `references/feature-spec-format.hbs` 對齊 landing block 規則——scenarios 標籤不得寫進 `**Spec:**` 區塊 ~25 lines
- [x] T18 `skills/prospec-archive.hbs` Entry Gate 由兩個 provenance 改為三個；Phase 3.5 gate 涵蓋 refusal，且「確認刻意」的產物改為寫進 `**Dropped:**` ~40 lines
- [x] T19 兩份 root README 的檢查列舉 15→16（PB-009：`pnpm counts` 不涵蓋 prose 列舉）~20 lines
- [x] T20 [M] `pnpm bundle` → `pnpm build` → `prospec agent sync` 重新部署（bundled-templates 先於 FS）~5 lines

## Tests

- [x] T21 [P] spec-sync 截斷與拒絕的合成 fixture——含 `**Deviation (recorded at implement time):**` 這類含括號的非邊界形狀 ~95 lines
- [x] T22 [P] 條列形狀放寬的表格驅動測試 ＋ 兩種假陽性誘因（重新縮排／換行重排）~75 lines
- [x] T23 [P] 宣告比對四種結果（相符／真子集／陳舊／無宣告）＋「宣告不釋放截斷拒絕」＋「帶宣告的 entry 仍正常落地」（登記表自洽性）~70 lines
- [x] T24 [P] 真實語料迴歸——既有 archived delta-spec 的終止點零誤判、既有 feature spec 條列零新增回報 ~65 lines
- [x] T25 [P] delta-spec-provenance engine 測試——evaluator 五狀態、temp git 目錄下指紋翻轉、fail-closed revert-red ~115 lines
- [x] T26 archive 退出碼與「有流失即不寫檔／已宣告即照常寫入」的 CLI／E2E 測試（含 dry-run）~65 lines
- [x] T27 契約測試——兩份 format reference 對 landing block 邊界的敘述一致 ~35 lines
- [x] T28 [V] mutation-verify 新增的分類、條列與流失／宣告判定邏輯，存活變異須為 0 ~10 lines
- [x] T29 [M] `pnpm counts` → `pnpm typecheck` → `lint` → 全測試 → `counts:check` 全綠 ~5 lines
- [x] T30 知識同步：`services/spec-sync.md`（worklist 語意 ＋ 宣告）、`cli/README.md`（WARNING-class 列舉）、`lib/drift-engine.md`（第 16 個 check）~45 lines

## Summary

- **Total Tasks:** 30（code 27、`[M]` 2、`[V]` 1）
- **Parallelizable Tasks:** 5
- **Total Estimated Lines:** ~1,320 lines
