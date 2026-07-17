# document-drift-report-contract — Archive Summary

- **Archived**: 2026-07-17
- **Original Created**: 2026-07-17
- **Quality Grade**: S
- **Scale**: quick

## User Story

As a 執行 `/prospec-verify`、`/prospec-learn` 的 fresh-context AI agent，
I want 一份記載 `prospec-report.json` 結構的參考文件，且各 skill 皆指向它，
So that 不必逆向探索 JSON 結構，且引用的欄位路徑與 frozen schema 一致、功能不再靜默失效。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 新增 `references/drift-report-format.hbs`；verify/learn/promotion-format `.hbs` 接線與欄位修正 |
| services | Medium | `agent-sync.service.ts` `getSkillReferences()` 為 verify/learn 註冊 drift-report-format |
| tests | Medium | `skill-format` 契約新增 PB-001 回歸 guard(fidelity + 負向 + positive) |
| lib | Low | `bundled-templates.ts` 重生(build 產物) |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| —(quick,無 delta-spec) | — | 依 archive Entry Gate 的 diff-sourced spec-impact 判定 |

**Spec-impact 判定(quick)**:diff 觸及 `prospec/specs/features/feedback-promotion.md` 的 REQ-TEMPLATES-095 —— 屬既有已出貨 REQ 的**事實性欄位修正**(`knowledge_health.stale[]` → `structural.knowledge_health.modules[]` 篩 `.stale`),使規格與(已修好的)實作一致。非新增/變更能力需求,修正已隨 feature commit 落地;Phase 3.5 無新內容可畢業,略過。

## Completion

- **Tasks**: 6/6 code(100%);[M]×4 + [V]×2 皆完成
- **Acceptance Criteria**: SC-001~004 全部滿足(reference 指向、`grep knowledge_health.stale[` 零命中、bundled 同步、counts 反映)

## Review & Verify

- **Review**: 2 round(s), 0 critical / 0 major — review-clean(r1 全 diff、r2 test-quality/PB-001;r2 三 nit 全採納並 mutation-verify)
- **Verify**: Grade S,1/5·3/5·4/5·5/5 全 PASS(2/5 quick not-applicable);`pnpm test` 91 files / 2140 passed
- **Quality Log**: r1 verify 曾記 1 WARN(PB-001 回歸 guard 未補)→ round 2 補齊並 mutation-verify 後解除;最終無未解 WARN/FAIL

## Knowledge Update

- `prospec/ai-knowledge/modules/templates/README.md`、`modules/services/README.md` —— 計數已由 `pnpm counts` 同步,`knowledge-health` 0 stale
- **附記(非本變更引入)**:`prospec/specs/features/` 多為繁中,牴觸 Constitution `[MUST] Language Policy`(知識庫須英文);系統性既存,建議獨立 cleanup change 處理
