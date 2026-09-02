# align-review-severity-with-cli-enum — Archive Summary

- **Archived**: 2026-09-02
- **Original Created**: 2026-09-02
- **Quality Grade**: S
- **Issue**: #252

## User Story

As a delegated reviewer following the shipped `prospec-review` reference set,
I want the third-tier severity token in the docs to be the same `minor` the CLI's closed enum accepts,
So that a well-formed findings payload is never rejected mid-report and the doc's landing semantics match what the CLI actually does.

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 三處出貨模板第三級 severity token `nit` → `minor`，並改寫落地語意（review-format / review-lenses-content / prospec-review） |
| tests | Low | `skill-format` contract test 對齊 `minor` 詞彙（維持 section-scoped、mutation-effective） |
| types | — | CLI 權威 enum `REVIEW_SEVERITIES` 來源（引用，未修改） |
| lib | — | `review-merge` 的 `toSeverity` 落地行為（引用，未修改）；`bundled-templates.ts` 隨 bundle 再生 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-067 | MODIFIED | 第三級 severity token 由 `nit` 改為 `minor`，落地語意改寫為 recorded/inert（記錄但不 block、不 auto-fix、不進 verify grade），與 CLI enum 及 `toSeverity` 一致 |

## Completion

- **Tasks**: 5/5 code tasks (100%)（另 3 `[M]` + 3 `[V]` 已完成）
- **Acceptance Criteria**: AC-1~AC-5 全數達成

## Review & Verify

- **Review**: 2 round(s), 0 critical / 1 major — F-1（spec-architecture）`us-12.md:85` US-13 acceptance scenario 仍寫 `nits are dropped directly`（同類 nit/dropped 矛盾，archive spec-sync 不觸及），經使用者拍板一併修正並於 round 2 確認 fixed、無新增問題
- **Verify**: Grade S — machine `task-completion·knowledge·tests = PASS`；judgment `delta-spec-compliance·constitution = PASS`（fresh-subagent）、`design = not-applicable`；`pnpm test` 4668 passed（exit 0）
- **Quality Log**: prospec-review round 1 WARN（F-1）→ round 2 PASS；prospec-verify PASS（grade S）；`prospec check --strict` exit 0（唯一 WARN 為既有 knowledge-size 諮詢訊號，net-neutral）

## Knowledge Update

已於 feature commit 同批戳記 `templates` / `lib` / `tests`，`knowledge:check` 綠（3 modules confirmed）。信任區同類矛盾一併清除：`us-12.md:85`（feature commit 直接修正）＋ `us-12.md:109` REQ-TEMPLATES-067 body（archive spec-sync 畢業取代）。
