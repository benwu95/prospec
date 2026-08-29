# surface-warns-and-empty-constitution — Archive Summary

- **Archived**: 2026-08-29
- **Original Created**: 2026-08-29
- **Quality Grade**: S
- **Issue**: #228

## User Story

作為執行 prospec skills 的 AI agent（尤其弱模型），
我希望 `prospec status` 直接列出未解 WARN、且 Constitution 實質為空成為 `constitution-severity` check finding，
以便 plan／tasks／review／verify 四站與 explore／knowledge-generate 兩站文字各縮成一句——把「翻檔案找欄位再判斷」的確定性交給 machine，縮小弱/強模型落差。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `UnresolvedWarning` 型別＋`ChangeRouteFacts`/`ChangeRoute` optional `unresolvedWarnings` |
| lib | High | `evaluateConstitutionSeverity` no-project-authored finding、`SEEDED_CONSTITUTION_RULE_NAMES` 單一來源、`routeChange` pass-through |
| services | Medium | `status.service` `collectFacts` 推導 `unresolvedWarnings`（per-skill 最後一筆為 WARN） |
| cli | Medium | `prospec status` 於 `warn:` 印未解 WARN＋新增 `--json` mode |
| templates | Medium | 四站 Entry-Gate 與兩站 emptiness 文字收斂；drift-report-format 與 status-lifecycle 同步 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-091 | ADDED | status facts/route 攜帶 unresolved warnings |
| REQ-SERVICES-104 | ADDED | status 從 quality_log 推導 unresolved warnings |
| REQ-CLI-048 | ADDED | status 印 warn: 行並新增 --json mode |
| REQ-LIB-072 | ADDED | constitution-severity 標記「無 project-authored 原則」 |
| REQ-TEMPLATES-064 | MODIFIED | Entry-Gate 未解 WARN 改引用 `prospec status` |
| REQ-TEMPLATES-096 | MODIFIED | emptiness prompt 改讀 `constitution-severity` 結論 |

## Completion

- **Tasks**: 15/15 (100%)，另有 2 個 [M]/[V] 任務（不計入分母）
- **Acceptance Criteria**: issue #228 AC-1~AC-5 全數達成

## Review & Verify

- **Review**: 1 round，0 critical / 0 major（3 minor：F-1 facts 型別註解修正、F-3 補「真實 init 規則→parse→evaluate」round-trip guard、F-2 依 delta-spec 語義接受）
- **Verify**: Grade **S** — machine ledger 1/5·4/5·5/5 PASS；judgment ledger 2/5·3/5 PASS（fresh-subagent，3/5 逐條稽核 8 原則）、6 not-applicable（`ui_scope: none`）；`pnpm test` 4415 pass、exit 0
- **Quality Log**: 無 WARN/FAIL（`prospec-review` PASS、`prospec-verify` grade S PASS）

## Knowledge Update

已於 verify S/A commit prompt 同步並以 `prospec knowledge verify` 蓋章：types / lib / services / cli / templates / tests。
