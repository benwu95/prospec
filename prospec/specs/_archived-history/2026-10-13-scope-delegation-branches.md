# scope-delegation-branches — Archive Summary

- **Archived**: 2026-10-13
- **Original Created**: 2026-10-13
- **Quality Grade**: S
- **Issue**: #386
- **Plan Decision**: option-a (graded_by: human)

## User Story

開發者在 review 中途建立 worktree、使用既有 branch，之後保留、切換或移除 worktree，皆不因非目前 local branch 的活動拒收。直接修訂 V2，保留目前工作內容與共享非 branch 狀態的既有保護。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | 新增 non-current-branch reason，保留歷史 reasons 與 V1/V2 schema |
| lib | High | 在既有 evaluator 縮小 branch 保護範圍；保留 stash、unreadable 與 preservation |
| services | Low | 確認 assessment 傳遞沿用既有 owner |
| cli | Low | 核對 sanitized reason 輸出，同步雙語操作文件 |
| templates | High | 同步 V2 範圍、限制及版本過渡 guidance |
| tests | High | unit、真實 Git integration、contract 與 killing mutations |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-108 | MODIFIED | 新 reason 與歷史 evidence 相容性 |
| REQ-LIB-090 | MODIFIED | 非目前 branch 排除於 V2 保護範圍 |
| REQ-CLI-057 | MODIFIED | assessment 輸出與雙語過渡說明 |
| REQ-TEMPLATES-238 | MODIFIED | delegation 範圍與限制 guidance |
| REQ-TESTS-125 | MODIFIED | branch/worktree 生命週期與保護反例 |

## Completion

- **Tasks**: 12/12 code tasks (100%)；1/1 manual、4/4 verification tasks 完成。
- **Acceptance Criteria**: 5/5 frozen scenarios；REQ coverage 5/5。

## Review & Verify

- **Review**: 1 round，八個 lenses；0 critical / 0 major / 0 minor，無 findings；獨立 ticket 收件成功。
- **Verify**: Grade S；machine task-completion、knowledge、tests PASS；fresh-context delta-spec-compliance、constitution PASS；design not-applicable。
- **Tests**: 完整 suite 307/307 files，7948/7952 passed、4 skipped、0 failed。Coverage statements 96.33%、branches 90.92%、functions 98.79%、lines 97.71%。獨立 grader 子集 1659/1659 PASS。
- **Quality Log**: tasks 初輪 FLAWS：verification task 混入 Knowledge/archive 寫入責任，另需明列 rebase、settlement 與 template mutations；修正 task kinds/handoff 及測試責任後，四維 verifier PASS。Plan、review、verify 最終均 PASS，無待處理 escalation。
- **Checks**: lint、typecheck、build、counts、agents、strict drift 通過；22 drift checks 為 21 PASS、knowledge-size WARN。Feature commit 後 knowledge:check 確認 4/4 source-touched modules。
- **Limits**: 本機 macOS Node v24.20.0；此紀錄不宣稱 Linux/Windows CI 已執行。非目前 backup branches 亦不受 V2 保護；舊 CLI 可能拒絕新 reason，切換版本前須結束 attempts、統一 CLI 並重新發票。

## Knowledge Update

types、lib、templates、tests 四個既有段落更新；六模組 freshness 已由 CLI 確認。Services/CLI 維持既有 owner；source、generated skills 與 factual counts 於最終 review/tests/verify 前完成同步。
