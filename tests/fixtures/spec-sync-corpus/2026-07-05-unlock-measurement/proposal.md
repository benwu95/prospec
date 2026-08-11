# 提案：量測解鎖（unlock-measurement）

## Background

稽核報告（`.tasks/chore/scan-by-fable5/` 03-F3、05，2026-07-03）指出兩個量測缺口：token harness 因環境無 provider API key 而自建成起零數據（所有 context 節省宣稱無實測支撐），且不存在任何準確度指標——「skill 套件提升實作準確度」是 unmeasured 因果宣稱，已有兩起 escaped defects 卻無登記機制。本變更落地三項零成本 enabler：離線 size 估算、quality_log 結構化、escaped-defect 登記，讓成本與品質可被機器聚合、趨勢可追蹤。

## User Stories

### US-1: 離線 token size 估算 mode [P1]

As a prospec 維護者（無 provider API key 可用），
I want `prospec measure` 提供離線估算路徑，用現成 `lib/token-accounting` 計各 assembly 的 size，
So that 無 key 環境也能追蹤 context 組裝規模，不再因 credential 阻塞而零數據。

**Acceptance Scenarios:**

- WHEN 環境無任何 provider API key 執行離線估算，THEN 產出 full-dump / naive-rag / prospec 三種 strategy 的 size 報告（input token 估算），全程不呼叫 provider API、不含 cache/cost
- WHEN 離線報告產出，THEN 可被 CLI formatter 讀取並顯示 per-strategy size 與相對 saving ratio
- WHEN 既有需 API key 的線上 harness 路徑執行，THEN 行為不變（離線 mode 為新增，不取代線上量測）

**Independent Test:** 清空所有 provider env 變數後跑離線估算，assert 產出非空 size 報告、含三個 strategy 的估算值。

### US-2: quality_log 結構化計數欄位 [P1]

As a 品質趨勢分析者，
I want review 的 criticals/majors（found→fixed）與 verify 的 grade＋5+1 各維度結果以結構化欄位寫入 quality_log，
So that 品質趨勢可由 script 機器聚合，而非埋在中文 prose 裡人工抄錄。

**Acceptance Scenarios:**

- WHEN prospec-review 完成一輪，THEN 該輪 quality_log entry 帶結構化 `criticals_found` / `criticals_fixed` / `majors` 計數
- WHEN prospec-verify 完成，THEN quality_log 帶結構化 `grade`（S/A/B/C/D）與 5+1 各維度結果，且通過 schema 驗證
- WHEN 既有僅含 `{skill,date,result,warnings}` 的 metadata，THEN 仍通過 schema 驗證（新欄位 optional，向後相容）
- WHEN metadata-completeness drift 檢查 verified 變更，THEN 依結構化 grade 判定，並收斂現有 `hasVerifyGrade` 讀 `result==='S'|'A'` 與 `result` enum 僅允許 `PASS|WARN|FAIL` 的落差

**Independent Test:** 帶結構化計數/維度/grade 的 quality_log fixture 通過 `schema.parse`；缺結構化 grade 的 verified metadata 令 metadata-completeness drift 報 FAIL。

### US-3: introduced_by escaped-defect 登記 [P2]

As a gate 漏接率追蹤者，
I want bug-fix change 的 metadata 能以 `introduced_by` 回指漏掉該 defect 的 change，
So that per-gate-level escaped-defect rate 這唯一的 ground-truth 準確度指標可被累積計算。

**Acceptance Scenarios:**

- WHEN 建立修 bug 的 change，THEN 其 `metadata.yaml` 可填 `introduced_by`（回指漏掉該 defect 的 change name 字串）
- WHEN `introduced_by` 已填，THEN schema 驗證通過（optional，向後相容）
- WHEN 查閱 Knowledge 慣例文件，THEN 有 `introduced_by` 的格式約定與 ≥1 範例（如 issue #48 → `fix-init-clobber-add-upgrade`）

**Independent Test:** 帶 `introduced_by` 的 metadata 通過 `schema.parse`；grep 慣例文件命中 `introduced_by` 定義與範例。

## Edge Cases

