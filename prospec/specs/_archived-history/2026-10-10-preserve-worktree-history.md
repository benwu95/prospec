# preserve-worktree-history — Archive Summary

- **Archived**: 2026-10-10
- **Original Created**: 2026-10-09
- **Quality Grade**: S
- **Issue**: #366
- **Plan Decision**: option-a (graded_by: human)

## User Story

完整 archive／abandoned bundle 保存至 main worktree 的對應專案，使正常移除 linked worktree 後仍可讀取。Active workflow 與 trust-zone 修改留在來源；既有歷史可明確匯入，失敗保留可檢查資料且不虛報完成。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | history roots、verified transfer、preservation 與 reader |
| services | High | archive/finalize、abandon、import、status/retry/learn |
| cli | Medium | history paths/import、exact bundle 與失敗位置 |
| types | Medium | roots、origin、inventory、operation 與 typed error |
| templates | Medium | canonical paths、import 與保存界線 |
| tests | High | real-Git 拓撲與失敗邊界回歸 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-104 | ADDED | Worktree-aware terminal history roots |
| REQ-LIB-105 | ADDED | Verified terminal bundle transfer |
| REQ-SERVICES-129 | ADDED | Explicit legacy terminal history import |
| REQ-CLI-062 | ADDED | History location and import commands |
| REQ-TESTS-136 | ADDED | Worktree terminal history regression matrix |
| REQ-SERVICES-010 | MODIFIED | Archive Service (spec-history destination correction) |
| REQ-SERVICES-071 | MODIFIED | archive.service dry-run mode and refusal reporting |
| REQ-CLI-024 | MODIFIED | `prospec archive` command with dry-run preview and post-judgment `finalize` |
| REQ-TEMPLATES-127 | MODIFIED | Archive Phase 2 Writes the Review & Verify Section |
| REQ-TEMPLATES-159 | MODIFIED | archive skill delegates deterministic mutations to the CLI |
| REQ-LIB-100 | MODIFIED | Project-scoped uncommitted work preservation |
| REQ-SERVICES-128 | MODIFIED | Formal abandon publication |
| REQ-LIB-101 | MODIFIED | Completed abandoned history and fixed retry admission |
| REQ-TEMPLATES-246 | MODIFIED | Abandon and retry workflow guidance |
| REQ-TESTS-132 | MODIFIED | Abandon and retry regression matrix |
| REQ-SERVICES-099 | MODIFIED | Lens Yield Service |

## Completion

- **Tasks**: code 28/28（100%）；verification 2/2；manual 0。
- **Acceptance Criteria**: 10/10 frozen scenarios；16/16 REQs 通過。

## Review & Verify

- **Review**: 累計 5 輪；5 個不同 critical 類別全數修復，0 unresolved critical／0 major。修復 topology ENOENT 被吞、finalize 遺漏 local conflict、dry-run admission 不一致、partial error details 遺失，以及唯讀 staging directory modes。
- **Verify**: 最終 Grade S；tasks、Knowledge、tests、delta-spec 與 Constitution 全 PASS（16/16 REQs、8/8 規則），design 不適用。前次 Grade C 的 Knowledge 檔案／export 計數已依目前來源修正，重新 review 與完整測試後通過。
- **Tests**: 305/305 files；7749 passed、4 skipped／7753 total。Coverage statements 96.34%、branches 90.95%、functions 98.78%、lines 97.70%。
- **Checks**: lint、typecheck、build、counts:check、agents:check 通過；feature commit 後 knowledge:check 確認 6/6 modules。prospec check --strict：22 checks、0 FAIL、1 WARN（knowledge-size）。
- **Quality Log**: 初次 plan 對 reader readiness、recovery 與 finalize identity 的 FAIL 已修正並核准；tasks 30 超出 15–25 advisory、部分工作跨度較廣，依失敗邊界增量驗證。Review WARN 已修復；round 3 escalation 經使用者具體理由授權一次追加，後續 clean 且 override 已消耗。首次 verify C 已收斂為 S，保留全部歷史。

## Knowledge Update

已確認 lib（4 REQs）、services（5）、cli（2）、templates（3）、tests（2），以及 types 的共用 contracts，共 6 modules；未留下已移除行為。

## Evidence Limits

Git 2.50.1 的兩個基線情境（archive move helper、完整 abandon）在 main 留存為 0/2；目前實作為 2/2。Real-Git integration 6/6 通過完整 inventory 比對；archive integration 僅 mock drift gate。
環境只有一個可寫 filesystem，實際跨 filesystem 未實測；failure injection 不視為跨 filesystem 實測。本機保存不是跨機器或 Git object 備份，不重建已消失 bundle，不自動還原使用者工作。

## Graduation

原計畫的 US-50 已由 Human Decisions 使用；五個 ADDED REQs 於 graduation 放入未使用的 US-51，保留原 US-50，不修改歷史 delta-spec。

<!-- prospec:escalation-history -->
## Escalation History

Lifetime events: 1. Overrides: 1. Completeness: complete.

| Ordinal | Station | Trigger | Event | State |
|---|---|---|---|---|
| 1 | prospec-review | max_rounds_exceeded | review:3 | not pending |

| Event | Station | Reason | Usage |
|---|---|---|---|
| review:3 | prospec-review | 使用者同意再進行一輪；唯讀 staging 問題屬局部 filesystem 修正，補回歸測試後繼續完成 PR | consumed by prospec-review:394968ef3b8852a2ee51de9acf60be2ab8dc957ea72258f1c4d7e952f1555c1e |
<!-- prospec:escalation-history-end -->

封存後 check 22/22、0 FAIL、1 WARN：knowledge-size 34 over／10 headroom（實作前 32／11）。Harvest 已記錄；transfer-local regression pins 留在 unit tests，跨入口 readiness／error propagation 可供 prospec-learn 評估，未自動晉升。

封存後完整 suite 曾因 REQ-SERVICES-010 已補本文、legacy bodyless ledger 尚未移除而失敗 2 tests；依 shrink-only 契約移除該例外（11→10），focused contract 3/3 通過。重跑曾遇跨模組 timeout；以 4 workers、原 timeout 完整重驗 305/305 files、7749 passed／4 skipped，全套 CI gates 通過。
