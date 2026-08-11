# skill-template-partials — Archive Summary

- **Archived**: 2026-07-05
- **Original Created**: 2026-07-05
- **Quality Grade**: S

## User Story

As a 維護 skill template 的貢獻者 / 誤改部署 SKILL.md 的使用者，
I want 重複 boilerplate 收斂為 Handlebars partial 單一來源、SKILL.md 帶 generated 標記，
So that 改一處即全體一致（PB-006），且手改部署檔不會被靜默覆寫而不自知。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | `_next-step-handoff` / `_output-summary-note` / `_generated-notice` partials；17 `.hbs` 引用 + 標記 |
| lib | Low | `ensureBuiltinPartials` 註冊 3 個新 partials |
| services | Low | agent-sync render context 加 `skill_name` |
| tests | Medium | partial single-source / marker / byte-sync guard（mutation-verified） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-143 | ADDED | Boilerplate Partials Single Source |
| REQ-TEMPLATES-144 | ADDED | SKILL.md Generated Marker |
| REQ-TESTS-047 | ADDED | Partial Single-Source + Marker + Byte-Sync Contract |

## Completion

- **Tasks**: 6/6 code tasks (100%); [M] 1/1, [V] 4/4
- **Acceptance Criteria**: US-1 3/3, US-2 2/2 met

## Review & Verify

- **Review**: 1 round, 0 critical / 1 major — fixed (added byte-sync guard: committed SKILL.md must hold the full expanded partial block, so a partial edit without resync → red). Reviewer verdicts: marker is frontmatter-safe (HTML comment after `---`, outside YAML; skill_name correct per-skill); left-inline blocks genuinely non-identical.
- **Verify**: Grade S, dimensions 1/5·2/5·3/5·4/5·5/5 PASS, 6 N/A; full suite 2023 tests green; `prospec check` 10/10 (0 fail, 0 warn).
- **Quality Log**: review major advisory (resolved); no FAIL.

## Knowledge Update

Synced at verify S/A commit (folded into feature commit):
- `templates`/`lib`/`services`/`tests` module READMEs

## Notes

byte-identical marker-only diff 獨立確認（34 檔、34 insertions、0 非標記變更）。此變更正是實踐自家 PB-006（單一來源 helper）。Entry Gate / Quality Gate / promote-backfill 變異段落 per-skill 保留 inline（強抽會破壞 byte-identity）。stack 於 #59 branch。issue #57~#60 序列最後一筆。
