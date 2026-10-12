# allow-sibling-delegation — Archive Summary

- **Archived**: 2026-10-12
- **Original Created**: 2026-10-12
- **Quality Grade**: S
- **Issue**: #383
- **Plan Decision**: option-a (graded_by: human)

## User Story

作為同時使用 linked worktree 與 reviewer／verifier 的開發者，我需要合法 sibling 活動不使委派失效，同時保留目前工作樹及 baseline 的保護，避免為了解鎖收件而倒退其他 session 的工作。

## Affected Modules

| Module | Impact | Description |
|---|---|---|
| types | High | strict V1/V2 ticket、topology 與有界 assessment 契約 |
| lib | High | 同 owner 的 baseline-aware policy、topology capture、四個 lifecycle gate 與競態複核 |
| services | Medium | 傳遞 typed assessment，沿用既有 writer／WARN／cleanup 順序 |
| cli | Medium | 區分 allowed／protected／unreadable，成功輸出改為符合 ticket policy |
| templates | Medium | 單一 delegation protocol 同步保護邊界、endpoint 限制及相容方向 |
| tests | High | 真實 Git 多 worktree、legacy transitions、evidence／preservation 與 mutation pins |

## Requirements

| REQ ID | Status | Description |
|---|---|---|
| REQ-TYPES-108 | MODIFIED | 新票 V2，舊票維持 strict V1 |
| REQ-LIB-090 | MODIFIED | raw equality 不變，delegation policy 允許有限 sibling refs／stash 差異 |
| REQ-LIB-092 | MODIFIED | 發票、複核、收件與普通 failure 共用 policy，保留每張票的 baseline |
| REQ-SERVICES-120 | MODIFIED | typed assessment 與一致的拒收／人工交接語意 |
| REQ-CLI-057 | MODIFIED | CLI／雙語文件揭露允許差異與相容限制 |
| REQ-TEMPLATES-238 | MODIFIED | 更新共同委派協定，維持 snapshot-only 與人類復原 gate |
| REQ-TESTS-125 | MODIFIED | 成對矩陣、持久 evidence、legacy 及 preservation regression |

## Completion

- **Code Tasks**: 24/24（100%）；[M] 1/1；T26 提交後 Knowledge 檢查已通過，T27 的 archive landing 在本站完成，保留原 task 記錄。
- **Acceptance Scenarios**: 5/5；七項 REQ 7/7 通過。
- **Knowledge**: types、services、cli、templates、tests 各 1 項 REQ，lib 2 項；六個 README 已同步並確認 freshness。

## Review & Verify

- **Review**: 兩次進站共 5 輪，累積 2 critical／3 major 全數 fixed，最終八個 lenses 無未解 finding。修正既有票 baseline 的 issue-time recheck、unreadable 下可證明的 protected priority、stash 順序／重複值 pins，以及 CLI help／雙語 summary 的舊 equality 宣稱。
- **Verify**: 首輪 C：雙語 Purpose 舊宣稱與明列測試矩陣缺口；補齊後由獨立 grader 重驗為 S。Machine tasks／Knowledge／tests PASS，judgment delta-spec／Constitution PASS，design N/A。Snapshot 補充 suite 198/198、選定 contracts 99/99 通過。
- **Tests**: Node 24.20.0、Git 2.50.1、Vitest 4.0.18；完整 suite 307/307 files，7920 passed／7924 total，4 skipped；coverage lines 97.71%（13369/13681）、branches 90.91%（10531/11583）。核心及 review mutations 9/9 KILLED。
- **Quality Log**: plan R1 WARN 的 protected priority 已修正，R2 PASS；tasks R1 FLAWS 的跨 station completion gate 循環已移至 [V]，R2 僅保留 27 tasks sizing advisory；review WARN 均由後續修正／clean round 收斂；verify C 後達 S。無人工 override。
- **Checks**: lint、typecheck、build、counts、generated assets 150/150、提交後 Knowledge 6/6 通過；strict drift 22/22 checks，0 FAIL、1 既有 knowledge-size WARN（44 findings）。並行 full suite 曾造成既有 timeout，改為 serial 後完整測試通過，未提高 timeout。
- **Limits**: endpoint facts 不識別操作者，capture 非 atomic；保留 V1 相容，舊 CLI 不保證讀 V2。Raw preservation 保持精確比較；不新增 lock、daemon、事件 journal 或自動還原。
- **Regression Pins**: baseline 複核與 ordered suffix 保留 unit／integration pins；公開入口 claim 的 section-scoped contracts 已覆蓋 help、雙語細節與獨立 summary row。
