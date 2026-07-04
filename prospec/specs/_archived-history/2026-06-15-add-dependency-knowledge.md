# add-dependency-knowledge — Archive Summary

- **Archived**: 2026-06-15
- **Original Created**: 2026-06-15
- **Quality Grade**: S
- **Backlog**: BL-034（依賴層知識，重定位 BL-025）
- **Scale**: standard

## User Story

身為使用 `/prospec-plan`、`/prospec-implement` 的 prospec 開發者，
我想要在規劃／實作觸及第三方 library 時，選擇性地 on-demand 從 Context7（若可用）取得當前 usage 並注入 Technical Summary，
以便實作以正確的 API 用法為基礎，且工作流不耦合外部服務、不破壞 KV-cache。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | `prospec-plan.hbs` Phase 4 + `prospec-implement.hbs` Phase 3 加 optional on-demand Context7 步驟；`references/plan-format.hbs` Technical Summary 加 additive External Library Usage 子節；各加一條 NEVER 契約 |
| tests | Medium | `tests/contract/skill-format.test.ts` 新增 5 個 section-scoped + mutation-verified 契約斷言（BL-034 describe） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-101 | ADDED | Plan Phase 4 on-demand Context7 注入（scope-guarded、untrusted、非 stable prefix） |
| REQ-TEMPLATES-102 | ADDED | Implement Phase 3 per-task lazy Context7 查詢（補 quick-scale 缺口） |
| REQ-TEMPLATES-103 | ADDED | graceful／untrusted／non-gating 契約（silent-skip + informational） |
| REQ-TESTS-027 | ADDED | section-scoped + mutation-verified 契約斷言（含 negative no-Context7-in-Startup-Loading） |
| REQ-TEMPLATES-044 | MODIFIED | plan-format Technical Summary 加 optional additive External Library Usage 子節 |

> Graduated 進 `prospec/specs/features/sdd-workflow.md`（US-21）。

## Completion

- **Tasks**: 6/6 code（100%）；`[M]` 2 / `[V]` 2 完成
- **Acceptance**: US-1/2/3 全部 scenario 達成（grep + contract test 驗證）
- **Quality**: verify Grade S（5+1 全 PASS）；review 0 critical / 0 major（Mode A 3-lens + verifier）；drift 0 fail；suite 1041 綠、verify:skills 28/0、lint clean

## Review & Verify

- **Review**: 0 critical / 0 major（Mode A 3-lens + verifier）
- **Verify**: Grade S；5+1 全 PASS；suite 1041 綠、verify:skills 28/0、drift 0 fail、lint clean
- **Quality Log**: 無 WARN/FAIL（drift 0 fail）
- **Source**: summary 內文

## Knowledge Update

已同步：
- `prospec/ai-knowledge/modules/templates/README.md`
- `prospec/ai-knowledge/modules/tests/README.md`
- `prospec/ai-knowledge/_index.md`（templates 註記 + tests 計數 1,036→1,041）

## Notes

- 純 Skill 變更（Architecture C）：只改 `src/templates/skills/*.hbs` + 1 contract test，無 lib/CLI code。
- BL-034 原為 BUILD-LATER／P3／optional（dogfood 少碰易變 API），本次經使用者明確指示提前實作（dogfood build）。
- 設計守恆：Context7 步驟 provider-neutral（resolve-library-id／query-docs 短名）、永不進 `[STABLE]` 前綴、輸出 untrusted（不執行、不作 gate）、查無即靜默跳過 + 一行 informational。
- Harvest：accumulate `knowledge/req-citation-precedes-graduation`（personal, freq 1）。
