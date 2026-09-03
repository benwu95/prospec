# normalize-executor-labels-and-stats — Archive Summary

- **Archived**: 2026-09-03
- **Original Created**: 2026-09-03
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/259

## User Story

作為專案維護者，
我要在 `.prospec.yaml` 宣告 executor label 詞彙、讓 `verify record` 與 `check --record-review` 在寫入端驗證並對稱記錄 `review_provenance.executor`、以 `prospec learn stats` 讀出 per-executor 統計，並把本 repo 37 筆歷史值映射到宣告 label，
以便 #203 開出的 `executor` 欄位成為可 group-by 的資料、有第一個真實消費者，弱執行者自審的假綠率可被資料揭露（CLI 與模板不寫任何模型／vendor 名）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `executors` config、`review_provenance.executor`、`ExecutorStatsReportSchema`／`EXECUTOR_STATS_REPORT_FILENAME` |
| lib | High | `assertExecutorLabel`／`normalizeExecutorLabel`（lib/config）、純聚合 `executor-stats.ts`、`readChangeMetadataLeniently`（取代 drift-sources／archive 兩份手寫寬容解析） |
| services | High | verify-record／check record-review 寫入前驗證與正規化、`listArchivedChangeDirs` 共用列舉、新 `learn-stats.service.ts` |
| cli | Medium | 共用 `parseExecutorLabel`、`check --executor`、`learn stats` 子命令與 formatter |
| templates | Medium | prospec-review 指令列、prospec-learn Sweep、metadata-format、config-example 的 `executors` 說明（抽象 label） |
| tests | High | unit／contract／e2e 新增；vendor-name 掃描 hoist 為單一 `FORBIDDEN_MODEL_NAMES`＋`expectNoVendorNames` |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-095 | ADDED | Executor stats report contracts |
| REQ-LIB-075 | ADDED | Executor label vocabulary assertion |
| REQ-LIB-076 | ADDED | Per-executor statistics aggregation engine |
| REQ-SERVICES-107 | ADDED | Executor vocabulary enforced at both provenance write paths |
| REQ-SERVICES-108 | ADDED | Learn stats service |
| REQ-CLI-052 | ADDED | `prospec learn stats` CLI command |
| REQ-TEMPLATES-227 | ADDED | Executor label guidance in shipped templates |
| REQ-TESTS-112 | ADDED | Executor vocabulary and stats tests |
| REQ-TYPES-025 | MODIFIED | Config schema adds optional `executors` |
| REQ-TYPES-053 | MODIFIED | `review_provenance` adds optional `executor` |
| REQ-SERVICES-062 | MODIFIED | record-review writes `executor` after vocabulary assertion |
| REQ-CLI-012 | MODIFIED | `check --record-review --executor <label>` |

## Completion

- **Tasks**: 22/22 code tasks（100%）；1 `[M]`（archive 37 筆 backfill）與 2 `[V]` 皆完成
- **Acceptance Criteria**: 6/6（AC-1 詞彙、AC-2 review 對稱、AC-3 stats、AC-4 backfill 分組數＝5、AC-5 docs、AC-6 gates）

## Review & Verify

- **Review**: 3 round(s)（Mode A 三並行 fresh reviewer → 兩輪 fresh 複審），1 critical / 11 major（另 6 minor）— critical R1-1：負 `spend` 通過 `Number.isFinite` 守衛使末端 schema parse 拋 ZodError、`learn stats` 整體崩潰（verifier confirmed、pin 先紅後綠）；majors 含兩寫入端 trim 不對稱、label 換行可偽造輸出行、第三份手寫寬容解析、Spec 措辭寬於實作、same-day false-green 未釘、README／config-example 過度宣稱、vendor 名單三份複製、整檔 toContain；使用者裁決全修，round 3 收斂 0 unresolved。
- **Verify**: Grade S，machine 3/3 PASS（task-completion／knowledge／tests），judgment delta-spec-compliance PASS、constitution PASS（8/8 rules）、design not-applicable，皆 fresh-subagent、executor `claude-fable-5-1`；`pnpm test` exit 0（192 files、4786 passed）、coverage 96.7%。knowledge 同步後 re-record 仍 S。
- **Quality Log**: prospec-ff WARN ×2（Architecture Verifier 6 項、Task Verifier 5 項建議，皆就地修正）；prospec-review WARN ×2（round 1：1 critical 待修＋10 major；round 2：R4-1 major）、PASS ×1（round 3）；prospec-verify PASS（S）×2；無 FAIL。

## Knowledge Update

已於 verify S 提交前同步並 `knowledge verify`：`prospec/ai-knowledge/modules/{types,lib,services,cli,templates,tests}/README.md`、`lib/station-engines.md`、`module-map.yaml`（`executor-stats`／`learn-stats` 關鍵字）、`index.md`。
