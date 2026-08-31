# give-prose-conventions-executors — Archive Summary

- **Archived**: 2026-08-31
- **Original Created**: 2026-08-30
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/206

## User Story

### US-1: Formatter Sanitize 契約測試與防呆修復
作為 prospec 開發者與 CLI 維護者，
我希望所有的 CLI formatters 都能自動轉義動態自由字串（如 change name、module description、錯誤訊息），
以便在終端機輸出時防止控制序列注入與 ANSI/OSC 逃逸破壞，並有契約測試確保未來新增的 formatter 不會遺漏 sanitize。

### US-2: Change Metadata Issue Sinks 統一由 normalizeIssueRef 處理
作為 prospec 開發者，
我希望所有讀寫 `metadata.yaml` `issue` 欄位的程式路徑（包含 auto-draft、change-story、archive、status 等）都能經由 `normalizeIssueRef` 單一真實來源處理，
以便防止注入換行破壞 metadata 格式或在空字串/純空白時寫入無效欄位。

### US-3: Knowledge Update 與 Review Lenses 全稱句強制 Executor 規範
作為 prospec 知識庫維護者與 Code Reviewer，
我希望當模組 README 或 Conventions 出現「EVERY X must Y」等全稱規則時，系統能強制要求配對對應的自動化測試（Executor），
以便避免出現「有檢查器卻無執行器」的虛假防護與規則漂移。

### US-4: Review Fix-Loop Regression Pins 晉升至契約測試管線
作為 prospec 架構師，
我希望在 review fix-loop 過程中建立的通用結構性防呆 pins 能在 archive 與 learn 階段被評估並晉升為常設契約測試，
以便持續固化程式庫架構不變量。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| tests | High | 新增 `formatter-sanitize.contract.test.ts`、`issue-ref-sink.contract.test.ts` 與 `sanitize.test.ts` |
| cli | Medium | 修復 10 個 formatter 補齊 `sanitizeTerminal` 轉義處理 |
| services | Low | `auto-draft.service.ts` 補齊 `normalizeIssueRef` 處理 |
| templates | Medium | 更新 knowledge-update, review, archive, learn, promotion-format 模板以要求全稱句 executor 與 regression pin 晉升管線 |
| types | Low | 關聯變更類型定義與漂移檢驗規則 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TESTS-104 | ADDED | Formatter Sanitize Contract Test |
| REQ-CLI-049 | ADDED | CLI Formatters Sanitize Dynamic Output Properties |
| REQ-TESTS-105 | ADDED | Issue-Ref Sink Contract Test |
| REQ-TEMPLATES-222 | ADDED | Universal Prose Conventions Must Have Machine Executors |
| REQ-TEMPLATES-223 | ADDED | Review Fix-Loop Regression Pin Promotion Pipeline |
| REQ-TESTS-106 | ADDED | Skill Format Contract Verification for Claim Executors & Promotion Pipeline |
| REQ-LIB-048 | ADDED | Issue Reference Normalization Single Source of Truth |

## Completion

- **Tasks**: 18/18 (100%)
- **Acceptance Criteria**: 16/16 (100%)

## Review & Verify

- **Review**: 2 round(s), 2 critical (2 fixed) / 4 major — Formatter & Sink Contract Tests and Skill Template Pins verified
- **Verify**: Grade S, task-completion=PASS · knowledge=PASS · tests=PASS · delta-spec-compliance=PASS · constitution=PASS · design=not-applicable; 186 test files, 4503 tests passing (exit 0)
- **Quality Log**: no WARN/FAIL

## Knowledge Update

The following module documentation was verified and updated:
- `prospec/ai-knowledge/modules/tests/README.md`
- `prospec/ai-knowledge/modules/cli/README.md`
- `prospec/ai-knowledge/modules/services/README.md`
- `prospec/ai-knowledge/modules/templates/README.md`
- `prospec/ai-knowledge/module-map.yaml`
