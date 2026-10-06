# fingerprint-submodule-gitlinks — Archive Summary

- **Archived**: 2026-10-06
- **Original Created**: 2026-10-06T05:51:45.714Z
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/352
- **Plan Decision**: plan (graded_by: human)

## User Story

**US-1：以 gitlink commit 納入 evidence 指紋 [P0]**

As a 在含 git submodule 的 repo 中走 prospec SDD 流程的開發者，
I want evidence 指紋把每個 submodule 以「路徑＋其 commit」納入計算，
So that 我能用機器驗證的流程記錄 review／test／delta-spec provenance，通過 verify 與 archive，不必再靠人工證據繞過。

**US-2：含 submodule 的 repo 可以 abandon，且 pin 變更可還原 [P0]**（plan 站 re-scope 併入）

As a 在含 git submodule 的 repo 中需要放棄一次失敗嘗試的開發者，
I want `prospec change abandon` 在 submodule 內部乾淨時照常執行，並記錄專案範圍內每個 submodule 的 pin 與實際 checkout 的 commit，
So that 失敗的嘗試有出口、能用 `retry_of` 重試，包含 submodule 升級的工作也能還原。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | Modified | `drift-sources` 的 gitlink 指紋與 `readSubmoduleCheckout`；`repo-state` content facet 對 gitlink 維持 unreadable；`work-preservation` 記錄 pin；`git-read` 的 `--submodule=short` |
| types | Modified | 新增 `PreservationGitlinksSchema`（manifest schema 不變） |
| tests | Modified | 指紋、delegation、abandon 的 submodule 測試與 mutation 驗證 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-024 | MODIFIED | gitlink 以路徑＋checkout commit 納入指紋，submodule 無法證明時 fail closed |
| REQ-LIB-090 | MODIFIED | content facet 遇 gitlink 維持 unreadable（delegation 照舊拒收）；preservation diff 加入 `--submodule=short` |
| REQ-LIB-100 | MODIFIED | abandon 將專案範圍內 gitlink 的 pin 與 checkout 記入 `preservation/gitlinks.json`，只拒收無法證明的 submodule |

## Completion

- **Tasks**: 17/17 (100%), 4/4 [M]/[V] (not counted)
- **Acceptance Criteria**: 9/9（US-1 五個、US-2 四個情境皆有自動化測試；scratchpad 臨時 repo 以 source CLI 實跑 abandon 確認）

## Review & Verify

- **Review**: 兩個 loop，共 4 輪（CLI round 1–4），0 critical／2 major，皆已修正並由下一輪確認。R1-1（test-quality）：巢狀 gitlink「目錄非空但沒有 `.git`」的拒收沒有測試，補測試後 mutation M8 轉紅，多餘的巢狀 `isDirectory` 檢查刪除；K1-1（docs-claims）：Knowledge sync 後 `drift-engine.md` 把 non-ignored untracked 寫成 untracked，已修正。fix-induced ratio 皆為 0%。
- **Verify**: Grade A（兩次執行皆為 A）。machine：task-completion／knowledge／tests PASS；judgment（fresh-subagent）：constitution PASS、design not-applicable；delta-spec-compliance 的三個 REQ grader 皆判 PASS，但 scenario revision 2 為 late-capture，CLI 將此維度記為 not-adjudicated，S 不可達。全套測試 291 files／7521 tests 通過，coverage 96.41%。
- **Quality Log**: plan verifier 兩輪 WARN 後 PASS（git 設定隱藏髒污、舊版 CLI 讀 manifest 失敗、`diff.submodule=diff` 等已在 plan 修正）；tasks verifier WARN（任務粒度與漏列測試，已補）；review 兩輪 WARN（R1-1、K1-1）；verify WARN：late-capture。另有一筆 orchestrator 誤串接造成、沒有對應 merge 的 review round-close WARN（K1-1 內容，round 計數不受影響）。

## Scope Notes

- plan 站依開發者決定 re-scope 併入 abandon（US-2）：指紋可算之後，無法 abandon 的 `implemented`／`verified` 嘗試會讓 provenance 檢查持續 FAIL。
- delegation ticket 維持拒收 gitlink（開發者決定）：snapshot 不重現 submodule 內容、facet 看不到 submodule 自己的 refs；含 submodule 的 repo 中 review／verify 退回 in-session（verify 最高 A）。完整支援另行處理。
- 未採用 issue 建議做法 2（讓 `exclude` 作用在指紋輸入）：使用者設定不應縮小 evidence identity。
- archive 時 `drift-detection/us-5.md` 超出 spec 預算，依 PB-011 將 US-7 切為獨立 slice `us-7.md`。

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/README.md`（content facet、Preservation）與 `lib/drift-engine.md`（gitlink 指紋）已更新並 stamp（lib、tests、types）。
