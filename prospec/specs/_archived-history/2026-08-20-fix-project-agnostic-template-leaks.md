# fix-project-agnostic-template-leaks — Archive Summary

- **Archived**: 2026-08-20
- **Original Created**: 2026-08-20
- **Quality Grade**: S
- **Issue**: 196

## User Story

As a 在**非 prospec、非 TypeScript** 專案中使用 prospec skill 的 AI Agent，
I want 級聯與測試指令相關的 skill 模板不寫死 prospec 自身的技術棧、分層順序與 base-dir 路徑，
So that 我在 Rust／Python／Go 專案跑到這些站點時，讀到的驗收條件與指引可達成、不自相矛盾。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 7 份 skill／reference 模板去除 project-specific 寫死：`prospec-review`、`prospec-ff`、`prospec-implement`、`prospec-tasks`、`references/implementation-guide`、`references/project-test-runner`、`references/review-format` |
| tests | Medium | `skill-format.test.ts` 新增 repo-wide project-agnostic sweep 契約群組（H1／M1／M2 + LOW guard） |
| lib | Low | 重生 `bundled-templates.ts`（生成檔） |

## Requirements

無 delta-spec（`scale: quick`）。本變更為既有 skill 模板文字的 project-agnostic 校正，對齊 #190／#194 已畢業的規約。

**Spec Impact（quick 判定）**：無。feature spec 中出現的 `Types → Lib → Services → CLI`／`cli → services → lib → types` 皆為 prospec **自身**的實際分層事實（REQ-CHNG-012 等，未變），或 `tasks-format.md` 的 dynamic-adaptation 規約（REQ-TEMPLATES-188，本變更未動且更貼合）；無任何 REQ 規定 skill **本體**寫死拓撲，亦無 REQ 因本變更失準。故略過 graduation。

## Completion

- **Tasks**: 7/7 code tasks (100%)；另 6 個 `[M]`／1 個 `[V]` 皆完成
- **Acceptance Criteria**: 4/4（H1、M1＋LOW、M2、bundle-sync 四情境皆驗證）

## Review & Verify

- **Review**: 2 rounds, 0 critical / 6 major — 全數為 PB-007 同型「project-agnostic 洩漏未掃盡」，皆由作者修正（非以 WARN 帶過，因完整性即本變更宗旨）；最終 repo-wide sweep 契約測試證明僅 `tasks-format.hbs` 一處合法 e.g.
- **Verify**: Grade S — machine ledger task-completion／knowledge-health／test-provenance 全 PASS；judgment ledger delta-spec `not-applicable`、Constitution 8/8 PASS、design `not-applicable`；test suite 159 files／3960 tests 全綠（exit 0）
- **Quality Log**: prospec-review round1 WARN（5 majors，PB-007 sibling 洩漏＋guard 範圍過窄）→ round2 PASS（全數 author-resolved）；prospec-verify Grade S PASS

## Knowledge Update

已於 verify S/A commit prompt 同步並蓋戳（`prospec knowledge verify templates tests lib`）；各模組 README 描述模組結構，未因本次 skill 文字校正而失準。
