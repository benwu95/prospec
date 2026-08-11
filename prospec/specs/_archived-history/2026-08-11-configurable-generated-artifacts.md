# configurable-generated-artifacts — Archive Summary

- **Archived**: 2026-08-11
- **Original Created**: 2026-08-11
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/133

## User Story

As a 下游專案開發者,
I want 生成物的 staleness 豁免路徑由我自己在 `.prospec.yaml` 宣告，而非被 prospec 的內建常數靜默套用,
So that 只有我知道的生成檔才被排除，人寫的同名檔案不會被意外豁免。

（另含 US-2/US-3：`hasVerifyGrade` 改為只看最新一筆 verify 且 `archived` 保持舊行為；US-4：封存插入點錨定行首標題，於審查期間依使用者裁決納入。）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `ProspecConfigSchema.knowledge` 新增 `generated_artifacts`（`.optional()`，刻意不用 schema `.default()`） |
| lib | High | staleness 排除改讀設定；排除後無答案時退回未排除時間戳；`hasVerifyGrade` 時間軸分流；刪除 `GENERATED_SOURCE_ARTIFACTS` |
| services | High | `check.service`／`mcp.service` 注入設定值；`archive.service` 兩個區段插入點改為行首標題錨定 |
| templates | Medium | 三份出貨模板更正被反轉的 `metadata-completeness` 語意；`config-example` 記載新設定鍵 |
| tests | High | 設定驅動排除雙向釘住、服務接線釘住、archive 兩路徑迴歸測試、`hasVerifyGrade` 四條驗收 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-039 | MODIFIED | 生成物排除由專案設定宣告，並在無答案時降級而非靜默 |
| REQ-LIB-025 | MODIFIED | `hasVerifyGrade` 時間軸判準（`archived` 保留 `.some()`，`verified` 只看最新） |
| REQ-TESTS-071 | MODIFIED | 設定驅動排除與 digest 邊界的雙向覆蓋 |
| REQ-TEMPLATES-171 | MODIFIED | archive Entry Gate 條目改述 `metadata-completeness` 會回報 |
| REQ-TEMPLATES-173 | MODIFIED | review/verify 自 `verified` 重入的邊界改述 |
| REQ-TYPES-082 | ADDED | `knowledge.generated_artifacts` 設定欄位 |
| REQ-SERVICES-088 | ADDED | spec-sync 區段錨點比對標題而非裸字串 |
| REQ-TESTS-084 | ADDED | `hasVerifyGrade` 時間軸覆蓋（含 archived 空 log 半邊） |

## Completion

- **Tasks**: 22/22 code tasks (100%); `[M]`/`[V]` 2/3（餘一條為封存時手改 US-14 驗收情境）
- **Acceptance Criteria**: SC-001～SC-008 全數達成（SC-008 為審查期間追加）

## Review & Verify

- **Review**: 5 round(s)（達硬上限）+ 裁決後收尾，19 critical / 16 major — 18 critical 已修、1 延至封存（R4-3：US-14 驗收情境無畢業載體）；5 major 已修、11 proposed。代表性發現：服務接線未被任何測試釘住（兩處硬寫 `[]` 仍全綠）、`gitLastCommit` 對「排除後為空」fail-open、三份出貨模板與兩條已畢業 REQ 敘述被本變更反轉、archive 插入點以子字串比對命中行內程式碼片段而會靜默剖開既有 bullet
- **Verify**: Grade A（machine 1/5·4/5·5/5 全 PASS；judgment 2/5 WARN、3/5 WARN、6 not-applicable）；`pnpm test` exit 0，3768 passed / 4 skipped，coverage statements 94.48% / lines 95.02%
- **Quality Log**: 4 筆 `prospec-review` WARN（逐輪 critical/major 計數與升交項目）、1 筆 `prospec-verify` WARN（grade B，係將 Feature-Spec 資訊性項目誤計入 WARN 預算）、1 筆 `prospec-verify` PASS（grade A，更正後）。兩筆 verify 條目皆保留；`metadata-completeness` 對 `verified` 只讀最新一筆，故以 A 為準——這正是本變更所引入的判準

## Knowledge Update

The following module documentation was synced in the feature commit:
- `prospec/ai-knowledge/modules/types/README.md`
- `prospec/ai-knowledge/modules/lib/drift-engine.md`
- `prospec/ai-knowledge/modules/services/spec-sync.md`
- `prospec/ai-knowledge/modules/templates/README.md`
