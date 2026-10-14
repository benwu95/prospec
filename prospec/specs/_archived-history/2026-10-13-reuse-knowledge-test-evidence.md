# reuse-knowledge-test-evidence — Archive Summary

- **Archived**: 2026-10-13
- **Original Created**: 2026-10-13
- **Quality Grade**: S
- **Plan Decision**: option-a (graded_by: human)
- **Issue**: https://github.com/benwu95/prospec/issues/388

## User Story

專案明確宣告測試不讀取 Knowledge 後，僅修改 Knowledge 可重用相容的成功 test evidence，避免重跑完整 suite；source、tests、依賴、設定或不安全路徑仍拒絕重用，review 保留完整範圍。

## Affected Modules

| Module | Impact | Description |
|---|---|---|
| types | High | policy、版本化 test identity 與 reuse payload |
| lib | High | canonical 路徑、雙 scope capture、共用認證與 assessment |
| services | High | recorder 與 review/status/verify 的原紀錄重用 |
| cli | Medium | 原 attempt、時間、command、結果與原因呈現 |
| templates | Medium | opt-in/default 流程與 report refresh 指引 |
| tests | High | real-Git、counter、unsafe topology 與跨站 regression |

## Requirements

| REQ ID | Status | Description |
|---|---|---|
| REQ-TYPES-115 | ADDED | Opt-in Knowledge test input policy |
| REQ-TESTS-137 | ADDED | Knowledge test evidence reuse regression coverage |
| REQ-LIB-033 | MODIFIED | Test provenance snapshot and attempt adjudication |
| REQ-LIB-080 | MODIFIED | Shared fresh-test gate for lifecycle entry points |
| REQ-TYPES-066 | MODIFIED | metadata test_provenance + dimension adjudicator vocabulary |
| REQ-LIB-024 | MODIFIED | review-provenance Collector + Evaluator + computeChangeDigest |
| REQ-LIB-070 | MODIFIED | Single git-fact gather per drift run |
| REQ-TYPES-095 | MODIFIED | Versioned snapshot report and current-assessment contracts |
| REQ-CLI-052 | MODIFIED | Evidence validity diagnostics and migration remedies |
| REQ-TEMPLATES-154 | MODIFIED | Verify 5/5 and 3/5 consume the new engine facts |

## Completion

- **Tasks**: code tasks 19/19（100%）；verification reminders 2/2。
- **Acceptance Criteria**: frozen scenarios 8/8 無語意偏離；REQ coverage 10/10。

## Review & Verify

- **Review**: 2 rounds；第一輪 2 critical／1 major 全數修正，第二輪 0 新 findings。修正 filesystem 大小寫別名與 Git index spelling、unavailable sibling 導致 target reuse payload 遺失、default verify refresh 分支。兩項 critical 各有獨立確認 receipt；三項 reverse-fix mutations 均使 pin 失敗，還原後測試通過。
- **Verify**: Grade S；task-completion、knowledge、tests、delta-spec-compliance、constitution 均 PASS，design not-applicable；獨立 grader 另跑 477/477 targeted tests。完整 Node v24.20.0 suite 8,082/8,086 passed、4 skipped、0 failed；coverage statements 96.37%、branches 91.03%、functions 98.80%、lines 97.73%。
- **Quality Log**: 無 WARN／FAIL entries。`prospec check --strict` 22/22 checks、0 FAIL、1 knowledge-size WARN（既有文件容量訊號）；lint、typecheck、build、counts、agents 149 files 通過；feature commit 後 knowledge:check 確認 6/6 受影響 modules。

Archive harvest 已將 filesystem exclusion identity 與 sibling early-return payload preservation 記入 lessons ledger；維持 personal，未自動 promotion。regression pins 維持 unit/integration scope，workflow 分支已有 contract guard。

## Knowledge Update

types（3 REQs）、lib（4）、cli（1）、templates（1）、tests（1）及跨站 services 的 README 已同步，六個 modules freshness 已蓋章。原 full snapshot 保護維持；此 repo 測試讀取 Knowledge，因此不啟用排除。公開文件仍要求 pre-merge CI，未把 exemption 或未知 evidence 標成成功。

## Limitations

本機驗證環境為 macOS／Node v24.20.0；GitHub CI 的 Linux／Node 22 與 Windows smoke 於 PR 另行執行。既有 knowledge-size 超額未擴大處理範圍；本功能不自動驗證專案「測試不讀取 Knowledge」的宣告。
