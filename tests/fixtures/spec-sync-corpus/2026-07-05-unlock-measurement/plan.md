# 實作計畫：量測解鎖（unlock-measurement）

## Overview

本變更落地稽核報告（03-F3、05-§5b/§5c）指出的三項零成本 enabler：讓 token 量測在無 API key 時仍可追蹤 size、讓 review/verify 的品質數字可機器聚合、讓 escaped-defect 可回溯登記。核心設計原則是**加法且向後相容**——所有新 schema 欄位皆 `.optional()`，既有 metadata/report 不受影響；離線量測與線上量測互不取代。

策略上分三條互相獨立的路線：(1) 為 benchmark harness 加 `--offline` 產出獨立 `SizeReportSchema` 的 size 報告（複用既有 API-free 的 `scripts/measure/assemble.ts` + `lib/token-accounting.estimateTokens`），`prospec measure --offline` 唯讀顯示；(2) 為 `QualityLogEntrySchema` 加結構化 `grade`/`dimensions`/review 計數欄位，並把 `hasVerifyGrade` 收斂到讀 `grade`（保留 legacy `result` fallback）；(3) 為 `ChangeMetadataSchema` 加 optional `introduced_by` 欄位＋慣例文件。全程 TDD（RED→GREEN→REFACTOR），遵守 `cli → services → lib → types` 分層與 REQ-MEASURE-006 誠實邊界（離線報告不設門檻、不進 CI）。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|--------------------|---------|--------------|
| types | Zod schemas | `measurement.ts`（+ `SizeReportSchema`）、`change.ts`（QualityLogEntry + `introduced_by`） | zod |
| lib | 純工具/drift 引擎 | `token-accounting.estimateTokens`、`drift-sources.hasVerifyGrade`、`drift-checker.evaluateMetadataCompleteness` | types |
| services | 業務邏輯 | `measure.service.execute`（+ offline size 讀取路徑） | lib, types |
| cli | I/O 層 | `commands/measure.ts`（`--offline`）、`formatters/measure-output.ts`（size 表） | services, lib, types |
| scripts | benchmark harness（分層外） | `measure-tokens.ts`（`--offline`）、`measure/assemble.ts`（API-free，複用） | types, lib |
| templates | LLM 指令 | `prospec-verify.hbs`/`prospec-review.hbs`（寫結構化 quality_log）、慣例文件 | — |

### Existing Patterns (from _conventions.md)

- Schema 新欄位一律 `.optional()`/`.default()`（types Pitfall：加必填欄位破壞既有 `.prospec.yaml`/metadata）
- `token-accounting` 純函式，pricing 為參數、無寫死；drift evaluator I/O-free、findings codepoint-sorted
- metadata.yaml 以 `stringifyYaml` 序列化（非 template），comment-preserving Document API 寫入
- PB-003：文件宣稱 ⊆ 實作行為；未做/不可量者以 deliberate-exclusion 措辭明示

### Architecture Constraints (from Constitution)

- 依賴方向 `cli → services → lib → types`，`scripts/` 在 runtime 分層外（僅 consume types/lib）
- drift `DRIFT_CHECK_IDS` 為 frozen（append-only）；本變更**不新增 check id**，只演進 `metadata-completeness` 的 `hasVerifyGrade` 判定邏輯（合法）
- REQ-MEASURE-006 誠實邊界：離線 size 報告不設節省比/門檻、不新增 CI workflow

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| types | High | `SizeReportSchema`（measurement.ts）；QualityLogEntry 加 `grade`/`dimensions`/`criticals_found`/`criticals_fixed`/`majors`；ChangeMetadata 加 `introduced_by`（皆 optional） |
| lib | Medium | `hasVerifyGrade` 改讀 `grade`（legacy `result` fallback）；`estimateTokens` 複用於 size 聚合 |
| scripts | Medium | `measure-tokens.ts` 加 `--offline`（無 key 產 size-report.json）；no-key 硬退提示 `--offline` |
| services | Medium | `measure.service` 加 offline size-report 讀取＋驗證路徑 |
| cli | Medium | `measure` 加 `--offline` 旗標；formatter 加 size 表呈現 |
| templates | Medium | verify/review 寫結構化 quality_log 欄位；`_status-lifecycle.md`/`_conventions.md` 記 `introduced_by` |
| tests | High | schema/評估器/formatter/harness offline 全層測試 |

## Call Chain

### 進入點 1：離線 size 產出（harness，分層外）

```
pnpm measure:tokens --offline
  → scripts/measure-tokens.ts main()                         [解析 --offline]
  → assembleAll(corpus, repoContents)                        [scripts/measure/assemble.ts，API-free]
  → estimateTokens(assembledText)  per strategy              [lib/token-accounting]
  → SizeReportSchema.parse(report)                           [types/measurement.ts]
  → atomicWrite('size-report.json')                          [lib/fs-utils]
  （無任何 provider fetch；無 key 時原 exit(1) 改為提示 --offline）
```

### 進入點 2：離線 size 顯示（唯讀）

```
prospec measure --offline [--report size-report.json]
  → registerMeasureCommand action                            [cli/commands/measure.ts]
  → measure.service.execute({cwd, reportPath, offline:true}) [services]
  → readFile + SizeReportSchema.parse                        [lib/fs-utils + types]  (offline 分支)
  → formatMeasureOutput(sizeResult)                          [cli/formatters/measure-output.ts]  (size 表，無 cache/cost，無門檻)
```

### 進入點 3：metadata-completeness 讀結構化 grade

```
prospec check (--json)
  → check.service.execute                                    [services]
  → collectMetadataCompleteness(cwd)                         [lib/drift-sources]
  → hasVerifyGrade(quality_log)                              [讀 entry.grade ∈ {S,A}；legacy entry.result ∈ {S,A} fallback]
  → evaluateMetadataCompleteness(src)                        [lib/drift-checker，FAIL-class]
```

