# correct-readme-split-claims — Archive Summary

- **Archived**: 2026-10-10
- **Original Created**: 2026-10-10T01:16:21.209Z
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/362
- **Plan Decision**: plan (graded_by: human)

## User Story

- **US-1**：身為編輯 `docs/` 公開文件的 prospec 維護者，我希望 public-docs contract test 在某個 `.zh-TW.md` 頁沒有對應英文頁時失敗，讓「每頁都有對應檔」的宣稱與測試實際檢查的範圍一致。
- **US-2**：身為以 agent-integration Feature Spec 對照實作的 verify 評審者，我希望相關 REQ 只保留在現行產出下成立的宣稱，不必每次重新判斷「CLAUDE.md 列出 skill」這句過時宣稱。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| tests | Low | `public-docs.test.ts` 新增「每個中文頁都有英文原頁」斷言；`contract-guards.md` 刪除單向的 `.zh-TW.md` 限定詞 |
| templates／agnt／types（Feature Spec） | Low | 7 個 REQ 的本文改寫，不改 `src/` 與 template |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-230 | MODIFIED | `docs/` 頁以英文／繁中成對存在，配對改為雙向 |
| REQ-AGNT-003 | MODIFIED | 刪除「CLAUDE.md 含 available Skills list」，補一句敘述 |
| REQ-AGNT-024 | MODIFIED | 刪除 `CLAUDE.md` Available Prospec Skills 子句與情境 |
| REQ-AGNT-026 | MODIFIED | 同上（`prospec-upgrade` 對任何 entry config 都被排除） |
| REQ-AGNT-031 | MODIFIED | registry 改稱 entry-config registry，不點名 `CLAUDE.md` |
| REQ-TYPES-032 | MODIFIED | 刪除 dual-write／`CLAUDE.md` 子句與過時的 count 16 |
| REQ-TYPES-035 | MODIFIED | 刪除 dual-write 子句 |

## Completion

- **Tasks**: 3/3 (100%), 7/7 [M]/[V] (not counted)
- **Acceptance Criteria**: 6/6（US-1.1–1.3、US-2.1–2.3）

## Review & Verify

- **Review**: 1 round, 0 critical / 0 major — review-clean。第一次派出的 reviewer 因 API 連線中斷未寫出 payload（`prospec-delegation` WARN），於新 ticket 重派一次；reviewer 以 4 種具名 mutation（孤立中文頁、大小寫不符的中文頁、刪除英文頁、停用斷言判準）確認新斷言轉紅。
- **Verify**: Grade A — machine: task-completion／knowledge／tests PASS；judgment（fresh-subagent）: delta-spec-compliance WARN、constitution PASS（8/8）、design not-applicable；`pnpm test` exit 0（7750 passed／4 skipped）。
- **Quality Log**:
  - prospec-plan FAIL（第 1 輪 verifier）：漏列 REQ-AGNT-003；補 MODIFIED 後第 2、3 輪 WARN（plan 措辭），人類簽核指定於 tasks.md T8 更正。
  - prospec-tasks WARN：任務數少於建議；已補 `prospec knowledge verify` 步驟。
  - prospec-delegation WARN：review reviewer 第 1 次因連線中斷失敗。
  - prospec-verify WARN（2/5）：REQ-TYPES-032／035 仍沿用已不存在的 `SKILL_DEFINITIONS` `hasReferences` 欄位宣稱（6960d24a 後改由 `skillHasReferences` 推導）；同類宣稱散布於 4 個 feature spec，列為 follow-up。

## Notes

- issue 第 3 項（`slim-readme-into-docs` 的 US-2.3 偏離）已記錄於該 change 的 tasks.md 與 `_archived-history`，本 change 依 issue 指示不修訂、不寫入任何檔案。
- issue 前提更正：`AGENTS.md`（非 frontmatter host）仍列出 skill；不成立的只有 `CLAUDE.md` 的宣稱，以及 REQ-AGNT-026（`prospec-upgrade` 被 `excludeFromEntryConfig` 排除）。
- Follow-up 候選：`hasReferences` 過時欄位宣稱（REQ-TYPES-032／035、REQ-TEMPLATES-211、REQ-TESTS-030、feedback-promotion US-1 等）；REQ-AGNT-023 的「entry config <100 lines」只對 `CLAUDE.md` 成立（`AGENTS.md` 194 行）。

## Knowledge Update

- `prospec/ai-knowledge/modules/tests/contract-guards.md`（已於 feature commit 更新並以 `prospec knowledge verify tests` 確認）
