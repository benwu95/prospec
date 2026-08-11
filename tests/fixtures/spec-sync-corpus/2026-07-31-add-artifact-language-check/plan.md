# Implementation Plan: add-artifact-language-check

## Overview

> **範圍變更（實作後）**：原設計的嚴重度分層（`_archived-history/**` 記 fail）已取消，本版一律 warn。完整理由、實測證據與被否決的替代方案見 proposal.md 的「嚴重度分層的取消」節。本文件其餘敘述已對齊該決定。

新增第 14 個 drift check `artifact-language`，把 Constitution 的 `[MUST]` Language Policy 從純人工稽核變成每次 `prospec check` 都會跑的機器訊號。掃描範圍不自行定義——直接取 `lib/language-policy` 已解析的 `nativePaths`，避免 PB-006 的手抄漂移。

兩個設計主軸。其一是**掃描範圍的取捨**：`.prospec/archive/**` 完全不掃（gitignored 副本，掃了只是噪音，以 `ARCHIVE_NATIVE_GLOB` 常數扣除而非手抄字面值）。其二是**誠實的能力邊界**：偵測依 Unicode 腳本範圍，表中沒有的書寫系統（拉丁語系）回報 `skipped` 並說明原因，絕不空過——這是專案既有的「skipped ≠ PASS」規範，也避免對無法判定的專案製造假綠或假紅。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| types | 凍結 registry | `DRIFT_CHECK_IDS`（13→14，附加式） | zod |
| lib | 無狀態工具＋零 LLM drift 引擎 | `drift-sources` collectors、`drift-checker` evaluators、`language-policy` | types |
| services | 一 command 一 `execute()` | `check.service` 的 collector 串接 | lib, types |
| tests | 4 層 Vitest | `unit/lib/drift-*.test.ts`、`contract/drift-report` | 全部 |

### Existing Patterns (from module READMEs)

- **collector／evaluator 分離**：collector 讀檔並回傳 `{available, reason?, …}`，evaluator 純函式判定；來源不可得一律 `skipped(reason)` 而非空過
- **`DRIFT_CHECK_IDS` 為凍結清單**：附加式擴充、不重排不移除；per-id 註解是被當成真相讀的行為宣稱，必須與 evaluator 一致
- **路徑解析走 canonical resolver**：`resolveBasePaths` / `resolveLanguageScope`，新消費者不得自行重導（PB-007）
- **contained read**：知識/規格區的讀取經 realpath containment，避免 `base_dir` 逃逸成為檔案 oracle

### Architecture Constraints (from Constitution)

- 依賴方向 `services → lib → types`（[SHOULD]）：偵測與判定留在 lib，service 只串接
- TDD（[MUST]）：evaluator 為純函式，先寫覆蓋三種結果（warn／無／skipped）的測試
- PB-009：新增 check id 必須同步 root README 的 check 列舉

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| types | Low | `DRIFT_CHECK_IDS` 附加 `artifact-language` ＋ per-id 行為註解 |
| lib | High | 腳本範圍表、`collectArtifactLanguage`、`evaluateArtifactLanguage` |
| services | Low | `check.service` 串接新 collector（走既有 resolver，不重導路徑） |
| tests | Medium | evaluator 三結果、collector 範圍規則與安全性（containment／不可讀項目／fence 剝除）、service 層真實 scope 組合、drift-report 契約 |

## Call Chain

```
prospec check [--json]
  → cli/commands/check.ts: checkCommand(opts)                     [thin I/O]
  → services/check.service.ts: execute({ cwd, json })             [orchestration]
      → lib/language-policy.ts: resolveLanguageScope(config, cwd) [canonical path sets]
      → lib/drift-sources.ts: collectArtifactLanguage(cwd, scope)
          → scriptPatternFor(language) → RegExp | undefined       [能力邊界]
          → scanDirSync ∩ *.md, contained reads, fences stripped [樣本]
      → lib/drift-checker.ts: evaluateArtifactLanguage(src)       [純函式判定]
      → runChecks(...) → DriftReport                              [14 checks]
  → cli/formatters/check-output.ts                                [display only]
```

## Implementation Steps

1. **測試先紅（RED）**
   - evaluator：帶字跡→無 finding；缺字跡→warn（並釘住「一律 warn」）；來源不可得／語言無法判定→`skipped` 且帶 reason
   - collector：`.prospec/archive/**` 與非 `.md` 零 finding；無變更工件時 `available: true` 且樣本為空（PASS 而非 skipped）
   - 契約：`DRIFT_CHECK_IDS` 含新 id 且既有順序不變

2. **types：附加 check id**
   - `DRIFT_CHECK_IDS` 追加 `artifact-language`，附行為註解（掃描範圍與其刻意排除、WARN-only、skip 條件）

3. **lib：腳本偵測表**
   - 語言名 → Unicode 範圍的小表（CJK／Cyrillic／Arabic／Hebrew／Thai／Devanagari／Greek）
   - 名稱宣告拉丁正寫法（`(Latin)`／`Romanized`／`Greeklish` …）時一律回 undefined——規則式，非逐名特例
   - 表中無此語言 → 回傳 undefined，由 collector 轉成 `skipped` 並說明

4. **lib：collector**
   - 由 `resolveLanguageScope` 取 `nativePaths`，以 `ARCHIVE_NATIVE_GLOB` 常數扣除 archive，只收 `.md`
   - 每個檔案記錄 `{path, hasScript}`；經 containment 守衛與 `readContainedFile`，判定前剝除 fenced block

5. **lib：evaluator**
   - 純函式：`available: false` → `skipped(reason)`；否則對 `hasScript: false` 的檔案逐一產 WARN-class finding

6. **services + docs**
   - `check.service` 串接；root README 的 check 列舉同步（PB-009）；`drift-report-format` reference 補該 id

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 對剛 scaffold 的英文樣板誤報 | High | 一律只記 warn，不擋任何閘門；ledger `scan/false-positive-kills-trust` 明列誤報比漏報致命 |
| 腳本表涵蓋不足造成假綠 | High | 表中無此語言一律 `skipped` 並說明，絕不回 PASS；proposal 與 delta-spec 皆明示此能力邊界（PB-003 deliberate exclusion） |
| 自行重寫路徑集合造成與 Constitution 漂移 | High | 一律取 `resolveLanguageScope` 的 `nativePaths`，不硬編（PB-006／PB-007） |
| 新 check id 未同步 README 列舉 | Medium | 納入 tasks 明列（PB-009 已三度復發） |
| 掃描大量檔案拖慢 check | Low | 只掃 `.md`、不掃 gitignored 的 archive；讀取為單次全文＋正則測試 |

## Knowledge Quality Gate

PASS — Brownfield；已讀 types/lib/services/tests 四個 module README 與 `_playbook.md` 相關條目（PB-001/003/006/007/009）；已核對 `DRIFT_CHECK_IDS` 的凍結契約、collector/evaluator 分離模式與 `resolveLanguageScope` 的既有回傳形狀。

## Constitution Check (site-specific: dependency/layering)

PASS — Call Chain 為 `cli → services → lib → types`；偵測與判定皆在 lib，service 只串接、formatter 只顯示。新 collector 透過 canonical resolver 取路徑，不新增反向依賴。
