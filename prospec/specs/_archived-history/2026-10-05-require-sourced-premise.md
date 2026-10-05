# require-sourced-premise — Archive Summary

- **Archived**: 2026-10-05
- **Original Created**: 2026-10-05
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/332
- **Plan Decision**: option-a (graded_by: in-session)

## User Story

作為使用 Prospec 規劃變更的開發者，我要在投入規劃前取得問題來源、證據、放棄條件與驗證結論，使未完成的前提能返回探索、補齊同一份 proposal 後再前進。既有 legacy、quick 與 backfill 保留原有流程。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | Premise schema、版本宣告與 exploration route target |
| lib | High | 共用解析、assessment、contained read/recheck 與路由 |
| services | High | query 共用判定；lifecycle writer 寫入前 admission |
| cli | Medium | proposal validator、JSON／文字輸出與補齊指引 |
| templates | High | pending scaffold、來源查證、同一 proposal 交接及決策重用 |
| tests | High | 結構、相容性、拒絕不寫入與各層回歸矩陣 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-111 | ADDED | 前提契約與相容版本宣告 |
| REQ-LIB-099 | ADDED | 共用前提判定 |
| REQ-SERVICES-127 | ADDED | lifecycle 寫入前檢查 |
| REQ-TEMPLATES-245 | ADDED | 來源查證與探索交接 |
| REQ-TESTS-131 | ADDED | 前提回歸矩陣 |
| REQ-CHNG-002 | MODIFIED | pending proposal scaffold |
| REQ-CHNG-004 | MODIFIED | metadata premise_version |
| REQ-TEMPLATES-032 | MODIFIED | story authoring／re-entry |
| REQ-TEMPLATES-189 | MODIFIED | Draft-First 的 Why 依據 |
| REQ-TEMPLATES-190 | MODIFIED | assumptions 與 evidence 分工 |
| REQ-TYPES-070 | MODIFIED | RouteTarget 支援 explore |
| REQ-LIB-035 | MODIFIED | blocked premise 返回探索 |
| REQ-SERVICES-070 | MODIFIED | status facts 共用 assessment |
| REQ-CLI-031 | MODIFIED | validate proposal |
| REQ-CLI-025 | MODIFIED | status／scale admission |
| REQ-TEMPLATES-179 | MODIFIED | 重用已提供的 name／scale／tracker 決策 |

## Completion

- **Tasks**: 27/27 code tasks（100%）；1/1 verification task。
- **Acceptance Criteria**: 12/12 frozen scenarios；16/16 REQs PASS。
- **Spec Sync**: 5 ADDED、11 MODIFIED；新增 US-48，保留既有 stories 的契約與明列的行為替換。

## Review & Verify

- **Review**: 2 rounds，0 critical／0 major；最新獨立審查為 review-clean。
- **Verify**: Grade S；task-completion、knowledge、tests、delta-spec-compliance、constitution PASS；design not-applicable（UI Scope: none）。
- **Tests**: 281 files，7,270 passed／4 skipped（7,274 total）；coverage statements 96.58%、branches 91.14%、functions 98.66%、lines 97.72%。六次 contract mutation 均驗證為 RED，還原後 GREEN。
- **Checks**: lint、typecheck、build、counts、144 個 deployed agent files 同步檢查通過；strict check 22 項、0 FAIL、1 knowledge-size WARN。功能提交後 knowledge:check 確認六個 source-touched modules 全部同步。
- **Quality Log**: plan 初次 FAIL 指出 US 編號衝突、Before/After 不具體及未命名既有 captureFileInputs owner；修正後 PASS。tasks WARN 為 28 項略高於理想 15–25、仍低於上限 30。首次 verify Grade C 指出 interactive 重複確認已提供決策；修正兩處條件與 regression/mutation coverage，重新 review／全套測試／verify 後 Grade S。未使用 manual override。

## Knowledge Update

六個受影響模組的 README 與相關 references 已同步。CLI 僅檢查前提結構與宣告狀態，不驗證來源身分、證據真偽或執行 reproduction；本 change 在新契約引入前建立，按 legacy 相容路徑處理，不追補版本宣告。
