# make-templates-project-agnostic — Archive Summary

- **Archived**: 2026-08-20
- **Original Created**: 2026-08-20
- **Quality Grade**: S
- **Scale**: quick

## User Story

作為使用 prospec 開發任意專案的開發者，我要出貨的 skill/reference 模板不含 prospec 上游視角措辭或 prospec 專屬源檔/符號指向，
讓它們渲染進我的專案時讀起來正確、不把我導向不存在的檔案或不適用的慣例。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 9 個 shipped skill/reference `.hbs` 去除 project-agnostic 洩漏（footers、implement 慣例、archive.service.ts、src/types、REQ-ID） |
| tests | Medium | skill-format.test.ts 新增 footer 迴歸守衛（＋沿用 promotion-format 的 downstream-project 守衛） |

（cli / services / lib / types 零邏輯改動。）

## Scope（審計驅動的真洩漏）

- 6 份 reference footer `Project name: \`prospec\`` → `\`{{project_name}}\``（review-lenses-content / debug-recovery-format / review-format / drift-report-format / promotion-format / feature-boundary-criteria）
- prospec-implement：`execute()/atomicWrite()/ContentMerger` → 「the project's own conventions」
- backfill-spec / promote-backfill：`archive.service.ts` → `` `prospec archive` (the CLI) ``
- drift-report / metadata：`src/types/*.ts` → 「the prospec CLI's schema」；刪 REQ-SERVICES-090 / REQ-LIB-015 引用
- promotion-format：`the downstream project's modules` → `this project's modules`

**刻意保留**（審計 §2 borderline，非 correctness）：opaque BL/PB governance ID、格式範例表內的 prospec 真實名、tasks-format layer 骨架、feature-spec 命名例、THIRD-PARTY-NOTICES 指標、pnpm audit 範例。

## Graduated Requirements

- `REQ-TEMPLATES-198`（MODIFIED，feedback-promotion/US-1）：Feature Spec 措辭「the downstream project's module names」對齊為「this project's module names」，與修復後的 shipped `promotion-format.hbs` 逐字一致。

## Completion

- **Tasks**: 5/5 code tasks (100%)；另 2 `[M]` + 1 `[V]` 皆完成
- **Acceptance Criteria**: US-1 三個驗收情境全數滿足

## Review & Verify

- **Review**: 1 round, 0 critical / 0 major — clean review（五 lens：correctness / spec-architecture / docs-claims / test-quality / completeness 全乾淨；footer 守衛 mutation-verified、無漏同類洩漏）
- **Verify**: Grade S（quick condensed）— 1/5 task-completion PASS · 2/5 delta-spec not-applicable · 3/5 constitution 8/8 PASS · 4/5 knowledge PASS · 5/5 tests PASS · 6 design not-applicable；`pnpm test` 3974 passed / 4 skipped
- **Quality Log**: 無 WARN/FAIL（review PASS、verify PASS）

## Knowledge Update

已於 verify S/A commit-prompt 同步並 stamp：`templates`、`tests`、`lib`（bundled-templates.ts 重生）。
