# hash-gitlink-contents — Archive Summary

- **Archived**: 2026-10-06
- **Original Created**: 2026-10-06T09:00:10.649Z
- **Quality Grade**: A
- **Issue**: #352

## User Story

作為在含 git submodule 的 repo 中使用 prospec 的開發者，我要 snapshot-v2 digest 以 submodule 工作樹的實際檔案 bytes 代表該 gitlink，使記錄下來的 review／test provenance 對應的正是被審查、被測試的那些輸入。此 change 處理 prove-gitlink-provenance 留下的三個 review major（R1-2、R2-1、R2-2）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `drift-sources` 以 `expandGitlink` 經 `git-read` 的 `ls-files` 列舉 submodule 輸入並逐檔 hash，取代 commit-based `gitlinkCommit`；共用 ls-files record parser；`repo-state`、`git-read` 註解同步 |
| types | Low | `InputSnapshot.gitlinks` 註解改為 bytes 語意 |
| tests | Medium | gitlink 測試改寫為 bytes 語意，新增三個 major 的 pin 與邊界案例 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-024 | MODIFIED | gitlink 以 `gitlink` 狀態標記加上 submodule 實際輸入檔案（`<gitlink>/<file>`）證明，nested 遞迴 |

## Completion

- **Tasks**: 8/8 code tasks（100%）；1/1 manual、2/2 verification task。
- **Acceptance Criteria**: 5/5 frozen scenarios（revision 2）；1/1 REQ PASS。
- **Spec Sync**: 1 MODIFIED；原 commit-based gitlink bullet 已於 delta-spec `**Dropped:**` 宣告。

## Review & Verify

- **Review**: 1 round，0 critical／0 major，5 minor（未修）：R1-1 未初始化 gitlink 不綁定 pin，pin-only 變更不使 review 失效；R1-2 拿掉 submodule 刪除確認、重複記錄防護或 gitlink key 合併的 mutant 仍存活；R1-3 submodule 刪除確認是兩次事後讀取，且每個刪除檔多一次 `ls-files --deleted`；R1-4 `inputFiles` 仍先以自己的 regex 取路徑；R1-5 `InputSnapshot.gitlinks` 註解與實際列出的集合不完全一致。
- **Verify**: Grade A；task-completion、knowledge、tests、constitution（8/8 rules）PASS；delta-spec-compliance 為 not-adjudicated（acceptance baseline 於 implemented 狀態修訂，late-capture）；design not-applicable。全部 judgment 由 fresh subagent 評定。
- **Tests**: 290 files，7,394 passed／4 skipped（7,398 total）。mutation：commit-only、拿掉 `uninitialized` 標記、狀態標籤常數化、略過 nested 遞迴、submodule 刪除被拒、submodule 相對路徑套用 `inEvidenceScope` 皆使對應測試變紅；golden digest 維持。
- **Checks**: lint、typecheck、counts:check 通過；`prospec check --strict` 22 項、0 FAIL、1 knowledge-size WARN；feature commit 後 knowledge:check 確認 3 個模組同步。
- **Quality Log**: plan verifier WARN — submodule 刪除需 repeat enumeration、`inEvidenceScope` 只套用於 superproject-relative key、過時註解與檔案數，已納入。tasks verifier WARN — 補 `[V]` mutation task、明列要改寫的舊測試與 nested skip-worktree 案例，已納入。首次 verify 時 grader 指出 US-1.4 凍結措辭為無條件（實際語意為 bytes 不同才改變），以 `--amend-scenarios` 修訂為 revision 2 後重新評定。未使用 manual override。

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/drift-engine.md`、`prospec/ai-knowledge/modules/lib/README.md`：gitlink 以實際輸入證明、未初始化不綁定 pin、submodule capture 不做 membership 再驗證的限制。
- lib、types、tests 已以 `prospec knowledge verify` 蓋章。
