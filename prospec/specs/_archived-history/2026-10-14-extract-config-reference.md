# extract-config-reference — Archive Summary

- **Archived**: 2026-10-14
- **Original Created**: 2026-10-14
- **Quality Grade**: S
- **Plan Decision**: plan (graded_by: human)

## User Story

作為需要調整 Prospec 設定的使用者，希望直接查閱獨立的設定參考頁，以分組表格比較欄位型別、預設值、用途與限制，不必在 CLI 命令說明間查找。

## Affected Modules

| Module | Impact | Description |
| --- | --- | --- |
| templates | Low | 雙語公開文件分工契約；CLI 引用獨立設定頁，shipped templates 不變。 |
| tests | Medium | 既有 relocation contract 比對 32 個設定欄位；同步 contract Knowledge。 |
| types / lib | Read-only | 核對 schema、constants 與 consumer fallback，未修改 runtime。 |

## Requirements

| REQ ID | Status | Description |
| --- | --- | --- |
| REQ-TEMPLATES-230 | MODIFIED | 保留既有雙語文件契約，增加獨立設定頁的分組欄位表格及 CLI 導引。 |

## Completion

- **Tasks**: code 7/7（100%）；verification 2/2。
- **Acceptance Criteria**: frozen scenarios 4/4；requirement coverage 1/1。
- 中英文設定頁各涵蓋 32/32 欄位，保留原 Configuration headings，同步索引、既有 README 導覽及升級指南。

## Review & Verify

- **Review**: 1 round，0 critical / 0 major / 0 minor；7 個適用 lenses，獨立 reviewer，review-clean。
- **Verify**: Grade S；machine task-completion／knowledge／tests PASS；fresh-context delta-spec-compliance／constitution PASS，design not-applicable。Constitution 8/8 rules 已稽核。
- **Tests**: 316/316 files；8,152 passed / 8,156 total，4 skipped；line coverage 13,520/13,832（97.74%）。受影響 contracts 1,402/1,402 通過。
- **Mutation checks**: 移除整張表格、刪除單側欄位、破壞 anchor 均使契約失敗；還原後通過。
- **Quality Log**: plan 首次 WARN 指出 related_modules 漏列 tests；已補入並經第二次獨立審查 PASS。無未解 review finding。
- Build、typecheck、lint、counts、agents 檢查通過；strict drift 22/22 checks，0 FAIL、1 knowledge-size WARN。Knowledge 的 commit 範圍檢查於 feature commit 後通過（1/1 source-touched module）。

## Knowledge

Tests 的 contract-guards 說明及 freshness 已同步；types、lib、templates 依清冊唯讀核對，行為未變。Feature Spec 由本次 archive 正式化。