## Implementation Steps

1. **types：新 schema 與欄位（RED 先）**
   - `measurement.ts`：`SizeReportSchema`（`corpus`/`git_commit`/`generated_at`/`estimator`（如 `chars-per-token:4`）+ 每 task 每 strategy 的 cold input token 估算 + 對兩 baseline 的 size saving ratio）；`DEFAULT_SIZE_REPORT_FILENAME='size-report.json'`；不動 `MeasurementReportSchema`
   - `change.ts`：`QualityLogEntrySchema` 加 optional `grade`（enum S/A/B/C/D）、`dimensions`（`{name,result:PASS|WARN|FAIL}[]`）、`criticals_found`/`criticals_fixed`/`majors`（`z.number().int().nonnegative().optional()`）；`result` 維持 `GATE_RESULTS`。`ChangeMetadataSchema` 加 `introduced_by: z.string().optional()`

2. **lib：drift 收斂＋size 聚合**
   - `drift-sources.hasVerifyGrade`：優先讀 `entry.grade ∈ {S,A}`；保留 legacy `entry.result ∈ {S,A}` 分支（既有 archived metadata 向後相容）
   - `token-accounting`：新增（或複用）size 聚合小函式供 harness/formatter 共用（如 `sizeSavingRatio` 直接用既有 `savingRatio`）

3. **scripts：harness 離線路徑**
   - `measure-tokens.ts` 加 `--offline`：跳過所有 provider adapter，走 `assembleAll` + `estimateTokens` 產 `SizeReport`，`atomicWrite('size-report.json')`；印明「keyless size estimate；cache/cost 需 key（deliberate exclusion）」
   - 無 key 且非 offline 的硬退訊息追加「或加 `--offline` 取得無 key size 估算」

4. **services + cli：離線顯示路徑**
   - `measure.service.execute` 加 `offline` 分支：讀 `size-report.json`、`SizeReportSchema.parse`、缺檔 `PrerequisiteError` 指引 `--offline` 產出
   - `commands/measure.ts` 加 `--offline`；`measure-output.ts` 加 size 表 formatter（per-strategy size + saving ratio，無 cache/cost 欄、無門檻判定）

5. **templates：結構化 quality_log ＋ introduced_by 慣例**
   - `prospec-verify.hbs`：Exit/Status 段寫入結構化 `grade` + `dimensions`（5+1 維度結果），`result` 仍記 PASS/WARN/FAIL
   - `prospec-review.hbs`：每輪 quality_log entry 寫 `criticals_found`/`criticals_fixed`/`majors`
   - `_status-lifecycle.md`（或 `_conventions.md`）：新增 `introduced_by` 格式約定＋範例（issue #48 → `fix-init-clobber-add-upgrade`）

6. **tests（每步同批 RED→GREEN）＋知識同步**
   - `types/measurement.test.ts`（SizeReport accept/reject、不影響 MeasurementReport）、`types/change.test.ts`（新欄位 accept/omit、result 仍三態、grade enum）、`lib/drift-sources.test.ts` + `drift-checker.test.ts`（grade 分支 + legacy fallback，mutation-verified）、`services/measure.service.test.ts` + `cli/measure-output.test.ts`（offline 分支）、`scripts` offline 測試、contract test（verify/review 寫結構化欄位）
   - 同步受影響模組 README（types/lib/services/cli/templates）與 `index.md`（PB-005 家族，避免 knowledge-health stale）；跑 `pnpm counts`

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 「`prospec measure` 產出 size 報告」被理解為 CLI 自身計算，但本設計為 harness 產、measure 顯示 | Medium | 分層與 corpus 是 test fixture 決定 CLI 不宜自產；plan/delta-spec 明記此設計取捨，review 時由 owner 確認；若需 CLI 自產列為 follow-up（把組裝抽進 lib helper） |
| `hasVerifyGrade` 改判定邏輯破壞既有 verified 變更的 metadata-completeness | High | 保留 legacy `result ∈ {S,A}` fallback；先讀真實 archived metadata 確認現況；mutation-verify 兩分支（新 grade / legacy result）皆通過 |
| SizeReport 與 MeasurementReport 形狀混淆導致 formatter/service 誤判 | Medium | 兩者不同檔名（`size-report.json` vs `measurement-report.json`）+ `--offline` 明確旗標分派，不做 shape 猜測；各自獨立 schema |
| 離線 char/4 估算被誤當精確 billing 數字（PB-003 宣稱漂移） | Medium | 報告與 formatter 明標「estimate（chars/4），非 measured usage；cache/cost 需 key」；LiteLLM 已評估不採用（見 proposal Open Questions） |
| 加欄位/改 template 未同步 README → knowledge-health stale（PB-005） | Medium | 每個 source-touched 模組 README 於 feature commit 同步；archive Entry Gate 以 `prospec check` 0 stale 為 backstop |
| quality_log 為 lossless 讀取、schema 非讀時強制 | Low | 新欄位是型別契約＋fixture（同 REQ-TYPES-022 既有性質）；contract/unit test 釘住形狀，round-trip 不掉欄 |

### 分層檢查（Phase 6，site-specific：dependency-direction）

三條 Call Chain 皆順向：進入點 1（harness）在 runtime 分層外、僅下呼 lib/types；進入點 2 `cli → services → lib → types`；進入點 3 drift 讀 types，`check.service`(services) 注入、evaluator 在 lib。**無反向或跨層 import**、無「commit 前 emit side effect」。`scripts/` 不被 `src/` import（維持既有邊界）。無違反。
