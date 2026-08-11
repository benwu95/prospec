# Delta Spec：量測解鎖（unlock-measurement）

## ADDED

### REQ-MEASURE-010: 離線 size 報告 schema

**Feature:** token-measurement
**Story:** US-1

**Description:**
`types/measurement.ts` 新增 `SizeReportSchema`（獨立於 `MeasurementReport`，不含 provider/cache/cost）：`corpus`、`git_commit`、`generated_at`、`estimator`（如 `chars-per-token: 4`），每任務每組裝法（full-dump/naive-rag/prospec）的 cold input token 估算，及對兩 baseline 的 size saving ratio；`DEFAULT_SIZE_REPORT_FILENAME = 'size-report.json'`。

**Acceptance Criteria:**
1. `SizeReportSchema.parse` 接受合法 size 報告；缺 `corpus`/`git_commit` 即驗證失敗
2. `MeasurementReportSchema` 行為與欄位不變（線上契約不受影響）
3. size 報告不含任何 provider/pricing/cache/門檻欄位（誠實邊界，REQ-MEASURE-006）

**Priority:** High

---

### REQ-MEASURE-011: harness 離線 size 產出（無 API key）

**Feature:** token-measurement
**Story:** US-1

**Description:**
`scripts/measure-tokens.ts` 新增 `--offline`：跳過所有 provider adapter，複用 API-free 的 `scripts/measure/assemble.ts` 組裝三策略、以 `lib/token-accounting.estimateTokens` 計 size，產出 `size-report.json`。既有無 key 硬退訊息追加「或 `--offline` 取得無 key size 估算」。

**Acceptance Criteria:**
1. 清空所有 provider env 變數後 `--offline` 全程不呼叫 provider API，產出含三策略估算的非空 `size-report.json`
2. 輸出明示「keyless size estimate；cache/cost 需 API key（deliberate exclusion）」
3. 既有線上量測路徑（有 key）行為不變

**Priority:** High

---

### REQ-MEASURE-012: `prospec measure --offline` 唯讀 size 顯示

**Feature:** token-measurement
**Story:** US-1

**Description:**
`prospec measure --offline` 唯讀讀取 `size-report.json`（`measure.service` 加 offline 分支、`SizeReportSchema` 驗證），formatter 呈現 per-strategy size 與 size saving ratio；不呼叫 API、不含 cache/cost 欄、不做門檻判定。缺報告檔時以 `PrerequisiteError` 指引先跑 `pnpm measure:tokens --offline`。

**Acceptance Criteria:**
1. 存在 `size-report.json` 時 `prospec measure --offline` 顯示 size 表，不呼叫 API
2. 報告缺失 → 明確指引離線產出指令；schema 不符 → 顯示驗證錯誤、不輸出部分表格
3. 輸出不出現任何「未達門檻」式判定（僅呈現數字）

**Priority:** High

---

### REQ-TYPES-058: ChangeMetadata `introduced_by` escaped-defect 登記欄位

**Feature:** sdd-workflow
**Story:** US-3

**Description:**
`ChangeMetadataSchema` 新增 optional `introduced_by`（字串，回指漏掉該 defect 的 change name）；`_status-lifecycle.md`（或 `_conventions.md`）新增其格式約定與 ≥1 範例。本欄僅為登記約定，不做參照完整性驗證、不新增 drift 強制。

**Acceptance Criteria:**
1. 帶 `introduced_by` 的 metadata 通過 `ChangeMetadataSchema.parse`；省略時仍通過（向後相容）
2. Knowledge 慣例文件 grep 命中 `introduced_by` 定義＋範例（如 issue #48 → `fix-init-clobber-add-upgrade`）
3. 既有不含該欄的 metadata 不受影響

**Priority:** Medium

---

### REQ-TEMPLATES-145: verify/review 寫結構化 quality_log 欄位

**Feature:** sdd-workflow
**Story:** US-2

**Description:**
`prospec-verify.hbs` 於 Exit/Status 段寫入結構化 `grade`（S/A/B/C/D）與 `dimensions`（5+1 各維度 PASS/WARN/FAIL），`result` 仍記閘門三態；`prospec-review.hbs` 每輪 quality_log entry 寫 `criticals_found`/`criticals_fixed`/`majors` 計數。

**Acceptance Criteria:**
1. contract test 斷言 verify 段含結構化 `grade`＋`dimensions` 寫入指令
2. contract test 斷言 review 段含 `criticals_found`/`criticals_fixed`/`majors` 寫入指令
3. `result` 仍為 PASS/WARN/FAIL 閘門語意（不被 grade 覆寫）

**Priority:** High

---

## MODIFIED

### REQ-TYPES-022: quality_log Metadata Field

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
`ChangeMetadataSchema` 的 optional `quality_log` entry 形狀為 `skill`/`date`/`result`/`warnings[]`。

**After:**
entry 額外攜帶 optional 結構化欄位：`grade`（enum S/A/B/C/D）、`dimensions`（`{name, result: PASS|WARN|FAIL}[]`）、`criticals_found`/`criticals_fixed`/`majors`（`int nonnegative`）。`result` 維持 `GATE_RESULTS`（PASS/WARN/FAIL）閘門語意；新欄位皆 optional，既有 entry 仍通過。

**Reason:**
讓 review criticals/majors 與 verify grade+維度可機器聚合（05-§5c），不再埋在 prose；並與 REQ-LIB-025 的 `hasVerifyGrade` 收斂對齊。

**Priority:** High

---

### REQ-LIB-025: metadata-completeness Collector + Evaluator

**Feature:** drift-detection
**Story:** US-2

**Before:**
`hasVerifyGrade` 判定 `quality_log` 是否有 `prospec-verify` 且 `result ∈ {S, A}` 的 entry。

**After:**
`hasVerifyGrade` 優先讀結構化 `grade ∈ {S, A}`；保留 legacy `result ∈ {S, A}` 分支使既有 archived metadata 仍通過。其餘 collector/evaluator 行為（必填欄檢查、in-progress 豁免、非-mapping 視為全缺）不變；`metadata-completeness` check id 不變（非新增 check id）。

**Reason:**
收斂 schema 與現實落差——`result` 回歸嚴格三態（對齊 REQ-TYPES-022/REQ-TESTS-022），verify 評級移至專屬 `grade` 欄；legacy fallback 保向後相容。

**Priority:** High

---

### REQ-TESTS-022: Gate + quality_log Tests

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
unit test 驗證 `quality_log` schema：可省略、`result` 限 PASS/WARN/FAIL、6 個 lifecycle 狀態通過。

**After:**
額外驗證新結構化欄位：`grade` 限 S/A/B/C/D、`dimensions`/`criticals_found`/`criticals_fixed`/`majors` 可省略且型別正確；`result` 仍限 PASS/WARN/FAIL（三態不被 grade 取代，mutation-verified）。

**Reason:**
釘住 REQ-TYPES-022 新增欄位的形狀與 `result` 三態不變式，防 false-green（PB-001）。

**Priority:** High

---
