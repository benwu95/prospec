# sync-knowledge-at-verify-commit — Archive Summary

- **Archived**: 2026-07-04
- **Original Created**: 2026-07-04
- **Quality Grade**: A
- **Scale**: standard · **Issue**: #65 (part b) · **Commit**: 0682ca5 (branch `benwu95/feat/generate-factual-counts`)

## User Story

As a prospec 維護者，我要把模組 README 的 Knowledge 同步與事實計數重新推導，折進
`/prospec-verify` 的 S/A commit 提示（在 commit 之前），並把 `/prospec-archive` 的 Entry
Gate 降格為 backstop，讓一個只動原始碼的 feature commit 不再把 drift `knowledge-health`
翻成 stale —— 消除 PB-005（`archive/knowledge-sync-touched-module-readme`，freq 17）那種每次變更
都要 stale-then-fix 的雜務。Feature Spec 仍只在 archive Phase 3.5 畢業（避免死結）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | `prospec-verify.hbs` commit 提示的 3 步同步（通用措辭；`scale: backfill` 例外）；`prospec-archive.hbs` Entry Gate → backstop（仍會 FAIL）；`init/status-lifecycle.md.hbs` §What each gate checks 改寫 |
| tests | Medium | `skill-format.test.ts` —— 5 條新的 section-scoped ＋ mutation-verified 斷言；2 條既有斷言脫離舊的單一 checkpoint 模型 |
| (docs, non-module) | Low | canonical `_status-lifecycle.md`（與模板逐字一致）；README×2 的「Why Prospec?」列；index.md ＋ services/templates/tests 模組 README 描述 commit 提示的預防與 Entry-Gate backstop |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-129 | ADDED | Verify S/A commit 提示把 `/prospec-knowledge-update` ＋ 計數重新推導折進 feature commit（通用；backfill 例外；不再 re-stale） |
| REQ-CHNG-004 | MODIFIED | Knowledge 同步的預防點＝verify S/A commit 提示；archive Entry Gate＝backstop；Feature Spec 仍只在 archive 畢業 |
| REQ-TEMPLATES-045 | MODIFIED | Verify 的 staleness 註記指向 commit 提示（Entry Gate 以 backstop 身分再確認）—— sdd-workflow 與 ai-knowledge 兩份副本皆已同步 |
| REQ-TEMPLATES-083 | MODIFIED | Archive Entry Gate 由「唯一強制 checkpoint」重新定位為 backstop（未同步時仍 FAIL） |

## Completion

- **Tasks**: code tasks 100% 完成。`[M]` agent sync 完成；`[M]` dogfood 完成（見下）；`[V]` mutation-verify 完成。
- **Acceptance Criteria**: US-1 ＋ US-2 達成。**已在本變更自己的 commit 上 dogfood**：0682ca5 在同一個
  commit 內同時動到 templates ＋ tests 原始碼**與**它們同步後的模組 README → **commit 後 `prospec check`
  的 `knowledge-health` PASS、0 stale**（PB-005 的 stale-then-fix 未觸發 —— issue #65 的驗收達成）。

## Review & Verify

- **Review**: 1 輪、1 critical / 1 major（皆已修）—— **critical**：新的 commit 提示步驟未感知 scale；
  一個 `scale: backfill` 變更的 feature-slug REQ id 會經由 REQ-prefix 的 `/prospec-knowledge-update`
  憑空造出幽靈模組（正是 archive.hbs:139 所防的風險）→ 加上 `scale: backfill` 例外
  （把模組推導延後到 Entry Gate）＋ 修正 backfill 註記。
  **major**：`services/README.md` 仍把 Entry Gate 稱為「the mandatory checkpoint」→ 改寫為
  backstop（PB-007 的平行站點掃描）。已由 verifier 對照 archive guard 確認。
- **Verify**: Grade A —— 1/5 tasks PASS、2/5 delta-spec PASS（129/CHNG-004/045 已實作）、3/5 Constitution
  全稽核 PASS、4/5 knowledge-health PASS（0 stale、6/6）、5/5 tests WARN、6 design skipped。drift 8/8 PASS。
- **Quality Log**: review PASS（1 個 critical ＋ 1 個 major 已修）；verify A。一個已知的**環境性** WARN ——
  `tests/e2e/cli.test.ts` 的 "prospec --help" 5 秒逾時 flake（全套負載下不具決定性；單獨執行會過；
  本變更未動到任何 `cli/` 程式碼）。非回歸。

## Knowledge Update

- 已在 verify S/A commit 提示同步（dogfood）：templates/tests/services 模組 README ＋ index.md
  描述 commit 提示的預防與 Entry-Gate backstop；計數透過 `pnpm counts` 重新推導
  （tests 1926→1934）。全部折進 0682ca5 → commit 後 `knowledge-health` 0 stale。
- **PB-005 註記**：本變更是 `archive/knowledge-sync-touched-module-readme` 的結構性修正
  —— 本次 archive **未**遞增它的復發次數（新的 commit 提示讓 feature commit 保持同步）。
  與 part a（`generate-factual-counts`，PB-004）合計，issue #65 的兩個 stale-then-fix 結構性根因皆已處理。
