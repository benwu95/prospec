# remove-downstream-repo-leaks — Archive Summary

- **Archived**: 2026-10-14
- **Original Created**: 2026-10-14
- **Quality Grade**: S
- **Plan Decision**: plan (graded_by: human)

## User Story

下游維護者需要可直接使用的指引，避免追查 Prospec 自身規格與原始碼；Prospec 維護者需要完整模板的防污染檢查，避免新增模板重現同類問題。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 清理 9 份模板的內部參照、固定測試目錄及專屬範例，保留操作契約 |
| tests | High | 全部 82 份模板的 raw/render guards、7/7 mutation probes 與 CLI/MCP 契約 |
| lib | Low | 重新產生 bundled templates |
| types | Low | 通用 CLI help 與 MCP schema 範例 |
| services | Low | 與 schema 一致的 MCP tool 範例 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-150 | MODIFIED | metadata 以公開 CLI 與 lifecycle 文件為下游操作入口 |
| REQ-TEMPLATES-213 | MODIFIED | 全部出貨模板的固定指引與範例保持專案中立 |
| REQ-TESTS-043 | MODIFIED | 擴充完整模板 corpus 與 mutation 檢查 |
| REQ-TYPES-098 | MODIFIED | CLI help 使用通用 feature/REQ 範例 |
| REQ-MCP-010 | MODIFIED | MCP tool/schema 使用一致通用範例 |

## Completion

- **Tasks**: 10/10 code tasks（100%）；2/2 verification tasks 完成。
- **Acceptance Criteria**: 5/5 frozen scenarios；requirements 5/5 PASS。
- **Measurements**: mutation probes 由 2/7 提升至 7/7；82/82 source/bundle templates 一致。

## Review & Verify

- **Review**: 1 round，7 lenses，0 critical / 0 major / 0 minor；獨立 fresh-context reviewer 無 findings。
- **Verify**: Grade S；machine 的 tasks/knowledge/tests 全部 PASS；獨立 judgment 的 delta-spec/constitution PASS，design 不適用。
- **Tests**: 316/316 files，8291 passed、4 skipped（8295 total）；line coverage 13520/13832（97.74%）。獨立 grader 另重跑 4 個 contract files，1581/1581 通過。
- **Checks**: lint、typecheck、build、counts、agent sync、commit 後 knowledge:check（5/5 source modules）通過。source check 21 PASS、1 既有 knowledge-size WARN、0 FAIL。
- **Quality Log**: 無 WARN/FAIL entries；plan sign-off 的 PASS entry 保留使用者確認文字。
- **Limits**: 本機 Node 24.20.0 / pnpm 12.4.2；封存時遠端 pinned CI 與 Windows 尚未執行。原 guard 不涵蓋 init；新 guard 保護固定文字，非任意 repo-specific prose 的完整語意判斷器。

## Knowledge Update

templates（2 requirements）、tests（1）、types（1）、services（1）與 lib（模板 bundle 衍生產物）已同步並確認 freshness；generated skills 與自動統計已納入 feature commit。

## Compatibility

不變更 runtime API、schema 或 gate 行為。既有下游 init 文件仍沿用 upgrade workflow 更新，沒有新增覆寫使用者檔案的機制。delta-spec 範例原本使用 project_name 插值，非硬編碼污染；此次僅將其改為通用措辭。