- 離線 mode 遇空 corpus / 無 repo 檔案：產出零 size 或明確錯誤，不 crash
- 離線報告 schema 與線上 `MeasurementReport.runs ≥ 1` 約束衝突：需獨立 shape 或放寬約束（plan 定案）
- quality_log 新欄位在 lossless 讀取路徑下：round-trip 不掉欄
- `introduced_by` 指向不存在的 change name：本次僅定格式約定，不做參照完整性驗證

## Functional Requirements

- **FR-001**: 提供無 API key 的離線 token size 估算路徑，複用 `lib/token-accounting.estimateTokens` 與 API-free 的 `scripts/measure/assemble` 助手
- **FR-002**: 離線 size 報告有明確 schema、可被 CLI formatter 呈現，且不破壞既有線上 `MeasurementReport` 契約
- **FR-003**: quality_log 新增結構化欄位承載 review criticals/majors（found→fixed）計數
- **FR-004**: 新增結構化欄位承載 verify grade 與 5+1 各維度結果，並收斂 `hasVerifyGrade` 與 `result` enum 的既有不一致
- **FR-005**: 所有新欄位皆為 optional，既有 metadata/report 向後相容
- **FR-006**: `ChangeMetadataSchema` 新增 optional `introduced_by`（change name 字串）
- **FR-007**: `introduced_by` 的格式約定與範例寫入 Knowledge 慣例文件

## Success Criteria

- **SC-001**: 清空所有 provider env 變數後，離線估算產出含三個 assembly strategy 的非空 size 報告（測試/grep 可驗）
- **SC-002**: 帶結構化計數/維度/grade 的 quality_log fixture 通過 `schema.parse`；缺結構化 grade 的 verified metadata 令 metadata-completeness drift FAIL
- **SC-003**: 帶 `introduced_by` 的 metadata 通過 `schema.parse`；Knowledge 慣例文件 grep 命中 `introduced_by` 定義＋≥1 範例
- **SC-004**: 既有不含新欄位的 metadata/report fixtures 全數仍通過（向後相容）
- **SC-005**: 全套件測試綠、coverage ≥ 80%、`tsc`/eslint/`prospec check` 無新增問題

## Related Modules

- **types**: `measurement.ts` 報告 schema、`change.ts` metadata/quality_log schema、`drift-report.ts` check ids（frozen contract）
- **lib**: `token-accounting`（estimateTokens）、`drift-sources`/`drift-checker`（metadata-completeness、hasVerifyGrade）
- **services**: `measure.service`（讀報告、離線路徑接縫）
- **cli**: `measure` command + formatter
- **templates**: `prospec-verify`/`prospec-review` skills（寫 quality_log 結構化欄位）＋慣例文件

## Open Questions

- [ ] **NEEDS CLARIFICATION**: 離線 size 報告採「擴充 `MeasurementReport`（runs 放寬）」或「獨立 `SizeReport` schema」？→ plan 定案（傾向獨立 shape，避免污染線上契約）
- [ ] **NEEDS CLARIFICATION**: verify grade 放進 `QualityLogEntry.result`（enum 納入 S/A/B/C/D）或新增獨立 `grade`/`dimensions` 欄位？→ plan 定案（傾向新增獨立欄位、`result` 維持 PASS/WARN/FAIL 閘門語意）
- 註：`drift-report` check ids 為 frozen contract；若 metadata-completeness 判定邏輯調整，需走 append/版本程序（plan 檢視）
- 註：LiteLLM 已研究結論為**不採用**（離線對 Claude 僅 Claude-2 舊 tokenizer/tiktoken 近似、Python-only、TS fit 差）；離線 mode 沿用 char/4 heuristic，tiktoken 校準與 Anthropic `count_tokens` 線上 ground-truth 列為未來可選路徑

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- Language Policy：本 proposal 繁中，code/identifiers/Knowledge 英文 ✓
- INVEST：三 story 各自 Independent、Testable（見各 Independent Test）、Small（單一範圍）✓
- TDD：實作階段 test-first（RED→GREEN→REFACTOR）
- Dependency direction：新增碼遵守 `cli → services → lib → types`
- No violations identified

## UI Scope

**Scope:** none
