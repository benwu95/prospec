# prove-gitlink-provenance — Archive Summary

- **Archived**: 2026-10-06
- **Original Created**: 2026-10-06T06:43:16.162Z
- **Quality Grade**: S
- **Issue**: #352

## User Story

作為在含 git submodule 的 repo 中使用 prospec 的開發者，我要 snapshot-v2 digest 以 submodule 指向的 commit 代表該 gitlink，使 review／test／delta-spec provenance 能照常以機器驗證記錄，不必繞過 gate。同時，依賴 delegation 變更偵測的 station 對含 gitlink 的 repo 仍不發 ticket，避免 delegate 在缺少 submodule 檔案的 snapshot 中測試另一棵 tree。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `drift-sources` 以 checkout commit（未初始化時用 index pin）證明 gitlink，拒絕未 commit、未追蹤與被 index flag 隱藏的 submodule 工作；`repo-state` 對 gitlink 明確拒絕 delegation；`git-read` 註解說明新用途 |
| types | Low | `InputSnapshot.gitlinks` 選填欄位 |
| tests | Medium | 真實 submodule 測試、hidden-work regression pins、golden digest |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-024 | MODIFIED | snapshot-v2 以路徑 + commit 證明 gitlink；unprovable 列舉移除 gitlink、明寫 unmerged |
| REQ-LIB-090 | MODIFIED | content facet 對含 gitlink 的 capture 明確回傳 unreadable |

## Completion

- **Tasks**: 9/9 code tasks（100%）；1/1 manual、1/1 verification task。
- **Acceptance Criteria**: 6/6 frozen scenarios；2/2 REQs PASS。
- **Spec Sync**: 2 MODIFIED；REQ-LIB-024 改寫的刪除／unprovable bullet 已於 delta-spec `**Dropped:**` 宣告。

## Review & Verify

- **Review**: 3 rounds（round 3 為 knowledge sync 後重開的 loop 第 1 輪），1 critical／3 major。R1-1（critical）：submodule 內被 skip-worktree／assume-unchanged／sparse-checkout 隱藏的修改不會出現在 `git status`，原本會被 commit 背書；經獨立 verifier 確認後修正（讀 submodule index flag、nested 遞迴），4 個 regression pin 經 mutation 驗證。未修的 major：R1-2 未初始化 submodule 與已初始化者同一 identity；R2-1 git-lfs 等 smudge filter 使同一 commit 的 checkout bytes 不同；R2-2 nested submodule HEAD 移動僅由 `--ignore-submodules=none` 擋住且無測試。R2-4（docs）已於 knowledge sync 修正。
- **Verify**: Grade S；task-completion、knowledge、tests、delta-spec-compliance、constitution（8/8 rules）PASS；design not-applicable（UI Scope: none）。全部 judgment 由 fresh subagent 評定。
- **Tests**: 290 files，7,388 passed／4 skipped（7,392 total）；coverage lines 97.73%。golden digest 確認不含 gitlink 的 repo identity 與 main 4309e665 逐位元相同。
- **Checks**: lint、typecheck、counts:check、agents:check、`prospec check --strict`（22 項、0 FAIL、1 knowledge-size WARN）通過；feature commit 後 knowledge:check 確認 3 個 source-touched modules 全部同步。
- **Quality Log**: plan verifier WARN — 原 git executor 未移除完整 repository-selecting env、無 timeout，且「無既有 owner」結論不正確，改為重用 `gitRead`；並補 golden digest 與 reason 斷言。tasks verifier WARN — types 欄位斷言、非空無 `.git` 案例、CI parity 清單，已補入 tasks。review 各輪 WARN 為上述未修 major。過程中一次 `review merge` 因輪次編號錯誤被拒，其後多記了一筆未對應 merge 的 review 條目；verify 首次因 grader 缺 `constitution_rules` 被 CLI 拒絕（未寫入），以新 ticket 重新評定。未使用 manual override。

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/README.md`、`prospec/ai-knowledge/modules/lib/drift-engine.md`：gitlink 證明方式與 `git-read` 的新用途。
- lib、types、tests 已以 `prospec knowledge verify` 蓋章。
