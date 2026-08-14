# structure-check-findings — Archive Summary

- **Archived**: 2026-08-14
- **Original Created**: 2026-08-14
- **Quality Grade**: A

## User Story

作為執行 `prospec check` 的開發者，
我要 findings 依 check 類型與 knowledge-size 的預算層級／surface 分區顯示，
以便一眼分辨每一類漂移、超標與否、涉及哪些檔案，不必在交錯又重複的清單裡逐行挑。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `DriftFinding` 新增 optional 的結構化 `knowledge_size` 欄位 |
| lib | Medium | `evaluateKnowledgeSize` 產出 `knowledge_size`，`detail` 逐字不變 |
| cli | High | `check-output` formatter 依 check→tier→surface 重組 `Findings:` 區塊 |
| templates | Low | `drift-report-format` 參考文件同步新欄位；重生部署副本 |
| tests | Medium | schema／evaluator／formatter 三層單元測試 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-083 | ADDED | knowledge-size finding 的 optional 結構化欄位 |
| REQ-LIB-054 | ADDED | evaluator 產出結構化欄位、`detail` 逐字相同 |
| REQ-TESTS-087 | ADDED | schema／evaluator／detail 逐字相同的覆蓋 |
| REQ-CLI-011 | MODIFIED | findings 依 check→tier→surface 分組顯示 |

## Completion

- **Tasks**: 9/9 code (100%)（另含 1 個 [M]、2 個 [V] 皆完成）
- **Acceptance Criteria**: US-1／US-2 之 WHEN/THEN 全數由實作與測試涵蓋

## Review & Verify

- **Review**: 1 round, 0 critical / 0 major — review-clean（獨立 fresh-context reviewer 多鏡審查：correctness／security／spec-architecture／docs-claims／parallel-site／test-quality）
- **Verify**: Grade A；1/5 PASS · 2/5 PASS（fresh context）· 3/5 PASS（8/8 原則）· 4/5 WARN · 5/5 PASS；測試套件 `pnpm test` exit 0（3828 tests）
- **Quality Log**: 1 WARN — 4/5 knowledge-health：`lib/README.md` 為既有 stale（先前 committed 變更造成，非本次），本次範圍外

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/README.md` 之既有 stale 建議另案 `/prospec-knowledge-update` 收斂（非本次變更引入）
